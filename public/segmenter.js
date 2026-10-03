// Pure segmentation logic: no DOM, so it runs in the browser and in node tests.
// samples: [{ t, score }] where score is the motion/scene-change magnitude between
// the previous sample and this one (0..1). Returns segments of minLen..maxLen seconds,
// cut at the strongest motion change inside each window.

export const DEFAULTS = { minLen: 2, maxLen: 4, minFrames: 2, maxFrames: 5, sigma: 1, edge: 0.1, minGap: 0.4, staticScore: 0.02 };

export function segment(samples, duration, opts = {}) {
  const { minLen, maxLen, maxFrames, sigma, edge, minGap, staticScore } = { ...DEFAULTS, ...opts };
  if (!(duration > 0)) return [];

  const scores = samples.map((s) => s.score);
  const mean = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
  const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (scores.length || 1));
  const threshold = mean + sigma * std;

  const cuts = [0];
  let start = 0;
  while (duration - start > maxLen) {
    const lo = start + minLen;
    const hi = start + maxLen;
    let best = null;
    for (const s of samples) {
      if (s.t < lo || s.t > hi) continue;
      if (s.score >= threshold && (!best || s.score > best.score)) best = s;
    }
    start = best ? best.t : hi;
    cuts.push(start);
  }
  cuts.push(duration);

  // A trailing sliver shorter than minLen merges into the previous segment.
  if (cuts.length > 2 && cuts[cuts.length - 1] - cuts[cuts.length - 2] < minLen) {
    cuts.splice(cuts.length - 2, 1);
  }

  const bounds = cuts.slice(0, -1).map((tStart, i) => ({ tStart, tEnd: cuts[i + 1] }));
  const motions = bounds.map((b) => motionIn(samples, b.tStart, b.tEnd));
  const avg = motions.reduce((a, b) => a + b, 0) / (motions.length || 1);

  return bounds.map((b, id) => {
    // Interior frames scale with how much this segment moves relative to the video average.
    // Below staticScore (mean per-sample change) a segment is treated as static regardless of ratio.
    const n = samples.filter((x) => x.t > b.tStart && x.t <= b.tEnd).length || 1;
    const ratio = avg > 0 && motions[id] / n >= staticScore ? motions[id] / avg : 0;
    const interior = Math.min(maxFrames - 2, Math.max(0, Math.round(ratio * 2)));
    return { id, ...b, frameTimes: keyframes(samples, b.tStart, b.tEnd, interior, edge, minGap) };
  });
}

function motionIn(samples, tStart, tEnd) {
  let sum = 0;
  for (const s of samples) if (s.t > tStart && s.t <= tEnd) sum += s.score;
  return sum;
}

// Start and end frames capture the state change; interior frames sit at equal
// cumulative-motion quantiles, so they land where the action actually happens.
export function keyframes(samples, tStart, tEnd, interior, edge = 0.1, minGap = 0.4) {
  const times = [tStart + edge];
  const total = motionIn(samples, tStart, tEnd);
  if (interior > 0 && total > 0) {
    let cum = 0;
    let k = 1;
    for (const s of samples) {
      if (s.t <= tStart || s.t > tEnd) continue;
      cum += s.score;
      while (k <= interior && cum >= (total * k) / (interior + 1)) { times.push(s.t); k++; }
    }
  }
  times.push(tEnd - edge);
  const out = [];
  for (const t of times) if (!out.length || t - out.at(-1) >= minGap) out.push(+t.toFixed(3));
  if (out.length > 1 && tEnd - edge - out.at(-1) > 1e-6) out[out.length - 1] = +(tEnd - edge).toFixed(3);
  return out;
}
