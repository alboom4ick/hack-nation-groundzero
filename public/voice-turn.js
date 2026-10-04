// Voice turn: one thing asked aloud and what the person said back. Capture, the questions on the recording and the
// debrief all ask through this, so they share one voice and one rule for what is kept: the answer leaves here
// already redacted, and a cancelled turn (skip, stop, off the record) yields nothing.
// Two adapters: the ElevenAgents interviewer when it is set up, else the built-in voice (TTS, then STT).
// Pure of DOM: the built-in adapter is handed its speech primitives (voice.js in the browser).
import { openAgent, agentAvailable } from './agent.js';
import { createAsker, askCue } from './asker.js';
import { redact } from './redact.js';

const MAX_SPOKEN = 480; // /api/tts accepts 500 chars

// Whole sentences, packed into as few parts as fit the TTS limit.
function sentences(text, max = MAX_SPOKEN) {
  const out = [];
  for (const s of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    if (out.length && (out.at(-1) + s).length <= max) out[out.length - 1] += s;
    else out.push(s);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

// speech: { speak(text), listen() -> Blob|null, transcribe(blob) -> text, interrupt() }
// say and hear are the two halves of ask, for a caller that speaks without wanting an answer (the scripted tutor).
export function builtinVoice(speech, { onState = () => {} } = {}) {
  let turn = null; // the turn in flight; cancel marks it and cuts off whatever is playing or recording
  const begin = () => (turn = { cancelled: false });
  const say = async (text, t) => {
    onState('speaking');
    const parts = sentences(String(text));
    parts.slice(0, 2).forEach((q) => speech.prefetch?.(q));
    for (const [i, part] of parts.entries()) {
      if (t.cancelled) break;
      if (parts[i + 1]) speech.prefetch?.(parts[i + 1]);
      await speech.speak(part);
    }
    return !t.cancelled;
  };
  const hear = async (t) => {
    onState('listening');
    const blob = await speech.listen();
    if (!blob || t.cancelled) return '';
    onState('thinking');
    const text = redact(String(await speech.transcribe(blob) ?? '').trim());
    return t.cancelled ? '' : text;
  };
  const cancel = () => { if (turn) turn.cancelled = true; speech.interrupt(); };
  return {
    ask: async (text) => { const t = begin(); return (await say(text, t)) ? hear(t) : ''; },
    say: async (text) => { await say(text, begin()); },
    hear: () => hear(begin()),
    context: () => {}, // the built-in voice has no memory of the screen
    cancel,
    close: cancel,
  };
}

// The agent's mic is open only while a turn is out, so it can never chime in on its own.
// The teach-back is long and the agent's LLM may not voice it, so it is spoken by the built-in voice (same TTS voice);
// the agent only puts the closing question and listens.
const CONFIRM = 'Did I get that right?';
function agentVoice(agent, asker, builtin, { onState, onError }) {
  let turn = null;
  const cancel = () => { if (turn) turn.cancelled = true; asker.cancel(); builtin.cancel(); };
  return {
    async ask(text, { kind, teachback = false } = {}) {
      const t = turn = { cancelled: false };
      if (teachback) {
        try { await builtin.say(String(text).replace(/\s*Did I get that right\?\s*$/i, '')); } catch (err) { onError(`teach-back voice failed: ${err.message}`); }
        if (t.cancelled) return '';
      }
      const said = await asker.ask(agent, teachback ? askCue(CONFIRM, 'teachback') : askCue(text, kind), { onListening: () => onState('listening') });
      return t.cancelled ? '' : redact(said);
    },
    context: (text) => { asker.screen.record(text); agent.context(text); },
    cancel,
    close: () => { cancel(); agent.end(); },
  };
}

// -> { ask(text, { kind, teachback }) -> what the person said ('' for nothing), context(text), cancel(), close() }
// kind tags the question for the agent (guardrail, branch, debrief); teachback asks the expert to confirm an explanation.
// onState('speaking' | 'listening' | 'thinking') follows the turn; onNotice reports a fall back to the built-in voice.
export async function openInterviewerVoice({ speech, language, onState = () => {}, onError = () => {}, onNotice = () => {}, timeoutMs, agents = { openAgent, agentAvailable } } = {}) {
  if (await agents.agentAvailable('interviewer')) {
    try {
      const asker = createAsker({ timeoutMs });
      const agent = await agents.openAgent({ role: 'interviewer', firstMessage: '', language, tools: asker.tools, onMessage: asker.onMessage, onError });
      agent.mute(true);
      return agentVoice(agent, asker, builtinVoice(speech, { onState }), { onState, onError });
    } catch (err) {
      onNotice(`ElevenAgents unavailable (${err.message}); using the built-in voice.`);
    }
  }
  return builtinVoice(speech, { onState });
}
