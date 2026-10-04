// One-off: creates the ElevenAgents interviewer and tutor on your ElevenLabs account and stores their ids in .env.
// Needs an API key with the Agents (convai) read+write permission.   Run: node scripts/setup-agents.js
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createAgent, DEFAULT_LLM } from '../lib/agents.js';

const envFile = join(fileURLToPath(new URL('..', import.meta.url)), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const key = process.env.ELEVENLABS_API || process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('No ElevenLabs key in .env (ELEVENLABS_API).'); process.exit(1); }

const llm = process.env.ELEVENAGENTS_LLM || DEFAULT_LLM;
const voiceId = process.env.ELEVENLABS_VOICE_ID || undefined;
const expressive = process.env.ELEVENAGENTS_EXPRESSIVE !== '0';
const have = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';

for (const [role, name] of [['interviewer', 'ELEVENAGENTS_INTERVIEWER_ID'], ['tutor', 'ELEVENAGENTS_TUTOR_ID']]) {
  if (process.env[name]) { console.log(`${role}: already set (${process.env[name]}), skipping`); continue; }
  try {
    const id = await createAgent(role, { llm, voiceId, expressive }, key);
    appendFileSync(envFile, `${have.endsWith('\n') || !have ? '' : '\n'}${name}=${id}\n`);
    console.log(`${role}: created ${id}`);
  } catch (err) {
    console.error(`${role}: ${err.message}`);
    if (/permission/i.test(err.message)) console.error('→ enable Agents read/write on the API key (elevenlabs.io → Developers → API Keys).');
    if (/model_id|expressive/i.test(err.message)) console.error('→ retry with ELEVENAGENTS_EXPRESSIVE=0 node scripts/setup-agents.js');
    process.exit(1);
  }
}
