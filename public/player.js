import { loadWorkflow, createPlayer } from './runtime.js';
import { locate, canDetect, warmUp } from './detect.js';
import { createNarrator } from './narrator.js';

// The only deployment-specific constant: which workflow JSON to load.
// Override with ?w=<name> to load /workflows/<name>.json (no code change needed for new workflows).
const DEFAULT_WORKFLOW = 'desk_cleanup_demo';
const params = new URLSearchParams(location.search);
const workflowName = (params.get('w') ?? DEFAULT_WORKFLOW).replace(/[^\w.-]/g, '');
const WORKFLOW_URL = `workflows/${workflowName}.json`;

const $ = (id) => document.getElementById(id);
const cam = $('cam'), stage = $('stage'), lines = $('lines'), overlay = $('overlay'), actions = $('actions'), toast = $('toast');

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}

const button = (text, cls, onClick) => h('button', { class: cls, type: 'button', onclick: (ev) => { ev.stopPropagation(); onClick(); } }, text);

function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
}

// ---- camera -------------------------------------------------------------
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Camera needs HTTPS and a modern browser. Workflow still works without it.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    cam.srcObject = stream;
    await cam.play().catch(() => {});
    toast.hidden = true;
  } catch (err) {
    showToast(`Camera unavailable (${err.name}). Tap to retry; workflow still works.`);
    toast.style.pointerEvents = 'auto';
    toast.onclick = () => { toast.onclick = null; startCamera(); };
  }
}

// ---- voice --------------------------------------------------------------
const voiceBtn = $('voice-btn');
const narrator = createNarrator({
  onChange() {
    voiceBtn.textContent = narrator.muted ? '🔇' : '🔊';
    voiceBtn.classList.toggle('speaking', narrator.speaking);
    voiceBtn.classList.toggle('blocked', narrator.blocked);
    voiceBtn.setAttribute('aria-label', narrator.muted ? 'Unmute voice' : 'Mute voice');
  },
});
voiceBtn.addEventListener('click', (ev) => { ev.stopPropagation(); narrator.toggleMute(); });
$('replay-btn').addEventListener('click', (ev) => { ev.stopPropagation(); narrator.replay(); });
// Browsers block audio until the first gesture; the first tap releases any held narration.
document.addEventListener('pointerdown', () => narrator.unlock(), { capture: true });

// ---- rendering ----------------------------------------------------------
let player;

function px(p) { return { x: p.x * window.innerWidth, y: p.y * window.innerHeight }; }

