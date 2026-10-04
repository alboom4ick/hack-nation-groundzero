import { segment } from './segmenter.js';
import * as voice from './voice.js';
import { startLive, openIsland, fixDuration } from './live.js';
import { depths, toExport, splitNode } from './tree.js';
import { toBpmn, layoutNodes } from './bpmn.js';
import { toWorkMap, debriefStatus, ensureGuardrailQuestion } from './workmap.js';

const SAMPLE_FPS = 4;      // motion sampling rate
const PROBE = { w: 64, h: 36 };
const THUMB_W = 640;
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
let treeNodes = [];
let selectedId = null;

function resetSession(name) {
  videoName = name;
  treeNodes = [];
  selectedId = null;
  $('tree').hidden = true;
  $('workmap').hidden = true;
  mapSteps = []; mapUnclear = []; followups = []; teachBack = null;
  segments = [];
  $('segments').replaceChildren();
  $('pager').hidden = true;
  $('tools').hidden = true;
}

$('file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  resetSession(f.name);
  video.src = URL.createObjectURL(f);
  video.hidden = false;
  $('status').textContent = 'loading…';
  video.onloadedmetadata = () => {
    $('run').disabled = false;
    $('status').textContent = `${video.duration.toFixed(1)} s`;
  };
});

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
  page = 0;
  render();
  $('status').textContent = `${segments.length} live segments · ${video.duration.toFixed(1)} s`;
});

$('run').addEventListener('click', async () => {
  $('run').disabled = true;
  try {
    const samples = await sampleMotion(video, (p) => setProgress(p * 0.7, 'measuring motion'));
    segments = segment(samples, video.duration);
    await attachThumbs(segments, (p) => setProgress(0.7 + p * 0.3, 'extracting frames'));
    page = 0;
    render();
    $('status').textContent = `${segments.length} segments`;
  } catch (err) {
    $('status').textContent = 'failed: ' + err.message;
  } finally {
    $('bar').hidden = true;
    $('run').disabled = false;
  }
});

function setProgress(p, label) {
  $('bar').hidden = false;
  $('bar').value = p;
  $('status').textContent = label;
}

function seek(v, t) {
  return new Promise((resolve) => {
    v.onseeked = () => resolve();
    v.currentTime = Math.min(t, v.duration - 0.01);
  });
}

