// Browse the action trees and customize their branches for one's own use case.
import { readWorkMap, GUARDRAIL_KINDS } from './workmap.js';
import * as E from './tree-edit.js';
import { renderRouteMap, highlightStep } from './route-map.js';
import { listVideos, uploadVideo, deleteVideo } from './video-store.js';
import { listCustom, saveCustom, deleteCustom, backend } from './tree-store.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const KIND = { limit: 'Limit', exception: 'Exception', stop_and_ask: 'Stop and ask' };

let shared = [];          // [{ id, map }]
let shownVideos;
let cur = null;           // { id, draft, editable, saved }
let routeSvg = null;
const flash = (t) => { $('msg').textContent = t; };

async function loadShared() {
  const idx = await (await fetch('workmaps/index.json')).json();
  shared = [];
  for (const t of idx.trees) { try { shared.push({ id: t.id, map: readWorkMap(await (await fetch('workmaps/' + t.file)).json()) }); } catch { /* skip a tree that will not load */ } }
}

const pick = (name, sub, current, onClick) => {
  const b = el('button', { className: 'pick', type: 'button', onclick: onClick }, el('b', { textContent: name }), el('span', { textContent: sub }));
  if (current) b.setAttribute('aria-current', 'true');
  return b;
};

const loadingNote = (slow, label) => el('div', { className: 'loading', role: 'status' }, el('span', { className: 'spinner', ariaHidden: 'true' }), el('span', { textContent: slow ? 'Still loading. The database wakes up after being idle, which can take up to a minute.' : (label ?? 'Loading your versions…') }));

async function renderLists() {
  $('list-shared').replaceChildren(...shared.map((t) => pick(t.map.process.name, `${t.map.steps.length} steps · by ${t.map.process.expert ?? 'an expert'}`, cur?.id === t.id, () => open({ id: t.id, draft: E.startDraft(t.map, { baseId: t.id, name: t.map.process.name }), editable: false }))));
  const first = !$('list-mine').querySelector('.pick');
  if (first) $('list-mine').replaceChildren(loadingNote(false));
  const slowTimer = setTimeout(() => { if (first) $('list-mine').replaceChildren(loadingNote(true)); }, 4000);
  let mine;
  try { mine = await listCustom(); }
  catch (err) { clearTimeout(slowTimer); $('list-mine').replaceChildren(el('p', { className: 'hint', textContent: `Could not load your versions: ${err.message}` })); return; }
  clearTimeout(slowTimer);
  $('list-mine').replaceChildren(...(mine.length ? mine.map((m) => pick(m.name, `from ${m.base?.name ?? 'a file'} · saved ${m.saved_at.slice(0, 10)}`, cur?.id === m.id, () => open({ id: m.id, draft: m.draft, editable: true, saved: true }))) : [el('p', { className: 'hint', textContent: 'None saved yet.' })]));
}

function open(next) { cur = next; flash(''); render(); renderLists(); }
const update = (fn) => { cur.draft = fn(cur.draft); cur.saved = false; render(); };

function render() {
  $('empty').hidden = !!cur; $('editor').hidden = !cur;
  if (!cur) return;
  const { draft, editable } = cur;
  $('name').value = draft.process.name; $('name').disabled = !editable;
  $('customize').hidden = editable; $('save').hidden = !editable; $('delete').hidden = !(editable && cur.saved);
  $('new-step').disabled = $('add-step').disabled = !editable;
  $('tree-h').textContent = editable ? 'Your branches' : 'Read only. Customize a copy to change it.';
  const s = E.summarize(draft);
  $('summary').textContent = `${s.steps} step${s.steps === 1 ? '' : 's'} on, ${s.guardrails} guardrail${s.guardrails === 1 ? '' : 's'} on` + (s.stepsOff + s.guardrailsOff ? ` · ${s.stepsOff + s.guardrailsOff} switched off` : '') + (s.added ? ` · ${s.added} added by you` : '') + (editable && !cur.saved ? ' · not saved' : '');
  routeSvg = renderRouteMap(draft.steps, { onSelect: reveal });
  $('route').replaceChildren(routeSvg);
  $('branches').replaceChildren(...draft.steps.map((st, i) => stepView(st, i, draft.steps.length, editable)));
  if (shownVideos !== cur.id) { shownVideos = cur.id; renderVideos(); }
}

