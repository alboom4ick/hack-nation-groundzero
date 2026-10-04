// What is on the shared screen right now, as the agent can pull it: the last few described events, newest last.
// The push path (contextual updates) keeps the agent informed silently; this is the pull path behind the
// get_screen_state client tool, for when the agent wants to check the screen before it asks or answers.
export function createScreenLog({ max = 5 } = {}) {
  const events = [];
  return {
    record(text) {
      const t = String(text ?? '').replace(/^\[SCREEN\]\s*/, '').trim();
      if (t) events.push({ t, at: Date.now() });
      if (events.length > max) events.shift();
    },
    // -> the text the tool returns to the agent
    state() {
      if (!events.length) return 'Nothing has been seen on the screen yet.';
      const ago = (e) => `${Math.max(0, Math.round((Date.now() - e.at) / 1000))}s ago`;
      return events.map((e, i) => `${i === events.length - 1 ? 'latest' : 'earlier'} (${ago(e)}): ${e.t}`).join('\n');
    },
  };
}
