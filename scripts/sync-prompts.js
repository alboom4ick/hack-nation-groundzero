// Pushes the current interviewer and tutor prompts (public/agent-prompts.js) to the agents already registered by
// setup-agents.js, touching only the prompt text (tools, voice, knowledge base stay).   Run: node scripts/sync-prompts.js
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { INTERVIEWER_PROMPT, TUTOR_PROMPT_BASE } from '../public/agent-prompts.js';

const envFile = join(fileURLToPath(new URL('..', import.meta.url)), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const key = process.env.ELEVENLABS_API || process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('No ElevenLabs key in .env (ELEVENLABS_API).'); process.exit(1); }

const API = 'https://api.elevenlabs.io/v1/convai/agents';
const call = async (id, method, body) => {
  const res = await fetch(`${API}/${encodeURIComponent(id)}`, { method, headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

for (const [role, env, prompt] of [['interviewer', 'ELEVENAGENTS_INTERVIEWER_ID', INTERVIEWER_PROMPT], ['tutor', 'ELEVENAGENTS_TUTOR_ID', TUTOR_PROMPT_BASE]]) {
  const id = process.env[env];
  if (!id) { console.log(`${role}: ${env} not set, skipping`); continue; }
  await call(id, 'PATCH', { conversation_config: { agent: { prompt: { prompt } } } });
  const live = (await call(id, 'GET')).conversation_config?.agent?.prompt?.prompt;
  console.log(`${role}: ${live === prompt ? 'in sync' : 'MISMATCH after patch'} (${id})`);
}
