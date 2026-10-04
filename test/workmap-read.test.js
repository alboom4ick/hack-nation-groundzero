import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readWorkMap, readSteps, stepForModel, sanitizeWorkMap, toWorkMap, forget, SCHEMA } from '../public/workmap.js';
import { checkAction, gradePrediction } from '../lib/tutor.js';
import { judgeTeachBack, proposeWorkMap } from '../lib/workmap.js';
import { explainStep } from '../public/tutor-logic.js';

const demo = JSON.parse(readFileSync(new URL('../public/workmaps/invoice_demo.json', import.meta.url)));
const clone = (x) => JSON.parse(JSON.stringify(x));
const reply = (obj) => async () => ({ ok: true, json: async () => ({ content: [{ text: JSON.stringify(obj) }] }) });

const nodes = [
  { id: 'n1', description: 'Open invoice 4471', slots: {}, answers: [{ question: '(said while working)', answer: 'First I open the oldest invoice in the list.', t: 1.5 }], video_segment: { uri: 'v.webm', t_start: 0, t_end: 3 } },
  { id: 'n2', description: 'Change cost center', slots: {}, answers: [{ question: 'Why?', answer: 'Equipment over 5,000 euro is always capex.', t: 4.5 }], video_segment: { uri: 'v.webm', t_start: 3, t_end: 6 } },
  { id: 'n3', description: 'Scroll the list', slots: {}, answers: [], video_segment: { uri: 'v.webm', t_start: 6, t_end: 9 } },
];
const raw = { steps: [
  { title: 'Open invoice', source: ['n1'] },
  { title: 'Code to cost center', source: ['n2'], decision: 'Re-code to capex', reason: { quote: 'Equipment over 5,000 euro is always capex' } },
  { title: 'Scroll', source: ['n3'] },
] };

test('the sample and every built Work Map read as a Work Map', () => {
  assert.equal(readWorkMap(demo), demo);
  const built = toWorkMap({ video: { name: 'v.webm', duration: 9 }, steps: sanitizeWorkMap(raw, nodes).steps });
  assert.equal(readWorkMap(clone(built)).schema, SCHEMA);
});

test('what is not a Work Map is refused with the reason, as a bad request', () => {
  const broken = (change) => { const m = clone(demo); change(m); return () => readWorkMap(m); };
  assert.throws(() => readWorkMap(null), /not a Work Map/);
  assert.throws(() => readWorkMap({ steps: [] }), /no steps/);
  assert.throws(broken((m) => { m.schema = 'groundzero.work-map/2'; }), /unknown schema/);
  assert.throws(broken((m) => { delete m.steps[2].id; }), /step 3 has no id or title/);
  assert.throws(broken((m) => { delete m.steps[0].screen_moment; }), /step 1 has no screen moment/);
  assert.throws(broken((m) => { delete m.steps[3].guardrails[0].words; }), /step 4 has a guardrail without .* the expert's words/);
  assert.throws(broken((m) => { m.steps[3].guardrails[0].kind = 'vibes'; }), /guardrail/);
  assert.throws(broken((m) => { m.steps[3].reason = { gloss: 'x' }; }), /reason without the expert's words/);
  try { readSteps('nope'); } catch (err) { assert.equal(err.status, 400); }
});

test('stepForModel: one view of a step for every model that reads one', () => {
  const s4 = demo.steps.find((s) => s.id === 's4');
  assert.deepEqual(stepForModel(s4), { title: s4.title, decision: s4.decision, reason: s4.reason.words, guardrails: s4.guardrails.map((g) => ({ kind: g.kind, rule: g.rule })) });
  assert.equal(stepForModel(s4, { words: true }).guardrails[1].words, s4.guardrails[1].words);
  assert.deepEqual(stepForModel(demo.steps[0]), { title: demo.steps[0].title, decision: null, reason: null, guardrails: [] });
});

test('M5: a routine step carries what the expert said while doing it; a step with nothing said is counted', () => {
  const { steps, unlinked } = sanitizeWorkMap(raw, nodes);
  assert.deepEqual(steps[0].said, { words: 'First I open the oldest invoice in the list.', source: 'live', screen_moment: { t: 1.5, node: 'n1' } });
  assert.equal(steps[1].said, undefined, 'a step with a reason already has the expert\'s words');
  assert.equal(steps[2].said, undefined);
  assert.equal(unlinked, 1);
  assert.match(explainStep(steps[0]), /the expert said: "First I open the oldest invoice in the list\."/);
  const after = forget({ steps }, { part: 'said', step: 's1' });
  assert.equal(after.steps[0].said, undefined, 'and can be taken off the record');
  assert.equal(readSteps(after.steps).length, 3);
});

test('the model-facing functions own their input rules: bad input is a 400 before any model call', async () => {
  const never = async () => { throw new Error('the model must not be called'); };
  const is400 = (re) => (err) => err.status === 400 && re.test(err.message);
  await assert.rejects(checkAction({ workMap: { steps: [] }, frames: ['data:image/jpeg;base64,AA'] }, 'k', never), is400(/not a Work Map/));
  await assert.rejects(checkAction({ workMap: demo, frames: [] }, 'k', never), is400(/frames required/));
  await assert.rejects(gradePrediction({ step: { title: 't' }, answer: 'x' }, 'k', never), is400(/not a Work Map/));
  await assert.rejects(gradePrediction({ step: demo.steps[3], answer: '  ' }, 'k', never), is400(/answer required/));
  await assert.rejects(judgeTeachBack({ explanation: 'e', reply: '' }, 'k', never), is400(/reply required/));
  await assert.rejects(proposeWorkMap({ nodes: [] }, 'k', never), is400(/nodes required/));

  let body;
  await gradePrediction({ step: demo.steps[3], answer: 'a'.repeat(5000) }, 'k', async (_u, init) => { body = JSON.parse(init.body); return reply({ correct: true, feedback: 'ok' })(); });
  assert.equal(JSON.parse(body.messages[0].content).answer.length, 1000, 'long answers are clipped here, not in the route');
});
