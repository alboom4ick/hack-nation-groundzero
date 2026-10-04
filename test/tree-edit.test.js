import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startDraft, renameStep, toggleStep, moveStep, addStep, addGuardrail, editGuardrail, toggleGuardrail, removeGuardrail, finalMap, summarize } from '../public/tree-edit.js';

const sample = JSON.parse(readFileSync(new URL('../public/workmaps/invoice_demo.json', import.meta.url), 'utf8'));
const draft = () => startDraft(sample, { baseId: 'invoice_demo' });

test('startDraft copies the map and records where it came from', () => {
  const d = draft();
  assert.equal(d.base.id, 'invoice_demo');
  assert.match(d.process.name, /my version/);
  assert.equal(sample.process.name.includes('my version'), false);
});

test('edits return new drafts and leave the old one alone', () => {
  const d = draft();
  const e = renameStep(d, 's1', 'Pick the oldest invoice');
  assert.equal(e.steps[0].title, 'Pick the oldest invoice');
  assert.notEqual(d.steps[0].title, e.steps[0].title);
  assert.equal(renameStep(d, 's1', '  ').steps[0].title, d.steps[0].title);
});

test('switched-off steps and guardrails are dropped from the final map', () => {
  let d = toggleStep(draft(), 's1');
  const withRail = d.steps.find((s) => s.guardrails.length);
  d = toggleGuardrail(d, withRail.id, 0);
  const m = finalMap(d);
  assert.equal(m.steps.some((s) => s.id === 's1'), false);
  assert.equal(m.steps.find((s) => s.id === withRail.id).guardrails.length, withRail.guardrails.length - 1);
  assert.equal(m.customized_from.id, 'invoice_demo');
  assert.deepEqual(summarize(d), { ...summarize(d), stepsOff: 1, guardrailsOff: 1 });
});

test('a step and a guardrail of my own make a valid Work Map', () => {
  let d = addStep(draft(), 'Notify the buyer');
  const id = d.steps.at(-1).id;
  d = addGuardrail(d, id, 'stop_and_ask', 'Ask the buyer before sending it back');
  assert.equal(addGuardrail(d, id, 'nonsense', 'x'), d);
  const m = finalMap(d);
  assert.equal(m.steps.at(-1).guardrails[0].source, 'custom');
  assert.equal(m.steps.at(-1).custom, undefined);
  assert.equal(new Set(m.steps.map((s) => s.id)).size, m.steps.length);
});

test('moveStep swaps neighbours and stops at the ends', () => {
  const d = draft();
  assert.equal(moveStep(d, 's1', -1), d);
  assert.deepEqual(moveStep(d, 's1', 1).steps.slice(0, 2).map((s) => s.id), ['s2', 's1']);
});

test('editing and removing a guardrail', () => {
  const d = draft();
  const s = d.steps.find((x) => x.guardrails.length);
  const e = editGuardrail(d, s.id, 0, { kind: 'limit', rule: 'New rule' });
  const g = e.steps.find((x) => x.id === s.id).guardrails[0];
  assert.equal(g.kind, 'limit');
  assert.equal(g.rule, 'New rule');
  assert.equal(removeGuardrail(e, s.id, 0).steps.find((x) => x.id === s.id).guardrails.length, s.guardrails.length - 1);
});

test('finalMap throws when every step is switched off', () => {
  let d = draft();
  for (const s of d.steps) d = toggleStep(d, s.id);
  assert.throws(() => finalMap(d), /no steps/);
});
