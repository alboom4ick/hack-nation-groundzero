// Module 3 server side: Claude watches the new hire's screen against the Work Map and catches a wrong
// decision before it is saved, and grades predictions of the expert's next decision.
import { askModel, imageBlock } from './model.js';
import { sanitizeCheck } from '../public/tutor-logic.js';
import { readWorkMap, readSteps, stepForModel } from '../public/workmap.js';

const bad = (message) => Object.assign(new Error(message), { status: 400 });

// The steps as the checker sees them: with ids and numbered guardrails, so its verdict can point at one.
const compact = (workMap) => workMap.steps.map((s) => {
  const view = stepForModel(s, { words: true });
  return { id: s.id, ...view, guardrails: view.guardrails.map((g, i) => ({ i, ...g })) };
});

export const CHECK_SYSTEM = `You watch a new hire work a case on their own screen, as the safety net of a tutor. An expert's Work Map says which decisions are right and which guardrails apply. Your verdict decides whether the tutor steps in BEFORE the new hire saves a wrong decision, so a missed violation lets a mistake through and a false alarm wastes their trust. The case may be one the expert never showed: apply the expert's rules to THIS case's numbers, codes and suppliers; do not match on look-alike screens.
Input: Work Map steps [{id, title, decision, reason, guardrails: [{i, kind, rule, words}]}], the new hire's latest words, and screenshot(s) of their screen.
Return ONLY JSON: {"observed": str, "step": str|null, "verdict": "ok"|"violation"|"unsure", "guardrail": int|null}
Rules:
- observed: one sentence, 25 words max: what is on screen and what the new hire is about to do (the value, code, field or action they chose). Read amounts, codes and statuses off the screen exactly. Do not include individuals' personal data (names, emails, bank or ID numbers); say "the supplier" or "the customer".
- step: the Work Map step id this action belongs to, or null.
- verdict "violation" when the action on screen, or what they said they are about to do, contradicts that step's decision or breaks one of its guardrails for THIS case. Compare the actual value with the rule (for example 7,200 against a 5,000 limit, a missing number a rule requires, a supplier or condition an exception names, a stop_and_ask moment they would skip). Flag it as soon as the choice is visible in a field or said aloud, even if it is not saved yet. Set guardrail to that guardrail's i, or null if only the decision is contradicted.
- "ok" when the action follows the Work Map for this case. "unsure" when the screen does not yet show a decision, the relevant value is unreadable, or the case is not covered by any rule; never turn "unsure" into a violation by guessing. Never flag reading, scrolling, navigating or a field they have not changed.
- If the new hire says they are not sure or will ask someone, that is "ok".
- Never invent a rule that is not in the Work Map.
- JSON only.`;

export async function checkAction({ workMap, frames, said }, apiKey, fetchImpl = fetch) {
  readWorkMap(workMap);
  if (!Array.isArray(frames) || !frames.length) throw bad('frames required');
  if (typeof said !== 'string') said = '';
  const content = frames.slice(-2).map(imageBlock);
  content.push({ type: 'text', text: JSON.stringify({ steps: compact(workMap), new_hire_said: String(said).slice(0, 600) }) });
  return sanitizeCheck(await askModel({ system: CHECK_SYSTEM, content, maxTokens: 300 }, apiKey, fetchImpl), workMap);
}

export const PREDICT_SYSTEM = `A new hire was asked what the expert would decide at one step of a process and where they would stop. Grade the answer by meaning, not wording: it was spoken and transcribed, so it may be short, hesitant or phrased differently from the expert.
Input: {"step": {title, decision, reason, guardrails: [{kind, rule}]}, "answer": str}
Return ONLY JSON: {"correct": bool, "feedback": str}
Rules:
- correct=true only if the answer arrives at the expert's decision (the guardrails may be missing, but nothing may contradict the decision or a guardrail). A guess that is vague ("I'd just process it"), says "I don't know", or picks a different outcome is false. Saying they would stop and ask is correct only if the step has a stop_and_ask guardrail.
- feedback: one spoken sentence, 25 words max, kind and never scolding. If wrong or incomplete, say what the expert did and name the rule that decides it, using the reason's own words. If right, confirm briefly and add the one guardrail they did not mention, if any. Use only what the step contains.
- JSON only.`;

export async function gradePrediction({ step, answer }, apiKey, fetchImpl = fetch) {
  if (typeof answer !== 'string' || !answer.trim()) throw bad('step and answer required');
  const user = { step: stepForModel(readSteps([step])[0]), answer: answer.slice(0, 1000) };
  const out = await askModel({ system: PREDICT_SYSTEM, content: JSON.stringify(user), maxTokens: 200 }, apiKey, fetchImpl);
  return { correct: out.correct === true, feedback: typeof out.feedback === 'string' ? out.feedback.trim().slice(0, 300) : '' };
}
