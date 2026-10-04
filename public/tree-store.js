// Where customized action trees live: the database through /api/trees, or this browser's localStorage when
// the server has no database configured (503) or cannot be reached.
const KEY = 'groundzero.custom-trees';
const local = {
  read() { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } },
  write(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch { return false; } },
};
export let backend = 'database';

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  if (r.status === 503) throw Object.assign(new Error('no database'), { fallback: true });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
const viaApi = async (fn, fallback) => {
  try { const out = await fn(); backend = 'database'; return out; }
  catch (err) { if (!(err.fallback || err instanceof TypeError)) throw err; backend = 'browser'; return fallback(); }
};

export const listCustom = () => viaApi(() => api('/api/trees'), () => Object.values(local.read()).sort((a, b) => b.saved_at.localeCompare(a.saved_at)));

export const saveCustom = ({ id, draft }) => viaApi(() => api('/api/trees', { id, draft }), () => {
  const all = local.read();
  id ??= `c${Date.now().toString(36)}`;
  all[id] = { id, name: draft.process.name, base: draft.base ?? null, saved_at: new Date().toISOString(), draft };
  if (!local.write(all)) throw new Error('This browser would not save the tree (storage is full or blocked).');
  return all[id];
});

export const deleteCustom = (id) => viaApi(() => api('/api/trees/delete', { id }), () => { const all = local.read(); delete all[id]; local.write(all); });
