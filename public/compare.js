// Stretch S1: two experts, one task. Aligns the steps of two Work Maps and lists where decisions and guardrails
// differ, plus the "why" question the apprentice should put to each expert. Pure, no DOM.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const STOP = new Set('the a an to of for and or in on is it'.split(' '));
const words = (s) => new Set(norm(s).split(' ').filter((w) => w && !STOP.has(w)));
const jaccard = (a, b) => { const i = [...a].filter((w) => b.has(w)).length; return i / (a.size + b.size - i || 1); };
const stepSig = (s) => words(`${s.title} ${s.decision ?? ''}`);

// Greedy best-first matching on title+decision words; unmatched steps stay one-sided.
export function alignSteps(a, b, min = 0.3) {
  const pairs = [];
  a.forEach((x, i) => b.forEach((y, j) => pairs.push({ i, j, score: jaccard(stepSig(x), stepSig(y)) })));
  pairs.sort((p, q) => q.score - p.score);
  const ai = new Set(), bj = new Set(), out = [];
  for (const p of pairs) {
    if (p.score < min || ai.has(p.i) || bj.has(p.j)) continue;
    ai.add(p.i); bj.add(p.j); out.push([p.i, p.j]);
  }
  return {
    matched: out.sort((p, q) => p[0] - q[0]),
    onlyA: a.map((_, i) => i).filter((i) => !ai.has(i)),
    onlyB: b.map((_, j) => j).filter((j) => !bj.has(j)),
  };
}

const sameRule = (g, list) => list.some((h) => jaccard(words(g.rule), words(h.rule)) >= 0.6);

// -> { differences: [{ kind, step_a, step_b, detail }], questions: [{ to: 'a'|'b', question }] }
export function compareWorkMaps(mapA, mapB, { nameA = 'Expert A', nameB = 'Expert B' } = {}) {
  const A = mapA.steps, B = mapB.steps;
  const { matched, onlyA, onlyB } = alignSteps(A, B);
  const differences = [], questions = [];
  for (const [i, j] of matched) {
    const x = A[i], y = B[j];
    if (x.decision && y.decision && jaccard(words(x.decision), words(y.decision)) < 0.6) {
      differences.push({ kind: 'decision', step_a: x.id, step_b: y.id, detail: `${nameA}: ${x.decision} / ${nameB}: ${y.decision}` });
      questions.push({ to: 'a', question: `${nameB} decides "${y.decision}" at "${x.title}". Why do you decide "${x.decision}" instead?` });
      questions.push({ to: 'b', question: `${nameA} decides "${x.decision}" at "${y.title}". Why do you decide "${y.decision}" instead?` });
    } else if (!!x.decision !== !!y.decision) {
      const [who, other, s] = x.decision ? [nameA, nameB, x] : [nameB, nameA, y];
      differences.push({ kind: 'decision', step_a: x.id, step_b: y.id, detail: `Only ${who} makes a decision here: ${s.decision}` });
      questions.push({ to: x.decision ? 'b' : 'a', question: `${who} decides "${s.decision}" at "${s.title}". Do you not need to?` });
    }
    for (const g of x.guardrails) if (!sameRule(g, y.guardrails)) {
      differences.push({ kind: 'guardrail', step_a: x.id, step_b: y.id, detail: `Only ${nameA}: ${g.kind} "${g.rule}"` });
      questions.push({ to: 'b', question: `${nameA} has a ${g.kind.replaceAll('_', ' ')} at "${y.title}": ${g.rule}. Does that apply for you?` });
    }
    for (const g of y.guardrails) if (!sameRule(g, x.guardrails)) {
      differences.push({ kind: 'guardrail', step_a: x.id, step_b: y.id, detail: `Only ${nameB}: ${g.kind} "${g.rule}"` });
      questions.push({ to: 'a', question: `${nameB} has a ${g.kind.replaceAll('_', ' ')} at "${x.title}": ${g.rule}. Does that apply for you?` });
    }
  }
  for (const i of onlyA) { differences.push({ kind: 'step', step_a: A[i].id, step_b: null, detail: `Only ${nameA} has step "${A[i].title}"` }); questions.push({ to: 'b', question: `${nameA} does "${A[i].title}". Do you skip it, and why?` }); }
  for (const j of onlyB) { differences.push({ kind: 'step', step_a: null, step_b: B[j].id, detail: `Only ${nameB} has step "${B[j].title}"` }); questions.push({ to: 'a', question: `${nameB} does "${B[j].title}". Do you skip it, and why?` }); }
  return { differences, questions, matched: matched.length };
}
