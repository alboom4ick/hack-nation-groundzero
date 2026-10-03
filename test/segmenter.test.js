import test from 'node:test';
import assert from 'node:assert/strict';
import { segment, keyframes } from '../public/segmenter.js';

const flat = (duration, step = 0.25, score = 0.01) =>
  Array.from({ length: Math.floor(duration / step) }, (_, i) => ({ t: (i + 1) * step, score }));

test('segments tile the video with no gaps and respect length bounds', () => {
  const segs = segment(flat(20), 20);
  assert.equal(segs[0].tStart, 0);
  assert.equal(segs.at(-1).tEnd, 20);
  segs.forEach((s, i) => {
    if (i) assert.equal(s.tStart, segs[i - 1].tEnd);
    assert.ok(s.tEnd - s.tStart >= 2 && s.tEnd - s.tStart <= 4.0001);
  });
});

test('cuts at the strongest motion peak inside the window', () => {
  const samples = flat(10);
  samples.find((s) => s.t === 3).score = 0.9;
  const segs = segment(samples, 10);
  assert.equal(segs[0].tEnd, 3);
});

test('falls back to maxLen when there is no motion peak', () => {
  const segs = segment(flat(10, 0.25, 0.05), 10);
  assert.equal(segs[0].tEnd, 4);
});

test('short trailing sliver merges into previous segment', () => {
  const segs = segment(flat(8.5), 8.5);
  assert.equal(segs.at(-1).tEnd, 8.5);
  assert.ok(segs.every((s) => s.tEnd - s.tStart >= 2));
});

test('video shorter than minLen yields one segment', () => {
  const segs = segment(flat(1.5), 1.5);
  assert.equal(segs.length, 1);
});

test('static segment keeps only start and end frames', () => {
  const segs = segment(flat(10, 0.25, 0.01), 10);
  assert.ok(segs.every((s) => s.frameTimes.length === 2));
});

test('high-motion segment gets more keyframes, within 2..5, inside the segment', () => {
  const samples = flat(8, 0.25, 0.01);
  samples.forEach((s) => { if (s.t > 4) s.score = 0.3; });
  const segs = segment(samples, 8);
  const quiet = segs[0].frameTimes.length;
  const busy = segs.at(-1).frameTimes.length;
  assert.ok(busy > quiet, `busy ${busy} should exceed quiet ${quiet}`);
  for (const s of segs) {
    assert.ok(s.frameTimes.length >= 2 && s.frameTimes.length <= 5);
    assert.ok(s.frameTimes.every((t) => t > s.tStart && t < s.tEnd));
  }
});

test('keyframes are sorted and at least minGap apart', () => {
  const samples = flat(4, 0.25, 0.2);
  const ft = keyframes(samples, 0, 4, 3);
  for (let i = 1; i < ft.length; i++) assert.ok(ft[i] - ft[i - 1] >= 0.4 - 1e-9);
});
