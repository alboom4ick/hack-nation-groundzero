// Debrief: what Map does once the task is over. It asks the follow-ups the Work Map left unclear, rebuilds the map
// with the answers, then explains the process back until the expert confirms. It owns the Work Map being built
// (steps, follow-ups, teach-back), so "has the apprentice understood" has one answer. Pure of DOM and network:
//   build(answeredFollowups) -> { steps, unclear, dropped }     the Work Map from the capture plus these answers
//   explain(steps) -> { text }                                   the teach-back
//   judge(explanation, reply) -> { confirmed, correction }
import { debriefStatus, toWorkMap, forget } from './workmap.js';

export const TEACHBACK_ROUNDS = 3; // the first explanation plus two corrected ones

export function createDebrief({ build, explain, judge, onChange = () => {} }) {
  let steps = [], unclear = [], followups = [], teachBack = null;
  const asked = (question) => followups.some((f) => f.question === question);

  // Follow-ups the expert was already asked are not asked again.
  const rebuild = async () => {
    const data = await build(followups.filter((f) => f.answer));
    steps = data.steps;
    unclear = data.unclear.filter((u) => !asked(u.question));
    onChange();
    return data;
  };

  return {
    get steps() { return steps; },
    get followups() { return followups; },
    get teachBack() { return teachBack; },
    get built() { return steps.length > 0; },
    // What is still unclear: follow-ups without an answer yet.
    get open() { return unclear.filter((u) => !followups.some((f) => f.question === u.question && f.answer)); },
    get status() { return debriefStatus({ followups, teachBack }); },

    // A new capture: nothing carries over.
    reset() { steps = []; unclear = []; followups = []; teachBack = null; },
    // The first Work Map of a capture: earlier debrief answers are dropped with it.
    start() { followups = []; teachBack = null; return rebuild(); },
    // A5, after the fact: the expert takes a step, reason, guardrail or answer off the record.
    forget(target) { ({ steps, followups, teachBack } = forget({ steps, followups, teachBack }, target)); onChange(); },
    workMap: (video) => toWorkMap({ video, steps, followups, teachBack }),

    // ask(text, { teachback, n, total }) -> what the expert said, or null (silence, skipped).
    // stopped() -> true once the expert ended the debrief; whatever was answered so far is kept.
    async run({ ask, stopped = () => false, onPhase = () => {} }) {
      const queue = unclear.filter((u) => !asked(u.question));
      for (const [i, u] of queue.entries()) {
        if (stopped()) return;
        const answer = await ask(u.question, { teachback: false, n: i + 1, total: queue.length });
        followups.push({ step: u.step, question: u.question, answer: answer || null });
        onChange();
      }
      if (stopped()) return;
      onPhase('Updating the Work Map with your answers…');
      await rebuild();

      for (let round = 0; round < TEACHBACK_ROUNDS && !stopped(); round++) {
        onPhase('Preparing the teach-back…');
        const { text } = await explain(steps);
        teachBack = { text, confirmed: false, correction: null };
        onChange();
        const reply = await ask(text, { teachback: true });
        if (!reply) return;
        const verdict = await judge(text, reply);
        teachBack = { text, ...verdict };
        onChange();
        if (verdict.confirmed) return;
        // A correction is the expert's own words too: it becomes an answer the next Work Map is built from.
        followups.push({ step: null, question: `Correction to teach-back: ${text}`, answer: verdict.correction ?? reply });
        onPhase('Updating the Work Map with your correction…');
        await rebuild();
      }
    },
  };
}
