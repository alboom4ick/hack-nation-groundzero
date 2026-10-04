// Module 3 logic: turns a Work Map into what the voice tutor says, validates the model's verdicts and
// tracks what the new hire has mastered. Pure, no DOM; shared by the browser and the server.

export const MAX_SPOKEN = 480; // /api/tts accepts 500 chars

const clip = (s, n = MAX_SPOKEN) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const stripEnd = (s) => String(s).trim().replace(/[.!?]+$/, '');
export const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export const GUARD_SPEECH = { limit: 'There is a limit', exception: 'There is an exception', stop_and_ask: 'Stop and ask someone' };

// The tutor teaches in the expert's words: decision, then the reason quote, then each guardrail.
export function explainStep(step, expertName = 'the expert') {
  const parts = [`${step.title}.`];
  if (step.decision) parts.push(`${expertName} decided: ${stripEnd(step.decision)}.`);
  if (step.reason) parts.push(`Why: "${stripEnd(step.reason.words)}."`);
  for (const g of step.guardrails) parts.push(`${GUARD_SPEECH[g.kind] ?? 'Guardrail'}: ${stripEnd(g.rule)}.`);
  return clip(parts.join(' '));
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
  const lead = `Wait. ${expertName} would stop here. Why do you think?`;
  const because = words ? ` ${expertName} said: "${stripEnd(words)}."` : '';
  return { ask: clip(lead), explain: clip(because.trim() || `${expertName} decided differently here.`), words, t: moment?.t ?? step.screen_moment.t, guardrail: g };
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
  return { verdict, step: step?.id ?? null, guardrail, observed, intervention: verdict === 'violation' ? interventionFor(step, guardrail) : null };
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
