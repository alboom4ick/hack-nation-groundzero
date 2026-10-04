// Work Map: the Module-2 deliverable. A clickable timeline where every step carries its screen moment,
// the decision, the reason in the expert's own words and the guardrails around it. Pure logic shared by
// the browser and the server; no DOM.

export const SCHEMA = 'groundzero.work-map/1';
export const GUARDRAIL_KINDS = ['limit', 'exception', 'stop_and_ask'];
export const MIN_FOLLOWUPS = 3;

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
const gloss = (g) => (str(g, 300) ? { gloss: str(g, 300) } : {});
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Every thing the expert said that a quote may be taken from: live answers (with the video time they
// were given at) and debrief answers (no screen time of their own).
export function wordPool(nodes, debrief = []) {
  const pool = [];
  for (const n of nodes) {
    for (const a of n.answers ?? []) {
      if (a?.answer) pool.push({ text: a.answer, norm: norm(a.answer), asked: a.question ?? '', node: n.id, t: Number.isFinite(a.t) ? a.t : n.video_segment.t_start, source: 'live' });
    }
  }
  for (const d of debrief) {
    if (d?.answer) pool.push({ text: d.answer, norm: norm(d.answer), asked: d.question ?? '', node: null, t: null, source: 'debrief' });
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

const STOP = new Set('the a an is are was were do does did you your for that this with and or of to in on it at be as if when what why how which who not any all'.split(' '));
const tokens = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)));

// A follow-up is "already answered" when it repeats a question the expert was asked (most content words shared)
// or when nearly all its content words sit inside one answer the expert gave while working.
export function answeredLive(question, pool) {
  const q = tokens(question);
  if (q.size < 2) return false;
  const share = (a, b) => [...a].filter((w) => b.has(w)).length;
  return pool.some((p) => {
    if (p.source !== 'live') return false;
    const asked = tokens(p.asked ?? '');
    const said = tokens(p.text);
    return (asked.size && share(q, asked) / Math.min(q.size, asked.size) >= 0.7) || share(q, said) / q.size >= 0.8;
  });
}

const clock = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// G13: a step the expert worked in silence gets a debrief question of its own, worded by its screen time.
export const silentQuestion = (t) => `What were you doing at ${clock(t)}, and why?`;
export const MAX_SILENT_FOLLOWUPS = 2;

// M5: every step links to the expert's own words. A step with no reason and no guardrail (a routine action)
// carries what the expert said while doing it, when they said anything.
function said(reason, guardrails, pool, sources, t) {
  if (reason || guardrails.length) return {};
  // Words said during the step's own screen time, else the answer to the debrief question asked about it.
  const p = pool.find((x) => x.node && sources.includes(x.node)) ?? pool.find((x) => x.source === 'debrief' && x.asked === silentQuestion(t));
  return p ? { said: { words: p.text.trim().slice(0, 300), source: p.source, screen_moment: { t: p.t, node: p.node } } } : {};
}

// LLM output is untrusted. Steps keep only known source nodes; quotes that are not the expert's
// words are dropped (and counted) rather than shown as if the expert had said them.
export function sanitizeWorkMap(raw, nodes, debrief = []) {
  const known = new Map(nodes.map((n) => [n.id, n]));
  const pool = wordPool(nodes, debrief);
  const dropped = { quotes: 0, steps: 0, answered: 0 };
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
        guardrails.push({ kind: g.kind, rule, words: gh.text.trim().slice(0, 300), ...gloss(g.gloss), source: gh.source, screen_moment: moment(gh) });
      }
    }
    const decision = str(s.decision, 200) || null;
    steps.push({
      id: '',
      title: str(s.title, 60) || known.get(sources[0]).description.split(/\s+/).slice(0, 6).join(' '),
      screen_moment: { t, t_end: Math.max(...segs.map((v) => v.t_end)), nodes: sources, uri: segs[0].uri },
      decision,
      reason: hit ? { words: hit.text.trim().slice(0, 300), ...gloss(s.reason?.gloss), source: hit.source, screen_moment: moment(hit) } : null,
      needs_reason: !!decision && !hit,
      guardrails,
      ...said(hit, guardrails, pool, sources, t),
    });
  }
  steps.sort((a, b) => a.screen_moment.t - b.screen_moment.t).forEach((s, i) => { s.id = `s${i + 1}`; });

  // The debrief must ask about what the screen and the live answers did not settle.
  const unclear = [];
  const seen = new Set();
  const add = (step, question, why) => {
    const text = str(question, 160);
    if (text && answeredLive(text, pool)) { dropped.answered++; return; }
    if (text && !seen.has(norm(text))) { seen.add(norm(text)); unclear.push({ step, question: text, why: str(why, 160) }); }
  };
  const stepIds = new Set(steps.map((s) => s.id));
  for (const u of Array.isArray(raw?.unclear) ? raw.unclear : []) add(stepIds.has(u?.step) ? u.step : null, u?.question, u?.why);
  for (const s of steps) {
    if (s.needs_reason) add(s.id, `Why did you decide to ${s.decision.replace(/[.?!]+$/, '').toLowerCase()}?`, 'decision without a stated reason');
  }
  // Steps that still carry none of the expert's words: nothing was said during them.
  const silent = steps.filter((s) => !s.reason && !s.guardrails.length && !s.said);
  const head = unclear.slice(0, 8);
  for (const s of silent.slice(0, MAX_SILENT_FOLLOWUPS)) {
    head.push({ step: s.id, question: silentQuestion(s.screen_moment.t), why: 'nothing said during this step' });
  }
  return { steps, unclear: head, dropped, unlinked: silent.length, enough_followups: unclear.length >= MIN_FOLLOWUPS };
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