// Mean absolute luma difference between consecutive downscaled frames, 0..1.
async function sampleMotion(v, onProgress) {
  const c = new OffscreenCanvas(PROBE.w, PROBE.h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const samples = [];
  let prev = null;
  const n = Math.floor(v.duration * SAMPLE_FPS);
  for (let i = 1; i <= n; i++) {
    const t = i / SAMPLE_FPS;
    await seek(v, t);
    ctx.drawImage(v, 0, 0, PROBE.w, PROBE.h);
    const d = ctx.getImageData(0, 0, PROBE.w, PROBE.h).data;
    if (prev) {
      let sum = 0;
      for (let p = 0; p < d.length; p += 4) sum += Math.abs(d[p] - prev[p]) + Math.abs(d[p + 1] - prev[p + 1]) + Math.abs(d[p + 2] - prev[p + 2]);
      samples.push({ t, score: sum / (d.length / 4 * 3 * 255) });
    }
    prev = d;
    onProgress(i / n);
  }
  return samples;
}

// JPEG data URLs for each segment's frames; these are also what gets sent to Claude later.
async function attachThumbs(segs, onProgress) {
  const h = Math.round((THUMB_W * video.videoHeight) / video.videoWidth);
  const c = new OffscreenCanvas(THUMB_W, h);
  const ctx = c.getContext('2d');
  const total = segs.reduce((a, s) => a + s.frameTimes.length, 0);
  let done = 0;
  for (const s of segs) {
    s.frames = [];
    for (const t of s.frameTimes) {
      await seek(video, t);
      ctx.drawImage(video, 0, 0, THUMB_W, h);
      s.frames.push(await blobToDataUrl(await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 })));
      onProgress(++done / total);
    }
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

function render() {
  const pages = Math.max(1, Math.ceil(segments.length / PAGE_SIZE));
  page = Math.min(Math.max(page, 0), pages - 1);
  const slice = segments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  $('segments').replaceChildren(...slice.map(segmentCard));

  $('tools').hidden = !segments.length;
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

$('describe-all').addEventListener('click', async () => {
  const btn = $('describe-all');
  btn.disabled = true;
  const todo = segments.filter((s) => !s.result);
  try {
    for (const [i, s] of todo.entries()) {
      $('status').textContent = `describing ${i + 1}/${todo.length}`;
      await describeSeg(s);
      render();
    }
    $('status').textContent = `${segments.length} segments described`;
  } catch (err) {
    $('status').textContent = 'failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

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

// ---- Steps 7-8: lineage pass, action tree, JSON export ----
const SVGNS = 'http://www.w3.org/2000/svg';
const NODE = { w: 200, h: 64, gx: 70, gy: 16 };
const SMALL = 44; // events and gateways
const OPTIONAL = new Set(['location', 'target']);

function nodeInputs() {
  return segments.filter((s) => s.result).map((s) => ({
    id: `n${s.id + 1}`,
    description: s.result.description,
    slots: s.result.slots,
    answers: s.result.questions.filter((q) => q.answer).map((q) => ({ question: q.text, answer: q.answer, ...(Number.isFinite(q.answerT) ? { t: +q.answerT.toFixed(2) } : {}) })),
    video_segment: { uri: videoName, t_start: +s.tStart.toFixed(2), t_end: +s.tEnd.toFixed(2) },
  }));
}

$('build-tree').addEventListener('click', async () => {
  const btn = $('build-tree');
  const inputs = nodeInputs();
  if (!inputs.length) { $('status').textContent = 'Describe the segments first.'; return; }
  btn.disabled = true;
  $('status').textContent = 'building action tree…';
  try {
    const res = await fetch('/api/lineage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nodes: inputs }) });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    const byId = new Map(data.lineage.map((l) => [l.id, l]));
    treeNodes = inputs.map((n) => ({ ...n, ...byId.get(n.id) }));
    renderTree(data.dropped.length);
    $('status').textContent = `action tree: ${treeNodes.length} nodes`;
  } catch (err) {
    $('status').textContent = 'failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

function renderTree(droppedCount) {
  $('tree').hidden = false;
  const bpmn = toBpmn(treeNodes, { name: videoName.replace(/\.[^.]+$/, '') });
  const d = depths(layoutNodes(bpmn));
  const byId = new Map(treeNodes.map((n) => [n.id, n]));
  const sizeOf = (n) => (n.bpmn_type === 'userTask' ? { w: NODE.w, h: NODE.h } : { w: SMALL, h: SMALL });

  // Column width = widest node in it; nodes in a column stack top to bottom, centred in the column.
  const cols = Math.max(...d.values()) + 1;
  const colW = Array.from({ length: cols }, () => 0);
  const rows = new Map();
  const place = new Map();
  for (const n of bpmn.nodes) {
    const col = d.get(n.id);
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    colW[col] = Math.max(colW[col], sizeOf(n).w);
    place.set(n.id, { col, row, ...sizeOf(n) });
  }
  const colX = colW.map((_, i) => colW.slice(0, i).reduce((a, w) => a + w + NODE.gx, 0));
  for (const p of place.values()) {
    p.x = colX[p.col] + (colW[p.col] - p.w) / 2;
    p.y = p.row * (NODE.h + NODE.gy) + (NODE.h - p.h) / 2;
  }
  const width = colX.at(-1) + colW.at(-1);
  const height = Math.max(...rows.values()) * (NODE.h + NODE.gy) - NODE.gy;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.style.maxWidth = '100%';

  const el = (name, attrs, text) => {
    const e = document.createElementNS(SVGNS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

  const marker = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--muted)' }));
  const defs = el('defs', {});
  defs.append(marker);
  svg.append(defs);
  for (const f of bpmn.flows) {
    const a = place.get(f.source);
    const b = place.get(f.target);
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
    const uncertain = byId.get(f.target)?.uncertain;
    svg.append(el('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1.5, 'stroke-dasharray': uncertain ? '5 4' : '0', 'marker-end': 'url(#arrow)' }));
    const label = f.condition?.expression ?? (f.default ? 'otherwise' : '');
    if (label) svg.append(el('text', { x: mx, y: (y1 + y2) / 2 - 4, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 10 }, clip(label, 24)));
  }
  for (const n of bpmn.nodes) {
    const { x, y, w, h } = place.get(n.id);
    const g = el('g', { transform: `translate(${x},${y})` });
    if (n.bpmn_type === 'userTask') {
      const t = byId.get(n.id);
      g.style.cursor = 'pointer';
      g.append(el('title', {}, `${t.description}\n\nContribution: ${t.contribution}\n${t.rationale}${t.ar ? `\n\nAR: ${t.ar.instruction} → ${t.ar.anchor.label}` : ''}`));
      g.append(el('rect', { width: w, height: h, rx: 8, fill: 'var(--card)', stroke: n.id === selectedId ? 'var(--accent)' : t.uncertain ? '#d97706' : 'var(--line)', 'stroke-width': n.id === selectedId ? 3 : 1.5 }));
      g.append(el('text', { x: 10, y: 20, fill: 'var(--accent)', 'font-size': 12, 'font-weight': 600 }, `${n.id} · ${t.video_segment.t_start}–${t.video_segment.t_end}s`));
      g.append(el('text', { x: 10, y: 38, fill: 'var(--fg)', 'font-size': 12 }, clip(n.name, 30)));
      g.append(el('text', { x: 10, y: 54, fill: 'var(--muted)', 'font-size': 11 }, clip(t.ar?.instruction ?? t.description, 34)));
      g.addEventListener('click', () => selectNode(n.id));
    } else if (n.bpmn_type.endsWith('Event')) {
      g.append(el('title', {}, n.name));
      g.append(el('circle', { cx: w / 2, cy: h / 2, r: w / 2 - 2, fill: 'var(--card)', stroke: n.id === 'start' ? '#16a34a' : '#dc2626', 'stroke-width': n.id === 'start' ? 2 : 4 }));
    } else {
      g.append(el('title', {}, `${n.name}\n${n.gateway.type}${n.gateway.decision_variable ? ` on ${n.gateway.decision_variable}` : ''}`));
      g.append(el('path', { d: `M${w / 2},2 L${w - 2},${h / 2} L${w / 2},${h - 2} L2,${h / 2} z`, fill: 'var(--card)', stroke: '#d97706', 'stroke-width': 2 }));
      const c = w / 2, r = 9;
      g.append(el('path', {
        d: n.bpmn_type === 'parallelGateway' ? `M${c - r},${c} H${c + r} M${c},${c - r} V${c + r}` : `M${c - 7},${c - 7} L${c + 7},${c + 7} M${c + 7},${c - 7} L${c - 7},${c + 7}`,
        stroke: '#d97706', 'stroke-width': 2.5, fill: 'none',
      }));
      if (n.gateway.type === 'XOR') g.append(el('text', { x: c, y: -4, 'text-anchor': 'middle', fill: 'var(--fg)', 'font-size': 11 }, clip(n.name, 28)));
    }
    svg.append(g);
  }
  $('tree-svg').replaceChildren(svg);

  const unsure = treeNodes.filter((n) => n.uncertain && n.question);
  const notes = [];
  if (droppedCount) notes.push(`${droppedCount} invalid link(s) dropped.`);
  if (unsure.length) notes.push('Links to confirm (dashed): ' + unsure.map((n) => `${n.id}: ${n.question}`).join(' · '));
  $('tree-notes').textContent = notes.join(' ');
  renderSplitPanel();
}

function selectNode(id) {
  selectedId = id;
  const n = treeNodes.find((x) => x.id === id);
  video.pause();
  video.currentTime = n.video_segment.t_start;
  renderTree(0);
}

function renderSplitPanel() {
  const n = treeNodes.find((x) => x.id === selectedId);
  $('split').hidden = !n;
  if (!n) return;
  $('split-title').textContent = `${n.id} · ${n.video_segment.t_start}–${n.video_segment.t_end}s${n.split_from ? ` (split from ${n.split_from})` : ''}`;
  $('split-desc').textContent = n.description;
}

async function runSplit() {
  const n = treeNodes.find((x) => x.id === selectedId);
  const instruction = $('split-input').value.trim();
  if (!n || !instruction) return;
  $('split-go').disabled = true;
  $('split-msg').textContent = 'Claude is checking…';
  try {
    const res = await fetch('/api/split', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ node: n, instruction }) });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    if (!data.split) { $('split-msg').textContent = 'Claude found no separate steps in that — node left unchanged.'; return; }
    treeNodes = splitNode(treeNodes, n.id, data.parts);
    selectedId = `${n.id}.1`;
    $('split-input').value = '';
    $('split-msg').textContent = `Split into ${data.parts.length} steps.`;
    renderTree(0);
  } catch (err) {
    $('split-msg').textContent = 'failed: ' + err.message;
  } finally {
    $('split-go').disabled = false;
  }
}

$('split-go').addEventListener('click', runSplit);
$('split-mic').addEventListener('click', async () => {
  const btn = $('split-mic');
  btn.disabled = true;
  $('split-msg').textContent = 'Listening…';
  try {
    const blob = await voice.listen();
    if (!blob) { $('split-msg').textContent = 'Heard nothing.'; return; }
    $('split-msg').textContent = 'Transcribing…';
    $('split-input').value = await voice.transcribe(blob);
    $('split-msg').textContent = 'Check the text, then press Split.';
  } catch (err) {
    $('split-msg').textContent = 'failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

$('download-json').addEventListener('click', () => {
  const json = toExport({ video: { name: videoName, duration: +video.duration.toFixed(2) }, nodes: treeNodes });
  const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${videoName.replace(/\.[^.]+$/, '')}.action-tree.json` });
  a.click();
  URL.revokeObjectURL(url);
});

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
