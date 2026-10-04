import test from 'node:test';
import assert from 'node:assert/strict';
import { createPacer, PACING, FALLBACK_GUARDRAIL_QUESTION, selectOpenQuestions } from '../public/pacing.js';

const seg = (id, tEnd, questions, slots = {}) => ({ id, tStart: tEnd - 3, tEnd, frames: ['a', 'b', 'c'], frameTimes: [tEnd - 3, tEnd - 1.5, tEnd], result: { description: 'd', slots, questions } });
const q = (text, kind) => ({ frame: 0, text, ...(kind ? { kind } : {}) });
const paused = (t) => ({ t, screenActive: false, voiceActive: false });

// Asks whatever the pacer allows at time t, the answer taking `takes` seconds.
const askAt = (p, t, takes = 5) => { const n = p.next(paused(t)); if (n?.ask) { p.began(n.ask, t); p.ended(t + takes); } return n; };

test('waits for the pause: never while the expert types or talks, and not in the first seconds', () => {
  const p = createPacer();
  p.add(seg(0, 25, [q('Why this cost center?')]));
  assert.equal(p.next({ t: 26, screenActive: true, voiceActive: false }).hold, 'typing');
  assert.equal(p.next({ t: 26, screenActive: false, voiceActive: true }).hold, 'speaking');
  assert.ok(p.next(paused(26)).ask);
  const early = createPacer();
  early.add(seg(0, 5, [q('Why?')]));
  assert.equal(early.next(paused(PACING.firstAskSec - 2)).hold, 'later');
  assert.equal(createPacer().next(paused(60)), null, 'nothing to ask');
});

test('what to ask: the guardrail first, then the decision, then a missing slot; stale questions are dropped', () => {
  const p = createPacer();
  p.add(seg(0, 30, [q('What is the intent?'), q('What if the supplier is new?', 'branch'), q("Is there an amount where you'd stop?", 'guardrail')]));
  assert.equal(askAt(p, 31).ask.q.kind, 'guardrail');
  assert.equal(askAt(p, 31 + 5 + PACING.catchUpGapSec).ask.q.kind, 'branch');
  assert.equal(p.next(paused(30 + PACING.freshSec + 1)), null, 'the slot question is no longer about what is on screen');
});

test('C5: a ten-minute task gets at least three questions, one about a guardrail, and no more than five', () => {
  const p = createPacer();
  const asked = [];
  for (let t = 0; t <= 600; t += 0.5) {
    if (t % 15 === 0 && t > 0) p.add(seg(t, t, [q(`Why step ${t}?`), ...(t === 45 ? [q('What if not?', 'branch')] : [])], t === 45 ? { effect: 'cost center 0400' } : {}));
    const n = askAt(p, t);
    if (n?.ask) asked.push({ t, kind: n.ask.q.kind, text: n.ask.q.text });
  }
  assert.equal(asked.length, 5);
  assert.ok(p.met);
  assert.ok(asked.some((a) => a.kind === 'guardrail'));
  assert.ok(asked[0].t >= PACING.firstAskSec);
  assert.ok(asked[2].t < 120, 'the first three come early, in case the task is short');
  assert.ok(asked[3].t - asked[2].t >= PACING.gapSec, 'after that the usual spacing applies');
});

test('C5: when the model offers no guardrail question, the first decisive segment gets one, live', () => {
  const p = createPacer();
  const routine = seg(0, 22, [q('What is the tool?')]);
  p.add(routine);
  assert.equal(routine.result.questions.length, 1, 'reading and navigating is not asked about limits');
  const commit = seg(1, 30, [q('Why 0400?')], { effect: 'cost center set to 0400' });
  p.add(commit);
  assert.equal(commit.result.questions.at(-1).text, FALLBACK_GUARDRAIL_QUESTION);
  const first = askAt(p, 31);
  assert.equal(first.ask.q.kind, 'guardrail');
  assert.equal(first.ask.q, commit.result.questions.at(-1), 'the answer lands on the segment, so the Work Map can quote it');
  assert.equal(p.guardrailAsked, true);

  const later = seg(2, 60, [q('Why hold it?')], { effect: 'status hold' });
  p.add(later);
  assert.equal(later.result.questions.length, 1, 'only one fallback per task');
  const own = createPacer();
  const s = seg(0, 30, [q('Limit?', 'guardrail')], { effect: 'x' });
  own.add(s);
  assert.equal(s.result.questions.length, 1, "the model's own guardrail question is enough");
});

