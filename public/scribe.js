// Scribe v2 Realtime in the browser: live transcript plus "is the person speaking, have they paused".
// The server mints a single-use token (the API key never reaches the page); the SDK streams the microphone.
const SDK = 'https://esm.sh/@elevenlabs/client@latest';

// The SDK's error events are not always Error objects (a socket Event has no message): say what we can, log the rest.
function describeError(e) {
  console.error('Scribe error event:', e);
  return e?.message ?? e?.error ?? e?.reason ?? (e?.type ? `${e.type} event` : 'Scribe error');
}

// vadSilenceSecs: how long a silence must last before Scribe commits, i.e. what counts as a natural pause.
export async function openScribe({ onSpeech = () => {}, onCommit = () => {}, onError = () => {}, vadSilenceSecs = 1.2, language } = {}) {
  const res = await fetch('/api/scribe/token');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  const { token } = await res.json();
  const { Scribe, RealtimeEvents, CommitStrategy } = await import(/* @vite-ignore */ SDK);
  const conn = Scribe.connect({
    token, modelId: 'scribe_v2_realtime', ...(language ? { languageCode: language } : {}), commitStrategy: CommitStrategy.VAD, vadSilenceThresholdSecs: vadSilenceSecs,
    microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const opened = new Promise((resolve, reject) => {
    conn.on(RealtimeEvents.SESSION_STARTED, resolve);
    conn.on(RealtimeEvents.AUTH_ERROR, (e) => reject(new Error(e?.message ?? 'Scribe auth failed')));
    conn.on(RealtimeEvents.ERROR, (e) => reject(new Error(describeError(e))));
    setTimeout(() => reject(new Error('Scribe did not start')), 8000);
  });
  conn.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (d) => d?.text && onSpeech(d.text));
  conn.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (d) => d?.text?.trim() && onCommit(d.text.trim()));
  conn.on(RealtimeEvents.ERROR, (e) => onError(describeError(e)));
  try { await opened; } catch (err) { try { conn.close(); } catch { /* already closed */ } throw err; }
  return { close: () => { try { conn.close(); } catch { /* already closed */ } } };
}
