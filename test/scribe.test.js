import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceGate } from '../public/pause.js';
import { redact } from '../public/redact.js';
import { scribeToken } from '../lib/scribe.js';

test('with Scribe: partials mean talking, a commit means the pause, no mic level needed', () => {
  const g = createVoiceGate({ quietSec: 1.8 });
  g.setScribe(true);
  assert.equal(g.active(0), false);
  g.partial(10);
  assert.equal(g.active(11), true);
  g.committed(11.2);
  assert.equal(g.active(11.3), false, 'Scribe\'s VAD saw the silence: the pause is immediate');
  g.level(12);
  assert.equal(g.active(12.1), false, 'mic level is ignored while Scribe is connected (keyboard clatter is not speech)');
});

test('a lost commit cannot block questions forever', () => {
  const g = createVoiceGate();
  g.setScribe(true);
  g.partial(10);
  assert.equal(g.active(13), true);
  assert.equal(g.active(14.5), false);
});

test('without Scribe: falls back to the microphone level and quiet window', () => {
  const g = createVoiceGate({ quietSec: 1.8 });
  assert.equal(g.usingScribe, false);
  g.level(5);
  assert.equal(g.active(6), true);
  assert.equal(g.active(7), false);
  g.partial(8); // stray event with Scribe off must not count
  assert.equal(g.active(9.5), false);
});

test('switching Scribe off mid-speech drops the speaking state (off the record)', () => {
  const g = createVoiceGate();
  g.setScribe(true);
  g.partial(1);
  g.setScribe(false);
  g.setScribe(true);
  assert.equal(g.active(2), false);
});

test('redact masks IBAN, email and phone in what the expert says', () => {
  assert.equal(redact('pay DE89 3704 0044 0532 0130 00 or mail a.b@firma.de'), 'pay [IBAN] or mail [EMAIL]');
  assert.equal(redact('call +49 711 1234567 now'), 'call [PHONE] now');
});

test('scribeToken posts to the single-use endpoint with the key and returns the token', async () => {
  let seen;
  const token = await scribeToken('KEY', async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ token: 'sutkn_1' }) }; });
  assert.equal(token, 'sutkn_1');
  assert.match(seen.url, /single-use-token\/realtime_scribe$/);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['xi-api-key'], 'KEY');
  await assert.rejects(scribeToken('K', async () => ({ ok: false, status: 401, text: async () => 'no' })), /ElevenLabs 401/);
  await assert.rejects(scribeToken('K', async () => ({ ok: true, json: async () => ({}) })), /no token/);
});
