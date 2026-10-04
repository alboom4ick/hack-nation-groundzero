// Module 2: Claude merges described segments, the expert's answers and the debrief into Work Map steps,
// lists what is still unclear, explains the process back (teach-back) and judges the expert's reply.
import { MODEL } from './describe.js';
import { sanitizeWorkMap } from '../public/workmap.js';

export const SYSTEM = `You turn an expert's recorded screen task into a Work Map that teaches a new hire.
Input: {"steps": [{"id", "t": [start, end], "description", "slots", "expert_answers": [{"question", "answer", "t"}]}], "debrief_answers": [{"question", "answer"}]}
Return ONLY JSON: {"steps": [{"title": str, "source": [input step ids], "decision": str|null, "reason": {"quote": str}|null, "guardrails": [{"kind": "limit"|"exception"|"stop_and_ask", "rule": str, "quote": str}]}], "unclear": [{"step": null, "question": str, "why": str}]}
Rules:
- Merge consecutive input steps that are one business action into one step; 3-12 steps in time order. title: 2-6 words, imperative ("Code invoice to cost center"). source lists every input id it covers.
- decision: the judgment call made in this step, one short sentence ("Re-code from opex to capex"). null for routine actions.
- reason.quote and guardrail quote: copy WORDS THE EXPERT SAID verbatim from expert_answers or debrief_answers. Never paraphrase, translate or invent. No such words: reason null, no guardrail.
- guardrails: only limits ("over 5,000 EUR"), exceptions ("this supplier double-bills in December") and moments to stop and ask someone, that the expert actually stated. rule: the guardrail in your words, 15 words max.
- unclear: at least 3 spoken follow-up questions, 15 words max each, about what the expert has NOT explained: a decision with no reason, a rule whose scope is unknown ("Is that for every supplier?"), who decides, what happens in a case not shown. Never repeat a question already in expert_answers or debrief_answers. why: 10 words max. step: null.
- JSON only.`;

async function callClaude({ system, user, maxTokens }, apiKey, fetchImpl) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: JSON.stringify(user) }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = (await res.json()).content.map((b) => b.text ?? '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model output');
  return JSON.parse(m[0]);
}

export async function proposeWorkMap({ nodes, debrief = [] }, apiKey, fetchImpl = fetch) {
  const user = {
    steps: nodes.map((n) => ({ id: n.id, t: [n.video_segment.t_start, n.video_segment.t_end], description: n.description, slots: n.slots, expert_answers: n.answers })),
    debrief_answers: debrief.filter((d) => d?.answer).map((d) => ({ question: d.question, answer: d.answer })),
  };
  const raw = await callClaude({ system: SYSTEM, user, maxTokens: 4000 }, apiKey, fetchImpl);
  return sanitizeWorkMap(raw, nodes, debrief);
}

export const TEACHBACK_SYSTEM = `You are the apprentice explaining a process back to the expert who taught it, in your own words, to be spoken aloud.
Input: Work Map steps with decisions, reasons and guardrails.
Return ONLY JSON: {"text": str}
Rules:
- 90 words max, plain spoken sentences, no lists. Walk through the steps in order; state each decision with its reason, and each limit, exception or moment to stop and ask.
- Use only what the steps contain. Do not add rules.
- End with "Did I get that right?"
- JSON only.`;

export async function explainWorkMap({ steps }, apiKey, fetchImpl = fetch) {
  const user = steps.map((s) => ({ title: s.title, decision: s.decision, reason: s.reason?.words ?? null, guardrails: s.guardrails.map((g) => ({ kind: g.kind, rule: g.rule })) }));
  const out = await callClaude({ system: TEACHBACK_SYSTEM, user, maxTokens: 500 }, apiKey, fetchImpl);
  const text = String(out.text ?? '').trim();
  if (!text) throw new Error('empty teach-back');
  return { text };
}

export const JUDGE_SYSTEM = `The expert heard the apprentice explain a process back and replied. Decide whether the expert confirmed it.
Input: {"explanation": str, "reply": str}
Return ONLY JSON: {"confirmed": bool, "correction": str|null}
Rules:
- confirmed=true only if the reply accepts the explanation as correct ("yes", "that's right"). Any correction, "but", "except" or "no" means false.
- correction: what the expert said is wrong or missing, in their words, 25 words max; null if confirmed.
- JSON only.`;

export async function judgeTeachBack({ explanation, reply }, apiKey, fetchImpl = fetch) {
  const out = await callClaude({ system: JUDGE_SYSTEM, user: { explanation, reply }, maxTokens: 200 }, apiKey, fetchImpl);
  const correction = typeof out.correction === 'string' && out.correction.trim() ? out.correction.trim() : null;
  return { confirmed: out.confirmed === true && !correction, correction };
}
