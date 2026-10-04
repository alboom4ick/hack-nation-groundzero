import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeLineage, isDag, depths, splitNode } from '../public/tree.js';
import { parseSplit, proposeSplit } from '../lib/split.js';
import { proposeLineage } from '../lib/lineage.js';

const nodes = ['n1', 'n2', 'n3', 'n4'].map((id, i) => ({
  id, description: id, slots: {}, answers: [], video_segment: { uri: 'v.mp4', t_start: i * 3, t_end: i * 3 + 3 },
}));

test('drops unknown, self and forward parents so the result is always a DAG', () => {
  const { lineage, dropped } = sanitizeLineage([
    { id: 'n1', parents: ['n3'] },        // forward
    { id: 'n2', parents: ['n2', 'zzz', 'n1', 'n1'] }, // self, unknown, duplicate
    { id: 'n3', parents: ['n1', 'n2'] },
  ], nodes);
  assert.deepEqual(lineage.map((n) => n.parents), [[], ['n1'], ['n1', 'n2'], []]);
  assert.equal(dropped.length, 3);
  assert.ok(isDag(lineage));
});

test('nodes the model omitted still appear, with empty lineage', () => {
  const { lineage } = sanitizeLineage([], nodes);
  assert.equal(lineage.length, 4);
  assert.ok(lineage.every((n) => n.parents.length === 0 && n.contribution === ''));
});

test('isDag detects a cycle', () => {
  assert.equal(isDag([{ id: 'a', parents: ['b'] }, { id: 'b', parents: ['a'] }]), false);
});

test('depths use the longest path', () => {
  const d = depths([{ id: 'a', parents: [] }, { id: 'b', parents: ['a'] }, { id: 'c', parents: ['a', 'b'] }]);
  assert.deepEqual([d.get('a'), d.get('b'), d.get('c')], [0, 1, 2]);
});

test('uncertain flag needs a question to be useful but stays tolerant', () => {
  const { lineage } = sanitizeLineage([{ id: 'n2', parents: ['n1'], uncertain: true, question: ' Is n2 after n1? ' }], nodes);
  assert.equal(lineage[1].uncertain, true);
  assert.equal(lineage[1].question, 'Is n2 after n1?');
});

test('proposeLineage sanitises model output end to end', async () => {
  const fake = async () => ({ ok: true, json: async () => ({ content: [{ text: '{"nodes":[{"id":"n2","contribution":"drains oil","parents":["n1","n4"]}]}' }] }) });
  const { lineage, dropped } = await proposeLineage(nodes, 'k', fake);
  assert.deepEqual(lineage[1].parents, ['n1']);
  assert.deepEqual(dropped, [{ id: 'n2', parent: 'n4' }]);
});

const tree = () => [
  { id: 'n1', description: 'a', contribution: 'ca', parents: [], rationale: '', uncertain: false, question: null, slots: { object: 'x', tool: null }, answers: [{ question: 'q', answer: 'a' }], video_segment: { uri: 'v', t_start: 0, t_end: 3 } },
  { id: 'n2', description: 'b', contribution: 'cb', parents: ['n1'], rationale: 'r', uncertain: true, question: 'ok?', slots: { object: 'y', tool: 'z' }, answers: [{ question: 'q2', answer: 'a2' }], video_segment: { uri: 'v', t_start: 3, t_end: 9 } },
  { id: 'n3', description: 'c', contribution: 'cc', parents: ['n2'], rationale: '', uncertain: false, question: null, slots: {}, answers: [], video_segment: { uri: 'v', t_start: 9, t_end: 12 } },
  { id: 'n4', description: 'd', contribution: 'cd', parents: ['n1', 'n2'], rationale: '', uncertain: false, question: null, slots: {}, answers: [], video_segment: { uri: 'v', t_start: 12, t_end: 15 } },
];
const parts = [{ description: 'loosen', contribution: 'frees plug' }, { description: 'remove', contribution: 'drains oil' }, { description: 'wipe' }];

test('splitNode replaces the node with a chain in the same position', () => {
  const out = splitNode(tree(), 'n2', parts);
  assert.deepEqual(out.map((n) => n.id), ['n1', 'n2.1', 'n2.2', 'n2.3', 'n3', 'n4']);
  assert.deepEqual(out.slice(1, 4).map((n) => n.parents), [['n1'], ['n2.1'], ['n2.2']]);
  assert.ok(isDag(out));
});

test('children of the split node re-point to the last part, without duplicates', () => {
  const out = splitNode(tree(), 'n2', parts);
  assert.deepEqual(out.find((n) => n.id === 'n3').parents, ['n2.3']);
  assert.deepEqual(out.find((n) => n.id === 'n4').parents, ['n1', 'n2.3']);
});

test('time range is divided evenly and exactly covers the original', () => {
  const out = splitNode(tree(), 'n2', parts).filter((n) => n.split_from === 'n2');
  assert.deepEqual(out.map((n) => [n.video_segment.t_start, n.video_segment.t_end]), [[3, 5], [5, 7], [7, 9]]);
});

test('first part keeps answers and slots; later parts start empty; provenance recorded', () => {
  const [a, b] = splitNode(tree(), 'n2', parts).filter((n) => n.split_from === 'n2');
  assert.equal(a.answers.length, 1);
  assert.equal(a.slots.tool, 'z');
  assert.equal(b.answers.length, 0);
  assert.deepEqual(b.slots, { object: null, tool: null });
  assert.equal(b.uncertain, false);
  assert.equal(b.contribution, 'drains oil');
  assert.equal(splitNode(tree(), 'n2', parts).at(3).contribution, 'cb'); // missing contribution falls back
});

test('splitNode does not mutate its input', () => {
  const t = tree();
  const snapshot = JSON.stringify(t);
  splitNode(t, 'n2', parts);
  assert.equal(JSON.stringify(t), snapshot);
});

test('splitNode rejects bad input', () => {
  assert.throws(() => splitNode(tree(), 'zzz', parts), /unknown node/);
  assert.throws(() => splitNode(tree(), 'n2', [parts[0]]), /at least 2/);
  assert.throws(() => splitNode(tree(), 'n2', [parts[0], { description: ' ' }]), /description/);
});

test('splitting the same id twice is refused', () => {
  const once = splitNode(tree(), 'n2', parts);
  const forged = [...once, { ...once[0], id: 'n2', parents: [] }];
  assert.throws(() => splitNode(forged, 'n2', parts), /already split/);
});

test('parseSplit only returns a split with 2+ valid parts, capped at 5', () => {
  assert.deepEqual(parseSplit('{"split": false, "parts": []}'), { split: false, parts: [] });
  assert.equal(parseSplit('{"split": true, "parts": [{"description":"only"}]}').split, false);
  const six = Array.from({ length: 6 }, (_, i) => ({ description: `s${i}` }));
  assert.equal(parseSplit('```' + JSON.stringify({ split: true, parts: six }) + '```').parts.length, 5);
});

test('proposeSplit sends the node and the expert statement', async () => {
  let body;
  const fake = async (_u, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ content: [{ text: '{"split":true,"parts":[{"description":"a"},{"description":"b"}]}' }] }) }; };
  const out = await proposeSplit({ node: tree()[1], instruction: 'first loosen then remove' }, 'k', fake);
  assert.equal(out.split, true);
  assert.equal(JSON.parse(body.messages[0].content).expert_says, 'first loosen then remove');
});
