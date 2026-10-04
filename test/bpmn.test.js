import test from 'node:test';
import assert from 'node:assert/strict';
import { toBpmn, buildGraph, SCHEMA } from '../public/bpmn.js';
import { sanitizeLineage, splitNode, toExport } from '../public/tree.js';

const task = (id, parents = [], conditions = {}, extra = {}) => ({
  id, name: id, description: id, contribution: id, parents, conditions, rationale: '', uncertain: false, question: null,
  slots: { object: 'x', tool: null }, answers: [], video_segment: { uri: 'v', t_start: 0, t_end: 1 }, ...extra,
});

// n1 -> (empty? n2a | n2b) -> n3 -> n4 -> (loose? n6 | skip) -> n7
const desk = () => [
  task('n1', [], {}, { decision: { question: 'Is the bottle empty?' } }),
  task('n2a', ['n1'], { n1: 'bottle_empty == true' }),
  task('n2b', ['n1'], { n1: 'bottle_empty == false' }),
  task('n3', ['n2a', 'n2b']),
  task('n4', ['n3']),
  task('n6', ['n4'], { n4: 'loose_items_present == true' }),
  task('n7', ['n4', 'n6'], { n4: 'loose_items_present == false' }),
];

test('linear chain gets only start, end and plain flows', () => {
  const b = toBpmn([task('n1'), task('n2', ['n1'])]);
  assert.deepEqual(b.nodes.map((n) => n.id), ['start', 'n1', 'n2', 'end']);
  assert.deepEqual(b.flows.map((f) => [f.source, f.target]), [['start', 'n1'], ['n1', 'n2'], ['n2', 'end']]);
  assert.equal(b.schema, SCHEMA);
  assert.equal(b.runtime.current_node, 'n1');
  assert.equal(b.nodes.find((n) => n.id === 'n1').state, 'ready');
  assert.equal(b.nodes.find((n) => n.id === 'n2').state, 'pending');
});

test('conditional siblings get an XOR split; their merge is XOR_MERGE', () => {
  const b = toBpmn(desk());
  const gws = b.nodes.filter((n) => n.gateway);
  assert.deepEqual(gws.map((g) => g.gateway.type), ['XOR', 'XOR_MERGE', 'XOR', 'XOR_MERGE']);
  assert.equal(gws[0].name, 'Is the bottle empty?');
  assert.equal(gws[0].gateway.decision_variable, 'bottle_empty');
  const cond = b.flows.filter((f) => f.condition).map((f) => [f.target, f.condition.expression]);
  assert.deepEqual(cond.slice(0, 2).map((c) => c[1]), ['bottle_empty == true', 'bottle_empty == false']);
  assert.deepEqual(Object.keys(b.runtime.variables), ['bottle_empty', 'loose_items_present']);
});

test('every flow endpoint exists and every node is reachable from start', () => {
  const b = toBpmn(desk());
  const ids = new Set(b.nodes.map((n) => n.id));
  assert.ok(b.flows.every((f) => ids.has(f.source) && ids.has(f.target)));
  const seen = new Set(['start']);
  for (let i = 0; i < b.nodes.length; i++) for (const f of b.flows) if (seen.has(f.source)) seen.add(f.target);
  assert.equal(seen.size, ids.size);
  assert.equal(new Set(b.flows.map((f) => f.id)).size, b.flows.length);
});

test('unconditional siblings are parallel: AND split and AND join', () => {
  const b = toBpmn([task('a'), task('b', ['a']), task('c', ['a']), task('d', ['b', 'c'])]);
  assert.deepEqual(b.nodes.filter((n) => n.gateway).map((n) => [n.bpmn_type, n.gateway.type]), [['parallelGateway', 'AND'], ['parallelGateway', 'AND_MERGE']]);
  assert.equal(b.flows.some((f) => f.condition), false);
});

test('independent roots start in parallel and are all ready', () => {
  const b = toBpmn([task('a'), task('b')]);
  assert.deepEqual(b.nodes.filter((n) => n.gateway).map((n) => n.gateway.type), ['AND', 'AND_MERGE']);
  assert.deepEqual(b.nodes.filter((n) => n.state === 'ready').map((n) => n.id), ['a', 'b']);
});

test('a condition on a lone outgoing edge is ignored', () => {
  const b = toBpmn([task('a'), task('b', ['a'], { a: 'x == true' })]);
  assert.equal(b.nodes.some((n) => n.gateway), false);
  assert.equal(b.flows.some((f) => f.condition), false);
});

test('mixed conditions mark the unconditioned branch as default', () => {
  const g = buildGraph([task('a'), task('b', ['a'], { a: 'x == true' }), task('c', ['a'])]);
  assert.equal(g.flows.filter((f) => f.default).length, 1);
  assert.equal(g.flows.find((f) => f.default).target, 'c');
});

test('task nodes follow the documented shape', () => {
  const b = toBpmn(desk());
  const n2a = b.nodes.find((n) => n.id === 'n2a');
  assert.equal(n2a.bpmn_type, 'userTask');
  assert.deepEqual(n2a.lineage.parents, ['g1']);
  assert.equal(n2a.lineage.split_from, 'g1');
  assert.deepEqual(n2a.slots, { object: 'x' }); // null slots dropped
});

test('sanitizeLineage keeps only well-formed conditions on surviving parents', () => {
  const nodes = ['n1', 'n2', 'n3'].map((id) => task(id));
  const { lineage } = sanitizeLineage([
    { id: 'n2', parents: ['n1'], conditions: { n1: 'bottle_empty == true', zzz: 'a == b' } },
    { id: 'n3', parents: ['n1'], conditions: { n1: 'rm -rf /' } },
  ], nodes);
  assert.deepEqual(lineage[1].conditions, { n1: 'bottle_empty == true' });
  assert.deepEqual(lineage[2].conditions, {});
});

test('sanitizeLineage builds name and AR, falling back to slots.object', () => {
  const nodes = [task('n1')];
  const { lineage } = sanitizeLineage([{ id: 'n1', name: 'Check the bottle', ar: { anchor: { type: 'weird', label: 'bottle' }, instruction: 'Pick it up', success_condition: 'bottle lifted' } }], nodes);
  assert.equal(lineage[0].name, 'Check the bottle');
  assert.deepEqual(lineage[0].ar, { anchor: { type: 'object', label: 'bottle' }, instruction: 'Pick it up', success_condition: 'bottle lifted' });
  const fb = sanitizeLineage([], nodes).lineage[0];
  assert.deepEqual(fb.ar.anchor, { type: 'object', label: 'x' });
});

test('splitNode moves decision to the last part and re-keys child conditions', () => {
  const t = desk();
  const out = splitNode(t, 'n1', [{ description: 'look' }, { description: 'weigh' }]);
  assert.equal(out.find((n) => n.id === 'n1.1').decision, null);
  assert.equal(out.find((n) => n.id === 'n1.2').decision.question, 'Is the bottle empty?');
  assert.deepEqual(out.find((n) => n.id === 'n2a').conditions, { 'n1.2': 'bottle_empty == true' });
  const b = toBpmn(out);
  assert.equal(b.flows.find((f) => f.source === 'g1').condition.expression, 'bottle_empty == true');
});

test('toExport emits the BPMN document', () => {
  const out = toExport({ video: { name: 'desk.mp4', duration: 9 }, nodes: desk() });
  assert.equal(out.schema, 'groundzero.bpmn-action-tree/1');
  assert.equal(out.process.id, 'desk');
  assert.ok(Array.isArray(out.flows) && out.state_model.task_states.includes('ready'));
});
