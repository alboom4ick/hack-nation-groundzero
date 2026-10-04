import test from 'node:test';
import assert from 'node:assert/strict';
import { openScreenWatch, WATCH } from '../public/screen-watch.js';
import { createPauseDetector } from '../public/pause.js';

const settle = () => new Promise((r) => setImmediate(r));

// A browser the test drives: what the screen shows, how loud the microphone is, when the probe ticks, what Scribe hears.
function fakeBrowser({ ocr = async () => 0, mic } = {}) {
  const log = [];
  let pixels = new Uint8ClampedArray(64 * 4);
  let level = 0, tick = null, scribe = null, frames = 0;
  const env = {
    mic: mic ?? (async () => ({ getTracks: () => [{ stop: () => log.push('mic stopped') }] })),
    video: async () => ({ videoWidth: 1280, videoHeight: 720 }),
    canvas: (width, height) => ({ width, height, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: pixels.slice() }) }) }),
    meter: () => ({ level: () => level, close: () => log.push('meter closed') }),
    blur: () => { log.push('blur'); },
    ocr: async (...a) => { log.push('ocr'); return ocr(...a); },
    encode: async () => { log.push('encode'); return `frame${++frames}`; },
    every: (fn) => { tick = fn; return () => { tick = null; log.push('timer stopped'); }; },
    openScribe: async (hooks) => { scribe = hooks; log.push('scribe opened'); return { close: () => log.push('scribe closed') }; },
  };
  return {
    env, log,
    display: { getTracks: () => [{ stop: () => log.push('display stopped') }] },
    type: () => { pixels = pixels.map((v, i) => (i < 40 ? 255 - v : v)); }, // ten pixels change
    speakUp: (v) => { level = v; },
    tick: () => tick?.(),
    get ticking() { return !!tick; },
    scribe: () => scribe,
  };
}

async function startWatch(b, opts = {}) {
  const clock = { t: 0 };
  const seen = { ticks: [], frames: [], said: [], notices: [] };
  const watch = await openScreenWatch({ display: b.display, env: b.env });
  await watch.start({
    now: () => clock.t,
    onTick: (s) => seen.ticks.push(s),
    onFrame: (url, t) => seen.frames.push([url, t]),
    onSaid: (text, t) => seen.said.push([text, t]),
    onNotice: (m) => seen.notices.push(m),
    ...opts,
  });
  const at = (t) => { clock.t = t; b.tick(); return seen.ticks.at(-1); };
  return { watch, clock, seen, at };
}

test('pause detector: a few changed pixels are activity; the pause comes once the screen is still and nobody talks', () => {
  const d = createPauseDetector();
  const still = new Uint8ClampedArray(64 * 4);
  const caret = still.slice(); caret.fill(255, 0, 8);      // two pixels: below the threshold
  const typed = still.slice(); typed.fill(255, 0, 40);     // ten pixels
  assert.equal(d.screen(still, 0), false, 'nothing to compare the first probe with');
  assert.equal(d.screen(caret, 1), false);
  assert.equal(d.screen(typed, 10), true);
  assert.deepEqual([d.state(10.5).screenActive, d.state(10.5).paused], [true, false]);
  assert.deepEqual([d.state(11).screenActive, d.state(11).paused], [false, true]);
  d.voice(0.5, 12.5);                                       // loud microphone, no Scribe: talking
  assert.deepEqual([d.state(12.8).voiceActive, d.state(12.8).paused], [true, false]);
  assert.equal(d.state(15).paused, true);
  d.reset(20);
  assert.equal(d.screen(still, 20.5), false, 'after a reset the old screen is forgotten');
  assert.equal(d.state(20.5).screenActive, true, 'and the idle clock starts again');
});

test('the person is busy while the screen moves, and has paused once it is still and they are quiet', async () => {
  const b = fakeBrowser();
  const { at } = await startWatch(b);
  at(0);
  b.type();
  assert.deepEqual([at(10).moved, at(10.5).screenActive], [true, true]);
  const later = at(13);
  assert.deepEqual([later.moved, later.screenActive, later.voiceActive, later.paused], [false, false, false, true]);
  assert.ok(later.idleFor >= 2.5);
});

