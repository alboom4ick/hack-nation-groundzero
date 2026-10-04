// Module 3 logic: turns a Work Map into what the voice tutor says, validates the model's verdicts and
// tracks what the new hire has mastered. Pure, no DOM; shared by the browser and the server.

export const MAX_SPOKEN = 480; // /api/tts accepts 500 chars

const clip = (s, n = MAX_SPOKEN) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const stripEnd = (s) => String(s).trim().replace(/[.!?]+$/, '');
const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1); // "the expert" starts a sentence as "The expert"
export const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export const GUARD_SPEECH = { limit: 'There is a limit', exception: 'There is an exception', stop_and_ask: 'Stop and ask someone' };

// The tutor teaches in the expert's words: decision, then the reason quote, then each guardrail.
export function explainStep(step, expertName = 'the expert') {
  const parts = [`${step.title}.`];
  if (step.decision) parts.push(`${expertName} decided: ${stripEnd(step.decision)}.`);
  if (step.reason) parts.push(`Why: "${stripEnd(step.reason.words)}."`);
  else if (step.said) parts.push(`${expertName} said: "${stripEnd(step.said.words)}."`);
  for (const g of step.guardrails) parts.push(`${GUARD_SPEECH[g.kind] ?? 'Guardrail'}: ${stripEnd(g.rule)}.`);
  return clip(parts.join(' '));
}

// What the island shows the new hire for one step: do this, decide that, watch out for these. Built from the Work
// Map only (the expert's decision and guardrails), so it never says more than the expert did.
const GUARD_LABEL = { limit: 'Limit', exception: 'Exception', stop_and_ask: 'Stop and ask' };
export function stepGuide(step) {
  const lines = [{ kind: 'do', label: 'Do', text: stripEnd(step.title) }];
  if (step.decision) lines.push({ kind: 'decide', label: 'Decide', text: stripEnd(step.decision) });
  for (const g of step.guardrails) lines.push({ kind: 'watch', label: GUARD_LABEL[g.kind] ?? 'Watch', text: stripEnd(g.rule) });
  return lines;
}

// A step is worth a prediction question only if it carries a judgment call.
export const isJudgment = (step) => !!step.decision || step.guardrails.length > 0;

export function predictionPrompt(step, expertName = 'the expert') {
  return clip(`Before I show it: next is "${stripEnd(step.title)}". What would ${expertName} decide here, and where would they stop?`);
}

// Spoken when the new hire is about to break a guardrail or reverse a decision. Built from the expert's
// own words, never from the model's paraphrase.
export function interventionFor(step, guardrailIndex, expertName = 'the expert') {
  const g = Number.isInteger(guardrailIndex) ? step.guardrails[guardrailIndex] : null;
  const words = g?.words ?? step.reason?.words ?? null;
  const moment = g?.screen_moment ?? step.reason?.screen_moment ?? step.screen_moment;
  const lead = `Wait. ${sentence(expertName)} would stop here. Why do you think?`;
  const because = words ? ` ${sentence(expertName)} said: "${stripEnd(words)}."` : '';
  return { ask: clip(lead), explain: clip(because.trim() || `${sentence(expertName)} decided differently here.`), words, t: moment?.t ?? step.screen_moment.t, guardrail: g };
}

const VERDICTS = ['ok', 'violation', 'unsure'];

// Model output is untrusted: a violation must point at a real step and a real guardrail or decision.
export function sanitizeCheck(raw, workMap) {
  const steps = workMap.steps;
  const step = steps.find((s) => s.id === raw?.step) ?? null;
  const observed = typeof raw?.observed === 'string' ? raw.observed.trim().slice(0, 300) : '';
  let verdict = VERDICTS.includes(raw?.verdict) ? raw.verdict : 'unsure';
  let guardrail = Number.isInteger(raw?.guardrail) && step && raw.guardrail >= 0 && raw.guardrail < step.guardrails.length ? raw.guardrail : null;
  if (verdict === 'violation' && (!step || (guardrail === null && !step.decision))) verdict = 'unsure';
  if (verdict !== 'violation') guardrail = null;
  return { verdict, step: step?.id ?? null, guardrail, observed, intervention: verdict === 'violation' ? interventionFor(step, guardrail, workMap.process?.expert || undefined) : null };
}

