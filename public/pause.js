// When may the apprentice speak? Only at a natural pause: the screen has been still for a moment and the person
// is not talking. Pure: callers pass pixels, levels and the time in.

// Is the person talking right now? Scribe v2 Realtime answers that when it is connected: a partial transcript
// means speech is in progress, and a committed transcript (its VAD saw the silence) means they have paused.
// Without Scribe the fallback is the microphone level.
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

export const PAUSE = {
  pixelDelta: 60,   // summed RGB difference that counts as a changed pixel
  activePixels: 4,  // changed pixels that count as "something moved" (a caret or a few typed characters)
  idleSec: 0.8,     // the screen must be still this long (short: a question that is ready is asked almost at once)
  quietSec: 0.5,    // and the person must not be talking
  voiceLevel: 0.02, // microphone RMS that counts as speech when Scribe is not connected
};

// Screen activity and the voice gate together: busy while the person types, reads along a moving screen or talks.
export function createPauseDetector(opts = {}) {
  const o = { ...PAUSE, ...opts };
  const gate = createVoiceGate({ quietSec: o.quietSec });
  let prev = null, lastActivity = 0, lastChanged = 0;
  return {
    gate,
    // pixels: RGBA bytes of a small probe of the screen. True when enough of it changed since the last probe.
    screen(pixels, t) {
      let changed = 0;
      if (prev) {
        for (let p = 0; p < pixels.length; p += 4) {
          if (Math.abs(pixels[p] - prev[p]) + Math.abs(pixels[p + 1] - prev[p + 1]) + Math.abs(pixels[p + 2] - prev[p + 2]) > o.pixelDelta) changed++;
        }
      }
      prev = pixels;
      lastChanged = changed;
      if (changed < o.activePixels) return false;
      lastActivity = t;
      return true;
    },
    get changed() { return lastChanged; }, // pixels that changed in the latest probe
    voice(level, t) { if (level > o.voiceLevel) gate.level(t); },
    // After a gap in watching (off the record): forget the old screen and start the idle clock again.
    reset(t) { prev = null; lastActivity = t; },
    state(t) {
      const idleFor = t - lastActivity;
      const screenActive = idleFor < o.idleSec, voiceActive = gate.active(t);
      return { idleFor, screenActive, voiceActive, paused: !screenActive && !voiceActive };
    },
  };
}