function marker(p, { region, label, cls = '' }) {
  const { x, y } = px(p);
  return h('div', { class: `marker ${region ? 'region' : ''} ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, label ?? '');
}

// Card near a point: above it normally, below it when the point is near the top.
function cardAt(p, ...kids) {
  const { x, y } = px(p);
  const below = p.y < 0.4;
  const el = h('div', { class: 'card', style: { left: '0px', top: '0px', visibility: 'hidden' } }, ...kids);
  overlay.append(el);
  requestAnimationFrame(() => {
    const w = el.offsetWidth, ht = el.offsetHeight, m = 8;
    const left = Math.min(Math.max(x - w / 2, m), window.innerWidth - w - m);
    const top = below ? y + 84 : y - ht - 84;
    el.style.left = `${left}px`;
    el.style.top = `${Math.min(Math.max(top, 56), window.innerHeight - ht - 100)}px`;
    el.style.visibility = 'visible';
  });
  return el;
}

function arrowAt(p, { up }) {
  const { x, y } = px(p);
  return h('div', { class: 'arrow', style: { left: `${x}px`, top: `${y + (up ? 62 : -62)}px` } }, up ? '↑' : '↓');
}

function drawLine(a, b) {
  const A = px(a), B = px(b);
  const ang = Math.atan2(B.y - A.y, B.x - A.x);
  const r = 34; // stop at marker edge
  const sx = A.x + Math.cos(ang) * r, sy = A.y + Math.sin(ang) * r;
  const ex = B.x - Math.cos(ang) * r, ey = B.y - Math.sin(ang) * r;
  const ns = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(ns, 'line');
  for (const [k, v] of Object.entries({ x1: sx, y1: sy, x2: ex, y2: ey })) line.setAttribute(k, v);
  const head = document.createElementNS(ns, 'polygon');
  const s = 16;
  const pts = [[ex, ey], [ex - Math.cos(ang - 0.45) * s, ey - Math.sin(ang - 0.45) * s], [ex - Math.cos(ang + 0.45) * s, ey - Math.sin(ang + 0.45) * s]];
  head.setAttribute('points', pts.map((q) => q.join(',')).join(' '));
  lines.append(line, head);
}

function render() {
  const { state } = player;
  const cur = player.getNode(state.currentNodeId);
  narrator.update({ state, node: cur, stage: cur?.bpmn_type === 'userTask' ? player.groundingStage(cur.id) : null });
  overlay.replaceChildren();
  lines.replaceChildren();
  actions.replaceChildren();

  if (state.status === 'error') {
    overlay.append(h('div', { class: 'card full' }, h('div', { class: 'instr' }, 'Workflow error'), h('div', { class: 'desc' }, state.error)));
    actions.append(button('Restart', 'primary', () => player.resetWorkflow()));
    return;
  }
  if (state.status === 'complete') {
    const end = player.getNode(state.currentNodeId);
    overlay.append(h('div', { class: 'card full' },
      h('div', { class: 'instr' }, 'Workflow complete'),
      end?.name ? h('div', { class: 'desc' }, end.name) : null));
    actions.append(button('Restart', 'primary', () => player.resetWorkflow()));
    return;
  }

  const node = player.getNode(state.currentNodeId);
  if (node.bpmn_type === 'exclusiveGateway') {
    overlay.append(h('div', { class: 'card center' },
      h('div', { class: 'instr' }, node.name ?? ''),
      node.description ? h('div', { class: 'desc' }, node.description) : null));
    actions.append(button('Yes', 'yes', () => player.answerGateway(true)), button('No', 'no', () => player.answerGateway(false)));
    return;
  }
  if (node.bpmn_type === 'userTask') renderTask(node);
}

function renderTask(node) {
  const { state } = player;
  const ar = node.ar ?? {};
  const stage_ = player.groundingStage(node.id);
  const a = state.anchors[node.id] ?? {};
  const instruction = ar.instruction ?? node.name ?? '';

  if (stage_ === 'source' || stage_ === 'target') {
    const isSource = stage_ === 'source';
    const label = (isSource ? ar.anchor : ar.target_anchor).label;
    overlay.append(h('div', { class: 'card center' },
      h('div', { class: 'title' }, node.name ?? ''),
      h('div', { class: 'instr' }, (isSource ? `Point camera at the ${label}` : `Now find the ${label} (target)`) + (canDetect(isSource ? ar.anchor : ar.target_anchor) ? ' — or tap it' : ' and tap it')),
      !isSource ? h('div', { class: 'desc' }, instruction) : null));
    if (a.source) overlay.append(marker(a.source, { region: ar.anchor.type === 'region', label: 'A' }));
    actions.append(button('Skip', '', () => player.skipTask()));
    return;
  }

  // Grounded (or no anchor): show the guidance overlay.
  if (a.source) {
    overlay.append(marker(a.source, { region: ar.anchor?.type === 'region', label: a.target ? 'A' : '' }));
    overlay.append(h('div', { class: 'label', style: { left: `${px(a.source).x}px`, top: `${px(a.source).y + 36}px` } }, ar.anchor.label));
  }
  if (a.target) {
    overlay.append(marker(a.target, { region: ar.target_anchor?.type === 'region', label: 'B', cls: 'target' }));
    overlay.append(h('div', { class: 'label', style: { left: `${px(a.target).x}px`, top: `${px(a.target).y + 36}px` } }, ar.target_anchor.label));
    drawLine(a.source, a.target);
  }
  const body = [
    h('div', { class: 'title' }, node.name ?? ''),
    h('div', { class: 'instr' }, instruction),
    node.description ? h('div', { class: 'desc' }, node.description) : null,
  ];
  if (a.source) {
    const anchorPoint = a.target ? { x: (a.source.x + a.target.x) / 2, y: Math.min(a.source.y, a.target.y) } : a.source;
    if (!a.target) overlay.append(arrowAt(a.source, { up: a.source.y < 0.4 }));
    cardAt(anchorPoint, ...body);
    overlay.append(h('button', { class: 'link', type: 'button', onclick: () => { for (const k of ['source', 'target']) auto.delete(`${node.id}:${k}`); player.clearAnchors(node.id); } }, 'Re-locate'));
  } else {
    overlay.append(h('div', { class: 'card center' }, ...body));
  }
  actions.append(button('Skip', '', () => player.skipTask()), button('Done', 'primary', () => player.completeTask()));
}

// ---- auto-grounding (open-source COCO-SSD; tap stays as fallback) ---------
// While a task waits for an anchor, detect the labelled object and place it automatically.
// Once placed, keep tracking it so the marker follows the object. Moving it by hand (tap) disables tracking.
const auto = new Set(); // `${nodeId}:${stage}` anchors placed by the detector
let busy = false;

async function detectTick() {
  if (busy || !player || !cam.videoWidth) return;
  const { state } = player;
  const node = player.getNode(state.currentNodeId);
  if (state.status === 'complete' || node?.bpmn_type !== 'userTask' || !node.ar?.anchor) return;
  busy = true;
  try {
    const stage = player.groundingStage(node.id);
    const a = state.anchors[node.id] ?? {};
    const todo = stage === 'ready'
      ? ['source', 'target'].filter((k) => a[k] && auto.has(`${node.id}:${k}`))
      : [stage];
    let dirty = false;
    for (const k of todo) {
      const anchor = k === 'source' ? node.ar.anchor : node.ar.target_anchor;
      if (!canDetect(anchor)) continue;
      const p = await locate(cam, anchor);
      if (!p) continue;
      if (a[k]) { a[k].x = p.x; a[k].y = p.y; dirty = true; }
      else { auto.add(`${node.id}:${k}`); player.setAnchorPoint(p, node.id); }
    }
    if (dirty) render();
  } catch (err) {
    console.warn('detect', err);
  } finally { busy = false; }
}
setInterval(detectTick, 500);

// ---- input --------------------------------------------------------------
stage.addEventListener('click', (ev) => {
  const node = player.getNode(player.state.currentNodeId);
  if (node?.bpmn_type !== 'userTask') return;
  player.setAnchorPoint({ x: ev.clientX / window.innerWidth, y: ev.clientY / window.innerHeight });
});
$('restart-top').addEventListener('click', () => { narrator.stop(); player.resetWorkflow(); });
window.addEventListener('resize', () => player && render());

// ---- boot ---------------------------------------------------------------
(async () => {
  startCamera();
  warmUp();
  try {
    const workflow = await loadWorkflow(WORKFLOW_URL);
    $('process-name').textContent = workflow.process?.name ?? workflowName;
    player = createPlayer(workflow);
    player.subscribe(render);
    window.__player = player; // debugging / tests
    render();
  } catch (err) {
    overlay.append(h('div', { class: 'card full' }, h('div', { class: 'instr' }, 'Cannot load workflow'), h('div', { class: 'desc' }, err.message)));
  }
})();
