// Browse the action trees and customize their branches for one's own use case.
import { readWorkMap, GUARDRAIL_KINDS } from './workmap.js';
import * as E from './tree-edit.js';
import { listCustom, saveCustom, deleteCustom, backend } from './tree-store.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const KIND = { limit: 'Limit', exception: 'Exception', stop_and_ask: 'Stop and ask' };

let shared = [];          // [{ id, map }]
let cur = null;           // { id, draft, editable, saved }
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

async function renderLists() {
  const mine = await listCustom();
  $('list-shared').replaceChildren(...shared.map((t) => pick(t.map.process.name, `${t.map.steps.length} steps · by ${t.map.process.expert ?? 'an expert'}`, cur?.id === t.id, () => open({ id: t.id, draft: E.startDraft(t.map, { baseId: t.id, name: t.map.process.name }), editable: false }))));
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
  $('branches').replaceChildren(...draft.steps.map((st, i) => stepView(st, i, draft.steps.length, editable)));
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
  const li = el('li', { className: `branch${st.off ? ' off' : ''}` }, head);
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

$('customize').onclick = () => open({ id: null, draft: cur.draft, editable: true, saved: false });
$('name').onchange = () => cur.editable && update((d) => E.setProcessName(d, $('name').value));
$('add-step').onclick = () => { if ($('new-step').value.trim()) { update((d) => E.addStep(d, $('new-step').value)); $('new-step').value = ''; } };
$('new-step').onkeydown = (e) => { if (e.key === 'Enter') $('add-step').click(); };
$('save').onclick = async () => {
  try { const rec = await saveCustom({ id: cur.id, draft: cur.draft }); cur.id = rec.id; cur.saved = true; flash(backend === 'database' ? 'Saved to the database.' : 'Saved in this browser only (no database connected).'); render(); renderLists(); } catch (err) { flash(err.message); }
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
