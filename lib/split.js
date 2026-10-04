// Asks Claude whether an expert's statement shows one tree node is really several sequential steps.
import { MODEL } from './describe.js';

export const SYSTEM = `You refine one step of a task's action tree using what the expert just said.
Decide whether the step is really 2-5 distinct sequential actions.
Return ONLY JSON: {"split": bool, "parts": [{"name": str, "description": str, "contribution": str, "ar": {"anchor": {"type": "object"|"region", "label": str}, "target_anchor": {"type": "object"|"region", "label": str}|null, "instruction": str, "success_condition": str|null}|null}]}
Rules:
- split=true only if the expert's words (or the step itself) clearly name separate actions in order. Otherwise {"split": false, "parts": []}.
- parts are in time order. name: 2-6 words. ar: the thing to highlight in AR for that part, a 6-word instruction, and how to see it is done; null if unclear. description: one sentence, 25 words max. contribution: what that part achieves, 20 words max.
- Use only what the expert said or the step already states. Do not invent steps.
- JSON only.`;

export function parseSplit(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model output');
  const raw = JSON.parse(m[0]);
  const parts = (Array.isArray(raw.parts) ? raw.parts : [])
    .map((p) => ({ name: String(p?.name ?? '').trim(), description: String(p?.description ?? '').trim(), contribution: String(p?.contribution ?? '').trim(), ar: p?.ar ?? null }))
    .filter((p) => p.description)
    .slice(0, 5);
  return raw.split === true && parts.length >= 2 ? { split: true, parts } : { split: false, parts: [] };
}

export async function proposeSplit({ node, instruction }, apiKey, fetchImpl = fetch) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify({ step: { id: node.id, description: node.description, contribution: node.contribution, slots: node.slots, expert_answers: node.answers }, expert_says: instruction }) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return parseSplit((await res.json()).content.map((b) => b.text ?? '').join(''));
}
