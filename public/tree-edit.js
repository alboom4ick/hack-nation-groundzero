// Customizing an action tree (a Work Map) for one's own use case. Pure, no DOM: every function takes a draft and
// returns a new draft. A draft is a Work Map whose steps and guardrails may carry `off: true` (kept in the editor
// so it can be switched back on); `finalMap` drops them so what leaves the editor is a plain Work Map.
import { GUARDRAIL_KINDS, readWorkMap } from './workmap.js';

export const SCHEMA_CUSTOM = 'groundzero.custom-tree/1';
const clone = (v) => JSON.parse(JSON.stringify(v));
const onStep = (d, id, fn) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? fn(s) : s)) });
const text = (v, max) => String(v ?? '').trim().slice(0, max);

export function startDraft(map, { baseId, name } = {}) {
  const m = clone(readWorkMap(map));
  return { ...m, sample: false, process: { ...m.process, name: name ?? `${m.process?.name ?? 'Action tree'} (my version)` }, base: { id: baseId ?? null, name: map.process?.name ?? null } };
}

export const setProcessName = (d, name) => ({ ...d, process: { ...d.process, name: text(name, 120) || d.process.name } });
export const renameStep = (d, id, title) => onStep(d, id, (s) => ({ ...s, title: text(title, 120) || s.title }));
export const setDecision = (d, id, decision) => onStep(d, id, (s) => ({ ...s, decision: text(decision, 300) || null }));
export const toggleStep = (d, id) => onStep(d, id, (s) => ({ ...s, off: !s.off }));

export function moveStep(d, id, dir) {
  const i = d.steps.findIndex((s) => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= d.steps.length) return d;
  const steps = d.steps.slice();
  [steps[i], steps[j]] = [steps[j], steps[i]];
  return { ...d, steps };
}

export function addStep(d, title) {
  const n = 1 + Math.max(0, ...d.steps.map((s) => Number(String(s.id).replace(/^s/, '')) || 0));
  const t = d.steps.length ? (d.steps.at(-1).screen_moment.t_end ?? d.steps.at(-1).screen_moment.t) : 0;
  const step = { id: `s${n}`, title: text(title, 120) || 'New step', screen_moment: { t, t_end: t, nodes: [] }, decision: null, reason: null, needs_reason: false, guardrails: [], custom: true };
  return { ...d, steps: [...d.steps, step] };
}

export function addGuardrail(d, id, kind, rule) {
  if (!GUARDRAIL_KINDS.includes(kind) || !text(rule, 300)) return d;
  return onStep(d, id, (s) => ({ ...s, guardrails: [...s.guardrails, { kind, rule: text(rule, 300), words: '', source: 'custom' }] }));
}
export const editGuardrail = (d, id, i, patch) => onStep(d, id, (s) => ({
  ...s, guardrails: s.guardrails.map((g, k) => (k !== i ? g : {
    ...g,
    ...(GUARDRAIL_KINDS.includes(patch.kind) ? { kind: patch.kind } : {}),
    ...(text(patch.rule, 300) ? { rule: text(patch.rule, 300) } : {}),
  })),
}));
export const toggleGuardrail = (d, id, i) => onStep(d, id, (s) => ({ ...s, guardrails: s.guardrails.map((g, k) => (k === i ? { ...g, off: !g.off } : g)) }));
export const removeGuardrail = (d, id, i) => onStep(d, id, (s) => ({ ...s, guardrails: s.guardrails.filter((_, k) => k !== i) }));
export const removeStep = (d, id) => ({ ...d, steps: d.steps.filter((s) => s.id !== id) });

// What changed against the tree it started from, for the "my version" summary.
export function summarize(d) {
  const steps = d.steps, rails = steps.flatMap((s) => s.guardrails);
  return { steps: steps.filter((s) => !s.off).length, stepsOff: steps.filter((s) => s.off).length, guardrails: rails.filter((g) => !g.off).length, guardrailsOff: rails.filter((g) => g.off).length, added: steps.filter((s) => s.custom).length + rails.filter((g) => g.source === 'custom').length };
}

// A plain Work Map: switched-off branches dropped, editor flags removed. Throws if nothing is left.
export function finalMap(d) {
  const steps = d.steps.filter((s) => !s.off).map(({ off: _o, custom: _c, ...s }) => ({ ...s, guardrails: s.guardrails.filter((g) => !g.off).map(({ off: _g, ...g }) => g) }));
  const { base, ...rest } = d;
  return readWorkMap({ ...rest, steps, customized_from: base ?? null, generated_at: new Date().toISOString() });
}