// Videos belong to a tree id: a shared tree's own id, or a saved version's id.
async function renderVideos() {
  const id = cur?.id, name = cur?.draft.video?.name;
  $('videos').hidden = !cur;
  $('video-upload').disabled = $('video-file').disabled = !id;
  $('video-list').replaceChildren();
  if (!id && !name) { $('video-msg').textContent = 'Save your version first, then its videos can be added.'; return; }
  $('video-msg').textContent = id ? '' : 'Save your version to add more videos.';
  $('video-list').replaceChildren(loadingNote(false, 'Loading videos…'));
  try {
    const vids = await listVideos(id, name);
    if (cur?.id !== id) return;
    $('video-list').replaceChildren(...(vids.length ? vids.map((v) => el('div', { className: 'branch' },
      el('b', { textContent: v.name }), el('span', { className: 'hint', textContent: ` · ${(v.size / 1048576).toFixed(1)} MB · ${v.created_at.slice(0, 10)} ` }),
      btn('Delete', async () => { await deleteVideo(v.id); renderVideos(); }, false, 'Delete video', 'danger'),
      el('video', { src: v.url, controls: true, preload: 'metadata', style: 'display:block;max-width:100%;margin-top:8px;border-radius:12px' }))) : [el('p', { className: 'hint', textContent: 'No videos yet.' })]));
  } catch (err) { $('video-list').replaceChildren(); $('video-msg').textContent = err.message; }
}
$('video-upload').onclick = async () => {
  const f = $('video-file').files?.[0]; if (!f || !cur?.id) return;
  $('video-msg').textContent = 'Uploading…'; $('video-upload').disabled = true;
  try { await uploadVideo(cur.id, f, { name: f.name }); $('video-file').value = ''; await renderVideos(); }
  catch (err) { $('video-msg').textContent = err.message; $('video-upload').disabled = false; }
};

// A click on the map goes to that step's card below; hovering or focusing a card lights up its shapes on the map.
function reveal(stepId) {
  const li = document.getElementById(`step-${stepId}`); if (!li) return;
  highlightStep(routeSvg, stepId);
  li.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  li.classList.remove('pulse'); void li.offsetWidth; li.classList.add('pulse');
  li.querySelector('input')?.focus({ preventScroll: true });
}

function stepView(st, i, n, editable) {
  const head = el('div', { className: 'head' });
  const title = el('input', { value: st.title, disabled: !editable, ariaLabel: `Step ${i + 1} title`, onchange: () => update((d) => E.renameStep(d, st.id, title.value)) });
  head.append(el('span', { className: 'hint', textContent: `${i + 1}.` }), title);
  if (st.custom) head.append(el('span', { className: 'tag', textContent: 'yours' }));
  if (editable) head.append(
    btn(st.off ? 'Switch on' : 'Switch off', () => update((d) => E.toggleStep(d, st.id))),
    btn('↑', () => update((d) => E.moveStep(d, st.id, -1)), i === 0, 'Move up'),
    btn('↓', () => update((d) => E.moveStep(d, st.id, 1)), i === n - 1, 'Move down'),
    btn('Remove', () => update((d) => E.removeStep(d, st.id)), false, 'Remove step', 'danger'));
  const li = el('li', { id: `step-${st.id}`, className: `branch${st.off ? ' off' : ''}`, onmouseenter: () => highlightStep(routeSvg, st.id), onmouseleave: () => highlightStep(routeSvg, null) }, head);
  li.addEventListener('focusin', () => highlightStep(routeSvg, st.id));
  const dec = el('input', { value: st.decision ?? '', placeholder: editable ? 'Decision made here (optional)' : '', disabled: !editable, ariaLabel: 'Decision', onchange: () => update((d) => E.setDecision(d, st.id, dec.value)) });
  if (st.decision || editable) li.append(el('div', { className: 'decision' }, el('span', { className: 'hint', textContent: 'Decision' }), dec));
  if (st.reason?.words) li.append(el('p', { className: 'reason', textContent: `“${st.reason.words}”` }));
  const rails = el('ul', { className: 'rails' }, ...st.guardrails.map((g, k) => railView(st, g, k, editable)));
  if (st.guardrails.length) li.append(rails);
  if (editable) {
    const kind = el('select', { ariaLabel: 'Guardrail kind' }, ...GUARDRAIL_KINDS.map((k) => el('option', { value: k, textContent: KIND[k] })));
    const rule = el('input', { placeholder: 'Add a guardrail, e.g. Over 5,000 EUR needs the controller', ariaLabel: 'New guardrail' });
    const add = () => { if (rule.value.trim()) update((d) => E.addGuardrail(d, st.id, kind.value, rule.value)); };
    rule.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    li.append(el('div', { className: 'add' }, kind, rule, btn('Add', add)));
  }
  return li;
}