// A5: "take that off the record" after the fact. Removes a whole step, one reason, one guardrail or one
// debrief answer from the Work Map, so exports (Work Map, agent files) never carry it. Pure; returns new state.
// Step ids stay stable. A removed reason is not re-asked (needs_reason false), and the teach-back, which may
// quote the removed words, is dropped so it is regenerated and confirmed again.
export function forget({ steps, followups = [], teachBack = null }, target) {
  const out = { steps, followups, teachBack };
  if (target.followup != null) {
    out.followups = followups.map((f, i) => (i === target.followup ? { ...f, answer: null } : f));
  } else if (target.part === 'step') {
    out.steps = steps.filter((s) => s.id !== target.step);
  } else if (target.part === 'reason') {
    out.steps = steps.map((s) => (s.id === target.step ? { ...s, reason: null, needs_reason: false } : s));
  } else if (target.part === 'said') {
    out.steps = steps.map((s) => { if (s.id !== target.step) return s; const { said: _, ...rest } = s; return rest; });
  } else if (target.part === 'guardrail') {
    out.steps = steps.map((s) => (s.id === target.step ? { ...s, guardrails: s.guardrails.filter((_, i) => i !== target.index) } : s));
  } else return out;
  out.teachBack = null;
  return out;
}

// ---- reading a Work Map ----
// Everything that takes a Work Map from outside (a file, a request, the hand-over to the tutor) reads it here,
// so "is this a Work Map" has one answer and readers can rely on the fields below without checking again.
const notMap = (why) => Object.assign(new Error(`not a Work Map: ${why}`), { status: 400 });

export function readSteps(steps) {
  if (!Array.isArray(steps) || !steps.length) throw notMap('it has no steps');
  steps.forEach((s, i) => {
    const at = `step ${i + 1}`;
    if (!s || typeof s.id !== 'string' || !s.id || typeof s.title !== 'string' || !s.title) throw notMap(`${at} has no id or title`);
    if (!Number.isFinite(s.screen_moment?.t)) throw notMap(`${at} has no screen moment`);
    if (s.reason && typeof s.reason.words !== 'string') throw notMap(`${at} has a reason without the expert's words`);
    if (!Array.isArray(s.guardrails)) throw notMap(`${at} has no guardrail list`);
    for (const g of s.guardrails) {
      if (!GUARDRAIL_KINDS.includes(g?.kind) || typeof g.rule !== 'string' || typeof g.words !== 'string') throw notMap(`${at} has a guardrail without a kind, a rule or the expert's words`);
    }
  });
  return steps;
}

export function readWorkMap(map) {
  if (!map || typeof map !== 'object') throw notMap('it is not an object');
  if (map.schema !== undefined && map.schema !== SCHEMA) throw notMap(`unknown schema ${JSON.stringify(map.schema)}`);
  readSteps(map.steps);
  return map;
}

// What a model is shown of a step: the decision, the reason in the expert's words and the guardrails.
// words: also the expert's words behind each guardrail.
export const stepForModel = (s, { words = false } = {}) => ({
  title: s.title, decision: s.decision ?? null, reason: s.reason?.words ?? null,
  guardrails: s.guardrails.map((g) => ({ kind: g.kind, rule: g.rule, ...(words ? { words: g.words } : {}) })),
});
