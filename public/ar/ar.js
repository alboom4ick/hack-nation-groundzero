// AR task page. A QR code opens /ar/?tx=<transaction id>; each transaction asks for a few simple actions
// (keyboard sequence, hand gesture, taps) shown over the camera feed. Logic lives in tasks.js.
import { stepsFor, describeStep, createKeyMatcher, createTapCounter, createHold, classifyHand, GESTURES } from './tasks.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };
const button = (text, cls, onClick) => el('button', { type: 'button', className: cls, textContent: text, onclick: onClick });

const tx = new URLSearchParams(location.search).get('tx');
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let steps = [], stepIndex = 0, cleanup = () => {}, stream = null, landmarker = null;

const toast = (msg) => { $('toast').textContent = msg; $('toast').hidden = !msg; };
const card = (instr, desc, cls = '') => { $('card').className = cls; $('card').replaceChildren(el('div', { className: 'instr', textContent: instr }), el('div', { className: 'desc', textContent: desc ?? '' })); };
const setRing = (p, label) => { $('ring').hidden = p == null; if (p != null) { $('arc').style.strokeDashoffset = 276.5 * (1 - p); $('ring-label').textContent = label ?? ''; } };

// ---- camera ----------------------------------------------------------------
async function startCamera(facing) {
  if (stream) return;
  if (!navigator.mediaDevices?.getUserMedia) return toast('Camera needs HTTPS. The task still works without it.');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    $('cam').srcObject = stream;
    $('cam').classList.toggle('mirror', facing === 'user');
    await $('cam').play().catch(() => {});
    toast('');
  } catch (err) {
    toast(`Camera unavailable (${err.name}).`);
  }
}

// ---- hand tracking (loaded only when a step needs it) ----------------------
async function loadLandmarker() {
  if (landmarker) return landmarker;
  const { FilesetResolver, HandLandmarker } = await import(`${MP}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
  landmarker = await HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: HAND_MODEL }, runningMode: 'VIDEO', numHands: 1 });
  return landmarker;
}

// ---- step runners: each returns a stop function and calls done() once ------
const runners = {
  keys(step, done) {
    const m = createKeyMatcher(step.keys);
    const caps = step.keys.map((k) => el('div', { className: 'key', textContent: k.toUpperCase() }));
    const paint = () => caps.forEach((c, i) => { c.className = `key${i < m.index ? ' hit' : i === m.index ? ' next' : ''}`; });
    $('keys').replaceChildren(...caps);
    paint();
    const onKey = (ev) => {
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const r = m.feed(ev.key);
      paint();
      if (r === 'wrong') card(describeStep(step), 'Wrong key, start again', 'bad');
      else if (r === 'progress') card(describeStep(step), `${m.index} of ${m.total}`);
      else if (r === 'done') done();
    };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); $('keys').replaceChildren(); };
  },

  tap(step, done) {
    const c = createTapCounter(step.count);
    const onTap = (ev) => {
      if (ev.target.closest('button')) return;
      const r = c.tap(performance.now());
      card(describeStep(step), `${c.count} of ${c.total}`);
      if (r === 'done') done();
    };
    addEventListener('pointerdown', onTap);
    return () => removeEventListener('pointerdown', onTap);
  },

  gesture(step, done) {
    let alive = true, raf = 0, lastT = -1;
    const hold = createHold(step.gesture, 700);
    (async () => {
      card(describeStep(step), 'Loading hand tracking…');
      try { await loadLandmarker(); } catch { card('Hand tracking unavailable', 'Needs internet. Use Skip to continue.', 'bad'); return; }
      card(describeStep(step), 'Hold it in front of the camera');
      const video = $('cam');
      const tick = () => {
        if (!alive) return;
        if (video.readyState >= 2 && video.currentTime !== lastT) {
          lastT = video.currentTime;
          const res = landmarker.detectForVideo(video, performance.now());
          const label = classifyHand(res.landmarks?.[0]);
          const p = hold.feed(label, performance.now());
          setRing(p, label ? GESTURES[label].replace(/^\w+ an? |^give a |^show an? /, '') : 'no hand');
          if (p >= 1) { alive = false; setRing(null); done(); return; }
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    })();
    return () => { alive = false; cancelAnimationFrame(raf); setRing(null); };
  },
};

// ---- flow --------------------------------------------------------------------
function runStep() {
  cleanup();
  const step = steps[stepIndex];
  $('count').textContent = `Step ${stepIndex + 1} / ${steps.length}`;
  card(describeStep(step), tx ? `Transaction ${tx}` : '');
  $('actions').replaceChildren(button('Skip', '', next));
  cleanup = runners[step.type](step, next);
}

function next() {
  cleanup();
  cleanup = () => {};
  if (++stepIndex < steps.length) return runStep();
  $('count').textContent = '';
  card('Task complete ✓', `Transaction ${tx}`, 'done');
  $('actions').replaceChildren(button('Again', 'primary', start));
}

async function start() {
  stepIndex = 0;
  await startCamera(steps.some((s) => s.type === 'gesture') ? 'user' : 'environment');
  runStep();
}

// ---- no transaction yet: scan its QR in-page (or use the phone camera app) ---
async function scan() {
  card('Scan a transaction QR', 'Or open the QR with your phone camera app');
  await startCamera('environment');
  if (!('BarcodeDetector' in window)) { toast('This browser cannot scan in-page. Use your camera app.'); return; }
  const det = new BarcodeDetector({ formats: ['qr_code'] });
  const loop = async () => {
    try {
      const [hit] = await det.detect($('cam'));
      const id = hit && new URL(hit.rawValue, location.href).searchParams.get('tx');
      if (id) { location.search = `?tx=${encodeURIComponent(id)}`; return; }
    } catch { /* video not ready yet */ }
    setTimeout(loop, 300);
  };
  loop();
}

if (tx) {
  $('tx').textContent = tx;
  steps = stepsFor(tx);
  start();
} else {
  scan();
}
