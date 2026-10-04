// Save hold (T5): the sandbox ERP asks the open tutor before it saves, and the tutor answers after looking at the
// screen, so a wrong decision is caught before it is saved. Both ends of the protocol live here: the two pages
// only share a BroadcastChannel. Pure of DOM.
export const CHANNEL = 'groundzero.sandbox';

// A save goes through only on a clean check: the action matches the Work Map, or no decision is on screen.
// A violation, or a check that could not run (null), keeps the record unsaved.
export const saveAllowed = (verdict) => verdict === 'ok' || verdict === 'unsure';

// ERP side. Resolves { allow, verdict, checked }. No tutor listening (no ack within ackMs) means nobody is being
// taught, e.g. the expert is capturing: just save. A tutor that took the save but never answers blocks it.
export function askTutor(record, { ackMs = 1200, maxMs = 30000, Channel = globalThis.BroadcastChannel } = {}) {
  if (typeof Channel !== 'function') return Promise.resolve({ allow: true, checked: false });
  return new Promise((resolve) => {
    const bus = new Channel(CHANNEL);
    const id = `${record.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let acked = false;
    const done = (r) => { clearTimeout(ackTimer); clearTimeout(maxTimer); bus.close(); resolve(r); };
    const ackTimer = setTimeout(() => { if (!acked) done({ allow: true, checked: false }); }, ackMs);
    const maxTimer = setTimeout(() => done({ allow: false, checked: false, verdict: 'timeout' }), maxMs);
    bus.onmessage = ({ data }) => {
      if (data?.id !== id) return;
      if (data.type === 'save-ack') acked = true;
      if (data.type === 'save-verdict') done({ allow: data.allow === true, verdict: data.verdict, checked: true });
    };
    bus.postMessage({ type: 'save-attempt', id, record });
  });
}

// Tutor side. check(record) -> 'ok' | 'violation' | 'unsure' | null. Returns a function that stops answering.
export function answerSaves(check, { Channel = globalThis.BroadcastChannel } = {}) {
  if (typeof Channel !== 'function') return () => {};
  const bus = new Channel(CHANNEL);
  let open = true;
  bus.onmessage = async ({ data }) => {
    if (data?.type !== 'save-attempt') return;
    bus.postMessage({ type: 'save-ack', id: data.id });
    let verdict = null;
    try { verdict = await check(data.record); } catch { /* a check that could not run keeps the record unsaved */ }
    if (open) bus.postMessage({ type: 'save-verdict', id: data.id, allow: saveAllowed(verdict), verdict });
  };
  return () => { open = false; bus.close(); };
}