function railView(st, g, k, editable) {
  const kind = el('select', { disabled: !editable, ariaLabel: 'Guardrail kind', onchange: () => update((d) => E.editGuardrail(d, st.id, k, { kind: kind.value })) }, ...GUARDRAIL_KINDS.map((x) => el('option', { value: x, textContent: KIND[x], selected: x === g.kind })));
  const rule = el('input', { value: g.rule, disabled: !editable, ariaLabel: 'Guardrail rule', onchange: () => update((d) => E.editGuardrail(d, st.id, k, { rule: rule.value })) });
  const li = el('li', { className: `rail${g.off ? ' off' : ''}` }, kind, rule);
  if (g.source === 'custom') li.append(el('span', { className: 'tag', textContent: 'yours' }));
  if (editable) li.append(btn(g.off ? 'Switch on' : 'Switch off', () => update((d) => E.toggleGuardrail(d, st.id, k))), btn('Remove', () => update((d) => E.removeGuardrail(d, st.id, k)), false, 'Remove guardrail', 'danger'));
  return li;
}

function btn(label, onclick, disabled = false, aria, extra = '') {
  const b = el('button', { type: 'button', className: `ghost mini ${extra}`, textContent: label, onclick, disabled });
  if (aria) b.setAttribute('aria-label', aria);
  return b;
}

$('fit').onclick = () => { const on = $('route').classList.toggle('fit'); $('fit').setAttribute('aria-pressed', String(on)); $('fit').textContent = on ? 'Full size' : 'Fit to width'; };
$('customize').onclick = () => open({ id: null, draft: cur.draft, editable: true, saved: false });
$('name').onchange = () => cur.editable && update((d) => E.setProcessName(d, $('name').value));
$('add-step').onclick = () => { if ($('new-step').value.trim()) { update((d) => E.addStep(d, $('new-step').value)); $('new-step').value = ''; } };
$('new-step').onkeydown = (e) => { if (e.key === 'Enter') $('add-step').click(); };
$('save').onclick = async () => {
  try { const rec = await saveCustom({ id: cur.id, draft: cur.draft }); cur.id = rec.id; cur.saved = true; shownVideos = undefined; flash(backend === 'database' ? 'Saved to the database.' : 'Saved in this browser only (no database connected).'); render(); renderLists(); } catch (err) { flash(err.message); }
};
$('delete').onclick = async () => { await deleteCustom(cur.id); cur = null; render(); renderLists(); };
$('download').onclick = () => {
  try {
    const map = E.finalMap(cur.draft);
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' })), download: `${map.process.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.work-map.json` });
    a.click(); URL.revokeObjectURL(a.href);
  } catch (err) { flash(err.message); }
};
$('import').onchange = async () => {
  const f = $('import').files?.[0]; if (!f) return;
  try { const map = readWorkMap(JSON.parse(await f.text())); open({ id: null, draft: E.startDraft(map, { name: map.process?.name }), editable: true, saved: false }); }
  catch (err) { cur = null; render(); $('empty').hidden = false; $('empty').textContent = `${f.name}: ${err.message}`; }
  $('import').value = '';
};

await loadShared();
await renderLists();
render();
