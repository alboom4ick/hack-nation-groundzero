// Module 3: the voice tutor. The new hire shares their screen and works a case on their own. The tutor explains
// each Work Map step in the expert's words, asks them to predict the next decision, and checks the screen at
// natural pauses (or on demand) so a wrong decision is caught before it is saved.
import * as voice from './voice.js';
import { explainStep, predictionPrompt, interventionFor, isJudgment, emptyRecord, summarize, summarySpeech, mmss } from './tutor-logic.js';

const T = { probeMs: 500, frameMs: 1500, pixelDelta: 60, activePixels: 4, idleSec: 2.5, quietSec: 1.8, voiceLevel: 0.02, checkGapSec: 20 };
const $ = (id) => document.getElementById(id);
const EXPERT = 'the expert';

let workMap = null;
let record = null;
let current = -1;

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? '', textContent: text ?? '' });

// ---------- loading ----------
function validMap(m) {
  return m && Array.isArray(m.steps) && m.steps.length && m.steps.every((s) => s.id && s.title && Array.isArray(s.guardrails));
}

function setMap(m, source) {
  if (!validMap(m)) { $('load-msg').textContent = 'That is not a Work Map (steps with guardrails are missing).'; return; }
  workMap = m;
  record = emptyRecord(m);
  current = -1;
  $('load-msg').textContent = `Loaded ${m.process?.name ?? 'Work Map'} from ${source}.`;
  $('plan-title').textContent = m.process?.name ?? 'Work Map';
  $('plan').hidden = false;
  $('summary').hidden = true;
  renderSteps();
}

function renderSteps() {
  $('steps').replaceChildren(...workMap.steps.map((s, i) => {
    const r = record[s.id];
    const li = el('li', `tstep${i === current ? ' now' : ''}${r.predicted === 'right' ? ' right' : ''}${r.predicted === 'wrong' || r.violations ? ' wrong' : ''}`);
    li.append(el('h4', '', `${i + 1}. ${s.title}`));
    if (s.decision) li.append(el('div', 'meta', `Decision: ${s.decision}`));
    if (isJudgment(s)) li.append(el('div', 'meta', `${s.guardrails.length} guardrail${s.guardrails.length === 1 ? '' : 's'}`));
    return li;
  }));
}

$('load-sample').addEventListener('click', async () => {
  try { setMap(await (await fetch('workmaps/invoice_demo.json')).json(), 'the sample'); } catch (err) { $('load-msg').textContent = err.message; }
});
$('load-file').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  try { setMap(JSON.parse(await f.text()), f.name); } catch { $('load-msg').textContent = 'Could not read that file as JSON.'; }
});
try {
  const saved = localStorage.getItem('groundzero.workmap');
  if (saved) setMap(JSON.parse(saved), 'the Work Map you just built');
} catch { /* storage unavailable: use the buttons */ }

// ---------- helpers ----------
const post = async (url, body) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
};
const say = async (text) => { $('voice-q').textContent = text; voice.setState('speaking'); try { await voice.speak(text); } catch (err) { $('voice-a').textContent = 'voice error: ' + err.message; } };
const hear = async () => {
  voice.setState('listening');
  const blob = await voice.listen();
  if (!blob) return '';
  voice.setState('thinking');
  const text = await voice.transcribe(blob);
  $('voice-a').textContent = text;
  return text;
};

function showReplay(t, uri) {
  const v = $('replay');
  $('alert-moment').textContent = `Expert's screen moment at ${mmss(t)}`;
  v.hidden = true;
  if (uri) {
    v.onerror = () => { v.hidden = true; };
    v.onloadedmetadata = () => { v.currentTime = Math.max(t - 1, 0); v.hidden = false; v.play().catch(() => {}); };
    v.src = uri;
  }
}

// ---------- session ----------
let session = null;

