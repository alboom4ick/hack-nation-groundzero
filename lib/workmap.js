// Module 2: Claude merges described segments, the expert's answers and the debrief into Work Map steps,
// lists what is still unclear, explains the process back (teach-back) and judges the expert's reply.
import { askModel } from './model.js';
import { sanitizeWorkMap, MIN_FOLLOWUPS, readSteps, stepForModel } from '../public/workmap.js';

const bad = (message) => Object.assign(new Error(message), { status: 400 });

export const SYSTEM = `You turn an expert's recorded screen task into a Work Map: the steps, the judgment calls, the reasons and the guardrails, so that a new hire who never met the expert could do the task and know where to stop. A recorder shows what happened; you must keep what the expert said about why. Never fill a gap with your own knowledge.
Input: {"steps": [{"id", "t": [start, end], "description", "slots", "expert_answers": [{"question", "answer", "t"}]}], "debrief_answers": [{"question", "answer"}]}
Return ONLY JSON: {"steps": [{"title": str, "source": [input step ids], "decision": str|null, "reason": {"quote": str, "gloss": str|null}|null, "guardrails": [{"kind": "limit"|"exception"|"stop_and_ask", "rule": str, "quote": str, "gloss": str|null}]}], "unclear": [{"step": null, "question": str, "why": str}]}
Rules:
- Merge consecutive input steps that are one business action into one step; 3-12 steps in time order. title: 2-6 words, imperative ("Code invoice to cost center"). source lists every input id it covers, and every input id appears in exactly one step.
- decision: the judgment call made in this step, one short sentence with the exact values ("Re-code from opex (4711) to capex (0400)"). null for routine actions with no choice in them.
- reason.quote and guardrail quote: copy WORDS THE EXPERT SAID verbatim from expert_answers or debrief_answers. Never paraphrase, translate, tidy or invent. Attach a quote to the step it is about, even when it was said in the debrief. No such words: reason null, no guardrail.
- gloss: an English translation of the quote when the quote is not English, else null. The quote itself stays in the expert's language. rule, title and decision are always English.
- guardrails: only limits ("over 5,000 EUR"), exceptions ("this supplier double-bills in December") and moments to stop and ask someone, that the expert actually stated. Keep exact numbers and the role to ask. rule: the guardrail in your words, 15 words max. If the expert took something off the record or declined to answer, leave it out entirely.
- unclear: at least 3 spoken follow-up questions, 15 words max each, about what the expert has NOT explained and that a new hire would need: a decision with no reason, a rule whose scope is unknown ("Is that for every supplier?"), who decides or releases, what happens in a case not shown, a limit with no number. Prioritise guardrails and decisions over routine steps. Never repeat or rephrase a question already in expert_answers or debrief_answers, and never ask what the description already shows. why: 10 words max. step: null.
- Personal data: never copy individuals' names, emails, bank or ID numbers into title, decision, rule or unclear. Use "the supplier" or "the customer". Quotes stay verbatim; any personal data in them was already redacted upstream.
- JSON only.`;

const ask = ({ system, user, maxTokens }, apiKey, fetchImpl) => askModel({ system, content: JSON.stringify(user), maxTokens }, apiKey, fetchImpl);

export async function proposeWorkMap({ nodes, debrief }, apiKey, fetchImpl = fetch) {
  if (!Array.isArray(nodes) || !nodes.length) throw bad('nodes required');
  if (!Array.isArray(debrief)) debrief = [];
  const user = {
    steps: nodes.map((n) => ({ id: n.id, t: [n.video_segment.t_start, n.video_segment.t_end], description: n.description, slots: n.slots, expert_answers: n.answers })),
    debrief_answers: debrief.filter((d) => d?.answer).map((d) => ({ question: d.question, answer: d.answer })),
  };
  let out = sanitizeWorkMap(await ask({ system: SYSTEM, user, maxTokens: 6000 }, apiKey, fetchImpl), nodes, debrief);
  // M4: follow-ups the expert already answered while working are dropped; if fewer than 3 are left, ask once more.
  if (!out.enough_followups) {
    const retry = { ...user, note: `Fewer than ${MIN_FOLLOWUPS} usable follow-ups. Ask about things not covered in expert_answers or debrief_answers.` };
    const again = sanitizeWorkMap(await ask({ system: SYSTEM, user: retry, maxTokens: 6000 }, apiKey, fetchImpl), nodes, debrief);
    if (again.unclear.length >= out.unclear.length) out = again;
  }
  return out;
}

