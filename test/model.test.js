import test from 'node:test';
import assert from 'node:assert/strict';
import { askModel, imageBlock, extractJson, MODEL } from '../lib/model.js';

const answer = (text) => ({ ok: true, json: async () => ({ content: [{ text }] }) });

test('askModel sends the system prompt and content to the model and returns the JSON it answered with', async () => {
  let url, init;
  const out = await askModel({ system: 'S', content: 'hello', maxTokens: 50 }, 'KEY', async (u, i) => { url = u; init = i; return answer('Sure:\n```json\n{"a": 1}\n```'); });
  assert.deepEqual(out, { a: 1 });
  assert.match(url, /anthropic\.com\/v1\/messages$/);
  assert.equal(init.headers['x-api-key'], 'KEY');
  const body = JSON.parse(init.body);
  assert.deepEqual([body.model, body.max_tokens, body.system], [MODEL, 50, 'S']);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hello' }]);
});

test('askModel joins text blocks and passes content blocks through untouched', async () => {
  let body;
  const blocks = [imageBlock('data:image/png;base64,QUJD'), { type: 'text', text: 'what changed?' }];
  const out = await askModel({ system: 'S', content: blocks, maxTokens: 10 }, 'k', async (_u, i) => {
    body = JSON.parse(i.body);
    return { ok: true, json: async () => ({ content: [{ text: '{"x":' }, { type: 'other' }, { text: '2}' }] }) };
  });
  assert.deepEqual(out, { x: 2 });
  assert.deepEqual(body.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } });
});

test('askModel surfaces an upstream error with its status, and output with no JSON', async () => {
  await assert.rejects(askModel({ system: 'S', content: 'x', maxTokens: 1 }, 'k', async () => ({ ok: false, status: 529, text: async () => 'overloaded' })), /Anthropic 529: overloaded/);
  await assert.rejects(askModel({ system: 'S', content: 'x', maxTokens: 1 }, 'k', async () => answer('I cannot do that.')), /no JSON/);
});

test('imageBlock accepts only base64 data URLs; extractJson takes the outermost object', () => {
  assert.throws(() => imageBlock('http://x/y.jpg'), /data URL/);
  assert.deepEqual(extractJson('a {"b": {"c": 1}} d'), { b: { c: 1 } });
});