async function start() {
  if (session || !workMap) return;
  const shareP = navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
  let display;
  try { display = await shareP; } catch (err) { $('load-msg').textContent = 'Screen sharing was cancelled: ' + err.message; return; }
  let mic;
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (err) {
    display.getTracks().forEach((t) => t.stop());
    $('load-msg').textContent = 'Microphone needed: ' + err.message;
    return;
  }
  const video = Object.assign(document.createElement('video'), { srcObject: display, muted: true, playsInline: true });
  await video.play();
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  ctx.createMediaStreamSource(mic).connect(analyser);
  const micBuf = new Uint8Array(analyser.fftSize);
  const probe = new OffscreenCanvas(128, 72).getContext('2d', { willReadFrequently: true });
  const frameW = 640;
  const frameCanvas = new OffscreenCanvas(frameW, Math.round((frameW * video.videoHeight) / video.videoWidth));
  const fctx = frameCanvas.getContext('2d');

  const s = session = { t0: performance.now(), busy: true, ended: false, prev: null, lastActivity: 0, lastVoice: 0, lastFrame: -Infinity, lastCheck: -Infinity, changed: false, frames: [], said: '', checking: false };
  const now = () => (performance.now() - s.t0) / 1000;

  $('voice').hidden = false;
  $('start').disabled = true;
  $('summary').hidden = true;
  $('alert').hidden = true;
  voice.setState('watching');

  const watchLabel = (screenActive, voiceActive, note) => {
    $('watch').replaceChildren();
    const dot = (on, label) => $('watch').append(Object.assign(document.createElement('span'), { className: 'dot' + (on ? ' on' : '') }), label + '  ');
    dot(screenActive, 'screen');
    dot(voiceActive, 'voice');
    $('watch').append(note ?? '');
  };

  const grabFrame = async () => {
    fctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    const blob = await frameCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  };

  // The tutor's own speech is the only thing that suppresses checks; the new hire talking just waits.
  const intervene = async (result) => {
    const idx = workMap.steps.findIndex((x) => x.id === result.step);
    const step = workMap.steps[idx];
    const iv = interventionFor(step, result.guardrail, EXPERT);
    record[step.id].violations++;
    current = idx;
    renderSteps();
    s.busy = true;
    $('alert').hidden = false;
    $('alert-text').textContent = `${result.observed} — ${iv.explain}`;
    showReplay(iv.t, step.screen_moment?.uri);
    await say(iv.ask);
    const reply = await hear();
    if (reply) s.said = reply;
    await say(iv.explain);
    s.lastCheck = now();
    s.busy = false;
    voice.setState('watching');
  };

  const check = async (forced) => {
    if (s.checking || s.busy || s.ended) return;
    s.checking = true;
    try {
      const frame = await grabFrame();
      s.frames = [...s.frames.slice(-1), frame];
      watchLabel(false, false, 'checking the screen…');
      const result = await post('/api/tutor/check', { workMap, frames: s.frames, said: s.said });
      s.lastCheck = now();
      s.changed = false;
      if (result.verdict === 'violation') await intervene(result);
      else if (forced) {
        await say(result.verdict === 'ok' ? 'That matches how the expert did it. Go ahead.' : 'I can’t see a decision on screen yet. Show me the field you are about to save.');
        voice.setState('watching');
      }
    } catch (err) {
      $('voice-a').textContent = 'check failed: ' + err.message;
    } finally { s.checking = false; }
  };
  $('check-now').onclick = () => check(true);

  const tick = () => {
    if (s.ended || s.busy) return;
    const t = now();
    probe.drawImage(video, 0, 0, 128, 72);
    const d = probe.getImageData(0, 0, 128, 72).data;
    if (s.prev) {
      let changed = 0;
      for (let p = 0; p < d.length; p += 4) if (Math.abs(d[p] - s.prev[p]) + Math.abs(d[p + 1] - s.prev[p + 1]) + Math.abs(d[p + 2] - s.prev[p + 2]) > T.pixelDelta) changed++;
      if (changed >= T.activePixels) { s.lastActivity = t; s.changed = true; }
    }
    s.prev = d;
    analyser.getByteTimeDomainData(micBuf);
    let sum = 0;
    for (const b of micBuf) sum += ((b - 128) / 128) ** 2;
    if (Math.sqrt(sum / micBuf.length) > T.voiceLevel) s.lastVoice = t;
    const screenActive = t - s.lastActivity < T.idleSec, voiceActive = t - s.lastVoice < T.quietSec;
    watchLabel(screenActive, voiceActive, s.changed ? 'will check when you pause' : '');
    if (s.changed && !screenActive && !voiceActive && t - s.lastCheck >= T.checkGapSec) check(false);
  };
  const timer = setInterval(tick, T.probeMs);

  // ---- the lesson ----
  let nextResolve = null;
  $('voice-end').textContent = 'Next step';
  $('voice-end').onclick = () => nextResolve?.();
  const waitNext = () => new Promise((r) => { nextResolve = r; });

  const end = async () => {
    if (s.ended) return;
    s.ended = true;
    clearInterval(timer);
    voice.interrupt();
    display.getTracks().forEach((t) => t.stop());
    mic.getTracks().forEach((t) => t.stop());
    ctx.close();
    const sum = summarize(workMap, record);
    $('mastered').replaceChildren(...(sum.mastered.length ? sum.mastered.map((m) => el('li', '', m.title)) : [el('li', 'hint', 'Nothing proven yet.')]));
    $('practice').replaceChildren(...(sum.practice.length ? sum.practice.map((p) => el('li', '', `${p.title} (${p.why})`)) : [el('li', 'hint', 'Nothing left to practice.')]));
    $('summary').hidden = false;
    current = -1;
    renderSteps();
    $('start').disabled = false;
    $('voice-end').textContent = 'Finish';
    voice.setState('idle');
    session = null;
    s.busy = true;
    await say(summarySpeech(sum));
  };
  display.getVideoTracks()[0].addEventListener('ended', end);

  (async () => {
    await say(`Let's work through ${workMap.process?.name ?? 'this process'}. I will explain each step the way ${EXPERT} did. Do the step on your own screen, then press Next.`);
    for (let i = 0; i < workMap.steps.length && !s.ended; i++) {
      const step = workMap.steps[i];
      current = i;
      renderSteps();
      if (i > 0 && isJudgment(step)) {
        s.busy = true;
        await say(predictionPrompt(step, EXPERT));
        const answer = await hear();
        if (answer && !s.ended) {
          try {
            const g = await post('/api/tutor/predict', { step, answer });
            record[step.id].predicted = g.correct ? 'right' : 'wrong';
            await say(g.feedback || (g.correct ? 'Yes, that is what they did.' : 'Not quite.'));
            if (!g.correct) { $('alert').hidden = false; $('alert-text').textContent = `Expert: ${step.decision ?? step.title}${step.reason ? ` — "${step.reason.words}"` : ''}`; showReplay(step.screen_moment.t, step.screen_moment.uri); }
          } catch (err) { $('voice-a').textContent = 'grading failed: ' + err.message; }
        } else record[step.id].predicted = 'skipped';
        renderSteps();
      }
      s.busy = true;
      await say(explainStep(step, EXPERT));
      if (s.ended) return;
      s.said = '';
      s.busy = false;
      voice.setState('watching');
      $('voice-a').textContent = i < workMap.steps.length - 1 ? 'Do this step, then press Next.' : 'Do this last step, then press Finish.';
      await waitNext();
      if (s.ended) return;
      if (!record[step.id].violations) record[step.id].touched = true;
      $('alert').hidden = true;
    }
    await end();
  })().catch((err) => { $('voice-a').textContent = 'tutor error: ' + err.message; });
}

$('start').addEventListener('click', start);
