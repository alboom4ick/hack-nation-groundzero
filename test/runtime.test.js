import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, validateWorkflow, evaluateCondition } from '../public/runtime.js';

const load = () => JSON.parse(readFileSync(new URL('../public/workflows/desk_cleanup_demo.json', import.meta.url)));
const fresh = () => createPlayer(load());
const at = (p) => p.state.currentNodeId;

// Walk a task: ground source (and target), then complete.
function doTask(p) {
  while (p.groundingStage() !== 'ready') p.setAnchorPoint({ x: 0.5, y: 0.5 });
  p.completeTask();
}

function run(bottleEmpty, loose) {
  const p = fresh();
  const path = [];
  while (p.state.status === 'running') {
    path.push(at(p));
    const n = p.getNode(at(p));
    if (n.bpmn_type === 'userTask') doTask(p);
    else if (n.bpmn_type === 'exclusiveGateway') p.answerGateway(n.gateway.decision_variable === 'bottle_empty' ? bottleEmpty : loose);
    else assert.fail('stuck');
  }
  path.push(at(p));
  return { p, path };
}

test('validates workflow', () => validateWorkflow(load()));
test('condition parser is safe', () => {
  assert.equal(evaluateCondition('a == true', { a: true }), true);
  assert.equal(evaluateCondition('a == false', { a: true }), false);
  assert.throws(() => evaluateCondition('process.exit()', {}));
});
test('starts at first task from JSON runtime', () => assert.equal(at(fresh()), 'n1'));

for (const [b, l, expectPath] of [
  [true, true, ['n1', 'g1', 'n2a', 'n3', 'n4', 'n5', 'g3', 'n6', 'n7', 'end']],
  [true, false, ['n1', 'g1', 'n2a', 'n3', 'n4', 'n5', 'g3', 'n7', 'end']],
  [false, true, ['n1', 'g1', 'n2b', 'n3', 'n4', 'n5', 'g3', 'n6', 'n7', 'end']],
  [false, false, ['n1', 'g1', 'n2b', 'n3', 'n4', 'n5', 'g3', 'n7', 'end']],
]) {
  test(`branch bottle_empty=${b} loose=${l} reaches end (merge g2 is automatic)`, () => {
    const { p, path } = run(b, l);
    assert.deepEqual(path, expectPath);
    assert.equal(p.state.status, 'complete');
    assert.ok(!path.includes('g2'), 'merge gateway never waits for input');
    assert.equal(p.state.nodeStates.g2, 'completed');
  });
}

test('two-stage grounding for tasks with target_anchor', () => {
  const p = fresh();
  doTask(p); p.answerGateway(true); doTask(p); // n1, g1, n2a, now n3
  doTask(p); // n3 done -> n4
  assert.equal(at(p), 'n4');
  assert.equal(p.groundingStage(), 'source');
  p.setAnchorPoint({ x: 0.1, y: 0.2 });
  assert.equal(p.groundingStage(), 'target');
  p.setAnchorPoint({ x: 0.8, y: 0.9 });
  assert.equal(p.groundingStage(), 'ready');
  assert.deepEqual(p.state.anchors.n4, { source: { x: 0.1, y: 0.2 }, target: { x: 0.8, y: 0.9 } });
});

test('skipTask advances and marks skipped', () => {
  const p = fresh();
  p.skipTask();
  assert.equal(p.state.nodeStates.n1, 'skipped');
  assert.equal(at(p), 'g1');
});

test('restart resets state', () => {
  const { p } = run(true, true);
  p.resetWorkflow();
  assert.equal(at(p), 'n1');
  assert.equal(p.state.status, 'running');
  assert.deepEqual(p.state.anchors, {});
  assert.equal(p.state.variables.bottle_empty, null);
});

test('generic: a different workflow with a new variable works unchanged', () => {
  const wf = {
    nodes: [
      { id: 's', bpmn_type: 'startEvent' },
      { id: 't', bpmn_type: 'userTask', name: 'x', ar: { anchor: { label: 'valve' } } },
      { id: 'q', bpmn_type: 'exclusiveGateway', name: 'Is it hot?', gateway: { decision_variable: 'is_hot' } },
      { id: 'a', bpmn_type: 'userTask', name: 'cool' },
      { id: 'e', bpmn_type: 'endEvent' },
    ],
    flows: [
      { id: '1', source: 's', target: 't' }, { id: '2', source: 't', target: 'q' },
      { id: '3', source: 'q', target: 'a', condition: { expression: 'is_hot == true' } },
      { id: '4', source: 'q', target: 'e', condition: { expression: 'is_hot == false' } },
      { id: '5', source: 'a', target: 'e' },
    ],
  };
  const p = createPlayer(wf);
  assert.equal(at(p), 't');
  doTask(p);
  p.answerGateway(true);
  assert.equal(at(p), 'a');
  p.completeTask();
  assert.equal(p.state.status, 'complete');
});
