// Live capture: the expert shares their screen, the apprentice watches quietly and asks "why" at natural pauses.
// The voice panel floats in a Picture-in-Picture window (the "island") while the agent is working.
import * as voice from './voice.js';
import { openInterviewerVoice } from './voice-turn.js';
import { openScreenWatch } from './screen-watch.js';
import { getLanguage } from './language.js';
import { redact } from './redact.js';
import { screenContext } from './asker.js';
import { createPacer } from './pacing.js';

// When the expert has paused is the screen watch's call (screen-watch.js); what to ask and how often is the
// pacer's (pacing.js). These only shape the segments sent to the vision model.
const T = {
  segCloseSec: 2,       // a still screen this long closes the segment being collected
  segMaxFrames: 3,
};

export { redact };

// ---------- Picture-in-Picture island ----------
let pip = null;

let opening = null; // in-flight open, so overlapping calls share one window

export function openIsland() {
  voice.byId('voice').hidden = false;
  if (pip) return Promise.resolve();
  return (opening ??= openWindow().finally(() => { opening = null; }));
}

async function openWindow() {
  const el = voice.byId('voice');
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
export const dismissIsland = () => { voice.byId('voice').hidden = true; closeIsland(); };

// ---------- Live session ----------
let session = null;
const $ = (id) => document.getElementById(id);
const el = (id) => voice.byId(id);
const HOLD = { typing: 'question ready, waiting for you to stop typing', speaking: 'question ready, waiting for you to finish speaking', later: 'question saved for later' };

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
  // The watch asks for the microphone, tells us when the expert is busy or has paused, and takes the masked frames.
  let watch;
  try { watch = await openScreenWatch({ display }); } catch (err) {
    $('live-status').textContent = err.message;
    return;
  }

  const chunks = [];
  const rec = new MediaRecorder(new MediaStream(display.getVideoTracks()), { mimeType: 'video/webm' });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(1000);

  const s = session = {
    t0: performance.now(), pausedMs: 0, pausedAt: null, offRecord: false, busy: false, ended: false,
    cur: { frames: [], frameTimes: [], active: false }, segments: [],
    describing: Promise.resolve(), context: [], narration: [],
  };
  const now = () => ((s.pausedAt ?? performance.now()) - s.t0 - s.pausedMs) / 1000;
  const pacer = createPacer();

  // ElevenAgents is the interviewer when set up, the built-in voice otherwise. Either way it never chimes in on
  // its own: our pause detector decides when, and only then is one question put to the expert.
  const turns = await openInterviewerVoice({
    speech: voice, language: getLanguage(), onState: voice.setState,
    onError: (m) => { el('voice-a').textContent = 'agent: ' + m; },
    onNotice: (m) => { $('live-status').textContent = m; },
  });

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
    el('island-status').append(`· asked ${pacer.asked} of ${pacer.minQuestions}${pacer.guardrailAsked ? ' (guardrail ✓)' : ''}${note ? ' · ' + note : ''}`);
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
          body: JSON.stringify({ frames: seg.frames, frameTimes: seg.frameTimes, tStart: seg.tStart, tEnd: seg.tEnd, context: s.context.slice(-3).join(' ') || undefined, language: getLanguage() }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
        seg.result = await res.json();
        s.context.push(seg.result.description);
        // The agent's LLM sees what is on screen and the candidate questions; our gate still decides when it may speak.
        if (!s.ended && !s.offRecord) turns.context(redact(screenContext(seg.result.description, seg.result.questions)));
        pacer.add(seg);
      } catch (err) {
        el('voice-a').textContent = 'vision error: ' + err.message;
      }
    });
  };

  const ask = async (item) => {
    s.busy = true;
    pacer.began(item, now());
    el('voice-n').textContent = pacer.asked;
    el('voice-q').textContent = item.q.text;
    el('voice-a').textContent = '';
    try {
      const said = await turns.ask(item.q.text, { kind: item.q.kind });
      if (said && !s.ended) {
        item.q.answer = said;
        item.q.answerT = now();
        el('voice-a').textContent = said;
      }
    } catch (err) {
      el('voice-a').textContent = 'error: ' + err.message;
    } finally {
      pacer.ended(now());
      watch.spoke();
      s.busy = false;
      if (!s.ended) voice.setState(s.offRecord ? 'private' : 'watching');
    }
  };

  // ---- the loop: the watch ticks while the expert is on the record and the apprentice is not asking ----
  const onFrame = (url, t) => {
    s.cur.frames.push(url);
    s.cur.frameTimes.push(t);
    if (s.cur.frames.length >= T.segMaxFrames) closeSegment();
  };
  const onTick = ({ t, moved, idleFor, screenActive, voiceActive }) => {
    if (moved) s.cur.active = true;
    if (idleFor >= T.segCloseSec && s.cur.frames.length >= 2) closeSegment();
    const next = pacer.next({ t, screenActive, voiceActive, idleFor });
    if (next?.ask) { ask(next.ask); return; }
    showStatus(screenActive, voiceActive, next ? HOLD[next.hold] : '');
  };

  // ---- controls ----
  const toggleOffRecord = () => {
    s.offRecord = !s.offRecord;
    el('island-rec').setAttribute('aria-pressed', String(s.offRecord));
    el('island-rec').textContent = s.offRecord ? 'Back on record' : 'Off the record';
    if (s.offRecord) {
      turns.cancel();
      watch.pause();
      closeSegment(true);
      s.cur = { frames: [], frameTimes: [], active: false };
      s.pausedAt = performance.now();
      rec.pause();
      voice.setState('private');
      showStatus(false, false, 'nothing is recorded');
    } else {
      s.pausedMs += performance.now() - s.pausedAt;
      s.pausedAt = null;
      watch.resume();
      rec.resume();
      voice.setState('watching');
    }
  };
  el('island-rec').onclick = toggleOffRecord;

  const finish = async () => {
    if (s.ended) return;
    s.ended = true;
    el('voice-end').textContent = 'Stop';
    watch.stop();
    turns.close();
    if (s.offRecord) toggleOffRecord();
    closeSegment(true);
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.stop();
    display.getTracks().forEach((t) => t.stop());
    $('live-status').textContent = 'Describing the last steps…';
    await Promise.all([stopped, s.describing]);
    voice.setState('idle');
    delete el('voice').dataset.live;
    el('island-status').hidden = true;
    el('island-rec').hidden = true;
    el('voice-skip').hidden = false;
    el('voice-q').textContent = `Captured ${s.segments.length} segments, ${pacer.asked} live question${pacer.asked === 1 ? '' : 's'}${pacer.guardrailAsked ? ', one about a guardrail' : ''}. Build the Work Map next.`;
    el('voice-a').textContent = '';
    $('live-card').classList.remove('recording');
    $('live-start').disabled = false;
    $('live-status').textContent = `Session captured: ${s.segments.length} segments. Use the tools below to build the Work Map.`;
    session = null;
    window.dispatchEvent(new CustomEvent('live:done', { detail: { blob: new Blob(chunks, { type: 'video/webm' }), segments: s.segments, narration: s.narration, shortfall: pacer.shortfall() } }));
  };
  // Stop is held behind a second click until the brief's minimum has been asked. Closing the shared window cannot
  // be held, so that path finishes at once.
  let stopArmed = null;
  el('voice-end').onclick = () => {
    const missing = pacer.shortfall();
    if (!missing || stopArmed) { clearTimeout(stopArmed); finish(); return; }
    el('voice-end').textContent = 'Stop anyway';
    $('live-status').textContent = `${missing} Press Stop again to end anyway.`;
    stopArmed = setTimeout(() => { stopArmed = null; el('voice-end').textContent = 'Stop'; }, 6000);
  };
  display.getVideoTracks()[0].addEventListener('ended', finish);

  // Scribe v2 Realtime (inside the watch) also writes down what the expert says while working, so reasons they
  // give unprompted can be quoted in the Work Map.
  await watch.start({
    now, language: getLanguage(), frames: true, busy: () => s.busy, onTick, onFrame,
    onSaid: (text, t) => s.narration.push({ t: +t.toFixed(2), text }),
    onNotice: (m) => { $('live-status').textContent = `Recording. ${m}`; },
  });
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
