// Training-mode voice: reads the on-screen guidance aloud through the ElevenLabs /api/tts proxy.

const MAX_CHARS = 480; // /api/tts rejects > 500

const clip = (s) => (s.length <= MAX_CHARS ? s : s.slice(0, MAX_CHARS).replace(/[^.!?]*$/, '').trim() || s.slice(0, MAX_CHARS));
const sentence = (s) => (/[.!?…]$/.test(s) ? s : `${s}.`);

// What to say for the current screen. Returns { key, text } or null (nothing to say).
// `key` identifies the screen: the same key is never spoken twice in a row, so re-renders stay silent.
export function narrationFor({ state, node, stage }) {
  if (!state) return null;
  if (state.status === 'complete') {
    return { key: 'complete', text: clip(['Workflow complete.', node?.name].filter(Boolean).map(sentence).join(' ')) };
  }
  if (state.status !== 'running' || !node) return null;

  if (node.bpmn_type === 'exclusiveGateway') {
    const text = [node.name, node.description].filter(Boolean).map(sentence).join(' ');
    return text ? { key: `${node.id}:gateway`, text: clip(`${text} Tap yes or no.`) } : null;
  }
  if (node.bpmn_type !== 'userTask') return null;

  const ar = node.ar ?? {};
  const instruction = ar.instruction ?? node.name ?? '';
  const parts = [];
  if (stage === 'source') parts.push(node.name, `Point the camera at the ${ar.anchor.label}.`);
  else if (stage === 'target') parts.push(`Now find the ${ar.target_anchor.label}.`);
  else parts.push(instruction, node.description);
  const text = parts.filter(Boolean).map(sentence).join(' ');
  return text ? { key: `${node.id}:${stage}`, text: clip(text) } : null;
}

const MUTE_KEY = 'groundzero.narrator.muted';
const readMuted = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };
const writeMuted = (m) => { try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage unavailable */ } };

export function createNarrator({ onChange = () => {}, fetchImpl = fetch } = {}) {
  const cache = new Map(); // text -> Promise<blob url>
  let muted = readMuted();
  let lastKey = null;
  let current = null; // { audio }
  let latest = 0;
  let blocked = null; // text waiting for a user gesture (autoplay policy)
  let available = true;

  const fetchAudio = (text) => {
    if (!cache.has(text)) {
      const p = fetchImpl('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
        .then(async (res) => {
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `tts ${res.status}`);
          return URL.createObjectURL(await res.blob());
        });
      p.catch(() => cache.delete(text));
      cache.set(text, p);
    }
    return cache.get(text);
  };

  function halt() {
    latest++;
    if (current) { current.audio.pause(); current = null; }
    onChange();
  }

  async function play(text) {
    halt();
    const id = latest;
    if (muted || !available) return;
    try {
      const url = await fetchAudio(text);
      if (id !== latest) return;
      const audio = new Audio(url);
      current = { audio };
      audio.onended = () => { if (current?.audio === audio) { current = null; onChange(); } };
      onChange();
      try { await audio.play(); blocked = null; }
      catch (err) {
        if (err.name !== 'NotAllowedError') throw err;
        current = null; blocked = text; onChange();
      }
    } catch (err) {
      if (id !== latest) return;
      console.warn('narrator', err.message);
      available = /not set in \.env/.test(err.message) ? false : available;
      current = null; onChange();
    }
  }

  return {
    // Call on every render; speaks only when the screen changed.
    update(screen) {
      const n = narrationFor(screen);
      if (!n) { lastKey = null; return; }
      if (n.key === lastKey) return;
      lastKey = n.key;
      this.last = n.text;
      play(n.text);
    },
    replay() { if (this.last) { muted = false; writeMuted(false); play(this.last); } },
    stop: halt,
    // Browsers refuse audio before a gesture; call from the first tap.
    unlock() { if (blocked && !muted) play(blocked); },
    toggleMute() { muted = !muted; writeMuted(muted); if (muted) halt(); else if (this.last) play(this.last); onChange(); },
    get muted() { return muted; },
    get speaking() { return !!current; },
    get blocked() { return !!blocked && !current; },
    last: '',
  };
}
