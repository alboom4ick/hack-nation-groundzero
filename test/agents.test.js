import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agentConfig, createAgent, signedUrl, OVERRIDES } from '../lib/agents.js';
import { TOOLS, tutorPrompt, INTERVIEWER_PROMPT } from '../public/agent-prompts.js';

const workMap = JSON.parse(readFileSync(new URL('../public/workmaps/invoice_demo.json', import.meta.url)));

test('tutor prompt carries the Work Map: decisions, quotes, guardrails; first step is not prediction-tested', () => {
  const p = tutorPrompt(workMap);
  assert.match(p, /Equipment over 5,000 euro is always capex/);
  assert.match(p, /"step_id": "s4"/);
  assert.match(p, /Without an asset number I do not book capex/);
  const steps = JSON.parse(p.slice(p.indexOf('Work Map:\n') + 'Work Map:\n'.length));
  assert.equal(steps.length, 7);
  assert.equal(steps[0].tested_by_prediction, false);
  assert.equal(steps.find((s) => s.step_id === 's4').tested_by_prediction, true);
  assert.equal(steps.find((s) => s.step_id === 's6').tested_by_prediction, false, 'routine steps are not tested');
});

test('every tool the prompts mention is registered, with a valid client-tool schema', () => {
  const names = (role) => TOOLS[role].map((t) => t.name);
  for (const n of ['set_step', 'record_prediction', 'hand_back', 'finish_lesson']) assert.ok(names('tutor').includes(n));
  assert.deepEqual(names('interviewer'), ['question_done', 'get_screen_state']);
  assert.ok(names('tutor').includes('get_screen_state'));
  assert.equal(TOOLS.tutor.find((t) => t.name === 'get_screen_state').expects_response, true, 'a pull tool must return its answer');
  assert.match(INTERVIEWER_PROMPT, /question_done/);
  for (const t of Object.values(TOOLS).flat()) {
    assert.equal(t.type, 'client');
    assert.equal(t.parameters.type, 'object');
    for (const r of t.parameters.required) assert.ok(t.parameters.properties[r]);
  }
});

test('agentConfig lets the browser override prompt and first message, and enables expressive mode', () => {
  const c = agentConfig('tutor', { toolIds: ['t1'] });
  assert.equal(c.conversation_config.agent.prompt.llm, 'claude-sonnet-4-5');
  assert.deepEqual(c.conversation_config.agent.prompt.tool_ids, ['t1']);
  assert.equal(c.conversation_config.tts.expressive_mode, true);
  assert.equal(c.platform_settings.overrides, OVERRIDES);
  assert.equal(OVERRIDES.conversation_config_override.agent.prompt.prompt, true);
  assert.equal(OVERRIDES.conversation_config_override.agent.first_message, true);
  assert.equal(agentConfig('interviewer', { expressive: false }).conversation_config.tts.model_id, 'eleven_flash_v2');
  assert.equal(agentConfig('interviewer').conversation_config.agent.first_message, '', 'interviewer never speaks first');
});

test('createAgent registers each tool, then the agent with their ids; signedUrl keeps the key server-side', async () => {
  const calls = [];
  let n = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', key: init.headers['xi-api-key'], body: init?.body && JSON.parse(init.body) });
    const json = url.endsWith('/tools') ? { id: `tool_${++n}` } : url.includes('get-signed-url') ? { signed_url: 'wss://x' } : { agent_id: 'agent_1' };
    return { ok: true, text: async () => JSON.stringify(json) };
  };
  assert.equal(await createAgent('tutor', {}, 'KEY', fetchImpl), 'agent_1');
  const tools = calls.filter((c) => c.url.endsWith('/tools'));
  assert.equal(tools.length, TOOLS.tutor.length);
  const create = calls.at(-1);
  assert.match(create.url, /\/agents\/create$/);
  assert.deepEqual(create.body.conversation_config.agent.prompt.tool_ids, ['tool_1', 'tool_2', 'tool_3', 'tool_4', 'tool_5']);
  assert.ok(calls.every((c) => c.key === 'KEY'));
  assert.equal(await signedUrl('agent 1', 'KEY', fetchImpl), 'wss://x');
  assert.match(calls.at(-1).url, /agent_id=agent%201$/);
  await assert.rejects(createAgent('tutor', {}, 'K', async () => ({ ok: false, status: 401, text: async () => 'no' })), /ElevenLabs 401/);
});
