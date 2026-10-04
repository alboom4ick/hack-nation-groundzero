// Turns the task-level action tree (nodes with `parents` and optional per-parent `conditions`)
// into a BPMN-style graph: start/end events, userTasks, exclusive/parallel gateways and flows.
// Gateways are derived, never trusted from the model: a task with several children becomes an
// XOR split when its outgoing edges carry conditions and an AND split otherwise; a task with
// several parents gets a merge, XOR when the incoming paths come from different branches of one
// decision and AND (join) when they are parallel. No DOM.

export const SCHEMA = 'groundzero.bpmn-action-tree/1';
export const TASK_STATES = ['pending', 'ready', 'active', 'completed', 'failed', 'blocked', 'skipped'];

// "bottle_empty == true", "state != open", ... Anything else from the model is dropped.
export const CONDITION_RE = /^[A-Za-z_]\w*\s*(==|!=)\s*(true|false|"[^"]{1,40}"|[\w.-]{1,40})$/;
export const conditionVariable = (expr) => expr?.match(/^[A-Za-z_]\w*/)?.[0] ?? null;

// Pure restructuring: returns [{ id, source, target, condition?, default? }] over task ids plus
// 'start' / 'end', and the gateways inserted. Exposed separately so layout and export share it.
export function buildGraph(tasks) {
  const ids = new Set(tasks.map((t) => t.id));
  const edges = [];
  for (const t of tasks) {
    const parents = (t.parents ?? []).filter((p) => ids.has(p));
    if (!parents.length) edges.push({ source: 'start', target: t.id });
    for (const p of parents) edges.push({ source: p, target: t.id, condition: t.conditions?.[p] });
  }
  for (const t of tasks) if (!edges.some((e) => e.source === t.id)) edges.push({ source: t.id, target: 'end' });

  const outs = (id) => edges.filter((e) => e.source === id);
  const ins = (id) => edges.filter((e) => e.target === id);

  // A lone outgoing edge is not a decision, so its condition means nothing.
  for (const e of edges) if (outs(e.source).length < 2) delete e.condition;

  // Which branch of which decision each edge sits on (memoised, graph is acyclic).
  const nodeMemo = new Map();
  const nodeBranches = (id) => {
    if (nodeMemo.has(id)) return nodeMemo.get(id);
    const set = new Set();
    nodeMemo.set(id, set);
    for (const e of ins(id)) for (const b of edgeBranches(e)) set.add(b);
    return set;
  };
  const edgeBranches = (e) => {
    const set = new Set(nodeBranches(e.source));
    if (e.condition) set.add(`${e.source}\u0000${e.condition}`);
    return set;
  };
  const conditionsAt = (set, split) => new Set([...set].filter((b) => b.startsWith(`${split}\u0000`)));
  const exclusive = (a, b) => {
    const splits = new Set([...a].map((x) => x.split('\u0000')[0]));
    for (const s of splits) {
      const ca = conditionsAt(a, s);
      const cb = conditionsAt(b, s);
      if (ca.size && cb.size && ![...ca].some((c) => cb.has(c))) return true;
    }
    return false;
  };

  const gateways = new Map(); // key `split:<id>` / `merge:<id>` -> gateway
  let g = 0;
  const addGateway = (key, kind, extra) => gateways.set(key, { id: `g${++g}`, kind, ...extra });
  const order = ['start', ...tasks.map((t) => t.id), 'end'];

  for (const id of order) {
    const incoming = ins(id);
    if (incoming.length > 1) {
      const sets = incoming.map(edgeBranches);
      const xor = sets.some((a, i) => sets.some((b, j) => i < j && exclusive(a, b)));
      addGateway(`merge:${id}`, xor ? 'XOR_MERGE' : 'AND_MERGE', { for: id });
    }
    const outgoing = outs(id);
    if (outgoing.length > 1) {
      const conditional = outgoing.some((e) => e.condition);
      if (conditional) for (const e of outgoing) if (!e.condition) e.default = true;
      addGateway(`split:${id}`, conditional ? 'XOR' : 'AND', {
        for: id,
        variable: conditional ? conditionVariable(outgoing.find((e) => e.condition).condition) : null,
      });
    }
  }
  const mergeOf = (id) => gateways.get(`merge:${id}`)?.id ?? id;
  const splitOf = (id) => gateways.get(`split:${id}`)?.id ?? id;

  const flows = [];
  const flow = (source, target, extra = {}) => flows.push({ id: `f${flows.length + 1}`, source, target, ...extra });
  for (const [key, gw] of gateways) {
    if (key.startsWith('split:')) flow(gw.for, gw.id);
  }
  for (const e of edges) {
    flow(splitOf(e.source), mergeOf(e.target), {
      ...(e.condition ? { condition: { expression: e.condition } } : {}),
      ...(e.default ? { default: true } : {}),
    });
  }
  for (const [key, gw] of gateways) if (key.startsWith('merge:')) flow(gw.id, gw.for);
  return { flows, gateways: [...gateways.values()] };
}

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'process';
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function toBpmn(tasks, { name = 'process', version = '0.1' } = {}) {
  const { flows, gateways } = buildGraph(tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const gwBySplit = new Map(gateways.filter((g) => g.kind === 'XOR' || g.kind === 'AND').map((g) => [g.for, g]));
  const gwById = new Map(gateways.map((g) => [g.id, g]));
  const taskName = (id) => ({ start: 'Start', end: 'Done' })[id] ?? (byId.get(id)?.name || id);

  const parentsOf = (id) => flows.filter((f) => f.target === id).map((f) => f.source);

  // Tasks reachable from `start` through parallel gateways only can begin immediately.
  const ready = new Set();
  const walk = (id) => {
    for (const f of flows.filter((x) => x.source === id)) {
      if (byId.has(f.target)) ready.add(f.target);
      else if (gwById.get(f.target)?.kind === 'AND') walk(f.target);
    }
  };
  walk('start');

  const gatewayNode = (g) => {
    const xor = g.kind.startsWith('XOR');
    const split = g.kind === 'XOR' || g.kind === 'AND';
    const task = byId.get(g.for);
    const label = split
      ? (xor ? task?.decision?.question || `Decision after ${taskName(g.for)}` : `Parallel split after ${taskName(g.for)}`)
      : `${xor ? 'Merge' : 'Join'} before ${taskName(g.for)}`;
    return {
      id: g.id,
      bpmn_type: xor ? 'exclusiveGateway' : 'parallelGateway',
      name: clip(label, 80),
      gateway: { type: g.kind, ...(g.variable ? { decision_variable: g.variable } : {}) },
    };
  };

  const taskNode = (t) => {
    const parents = parentsOf(t.id);
    const viaSplit = parents.map((p) => gwById.get(p)).find((g) => g && (g.kind === 'XOR' || g.kind === 'AND'));
    const slots = Object.fromEntries(Object.entries(t.slots ?? {}).filter(([, v]) => v));
    return {
      id: t.id,
      bpmn_type: 'userTask',
      name: t.name || clip(t.contribution || t.description, 60),
      description: t.description,
      state: ready.has(t.id) ? 'ready' : 'pending',
      lineage: {
        parents,
        rationale: t.rationale ?? '',
        ...(viaSplit ? { split_from: viaSplit.id } : {}),
        ...(t.split_from ? { refined_from: t.split_from } : {}),
        ...(t.uncertain ? { uncertain: true } : {}),
      },
      slots,
      ...(t.ar ? { ar: t.ar } : {}),
      expert_answers: t.answers ?? [],
      video_segment: t.video_segment,
    };
  };

  const nodes = [{ id: 'start', bpmn_type: 'startEvent', name: 'Start', state: 'completed' }];
  for (const t of tasks) {
    const merge = gateways.find((g) => g.kind.endsWith('MERGE') && g.for === t.id);
    if (merge) nodes.push(gatewayNode(merge));
    nodes.push(taskNode(t));
    if (gwBySplit.has(t.id)) nodes.push(gatewayNode(gwBySplit.get(t.id)));
  }
  const startSplit = gwBySplit.get('start');
  if (startSplit) nodes.splice(1, 0, gatewayNode(startSplit));
  const endMerge = gateways.find((g) => g.kind.endsWith('MERGE') && g.for === 'end');
  if (endMerge) nodes.push(gatewayNode(endMerge));
  nodes.push({ id: 'end', bpmn_type: 'endEvent', name: 'Done', state: 'pending' });

  // Flows read best in node order; ids are assigned only now.
  const pos = new Map(nodes.map((n, i) => [n.id, i]));
  const ordered = [...flows].sort((a, b) => pos.get(a.source) - pos.get(b.source) || pos.get(a.target) - pos.get(b.target))
    .map((f, i) => ({ ...f, id: `f${i + 1}` }));

  const variables = Object.fromEntries(gateways.filter((g) => g.variable).map((g) => [g.variable, null]));
  const first = tasks.find((t) => ready.has(t.id));
  return {
    schema: SCHEMA,
    process: { id: slug(name), name, version },
    state_model: { task_states: TASK_STATES },
    nodes,
    flows: ordered,
    runtime: { current_node: first?.id ?? 'start', variables },
  };
}

// Adapter for tree.js depths(): every node with the ids that flow into it.
export const layoutNodes = (bpmn) => bpmn.nodes.map((n) => ({
  id: n.id,
  parents: bpmn.flows.filter((f) => f.target === n.id).map((f) => f.source),
}));