export const TEACHBACK_SYSTEM = `You are the apprentice explaining a process back to the expert who taught it, in your own words, to be spoken aloud in under a minute. The explanation is a test: it must be specific enough that the expert can spot anything you got wrong, and complete enough that a new hire could do the task from it.
Input: Work Map steps with decisions, reasons and guardrails.
Return ONLY JSON: {"text": str}
Rules:
- 130 words max, plain spoken sentences, no lists, no step numbers read as a list. Walk through the steps in order, naturally ("First... then... after that...").
- For every decision, say the reason in your own words and keep the exact values (amounts, codes, limits, names of roles). Never round or generalise a number.
- Name each guardrail: every limit, exception and moment to stop and ask someone, and who to ask. Say them as "I never...", "I stop when..." or "If ... I ask ...".
- Use only what the steps contain. Do not add rules, reasons or numbers. If a step has a decision but no stated reason, or a rule with no stated scope, say so in one short clause ("I'm not sure why you did X") instead of guessing, so the expert can fill the gap.
- Do not read out personal data (individuals' names, emails, bank or ID numbers); say "the supplier" or "the customer".
- Speak to the expert directly ("you"). End with "Did I get that right?"
- JSON only.`;

export async function explainWorkMap({ steps }, apiKey, fetchImpl = fetch) {
  const user = readSteps(steps).map((s) => stepForModel(s));
  const out = await ask({ system: TEACHBACK_SYSTEM, user, maxTokens: 500 }, apiKey, fetchImpl);
  const text = String(out.text ?? '').trim();
  if (!text) throw new Error('empty teach-back');
  return { text };
}

export const JUDGE_SYSTEM = `The apprentice explained a process back to the expert, and the expert replied. Decide whether the expert confirmed the explanation is correct. The reply is spoken and transcribed, so it may be short, messy, hedged or in another language (German, for example); judge the meaning.
Input: {"explanation": str, "reply": str}
Return ONLY JSON: {"confirmed": bool, "correction": str|null}
Rules:
- confirmed=true only if the reply clearly accepts the whole explanation ("yes", "that's right", "exactly", "ja, genau"), with nothing added that changes it.
- confirmed=false for any correction, even one buried after a yes ("yes, but...", "mostly", "except", "only if", "not always", "no"). Also false if the reply is a question, a hesitation ("I think so", "more or less"), off topic, or too unclear to tell. When in doubt, false: a wrong confirmation teaches the next person a wrong rule.
- correction: the specific detail the expert said is wrong or missing (a number, a condition, a person to ask, a missing step), in their own words and in the language they used, 25 words max. null if confirmed. For a vague or hesitant reply with no concrete detail, use "Expert was not sure" rather than guessing one.
- Never invent a correction the expert did not say.
- JSON only.`;

export async function judgeTeachBack({ explanation, reply }, apiKey, fetchImpl = fetch) {
  if (typeof explanation !== 'string' || typeof reply !== 'string' || !reply.trim()) throw bad('explanation and reply required');
  const out = await ask({ system: JUDGE_SYSTEM, user: { explanation: explanation.slice(0, 2000), reply: reply.slice(0, 2000) }, maxTokens: 200 }, apiKey, fetchImpl);
  const correction = typeof out.correction === 'string' && out.correction.trim() ? out.correction.trim() : null;
  return { confirmed: out.confirmed === true && !correction, correction };
}
