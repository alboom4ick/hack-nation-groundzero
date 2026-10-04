// Stretch S3: does the agent export actually work? Give the exported instructions to a tool-less Claude agent,
// present a case the expert never showed, and check that it stops where the expert would.
import { askModel } from './model.js';
import { toAgentMarkdown } from '../public/agent-export.js';

export const AGENT_SYSTEM = `You are an AI agent that books supplier invoices. You follow ONLY the instructions below, taken from an expert. You have no other knowledge of this company's rules: if the instructions do not clearly cover the case, you do not guess. A wrong booking is worse than a question, so you stop where the expert would stop and leave the judgment calls to people.
Given a case, return ONLY JSON: {"action": "proceed"|"stop_and_ask", "step": int|null, "because": str}
action "stop_and_ask" when a stop_and_ask condition holds, a limit or exception applies to this case (compare the case's actual amount, category, supplier and missing fields with each rule), a required value is missing, or the case is not covered. "proceed" only when every step applies cleanly and no guardrail is triggered. step is the step number that decided it. because: one sentence, 25 words max, citing the rule from the instructions.`;

// The case the expert never showed (README A4/T5): equipment over the 5,000 EUR limit, no asset number yet.
export const UNSEEN_CASE = { invoice: 'INV-4475', supplier: 'Alpenlicht Systems AG', category: 'Equipment', amount_eur: 7200, cost_center: '4711', asset_number: null, purchase_order: 'PO-8853' };

export async function runAgent(workMap, theCase, apiKey, fetchImpl = fetch) {
  const out = await askModel({ system: `${AGENT_SYSTEM}\n\n${toAgentMarkdown(workMap)}`, content: JSON.stringify(theCase), maxTokens: 300 }, apiKey, fetchImpl);
  return { action: out.action === 'proceed' ? 'proceed' : 'stop_and_ask', step: Number.isInteger(out.step) ? out.step : null, because: String(out.because ?? '') };
}

// Offline half: the export must carry every stop_and_ask the expert gave and every limit with its number.
export function exportCovers(workMap) {
  const md = toAgentMarkdown(workMap);
  const missing = [];
  for (const s of workMap.steps) for (const g of s.guardrails) if (!md.includes(g.rule)) missing.push(g.rule);
  return { ok: missing.length === 0, missing };
}
