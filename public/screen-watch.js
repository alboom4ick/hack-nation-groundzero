// Screen watch: what Capture and Teach both do with a shared screen. It knows when the person is busy (the screen
// moves, or they talk) and when they have paused, and it is the only place a frame of the screen is taken: every
// frame is masked (the configured regions, then OCR for personal data) before anyone gets it, or it is withheld.
// Off the record (pause) stops the probe, the frames and the transcript until resume.
import { createPauseDetector } from './pause.js';
import { createBlurrer } from './frame-redact.js';
import { createOcrMasker } from './ocr-redact.js';
import { openScribe } from './scribe.js';
import { redact } from './redact.js';

export const WATCH = {
  probeMs: 500,           // activity probe period
  frameMs: 1500,          // keyframe period for the vision model
  probe: { w: 128, h: 72 },
  frameW: 640,
};

// Everything that touches the browser, so tests can drive the watch with a fake.
const browser = () => ({
  mic: () => navigator.mediaDevices.getUserMedia({ audio: true }),
  async video(stream) {
    const v = Object.assign(document.createElement('video'), { srcObject: stream, muted: true, playsInline: true });
    await v.play();
    return v;
  },
  canvas: (w, h) => new OffscreenCanvas(w, h),
  meter(stream) {
    const ctx = new AudioContext();
    ctx.resume().catch(() => {}); // Chrome starts a context made after an await suspended, and a suspended meter reads silence
    const analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    return {
      level() {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const b of buf) sum += ((b - 128) / 128) ** 2;
        return Math.sqrt(sum / buf.length);
      },
      close: () => ctx.close(),
    };
  },
  async encode(canvas) {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  },
  every: (fn, ms) => { const id = setInterval(fn, ms); return () => clearInterval(id); },
  openScribe,
  blur: createBlurrer(),
  ocr: createOcrMasker(),
});

// display: the MediaStream from getDisplayMedia (the caller keeps it, e.g. to record it, and stops it).
// Asks for the microphone; throws "Microphone needed: ..." (and ends the share) when it is refused.
// mic: a microphone stream the caller already asked for (so the permission prompt came first); else asked here.
export async function openScreenWatch({ display, mic: given, pause: pauseOpts, env } = {}) {
  const e = { ...browser(), ...env };
  let mic;
  try { mic = given ?? await e.mic(); } catch (err) {
    display.getTracks().forEach((t) => t.stop());
    throw new Error('Microphone needed: ' + err.message);
  }
  const video = await e.video(display);
  const meter = e.meter(mic);
  const probe = e.canvas(WATCH.probe.w, WATCH.probe.h).getContext('2d', { willReadFrequently: true });
  const frameCanvas = e.canvas(WATCH.frameW, Math.round((WATCH.frameW * video.videoHeight) / video.videoWidth));
  const fctx = frameCanvas.getContext('2d');
  const detector = createPauseDetector(pauseOpts);

  let h = null;        // the caller's clock and handlers, set by start
  let off = false;     // off the record
  let stopped = false;
  let epoch = 0;       // bumped by pause and stop: work begun before either is dropped when it lands
  let scribe = null, stopTimer = null, lastFrame = -Infinity;
  let grabbing = Promise.resolve(), inFlight = 0;

  // One frame at a time: the canvas is shared, and the masks must land on the frame OCR read.
  // Fail closed: if masking throws, the frame is never encoded.
  const grab = () => {
    inFlight++;
    const p = grabbing.then(async () => {
      fctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
      e.blur(fctx, frameCanvas.width, frameCanvas.height);
      await e.ocr(frameCanvas, fctx);
      return e.encode(frameCanvas);
    }).finally(() => { inFlight--; });
    grabbing = p.catch(() => {});
    return p;
  };

  // Scribe v2 Realtime says when the person is talking and when they pause, and writes down what they say.
  const listen = async () => {
    const at = epoch;
    try {
      const conn = await e.openScribe({
        language: h.language,
        onSpeech: () => detector.gate.partial(h.now()),
        onCommit: (text) => { detector.gate.committed(); if (!stopped && !off && !h.busy()) h.onSaid(redact(text), h.now()); },
      });
      if (at !== epoch) { conn.close(); return; }
      scribe = conn;
      detector.gate.setScribe(true);
    } catch (err) {
      detector.gate.setScribe(false);
      h.onNotice(`Scribe unavailable (${err.message}); pauses are detected from the microphone level instead.`);
    }
  };
  const hangUp = () => { scribe?.close(); scribe = null; detector.gate.setScribe(false); };

  const tick = () => {
    if (stopped || off || h.busy()) return;
    const t = h.now();
    probe.drawImage(video, 0, 0, WATCH.probe.w, WATCH.probe.h);
    const moved = detector.screen(probe.getImageData(0, 0, WATCH.probe.w, WATCH.probe.h).data, t);
    detector.voice(meter.level(), t);
    if (h.frames && !inFlight && t - lastFrame >= WATCH.frameMs / 1000) {
      lastFrame = t;
      const at = epoch;
      grab().then((url) => { if (at === epoch) h.onFrame(url, t); }, (err) => h.onNotice(`Frame withheld, masking failed: ${err.message}`));
    }
    h.onTick({ t, moved, changed: detector.changed, ...detector.state(t) });
  };

  return {
    // now: () => seconds on the caller's session clock. busy: () => true while the apprentice itself has the floor
    // (ticks and the transcript are skipped). frames: also hand a masked frame to onFrame(url, t) every frameMs.
    // onTick({ t, moved, changed, idleFor, screenActive, voiceActive, paused }) runs every probeMs; onSaid(text, t) gets what
    // the person said (redacted) each time they pause.
    async start({ now, language, frames = false, busy = () => false, onTick = () => {}, onFrame = () => {}, onSaid = () => {}, onNotice = () => {} }) {
      h = { now, language, frames, busy, onTick, onFrame, onSaid, onNotice };
      await listen();
      if (!stopped) stopTimer = e.every(tick, WATCH.probeMs);
    },
    // A masked frame of the screen as it is now. Rejects when masking fails, off the record, or after stop.
    frame: () => (off || stopped ? Promise.reject(new Error(off ? 'off the record' : 'the watch has stopped')) : grab()),
    // Counts this moment as speech (an answer just ended), so the next question waits for a real pause.
    spoke: () => detector.gate.level(h.now()),
    pause() {
      if (off || stopped) return;
      off = true;
      epoch++;
      hangUp();
    },
    resume() {
      if (!off || stopped) return;
      off = false;
      detector.reset(h.now());
      listen();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      epoch++;
      stopTimer?.();
      hangUp();
      mic.getTracks().forEach((t) => t.stop());
      meter.close();
    },
  };
}
