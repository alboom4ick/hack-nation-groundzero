import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepGuide, explainStep, predictionPrompt, interventionFor, sanitizeCheck, isJudgment, emptyRecord, summarize, summarySpeech, MAX_SPOKEN } from '../public/tutor-logic.js';
import { checkAction, gradePrediction } from '../lib/tutor.js';

const workMap = JSON.parse(readFileSync(new URL('../public/workmaps/invoice_demo.json', import.meta.url)));
const capex = workMap.steps.find((s) => s.id === 's4');
const reply = (obj) => async () => ({ ok: true, json: async () => ({ content: [{ text: JSON.stringify(obj) }] }) });

test('sample Work Map: seven steps, judgment calls and guardrails with the expert\'s words', () => {
  assert.equal(workMap.steps.length, 7);
  assert.equal(workMap.steps.filter(isJudgment).length, 4);
  assert.equal(workMap.steps.flatMap((s) => s.guardrails).length, 4);
  for (const g of workMap.steps.flatMap((s) => s.guardrails)) assert.ok(g.words && g.screen_moment);
});

test('explainStep speaks decision, reason quote and guardrails, within the TTS limit', () => {
  const t = explainStep(capex);
  assert.match(t, /Re-code from opex/);
  assert.match(t, /Equipment over 5,000 euro is always capex/);
  assert.match(t, /No asset number/);
  for (const s of workMap.steps) assert.ok(explainStep(s).length <= MAX_SPOKEN);
  assert.ok(predictionPrompt(capex).length <= MAX_SPOKEN);
});

test('interventionFor uses the guardrail\'s own words and screen moment, not a paraphrase', () => {
  const iv = interventionFor(capex, 0);
  assert.match(iv.ask, /would stop here\. Why do you think\?/);
  assert.equal(iv.words, capex.guardrails[0].words);
  assert.equal(iv.t, 195);
  assert.match(iv.explain, /Equipment over 5,000 euro is always capex/);
  // no guardrail index: falls back to the decision's reason
  assert.equal(interventionFor(capex, null).words, capex.reason.words);
});

test('interventionFor starts a sentence with a capital and uses the named expert', () => {
  const plain = interventionFor(capex, 0);
  assert.match(plain.ask, /^Wait\. The expert would stop here\./);
  assert.match(plain.explain, /^The expert said: "Equipment over 5,000 euro is always capex\."/);
  const named = interventionFor(capex, 0, 'Sabine');
  assert.match(named.ask, /^Wait\. Sabine would stop here\. Why do you think\?/);
  assert.match(named.explain, /^Sabine said:/);
  const viaCheck = sanitizeCheck({ verdict: 'violation', step: 's4', guardrail: 0, observed: 'x' }, { ...workMap, process: { ...workMap.process, expert: 'Sabine' } });
  assert.match(viaCheck.intervention.ask, /^Wait\. Sabine would stop here\./);
});

test('every step of the sample Work Map links to the expert\'s own words (M5)', () => {
  for (const s of workMap.steps) assert.ok(s.reason || s.guardrails.length || s.said, `${s.id} has no words`);
});

test('sanitizeCheck keeps a real violation and drops invented ones', () => {
  const ok = sanitizeCheck({ verdict: 'violation', step: 's4', guardrail: 0, observed: 'Coding a 7,200 EUR invoice to opex 4711.' }, workMap);
  assert.equal(ok.verdict, 'violation');
  assert.equal(ok.intervention.guardrail.kind, 'limit');
  assert.equal(sanitizeCheck({ verdict: 'violation', step: 'nope', guardrail: 0 }, workMap).verdict, 'unsure');
  assert.equal(sanitizeCheck({ verdict: 'violation', step: 's1', guardrail: null }, workMap).verdict, 'unsure', 'step with no decision cannot be violated');
  assert.equal(sanitizeCheck({ verdict: 'violation', step: 's4', guardrail: 9 }, workMap).guardrail, null, 'out-of-range guardrail index is dropped');
  const fine = sanitizeCheck({ verdict: 'ok', step: 's4', guardrail: 0 }, workMap);
  assert.equal(fine.guardrail, null);
  assert.equal(fine.intervention, null);
  assert.equal(sanitizeCheck({ verdict: 'wat' }, workMap).verdict, 'unsure');
});

test('checkAction sends the screenshot and the Work Map to the model and sanitizes the verdict', async () => {
  let body;
  const out = await checkAction({ workMap, frames: ['data:image/jpeg;base64,AAAA'], said: 'I will code it to opex' }, 'k', async (url, init) => {
    body = JSON.parse(init.body);
    return reply({ observed: '7,200 EUR equipment, opex field', step: 's4', verdict: 'violation', guardrail: 0 })();
  });
  assert.equal(out.verdict, 'violation');
  assert.equal(body.messages[0].content[0].type, 'image');
  assert.match(body.messages[0].content[1].text, /I will code it to opex/);
  assert.match(body.messages[0].content[1].text, /Equipment over 5,000/);
  await assert.rejects(checkAction({ workMap, frames: ['not-a-data-url'] }, 'k', reply({})), /base64/);
});

test('gradePrediction returns a boolean and a short feedback line', async () => {
  const g = await gradePrediction({ step: capex, answer: 'keep it as opex' }, 'k', reply({ correct: false, feedback: 'Equipment over 5,000 euro is always capex.' }));
  assert.deepEqual(g, { correct: false, feedback: 'Equipment over 5,000 euro is always capex.' });
  const loose = await gradePrediction({ step: capex, answer: 'x' }, 'k', reply({ correct: 'yes' }));
  assert.equal(loose.correct, false, 'only literal true counts');
});

test('summarize: mastered needs a right prediction or a clean pass; slips go to practice', () => {
  const rec = emptyRecord(workMap);
  rec.s2.touched = true;
  rec.s3.predicted = 'right';
  rec.s4.predicted = 'right';
  rec.s4.violations = 1;
  const { mastered, practice } = summarize(workMap, rec);
  assert.deepEqual(mastered.map((m) => m.step), ['s2', 's3']);
  assert.deepEqual(practice.map((p) => [p.step, p.why]), [['s4', 'went to break a guardrail'], ['s5', 'not tested yet']]);
  assert.match(summarySpeech({ mastered, practice }), /Practice next: Code invoice to cost center/);
  assert.ok(summarySpeech(summarize(workMap, emptyRecord(workMap))).length <= MAX_SPOKEN);
});

test('stepGuide: do, decide and one watch-out per guardrail, from the expert\'s Work Map only', () => {
  const g = stepGuide(capex);
  assert.deepEqual(g.map((l) => l.kind), ['do', 'decide', 'watch', 'watch']);
  assert.equal(g[0].text, 'Code invoice to cost center');
  assert.equal(g[2].label, 'Limit');
  assert.deepEqual(stepGuide(workMap.steps[0]).map((l) => l.kind), ['do']);
});
