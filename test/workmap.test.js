import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeWorkMap, debriefStatus, toWorkMap, MIN_FOLLOWUPS } from '../public/workmap.js';
import { proposeWorkMap, judgeTeachBack, explainWorkMap } from '../lib/workmap.js';

const nodes = [
  { id: 'n1', description: 'Open invoice 4471', slots: {}, answers: [], video_segment: { uri: 'v.mp4', t_start: 0, t_end: 3 } },
  {
    id: 'n2', description: 'Change cost center', slots: {},
    answers: [{ question: 'Why?', answer: 'Equipment over 5,000 euro is always capex.', t: 4.5 }],
    video_segment: { uri: 'v.mp4', t_start: 3, t_end: 6 },
  },
  { id: 'n3', description: 'Hold December invoice', slots: {}, answers: [], video_segment: { uri: 'v.mp4', t_start: 6, t_end: 9 } },
];

const raw = {
  steps: [
    { title: 'Open invoice', source: ['n1'], decision: null, reason: null, guardrails: [] },
    {
      title: 'Code to cost center', source: ['n2'], decision: 'Re-code from opex to capex',
      reason: { quote: 'equipment over 5,000 euro is always capex' },
      guardrails: [{ kind: 'limit', rule: 'Capex above 5,000 EUR', quote: 'Equipment over 5,000 euro is always capex' }],
    },
    { title: 'Hold invoice', source: ['n3'], decision: 'Hold the supplier invoice', reason: { quote: 'because they double bill' }, guardrails: [] },
  ],
  unclear: [{ step: 's3', question: 'Is that for every supplier?', why: 'scope unknown' }],
};

test('reason and guardrail keep the expert words and link to the moment they were said', () => {
  const { steps } = sanitizeWorkMap(raw, nodes);
  const s = steps[1];
  assert.equal(s.reason.words, 'Equipment over 5,000 euro is always capex.');
  assert.equal(s.reason.screen_moment.t, 4.5);
  assert.equal(s.guardrails[0].kind, 'limit');
  assert.equal(s.guardrails[0].screen_moment.t, 4.5);
  assert.deepEqual(s.screen_moment.nodes, ['n2']);
});

test('a quote the expert never said is dropped, counted and turned into a debrief question', () => {
  const { steps, unclear, dropped } = sanitizeWorkMap(raw, nodes);
  assert.equal(steps[2].reason, null);
  assert.equal(steps[2].needs_reason, true);
  assert.equal(dropped.quotes, 1);
  assert.ok(unclear.some((u) => /hold the supplier invoice/i.test(u.question)));
});

test('guardrails with an unknown kind or an ungrounded quote are discarded', () => {
  const bad = { steps: [{ title: 't', source: ['n2'], guardrails: [
    { kind: 'vibes', rule: 'x', quote: 'Equipment over 5,000 euro is always capex' },
    { kind: 'limit', rule: 'y', quote: 'made up words here' },
  ] }] };
  assert.deepEqual(sanitizeWorkMap(bad, nodes).steps[0].guardrails, []);
});

test('steps without a known source are dropped; steps come back in time order', () => {
  const out = sanitizeWorkMap({ steps: [
    { title: 'late', source: ['n3'] }, { title: 'ghost', source: ['zzz'] }, { title: 'early', source: ['n1'] },
  ] }, nodes);
  assert.deepEqual(out.steps.map((s) => [s.id, s.title]), [['s1', 'early'], ['s2', 'late']]);
  assert.equal(out.dropped.steps, 1);
});

test('a quote may come from a debrief answer', () => {
  const debrief = [{ question: 'Why hold it?', answer: 'This supplier double bills every December, the controller releases it.' }];
  const { steps } = sanitizeWorkMap(raw, nodes, debrief);
  assert.equal(steps[2].reason, null); // "because they double bill" is still not verbatim
  const ok = sanitizeWorkMap({ steps: [{ title: 'Hold', source: ['n3'], decision: 'Hold', reason: { quote: 'the controller releases it' } }] }, nodes, debrief);
  assert.equal(ok.steps[0].reason.source, 'debrief');
  assert.equal(ok.steps[0].reason.screen_moment.t, 6);
});