test('Scribe says when the person talks; what they said arrives redacted, and not while the apprentice has the floor', async () => {
  const b = fakeBrowser();
  let busy = false;
  const { at, clock, seen } = await startWatch(b, { language: 'de', busy: () => busy });
  assert.equal(b.scribe().language, 'de');
  clock.t = 20;
  b.scribe().onSpeech('Das ist');
  assert.deepEqual([at(20.5).voiceActive, at(20.5).paused], [true, false]);
  b.scribe().onCommit('Das ist immer capex, frag anna@example.com');
  assert.equal(at(21).voiceActive, false);
  assert.deepEqual(seen.said, [['Das ist immer capex, frag [EMAIL]', 20.5]]);

  busy = true;
  const before = seen.ticks.length;
  b.scribe().onCommit('the answer to a question belongs to that question');
  at(22);
  assert.equal(seen.said.length, 1);
  assert.equal(seen.ticks.length, before, 'no ticks while busy');
});

test('without Scribe the microphone level decides, and the caller is told', async () => {
  const b = fakeBrowser();
  b.env.openScribe = async () => { throw new Error('no token'); };
  const { at, seen } = await startWatch(b);
  assert.match(seen.notices[0], /Scribe unavailable \(no token\)/);
  b.speakUp(0.3);
  assert.equal(at(5).voiceActive, true);
  b.speakUp(0);
  assert.equal(at(5.3).voiceActive, true, 'still inside the quiet window');
  assert.equal(at(6).voiceActive, false);
});

test('frames go out every frameMs, masked first: regions, then OCR, then encode', async () => {
  const b = fakeBrowser();
  const { at, seen } = await startWatch(b, { frames: true });
  at(0); await settle();
  at(0.5); await settle();
  at(WATCH.frameMs / 1000); await settle();
  assert.deepEqual(seen.frames, [['frame1', 0], ['frame2', 1.5]]);
  assert.deepEqual(b.log.filter((l) => l !== 'scribe opened'), ['blur', 'ocr', 'encode', 'blur', 'ocr', 'encode']);
});

test('fail closed: when masking fails the frame is never encoded, periodic or on demand', async () => {
  const b = fakeBrowser({ ocr: async () => { throw new Error('tesseract did not load'); } });
  const { watch, at, seen } = await startWatch(b, { frames: true });
  at(0); await settle();
  assert.deepEqual(seen.frames, []);
  assert.match(seen.notices[0], /Frame withheld, masking failed: tesseract did not load/);
  await assert.rejects(watch.frame(), /tesseract did not load/);
  assert.ok(!b.log.includes('encode'));
});

test('frames are taken one at a time, so the masks land on the frame OCR read', async () => {
  let release;
  const b = fakeBrowser({ ocr: () => new Promise((r) => { release = r; }) });
  const { watch } = await startWatch(b);
  const first = watch.frame();
  const second = watch.frame();
  await settle();
  assert.deepEqual(b.log.filter((l) => l !== 'scribe opened'), ['blur', 'ocr'], 'the second frame has not been drawn yet');
  release();
  await settle();
  release();
  assert.deepEqual([await first, await second], ['frame1', 'frame2']);
});

test('off the record: no probe, no transcript, no frames; a frame already on its way is dropped', async () => {
  let release;
  const b = fakeBrowser({ ocr: () => new Promise((r) => { release = r; }) });
  const { watch, at, seen } = await startWatch(b, { frames: true });
  at(0); await settle();       // a frame starts masking
  watch.pause();
  release(); await settle();
  assert.deepEqual(seen.frames, [], 'the frame taken just before is not delivered');
  assert.ok(b.log.includes('scribe closed'));
  const before = seen.ticks.length;
  b.type(); at(5);
  assert.equal(seen.ticks.length, before);
  await assert.rejects(watch.frame(), /off the record/);

  watch.resume(); await settle();
  assert.equal(b.log.filter((l) => l === 'scribe opened').length, 2);
  const back = at(6);
  assert.equal(back.moved, false, 'what changed off the record is not seen as activity');
  assert.equal(seen.ticks.length, before + 1);
});

test('stop releases the microphone, the transcript and the timer; a refused microphone ends the share', async () => {
  const b = fakeBrowser();
  const { watch } = await startWatch(b);
  watch.stop();
  assert.equal(b.ticking, false);
  assert.deepEqual(b.log.slice(-4), ['timer stopped', 'scribe closed', 'mic stopped', 'meter closed']);
  watch.resume(); await settle();
  assert.equal(b.log.filter((l) => l === 'scribe opened').length, 1, 'nothing reopens after stop');
  assert.ok(!b.log.includes('display stopped'), 'the caller owns the shared screen');

  const refused = fakeBrowser({ mic: async () => { throw new Error('Permission denied'); } });
  await assert.rejects(openScreenWatch({ display: refused.display, env: refused.env }), /Microphone needed: Permission denied/);
  assert.deepEqual(refused.log, ['display stopped']);
});
