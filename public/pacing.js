// Question pacing for Capture: what to ask the expert next and whether now is the moment. The brief asks for at
// least three questions per task, each at a natural pause and about something on screen, at least one about a
// guardrail, and no more than three to five per ten minutes. Pure: callers pass the time and the pause state in.

export const PACING = {
  firstAskSec: 8,    // never ask in the first seconds
  gapSec: 25,        // minimum spacing between live questions
  catchUpGapSec: 6,  // spacing until the required minimum has been asked
  minQuestions: 3,   // required by the brief
  maxPer10Min: 5,    // the rest waits for the debrief
  maxOpenQuestions: 6, // "Answer open questions" after the task: the most important ones, not every queued one
  freshSec: 45,      // a question about something older than this is no longer about what is on screen
  stillFreshSec: 180, // ...unless the screen has not changed since, and the required minimum is still missing
};

export const FALLBACK_GUARDRAIL_QUESTION = "Is there a limit here, or a case where you'd stop and ask someone?";

const hasKind = (seg, kind) => seg.result.questions.some((q) => q.kind === kind);
// How decisive a described segment is: one with a branch question wins, then one that sets an effect.
const decisive = (seg) => (hasKind(seg, 'branch') ? 2 : 0) + (seg.result.slots?.effect ? 1 : 0);
const addFallback = (seg) => {
  const branch = seg.result.questions.find((q) => q.kind === 'branch');
  const q = { frame: branch?.frame ?? Math.max((seg.frames?.length ?? 1) - 1, 0), text: FALLBACK_GUARDRAIL_QUESTION, kind: 'guardrail' };
  seg.result.questions.push(q);
  return q;
};

// After the fact (questions asked on the recording): if the model asked no guardrail question at all, add one on
// the most decisive described segment; ties go to the later one, where the commit usually happens. Idempotent.
export function ensureGuardrailQuestion(segments) {
  const described = segments.filter((s) => s.result);
  if (!described.length || described.some((s) => hasKind(s, 'guardrail'))) return null;
  const pick = described.reduce((best, s) => (decisive(s) >= decisive(best) ? s : best));
  addFallback(pick);
  return pick;
}

// The questions worth asking on the recording: a guardrail first, then decisions, then missing details; at most
// `max`. Returned in video order, so playback moves forward through them. items: [{ s, q, time }]
export function selectOpenQuestions(items, max = PACING.maxOpenQuestions) {
  const rank = (it) => (it.q.kind === 'guardrail' ? 0 : it.q.kind === 'branch' ? 1 : 2);
  const keep = new Set([...items].sort((a, b) => rank(a) - rank(b) || a.time - b.time).slice(0, max));
  return items.filter((it) => keep.has(it)).sort((a, b) => a.time - b.time);
}

export function createPacer(opts = {}) {
  const o = { ...PACING, ...opts };
  const queue = [];
  const askTimes = [];
  let asked = 0, guardrailAsked = false, guardrailQueued = false, lastAskEnd = -Infinity, lastSeg = null;

  const rank = (it) => (it.q.kind === 'guardrail' ? 3 : it.q.kind === 'branch' ? 2 : 1) + (it.q.kind === 'guardrail' && !guardrailAsked ? 2 : 0);

  return {
    get asked() { return asked; },
    get guardrailAsked() { return guardrailAsked; },
    get met() { return asked >= o.minQuestions && guardrailAsked; },
    get minQuestions() { return o.minQuestions; },

    // What the brief still wants before the task may end, or null once it is met: shown in the island, and the
    // reason Stop asks for a second click.
    shortfall() {
      if (this.met) return null;
      const more = Math.max(o.minQuestions - asked, 0);
      const parts = [];
      if (more) parts.push(`${more} more question${more === 1 ? '' : 's'}`);
      if (!guardrailAsked) parts.push('one about a guardrail');
      return `Asked ${asked} of ${o.minQuestions}; still missing ${parts.join(' and ')}.`;
    },

    // A described segment: its questions join the queue. Live, the guardrail question cannot wait for the end of
    // the task, so the first decisive segment gets the fallback if the model has offered none yet.
    add(seg) {
      lastSeg = seg;
      if (!guardrailQueued && !hasKind(seg, 'guardrail') && decisive(seg) > 0) addFallback(seg);
      for (const q of seg.result.questions) {
        if (q.kind === 'guardrail') guardrailQueued = true;
        queue.push({ s: seg, q, time: seg.frameTimes?.[q.frame] ?? seg.tStart });
      }
    },

    // Guardrails first, then decisions, then missing slots; only about what is still fresh.
    // idleFor: seconds the screen has been unchanged. A screen that stays put keeps its questions fresh while the
    // minimum is still missing, so a quiet screen cannot stall the count; a missing guardrail question is made up
    // from the latest segment once only one question is left to reach the minimum.
    // -> { ask: item } | { hold: 'typing' | 'speaking' | 'later', item } | null (nothing to ask)
    next({ t, screenActive, voiceActive, idleFor = 0 }) {
      if (!guardrailAsked && lastSeg && asked >= o.minQuestions - 1 && !queue.some((it) => !it.q.asked && it.q.kind === 'guardrail')) {
        guardrailQueued = true;
        const q = addFallback(lastSeg);
        queue.push({ s: lastSeg, q, time: lastSeg.frameTimes?.[q.frame] ?? lastSeg.tStart });
      }
      const fresh = (it) => {
        const age = t - it.s.tEnd;
        return age < o.freshSec || (!this.met && age < o.stillFreshSec && idleFor >= age - 1);
      };
      const item = queue.filter((it) => !it.q.asked && fresh(it)).sort((a, b) => rank(b) - rank(a) || b.time - a.time)[0];
      if (!item) return null;
      if (screenActive) return { hold: 'typing', item };
      if (voiceActive) return { hold: 'speaking', item };
      const gap = asked < o.minQuestions ? o.catchUpGapSec : o.gapSec;
      const recent = askTimes.filter((a) => t - a < 600).length;
      if (t < o.firstAskSec || t - lastAskEnd < gap || recent >= o.maxPer10Min) return { hold: 'later', item };
      return { ask: item };
    },

    began(item, t) {
      item.q.asked = true;
      asked++;
      if (item.q.kind === 'guardrail') guardrailAsked = true;
      askTimes.push(t);
    },
    ended(t) { lastAskEnd = t; },
  };
}
