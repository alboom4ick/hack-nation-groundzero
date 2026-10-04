import * as voice from './voice.js';
import { startLive, openIsland, dismissIsland, fixDuration } from './live.js';
import { toAgentInstructions, toAgentMarkdown } from './agent-export.js';
import { LANGUAGES, getLanguage, setLanguage } from './language.js';
import { ocrEnabled, setOcrEnabled } from './ocr-redact.js';
import { openInterviewerVoice, builtinVoice } from './voice-turn.js';
import { compareWorkMaps } from './compare.js';
import { ensureGuardrailQuestion, selectOpenQuestions } from './pacing.js';
import { buildSegmentTree, renderSegmentTree } from './seg-tree.js';
import { createDebrief } from './debrief.js';
import { readWorkMap } from './workmap.js';

const PAGE_SIZE = 10; // segment rows are collapsed, so a page can hold more

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
// How the segments are shown: 'list' (collapsed rows) or 'tree' (session > step > segment > question > answer).
let view = (() => { try { return localStorage.getItem('groundzero.segview') === 'tree' ? 'tree' : 'list'; } catch { return 'list'; } })();
const treeState = new Map(); // expand state of tree nodes, keyed by path
const workMapSteps = () => { try { return debrief.steps; } catch { return []; } }; // debrief is declared further down
let videoName = 'video';

function resetSession(name) {
  videoName = name;
  narration = [];
  $('workmap').hidden = true;
  debrief.reset();
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
  offerVideoSave(detail.blob);
  autoSaveVideo(detail.blob);
  segments = detail.segments;
  narration = detail.narration ?? [];
  page = 0;
  render();
  $('status').textContent = `${segments.length} live segments · ${video.duration.toFixed(1)} s${detail.shortfall ? ` · ${detail.shortfall} Use "Answer open questions" below to cover the rest.` : ''}`;
});

// The recording goes to S3 as soon as the capture ends, named like the session, so any Work Map made from this
// session finds its video on the trees page. Skipped quietly when video storage is not set up.
async function autoSaveVideo(blob) {
  const msg = $('video-save-msg');
  try {
    await uploadVideo('unassigned', blob, { name: videoName, duration: video.duration });
    msg.textContent = 'Video saved. It shows up on the action tree made from this session.';
  } catch (err) { msg.textContent = `Video not saved: ${err.message}`; }
}

// Save the recording to an action tree in S3, only when the expert asks: the recording is the raw screen.
async function offerVideoSave(blob) {
  const trees = [{ id: 'invoice_demo', name: 'Supplier invoices to cost centers (sample)' }, ...(await listCustom().catch(() => []))];
  $('video-tree').replaceChildren(...trees.map((t) => new Option(t.name, t.id)));
  $('video-save').hidden = false;
  $('video-save-go').disabled = false;
  $('video-save-go').onclick = async () => {
    const msg = $('video-save-msg');
    $('video-save-go').disabled = true; msg.textContent = 'Saving…';
    try { await uploadVideo($('video-tree').value, blob, { name: videoName, duration: video.duration }); msg.textContent = 'Saved to the action tree.'; }
    catch (err) { msg.textContent = err.message; $('video-save-go').disabled = false; }
  };
}

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
  if (view === 'tree') {
    const tree = buildSegmentTree({ name: videoName, segments, steps: workMapSteps(), currentQ });
    $('segments').replaceChildren(renderSegmentTree(tree, {
      isOpen: (path, dflt) => (treeState.has(path) ? treeState.get(path) : dflt),
      setOpen: (path, open) => { treeState.set(path, open); render(); },
      onSeek: (t) => { video.pause(); video.currentTime = t; },
    }));
  } else {
    $('segments').replaceChildren(...slice.map(segmentCard));
  }
  $('viewbar').hidden = !segments.length;
  for (const v of ['list', 'tree']) $(`view-${v}`).setAttribute('aria-pressed', String(view === v));
  $('toggle-all').hidden = view === 'tree';

  $('tools').hidden = !segments.length;
  $('next-title').hidden = !segments.length;
  if (segments.length) {
    const li = document.querySelectorAll('.stepper li');
    li[0]?.classList.replace('now', 'done'); li[0]?.removeAttribute('aria-current');
    li[1]?.classList.add('now'); li[1]?.setAttribute('aria-current', 'step');
  }
  syncToggleAll();
  $('pager').hidden = view === 'tree' || pages <= 1;
  $('prev').disabled = page === 0;
  $('next').disabled = page === pages - 1;
  $('pageinfo').textContent = `Page ${page + 1} of ${pages} · segments ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + slice.length} of ${segments.length}`;
}

