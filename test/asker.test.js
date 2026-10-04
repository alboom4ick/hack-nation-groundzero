import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsker, askCue, teachbackCue, screenContext } from '../public/asker.js';
import { parseRegions, createBlurrer } from '../public/frame-redact.js';
import { syncKnowledge, KB_PREFIX } from '../lib/agents.js';
import { tutorPrompt, INTERVIEWER_PROMPT } from '../public/agent-prompts.js';
import { readFileSync } from 'node:fs';

const workMap = JSON.parse(readFileSync(new URL('../public/workmaps/invoice_demo.json', import.meta.url)));

test('asker unmutes, cues, collects the answer until question_done, then mutes', async () => {
  const log = [];
  const agent = { mute: (m) => log.push(`mute:${m}`), cue: (c) => log.push(c) };
  const a = createAsker();
  const p = a.ask(agent, askCue('Why "capex"?', 'branch'));
  assert.ok(a.active);
  a.onMessage({ source: 'ai', message: 'ignored' });
  a.onMessage({ source: 'user', message: 'Over five thousand.' });
  a.tools.question_done();
  assert.equal(await p, 'Over five thousand.');
  assert.deepEqual(log, ['mute:false', '[ASK:branch] "Why \'capex\'?"', 'mute:true']);
  assert.equal(a.active, false);
});

test('asker times out and a second ask supersedes the first', async () => {
  const agent = { mute() {}, cue() {} };
  const a = createAsker({ timeoutMs: 10 });
  assert.equal(await a.ask(agent, 'x'), '');
  const first = a.ask(agent, 'one');
  const second = a.ask(agent, 'two');
  assert.equal(await first, '');
  a.onMessage({ source: 'user', message: 'answer' });
  a.tools.question_done();
  assert.equal(await second, 'answer');
});

test('cues and screen context', () => {
  assert.equal(teachbackCue('A "b"'), `[TEACHBACK] "A 'b'"`);
  assert.match(screenContext('Typed an amount.', [{ kind: 'branch', text: 'Why?' }]), /^\[SCREEN\] Typed an amount\. Possible questions: \(branch\) Why\?$/);
  assert.match(INTERVIEWER_PROMPT, /\[SCREEN\]/);
  assert.match(INTERVIEWER_PROMPT, /\[TEACHBACK\]/);
});

test('blur regions parse in percent, drop bad entries, and paint solid rects', () => {
  const r = parseRegions('70,10,25,8; nope; 0,90,100,20; -1,0,5,5');
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { x: 0.7, y: 0.1, w: 0.25, h: 0.08 });
  assert.equal(r[1].h, 0.1, 'clamped to the frame');
  const rects = [];
  const ctx = { save() {}, restore() {}, fillRect: (...a) => rects.push(a) };
  assert.equal(createBlurrer(() => r)(ctx, 100, 100), 2);
  assert.deepEqual(rects[0], [70, 10, 25, 8]);
  assert.equal(createBlurrer(() => [])(ctx, 100, 100), 0);
});

test('syncKnowledge uploads the new document, swaps it in, and deletes the previous Work Map document', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body && JSON.parse(init.body) });
    const json = method === 'GET' ? { conversation_config: { agent: { prompt: { knowledge_base: [{ id: 'old', name: KB_PREFIX + 'x' }, { id: 'other', name: 'Policy' }] } } } }
      : url.endsWith('/knowledge-base/text') ? { id: 'doc1' } : {};
    return { ok: true, text: async () => (method === 'DELETE' ? '' : JSON.stringify(json)) };
  };
  assert.equal(await syncKnowledge('ag', { name: 'Invoices', text: '# t' }, 'K', fetchImpl), 'doc1');
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.deepEqual(patch.body.conversation_config.agent.prompt.knowledge_base.map((d) => d.id), ['other', 'doc1']);
  assert.ok(calls.some((c) => c.method === 'DELETE' && /knowledge-base\/old\?force=true/.test(c.url)));
});

test('tutor prompt in kb mode lists steps but not the guardrail text', () => {
  const p = tutorPrompt(workMap, 'the expert', { kb: true });
  assert.match(p, /knowledge base/);
  assert.match(p, /"step_id": "s4"/);
  assert.doesNotMatch(p, /Without an asset number I do not book capex/);
});

import { piiBoxes, hasPii } from '../public/ocr-redact.js';
test('OCR lines with personal data become padded boxes; ordinary lines are left alone', () => {
  assert.ok(hasPii('IBAN DE89 3704 0044 0532 0130 00'));
  assert.ok(hasPii('mail anna@firm.de'));
  assert.ok(hasPii('Tel 0151 2345 6789'));
  assert.equal(hasPii('Invoice total 7,200 EUR'), false);
  const boxes = piiBoxes([
    { text: 'Invoice total 7,200 EUR', bbox: { x0: 0, y0: 0, x1: 50, y1: 10 } },
    { text: 'anna@firm.de', bbox: { x0: 10, y0: 20, x1: 60, y1: 30 } },
  ]);
  assert.deepEqual(boxes, [{ x: 7, y: 17, w: 56, h: 16 }]);
});
