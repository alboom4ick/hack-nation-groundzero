import * as voice from './voice.js';
import { startLive, openIsland, fixDuration } from './live.js';
import { toAgentInstructions, toAgentMarkdown } from './agent-export.js';
import { toWorkMap, debriefStatus, ensureGuardrailQuestion } from './workmap.js';

const PAGE_SIZE = 5;

// The voice panel may be floating in a Picture-in-Picture window; byId finds it wherever it is.
const $ = voice.byId;

// Parses a JSON reply; a plain-text error (e.g. a stale server's 404) becomes a readable message.
async function readJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`server replied ${res.status}: ${text.slice(0, 80)} (restart \`npm start\` if this is a 404)`); }
}
const video = $('video');
let segments = [];
let page = 0;
let videoName = 'video';

function resetSession(name) {
  videoName = name;
  narration = [];
  $('workmap').hidden = true;
  mapSteps = []; mapUnclear = []; followups = []; teachBack = null;
  segments = [];
  $('segments').replaceChildren();
  $('pager').hidden = true;
  $('tools').hidden = true; $('next-title').hidden = true;
}

// Live capture: the segments were cut and described while the expert worked.
$('live-start').addEventListener('click', startLive);
$('voice-start').addEventListener('click', () => openIsland());
$('debrief-start').addEventListener('click', () => openIsland());
window.addEventListener('live:done', async ({ detail }) => {
  resetSession(`live-${new Date().toISOString().slice(0, 16).replace(':', '-')}.webm`);
  video.src = URL.createObjectURL(detail.blob);
  video.hidden = false;
  await fixDuration(video);
  segments = detail.segments;
  narration = detail.narration ?? [];
  page = 0;
  render();
  $('status').textContent = `${segments.length} live segments · ${video.duration.toFixed(1)} s`;
});

function seek(v, t) {
  return new Promise((resolve) => {
    v.onseeked = () => resolve();
    v.currentTime = Math.min(t, v.duration - 0.01);
  });
}

function render() {
  const pages = Math.max(1, Math.ceil(segments.length / PAGE_SIZE));
  page = Math.min(Math.max(page, 0), pages - 1);
  const slice = segments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  $('segments').replaceChildren(...slice.map(segmentCard));

  $('tools').hidden = !segments.length;
  $('next-title').hidden = !segments.length;
  if (segments.length) {
    const li = document.querySelectorAll('.stepper li');
    li[0]?.classList.replace('now', 'done'); li[0]?.removeAttribute('aria-current');
    li[1]?.classList.add('now'); li[1]?.setAttribute('aria-current', 'step');
  }
  $('pager').hidden = pages <= 1;
  $('prev').disabled = page === 0;
  $('next').disabled = page === pages - 1;
  $('pageinfo').textContent = `Page ${page + 1} of ${pages} · segments ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + slice.length} of ${segments.length}`;
}

function segmentCard(s) {
  const el = document.createElement('div');
  el.className = 'card seg';
  el.id = `seg-${s.id}`;
  const title = document.createElement('h3');
  title.textContent = `Segment ${s.id + 1} `;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = `${s.tStart.toFixed(1)}–${s.tEnd.toFixed(1)} s · ${s.frames.length} frames`;
  title.append(meta);
  const strip = document.createElement('div');
  strip.className = 'strip';
  s.frames.forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.loading = 'lazy';
    img.title = `Frame ${i} · ${s.frameTimes[i].toFixed(1)} s`;
    strip.append(img);
  });
  const jump = document.createElement('button');
  jump.className = 'ghost';
  jump.textContent = 'Play segment';
  jump.addEventListener('click', () => { video.currentTime = s.tStart; video.play(); });
  const describe = document.createElement('button');
  describe.textContent = s.result ? 'Re-describe' : 'Describe with Claude';
  const out = document.createElement('div');
  out.className = 'out';
  describe.addEventListener('click', () => runDescribe(s, describe, out));
  const actions = document.createElement('div');
  actions.className = 'row';
  actions.append(jump, describe);
  el.append(title, strip, actions, out);
  if (s.result) showResult(s, out);
  return el;
}