// ---- mastery ----
// record: { [stepId]: { predicted: 'right'|'wrong'|'skipped'|undefined, violations: n, touched: bool } }
// touched = the tutor saw the new hire act on this step and it matched the Work Map.
export const emptyRecord = (workMap) => Object.fromEntries(workMap.steps.map((s) => [s.id, { predicted: undefined, violations: 0, touched: false }]));

export function summarize(workMap, record) {
  const mastered = [], practice = [];
  for (const s of workMap.steps) {
    const r = record[s.id] ?? {};
    if (!isJudgment(s)) continue;
    const slipped = (r.violations ?? 0) > 0 || r.predicted === 'wrong';
    const proven = r.predicted === 'right' || r.touched === true;
    if (slipped || !proven) practice.push({ step: s.id, title: s.title, why: slipped ? ((r.violations ?? 0) > 0 ? 'went to break a guardrail' : 'predicted the wrong decision') : 'not tested yet' });
    else mastered.push({ step: s.id, title: s.title });
  }
  return { mastered, practice };
}

export function summarySpeech({ mastered, practice }) {
  const names = (l) => l.map((x) => stripEnd(x.title)).join(', ');
  const a = mastered.length ? `You have mastered: ${names(mastered)}.` : 'Nothing is fully proven yet.';
  const b = practice.length ? ` Practice next: ${names(practice)}.` : ' Nothing left to practice.';
  return clip(a + b);
}

// ---- lesson ----
// What the tutor says after looking at the screen on request.
export const CHECK_SPEECH = { ok: 'That matches how the expert did it. Go ahead.', unsure: 'I cannot see a decision on screen yet. Show me the field you are about to save.' };

// Shown when the new hire predicted wrong: what the expert actually decided, and why, in their words.
export const revealFor = (step) => `Expert: ${step.decision ?? step.title}${step.reason ? ` — "${step.reason.words}"` : ''}`;

// One lesson on one Work Map: where the tutor is and what the new hire has proven. The tutor (ElevenAgents or the
// scripted one) reports what happened; mastery is decided here, the same way for both.
export function createLesson(workMap, expertName = 'the expert') {
  const steps = workMap.steps;
  const record = emptyRecord(workMap);
  let current = -1;
  const index = (id) => steps.findIndex((s) => s.id === id);
  return {
    workMap, record,
    get current() { return current; },
    get step() { return steps[current] ?? null; },
    // The first step is never tested: the new hire has seen nothing yet. Routine steps are not tested either.
    needsPrediction: (i) => i > 0 && isJudgment(steps[i]),
    // The tutor starts on a step (by id or position). False for a step that is not in the Work Map.
    goTo(step) {
      const i = typeof step === 'number' ? step : index(step);
      if (!steps[i]) return false;
      current = i;
      return true;
    },
    // -> { step, right, reveal } (reveal: what to show when wrong), or null for an unknown step.
    predicted(id, right) {
      const step = steps[index(id)];
      if (!step) return null;
      record[id].predicted = right === true ? 'right' : 'wrong';
      return { step, right: right === true, reveal: right === true ? null : revealFor(step) };
    },
    skipped(id) { if (record[id]) record[id].predicted = 'skipped'; },
    // A checked screen showed the new hire about to break the Work Map: the lesson moves to that step.
    // -> { step, intervention } built from the expert's own words, or null for an unknown step.
    violated({ step: id, guardrail = null }) {
      const i = index(id);
      if (i < 0) return null;
      record[id].violations++;
      current = i;
      return { step: steps[i], intervention: interventionFor(steps[i], guardrail, expertName) };
    },
    // The new hire did the current step on their own screen; it counts unless the tutor had to step in.
    stepDone() {
      const s = steps[current];
      if (s && !record[s.id].violations) record[s.id].touched = true;
    },
    finish() { current = -1; return summarize(workMap, record); },
  };
}
