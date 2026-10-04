// The sandbox ERP page. Saving asks the open tutor first (BroadcastChannel) and stays unsaved on a violation.
import { COST_CENTERS, INVOICES } from './data.js';
import { askTutor } from '../save-hold.js';

const $ = (id) => document.getElementById(id);
const fresh = () => INVOICES.map((i) => ({ ...i, status: 'open' }));
const state = { invoices: fresh(), sel: 0 };
const eur = (n) => `€${n.toLocaleString('en-US')}`;
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };

function renderList() {
  $('list').replaceChildren(...state.invoices.map((inv, i) => {
    const tr = el('tr', { className: `row${i === state.sel ? ' sel' : ''}` }, el('td', { textContent: inv.id }), el('td', { textContent: inv.supplier }), el('td', { textContent: eur(inv.amount) }));
    tr.addEventListener('click', () => { state.sel = i; render(); });
    return tr;
  }));
}

function renderDetail() {
  const inv = state.invoices[state.sel];
  const rows = [['Invoice', inv.id], ['Supplier', `${inv.supplier} (${inv.country})`], ['Category', inv.category], ['Amount', eur(inv.amount)], ['Purchase order', inv.po || 'none'], ['Invoice date', inv.date], ['Note', inv.note]];
  const cc = el('select', { id: 'cc', disabled: inv.status === 'posted' }, ...COST_CENTERS.map((c) => el('option', { value: c.code, textContent: c.name, selected: c.code === inv.costCenter })));
  const asset = el('input', { id: 'asset', value: inv.asset, placeholder: 'asset number (capex only)', disabled: inv.status === 'posted' });
  cc.addEventListener('change', () => { inv.costCenter = cc.value; });
  asset.addEventListener('input', () => { inv.asset = asset.value; });
  const dl = el('dl');
  for (const [k, v] of rows) dl.append(el('dt', { textContent: k }), el('dd', { textContent: v }));
  dl.append(el('dt', { textContent: 'Cost center' }), el('dd', {}, cc), el('dt', { textContent: 'Asset number' }), el('dd', {}, asset));
  const save = el('button', { id: 'save', textContent: 'Save and post', disabled: inv.status === 'posted' });
  save.addEventListener('click', () => trySave(inv));
  const status = el('span', { className: `st ${inv.status}`, textContent: inv.status });
  $('detail').replaceChildren(el('h2', { style: 'margin:0 0 10px;font-size:16px', textContent: 'Invoice detail ' }, status), dl, el('div', { className: 'bar' }, save, el('span', { id: 'msg', role: 'status' })));
}

function render() { renderList(); renderDetail(); }

async function trySave(inv) {
  $('save').disabled = true;
  $('hold').hidden = false;
  const r = await askTutor({ id: inv.id, amount: inv.amount, costCenter: inv.costCenter, asset: inv.asset });
  $('hold').hidden = true;
  const msg = $('msg');
  if (!r.allow) {
    msg.className = 'bad';
    msg.textContent = r.verdict === 'violation' ? 'Not saved: your tutor flagged this. Talk it through first.' : 'Not saved: the tutor did not answer in time. Try again.';
    $('save').disabled = false;
    return;
  }
  inv.status = 'posted';
  render();
  $('msg').textContent = r.checked ? 'Saved after the tutor check.' : 'Saved.';
}

render();

$('reset').addEventListener('click', () => { state.invoices = fresh(); state.sel = 0; render(); });
