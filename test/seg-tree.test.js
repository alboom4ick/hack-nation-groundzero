import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSegmentTree } from '../public/seg-tree.js';

const q = (text, kind, answer) => ({ frame: 1, text, kind, ...(answer ? { answer } : {}) });
const seg = (id, tStart, questions, description = `desc ${id}`) => ({
  id, tStart, tEnd: tStart + 3, frameTimes: [tStart + 0.1, tStart + 1.5, tStart + 2.9], frames: ['f', 'f', 'f'],
  result: questions ? { description, questions } : undefined,
});
const paths = (n, out = []) => { out.push(n.key); n.children.forEach((c) => paths(c, out)); return out; };

test('without a Work Map: session > segments > questions > answers', () => {
  const segs = [seg(0, 0, [q('why capex?', 'branch', 'company rule')]), seg(1, 3, [q('limit?', 'guardrail')])];
  const t = buildSegmentTree({ name: 'inv.webm', segments: segs });
  assert.equal(t.kind, 'session');
  assert.equal(t.label, 'inv.webm');
  assert.deepEqual(t.children.map((c) => c.kind), ['segment', 'segment']);
  const [q0] = t.children[0].children;
  assert.equal(q0.label, 'why capex?');
  assert.equal(q0.children[0].kind, 'answer');
  assert.equal(q0.children[0].label, 'company rule');
  assert.equal(t.children[1].children[0].children.length, 0, 'an unanswered question has no answer node');
});

test('a question carries the time of its keyframe, a segment the time of its start', () => {
  const t = buildSegmentTree({ segments: [seg(0, 10, [q('x?', 'guardrail')])] });
  assert.equal(t.children[0].t, 10);
  assert.equal(t.children[0].children[0].t, 11.5);
  assert.match(t.children[0].children[0].meta, /guardrail · 11\.5 s/);
});

test('an undescribed segment is a leaf that says so', () => {
  const t = buildSegmentTree({ segments: [seg(0, 0, null)] });
  assert.equal(t.children[0].text, 'Not described yet');
  assert.deepEqual(t.children[0].children, []);
});

test('open question count shows in the segment meta, singular and plural', () => {
  const t = buildSegmentTree({ segments: [seg(0, 0, [q('a?'), q('b?')]), seg(1, 3, [q('c?')]), seg(2, 6, [q('d?', 'branch', 'yes')])] });
  assert.match(t.children[0].meta, /2 open questions/);
  assert.match(t.children[1].meta, /1 open question$/);
  assert.doesNotMatch(t.children[2].meta, /open/);
});

test('with a Work Map: segments nest under the step that lists them; strays go under "Not in a step"', () => {
  const segs = [seg(0, 0, []), seg(1, 3, []), seg(2, 6, [])];
  const steps = [{ id: 's1', title: 'Code the invoice', screen_moment: { t: 0, nodes: ['n1', 'n2'] } }];
  const t = buildSegmentTree({ segments: segs, steps });
  assert.deepEqual(t.children.map((c) => c.label), ['Code the invoice', 'Not in a step']);
  assert.deepEqual(t.children[0].children.map((c) => c.label), ['Segment 1', 'Segment 2']);
  assert.deepEqual(t.children[1].children.map((c) => c.label), ['Segment 3']);
  assert.equal(t.children[0].defaultOpen, true);
  assert.equal(t.children[1].defaultOpen, false);
});

test('a step whose segments are all placed leaves no "Not in a step" group; unknown node ids are ignored', () => {
  const t = buildSegmentTree({ segments: [seg(0, 0, [])], steps: [{ id: 's1', title: 'Only', screen_moment: { nodes: ['n1', 'n99'] } }] });
  assert.deepEqual(t.children.map((c) => c.label), ['Only']);
  assert.equal(t.children[0].children.length, 1);
});

test('the segment holding the question being asked starts expanded and its question is marked current', () => {
  const asking = q('now?', 'guardrail');
  const t = buildSegmentTree({ segments: [seg(0, 0, [q('other?')]), seg(1, 3, [asking])], currentQ: asking });
  assert.equal(t.children[0].defaultOpen, false);
  assert.equal(t.children[1].defaultOpen, true);
  assert.equal(t.children[1].children[0].current, true);
});

test('node keys are unique within a level, so expand state can be keyed by path', () => {
  const t = buildSegmentTree({ segments: [seg(0, 0, [q('a?'), q('b?')]), seg(1, 3, [q('c?')])] });
  const keys = (n) => n.children.map((c) => c.key);
  assert.equal(new Set(keys(t)).size, keys(t).length);
  assert.equal(new Set(keys(t.children[0])).size, 2);
  assert.ok(paths(t).includes('session'));
});

test('an empty capture is just the root', () => {
  const t = buildSegmentTree({ name: 'x', segments: [] });
  assert.deepEqual(t.children, []);
  assert.equal(t.meta, '0 segments');
});
