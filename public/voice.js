// Speech-to-speech loop pieces: speak (ElevenLabs TTS), listen (mic + silence detection),
// transcribe (ElevenLabs STT). Each drives the orb's --level so it pulses with the audio.

const LABELS = { idle: 'Ready', speaking: 'Claude is asking…', listening: 'Listening…', thinking: 'Transcribing…' };
const $ = (id) => document.getElementById(id);
let ctx;
let stopCurrent = null;

async function errorText(res) {
  const text = await res.text();
  try { return JSON.parse(text).error ?? res.statusText; } catch { return `server replied ${res.status}: ${text.slice(0, 80)}`; }
}

export const setState = (s) => { $('voice').dataset.state = s; $('voice-label').textContent = LABELS[s]; if (s !== 'speaking' && s !== 'listening') setLevel(0); };
const setLevel = (v) => $('orb').style.setProperty('--level', v.toFixed(3));

// Ends whatever speak()/listen() is currently running (used by Skip / End).
export const interrupt = () => stopCurrent?.();

function rmsMeter(analyser, onLevel) {
  const buf = new Uint8Array(analyser.fftSize);
  let raf;
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const b of buf) sum += ((b - 128) / 128) ** 2;
    onLevel(Math.sqrt(sum / buf.length));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

export async function speak(text) {
  ctx ??= new AudioContext();
  const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(await errorText(res));
  const url = URL.createObjectURL(await res.blob());
  const audio = new Audio(url);
  const src = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  src.connect(analyser);
  analyser.connect(ctx.destination);
  const stopMeter = rmsMeter(analyser, (l) => setLevel(Math.min(l * 3, 1)));
  await ctx.resume();
  await new Promise((resolve, reject) => {
    stopCurrent = () => { audio.pause(); resolve(); };
    audio.onended = resolve;
    audio.onerror = () => reject(new Error('audio playback failed'));
    audio.play().catch(reject);
  });
  stopCurrent = null;
  stopMeter();
  URL.revokeObjectURL(url);
}

// Records until the expert has spoken and then paused. Resolves null if nothing was said or it was interrupted.
export async function listen({ silenceMs = 1600, noSpeechMs = 12000, maxMs = 40000, threshold = 0.025 } = {}) {
  ctx ??= new AudioContext();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const analyser = ctx.createAnalyser();
  ctx.createMediaStreamSource(stream).connect(analyser);
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const started = performance.now();
  let lastVoice = 0;
  let spoke = false;
  let interrupted = false;
  let finish;
  const done = new Promise((r) => { finish = r; });
  const stopMeter = rmsMeter(analyser, (l) => {
    setLevel(Math.min(l * 4, 1));
    const now = performance.now();
    if (l > threshold) { spoke = true; lastVoice = now; }
    if ((spoke && now - lastVoice > silenceMs) || (!spoke && now - started > noSpeechMs) || now - started > maxMs) finish();
  });
  stopCurrent = () => { interrupted = true; finish(); };

  rec.start();
  await done;
  await new Promise((r) => { rec.onstop = r; rec.stop(); });
  stream.getTracks().forEach((t) => t.stop());
  stopMeter();
  stopCurrent = null;
  return spoke && !interrupted ? new Blob(chunks, { type: rec.mimeType }) : null;
}

export async function transcribe(blob) {
  const res = await fetch('/api/stt', { method: 'POST', headers: { 'content-type': blob.type || 'audio/webm' }, body: blob });
  if (!res.ok) throw new Error(await errorText(res));
  return (await res.json()).text;
}
