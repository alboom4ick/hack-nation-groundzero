import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAgentInstructions, toAgentMarkdown, SCHEMA } from '../public/agent-export.js';

const map = {
  process: { name: 'Invoices' },
  steps: [
    { id: 's1', title: 'Open invoice', decision: null, reason: null, guardrails: [], screen_moment: { t: 3 } },
    { id: 's2', title: 'Code to cost center', decision: 'Re-code to capex', reason: { words: 'Equipment over 5,000 euro is always capex.' }, screen_moment: { t: 12 },
      guardrails: [{ kind: 'limit', rule: 'Over 5,000 EUR is capex', words: 'over 5,000 euro' }, { kind: 'stop_and_ask', rule: 'No asset number: ask the controller', words: 'I ask the controller first' }] },
  ],
};

test('instructions keep order, decisions, quotes and stop conditions', () => {
  const doc = toAgentInstructions(map);
  assert.equal(doc.schema, SCHEMA);
  assert.deepEqual(doc.steps.map((s) => s.n), [1, 2]);
  assert.equal(doc.steps[1].because, 'Equipment over 5,000 euro is always capex.');
  assert.deepEqual(doc.steps[1].stop_and_ask, ['No asset number: ask the controller']);
  assert.deepEqual(doc.steps[0].stop_and_ask, []);
});

test('markdown lists every step and guardrail', () => {
  const md = toAgentMarkdown(map);
  assert.match(md, /## Step 2: Code to cost center/);
  assert.match(md, /STOP AND ASK: No asset number/);
});
