import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleMcp, lookupGuardrails } from '../lib/guardrail-mcp.js';

const map = JSON.parse(readFileSync(new URL('../public/workmaps/invoice_demo.json', import.meta.url)));

test('E6: lookup by step and by search word returns the expert words', () => {
  const s4 = lookupGuardrails(map, { step_id: 's4' }).guardrails;
  assert.equal(s4.length, 2);
  assert.ok(s4.some((g) => g.kind === 'stop_and_ask' && /asset number/.test(g.rule)));
  const dec = lookupGuardrails(map, { query: 'december' }).guardrails;
  assert.deepEqual(dec.map((g) => g.step_id), ['s3']);
  assert.equal(lookupGuardrails(map).guardrails.length, 4);
});

test('E6: MCP handshake, tool list and call', () => {
  assert.equal(handleMcp(map, { jsonrpc: '2.0', id: 1, method: 'initialize' }).result.serverInfo.name, 'groundzero-guardrails');
  assert.equal(handleMcp(map, { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(handleMcp(map, { jsonrpc: '2.0', id: 2, method: 'tools/list' }).result.tools[0].name, 'lookup_guardrails');
  const call = handleMcp(map, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lookup_guardrails', arguments: { query: 'capex' } } });
  assert.match(call.result.content[0].text, /5,000/);
  assert.equal(handleMcp(map, { jsonrpc: '2.0', id: 4, method: 'nope' }).error.code, -32601);
  assert.equal(handleMcp(map, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'x' } }).error.code, -32602);
});
