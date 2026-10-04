import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebrief } from '../public/debrief.js';

const step = (id, extra = {}) => ({ id, title: `Step ${id}`, decision: null, reason: null, needs_reason: false, guardrails: [], screen_moment: { t: 0 }, ...extra });

// The model side, scripted: the Work Map it proposes for the answers so far, and how it judges the expert's reply.
function fakeModel({ unclear = ['Is that for every supplier?', 'Who releases a held invoice?', 'What if the supplier is new?'], confirmOn = 1 } = {}) {
  const log = { builds: [], explained: 0, judged: [] };
  return {
    log,
    build: async (answered) => {
      log.builds.push(answered.map((f) => f.answer));
      return { steps: [step('s1'), step('s2', { decision: 'Hold it' })], unclear: unclear.map((question) => ({ step: 's2', question, why: 'scope' })), dropped: { quotes: 0 } };
    },
    explain: async () => ({ text: `Explanation ${++log.explained}. Did I get that right?` }),
    judge: async (explanation, reply) => {
      log.judged.push(reply);
      return log.judged.length >= confirmOn ? { confirmed: true, correction: null } : { confirmed: false, correction: 'Only for the December supplier.' };
    },
  };
}

// The expert, scripted: answers by question text; anything else gets the default.
const expert = (answers = {}, fallback = 'Yes, that is right.') => {
  const heard = [];
  const ask = async (text, opts) => { heard.push({ text, ...opts }); return text in answers ? answers[text] : fallback; };
  return { ask, heard };
};

test('M4: three answered follow-ups and a confirmed teach-back complete the debrief', async () => {
  const model = fakeModel();
  let changes = 0;
  const d = createDebrief({ ...model, onChange: () => changes++ });
  await d.start();
  assert.equal(d.open.length, 3);
  assert.equal(d.status.complete, false);

  const e = expert();
  await d.run({ ask: e.ask });
  assert.deepEqual(e.heard.slice(0, 3).map((h) => [h.n, h.total, h.teachback]), [[1, 3, false], [2, 3, false], [3, 3, false]]);
  assert.equal(e.heard[3].teachback, true);
  assert.deepEqual(d.status, { followups_answered: 3, followups_ok: true, confirmed: true, complete: true });
  assert.equal(model.log.builds.at(-1).length, 3, 'the Work Map is rebuilt from the answers before the teach-back');
  assert.equal(d.open.length, 0);
  assert.ok(changes > 4);
  const file = d.workMap({ name: 'live.webm', duration: 60 });
  assert.equal(file.debrief.complete, true);
  assert.equal(file.debrief.teach_back.confirmed, true);
});

test('a correction is not a confirmation: it becomes an answer, the map is rebuilt and the process explained again', async () => {
  const model = fakeModel({ confirmOn: 2 });
  const d = createDebrief(model);
  await d.start();
  await d.run({ ask: expert().ask });
  assert.equal(model.log.explained, 2);
  assert.equal(d.teachBack.confirmed, true);
  const correction = d.followups.find((f) => f.question.startsWith('Correction to teach-back'));
  assert.equal(correction.answer, 'Only for the December supplier.');
  assert.ok(model.log.builds.at(-1).includes('Only for the December supplier.'));
});

test('an expert who never confirms is asked at most three times, and the debrief stays open', async () => {
  const model = fakeModel({ confirmOn: 99 });
  const d = createDebrief(model);
  await d.start();
  await d.run({ ask: expert().ask });
  assert.equal(model.log.explained, 3);
  assert.equal(d.status.confirmed, false);
  assert.equal(d.status.complete, false);
});

test('skipped follow-ups do not count, and are not asked again in the next run', async () => {
  const model = fakeModel();
  const d = createDebrief(model);
  await d.start();
  const first = expert({ 'Who releases a held invoice?': null });
  await d.run({ ask: first.ask });
  assert.equal(d.status.followups_answered, 2);
  assert.equal(d.status.complete, false, 'confirmed teach-back alone is not enough');
  assert.deepEqual(d.open.map((u) => u.question), [], 'the rebuilt map does not re-list what was already asked');

  const second = expert();
  await d.run({ ask: second.ask });
  assert.ok(second.heard.every((h) => h.teachback), 'only the teach-back is put to the expert again');
});

test('stopping keeps what was answered and never reaches the teach-back', async () => {
  const model = fakeModel();
  const d = createDebrief(model);
  await d.start();
  let stopped = false;
  const e = expert();
  await d.run({ ask: async (...a) => { const r = await e.ask(...a); stopped = true; return r; }, stopped: () => stopped });
  assert.equal(d.followups.length, 1);
  assert.equal(d.teachBack, null);
  assert.equal(model.log.explained, 0);
});

test('silence at the teach-back leaves it unconfirmed', async () => {
  const d = createDebrief(fakeModel());
  await d.start();
  await d.run({ ask: async (text, { teachback }) => (teachback ? null : 'An answer.') });
  assert.deepEqual([d.teachBack.confirmed, d.status.complete], [false, false]);
});

test('taking something off the record afterwards voids the teach-back; a new capture starts clean', async () => {
  const d = createDebrief(fakeModel());
  await d.start();
  await d.run({ ask: expert().ask });
  d.forget({ part: 'step', step: 's2' });
  assert.deepEqual(d.steps.map((s) => s.id), ['s1']);
  assert.equal(d.teachBack, null);
  assert.equal(d.status.complete, false);
  d.reset();
  assert.deepEqual([d.built, d.followups.length, d.open.length], [false, 0, 0]);
});