// A collapsed row (thumbnail, number, time, one-line description, open questions); the frames and tools open on click.
function segmentCard(s) {
  const el = document.createElement('details');
  el.className = 'card seg';
  el.id = `seg-${s.id}`;
  el.open = !!s.open;
  el.addEventListener('toggle', () => { s.open = el.open; syncToggleAll(); });

  const sum = document.createElement('summary');
  const thumb = Object.assign(document.createElement('img'), { className: 'seg-thumb', src: s.frames[0], alt: '', loading: 'lazy' });
  const title = Object.assign(document.createElement('span'), { className: 'seg-title', textContent: `Segment ${s.id + 1}` });
  const meta = Object.assign(document.createElement('span'), { className: 'meta', textContent: `${s.tStart.toFixed(1)}–${s.tEnd.toFixed(1)} s · ${s.frames.length} frames` });
  const desc = Object.assign(document.createElement('span'), { className: 'seg-desc', textContent: s.result?.description ?? 'Not described yet' });
  sum.append(thumb, title, meta, desc);
  const openQs = (s.result?.questions ?? []).filter((q) => !q.answer).length;
  if (openQs) sum.append(Object.assign(document.createElement('span'), { className: 'seg-badge', textContent: `${openQs} question${openQs === 1 ? '' : 's'}` }));

  const body = document.createElement('div');
  body.className = 'seg-body';
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
  body.append(strip, actions, out);
  el.append(sum, body);
  if (s.result) showResult(s, out);
  return el;
}

function syncToggleAll() {
  $('toggle-all').textContent = segments.length && segments.every((s) => s.open) ? 'Collapse all segments' : 'Expand all segments';
}
$('toggle-all').addEventListener('click', () => {
  const openAll = !segments.every((s) => s.open);
  segments.forEach((s) => { s.open = openAll; });
  render();
});

