import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wrap, layoutRouteMap, GEO } from '../public/route-map.js';
import { startDraft, toggleStep } from '../public/tree-edit.js';

const sample = JSON.parse(readFileSync(new URL('../public/workmaps/invoice_demo.json', import.meta.url), 'utf8'));
const steps = () => startDraft(sample).steps;

test('wrap breaks on words, splits long words and ends a cut text with an ellipsis', () => {
  assert.deepEqual(wrap('Check supplier and PO', 19, 3), ['Check supplier and', 'PO']);
  assert.deepEqual(wrap('abcdefghij', 4, 3), ['abcd', 'efgh', 'ij']);
  const cut = wrap('one two three four five six seven', 9, 2);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith('…'));
  assert.deepEqual(wrap('', 10, 2), []);
});

test('steps sit left to right on one main line with room for a gateway after a decision', () => {
  const L = layoutRouteMap(steps());
  assert.equal(L.nodes.length, 7);
  for (let i = 1; i < L.nodes.length; i++) assert.ok(L.nodes[i].x >= L.nodes[i - 1].x + GEO.w + GEO.gapPlain);
  assert.equal(L.gates.length, steps().filter((s) => s.decision).length);
  for (const gate of L.gates) {
    const n = L.nodes.find((x) => x.id === gate.stepId);
    assert.ok(gate.x - gate.half > n.x + n.w);
  }
  assert.ok(L.end.x - L.end.r > L.nodes.at(-1).x + GEO.w);
  assert.ok(L.width > L.end.x + L.end.r);
});

test('every guardrail is a branch below the main line; only stop-and-ask ends instead of merging', () => {
  const L = layoutRouteMap(steps());
  assert.equal(L.branches.length, steps().flatMap((s) => s.guardrails).length);
  for (const b of L.branches) {
    assert.ok(b.y > L.mainY + GEO.h / 2);
    assert.equal(b.ends, b.kind === 'stop_and_ask' ? 'stop' : 'merge');
    assert.ok(b.forkX < b.x && b.mergeX > b.x + GEO.w);
  }
  assert.ok(L.height > L.branches.at(-1).y + GEO.pillH / 2);
});

test('branches that overlap horizontally get different lanes', () => {
  const L = layoutRouteMap(steps());
  const s4 = L.branches.filter((b) => b.stepId === 's4');
  assert.equal(s4.length, 2);
  assert.notEqual(s4[0].lane, s4[1].lane);
  for (const a of L.branches) for (const b of L.branches) {
    if (a !== b && a.lane === b.lane) assert.ok(a.mergeX <= b.forkX || b.mergeX <= a.forkX || a.ends === 'stop' || b.ends === 'stop');
  }
});

test('switched-off steps stay on the map, marked off, with their branches', () => {
  const L = layoutRouteMap(toggleStep({ steps: steps() }, 's4').steps);
  assert.equal(L.nodes.find((n) => n.id === 's4').off, true);
  assert.ok(L.branches.filter((b) => b.stepId === 's4').every((b) => b.off));
});

test('an empty tree is just start and done', () => {
  const L = layoutRouteMap([]);
  assert.equal(L.nodes.length + L.branches.length + L.gates.length, 0);
  assert.equal(L.flows.length, 1);
  assert.ok(L.flows[0].x2 > L.flows[0].x1);
});

import { layoutMiniRoute, MINI } from '../public/route-map.js';

test('mini route spreads the steps over a fixed width, with stubs for guardrails and a gateway where there is room', () => {
  const L = layoutMiniRoute(steps());
  assert.equal(L.nodes.length, 7);
  assert.equal(L.nodes[0].x, MINI.margin);
  assert.equal(L.nodes.at(-1).x, MINI.w - MINI.margin);
  assert.equal(L.nodes.find((n) => n.id === 's4').branches.length, 2);
  assert.ok(L.nodes.find((n) => n.id === 's2').gate);
  assert.equal(L.nodes.find((n) => n.id === 's1').gate, null);
  assert.ok(L.height > MINI.y + 18);
});

test('mini route drops gateways when steps are too close and copes with one step or none', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, title: 't', decision: 'd', guardrails: [] }));
  assert.ok(layoutMiniRoute(many).nodes.every((n) => n.gate === null));
  assert.equal(layoutMiniRoute([many[0]]).nodes[0].x, MINI.w / 2);
  assert.equal(layoutMiniRoute([]).nodes.length, 0);
});
