// Browser side of ElevenAgents. The server mints a signed URL (the API key never reaches the page); the
// official SDK then streams mic and speech. Both roles use this: the interviewer (Capture) and the tutor (Teach).
const SDK = 'https://esm.sh/@elevenlabs/client@latest';

let status = null;
export async function agentAvailable(role) {
  try { status ??= await (await fetch('/api/agent/status')).json(); } catch { return false; }
  return !!status?.[role];
}

// tools: { name: async (params) => void }; the agent decides when to call them.
// Returns a handle: send a cue the agent answers (cue), add silent context (context), gate the mic (mute), end.
export async function openAgent({ role, prompt, firstMessage, tools = {}, onMessage = () => {}, onMode = () => {}, onError = () => {} }) {
  const res = await fetch(`/api/agent/session?role=${role}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  const { signedUrl } = await res.json();
  const { Conversation } = await import(/* @vite-ignore */ SDK);
  const overrides = prompt || firstMessage != null ? { agent: { ...(prompt ? { prompt: { prompt } } : {}), ...(firstMessage != null ? { firstMessage } : {}) } } : undefined;
  const conversation = await Conversation.startSession({
    signedUrl, connectionType: 'websocket', overrides,
    clientTools: Object.fromEntries(Object.entries(tools).map(([name, fn]) => [name, async (p) => { await fn(p ?? {}); return 'ok'; }])),
    onMessage, onModeChange: ({ mode }) => onMode(mode), onError: (e) => onError(typeof e === 'string' ? e : e?.message ?? 'agent error'),
  });
  return {
    cue: (text) => conversation.sendUserMessage(text),
    context: (text) => conversation.sendContextualUpdate(text),
    mute: (m) => conversation.setMicMuted(!!m),
    end: () => conversation.endSession(),
  };
}