test('the gap is counted from the end of the answer, not from the question', () => {
  const p = createPacer({ minQuestions: 0 });
  p.add(seg(0, 30, [q('One?'), q('Two?')]));
  askAt(p, 30, 20);                       // asked at 30, the answer ends at 50
  p.add(seg(1, 70, [q('Three?')]));
  assert.equal(p.next(paused(30 + PACING.gapSec)).hold, 'later');
  assert.ok(p.next(paused(50 + PACING.gapSec)).ask);
});

test('G12: shortfall says what the brief still wants until three are asked and one is a guardrail', () => {
  const p = createPacer();
  assert.equal(p.shortfall(), 'Asked 0 of 3; still missing 3 more questions and one about a guardrail.');
  p.began(p_item('Why?', 'branch'), 10);
  p.began(p_item('Why again?'), 20);
  assert.equal(p.shortfall(), 'Asked 2 of 3; still missing 1 more question and one about a guardrail.');
  p.began(p_item('Any limit?', 'guardrail'), 30);
  assert.equal(p.shortfall(), null);
  assert.equal(p.minQuestions, 3);
  const g = createPacer();
  for (const k of ['branch', 'branch', 'branch']) g.began(p_item('x', k), 1);
  assert.equal(g.shortfall(), 'Asked 3 of 3; still missing one about a guardrail.');
});
function p_item(text, kind) { return { q: { text, ...(kind ? { kind } : {}) } }; }

test('G12: a still screen keeps a question fresh while the minimum is missing; a missing guardrail is made up', () => {
  const p = createPacer();
  p.add(seg(0, 30, [q('Why this cost center?')], { effect: 'set' }));
  const late = 30 + PACING.freshSec + 60;
  assert.equal(p.next({ ...paused(late), idleFor: 0 }), null, 'the screen changed since: stale');
  const n = p.next({ ...paused(late), idleFor: late - 30 });
  assert.ok(n.ask, 'still on screen: asked');
  p.began(n.ask, late); p.ended(late + 5);

  const q2 = createPacer();
  q2.add(seg(0, 30, [q('A?'), q('B?')]));
  for (const [i, t] of [31, 60].entries()) { const n2 = q2.next(paused(t)); q2.began(n2.ask, t); q2.ended(t + 5); }
  assert.equal(q2.asked, 2);
  assert.equal(q2.next({ ...paused(5000), idleFor: 5000 }), null, 'too old even for a still screen');
  const g = q2.next({ ...paused(90), idleFor: 60 });
  assert.equal(g.ask.q.kind, 'guardrail');
  assert.equal(g.ask.q.text, FALLBACK_GUARDRAIL_QUESTION);
});

test('selectOpenQuestions keeps guardrails and decisions first, caps the count, and returns video order', () => {
  const it = (text, time, kind) => ({ s: {}, q: { text, kind }, time });
  const items = [it('slot a', 1), it('slot b', 2), it('branch', 9, 'branch'), it('slot c', 3), it('guard', 7, 'guardrail'), it('slot d', 4)];
  // top 3 by importance are the guardrail, the branch and the earliest slot question; they come back in video order
  assert.deepEqual(selectOpenQuestions(items, 3).map((x) => x.q.text), ['slot a', 'guard', 'branch']);
  assert.equal(selectOpenQuestions(items).length, 6);
  assert.equal(selectOpenQuestions(items, 2).map((x) => x.q.text).includes('guard'), true);
  assert.deepEqual(selectOpenQuestions([], 3), []);
});
