// Is the person talking right now? Scribe v2 Realtime answers that when it is connected: a partial transcript
// means speech is in progress, and a committed transcript (its VAD saw the silence) means they have paused.
// Without Scribe the fallback is the microphone level. Pure: callers pass the time in.
const STALE = 4; // a partial with no commit for this long is treated as ended (a lost event must not block questions)

export function createVoiceGate({ quietSec = 1.8 } = {}) {
  let scribe = false, speaking = false, lastPartial = -Infinity, lastLevel = -Infinity;
  return {
    setScribe: (on) => { scribe = !!on; if (!on) speaking = false; },
    partial: (t) => { speaking = true; lastPartial = t; },
    committed: () => { speaking = false; },
    level: (t) => { lastLevel = t; },
    get usingScribe() { return scribe; },
    active: (t) => (scribe ? speaking && t - lastPartial < STALE : t - lastLevel < quietSec),
  };
}
