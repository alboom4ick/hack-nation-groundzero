// E6: a small MCP server (JSON-RPC over HTTP, POST /mcp) that lets the tutor look up the expert's guardrails
// instead of relying on the prompt alone. Serves the agent export of one Work Map; read-only.
import { toAgentInstructions } from '../public/agent-export.js';

const PROTOCOL = '2025-03-26';
const norm = (s) => String(s ?? '').toLowerCase();

export const TOOLS = [{
  name: 'lookup_guardrails',
  description: "Look up the expert's limits, exceptions and stop-and-ask conditions. Give a step id (s4) or a search word (capex, December, asset), or nothing for all of them.",
  inputSchema: { type: 'object', properties: { step_id: { type: 'string', description: 'Work Map step id, e.g. s4' }, query: { type: 'string', description: 'word to search in rules and expert quotes' } } },
}];

export function lookupGuardrails(workMap, { step_id, query } = {}) {
  const doc = toAgentInstructions(workMap);
  const q = norm(query).trim();
  const out = [];
  for (const s of doc.steps) {
    if (step_id && s.id !== step_id) continue;
    for (const g of s.guardrails) {
      if (q && !norm(`${g.rule} ${g.expert_words} ${s.title}`).includes(q)) continue;
      out.push({ step_id: s.id, step: s.title, kind: g.kind, rule: g.rule, expert_words: g.expert_words });
    }
  }
  return { process: doc.process, guardrails: out };
}

// Handles one JSON-RPC message; returns the response object, or null for notifications.
export function handleMcp(workMap, msg) {
  const ok = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (msg?.id === undefined) return null;
  switch (msg.method) {
    case 'initialize': return ok({ protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'groundzero-guardrails', version: '1.0.0' } });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      if (msg.params?.name !== 'lookup_guardrails') return err(-32602, 'unknown tool');
      const res = lookupGuardrails(workMap, msg.params.arguments ?? {});
      return ok({ content: [{ type: 'text', text: JSON.stringify(res) }], isError: false });
    }
    default: return err(-32601, `method not found: ${msg.method}`);
  }
}
