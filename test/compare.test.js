import test from 'node:test';
import assert from 'node:assert/strict';
import { compareWorkMaps, alignSteps } from '../public/compare.js';

const g = (kind, rule) => ({ kind, rule, words: rule });
const A = { steps: [
  { id: 's1', title: 'Open the next invoice', decision: null, guardrails: [] },
  { id: 's2', title: 'Code invoice to cost center', decision: 'Re-code from opex to capex', guardrails: [g('limit', 'Equipment over 5,000 EUR is capex'), g('stop_and_ask', 'No asset number: ask controller')] },
  { id: 's3', title: 'Post the invoice', decision: null, guardrails: [] },
] };
const B = { steps: [
  { id: 's1', title: 'Open next invoice', decision: null, guardrails: [] },
  { id: 's2', title: 'Code invoice to cost center', decision: 'Keep opex unless a manager says capex', guardrails: [g('limit', 'Equipment over 5,000 EUR is capex')] },
  { id: 's3', title: 'Check supplier risk list', decision: 'Hold risky suppliers', guardrails: [] },
] };

test('S1: steps are aligned by title and decision words', () => {
  const al = alignSteps(A.steps, B.steps);
  assert.deepEqual(al.matched, [[0, 0], [1, 1]]);
  assert.deepEqual([al.onlyA, al.onlyB], [[2], [2]]);
});

test('S1: differing decisions, one-sided guardrails and steps come with a why-question for each expert', () => {
  const { differences, questions } = compareWorkMaps(A, B, { nameA: 'Anna', nameB: 'Ben' });
  const kinds = differences.map((d) => d.kind);
  assert.ok(kinds.includes('decision'));
  assert.ok(differences.some((d) => d.kind === 'guardrail' && /Only Anna/.test(d.detail) && /asset number/.test(d.detail)));
  assert.ok(differences.some((d) => d.kind === 'step' && /Only Ben/.test(d.detail)));
  assert.ok(questions.some((q) => q.to === 'a' && /Ben decides/.test(q.question)));
  assert.ok(questions.some((q) => q.to === 'b' && /asset number/.test(q.question)));
});

test('S1: identical maps have no differences', () => {
  assert.deepEqual(compareWorkMaps(A, A).differences, []);
});
