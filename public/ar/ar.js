// AR task page. A QR code opens /ar/?tx=<transaction id>; each transaction asks for a few simple actions
// (keyboard sequence, hand gesture, taps) shown over the camera feed. Logic lives in tasks.js.
import { openAgent } from '../agent.js';
import { CHAT_PROMPT, CHAT_FIRST_MESSAGE, stepsFor, describeStep, createTapCounter, colorShare, meanLuma, voicePhrase, phraseMatches, createHold, classifyHand, GESTURES } from './tasks.js';

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
let facingNow = null;
async function startCamera(facing) {
  if (stream && facing === facingNow) return;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null; facingNow = facing;
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
  dark(step, done) {
    let alive = true, raf = 0;
    const hold = createHold('dark', 800);
    const small = document.createElement('canvas');
    small.width = small.height = 32;
    const g = small.getContext('2d', { willReadFrequently: true });
    card(describeStep(step), 'Make it dark, then hold it');
    const video = $('cam');
    const tick = () => {
      if (!alive) return;
      if (video.readyState >= 2) {
        g.drawImage(video, 0, 0, 32, 32);
        const p = hold.feed(meanLuma(g.getImageData(0, 0, 32, 32).data) < 25 ? 'dark' : null, performance.now());
        setRing(p > 0 ? p : null, 'dark');
        if (p >= 1) { alive = false; setRing(null); done(); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { alive = false; cancelAnimationFrame(raf); setRing(null); };
  },

  // ElevenLabs reads a code (/api/tts), the person repeats it, ElevenLabs transcribes it (/api/stt).
  voice(step, done) {
    let alive = true, audio = null, mic = null, rec = null;
    const phrase = voicePhrase(tx);
    const stop = () => { alive = false; audio?.pause(); rec?.state === 'recording' && rec.stop(); mic?.getTracks().forEach((t) => t.stop()); setRing(null); };
    const listen = async () => {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      rec = new MediaRecorder(mic);
      rec.ondataavailable = (e) => chunks.push(e.data);
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start();
      const t0 = performance.now();
      while (alive && performance.now() - t0 < 5000) { setRing((performance.now() - t0) / 5000, 'speak'); await new Promise((r) => setTimeout(r, 100)); }
      setRing(null);
      rec.state === 'recording' && rec.stop();
      await stopped;
      mic.getTracks().forEach((t) => t.stop());
      return new Blob(chunks, { type: rec.mimeType });
    };
    const run = async () => {
      $('actions').replaceChildren(button('Skip', '', next));
      try {
        card(describeStep(step), 'Playing…');
        const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: phrase }) });
        if (!res.ok) throw new Error(`voice service ${res.status}`);
        audio = new Audio(URL.createObjectURL(await res.blob()));
        await new Promise((r) => { audio.onended = r; audio.onerror = r; audio.play().catch(r); });
        if (!alive) return;
        card(describeStep(step), `Now say the whole phrase: “${phrase}”`);
        const blob = await listen();
        if (!alive) return;
        card(describeStep(step), 'Checking…');
        const stt = await fetch('/api/stt', { method: 'POST', headers: { 'content-type': blob.type || 'audio/webm' }, body: blob });
        if (!stt.ok) throw new Error(`transcription ${stt.status}`);
        const { text } = await stt.json();
        if (!alive) return;
        if (phraseMatches(text, phrase)) { stop(); return done(); }
        card(describeStep(step), `Heard “${text || '…'}”. Say the whole phrase: “${phrase}”`, 'bad');
      } catch (err) {
        if (!alive) return;
        card('Voice step failed', `${err.message ?? err}. Try again or use Skip.`, 'bad');
      }
      $('actions').replaceChildren(button('Try again', 'primary', run), button('Skip', '', next));
    };
    card(describeStep(step), `You must say the whole phrase: “${phrase}”`);
    $('actions').replaceChildren(button('Hear the phrase', 'primary', run), button('Skip', '', next));
    return stop;
  },

  // An ElevenLabs agent asks what the person is doing, listens, then advises. Done after its second reply.
  chat(step, done) {
    let alive = true, agent = null, replies = 0, advised = false;
    const finish = () => { if (!alive) return; stop(); done(); };
    const stop = () => { alive = false; agent?.end().catch(() => {}); };
    const start = async () => {
      card(describeStep(step), 'Connecting…');
      $('actions').replaceChildren(button('Skip', '', next));
      try {
        agent = await openAgent({
          role: 'tutor', prompt: CHAT_PROMPT, firstMessage: CHAT_FIRST_MESSAGE,
          onMessage: ({ source }) => { if (source === 'ai' && ++replies >= 2) advised = true; },
          onMode: (mode) => {
            if (!alive) return;
            if (mode === 'speaking') card(describeStep(step), 'Assistant is talking…');
            else if (advised) setTimeout(finish, 800);
            else card(describeStep(step), 'Your turn: answer out loud');
          },
          onError: (msg) => { if (alive) card('Voice assistant failed', `${msg}. Use Skip.`, 'bad'); },
        });
        if (!alive) agent.end().catch(() => {});
      } catch (err) {
        if (alive) card('Voice assistant failed', `${err.message ?? err}. Use Skip.`, 'bad');
      }
    };
    card(describeStep(step), 'Allow the microphone, then answer out loud');
    $('actions').replaceChildren(button('Start', 'primary', start), button('Skip', '', next));
    return stop;
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

  color(step, done) {
    let alive = true, raf = 0;
    const hold = createHold(step.color, 800);
    const small = document.createElement('canvas');
    small.width = 96; small.height = 96;
    const g = small.getContext('2d', { willReadFrequently: true });
    card(describeStep(step), 'Hold the cap close to the camera');
    const video = $('cam');
    const tick = () => {
      if (!alive) return;
      if (video.readyState >= 2) {
        // centre square of the frame, so the bottle you hold up counts and the fridge behind it mostly does not
        const s = Math.min(video.videoWidth, video.videoHeight) * 0.6;
        g.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, 96, 96);
        const share = colorShare(g.getImageData(0, 0, 96, 96).data, step.color);
        const p = hold.feed(share >= 0.04 ? step.color : null, performance.now());
        setRing(p > 0 ? p : null, step.color);
        if (p >= 1) { alive = false; setRing(null); done(); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { alive = false; cancelAnimationFrame(raf); setRing(null); };
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
  if (step.type !== 'voice' && step.type !== 'chat') startCamera(step.type === 'gesture' ? 'user' : 'environment');
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
