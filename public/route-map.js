// Route map: a Work Map drawn like a git network graph with BPMN shapes. The steps run along one "main" line
// as tasks, a decision is an exclusive gateway on that line, and every guardrail is a branch that forks off
// before its step: limits and exceptions rejoin after it, a stop-and-ask ends in a stop. `layoutRouteMap` is pure
// (no DOM, testable); `renderRouteMap` draws its result as SVG and only uses textContent.

export const GEO = {
  w: 168, h: 88,          // a step (BPMN task)
  gate: 44,               // an exclusive gateway (diamond)
  pillW: 176, pillH: 76,  // a guardrail branch label
  gapPlain: 80,           // between a step and the next element when there is no decision
  gapGate: 40,            // between a step and its gateway, and the gateway and the next step
  gapEdge: 60,            // between the start/end event and the neighbouring step
  event: 14,              // start/end event radius
  forkBefore: 30, mergeAfter: 30, laneGap: 16, stopR: 11,
  pad: 24,
};

const CHARS = { title: 19, rule: 23, decision: 30 };

// Word-wrap into at most `maxLines` lines of `maxChars`; the last line ends in an ellipsis when text is cut.
export function wrap(text, maxChars, maxLines) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).flatMap((w) => (w.length > maxChars ? w.match(new RegExp(`.{1,${maxChars}}`, 'g')) : [w]));
  const lines = [];
  let cut = false;
  for (const w of words) {
    const last = lines.at(-1);
    if (last !== undefined && (last + ' ' + w).length <= maxChars) lines[lines.length - 1] = last + ' ' + w;
    else if (lines.length < maxLines) lines.push(w);
    else { cut = true; break; }
  }
  if (cut) {
    const last = lines.at(-1);
    lines[lines.length - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last) + '…';
  }
  return lines;
}

const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const timeOf = (m) => (Number.isFinite(m?.t) && Number.isFinite(m?.t_end) && m.t_end > m.t ? `${clock(m.t)}–${clock(m.t_end)}` : '');

export function layoutRouteMap(steps = []) {
  const g = GEO;
  const anyDecision = steps.some((s) => s.decision);
  const mainY = anyDecision ? 128 : 66;

  const start = { x: g.pad + g.event, y: mainY, r: g.event };
  let x = start.x + g.event + g.gapEdge;
  const nodes = [], gates = [], flows = [], raw = [];
  let from = start.x + g.event; // where the next main segment begins

  steps.forEach((s, i) => {
    const node = {
      id: s.id, index: i, x, y: mainY - g.h / 2, w: g.w, h: g.h, off: !!s.off, custom: !!s.custom,
      lines: wrap(s.title, CHARS.title, 3), title: s.title, time: timeOf(s.screen_moment), decision: s.decision ?? null,
    };
    nodes.push(node);
    flows.push({ x1: from, x2: x, off: false });
    (s.guardrails ?? []).forEach((gr, k) => raw.push({
      stepId: s.id, k, kind: gr.kind, rule: gr.rule, off: !!(s.off || gr.off), custom: gr.source === 'custom',
      lines: wrap(gr.rule, CHARS.rule, 3), x: node.x, forkX: node.x - g.forkBefore,
      mergeX: node.x + g.w + g.mergeAfter, ends: gr.kind === 'stop_and_ask' ? 'stop' : 'merge',
    }));
    x += g.w;
    from = x;
    if (s.decision) {
      const gx = x + g.gapGate + g.gate / 2;
      gates.push({ stepId: s.id, x: gx, y: mainY, half: g.gate / 2, off: node.off, lines: wrap(s.decision, CHARS.decision, 3), text: s.decision });
      flows.push({ x1: x, x2: gx - g.gate / 2, off: false });
      from = gx + g.gate / 2;
      x = from + g.gapGate;
    } else x += g.gapPlain;
  });

  const end = { x: from + g.gapEdge + g.event, y: mainY, r: g.event };
  flows.push({ x1: from, x2: end.x - g.event, off: false });

  // Put branches on lanes below the main line, first fit by horizontal extent.
  const laneEnds = [];
  const branches = raw.map((b) => {
    const endsAt = b.ends === 'stop' ? b.x + g.w + 26 + g.stopR : b.mergeX;
    let lane = laneEnds.findIndex((e) => e + 10 <= b.forkX);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = endsAt;
    return { ...b, lane, y: mainY + g.h / 2 + 34 + g.pillH / 2 + lane * (g.pillH + g.laneGap), stopX: b.x + g.w + 26 };
  });

  const bottom = branches.length ? mainY + g.h / 2 + 34 + g.pillH + (laneEnds.length - 1) * (g.pillH + g.laneGap) + 24 : mainY + g.h / 2 + 28;
  return { width: end.x + g.event + g.pad, height: bottom, mainY, start, end, nodes, gates, flows, branches };
}

