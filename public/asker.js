// One question at a time against an ElevenAgents agent whose mic is otherwise muted: unmute, cue it, collect what
// the person says until the agent calls question_done (or the timeout fires), mute again. Shared by Capture and the
// debrief so both have the same voice. Pure of DOM; the agent handle comes from agent.js.
export function createAsker({ timeoutMs = 70000 } = {}) {
  let finish = null;
  let heard = [];
  return {
    // client tool + message hook to pass to openAgent
    tools: { question_done: () => finish?.() },
    onMessage: ({ source, message }) => { if (source === 'user' && finish) heard.push(message); },
    get active() { return !!finish; },
    cancel: () => finish?.(),
    ask(agent, cue, { onListening = () => {} } = {}) {
      finish?.();
      heard = [];
      return new Promise((resolve) => {
        let timer;
        const done = () => { if (finish !== done) return; clearTimeout(timer); finish = null; agent.mute(true); resolve(heard.join(' ').trim()); };
        finish = done;
        timer = setTimeout(done, timeoutMs);
        agent.mute(false);
        onListening();
        agent.cue(cue);
      });
    },
  };
}

export const askCue = (text, kind) => `[ASK${kind ? `:${kind}` : ''}] "${String(text).replace(/"/g, "'")}"`;
export const teachbackCue = (text) => `[TEACHBACK] "${String(text).replace(/"/g, "'")}"`;
export const screenContext = (description, questions = []) =>
  `[SCREEN] ${description}${questions.length ? ` Possible questions: ${questions.map((q) => `(${q.kind}) ${q.text}`).join(' | ')}` : ''}`;