async function describeSeg(s) {
  const res = await fetch('/api/describe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ frames: s.frames, frameTimes: s.frameTimes, tStart: s.tStart, tEnd: s.tEnd, language: getLanguage() }),
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
    s.open = true; // show what Claude said
    render();
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
    go.addEventListener('click', () => seekTo(s.frameTimes[q.frame] ?? s.tStart));
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
let turns = null; // the voice the running Q&A or debrief asks through

const buildQueue = () => segments
  .flatMap((s) => (s.result?.questions ?? []).map((q) => ({ s, q, time: s.frameTimes[q.frame] ?? s.tStart })))
  .filter((it) => !it.q.answer)
  .sort((a, b) => a.time - b.time);

$('voice-start').addEventListener('click', startVoice);
$('voice-skip').addEventListener('click', () => { if (run) { run.skip = true; turns?.cancel(); } });
$('voice-end').addEventListener('click', () => { if (run) { run.cancelled = true; turns?.cancel(); } });
$('voice-close').addEventListener('click', () => { if (!run) dismissIsland(); });

function showQuestion(item) {
  currentQ = item.q;
  const idx = segments.indexOf(item.s);
  page = Math.floor(idx / PAGE_SIZE);
  item.s.open = true; // the question being asked is in this segment
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
  const queue = selectOpenQuestions(buildQueue());
  if (!queue.length) { $('status').textContent = 'Describe the segments first — no open questions.'; return; }
  run = { cancelled: false, skip: false };
  turns = builtinVoice(voice, { onState: voice.setState });
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

      const answer = await turns.ask(item.q.text, { kind: item.q.kind });
      if (run.cancelled) break;
      if (!answer) continue; // silence or skipped: stays unanswered

      item.q.answer = answer;
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
    const wasCancelled = run?.cancelled;
    run = null;
    turns = null;
    render();
    $('voice-q').textContent = wasCancelled ? 'Stopped.' : 'Done. The rest are saved for the debrief.';
  }
}

for (const v of ['list', 'tree']) {
  $(`view-${v}`).addEventListener('click', () => {
    view = v;
    try { localStorage.setItem('groundzero.segview', v); } catch { /* storage blocked: the choice lasts for this page only */ }
    render();
  });
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
const debrief = createDebrief({
  build: (answered) => {
    const inputs = nodeInputs();
    if (!inputs.length) throw new Error('Describe the segments first.');
    return post('/api/workmap', { nodes: inputs, debrief: answered });
  },
  explain: (steps) => post('/api/teachback', { steps }),
  judge: (explanation, reply) => post('/api/teachback/judge', { explanation, reply }),
  onChange: () => renderMap(),
});
const workMapFile = () => debrief.workMap({ name: videoName, duration: +video.duration.toFixed(2) });

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// The player is sticky at the top of the page, so seeking never needs to scroll.
const seekTo = (t) => { video.hidden = false; video.pause(); video.currentTime = t; };

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

const quoteEl = (words, gloss) => Object.assign(document.createElement('span'), { className: 'quote', textContent: `“${words}” ${gloss ? `(${gloss}) ` : ''}` });
const GUARD_LABEL = { limit: 'Limit', exception: 'Exception', stop_and_ask: 'Stop and ask' };

function forgetButton(target, what) {
  const b = document.createElement('button');
  b.className = 'link';
  b.textContent = '✕ off the record';
  b.title = `Remove this ${what} from the Work Map and its exports`;
  b.addEventListener('click', () => debrief.forget(target));
  return b;
}

function renderMap() {
  $('workmap').hidden = false;
  const mapSteps = debrief.steps;
  const items = mapSteps.map((s, i) => {
    const li = document.createElement('li');
    li.className = 'mstep';
    const h = document.createElement('h4');
    h.textContent = `Step ${i + 1} of ${mapSteps.length}: ${s.title} `;
    h.append(momentLink(s.screen_moment.t, 'screen moment'), forgetButton({ part: 'step', step: s.id }, 'step'));
    li.append(h);
    li.append(field('Decision', s.decision ?? '—'));
    if (s.reason) li.append(field('Reason', quoteEl(s.reason.words, s.reason.gloss), s.reason.source === 'live' ? momentLink(s.reason.screen_moment.t, 'said here') : Object.assign(document.createElement('span'), { className: 'hint', textContent: '(debrief)' }), forgetButton({ part: 'reason', step: s.id }, 'reason')));
    else if (s.said) li.append(field('Said', quoteEl(s.said.words), momentLink(s.said.screen_moment.t, 'said here'), forgetButton({ part: 'said', step: s.id }, 'quote')));
    if (!s.reason && s.needs_reason) li.append(Object.assign(field('Reason', 'not stated yet, asked in debrief'), { className: 'field gap' }));
    s.guardrails.forEach((g, gi) => {
      li.append(field(GUARD_LABEL[g.kind], `${g.rule} `, quoteEl(g.words, g.gloss), g.source === 'live' ? momentLink(g.screen_moment.t, 'said here') : Object.assign(document.createElement('span'), { className: 'hint', textContent: '(debrief)' }), forgetButton({ part: 'guardrail', step: s.id, index: gi }, 'guardrail')));
    });
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
  const { status: st, open, teachBack } = debrief;
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

$('build-map').addEventListener('click', async () => {
  const btn = $('build-map');
  btn.disabled = true;
  $('status').textContent = 'building Work Map…';
  try {
    await describeAll();
    const data = await debrief.start();
    const dropped = data.dropped.quotes ? ` · ${data.dropped.quotes} quote(s) dropped: not the expert's words` : '';
    const unlinked = data.unlinked ? ` · ${data.unlinked} step(s) without the expert's words: say what you are doing while you work` : '';
    $('status').textContent = `Work Map: ${debrief.steps.length} steps${dropped}${unlinked}`;
  } catch (err) {
    $('status').textContent = 'failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// G3: the debrief has the same ElevenAgents voice as the capture when the interviewer agent is set up (its mic is
// only open while a question or the teach-back is out), and the built-in voice otherwise.
async function ask(text, { teachback = false, n, total } = {}) {
  run.skip = false;
  if (teachback) { $('voice-total').textContent = '…'; $('status').textContent = ''; } else { $('voice-n').textContent = n; $('voice-total').textContent = total; }
  $('voice-q').textContent = text;
  $('voice-a').textContent = '';
  const answer = await turns.ask(text, { kind: 'debrief', teachback });
  if (run.cancelled || run.skip || !answer) return null;
  $('voice-a').textContent = answer;
  return answer;
}

// Debrief: ask what is still unclear, rebuild the map with the answers, then explain the process back until the
// expert confirms. The procedure itself lives in debrief.js; this gives it a voice and a stop button.
async function runDebrief() {
  run = { cancelled: false, skip: false };
  $('voice').hidden = false;
  $('voice-total').textContent = debrief.open.length;
  $('voice-n').textContent = 0;
  turns = await openInterviewerVoice({
    speech: voice, language: getLanguage(), onState: voice.setState,
    onError: (m) => { $('voice-a').textContent = 'agent: ' + m; },
    onNotice: (m) => { $('status').textContent = m; },
  });
  try {
    await debrief.run({ ask, stopped: () => run.cancelled, onPhase: (m) => { $('voice-q').textContent = m; $('voice-a').textContent = ''; voice.setState('thinking'); } });
  } catch (err) {
    $('voice-a').textContent = 'error: ' + err.message;
  } finally {
    turns.close();
    turns = null;
    voice.setState('idle');
    run = null;
    renderDebrief();
    $('voice-q').textContent = debrief.teachBack?.confirmed ? 'Teach-back confirmed.' : 'Debrief stopped.';
    $('status').textContent = '';
  }
}

$('debrief-start').addEventListener('click', async () => {
  const btn = $('debrief-start');
  btn.disabled = true;
  try { await runDebrief(); } finally { btn.disabled = false; }
});

$('download-map').addEventListener('click', () => {
  const json = workMapFile();
  const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${videoName.replace(/\.[^.]+$/, '')}.work-map.json` });
  a.click();
  URL.revokeObjectURL(url);
});

// Hand the Work Map to the Module-3 tutor (same browser, so localStorage carries it).
$('teach-map').addEventListener('click', () => {
  const json = workMapFile();
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
  const map = workMapFile();
  const base = videoName.replace(/\.[^.]+$/, '');
  download(`${base}.agent-instructions.json`, JSON.stringify(toAgentInstructions(map), null, 2), 'application/json');
  download(`${base}.agent-instructions.md`, toAgentMarkdown(map), 'text/markdown');
});

// S2: the expert picks the language they speak; the tutor stays in English.
const langSelect = $('lang'); // absent when the page has no language picker
if (langSelect) {
  langSelect.replaceChildren(...Object.entries(LANGUAGES).map(([code, name]) => new Option(name, code)));
  langSelect.value = getLanguage();
  langSelect.addEventListener('change', () => setLanguage(langSelect.value));
}

// A5: areas of the shared screen that are painted over before any frame is analysed.

// S1: two experts, one task. Differences by step, and the why-question each expert should be asked.
async function readMap(input) {
  const f = input.files?.[0];
  if (!f) throw new Error('choose both Work Map files');
  let map;
  try { map = readWorkMap(JSON.parse(await f.text())); } catch (err) { throw new Error(`${f.name}: ${err.message}`); }
  return { map, name: f.name.replace(/\.work-map\.json$|\.json$/, '') };
}
$('cmp-go')?.addEventListener('click', async () => { // absent when the page has no Compare section
  const out = $('cmp-out');
  out.replaceChildren();
  try {
    const [a, b] = [await readMap($('cmp-a')), await readMap($('cmp-b'))];
    const r = compareWorkMaps(a.map, b.map, { nameA: a.name, nameB: b.name });
    const add = (tag, text, parent = out) => parent.append(Object.assign(document.createElement(tag), { textContent: text }));
    add('p', `${r.matched} steps match; ${r.differences.length} difference${r.differences.length === 1 ? '' : 's'}.`);
    const diffs = document.createElement('ul');
    for (const d of r.differences) add('li', `${d.kind}: ${d.detail}`, diffs);
    out.append(diffs);
    if (r.questions.length) {
      add('h4', 'Questions for the apprentice to ask');
      const qs = document.createElement('ul');
      for (const q of r.questions) add('li', `To ${q.to === 'a' ? a.name : b.name}: ${q.question}`, qs);
      out.append(qs);
    }
  } catch (err) { out.textContent = 'Could not compare: ' + err.message; }
});
$('ocr-pii').checked = ocrEnabled();
$('ocr-pii').addEventListener('change', () => setOcrEnabled($('ocr-pii').checked));
