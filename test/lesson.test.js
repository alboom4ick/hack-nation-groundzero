import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLesson, sanitizeCheck, CHECK_SPEECH } from '../public/tutor-logic.js';
import { tutorCue, TUTOR_PROMPT_BASE } from '../public/agent-prompts.js';
import { askTutor, answerSaves, saveAllowed } from '../public/save-hold.js';

const workMap = JSON.parse(readFileSync(new URL('../public/workmaps/invoice_demo.json', import.meta.url)));
const fast = { ackMs: 30, maxMs: 120 };

test('T5: the unseen 7,200 euro case. The wrong decision is caught, explained in the expert\'s words, and lands in practice', () => {
  const lesson = createLesson(workMap, 'Sabine');
  lesson.goTo('s2');
  // what the checker returned for the new hire's screen, validated against the Work Map
  const result = sanitizeCheck({ verdict: 'violation', step: 's4', guardrail: 0, observed: 'Coding a 7,200 EUR equipment invoice to opex 4711.' }, workMap);
  const { step, intervention } = lesson.violated(result);
  assert.equal(step.id, 's4');
  assert.equal(lesson.step.id, 's4', 'the lesson moves to the step being broken');
  assert.equal(intervention.ask, 'Wait. Sabine would stop here. Why do you think?');
  assert.match(intervention.explain, /Sabine said: "Equipment over 5,000 euro is always capex\."/);
  assert.equal(intervention.t, 195, 'and replays her screen moment');

  lesson.stepDone(); // fixing it afterwards does not prove the step
  const { mastered, practice } = lesson.finish();
  assert.ok(!mastered.some((m) => m.step === 's4'));
  assert.deepEqual(practice.find((p) => p.step === 's4').why, 'went to break a guardrail');
  assert.equal(lesson.current, -1);
  assert.equal(lesson.violated({ step: 'nope' }), null);
});

test('A4: mastery comes from a right prediction or a clean pass, the same for the agent and the scripted tutor', () => {
  const lesson = createLesson(workMap);
  assert.deepEqual([0, 1, 3, 5].map((i) => lesson.needsPrediction(i)), [false, true, true, false], 'not the first step, not routine steps');

  const right = lesson.predicted('s4', true);
  assert.deepEqual([right.right, right.reveal], [true, null]);
  const wrong = lesson.predicted('s3', false);
  assert.match(wrong.reveal, /^Expert: /);
  assert.equal(lesson.predicted('s3', 'true').right, false, 'only a literal true counts');
  lesson.skipped('s5');
  assert.equal(lesson.goTo('s2'), true);
  lesson.stepDone();
  assert.equal(lesson.goTo('s99'), false);
  assert.equal(lesson.step.id, 's2', 'an unknown step leaves the lesson where it was');
  assert.equal(lesson.predicted('s99', true), null);

  const { mastered, practice } = lesson.finish();
  assert.deepEqual(mastered.map((m) => m.step), ['s2', 's4']);
  assert.deepEqual(practice.map((p) => [p.step, p.why]), [['s3', 'predicted the wrong decision'], ['s5', 'not tested yet']]);
});

test('tutor cues use exactly the tags the tutor prompt teaches', () => {
  const s4 = workMap.steps.find((s) => s.id === 's4');
  const cues = [tutorCue.screen('Invoice open', 'ok'), tutorCue.next(), tutorCue.intervene(s4, 'Equipment over "5,000" is capex'), tutorCue.say(CHECK_SPEECH.ok), tutorCue.summary({ mastered: [], practice: [{ title: 'Code invoice', why: 'not tested yet' }] })];
  for (const cue of cues) {
    const tag = cue.match(/^\[[A-Z]+\]/)[0];
    assert.ok(TUTOR_PROMPT_BASE.includes(tag), `${tag} is explained in the prompt`);
  }
  assert.equal(tutorCue.screen('', 'unsure'), '[SCREEN] nothing decided yet (unsure)');
  assert.match(cues[2], /Step s4 "Code invoice to cost center".*Expert's words: "Equipment over '5,000' is capex"/);
  assert.match(cues[4], /Mastered: nothing yet\. Practise next: Code invoice \(not tested yet\)/);
  assert.match(tutorCue.intervene({ id: 's2', title: 'T', decision: 'Hold it' }, null), /Expert's words: "Hold it"/);
});

test('save hold: saved only after a clean check; a violation or a check that could not run keeps it unsaved', async () => {
  assert.deepEqual(['ok', 'unsure', 'violation', null, undefined].map(saveAllowed), [true, true, false, false, false]);
  const seen = [];
  let verdict = 'ok';
  const stop = answerSaves(async (record) => { seen.push(record.id); if (verdict === 'throw') throw new Error('vision down'); return verdict; });
  try {
    assert.deepEqual(await askTutor({ id: 'INV-4471', amount: 3000 }, fast), { allow: true, verdict: 'ok', checked: true });
    verdict = 'violation';
    assert.deepEqual(await askTutor({ id: 'INV-4475', amount: 7200 }, fast), { allow: false, verdict: 'violation', checked: true });
    verdict = null; // the tutor is speaking: no check ran
    assert.equal((await askTutor({ id: 'INV-4475' }, fast)).allow, false);
    verdict = 'throw';
    assert.equal((await askTutor({ id: 'INV-4475' }, fast)).allow, false);
    assert.deepEqual(seen, ['INV-4471', 'INV-4475', 'INV-4475', 'INV-4475']);
  } finally { stop(); }
});

test('save hold: with no tutor open the ERP just saves; a tutor that never answers blocks the save', async () => {
  assert.deepEqual(await askTutor({ id: 'INV-1' }, fast), { allow: true, checked: false });
  const stop = answerSaves(() => new Promise(() => {}));
  try {
    assert.deepEqual(await askTutor({ id: 'INV-2' }, fast), { allow: false, checked: false, verdict: 'timeout' });
  } finally { stop(); }
  assert.deepEqual(await askTutor({ id: 'INV-3' }, { ...fast, Channel: null }), { allow: true, checked: false });
});