// ---------------------------------------------------------------------------------------------------- drawing

const NS = 'http://www.w3.org/2000/svg';
const KIND = { limit: { name: 'Limit', glyph: null }, exception: { name: 'Exception', glyph: '!' }, stop_and_ask: { name: 'Stop and ask', glyph: '?' } };

const svgEl = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : String(v));
  n.append(...kids);
  return n;
};
const text = (attrs, ...lines) => svgEl('text', attrs, ...lines.map((l, i) => svgEl('tspan', { x: attrs.x, dy: i === 0 ? 0 : attrs.lh }, l)));
const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${x1 + (x2 - x1) / 2},${y1} ${x1 + (x2 - x1) / 2},${y2} ${x2},${y2}`;

// onSelect(stepId) is called when a step, its gateway or one of its guardrails is clicked or activated by key.
// status: { [stepId]: 'now' | 'done' | 'wrong' } paints a lesson's progress on the route (tutor).
export function renderRouteMap(steps, { onSelect = () => {}, selected = null, status = {} } = {}) {
  const L = layoutRouteMap(steps), g = GEO;
  const svg = svgEl('svg', { class: 'rm', viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, role: 'group',
    'aria-label': `Route map: ${steps.length} step${steps.length === 1 ? '' : 's'}, ${L.branches.length} guardrail${L.branches.length === 1 ? '' : 's'}. Steps are in order along the main line; guardrails branch off below.` });
  svg.append(svgEl('defs', {}, svgEl('marker', { id: 'rm-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, svgEl('path', { d: 'M0,0 L10,5 L0,10 z', class: 'rm-arrow' }))));

  const activate = (g, stepId, label) => {
    g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', label); g.dataset.step = stepId;
    g.addEventListener('click', () => onSelect(stepId));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(stepId); } });
    return g;
  };

  // Branch curves first, so tasks and labels sit on top of them.
  for (const b of L.branches) {
    const cls = `rm-branch k-${b.kind}${b.off ? ' off' : ''}`;
    const laneEnd = b.ends === 'stop' ? b.stopX - g.stopR : b.mergeX;
    const grp = svgEl('g', { class: cls, 'data-step': b.stepId });
    grp.append(svgEl('path', { class: 'rm-wire', d: curve(b.forkX, L.mainY, b.x - 2, b.y) }));
    grp.append(svgEl('path', { class: 'rm-wire', d: b.ends === 'stop' ? `M${b.x + g.w + 2},${b.y} H${laneEnd}` : curve(b.x + g.w + 2, b.y, b.mergeX, L.mainY) }));
    grp.append(svgEl('circle', { class: 'rm-commit', cx: b.forkX, cy: L.mainY, r: 4.5 }));
    if (b.ends === 'merge') grp.append(svgEl('circle', { class: 'rm-commit', cx: b.mergeX, cy: L.mainY, r: 4.5 }));
    else {
      grp.append(svgEl('circle', { class: 'rm-stop', cx: b.stopX, cy: b.y, r: g.stopR }));
      grp.append(svgEl('rect', { class: 'rm-stop-bar', x: b.stopX - 4.5, y: b.y - 4.5, width: 9, height: 9, rx: 1.5 }));
    }
    svg.append(grp);
  }

  // The main line, then its start and end events.
  for (const f of L.flows) svg.append(svgEl('line', { class: 'rm-main', x1: f.x1, y1: L.mainY, x2: f.x2, y2: L.mainY, 'marker-end': 'url(#rm-arrow)' }));
  const chip = svgEl('g', { class: 'rm-chip' }, svgEl('rect', { x: L.start.x - 18, y: L.mainY - 46, width: 42, height: 20, rx: 10 }), text({ x: L.start.x + 3, y: L.mainY - 32, 'text-anchor': 'middle' }, 'main'));
  svg.append(chip);
  svg.append(svgEl('circle', { class: 'rm-event', cx: L.start.x, cy: L.start.y, r: L.start.r }, svgEl('title', {}, 'Start')));
  svg.append(svgEl('circle', { class: 'rm-event end', cx: L.end.x, cy: L.end.y, r: L.end.r }, svgEl('title', {}, 'Done')));

  for (const gate of L.gates) {
    const gr = activate(svgEl('g', { class: `rm-gate${gate.off ? ' off' : ''}` }), gate.stepId, `Decision: ${gate.text}`);
    gr.append(svgEl('title', {}, `Decision: ${gate.text}`));
    gr.append(svgEl('path', { class: 'rm-label-leader', d: `M${gate.x},${gate.y - gate.half - 2} V${L.mainY - g.h / 2 - 12}` }));
    gr.append(svgEl('path', { class: 'rm-diamond', d: `M${gate.x},${gate.y - gate.half} L${gate.x + gate.half},${gate.y} L${gate.x},${gate.y + gate.half} L${gate.x - gate.half},${gate.y} Z` }));
    gr.append(svgEl('path', { class: 'rm-x', d: `M${gate.x - 7},${gate.y - 7} L${gate.x + 7},${gate.y + 7} M${gate.x + 7},${gate.y - 7} L${gate.x - 7},${gate.y + 7}` }));
    const top = L.mainY - g.h / 2 - 14 - gate.lines.length * 16 - 14;
    gr.append(text({ class: 'rm-small', x: gate.x, y: top, 'text-anchor': 'middle' }, 'DECISION'));
    gr.append(text({ class: 'rm-decision', x: gate.x, y: top + 16, lh: 16, 'text-anchor': 'middle' }, ...gate.lines));
    svg.append(gr);
  }

  for (const n of L.nodes) {
    const st = status[n.id];
    const stLabel = { now: ' (you are here)', done: ' (done)', wrong: ' (needs practice)' }[st] ?? '';
    const gr = activate(svgEl('g', { class: `rm-task${n.off ? ' off' : ''}${st ? ` st-${st}` : ''}` }), n.id, `Step ${n.index + 1}: ${n.title}${stLabel}${n.off ? ' (switched off)' : ''}`);
    gr.append(svgEl('title', {}, n.title));
    gr.append(svgEl('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 12 }));
    gr.append(svgEl('rect', { class: 'rm-here', x: n.x - 7, y: n.y - 7, width: n.w + 14, height: n.h + 14, rx: 17 }));
    const ty = n.y + n.h / 2 - (n.lines.length - 1) * 9 - (n.time ? 5 : 0) + 5;
    gr.append(text({ class: 'rm-title', x: n.x + n.w / 2, y: ty, lh: 18, 'text-anchor': 'middle' }, ...n.lines));
    if (n.time) gr.append(text({ class: 'rm-time', x: n.x + n.w / 2, y: n.y + n.h - 10, 'text-anchor': 'middle' }, n.time));
    gr.append(svgEl('circle', { class: 'rm-num-dot', cx: n.x + 2, cy: n.y + 2, r: 13 }));
    gr.append(text({ class: 'rm-num', x: n.x + 2, y: n.y + 7, 'text-anchor': 'middle' }, st === 'done' ? '✓' : st === 'wrong' ? '!' : String(n.index + 1)));
    if (n.custom) {
      gr.append(svgEl('rect', { class: 'rm-yours', x: n.x + n.w - 46, y: n.y - 9, width: 46, height: 18, rx: 9 }));
      gr.append(text({ class: 'rm-yours-t', x: n.x + n.w - 23, y: n.y + 4, 'text-anchor': 'middle' }, 'yours'));
    }
    svg.append(gr);
  }

  for (const b of L.branches) {
    const k = KIND[b.kind] ?? { name: b.kind, glyph: '·' };
    const gr = activate(svgEl('g', { class: `rm-pill k-${b.kind}${b.off ? ' off' : ''}` }), b.stepId, `${k.name}: ${b.rule}${b.off ? ' (switched off)' : ''}`);
    const px = b.x + g.w / 2 - g.pillW / 2;
    gr.append(svgEl('title', {}, `${k.name}: ${b.rule}`));
    gr.append(svgEl('rect', { x: px, y: b.y - g.pillH / 2, width: g.pillW, height: g.pillH, rx: 12 }));
    gr.append(svgEl('circle', { class: 'rm-glyph-dot', cx: px + 17, cy: b.y - g.pillH / 2 + 17, r: 9 }));
    if (k.glyph) gr.append(text({ class: 'rm-glyph', x: px + 17, y: b.y - g.pillH / 2 + 21.5, 'text-anchor': 'middle' }, k.glyph));
    else gr.append(svgEl('path', { class: 'rm-glyph-bar', d: `M${px + 12},${b.y - g.pillH / 2 + 17} H${px + 20} M${px + 21},${b.y - g.pillH / 2 + 12} V${b.y - g.pillH / 2 + 22}` })); // a bar against a wall: a limit
    gr.append(text({ class: 'rm-small', x: px + 32, y: b.y - g.pillH / 2 + 21 }, k.name.toUpperCase() + (b.custom ? ' · YOURS' : '')));
    gr.append(text({ class: 'rm-rule', x: px + 12, y: b.y - g.pillH / 2 + 42, lh: 15 }, ...b.lines));
    svg.append(gr);
  }

  highlightStep(svg, selected);
  return svg;
}

// Marks every shape of one step (task, gateway, guardrail branches) as selected; null clears it.
export function highlightStep(svg, stepId) {
  for (const n of svg.querySelectorAll('[data-step]')) n.classList.toggle('selected', stepId !== null && n.dataset.step === stepId);
}

// ------------------------------------------------------------------------------------------------ mini route

export const MINI = { w: 360, margin: 16, y: 16, r: 7, branchStep: 10 };

// Dots on one line, a small diamond between two steps when the first holds a decision, and a short stub with a dot
// under a step for each guardrail. Fits any number of steps into MINI.w; the SVG scales to its container.
export function layoutMiniRoute(steps = []) {
  const m = MINI, n = steps.length;
  const span = m.w - 2 * m.margin, gap = n > 1 ? span / (n - 1) : 0;
  const nodes = steps.map((s, i) => ({
    id: s.id, x: n > 1 ? m.margin + i * gap : m.w / 2, y: m.y,
    gate: s.decision && gap >= 24 ? { x: (n > 1 ? m.margin + i * gap : m.w / 2) + gap / 2, y: m.y } : null,
    branches: (s.guardrails ?? []).slice(0, 3).map((g, k) => ({ kind: g.kind, y: m.y + 18 + k * m.branchStep, off: !!(s.off || g.off) })),
  }));
  const rows = Math.min(3, Math.max(0, ...steps.map((s) => (s.guardrails ?? []).length)));
  return { width: m.w, height: m.y + (rows ? 18 + (rows - 1) * m.branchStep + 9 : 9) + 5, nodes, from: nodes[0]?.x ?? m.margin, to: nodes.at(-1)?.x ?? m.w - m.margin };
}

export function renderMiniRoute(steps, { status = {} } = {}) {
  const L = layoutMiniRoute(steps), m = MINI;
  const svg = svgEl('svg', { class: 'rm-mini', viewBox: `0 0 ${L.width} ${L.height}`, 'aria-hidden': 'true' });
  svg.append(svgEl('line', { class: 'm-line', x1: L.from, y1: m.y, x2: L.to, y2: m.y }));
  for (const n of L.nodes) {
    for (const b of n.branches) {
      svg.append(svgEl('g', { class: `k-${b.kind}${b.off ? ' off' : ''}` },
        svgEl('path', { class: 'm-branch', d: `M${n.x},${m.y + m.r} V${b.y}` }),
        b.kind === 'stop_and_ask' ? svgEl('rect', { class: 'm-dot', x: n.x - 3.5, y: b.y - 3.5, width: 7, height: 7, rx: 1 }) : svgEl('circle', { class: 'm-dot', cx: n.x, cy: b.y, r: 3.5 })));
    }
    if (n.gate) svg.append(svgEl('path', { class: 'm-gate', d: `M${n.gate.x},${m.y - 5} L${n.gate.x + 5},${m.y} L${n.gate.x},${m.y + 5} L${n.gate.x - 5},${m.y} Z` }));
  }
  for (const n of L.nodes) {
    const st = status[n.id];
    if (st === 'now') svg.append(svgEl('circle', { class: 'm-ring', cx: n.x, cy: m.y, r: m.r + 5 }));
    svg.append(svgEl('circle', { class: `m-step${st ? ` st-${st}` : ''}`, cx: n.x, cy: m.y, r: m.r }));
  }
  return svg;
}
