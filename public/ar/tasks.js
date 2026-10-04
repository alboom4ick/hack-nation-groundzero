// AR tasks: which simple actions each transaction (invoice) asks for, plus the pure detectors behind them.
// No DOM here, so node can test it. The page (ar.js) feeds it key presses and hand landmarks.

export const GESTURES = {
  fist: 'make a fist',
  palm: 'show an open hand',
  thumbs_up: 'give a thumbs up',
};

const keys = (...k) => ({ type: 'keys', keys: k });
const gesture = (g) => ({ type: 'gesture', gesture: g });
const tap = (count) => ({ type: 'tap', count });

// One entry per transaction in the sandbox ERP (public/sandbox/data.js). Unknown ids fall back to DEFAULT_STEPS.
export const TASKS = {
  'INV-4471': [keys('u', 'o', 'p')],
  'INV-4472': [gesture('fist')],
  'INV-4473': [gesture('palm'), gesture('fist')],
  'INV-4475': [keys('u', 'o', 'p'), gesture('thumbs_up')],
};

export const DEFAULT_STEPS = [tap(3)];

export const stepsFor = (id) => TASKS[String(id ?? '').toUpperCase()] ?? DEFAULT_STEPS;

export function describeStep(step) {
  if (step.type === 'keys') return `Press ${step.keys.map((k) => k.toUpperCase()).join(', then ')}`;
  if (step.type === 'gesture') return `Hand: ${GESTURES[step.gesture]}`;
  if (step.type === 'tap') return `Tap the screen ${step.count} times`;
  return 'Unknown step';
}

// The line printed under each QR code, so a tester knows what to do after scanning.
export const captionFor = (steps) => steps.map(describeStep).join(' → ');

// The URL a QR code carries. `base` is the site origin, e.g. https://example.vercel.app.
export const arUrl = (base, id) => `${String(base).replace(/\/+$/, '')}/ar/?tx=${encodeURIComponent(id)}`;

// Key sequence: U then O then P. A wrong key restarts, but counts as the first key if it is one.
export function createKeyMatcher(sequence) {
  const seq = sequence.map((k) => k.toLowerCase());
  let index = 0;
  return {
    get index() { return index; },
    get total() { return seq.length; },
    feed(key) {
      const k = String(key).toLowerCase();
      if (k.length !== 1) return index >= seq.length ? 'done' : 'ignored'; // Shift, Tab and friends do not break a run
      if (index >= seq.length) return 'done';
      if (k === seq[index]) { index += 1; return index === seq.length ? 'done' : 'progress'; }
      index = k === seq[0] ? 1 : 0;
      return index ? 'progress' : 'wrong';
    },
    reset() { index = 0; },
  };
}

// Counts consecutive taps; a pause longer than `windowMs` starts the count over.
export function createTapCounter(count, windowMs = 1500) {
  let n = 0, last = -Infinity;
  return {
    get count() { return n; },
    get total() { return count; },
    tap(now) {
      n = now - last > windowMs ? 1 : n + 1;
      last = now;
      return n >= count ? 'done' : 'progress';
    },
    reset() { n = 0; last = -Infinity; },
  };
}

// ---- hand gestures (MediaPipe hand landmarks: 21 points, x/y in 0..1, y grows downward) ----

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const FINGERS = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]]; // [mcp, pip, tip]

export function classifyHand(lm) {
  if (!Array.isArray(lm) || lm.length < 21) return null;
  const wrist = lm[0];
  const size = dist(wrist, lm[9]); // wrist to middle-finger knuckle
  if (!(size > 0)) return null;
  const extended = FINGERS.map(([, pip, tip]) => dist(wrist, lm[tip]) > dist(wrist, lm[pip]) * 1.1);
  const curled = FINGERS.map(([, pip, tip]) => dist(wrist, lm[tip]) < dist(wrist, lm[pip]));
  const thumbOut = dist(wrist, lm[4]) > dist(wrist, lm[5]) * 1.1 && dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * 1.1;
  const thumbUp = lm[4].y < lm[3].y && lm[4].y < lm[5].y - size * 0.5;
  if (curled.every(Boolean)) {
    if (thumbOut && thumbUp) return 'thumbs_up';
    return thumbOut ? null : 'fist';
  }
  if (extended.every(Boolean) && thumbOut) return 'palm';
  return null;
}

// A gesture only counts once it has been shown steadily for `holdMs`; any other frame resets it.
export function createHold(target, holdMs = 600) {
  let since = null;
  return {
    feed(label, now) {
      if (label !== target) { since = null; return 0; }
      since ??= now;
      return Math.min(1, (now - since) / holdMs);
    },
    reset() { since = null; },
  };
}
