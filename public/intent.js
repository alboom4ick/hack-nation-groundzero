// Intent turns: the apprentice asks BEFORE the next action, not after it. At a pause the screen shows the state
// the expert is about to change, so that is the moment to say "hey, what are you about to do?"; the answer
// ("I'm choosing the yellow bottle") is kept for the step that follows, then the apprentice says go ahead.
// Pure: callers pass the time and the pause state in.

export const INTENT_QUESTION = 'Hey, what are you about to do next, and why?';
export const GO_AHEAD = 'Okay, go ahead.';
export const INTRO_TEXT = "Hi, I'm your apprentice. I'll watch your screen and listen. Before each move, tell me what you're about to do and why, for example: I'm choosing the yellow bottle. I'll say go ahead, then you do it. Say off the record any time to pause me.";

export const INTENT = {
  firstSec: 6,   // first intent turn after this much time on the record
  gapSec: 25,    // minimum spacing between intent turns
  maxPer10Min: 12,
};

export function createIntentGate(opts = {}) {
  const o = { ...INTENT, ...opts };
  const turns = [];
  let lastEnd = -Infinity, movedSince = true;
  return {
    get count() { return turns.length; },
    // The expert did something since the last intent turn: a new pause is worth a new question.
    moved() { movedSince = true; },
    // Ask only at a pause (screen still, person not talking), only if something happened since the last turn.
    shouldAsk({ t, screenActive, voiceActive, idleFor = 0 }) {
      if (screenActive || voiceActive || !movedSince) return false;
      if (t < o.firstSec || t - lastEnd < o.gapSec) return false;
      return turns.filter((a) => t - a < 600).length < o.maxPer10Min && idleFor >= 0;
    },
    began(t) { turns.push(t); movedSince = false; },
    ended(t) { lastEnd = t; },
  };
}

// Each intent belongs to the first segment that ends after it was said: the step that follows the question.
// An intent after the last segment (the task ended) stays with the last one.
export function attachIntents(segments, intents) {
  const out = new Map(segments.map((s) => [s.id, []]));
  if (!segments.length) return out;
  const ordered = [...segments].sort((a, b) => a.tStart - b.tStart);
  for (const it of intents) {
    const seg = ordered.find((s) => s.tEnd > it.t) ?? ordered.at(-1);
    out.get(seg.id).push(it);
  }
  return out;
}

export const intentAnswer = (it) => ({ question: INTENT_QUESTION, answer: it.answer, t: it.t, kind: 'intent' });
