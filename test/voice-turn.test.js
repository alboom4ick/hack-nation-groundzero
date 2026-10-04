import test from 'node:test';
import assert from 'node:assert/strict';
import { openInterviewerVoice, builtinVoice } from '../public/voice-turn.js';

// The built-in speech primitives, scripted: what the microphone "records" and what STT makes of it.
function fakeSpeech({ heard = 'It is always capex.', recording = {} } = {}) {
  const log = [];
  let stop = null;
  return {
    log,
    speak: async (text) => { log.push(`speak:${text}`); },
    listen: () => new Promise((resolve) => { log.push('listen'); stop = () => resolve(null); if (recording !== 'wait') resolve(recording); }),
    transcribe: async () => { log.push('transcribe'); return heard; },
    interrupt: () => { log.push('interrupt'); stop?.(); },
  };
}

// An ElevenAgents interviewer that is set up; the test plays the expert through the hooks openAgent was given.
function fakeAgents() {
  const log = [];
  const hooks = {};
  const agent = { mute: (m) => log.push(`mute:${m}`), cue: (c) => log.push(c), context: (c) => log.push(`context:${c}`), end: () => log.push('end') };
  return { log, hooks, agentAvailable: async () => true, openAgent: async (opts) => { Object.assign(hooks, opts); return agent; } };
}

const noAgent = { agentAvailable: async () => false, openAgent: async () => { throw new Error('must not be opened'); } };

test('built-in voice: asks aloud, listens, transcribes, and reports each state of the turn', async () => {
  const speech = fakeSpeech();
  const states = [];
  const voice = await openInterviewerVoice({ speech, onState: (s) => states.push(s), agents: noAgent });
  assert.equal(await voice.ask('Why capex?', { kind: 'guardrail' }), 'It is always capex.');
  assert.deepEqual(speech.log, ['speak:Why capex?', 'listen', 'transcribe']);
  assert.deepEqual(states, ['speaking', 'listening', 'thinking']);
  voice.context('[SCREEN] ignored'); // no agent to tell: must not throw
});

test('built-in voice: silence is no answer, and a long teach-back is spoken in parts that fit the TTS limit', async () => {
  const silent = fakeSpeech({ recording: null });
  assert.equal(await builtinVoice(silent).ask('Anything else?'), '');
  assert.ok(!silent.log.includes('transcribe'));

  const speech = fakeSpeech();
  const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} explains one more step of the process in plain words.`).join(' ');
  await builtinVoice(speech).ask(long);
  const parts = speech.log.filter((l) => l.startsWith('speak:')).map((l) => l.slice(6));
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 500));
  assert.equal(parts.join(' '), long);
});

test('built-in voice: cancel cuts the turn off and nothing the person said is kept', async () => {
  const speech = fakeSpeech({ recording: 'wait' });
  const voice = builtinVoice(speech);
  const answer = voice.ask('Why?');
  await new Promise((r) => setImmediate(r));
  voice.cancel();
  assert.equal(await answer, '');
  assert.ok(speech.log.includes('interrupt'));
  assert.ok(!speech.log.includes('transcribe'));
});

test('what the person said leaves the turn redacted, with either adapter', async () => {
  const pii = 'Pay DE89 3704 0044 0532 0130 00 and mail anna@example.com';
  assert.equal(await builtinVoice(fakeSpeech({ heard: pii })).ask('Where to?'), 'Pay [IBAN] and mail [EMAIL]');

  const agents = fakeAgents();
  const voice = await openInterviewerVoice({ speech: fakeSpeech(), agents });
  const answer = voice.ask('Where to?');
  agents.hooks.onMessage({ source: 'user', message: pii });
  agents.hooks.tools.question_done();
  assert.equal(await answer, 'Pay [IBAN] and mail [EMAIL]');
});

test('agent voice: opens the interviewer muted, unmutes only for the turn, and cues by kind', async () => {
  const agents = fakeAgents();
  const speech = fakeSpeech();
  const states = [];
  const voice = await openInterviewerVoice({ speech, language: 'de', onState: (s) => states.push(s), agents });
  assert.deepEqual([agents.hooks.role, agents.hooks.language, agents.hooks.firstMessage], ['interviewer', 'de', '']);
  assert.deepEqual(agents.log, ['mute:true']);

  const answer = voice.ask('Is there a limit?', { kind: 'guardrail' });
  agents.hooks.onMessage({ source: 'ai', message: 'Is there a limit here?' });
  agents.hooks.onMessage({ source: 'user', message: 'Five thousand euro.' });
  agents.hooks.tools.question_done();
  assert.equal(await answer, 'Five thousand euro.');
  assert.deepEqual(agents.log, ['mute:true', 'mute:false', '[ASK:guardrail] "Is there a limit?"', 'mute:true']);
  assert.deepEqual(states, ['listening']);
  assert.deepEqual(speech.log, [], 'the built-in voice stays silent');

  const confirm = voice.ask('First you open the invoice. Did I get that right?', { teachback: true });
  await new Promise((r) => setTimeout(r, 0));
  agents.hooks.onMessage({ source: 'user', message: 'Yes.' });
  agents.hooks.tools.question_done();
  assert.equal(await confirm, 'Yes.');
  assert.deepEqual(speech.log, ['speak:First you open the invoice.'], 'the explanation is spoken by the built-in voice, not left to the agent');
  assert.ok(agents.log.includes('[ASK:teachback] "Did I get that right?"'));

  voice.context('[SCREEN] Invoice 4471 opened');
  voice.close();
  assert.deepEqual(agents.log.slice(-2), ['context:[SCREEN] Invoice 4471 opened', 'end']);
});

test('agent voice: cancel (off the record, skip) mutes the agent and drops what was heard so far', async () => {
  const agents = fakeAgents();
  const voice = await openInterviewerVoice({ speech: fakeSpeech(), agents });
  const answer = voice.ask('Why?');
  agents.hooks.onMessage({ source: 'user', message: 'Because the supplier' });
  voice.cancel();
  assert.equal(await answer, '');
  assert.equal(agents.log.at(-1), 'mute:true');
});

test('agent voice: a turn nobody closes ends on the timeout with what was heard', async () => {
  const agents = fakeAgents();
  const voice = await openInterviewerVoice({ speech: fakeSpeech(), agents, timeoutMs: 10 });
  const answer = voice.ask('Why?');
  agents.hooks.onMessage({ source: 'user', message: 'Month-end close.' });
  assert.equal(await answer, 'Month-end close.');
});

test('falls back to the built-in voice, with a notice, when the agent cannot be opened', async () => {
  const speech = fakeSpeech();
  let notice = '';
  const agents = { agentAvailable: async () => true, openAgent: async () => { throw new Error('quota'); } };
  const voice = await openInterviewerVoice({ speech, agents, onNotice: (m) => { notice = m; } });
  assert.match(notice, /ElevenAgents unavailable \(quota\); using the built-in voice/);
  assert.equal(await voice.ask('Why?'), 'It is always capex.');
});

test('scripted tutor halves: say speaks without listening, hear listens without speaking', async () => {
  const speech = fakeSpeech({ heard: 'Capex, I think.' });
  const voice = builtinVoice(speech);
  await voice.say('Code the invoice.');
  assert.deepEqual(speech.log, ['speak:Code the invoice.']);
  assert.equal(await voice.hear(), 'Capex, I think.');
  assert.deepEqual(speech.log, ['speak:Code the invoice.', 'listen', 'transcribe']);
});
