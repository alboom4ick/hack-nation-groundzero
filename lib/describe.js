// Step 3-4: Claude describes a segment's motion; empty slots become expert questions.

export const SLOTS = ['object', 'tool', 'intent', 'precondition', 'effect'];
export const MODEL = 'claude-sonnet-5-5';

export const SYSTEM = `You label one short segment of an expert doing a physical task. You get numbered keyframes in time order.
Return ONLY this JSON:
{"description": str, "slots": {"object": str|null, "tool": str|null, "intent": str|null, "precondition": str|null, "effect": str|null}, "questions": [{"frame": int, "text": str}]}
Rules:
- description: ONE sentence, 25 words max. Plain action verbs. No lead-in like "The frames show".
- slots: 6 words max each. Only what is visible; otherwise null. Never guess. Intent (the why) is rarely visible, so it is usually null.
- questions: one per null slot, 12 words max, spoken aloud. Prefer "I think X. Right?" when you have a hypothesis, else a direct question.
- frame: the frame number where the thing being asked about is most visible.
- JSON only.`;

export function parseDescription(text, frameCount = 1) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model output');
  const raw = JSON.parse(m[0]);
  const slots = {};
  for (const k of SLOTS) {
    const v = raw.slots?.[k];
    slots[k] = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  const clamp = (n) => Math.min(Math.max(Number.isInteger(n) ? n : 0, 0), Math.max(frameCount - 1, 0));
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((q) => (typeof q === 'string' ? { frame: 0, text: q } : { frame: clamp(q?.frame), text: String(q?.text ?? '') }))
    .map((q) => ({ ...q, text: q.text.trim() }))
    .filter((q) => q.text);
  return { description: String(raw.description ?? '').trim(), slots, questions };
}

export const missingSlots = (slots) => SLOTS.filter((k) => !slots[k]);

// Every empty slot must be covered by at least one question; fall back to a generic one.
export function finalize(result) {
  const missing = missingSlots(result.slots);
  const questions = [...result.questions];
  if (missing.length && !questions.length) {
    questions.push(...missing.map((k) => ({ frame: 0, text: `What is the ${k} in this step?` })));
  }
  return { ...result, missing, needsExpert: missing.length > 0, questions };
}

export async function describeSegment({ frames, frameTimes, tStart, tEnd, context }, apiKey, fetchImpl = fetch) {
  const content = [];
  frames.forEach((f, i) => {
    const m = f.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) throw new Error('frame must be a base64 data URL');
    const t = frameTimes?.[i];
    content.push({ type: 'text', text: `Frame ${i}${t != null ? ` (${t.toFixed(1)}s)` : ''}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  });
  content.push({
    type: 'text',
    text: `Segment ${tStart.toFixed(1)}s–${tEnd.toFixed(1)}s.${context ? `\nContext so far: ${context}` : ''}`,
  });
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, system: SYSTEM, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return finalize(parseDescription(data.content.map((b) => b.text ?? '').join(''), frames.length));
}
