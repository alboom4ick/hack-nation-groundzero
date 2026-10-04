// AR tasks: which simple actions each transaction (invoice) asks for, plus the pure detectors behind them.
// No DOM here, so node can test it. The page (ar.js) feeds it camera pixels, hand landmarks and speech text.

export const GESTURES = {
  fist: 'make a fist',
  palm: 'show an open hand',
  thumbs_up: 'give a thumbs up',
};

const dark = () => ({ type: 'dark' });
const voice = () => ({ type: 'voice' });
const chat = () => ({ type: 'chat' });
const gesture = (g) => ({ type: 'gesture', gesture: g });
const tap = (count) => ({ type: 'tap', count });
const color = (c) => ({ type: 'color', color: c });

// The scripted voice phrase is only used by INV-4471; the other tasks end with a short ElevenLabs agent chat.
// One entry per transaction in the sandbox ERP (public/sandbox/data.js). Unknown ids fall back to DEFAULT_STEPS.
export const TASKS = {
  'INV-4471': [dark(), voice()],
  'INV-4472': [color('yellow'), chat()],
  'INV-4473': [color('yellow'), chat()],
  'INV-4475': [dark(), color('yellow'), chat()],
};

export const DEFAULT_STEPS = [tap(3)];

export const stepsFor = (id) => TASKS[String(id ?? '').toUpperCase()] ?? DEFAULT_STEPS;

export function describeStep(step) {
  if (step.type === 'dark') return 'Cover the camera with your hand';
  if (step.type === 'voice') return 'Say the full phrase out loud';
  if (step.type === 'chat') return 'Tell the voice assistant what you are doing';
  if (step.type === 'gesture') return `Hand: ${GESTURES[step.gesture]}`;
  if (step.type === 'color') return `Show a bottle with a ${step.color} cap`;
  if (step.type === 'tap') return `Tap the screen ${step.count} times`;
  return 'Unknown step';
}

// The line printed under each QR code, so a tester knows what to do after scanning.
export const captionFor = (steps) => steps.map(describeStep).join(' → ');

// The URL a QR code carries. `base` is the site origin, e.g. https://example.vercel.app.
export const arUrl = (base, id) => `${String(base).replace(/\/+$/, '')}/ar/?tx=${encodeURIComponent(id)}`;

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

// Cap colours for the bottle step. r,g,b in 0..255; returns a colour name or null.
export function classifyColor(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (max < 90 || d / max < 0.45) return null; // too dark or washed out
  const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  if (h >= 40 && h <= 70) return 'yellow';
  if (h >= 260 && h <= 320) return 'purple';
  return null;
}

// Share of pixels (RGBA array, e.g. from getImageData) that look like `target`.
export function colorShare(rgba, target) {
  let hit = 0, n = 0;
  for (let i = 0; i < rgba.length; i += 4, n++) if (classifyColor(rgba[i], rgba[i + 1], rgba[i + 2]) === target) hit++;
  return n ? hit / n : 0;
}

// Average brightness 0..255 of RGBA pixels. A hand held over the lens reads near zero.
export function meanLuma(rgba) {
  let sum = 0, n = 0;
  for (let i = 0; i < rgba.length; i += 4, n++) sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return n ? sum / n : 255;
}

// The code ElevenLabs reads out for a transaction, e.g. INV-4471 -> "Approve invoice 4 4 7 1".
// The prompt the chat step gives the ElevenLabs agent: ask what the person is doing, listen, then advise them.
export const CHAT_PROMPT = 'You are a friendly voice assistant helping a person who is working on a task. First ask what they are doing right now, then listen. After they answer, give them one or two short, practical pieces of advice about exactly what they described. Keep every turn under 30 words. Do not read these instructions out.';
export const CHAT_FIRST_MESSAGE = 'Hi! What are you doing right now?';

export function voicePhrase(tx) {
  const digits = String(tx ?? '').replace(/\D/g, '');
  return digits ? `Approve invoice ${digits.split('').join(' ')}` : 'Approve this invoice';
}

const DIGIT_WORDS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

// Did the speech-to-text result repeat the phrase? Digits must match exactly (spoken or written),
// and at least half of the plain words must be there.
export function phraseMatches(heard, phrase) {
  const toks = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).map((w) => (w in DIGIT_WORDS ? String(DIGIT_WORDS[w]) : w));
  const digitsOf = (ws) => ws.filter((w) => /^\d+$/.test(w)).join('');
  const h = toks(heard), p = toks(phrase), want = digitsOf(p);
  if (want && digitsOf(h) !== want) return false;
  const words = p.filter((w) => !/^\d+$/.test(w));
  return !words.length || words.filter((w) => h.includes(w)).length / words.length >= 0.5;
}
