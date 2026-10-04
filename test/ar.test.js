import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepsFor, captionFor, arUrl, createTapCounter, classifyColor, colorShare, meanLuma, voicePhrase, phraseMatches, createHold, classifyHand, TASKS, DEFAULT_STEPS } from '../public/ar/tasks.js';
import { INVOICES } from '../public/sandbox/data.js';

test('every sandbox invoice has an AR task, and unknown ids fall back to taps', () => {
  for (const inv of INVOICES) assert.ok(TASKS[inv.id], inv.id);
  assert.deepEqual(stepsFor('nope'), DEFAULT_STEPS);
  assert.deepEqual(stepsFor('inv-4471'), TASKS['INV-4471']);
});

test('caption says what to do, in order', () => {
  assert.equal(captionFor(stepsFor('INV-4471')), 'Say the full phrase out loud → Tell the voice assistant what you are doing');
  assert.equal(captionFor(stepsFor('INV-4472')), 'Show a bottle with a yellow cap → Tell the voice assistant what you are doing');
  assert.equal(captionFor(stepsFor('INV-4475')), 'Hand: show an open hand → Hand: give a thumbs up → Tell the voice assistant what you are doing');
});

test('QR url carries the transaction id', () => {
  assert.equal(arUrl('https://x.app/', 'INV-4471'), 'https://x.app/ar/?tx=INV-4471');
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

test('cap colours: yellow and purple recognised, grey and dark ignored', () => {
  assert.equal(classifyColor(240, 200, 20), 'yellow');
  assert.equal(classifyColor(160, 60, 200), 'purple');
  assert.equal(classifyColor(128, 128, 128), null);
  assert.equal(classifyColor(40, 30, 10), null);
  assert.equal(colorShare(Uint8ClampedArray.from([240, 200, 20, 255, 0, 0, 0, 255]), 'yellow'), 0.5);
});

test('four QR tasks: spoken phrase, bottle, two hand movements; every one ends with the agent chat', () => {
  const first = (id) => TASKS[id][0].type;
  assert.deepEqual(['INV-4471', 'INV-4472', 'INV-4473', 'INV-4475'].map(first), ['voice', 'color', 'gesture', 'gesture']);
  for (const [id, steps] of Object.entries(TASKS)) {
    assert.equal(steps.at(-1).type, 'chat', id);
    assert.equal(steps.filter((s) => s.type === 'chat').length, 1, id);
  }
});

test('darkness: a covered lens reads dark, a lit scene does not', () => {
  assert.ok(meanLuma(Uint8ClampedArray.from([5, 5, 5, 255, 10, 8, 6, 255])) < 25);
  assert.ok(meanLuma(Uint8ClampedArray.from([200, 190, 180, 255])) > 100);
});

test('voice code: spoken digits or written digits both pass, wrong digits fail', () => {
  const p = voicePhrase('INV-4471');
  assert.equal(p, 'Approve invoice 4 4 7 1');
  assert.ok(phraseMatches('Approve invoice four four seven one.', p));
  assert.ok(phraseMatches('approve invoice 4471', p));
  assert.ok(!phraseMatches('approve invoice 4472', p));
  assert.ok(!phraseMatches('', p));
});