async function describeSeg(s) {
  const res = await fetch('/api/describe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ frames: s.frames, frameTimes: s.frameTimes, tStart: s.tStart, tEnd: s.tEnd }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  s.result = data;
}

async function runDescribe(s, btn, out) {
  btn.disabled = true;
  out.textContent = 'Claude is looking at the frames…';
  try {
    await describeSeg(s);
    showResult(s, out);
  } catch (err) {
    out.textContent = 'failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function describeAll() {
  const todo = segments.filter((s) => !s.result);
  for (const [i, s] of todo.entries()) {
    $('status').textContent = `describing ${i + 1}/${todo.length}`;
    await describeSeg(s);
    render();
  }
}

function showResult(s, out) {
  const r = s.result;
  // Collapsible description + slots; questions stay visible below.
  const details = document.createElement('details');
  details.open = !s.collapsed;
  details.addEventListener('toggle', () => { s.collapsed = !details.open; });
  const summary = document.createElement('summary');
  summary.textContent = details.open ? 'Description' : 'Description (hidden)';
  details.addEventListener('toggle', () => { summary.textContent = details.open ? 'Description' : 'Description (hidden)'; });
  const desc = document.createElement('p');
  desc.textContent = r.description;
  const dl = document.createElement('dl');
  for (const [k, v] of Object.entries(r.slots)) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v ?? (OPTIONAL.has(k) ? '—' : '— needs expert');
    if (!v && !OPTIONAL.has(k)) dd.className = 'missing';
    dl.append(dt, dd);
  }
  details.append(summary, desc, dl);
  out.replaceChildren(details);
  if (!r.questions.length) return;

  const head = document.createElement('div');
  head.className = 'hint';
  head.textContent = 'Questions for the expert';
  out.append(head);
  r.questions.forEach((q, qi) => {
    const row = document.createElement('div');
    row.className = 'q' + (q === currentQ ? ' current' : '');
    const top = document.createElement('div');
    top.className = 'row';
    const text = document.createElement('span');
    text.textContent = `${q.text} `;
    const at = document.createElement('span');
    at.className = 'meta';
    at.textContent = `@ frame ${q.frame} · ${(s.frameTimes[q.frame] ?? s.tStart).toFixed(1)} s`;
    text.append(at);
    const go = document.createElement('button');
    go.className = 'ghost';
    go.textContent = 'Show frame';
    go.addEventListener('click', () => { video.pause(); video.currentTime = s.frameTimes[q.frame] ?? s.tStart; });
    top.append(text, go);
    row.append(top);
    if (q.answer) {
      const a = document.createElement('div');
      a.className = 'answer';
      a.textContent = '↳ ' + q.answer;
      row.append(a);
    }
    out.append(row);
  });
}

// ---- Voice Q&A: ask each question at its keyframe, listen, then play on to the next ----
let currentQ = null;
let run = null;

const buildQueue = () => segments
  .flatMap((s) => (s.result?.questions ?? []).map((q) => ({ s, q, time: s.frameTimes[q.frame] ?? s.tStart })))
  .filter((it) => !it.q.answer)
  .sort((a, b) => a.time - b.time);

$('voice-start').addEventListener('click', startVoice);
$('voice-skip').addEventListener('click', () => { if (run) { run.skip = true; voice.interrupt(); } });
$('voice-end').addEventListener('click', () => { if (run) { run.cancelled = true; voice.interrupt(); } });

function showQuestion(item) {
  currentQ = item.q;
  const idx = segments.indexOf(item.s);
  page = Math.floor(idx / PAGE_SIZE);
  render();
  document.getElementById(`seg-${item.s.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// First question: jump to its keyframe. Later ones: play forward until the keyframe, then pause.
async function moveTo(t, follow) {
  if (follow && t > video.currentTime + 0.1) {
    video.play();
    await new Promise((resolve) => {
      const tick = () => {
        if (run.cancelled || run.skip || video.currentTime >= t - 0.05) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
  }
  video.pause();
  await seek(video, t);
}

async function startVoice() {
  ensureGuardrailQuestion(segments);
  const queue = buildQueue();
  if (!queue.length) { $('status').textContent = 'Describe the segments first — no open questions.'; return; }
  run = { cancelled: false, skip: false };
  $('voice').hidden = false;
  $('voice-total').textContent = queue.length;
  try {
    for (const [i, item] of queue.entries()) {
      if (run.cancelled) break;
      run.skip = false;
      $('voice-n').textContent = i + 1;
      $('voice-q').textContent = item.q.text;
      $('voice-a').textContent = '';
      showQuestion(item);
      await moveTo(item.time, i > 0);
      if (run.cancelled) break;
      run.skip = false;

      voice.setState('speaking');
      await voice.speak(item.q.text);
      if (run.cancelled) break;
      if (run.skip) continue;

      voice.setState('listening');
      const blob = await voice.listen();
      if (run.cancelled) break;
      if (!blob) continue; // silence or skipped: stays unanswered

      voice.setState('thinking');
      item.q.answer = await voice.transcribe(blob);
      item.q.answerT = item.time;
      $('voice-a').textContent = item.q.answer;
      showQuestion(item);
    }
  } catch (err) {
    $('voice-a').textContent = 'error: ' + err.message;
  } finally {
    voice.setState('idle');
    currentQ = null;
    video.pause();
    run = null;
    render();
    $('voice-q').textContent = buildQueue().length ? 'Stopped.' : 'All questions answered.';
  }
}

$('prev').addEventListener('click', () => { page--; render(); });
$('next').addEventListener('click', () => { page++; render(); });

// ---- Module 1 output: described segments and what the expert said ----
const OPTIONAL = new Set(['location', 'target']);

// What the expert said unprompted while working (Scribe), kept as their own words for the step it was said in.
let narration = [];
const saidDuring = (s) => narration.filter((n) => n.t >= s.tStart && n.t <= s.tEnd + 4).map((n) => ({ question: '(said while working)', answer: n.text, t: n.t }));

function nodeInputs() {
  return segments.filter((s) => s.result).map((s) => ({
    id: `n${s.id + 1}`,
    description: s.result.description,
    slots: s.result.slots,
    answers: [...s.result.questions.filter((q) => q.answer).map((q) => ({ question: q.text, answer: q.answer, ...(Number.isFinite(q.answerT) ? { t: +q.answerT.toFixed(2) } : {}) })), ...saidDuring(s)],
    video_segment: { uri: videoName, t_start: +s.tStart.toFixed(2), t_end: +s.tEnd.toFixed(2) },
  }));
}

// ---- Module 2: Work Map, debrief with follow-ups, teach-back ----
let mapSteps = [];
let mapUnclear = [];
let followups = [];   // [{ step, question, answer }] asked in the debrief
let teachBack = null; // { text, confirmed, correction }

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const seekTo = (t) => { video.pause(); video.currentTime = t; video.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

function momentLink(t, label = 'screen moment') {
  const b = document.createElement('button');
  b.className = 'link';
  b.textContent = `▶ ${fmtTime(t)} ${label}`;
  b.addEventListener('click', () => seekTo(t));
  return b;
}

function field(label, ...children) {
  const d = document.createElement('div');
  d.className = 'field';
  const b = document.createElement('b');
  b.textContent = label;
  d.append(b, ...children);
  return d;
}

const quoteEl = (words) => Object.assign(document.createElement('span'), { className: 'quote', textContent: `“${words}” ` });
const GUARD_LABEL = { limit: 'Limit', exception: 'Exception', stop_and_ask: 'Stop and ask' };

function renderMap() {
  $('workmap').hidden = false;
  const items = mapSteps.map((s, i) => {
    const li = document.createElement('li');
    li.className = 'mstep';
    const h = document.createElement('h4');
    h.textContent = `Step ${i + 1} of ${mapSteps.length}: ${s.title} `;
    h.append(momentLink(s.screen_moment.t, 'screen moment'));
    li.append(h);
    li.append(field('Decision', s.decision ?? '—'));
    if (s.reason) li.append(field('Reason', quoteEl(s.reason.words), s.reason.source === 'live' ? momentLink(s.reason.screen_moment.t, 'said here') : Object.assign(document.createElement('span'), { className: 'hint', textContent: '(debrief)' })));
    else if (s.needs_reason) li.append(Object.assign(field('Reason', 'not stated yet, asked in debrief'), { className: 'field gap' }));
    for (const g of s.guardrails) {
      li.append(field(GUARD_LABEL[g.kind], `${g.rule} `, quoteEl(g.words), g.source === 'live' ? momentLink(g.screen_moment.t, 'said here') : Object.assign(document.createElement('span'), { className: 'hint', textContent: '(debrief)' })));
    }
    if (!s.guardrails.length) li.append(field('Guardrails', '—'));
    return li;
  });
  $('map-timeline').replaceChildren(...mapSteps.map((s, i) => {
    const b = document.createElement('button');
    b.className = 'ghost';
    b.textContent = `${i + 1} · ${fmtTime(s.screen_moment.t)}`;
    b.title = s.title;
    b.addEventListener('click', () => { items[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); seekTo(s.screen_moment.t); });
    return b;
  }));
  $('map-steps').replaceChildren(...items);
  renderDebrief();
}

function renderDebrief() {
  const st = debriefStatus({ followups, teachBack });
  const open = mapUnclear.filter((u) => !followups.some((f) => f.question === u.question && f.answer));
  $('debrief-open').textContent = open.length ? `Still unclear (${open.length}): ${open.map((u) => u.question).join(' · ')}` : 'Nothing left to ask.';
  $('debrief-status').textContent = st.complete
    ? 'Debrief complete: teach-back confirmed.'
    : `${st.followups_answered}/3 follow-ups answered · teach-back ${st.confirmed ? 'confirmed' : 'not confirmed'}`;
  $('teachback').textContent = teachBack ? `Teach-back: ${teachBack.text}${teachBack.correction ? ` — Expert: ${teachBack.correction}` : ''}` : '';
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

async function buildMap() {
  const inputs = nodeInputs();
  if (!inputs.length) throw new Error('Describe the segments first.');
  const data = await post('/api/workmap', { nodes: inputs, debrief: followups.filter((f) => f.answer) });
  mapSteps = data.steps;
  // Questions the expert already answered in the debrief are not asked again.
  mapUnclear = data.unclear.filter((u) => !followups.some((f) => f.question === u.question));
  renderMap();
  return data;
}

$('build-map').addEventListener('click', async () => {
  const btn = $('build-map');
  btn.disabled = true;
  $('status').textContent = 'building Work Map…';
  try {
    followups = [];
    teachBack = null;
    await describeAll();
    const data = await buildMap();
    const dropped = data.dropped.quotes ? ` · ${data.dropped.quotes} quote(s) dropped: not the expert's words` : '';
    $('status').textContent = `Work Map: ${mapSteps.length} steps${dropped}`;
  } catch (err) {
    $('status').textContent = 'failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

const sentences = (text, max = 450) => {
  const out = [];
  for (const s of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    if (out.length && (out.at(-1) + s).length <= max) out[out.length - 1] += s;
    else out.push(s);
  }
  return out.map((s) => s.trim()).filter(Boolean);
};

async function ask(text) {
  $('voice-q').textContent = text;
  $('voice-a').textContent = '';
  voice.setState('speaking');
  for (const part of sentences(text)) { await voice.speak(part); if (run.cancelled || run.skip) return null; }
  voice.setState('listening');
  const blob = await voice.listen();
  if (run.cancelled || !blob) return null;
  voice.setState('thinking');
  const answer = await voice.transcribe(blob);
  $('voice-a').textContent = answer;
  return answer;
}

// Debrief: ask what is still unclear, rebuild the map with the answers, then explain the process back
// until the expert confirms (at most two corrections).
async function runDebrief() {
  const queue = mapUnclear.filter((u) => !followups.some((f) => f.question === u.question));
  run = { cancelled: false, skip: false };
  $('voice').hidden = false;
  $('voice-total').textContent = queue.length;
  $('voice-n').textContent = 0;
  try {
    for (const [i, u] of queue.entries()) {
      if (run.cancelled) break;
      run.skip = false;
      $('voice-n').textContent = i + 1;
      const answer = await ask(u.question);
      followups.push({ step: u.step, question: u.question, answer });
      renderDebrief();
    }
    if (run.cancelled) return;

    $('voice-total').textContent = '…';
    $('status').textContent = 'updating Work Map…';
    await buildMap();

    for (let round = 0; round < 3 && !run.cancelled; round++) {
      const { text } = await post('/api/teachback', { steps: mapSteps });
      teachBack = { text, confirmed: false, correction: null };
      renderDebrief();
      run.skip = false;
      const reply = await ask(text);
      if (!reply) break;
      const verdict = await post('/api/teachback/judge', { explanation: text, reply });
      teachBack = { text, ...verdict };
      renderDebrief();
      if (verdict.confirmed) break;
      followups.push({ step: null, question: `Correction to teach-back: ${text}`, answer: verdict.correction ?? reply });
      await buildMap();
    }
  } catch (err) {
    $('voice-a').textContent = 'error: ' + err.message;
  } finally {
    voice.setState('idle');
    run = null;
    renderDebrief();
    $('voice-q').textContent = teachBack?.confirmed ? 'Teach-back confirmed.' : 'Debrief stopped.';
    $('status').textContent = '';
  }
}

$('debrief-start').addEventListener('click', async () => {
  const btn = $('debrief-start');
  btn.disabled = true;
  try { await runDebrief(); } finally { btn.disabled = false; }
});

$('download-map').addEventListener('click', () => {
  const json = toWorkMap({ video: { name: videoName, duration: +video.duration.toFixed(2) }, steps: mapSteps, followups, teachBack });
  const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${videoName.replace(/\.[^.]+$/, '')}.work-map.json` });
  a.click();
  URL.revokeObjectURL(url);
});

// Hand the Work Map to the Module-3 tutor (same browser, so localStorage carries it).
$('teach-map').addEventListener('click', () => {
  const json = toWorkMap({ video: { name: videoName, duration: +video.duration.toFixed(2) }, steps: mapSteps, followups, teachBack });
  try { localStorage.setItem('groundzero.workmap', JSON.stringify(json)); } catch { $('status').textContent = 'Could not hand over the Work Map; download it and load it in the tutor.'; return; }
  window.open('tutor.html', '_blank');
});

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// Stretch: the Work Map as instructions an agent can load (steps in order, guardrails, where to stop).
$('download-agent').addEventListener('click', () => {
  const map = toWorkMap({ video: { name: videoName, duration: +video.duration.toFixed(2) }, steps: mapSteps, followups, teachBack });
  const base = videoName.replace(/\.[^.]+$/, '');
  download(`${base}.agent-instructions.json`, JSON.stringify(toAgentInstructions(map), null, 2), 'application/json');
  download(`${base}.agent-instructions.md`, toAgentMarkdown(map), 'text/markdown');
});
