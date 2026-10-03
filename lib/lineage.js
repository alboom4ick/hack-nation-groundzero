// Step 7: Claude proposes each step's contribution and parent steps; the result is sanitised into a DAG.
import { MODEL } from './describe.js';
import { sanitizeLineage, isDag } from '../public/tree.js';

export const SYSTEM = `You build the dependency tree of a physical task from its ordered steps.
Return ONLY JSON: {"nodes":[{"id": str, "contribution": str, "parents": [id], "rationale": str, "uncertain": bool, "question": str|null}]}
Rules:
- One entry per input step, same ids.
- contribution: what this step achieves toward the overall task, 20 words max. Use the expert's answers about intent and effect when present; do not invent a reason.
- parents: ids of EARLIER steps whose result this step depends on (its precondition). Not every step depends on the previous one; independent steps have no parent. The first step usually has none.
- rationale: why those parents, 15 words max.
- uncertain: true if the dependency is a guess. Then give ONE short yes/no "question" for the expert to confirm it (under 15 words); otherwise null.
- JSON only.`;

export async function proposeLineage(nodes, apiKey, fetchImpl = fetch) {
  const payload = nodes.map((n) => ({ id: n.id, t: [n.video_segment.t_start, n.video_segment.t_end], description: n.description, slots: n.slots, expert_answers: n.answers }));
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify(payload) }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = (await res.json()).content.map((b) => b.text ?? '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model output');
  const { lineage, dropped } = sanitizeLineage(JSON.parse(m[0]).nodes, nodes);
  if (!isDag(lineage)) throw new Error('lineage is not a DAG');
  return { lineage, dropped };
}
