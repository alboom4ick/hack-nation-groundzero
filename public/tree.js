// Action-tree helpers shared by the browser and the server: lineage sanitising,
// DAG validation, layout depth, and the exported JSON shape. No DOM.

// LLM output is untrusted: keep only parents that exist and come earlier in time.
// Forward/self/unknown references are dropped, which also makes cycles impossible.
export function sanitizeLineage(proposed, nodes) {
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const byId = new Map((proposed ?? []).map((p) => [p?.id, p]));
  const dropped = [];
  const out = nodes.map((n) => {
    const p = byId.get(n.id) ?? {};
    const parents = [];
    for (const parent of Array.isArray(p.parents) ? p.parents : []) {
      if (!order.has(parent) || order.get(parent) >= order.get(n.id)) dropped.push({ id: n.id, parent });
      else if (!parents.includes(parent)) parents.push(parent);
    }
    return {
      id: n.id,
      contribution: typeof p.contribution === 'string' ? p.contribution.trim() : '',
      parents,
      rationale: typeof p.rationale === 'string' ? p.rationale.trim() : '',
      uncertain: p.uncertain === true,
      question: typeof p.question === 'string' && p.question.trim() ? p.question.trim() : null,
    };
  });
  return { lineage: out, dropped };
}

export function isDag(nodes) {
  const parents = new Map(nodes.map((n) => [n.id, n.parents]));
  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === 1) return false;
    if (state.get(id) === 2) return true;
    state.set(id, 1);
    for (const p of parents.get(id) ?? []) if (parents.has(p) && !visit(p)) return false;
    state.set(id, 2);
    return true;
  };
  return nodes.every((n) => visit(n.id));
}

// Column index = longest path from a root, so every edge points left to right.
export function depths(nodes) {
  const d = new Map();
  const get = (id) => {
    if (d.has(id)) return d.get(id);
    const n = nodes.find((x) => x.id === id);
    const v = n?.parents.length ? 1 + Math.max(...n.parents.map(get)) : 0;
    d.set(id, v);
    return v;
  };
  nodes.forEach((n) => get(n.id));
  return d;
}

// Replaces node `id` with a chain id.1 -> id.2 -> ... built from `parts` ([{description, contribution?}]).
// The first part keeps the node's parents, answers and slots; every child that depended on the node now
// depends on the last part (the one whose result it needed). The node's time range is divided evenly.
// Returns a new array in the same chronological position; throws on invalid input.
export function splitNode(nodes, id, parts) {
  const i = nodes.findIndex((n) => n.id === id);
  if (i < 0) throw new Error(`unknown node ${id}`);
  if (!Array.isArray(parts) || parts.length < 2) throw new Error('a split needs at least 2 parts');
  const clean = parts.map((p) => ({ description: String(p?.description ?? '').trim(), contribution: String(p?.contribution ?? '').trim() }));
  if (clean.some((p) => !p.description)) throw new Error('every part needs a description');
  const ids = clean.map((_, k) => `${id}.${k + 1}`);
  if (ids.some((x) => nodes.some((n) => n.id === x))) throw new Error(`${id} was already split`);

  const base = nodes[i];
  const { t_start, t_end } = base.video_segment;
  const step = (t_end - t_start) / clean.length;
  const emptySlots = Object.fromEntries(Object.keys(base.slots ?? {}).map((k) => [k, null]));
  const made = clean.map((p, k) => ({
    ...base,
    id: ids[k],
    description: p.description,
    contribution: p.contribution || base.contribution,
    parents: k === 0 ? [...base.parents] : [ids[k - 1]],
    rationale: k === 0 ? base.rationale : `follows ${ids[k - 1]}; split from ${id}`,
    uncertain: k === 0 ? base.uncertain : false,
    question: k === 0 ? base.question ?? null : null,
    slots: k === 0 ? base.slots : { ...emptySlots },
    answers: k === 0 ? base.answers : [],
    video_segment: { ...base.video_segment, t_start: +(t_start + step * k).toFixed(2), t_end: +(t_start + step * (k + 1)).toFixed(2) },
    split_from: id,
  }));

  const last = ids.at(-1);
  const rest = nodes.filter((_, j) => j !== i).map((n) => (
    n.parents.includes(id) ? { ...n, parents: [...new Set(n.parents.map((p) => (p === id ? last : p)))] } : n
  ));
  const out = [...rest.slice(0, i), ...made, ...rest.slice(i)];
  if (!isDag(out)) throw new Error('split would create a cycle');
  return out;
}

export function toExport({ video, nodes }) {
  return {
    schema: 'groundzero.action-tree/1',
    generated_at: new Date().toISOString(),
    video,
    nodes: nodes.map((n) => ({
      id: n.id,
      description: n.description,
      contribution: n.contribution,
      lineage: { parents: n.parents, rationale: n.rationale, uncertain: n.uncertain },
      slots: n.slots,
      expert_answers: n.answers,
      video_segment: n.video_segment,
      split_from: n.split_from ?? null,
    })),
  };
}
