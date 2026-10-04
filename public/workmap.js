// Work Map: the Module-2 deliverable. A clickable timeline where every step carries its screen moment,
// the decision, the reason in the expert's own words and the guardrails around it. Pure logic shared by
// the browser and the server; no DOM.

export const SCHEMA = 'groundzero.work-map/1';
export const GUARDRAIL_KINDS = ['limit', 'exception', 'stop_and_ask'];
export const MIN_FOLLOWUPS = 3;

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Every thing the expert said that a quote may be taken from: live answers (with the video time they
// were given at) and debrief answers (no screen time of their own).
export function wordPool(nodes, debrief = []) {
  const pool = [];
  for (const n of nodes) {
    for (const a of n.answers ?? []) {
      if (a?.answer) pool.push({ text: a.answer, norm: norm(a.answer), node: n.id, t: Number.isFinite(a.t) ? a.t : n.video_segment.t_start, source: 'live' });
    }
  }
  for (const d of debrief) {
    if (d?.answer) pool.push({ text: d.answer, norm: norm(d.answer), node: null, t: null, source: 'debrief' });
  }
  return pool;
}

// A quote counts only if it appears verbatim (ignoring case and punctuation) in something the expert said.
// Prefers the answer given inside the step's own source nodes.
function ground(quote, pool, sources) {
  const q = norm(quote ?? '');
  if (q.split(' ').length < 2) return null;
  const hits = pool.filter((p) => p.norm.includes(q));
  return hits.find((p) => p.node && sources.includes(p.node)) ?? hits[0] ?? null;
}

// LLM output is untrusted. Steps keep only known source nodes; quotes that are not the expert's
// words are dropped (and counted) rather than shown as if the expert had said them.
export function sanitizeWorkMap(raw, nodes, debrief = []) {
  const known = new Map(nodes.map((n) => [n.id, n]));
  const pool = wordPool(nodes, debrief);
  const dropped = { quotes: 0, steps: 0 };
  const steps = [];
  for (const s of Array.isArray(raw?.steps) ? raw.steps : []) {
    const sources = [...new Set((Array.isArray(s?.source) ? s.source : []).filter((id) => known.has(id)))];
    if (!sources.length) { dropped.steps++; continue; }
    const segs = sources.map((id) => known.get(id).video_segment);
    const t = Math.min(...segs.map((v) => v.t_start));
    const moment = (hit) => ({ t: hit?.t ?? t, node: hit?.node ?? sources[0] });
    const own = (quote) => {
      const hit = ground(quote, pool, sources);
      if (quote && !hit) dropped.quotes++;
      return hit;
    };

    const hit = own(s.reason?.quote);
    const guardrails = [];
    for (const g of Array.isArray(s.guardrails) ? s.guardrails : []) {
      const gh = own(g?.quote);
      const rule = str(g?.rule, 200);
      if (gh && rule && GUARDRAIL_KINDS.includes(g.kind)) {
        guardrails.push({ kind: g.kind, rule, words: gh.text.trim().slice(0, 300), source: gh.source, screen_moment: moment(gh) });
      }
    }
    const decision = str(s.decision, 200) || null;
    steps.push({
      id: '',
      title: str(s.title, 60) || known.get(sources[0]).description.split(/\s+/).slice(0, 6).join(' '),
      screen_moment: { t, t_end: Math.max(...segs.map((v) => v.t_end)), nodes: sources, uri: segs[0].uri },
      decision,
      reason: hit ? { words: hit.text.trim().slice(0, 300), source: hit.source, screen_moment: moment(hit) } : null,
      needs_reason: !!decision && !hit,
      guardrails,
    });
  }
  steps.sort((a, b) => a.screen_moment.t - b.screen_moment.t).forEach((s, i) => { s.id = `s${i + 1}`; });

  // The debrief must ask about what the screen and the live answers did not settle.
  const unclear = [];
  const seen = new Set();
  const add = (step, question, why) => {
    const text = str(question, 160);
    if (text && !seen.has(norm(text))) { seen.add(norm(text)); unclear.push({ step, question: text, why: str(why, 160) }); }
  };
  const stepIds = new Set(steps.map((s) => s.id));
  for (const u of Array.isArray(raw?.unclear) ? raw.unclear : []) add(stepIds.has(u?.step) ? u.step : null, u?.question, u?.why);
  for (const s of steps) {
    if (s.needs_reason) add(s.id, `Why did you decide to ${s.decision.replace(/[.?!]+$/, '').toLowerCase()}?`, 'decision without a stated reason');
  }
  return { steps, unclear: unclear.slice(0, 8), dropped };
}

// The debrief counts as closed only with enough follow-ups answered and a teach-back the expert confirmed.
export function debriefStatus({ followups = [], teachBack = null } = {}) {
  const answered = followups.filter((f) => f.answer).length;
  return {
    followups_answered: answered,
    followups_ok: answered >= MIN_FOLLOWUPS,
    confirmed: teachBack?.confirmed === true,
    complete: answered >= MIN_FOLLOWUPS && teachBack?.confirmed === true,
  };
}

export function toWorkMap({ video, steps, followups = [], teachBack = null }) {
  const name = (video?.name ?? 'process').replace(/\.[^.]+$/, '');
  return {
    schema: SCHEMA,
    process: { name },
    steps,
    debrief: {
      followups: followups.map((f) => ({ step: f.step ?? null, question: f.question, answer: f.answer ?? null })),
      teach_back: teachBack ? { text: teachBack.text, confirmed: teachBack.confirmed === true, correction: teachBack.correction ?? null } : null,
      ...debriefStatus({ followups, teachBack }),
    },
    generated_at: new Date().toISOString(),
    video,
  };
}

export const FALLBACK_GUARDRAIL_QUESTION = "Is there a limit here, or a case where you'd stop and ask someone?";

// The brief requires at least one guardrail question per task. If the model asked none, add one on the
// most decisive described segment: a step with a branch question wins, then one that sets an effect;
// ties go to the later segment, where the commit usually happens. Idempotent. Returns the segment or null.
export function ensureGuardrailQuestion(segments) {
  const described = segments.filter((s) => s.result);
  if (!described.length || described.some((s) => s.result.questions.some((q) => q.kind === 'guardrail'))) return null;
  const score = (s) => (s.result.questions.some((q) => q.kind === 'branch') ? 2 : 0) + (s.result.slots?.effect ? 1 : 0);
  const pick = described.reduce((best, s) => (score(s) >= score(best) ? s : best));
  const branch = pick.result.questions.find((q) => q.kind === 'branch');
  pick.result.questions.push({ frame: branch?.frame ?? Math.max((pick.frames?.length ?? 1) - 1, 0), text: FALLBACK_GUARDRAIL_QUESTION, kind: 'guardrail' });
  return pick;
}
