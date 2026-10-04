// Module 1: Claude turns what changed on the expert's screen into an event; empty slots become expert questions.
import { askModel, extractJson, imageBlock } from './model.js';

export const SLOTS = ['object', 'tool', 'intent', 'precondition', 'effect'];
// Filled when visible but never worth interrupting the expert for.
export const OPTIONAL_SLOTS = ['location', 'target'];

export const SYSTEM = `You are the AI Apprentice's eyes: you label one short segment of an expert doing a real task on a computer screen (desk work: invoices, claims, procurement, tickets, KYC checks). You get numbered screenshots in time order. Turn what CHANGED between them into an event, and propose the few questions a curious apprentice would ask the expert aloud: the ones that reveal a reason, a judgment call or a guardrail, never the ones the screen already answers.
Return ONLY this JSON:
{"description": str, "slots": {"object": str|null, "tool": str|null, "intent": str|null, "precondition": str|null, "effect": str|null, "location": str|null, "target": str|null}, "questions": [{"frame": int, "text": str}], "branch_question": {"frame": int, "text": str}|null, "guardrail_question": {"frame": int, "text": str}|null}
Rules:
- description: ONE sentence, 25 words max, an event with the values read off the screen ("Invoice 4471 opened", "Cost center changed from 4711 to 0400"). Plain verbs. No lead-in like "The screenshots show". Describe what happened, never why.
- slots: 6 words max each. Only what is visible; otherwise null. Never guess. object = the record or document handled (invoice 4471); tool = the application, screen or field used; location = where on screen; target = the field, code or status being set. precondition = what was true before; effect = what changed. Intent (the why) is rarely visible, so it is usually null.
- questions: one per null slot, 12 words max, spoken aloud by a calm, curious colleague, about something visible on screen. Name the concrete thing you see (the invoice number, amount, supplier, field or code), never "this step" or "that". Aim at the reason behind a decision: why this value, what would change it, what they would never do. Prefer "I think X. Right?" when you have a hypothesis, else a direct question. Never ask what the screen already answers (what a field is called, what a button does, what a number is). A step with no judgment in it (opening, scrolling, reading, navigating) gets no question: return [] for it. Ask less, not more.
- branch_question: ask ONLY if this step checks, holds, routes or decides something that could go another way. Ask what the expert does otherwise, e.g. "What if the supplier is new?". 14 words max. null for plain actions with no outcome that could differ.
- guardrail_question: ask ONLY if the step visibly commits, approves, books, sends, changes a value or applies a rule (an amount, code, field or status being set). Ask about the limit, exception, or the moment they would stop and ask someone, tied to what is on screen, e.g. "Is there an amount where you'd stop and ask?". 14 words max. null for reading, scrolling or navigating.
- Questions are spoken, so write them as speech: one short sentence, no lists, no jargon from this prompt, no yes/no question that a reason would not follow.
- Privacy: refer to people and companies by role or record ("this supplier", "the customer") unless the name is the point of the rule. Never put personal data (names of individuals, emails, phone numbers, IBANs, card or ID numbers, addresses) into description, slots or questions. If a private or off-topic window is in view (mail, chat, banking, a personal tab), say only "Unrelated window in view" and read nothing from it.
- frame: the frame number where the thing being asked about is most visible.
- JSON only.`;

export const parseDescription = (text, frameCount = 1) => clean(extractJson(text), frameCount);

// Model output is untrusted: unknown slots are dropped, empty ones become null, frame numbers are clamped.
function clean(raw, frameCount) {
  const slots = {};
  for (const k of [...SLOTS, ...OPTIONAL_SLOTS]) {
    const v = raw.slots?.[k];
    slots[k] = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  const clamp = (n) => Math.min(Math.max(Number.isInteger(n) ? n : 0, 0), Math.max(frameCount - 1, 0));
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((q) => (typeof q === 'string' ? { frame: 0, text: q } : { frame: clamp(q?.frame), text: String(q?.text ?? '') }))
    .map((q) => ({ ...q, text: q.text.trim() }))
    .filter((q) => q.text);
  const b = raw.branch_question;
  const bText = String(typeof b === 'string' ? b : b?.text ?? '').trim();
  if (bText) questions.push({ frame: clamp(b?.frame), text: bText, kind: 'branch' });
  const g = raw.guardrail_question;
  const gText = String(typeof g === 'string' ? g : g?.text ?? '').trim();
  if (gText) questions.push({ frame: clamp(g?.frame), text: gText, kind: 'guardrail' });
  return { description: String(raw.description ?? '').trim(), slots, questions };
}

export const missingSlots = (slots) => SLOTS.filter((k) => !slots[k]);

// Ask less, not more: a segment gets at most MAX_QUESTIONS_PER_SEGMENT, the ones that matter most first
// (a guardrail, then a decision, then a missing detail). A routine step the model left without questions gets none;
// only a step that changed something (an effect was seen) gets a single generic question about its most important
// missing detail. The old behaviour, one generic question per empty slot, turned every segment into 3 to 5 questions.
export const MAX_QUESTIONS_PER_SEGMENT = 2;
const SLOT_PRIORITY = ['intent', 'precondition', 'effect', 'object', 'tool'];
const kindRank = (q) => (q.kind === 'guardrail' ? 0 : q.kind === 'branch' ? 1 : 2);

export function finalize(result) {
  const missing = missingSlots(result.slots);
  let questions = [...result.questions];
  const first = SLOT_PRIORITY.find((k) => missing.includes(k));
  if (!questions.length && first && result.slots.effect) {
    questions.push({ frame: 0, text: `What is the ${first} in this step?` });
  }
  const keep = new Set([...questions].sort((a, b) => kindRank(a) - kindRank(b)).slice(0, MAX_QUESTIONS_PER_SEGMENT));
  questions = questions.filter((q) => keep.has(q));
  return { ...result, missing, needsExpert: missing.length > 0, questions };
}

// Any ISO language code resolves to its English name; unknown codes fall back to the English prompt.
const langName = (code) => {
  if (!code || code === 'en') return null;
  try { const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(code); return n && n !== code ? n : null; } catch { return null; }
};
// S2: the expert's language for the event text and the questions (JSON keys and slot names stay English).
export const systemFor = (language) => {
  const name = langName(language);
  return name ? `${SYSTEM}\n- LANGUAGE: write description, slot values and every question in ${name}. Keep JSON keys in English.` : SYSTEM;
};

export async function describeSegment({ frames, frameTimes, tStart, tEnd, context, language }, apiKey, fetchImpl = fetch) {
  if (!Array.isArray(frames) || !frames.length) throw Object.assign(new Error('frames required'), { status: 400 });
  const content = [];
  frames.forEach((f, i) => {
    const t = frameTimes?.[i];
    content.push({ type: 'text', text: `Frame ${i}${t != null ? ` (${t.toFixed(1)}s)` : ''}:` });
    content.push(imageBlock(f));
  });
  content.push({
    type: 'text',
    text: `Segment ${tStart.toFixed(1)}s–${tEnd.toFixed(1)}s.${context ? `\nContext so far: ${context}` : ''}`,
  });
  return finalize(clean(await askModel({ system: systemFor(language), content, maxTokens: 500 }, apiKey, fetchImpl), frames.length));
}
