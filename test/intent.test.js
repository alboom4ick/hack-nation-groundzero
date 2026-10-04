import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntentGate, attachIntents, intentAnswer, INTENT_QUESTION } from '../public/intent.js';
import { sanitizeWorkMap } from '../public/workmap.js';
import { toAgentInstructions, toAgentMarkdown } from '../public/agent-export.js';

const still = { screenActive: false, voiceActive: false, idleFor: 3 };

test('intent gate asks only at a pause, after something happened, and not too often', () => {
  const g = createIntentGate({ firstSec: 5, gapSec: 20 });
  assert.equal(g.shouldAsk({ t: 2, ...still }), false, 'too early');
  assert.equal(g.shouldAsk({ t: 10, ...still, screenActive: true }), false, 'screen busy');
  assert.equal(g.shouldAsk({ t: 10, ...still, voiceActive: true }), false, 'person talking');
  assert.equal(g.shouldAsk({ t: 10, ...still }), true);
  g.began(10); g.ended(14);
  g.moved();
  assert.equal(g.shouldAsk({ t: 20, ...still }), false, 'gap not over');
  assert.equal(g.shouldAsk({ t: 40, ...still }), true);
  g.began(40); g.ended(44);
  assert.equal(g.shouldAsk({ t: 80, ...still }), false, 'nothing moved since the last turn');
});

test('an intent attaches to the step that follows it', () => {
  const segs = [{ id: 0, tStart: 2, tEnd: 8 }, { id: 1, tStart: 14, tEnd: 20 }];
  const by = attachIntents(segs, [{ t: 11, answer: 'choosing the yellow bottle' }, { t: 30, answer: 'done' }]);
  assert.deepEqual(by.get(0), []);
  assert.deepEqual(by.get(1).map((i) => i.answer), ['choosing the yellow bottle', 'done']);
});

test('the stated intent reaches the Work Map step and the agent export', () => {
  const answer = intentAnswer({ t: 11, answer: 'choosing the yellow bottle' });
  assert.equal(answer.question, INTENT_QUESTION);
  const nodes = [{ id: 'n1', description: 'Bottle picked', slots: {}, answers: [answer], video_segment: { uri: 'v', t_start: 12, t_end: 18 } }];
  const map = sanitizeWorkMap({ steps: [{ title: 'Pick bottle', source: ['n1'], decision: null, reason: null, guardrails: [] }], unclear: [] }, nodes);
  assert.equal(map.steps[0].intent.words, 'choosing the yellow bottle');
  const doc = toAgentInstructions({ process: { name: 'Lab' }, steps: map.steps });
  assert.equal(doc.steps[0].expert_intends, 'choosing the yellow bottle');
  assert.match(toAgentMarkdown({ process: { name: 'Lab' }, steps: map.steps }), /Expert said before doing it: "choosing the yellow bottle"/);
});
