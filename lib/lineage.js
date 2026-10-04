// Step 7: Claude proposes each step's contribution and parent steps; the result is sanitised into a DAG.
import { MODEL } from './describe.js';
import { sanitizeLineage, isDag } from '../public/tree.js';

export const SYSTEM = `You build a BPMN-style action tree of a physical task from its ordered steps, for AR guidance.
Return ONLY JSON: {"nodes":[{"id": str, "name": str, "contribution": str, "parents": [id], "conditions": {"<parent id>": str}, "decision": {"question": str}|null, "rationale": str, "uncertain": bool, "question": str|null, "ar": {"anchor": {"type": "object"|"region", "label": str}, "target_anchor": {"type": "object"|"region", "label": str}|null, "instruction": str, "success_condition": str|null}}]}
Rules:
- One entry per input step, same ids.
- name: 2-6 words, imperative ("Check the bottle").
- contribution: what this step achieves toward the overall task, 20 words max. Use the expert's answers about intent and effect when present; do not invent a reason.
- parents: ids of EARLIER steps whose result this step depends on (its precondition). Not every step depends on the previous one; independent steps have no parent and run in parallel. The first step usually has none.
- Branching: only when the expert's words or the step clearly describe alternative paths ("if empty, throw it away; otherwise move it"), give every alternative step the same parent and a condition for that parent: a boolean test on a snake_case variable, exactly like "bottle_empty == true" or "bottle_empty == false". Alternatives of one decision share one variable. On the shared parent's entry set "decision": {"question": "Is the bottle empty?"} (6 words max). A step after the alternatives lists all alternatives as parents. Expert answers to "what if" questions are the main source of branches: turn each such answer into an alternative step or an early finish. Never invent branches; usually there are none, then conditions is {} and decision is null.
- rationale: why those parents, 15 words max.
- uncertain: true if the dependency is a guess. Then give ONE short yes/no "question" for the expert to confirm it (under 15 words); otherwise null.
- ar: what an AR headset should do for this step. anchor = the thing to highlight (label 4 words max; "region" for an area, "object" for a thing). target_anchor = where it goes, only for placement steps, else null. instruction = what to tell the user, 6 words max. success_condition = what the camera should see once done, 10 words max, or null.
- JSON only.`;

export async function proposeLineage(nodes, apiKey, fetchImpl = fetch) {
  const payload = nodes.map((n) => ({ id: n.id, t: [n.video_segment.t_start, n.video_segment.t_end], description: n.description, slots: n.slots, expert_answers: n.answers }));
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify(payload) }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = (await res.json()).content.map((b) => b.text ?? '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model output');
  const { lineage, dropped } = sanitizeLineage(JSON.parse(m[0]).nodes, nodes);
  if (!isDag(lineage)) throw new Error('lineage is not a DAG');
  return { lineage, dropped };
}
