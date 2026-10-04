import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepsFor, captionFor, arUrl, createKeyMatcher, createTapCounter, createHold, classifyHand, TASKS, DEFAULT_STEPS } from '../public/ar/tasks.js';
import { INVOICES } from '../public/sandbox/data.js';

test('every sandbox invoice has an AR task, and unknown ids fall back to taps', () => {
  for (const inv of INVOICES) assert.ok(TASKS[inv.id], inv.id);
  assert.deepEqual(stepsFor('nope'), DEFAULT_STEPS);
  assert.deepEqual(stepsFor('inv-4471'), TASKS['INV-4471']);
});

test('caption says what to do, in order', () => {
  assert.equal(captionFor(stepsFor('INV-4471')), 'Press U, then O, then P');
  assert.equal(captionFor(stepsFor('INV-4473')), 'Hand: show an open hand → Hand: make a fist');
});

test('QR url carries the transaction id', () => {
  assert.equal(arUrl('https://x.app/', 'INV-4471'), 'https://x.app/ar/?tx=INV-4471');
});

test('key matcher: U, O, P completes; a wrong key restarts', () => {
  const m = createKeyMatcher(['u', 'o', 'p']);
  assert.equal(m.feed('U'), 'progress');
  assert.equal(m.feed('x'), 'wrong');
  assert.equal(m.index, 0);
  assert.deepEqual(['u', 'o', 'Shift', 'p'].map((k) => m.feed(k)), ['progress', 'progress', 'ignored', 'done']);
});

test('key matcher: a wrong key that is the first key counts as a fresh start', () => {
  const m = createKeyMatcher(['u', 'o', 'p']);
  m.feed('u');
  assert.equal(m.feed('u'), 'progress');
  assert.equal(m.index, 1);
});

test('tap counter resets after a pause', () => {
  const c = createTapCounter(3, 1000);
  assert.equal(c.tap(0), 'progress');
  assert.equal(c.tap(500), 'progress');
  assert.equal(c.tap(3000), 'progress');
  assert.equal(c.count, 1);
  c.tap(3200);
  assert.equal(c.tap(3400), 'done');
});

// Build a hand: wrist at (0.5, 0.9), fingers pointing up. `ext` per finger, thumb mode 'in' | 'out' | 'up'.
function hand({ ext, thumb }) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.9 }));
  const base = [[0.42, 5], [0.48, 9], [0.54, 13], [0.6, 17]];
  base.forEach(([x, i], f) => {
    lm[i] = { x, y: 0.7 };
    lm[i + 1] = { x, y: ext[f] ? 0.55 : 0.68 };
    lm[i + 2] = { x, y: 0.5 }; // unused
    lm[i + 3] = { x, y: ext[f] ? 0.4 : 0.75 }; // tip: far up when extended, folded toward palm when curled
  });
  lm[3] = { x: 0.36, y: 0.78 };
  if (thumb === 'in') { lm[4] = { x: 0.5, y: 0.78 }; lm[2] = { x: 0.4, y: 0.82 }; lm[3] = { x: 0.44, y: 0.8 }; }
  if (thumb === 'out') lm[4] = { x: 0.25, y: 0.7 };
  if (thumb === 'up') { lm[3] = { x: 0.36, y: 0.6 }; lm[4] = { x: 0.35, y: 0.4 }; }
  return lm;
}

test('classifyHand: fist, open palm, thumbs up, and nothing for a pointing hand', () => {
  assert.equal(classifyHand(hand({ ext: [0, 0, 0, 0], thumb: 'in' })), 'fist');
  assert.equal(classifyHand(hand({ ext: [1, 1, 1, 1], thumb: 'out' })), 'palm');
  assert.equal(classifyHand(hand({ ext: [0, 0, 0, 0], thumb: 'up' })), 'thumbs_up');
  assert.equal(classifyHand(hand({ ext: [1, 0, 0, 0], thumb: 'in' })), null);
  assert.equal(classifyHand([]), null);
});

test('hold: needs a steady gesture, resets on any other frame', () => {
  const h = createHold('fist', 600);
  assert.equal(h.feed('fist', 0), 0);
  assert.equal(h.feed('fist', 300), 0.5);
  assert.equal(h.feed(null, 400), 0);
  h.feed('fist', 500);
  assert.equal(h.feed('fist', 1100), 1);
});