test('debrief is complete only with 3 answered follow-ups and a confirmed teach-back', () => {
  const f = (n) => Array.from({ length: n }, (_, i) => ({ question: `q${i}`, answer: 'a' }));
  assert.equal(MIN_FOLLOWUPS, 3);
  assert.equal(debriefStatus({ followups: f(2), teachBack: { confirmed: true } }).complete, false);
  assert.equal(debriefStatus({ followups: f(3), teachBack: { confirmed: false } }).complete, false);
  assert.equal(debriefStatus({ followups: f(3), teachBack: { confirmed: true } }).complete, true);
});

test('toWorkMap exports steps and debrief state', () => {
  const { steps } = sanitizeWorkMap(raw, nodes);
  const out = toWorkMap({ video: { name: 'a.mp4' }, steps, followups: [{ question: 'q', answer: 'a' }], teachBack: { text: 't', confirmed: true } });
  assert.equal(out.schema, 'groundzero.work-map/1');
  assert.equal(out.process.name, 'a');
  assert.equal(out.debrief.followups_answered, 1);
  assert.equal(out.debrief.teach_back.confirmed, true);
});

const reply = (text) => async () => ({ ok: true, json: async () => ({ content: [{ text }] }) });

test('proposeWorkMap sanitises the model output', async () => {
  const out = await proposeWorkMap({ nodes }, 'k', reply(JSON.stringify(raw)));
  assert.equal(out.steps.length, 3);
  assert.equal(out.dropped.quotes, 1);
});

test('judgeTeachBack: a correction never counts as confirmation', async () => {
  const j = await judgeTeachBack({ explanation: 'e', reply: 'yes but only for equipment' }, 'k', reply('{"confirmed": true, "correction": "only for equipment"}'));
  assert.deepEqual(j, { confirmed: false, correction: 'only for equipment' });
  const ok = await judgeTeachBack({ explanation: 'e', reply: 'yes' }, 'k', reply('{"confirmed": true, "correction": null}'));
  assert.deepEqual(ok, { confirmed: true, correction: null });
});

test('explainWorkMap rejects empty output', async () => {
  await assert.rejects(explainWorkMap({ steps: [{ title: 't', guardrails: [] }] }, 'k', reply('{"text": ""}')), /empty/);
});

import { ensureGuardrailQuestion, FALLBACK_GUARDRAIL_QUESTION } from '../public/workmap.js';

const seg = (id, questions, slots = {}) => ({ id, frames: ['a', 'b', 'c'], result: { questions, slots } });

test('ensureGuardrailQuestion adds one on the branch step and is idempotent', () => {
  const segs = [seg(0, []), seg(1, [{ frame: 1, text: 'What if?', kind: 'branch' }]), seg(2, [])];
  assert.equal(ensureGuardrailQuestion(segs), segs[1]);
  const g = segs[1].result.questions.at(-1);
  assert.deepEqual(g, { frame: 1, text: FALLBACK_GUARDRAIL_QUESTION, kind: 'guardrail' });
  assert.equal(ensureGuardrailQuestion(segs), null);
  assert.equal(segs.flatMap((s) => s.result.questions).filter((q) => q.kind === 'guardrail').length, 1);
});

test('ensureGuardrailQuestion leaves the map alone when the model already asked one, or nothing is described', () => {
  const asked = [seg(0, [{ frame: 0, text: 'x', kind: 'guardrail' }]), seg(1, [])];
  assert.equal(ensureGuardrailQuestion(asked), null);
  assert.equal(asked[1].result.questions.length, 0);
  assert.equal(ensureGuardrailQuestion([{ id: 0, frames: [] }]), null);
});

test('ensureGuardrailQuestion falls back to the later segment on equal scores, at its last frame', () => {
  const segs = [seg(0, []), seg(1, [])];
  assert.equal(ensureGuardrailQuestion(segs), segs[1]);
  assert.equal(segs[1].result.questions[0].frame, 2);
});
