// Stretch goal "agent-ready guardrails": the Work Map as instructions an agent can load, so it follows the same
// steps and stops where the expert would. Pure, no DOM; the quotes are the expert's own words from the Work Map.

export const SCHEMA = 'groundzero.agent-instructions/1';

const KIND = { limit: 'limit', exception: 'exception', stop_and_ask: 'stop_and_ask' };

export function toAgentInstructions(workMap) {
  const steps = workMap.steps.map((s, i) => ({
    n: i + 1,
    id: s.id,
    title: s.title,
    decide: s.decision ?? null,
    because: s.reason?.words ?? null,
    guardrails: s.guardrails.map((g) => ({ kind: KIND[g.kind] ?? g.kind, rule: g.rule, expert_words: g.words })),
    // The agent hands the case to a person instead of acting whenever one of these holds.
    stop_and_ask: s.guardrails.filter((g) => g.kind === 'stop_and_ask').map((g) => g.rule),
    screen_moment_s: s.screen_moment?.t ?? null,
  }));
  return {
    schema: SCHEMA,
    process: workMap.process?.name ?? 'process',
    rules: [
      'Follow the steps in order.',
      'At a step with a decision, apply it only if no guardrail of that step is broken.',
      'A limit or exception that matches the case changes the outcome as written; never improvise a rule that is not listed.',
      'If a stop_and_ask condition holds, or the case is not covered by any step, stop and hand the case to a person.',
    ],
    steps,
    generated_at: new Date().toISOString(),
  };
}

export function toAgentMarkdown(workMap) {
  const doc = toAgentInstructions(workMap);
  const out = [`# ${doc.process}`, '', ...doc.rules.map((r) => `- ${r}`), ''];
  for (const s of doc.steps) {
    out.push(`## Step ${s.n}: ${s.title}`);
    if (s.decide) out.push(`Decide: ${s.decide}`);
    if (s.because) out.push(`Because (expert): "${s.because}"`);
    for (const g of s.guardrails) out.push(`- ${g.kind.replaceAll('_', ' ').toUpperCase()}: ${g.rule} ("${g.expert_words}")`);
    out.push('');
  }
  return out.join('\n');
}
