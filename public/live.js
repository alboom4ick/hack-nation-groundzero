// Live capture: the expert shares their screen, the apprentice watches quietly and asks "why" at natural pauses.
// The voice panel floats in a Picture-in-Picture window (the "island") while the agent is working.
import * as voice from './voice.js';

const T = {
  probeMs: 500,         // activity probe period
  frameMs: 1500,        // keyframe period for the vision model
  probe: { w: 128, h: 72 },
  pixelDelta: 60,       // summed RGB difference that counts as a changed pixel
  activePixels: 4,      // changed pixels that count as "something moved" (a caret or a few typed characters)
  idleSec: 2.5,         // screen must be still this long before asking
  quietSec: 1.8,        // and the expert must not be talking
  voiceLevel: 0.02,
  firstAskSec: 20,      // never ask in the first seconds
  gapSec: 45,           // minimum spacing between live questions
  maxPer10Min: 5,       // the rest waits for the debrief
  freshSec: 45,         // a question about something older than this is stale
  segMaxFrames: 3,
};

const PII = [
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, '[IBAN]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]'],
  [/\+?\d[\d\s().-]{8,}\d/g, '[PHONE]'],
];
export const redact = (text) => PII.reduce((t, [re, tag]) => t.replace(re, tag), text);

// ---------- Picture-in-Picture island ----------
let pip = null;

