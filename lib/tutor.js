// Module 3 server side: Claude watches the new hire's screen against the Work Map and catches a wrong
// decision before it is saved, and grades predictions of the expert's next decision.
import { MODEL } from './describe.js';
import { sanitizeCheck } from '../public/tutor-logic.js';

const compact = (workMap) => workMap.steps.map((s) => ({
  id: s.id, title: s.title, decision: s.decision, reason: s.reason?.words ?? null,
  guardrails: s.guardrails.map((g, i) => ({ i, kind: g.kind, rule: g.rule, words: g.words })),
}));

async function callClaude({ system, content, maxTokens }, apiKey, fetchImpl) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = (await res.json()).content.map((b) => b.text ?? '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model output');
  return JSON.parse(m[0]);
}

export const CHECK_SYSTEM = `You watch a new hire work a case on their own screen. An expert's Work Map says which decisions are right and which guardrails apply.
Input: Work Map steps [{id, title, decision, reason, guardrails: [{i, kind, rule, words}]}], the new hire's latest words, and screenshot(s) of their screen.
Return ONLY JSON: {"observed": str, "step": str|null, "verdict": "ok"|"violation"|"unsure", "guardrail": int|null}
Rules:
- observed: one sentence, 25 words max: what is on screen and what the new hire is about to do (the value, code, field or action they chose). Read amounts and names off the screen.
- step: the Work Map step id this action belongs to, or null.
- verdict "violation" ONLY when the action on screen, or what they said they will do, contradicts that step's decision or breaks one of its guardrails when applied to THIS case (compare the actual amounts, codes or suppliers with the rule). Set guardrail to that guardrail's i, or null if only the decision is contradicted.
- "ok" when the action follows the Work Map. "unsure" when the screen does not show a decision yet. Never flag routine reading or navigating.
- Never invent a rule that is not in the Work Map.
- JSON only.`;

export async function checkAction({ workMap, frames = [], said = '' }, apiKey, fetchImpl = fetch) {
  const content = [];
  for (const f of frames.slice(-2)) {
    const m = String(f).match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) throw new Error('frame must be a base64 data URL');
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  content.push({ type: 'text', text: JSON.stringify({ steps: compact(workMap), new_hire_said: String(said).slice(0, 600) }) });
  return sanitizeCheck(await callClaude({ system: CHECK_SYSTEM, content, maxTokens: 300 }, apiKey, fetchImpl), workMap);
}

export const PREDICT_SYSTEM = `A new hire was asked what the expert would decide at one step of a process and where they would stop. Grade the answer.
Input: {"step": {title, decision, reason, guardrails: [{kind, rule}]}, "answer": str}
Return ONLY JSON: {"correct": bool, "feedback": str}
Rules:
- correct=true only if the answer matches the expert's decision (the guardrails may be missing, but nothing may contradict them).
- feedback: one spoken sentence, 25 words max. If wrong or incomplete, say what the expert actually did, using the reason's own words. If right, confirm briefly.
- JSON only.`;

export async function gradePrediction({ step, answer }, apiKey, fetchImpl = fetch) {
  const user = { step: { title: step.title, decision: step.decision, reason: step.reason?.words ?? null, guardrails: step.guardrails.map((g) => ({ kind: g.kind, rule: g.rule })) }, answer };
  const out = await callClaude({ system: PREDICT_SYSTEM, content: JSON.stringify(user), maxTokens: 200 }, apiKey, fetchImpl);
  return { correct: out.correct === true, feedback: typeof out.feedback === 'string' ? out.feedback.trim().slice(0, 300) : '' };
}
