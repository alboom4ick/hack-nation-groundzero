import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer } from '../public/runtime.js';
import { narrationFor } from '../public/narrator.js';

const player = () => createPlayer(JSON.parse(readFileSync(new URL('../public/workflows/desk_cleanup_demo.json', import.meta.url))));
const screen = (p) => {
  const node = p.getNode(p.state.currentNodeId);
  return narrationFor({ state: p.state, node, stage: node?.bpmn_type === 'userTask' ? p.groundingStage(node.id) : null });
};

test('walks the whole workflow, every spoken line fits the TTS limit', () => {
  const p = player();
  const seen = [];
  for (let i = 0; i < 100 && p.state.status === 'running'; i++) {
    const n = p.getNode(p.state.currentNodeId);
    const s = screen(p);
    if (s) { assert.ok(s.text.length <= 500); seen.push(s.key); }
    if (n.bpmn_type === 'userTask') {
      while (p.groundingStage() !== 'ready') { p.setAnchorPoint({ x: 0.5, y: 0.5 }); if (p.groundingStage() !== 'ready') { const t = screen(p); if (t) seen.push(t.key); } }
      const t = screen(p); if (t) seen.push(t.key);
      p.completeTask();
    } else if (n.bpmn_type === 'exclusiveGateway') p.answerGateway(true);
  }
  assert.equal(screen(p).key, 'complete');
  assert.equal(new Set(seen).size, seen.length, 'no duplicate keys within one pass');
});

test('anchored task: asks to point camera first, then speaks the instruction once grounded', () => {
  const p = player();
  const n = p.getNode(p.state.currentNodeId);
  assert.equal(p.groundingStage(), 'source');
  assert.match(screen(p).text, new RegExp(`Point the camera at the ${n.ar.anchor.label}`));
  while (p.groundingStage() !== 'ready') p.setAnchorPoint({ x: 0.5, y: 0.5 });
  assert.ok(screen(p).text.includes((n.ar.instruction ?? n.name).replace(/[.!?]$/, '')));
});

test('long text is clipped', () => {
  const s = narrationFor({ state: { status: 'running' }, node: { id: 'x', bpmn_type: 'exclusiveGateway', name: 'A sentence. '.repeat(100) }, stage: null });
  assert.ok(s.text.length <= 500);
});