export async function openIsland() {
  const el = voice.byId('voice');
  el.hidden = false;
  if (pip) return;
  el.classList.add('island-float'); // fallback: pinned bottom-right of the page
  if (!('documentPictureInPicture' in window)) return;
  try {
    pip = await documentPictureInPicture.requestWindow({ width: 380, height: 170 });
  } catch { return; } // no user gesture / unsupported
  el.classList.replace('island-float', 'island');
  for (const sheet of document.styleSheets) {
    const style = pip.document.createElement('style');
    try { style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n'); } catch { continue; }
    pip.document.head.append(style);
  }
  pip.document.body.style.margin = '0';
  pip.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? '';
  pip.document.body.append(el);
  voice.setDoc(pip.document);
  pip.addEventListener('pagehide', () => {
    document.body.append(el);
    el.classList.replace('island', 'island-float');
    voice.setDoc(document);
    pip = null;
  }, { once: true });
}

export const closeIsland = () => pip?.close();

// ---------- Live session ----------
let session = null;
const $ = (id) => document.getElementById(id);
const el = (id) => voice.byId(id);
const rms = (an, buf) => {
  an.getByteTimeDomainData(buf);
  let s = 0;
  for (const b of buf) s += ((b - 128) / 128) ** 2;
  return Math.sqrt(s / buf.length);
};

export async function startLive() {
  if (session) return;
  // Both prompts need the click's user activation, so start them together.
  const shareP = navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
  const islandP = openIsland();
  let display;
  try { display = await shareP; } catch (err) {
    closeIsland();
    $('live-status').textContent = err.name === 'NotAllowedError' ? 'Screen sharing was cancelled.' : 'Could not share: ' + err.message;
    return;
  }
  await islandP;
  let mic;
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (err) {
    display.getTracks().forEach((t) => t.stop());
    $('live-status').textContent = 'Microphone needed: ' + err.message;
    return;
  }

  const sharedVideo = Object.assign(document.createElement('video'), { srcObject: display, muted: true, playsInline: true });
  await sharedVideo.play();
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  ctx.createMediaStreamSource(mic).connect(analyser);
  const micBuf = new Uint8Array(analyser.fftSize);

  const chunks = [];
  const rec = new MediaRecorder(new MediaStream(display.getVideoTracks()), { mimeType: 'video/webm' });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(1000);

  const probeCanvas = new OffscreenCanvas(T.probe.w, T.probe.h);
  const pctx = probeCanvas.getContext('2d', { willReadFrequently: true });
  const frameW = 640;
  const frameCanvas = new OffscreenCanvas(frameW, Math.round((frameW * sharedVideo.videoHeight) / sharedVideo.videoWidth));
  const fctx = frameCanvas.getContext('2d');

  const s = session = {
    t0: performance.now(), pausedMs: 0, pausedAt: null, offRecord: false, busy: false, ended: false,
    lastActivity: 0, lastVoice: 0, lastFrame: -Infinity, lastAskEnd: -Infinity, prev: null,
    cur: { frames: [], frameTimes: [], active: false }, segments: [], queue: [], askTimes: [], asked: 0, guardrailAsked: false,
    describing: Promise.resolve(), context: [],
  };
  const now = () => ((s.pausedAt ?? performance.now()) - s.t0 - s.pausedMs) / 1000;

  $('live-card').classList.add('recording');
  $('live-start').disabled = true;
  $('live-status').textContent = 'Recording. Work normally; the apprentice is in the floating window.';
  el('voice').dataset.live = '1';
  el('voice-q').textContent = '';
  el('voice-a').textContent = '';
  el('voice-n').textContent = 0;
  el('island-status').hidden = false;
  el('island-rec').hidden = false;
  el('voice-skip').hidden = true;
  voice.setState('watching');

  const showStatus = (screenActive, voiceActive, note) => {
    el('island-status').replaceChildren();
    const dot = (on, label) => {
      const d = Object.assign(document.createElement('span'), { className: 'dot' + (on ? ' on' : '') });
      el('island-status').append(d, label + '  ');
    };
    dot(screenActive, 'screen');
    dot(voiceActive, 'voice');
    el('island-status').append(`· asked ${s.asked}${s.guardrailAsked ? ' (guardrail ✓)' : ''}${note ? ' · ' + note : ''}`);
  };

  // ---- vision: closed segments go to the existing describe endpoint ----
  const closeSegment = (force = false) => {
    const c = s.cur;
    if (c.frames.length < (force ? 1 : 2)) return;
    s.cur = { frames: [], frameTimes: [], active: false };
    if (!c.active) return; // nothing changed: nothing to describe
    const seg = { id: s.segments.length, tStart: c.frameTimes[0], tEnd: Math.max(now(), c.frameTimes.at(-1) + 0.5), frames: c.frames, frameTimes: c.frameTimes };
    s.segments.push(seg);
    s.describing = s.describing.then(async () => {
      try {
        const res = await fetch('/api/describe', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ frames: seg.frames, frameTimes: seg.frameTimes, tStart: seg.tStart, tEnd: seg.tEnd, context: s.context.slice(-3).join(' ') || undefined }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
        seg.result = await res.json();
        s.context.push(seg.result.description);
        for (const q of seg.result.questions) s.queue.push({ s: seg, q, time: seg.frameTimes[q.frame] ?? seg.tStart, ready: now() });
      } catch (err) {
        el('voice-a').textContent = 'vision error: ' + err.message;
      }
    });
  };

  // ---- question choice: guardrails first, then decisions, then missing slots; only fresh ones ----
  const pick = () => {
    const rank = (it) => (it.q.kind === 'guardrail' ? 3 : it.q.kind === 'branch' ? 2 : 1) + (it.q.kind === 'guardrail' && !s.guardrailAsked ? 2 : 0);
    const fresh = s.queue.filter((it) => !it.q.asked && now() - it.s.tEnd < T.freshSec);
    return fresh.sort((a, b) => rank(b) - rank(a) || b.time - a.time)[0];
  };

  const ask = async (item) => {
    s.busy = true;
    item.q.asked = true;
    s.asked++;
    if (item.q.kind === 'guardrail') s.guardrailAsked = true;
    s.askTimes.push(now());
    el('voice-n').textContent = s.asked;
    el('voice-q').textContent = item.q.text;
    el('voice-a').textContent = '';
    try {
      voice.setState('speaking');
      await voice.speak(item.q.text);
      if (s.ended) return;
      voice.setState('listening');
      const blob = await voice.listen();
      if (blob && !s.ended) {
        voice.setState('thinking');
        item.q.answer = redact(await voice.transcribe(blob));
        item.q.answerT = now();
        el('voice-a').textContent = item.q.answer;
      }
    } catch (err) {
      el('voice-a').textContent = 'error: ' + err.message;
    } finally {
      s.lastAskEnd = now();
      s.lastVoice = now();
      s.busy = false;
      if (!s.ended) voice.setState(s.offRecord ? 'private' : 'watching');
    }
  };

  // ---- the loop: one tick every probeMs ----
  const tick = () => {
    if (s.ended || s.busy) return;
    if (s.offRecord) { showStatus(false, false, 'nothing is recorded'); return; }
    const t = now();

    pctx.drawImage(sharedVideo, 0, 0, T.probe.w, T.probe.h);
    const d = pctx.getImageData(0, 0, T.probe.w, T.probe.h).data;
    if (s.prev) {
      let changed = 0;
      for (let p = 0; p < d.length; p += 4) {
        if (Math.abs(d[p] - s.prev[p]) + Math.abs(d[p + 1] - s.prev[p + 1]) + Math.abs(d[p + 2] - s.prev[p + 2]) > T.pixelDelta) changed++;
      }
      if (changed >= T.activePixels) { s.lastActivity = t; s.cur.active = true; }
    }
    s.prev = d;
    const level = rms(analyser, micBuf);
    if (level > T.voiceLevel) s.lastVoice = t;

    if (t - s.lastFrame >= T.frameMs / 1000) {
      s.lastFrame = t;
      fctx.drawImage(sharedVideo, 0, 0, frameCanvas.width, frameCanvas.height);
      frameCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 }).then((b) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }))
        .then((url) => {
          if (s.ended || s.offRecord) return;
          s.cur.frames.push(url);
          s.cur.frameTimes.push(t);
          if (s.cur.frames.length >= T.segMaxFrames) closeSegment();
        });
    }

    const screenIdle = t - s.lastActivity, quiet = t - s.lastVoice;
    if (screenIdle >= 2 && s.cur.frames.length >= 2) closeSegment();
    const screenActive = screenIdle < T.idleSec, voiceActive = quiet < T.quietSec;
    const recent = s.askTimes.filter((a) => t - a < 600).length;
    const item = pick();
    let note = '';
    if (item) {
      if (screenActive) note = 'question ready, waiting for you to stop typing';
      else if (voiceActive) note = 'question ready, waiting for you to finish speaking';
      else if (t < T.firstAskSec || t - s.lastAskEnd < T.gapSec || recent >= T.maxPer10Min) note = 'question saved for later';
      else { ask(item); return; }
    }
    showStatus(screenActive, voiceActive, note);
  };
  const timer = setInterval(tick, T.probeMs);

  // ---- controls ----
  const toggleOffRecord = () => {
    s.offRecord = !s.offRecord;
    el('island-rec').setAttribute('aria-pressed', String(s.offRecord));
    el('island-rec').textContent = s.offRecord ? 'Back on record' : 'Off the record';
    if (s.offRecord) {
      closeSegment(true);
      s.cur = { frames: [], frameTimes: [], active: false };
      s.pausedAt = performance.now();
      rec.pause();
      voice.setState('private');
    } else {
      s.pausedMs += performance.now() - s.pausedAt;
      s.pausedAt = null;
      s.prev = null;
      s.lastActivity = now();
      rec.resume();
      voice.setState('watching');
    }
  };
  el('island-rec').onclick = toggleOffRecord;

  const finish = async () => {
    if (s.ended) return;
    s.ended = true;
    clearInterval(timer);
    voice.interrupt();
    if (s.offRecord) toggleOffRecord();
    closeSegment(true);
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.stop();
    display.getTracks().forEach((t) => t.stop());
    mic.getTracks().forEach((t) => t.stop());
    $('live-status').textContent = 'Describing the last steps…';
    await Promise.all([stopped, s.describing]);
    ctx.close();
    voice.setState('idle');
    delete el('voice').dataset.live;
    el('island-status').hidden = true;
    el('island-rec').hidden = true;
    el('voice-skip').hidden = false;
    el('voice-q').textContent = `Captured ${s.segments.length} steps, ${s.asked} live question${s.asked === 1 ? '' : 's'}. Build the Work Map next.`;
    el('voice-a').textContent = '';
    $('live-card').classList.remove('recording');
    $('live-start').disabled = false;
    $('live-status').textContent = `Session captured: ${s.segments.length} segments. Use the tools below to build the Work Map.`;
    session = null;
    window.dispatchEvent(new CustomEvent('live:done', { detail: { blob: new Blob(chunks, { type: 'video/webm' }), segments: s.segments } }));
  };
  el('voice-end').onclick = finish;
  display.getVideoTracks()[0].addEventListener('ended', finish);
}

// Recorded webm blobs report an infinite duration until the player has seen the end.
export async function fixDuration(v) {
  if (Number.isFinite(v.duration)) return;
  await new Promise((r) => { v.onloadedmetadata = r; if (v.readyState >= 1) r(); });
  if (Number.isFinite(v.duration)) return;
  v.currentTime = 1e101;
  await new Promise((r) => v.addEventListener('timeupdate', r, { once: true }));
  v.currentTime = 0;
}
