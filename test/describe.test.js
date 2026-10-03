import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDescription, finalize, describeSegment, missingSlots } from '../lib/describe.js';
import { speak } from '../lib/tts.js';
import { transcribe } from '../lib/stt.js';

const reply = (obj) => '```json\n' + JSON.stringify(obj) + '\n```';

test('parseDescription tolerates code fences and normalises empty slots to null', () => {
  const r = parseDescription(reply({ description: ' hand turns wrench ', slots: { object: 'drain plug', tool: '  ', intent: null }, questions: ['Why?'] }));
  assert.equal(r.description, 'hand turns wrench');
  assert.equal(r.slots.object, 'drain plug');
  assert.equal(r.slots.tool, null);
  assert.equal(r.slots.precondition, null);
});

test('parseDescription rejects output with no JSON', () => {
  assert.throws(() => parseDescription('sorry'), /no JSON/);
});

test('finalize flags missing slots and adds fallback questions', () => {
  const r = finalize({ description: 'x', slots: { object: 'a', tool: 'b', intent: null, precondition: 'c', effect: 'd' }, questions: [] });
  assert.deepEqual(r.missing, ['intent']);
  assert.ok(r.needsExpert);
  assert.equal(r.questions.length, 1);
});

test('finalize does not ask when every slot is filled', () => {
  const full = Object.fromEntries(['object', 'tool', 'intent', 'precondition', 'effect'].map((k) => [k, 'v']));
  const r = finalize({ description: 'x', slots: full, questions: [] });
  assert.equal(r.needsExpert, false);
  assert.deepEqual(missingSlots(full), []);
});

test('describeSegment sends base64 images in order and returns finalized result', async () => {
  let body;
  const fake = async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ content: [{ text: reply({ description: 'd', slots: {}, questions: ['Is this loosening?'] }) }] }) };
  };
  const out = await describeSegment({ frames: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'], tStart: 0, tEnd: 2 }, 'k', fake);
  assert.equal(body.messages[0].content.filter((b) => b.type === 'image').length, 2);
  assert.equal(body.messages[0].content.find((b) => b.type === 'image').source.data, 'AAA');
  assert.ok(out.needsExpert);
  assert.deepEqual(out.questions, [{ frame: 0, text: 'Is this loosening?' }]);
});

test('describeSegment rejects non-data-URL frames', async () => {
  await assert.rejects(describeSegment({ frames: ['http://x/y.jpg'], tStart: 0, tEnd: 1 }, 'k', async () => {}), /data URL/);
});

test('speak surfaces upstream errors', async () => {
  await assert.rejects(speak('hi', 'k', { fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'bad key' }) }), /401/);
});

test('questions carry a keyframe index clamped to the frame range', () => {
  const r = parseDescription(reply({ description: 'd', slots: {}, questions: [{ frame: 9, text: 'a' }, { frame: -2, text: 'b' }, { frame: 1, text: 'c' }, 'plain'] }), 3);
  assert.deepEqual(r.questions.map((q) => q.frame), [2, 0, 1, 0]);
});

test('describeSegment labels each image with its frame number and time', async () => {
  let body;
  const fake = async (_u, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ content: [{ text: reply({ description: 'd', slots: {}, questions: [] }) }] }) }; };
  await describeSegment({ frames: ['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B'], frameTimes: [0.1, 1.9], tStart: 0, tEnd: 2 }, 'k', fake);
  const texts = body.messages[0].content.filter((b) => b.type === 'text').map((b) => b.text);
  assert.equal(texts[0], 'Frame 0 (0.1s):');
  assert.equal(texts[1], 'Frame 1 (1.9s):');
});

test('transcribe posts multipart audio and returns trimmed text', async () => {
  let form;
  const fake = async (_u, init) => { form = init.body; return { ok: true, json: async () => ({ text: ' to loosen it ' }) }; };
  assert.equal(await transcribe(Buffer.alloc(10), 'audio/webm', 'k', { fetchImpl: fake }), 'to loosen it');
  assert.equal(form.get('model_id'), 'scribe_v2');
});
