// Segment tree: the captured session as a hierarchy. Session > step (once a Work Map exists) > segment >
// question > answer. Pure builder (no DOM) plus a small renderer; the renderer only uses textContent.

const KIND_LABEL = { guardrail: 'guardrail', branch: 'decision' };
const nodeId = (s) => `n${s.id + 1}`; // the id a segment has in the Work Map's screen_moment.nodes

const questionNodes = (s, currentQ) => (s.result?.questions ?? []).map((q, i) => ({
  key: `q${i}`, kind: 'question', label: q.text,
  meta: `${KIND_LABEL[q.kind] ?? 'detail'} · ${(s.frameTimes?.[q.frame] ?? s.tStart).toFixed(1)} s`,
  t: s.frameTimes?.[q.frame] ?? s.tStart, current: q === currentQ,
  children: q.answer ? [{ key: 'a', kind: 'answer', label: q.answer, children: [] }] : [],
}));

const segmentNode = (s, currentQ) => {
  const questions = questionNodes(s, currentQ);
  const open = (s.result?.questions ?? []).filter((q) => !q.answer).length;
  return {
    key: `seg${s.id}`, kind: 'segment', label: `Segment ${s.id + 1}`,
    meta: `${s.tStart.toFixed(1)}–${s.tEnd.toFixed(1)} s${open ? ` · ${open} open question${open === 1 ? '' : 's'}` : ''}`,
    text: s.result?.description ?? 'Not described yet', t: s.tStart,
    defaultOpen: !!s.open || questions.some((q) => q.current),
    children: questions,
  };
};

// steps: Work Map steps ({ id, title, screen_moment: { t, t_end, nodes } }); empty before the map is built.
export function buildSegmentTree({ name = 'Capture', segments = [], steps = [], currentQ = null } = {}) {
  const root = { key: 'session', kind: 'session', label: name, meta: `${segments.length} segment${segments.length === 1 ? '' : 's'}`, defaultOpen: true, children: [] };
  if (!steps.length) { root.children = segments.map((s) => segmentNode(s, currentQ)); return root; }

  const byNode = new Map(segments.map((s) => [nodeId(s), s]));
  const placed = new Set();
  for (const st of steps) {
    const own = (st.screen_moment?.nodes ?? []).map((id) => byNode.get(id)).filter(Boolean);
    own.forEach((s) => placed.add(s));
    root.children.push({
      key: `step${st.id}`, kind: 'step', label: st.title, meta: `step ${st.id?.replace(/^s/, '')} · ${own.length} segment${own.length === 1 ? '' : 's'}`,
      t: st.screen_moment?.t, defaultOpen: true, children: own.map((s) => segmentNode(s, currentQ)),
    });
  }
  const rest = segments.filter((s) => !placed.has(s));
  if (rest.length) root.children.push({ key: 'unplaced', kind: 'step', label: 'Not in a step', meta: `${rest.length} segment${rest.length === 1 ? '' : 's'}`, defaultOpen: false, children: rest.map((s) => segmentNode(s, currentQ)) });
  return root;
}

// -> an <ul role="tree">. isOpen(path, defaultOpen) / setOpen(path, open) keep the expand state outside;
// onSeek(seconds) is called when a segment, step or question is clicked.
export function renderSegmentTree(tree, { isOpen, setOpen, onSeek }) {
  const make = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });

  const item = (node, path, level) => {
    const li = make('li', `tnode kind-${node.kind}${node.current ? ' current' : ''}`);
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-level', String(level));
    const row = make('div', 'trow');
    const expandable = node.children.length > 0;
    const open = expandable && isOpen(path, !!node.defaultOpen);
    if (expandable) {
      li.setAttribute('aria-expanded', String(open));
      const twist = make('button', 'twist', open ? '▾' : '▸');
      twist.type = 'button';
      twist.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${node.label}`);
      twist.addEventListener('click', () => setOpen(path, !open));
      row.append(twist);
    } else row.append(make('span', 'twist spacer'));

    const label = make('button', 'lbl', node.label);
    label.type = 'button';
    if (Number.isFinite(node.t)) label.addEventListener('click', () => onSeek(node.t));
    else label.disabled = true;
    row.append(label);
    if (node.meta) row.append(make('span', 'tmeta', node.meta));
    li.append(row);
    if (node.text) li.append(make('div', 'ttext', node.text));

    if (open) {
      const group = make('ul');
      group.setAttribute('role', 'group');
      for (const c of node.children) group.append(item(c, `${path}/${c.key}`, level + 1));
      li.append(group);
    }
    return li;
  };

  const ul = make('ul', 'tree');
  ul.setAttribute('role', 'tree');
  ul.setAttribute('aria-label', 'Captured segments as a tree');
  ul.append(item(tree, tree.key, 1));
  return ul;
}
