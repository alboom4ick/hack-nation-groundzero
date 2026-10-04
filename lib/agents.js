// ElevenAgents plumbing: create the client tools and the two agents (interviewer, tutor), and mint signed URLs
// so the browser can talk to an agent without ever seeing the API key.
import { TOOLS, INTERVIEWER_PROMPT, INTERVIEWER_FIRST_MESSAGE, TUTOR_PROMPT_BASE, TUTOR_FIRST_MESSAGE } from '../public/agent-prompts.js';

const API = 'https://api.elevenlabs.io/v1/convai';
export const DEFAULT_LLM = 'claude-sonnet-4-5';
export const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';

async function call(path, { method = 'GET', body, key, fetchImpl = fetch }) {
  const res = await fetchImpl(`${API}${path}`, { method, headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

// Prompt, first message and language are overridable per session so the tutor can be given the Work Map at start.
export const OVERRIDES = {
  conversation_config_override: { agent: { prompt: { prompt: true }, first_message: true, language: true }, tts: { voice_id: true } },
};

export function agentConfig(role, { toolIds = [], llm = DEFAULT_LLM, voiceId = DEFAULT_VOICE, expressive = true } = {}) {
  const tutor = role === 'tutor';
  return {
    name: tutor ? 'AI Apprentice: Tutor' : 'AI Apprentice: Interviewer',
    tags: ['groundzero'],
    conversation_config: {
      agent: {
        first_message: tutor ? TUTOR_FIRST_MESSAGE : INTERVIEWER_FIRST_MESSAGE,
        language: 'en',
        prompt: { prompt: tutor ? TUTOR_PROMPT_BASE : INTERVIEWER_PROMPT, llm, tool_ids: toolIds },
      },
      tts: { voice_id: voiceId, ...(expressive ? { model_id: 'eleven_v3_conversational', expressive_mode: true } : { model_id: 'eleven_flash_v2' }) },
      conversation: { client_events: ['audio', 'interruption', 'user_transcript', 'agent_response'] },
    },
    platform_settings: { overrides: OVERRIDES },
  };
}

export async function createTool(def, key, fetchImpl) {
  return (await call('/tools', { method: 'POST', body: { tool_config: def }, key, fetchImpl })).id;
}

export async function createAgent(role, opts, key, fetchImpl) {
  const toolIds = [];
  for (const def of TOOLS[role]) toolIds.push(await createTool(def, key, fetchImpl));
  const { agent_id } = await call('/agents/create', { method: 'POST', body: agentConfig(role, { ...opts, toolIds }), key, fetchImpl });
  return agent_id;
}

export async function signedUrl(agentId, key, fetchImpl) {
  return (await call(`/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, { key, fetchImpl })).signed_url;
}
