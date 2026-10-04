// The sandbox ERP page. Saving asks the open tutor first (BroadcastChannel) and stays unsaved on a violation.
import { COST_CENTERS, INVOICES } from './data.js';
import { askTutor } from '../save-hold.js';
import { qrcode } from '../ar/vendor/qrcode.js';
import { stepsFor, captionFor, arUrl } from '../ar/tasks.js';

const $ = (id) => document.getElementById(id);
const fresh = () => INVOICES.map((i) => ({ ...i, status: 'open' }));
const state = { invoices: fresh(), sel: 0 };
const eur = (n) => `€${n.toLocaleString('en-US')}`;
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };

// What the current scenario calls an invoice: same record, different words.
const view = (inv, i = state.invoices.indexOf(inv)) => {
  const s = SCENARIOS[scenario];
  return { name: s.names?.[i] ?? inv.supplier, cat: s.cats?.[i] ?? inv.category, amount: scenario === 3 ? `${Math.round(inv.amount / 40)} m` : scenario === 4 ? `${Math.round(inv.amount / 100)} pcs` : eur(inv.amount) };
};

function renderList() {
  $('list').replaceChildren(...state.invoices.map((inv, i) => {
    const tr = el('tr', { className: `row${i === state.sel ? ' sel' : ''}` }, el('td', { textContent: inv.id }), el('td', { textContent: view(inv, i).name }), el('td', { textContent: view(inv, i).amount }));
    tr.addEventListener('click', () => { state.sel = i; render(); });
    return tr;
  }));
}

// QR for the transaction: scanning it opens the AR task. The task is written under it for testing.
function arQr(inv) {
  const url = arUrl(location.origin, inv.id);
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const box = el('div', { className: 'arqr' });
  box.append(el('p', { className: 'arhint', textContent: 'Scan with your phone and allow access to the camera and microphone.' }));
  const svg = el('div');
  svg.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  box.append(svg);
  box.append(el('span', { textContent: 'Demo task: ' + captionFor(stepsFor(inv.id)) }));
  const live = el('span', { className: 'arlive', textContent: jobFor(inv.id) });
  live.dataset.id = inv.id;
  box.append(live);
  return box;
}

// Each scenario is a different system (ERP, CRM, legal, ...): the app inside the frame re-skins and relabels itself.
const SCENARIOS = [
  { skin: 'erp', sys: 'Sandbox ERP · Accounts payable', theme: { hdr: '#16263d', accent: '#1f5fbf', bg: '#f4f6f9', hi: '#e8f0fc', live: '#e8f1ff' } },
  { skin: 'crm', sys: 'Sandbox CRM · Sales pipeline', theme: { hdr: '#0f4c3a', accent: '#13795b', bg: '#f1f7f4', hi: '#dff3ea', live: '#e3f5ed' },
    listTitle: 'Open deals', cols: ['Deal', 'Account', 'Value'], rows: ['Deal', 'Account', 'Segment', 'Value', 'Quote', 'Close date', 'Note'],
    f: ['Pipeline stage', 'Contract ref'], save: 'Save and advance', opts: ['Qualified lead', 'Proposal sent', 'Closed won'],
    names: ['Nordtech Retail', 'Brightwave Media', 'Moravia Foods', 'Alpenlicht Energy'], cats: ['Enterprise', 'Mid-market', 'SMB', 'Enterprise'] },
  { skin: 'legal', sys: 'Sandbox Legal · Matter management', theme: { hdr: '#3b1d2a', accent: '#8a2846', bg: '#f8f3f4', hi: '#f3e1e6', live: '#f6e8ec' },
    listTitle: 'Open matters', cols: ['Matter', 'Client', 'Fee'], rows: ['Matter', 'Client', 'Practice', 'Fee', 'Retainer', 'Filed', 'Note'],
    f: ['Review tier', 'Case file no.'], save: 'Save and file', opts: ['Paralegal check', 'Associate review', 'Partner sign-off'],
    names: ['Nordtech v. Alder', 'Brightwave IP claim', 'Moravia merger', 'Alpenlicht licensing'], cats: ['Litigation', 'IP', 'M&A', 'Licensing'] },
  { skin: 'cable', sys: 'Sandbox Cable Ops · Electrical inventory', theme: { hdr: '#3a2a0a', accent: '#b8620b', bg: '#faf5ee', hi: '#fbe9d2', live: '#fcecd8' },
    listTitle: 'Open cable orders', cols: ['Order', 'Supplier', 'Length'], rows: ['Order', 'Supplier', 'Cable type', 'Length (m)', 'Work order', 'Delivered', 'Note'],
    f: ['Storage bay', 'Drum number'], save: 'Save and log', opts: ['Bay A: low voltage', 'Bay B: high voltage', 'Bay C: fibre'],
    names: ['Nordtech Kabel', 'Brightwave Wire', 'Moravia Cables', 'Alpenlicht Grid'], cats: ['NYY 5x16', 'H07RN-F', 'CAT7', 'NA2XSY 20kV'] },
  { skin: 'ops', sys: 'Sandbox Ops · Mission logistics', theme: { hdr: '#262c1a', accent: '#5b6b2a', bg: '#f3f4ee', hi: '#e5e9d4', live: '#e8ecd9' },
    listTitle: 'Open requisitions', cols: ['Req.', 'Unit', 'Qty'], rows: ['Requisition', 'Unit', 'Class', 'Quantity', 'Authority', 'Needed by', 'Note'],
    f: ['Clearance level', 'Serial no.'], save: 'Save and release', opts: ['Level 1: routine', 'Level 2: restricted', 'Level 3: command'],
    names: ['1st Engineer Bn', '4th Signals Coy', '7th Medical Det.', '2nd Armoured Bde'], cats: ['Equipment', 'Comms', 'Medical', 'Vehicles'] },
];
let scenario = 0, paused = false;

// Real-world jobs the same AR flow could guide, grouped by the system on screen. The blue line rotates within the current system.
const JOBS = {
  erp: ['Take apart a tractor wheel hub', 'Replace a server PSU in a data-center rack', 'Calibrate a CNC mill after a tool change', 'Reload a vending machine and log the stock', 'Rotate and balance four truck tires', 'Hot-swap a drive in a storage array'],
  crm: ['Make an almond-milk double frappuccino to spec', 'Brew a pour-over at the right ratio and time', 'Plate a tasting-menu dish exactly as the chef does', 'Service an espresso machine group head', 'Pack a client gift box to the brand checklist', 'Set up a store demo table for a product launch'],
  legal: ['Sign, stamp and file a notarised original', 'Bind and tab an exhibit bundle for court', 'Seal and label evidence in a chain-of-custody bag', 'Witness and countersign a deed', 'Redact and archive a paper contract', 'Assemble a closing binder for a merger'],
  cable: ['Wire a three-phase breaker panel', 'Re-crimp an aircraft wiring harness', 'Patch a fiber trunk at a network cabinet', 'Terminate a medium-voltage cable', 'Pull and label a cable run through conduit', 'Splice and test a fibre joint'],
  ops: ['Fold and pack a parachute', 'Change the filter on a hospital ventilator', 'Reseal a window on a ship cabin', 'Service a field generator before deployment', 'Inventory and seal a medical resupply crate', 'Replace a bearing in a vehicle wheel hub'],
};
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
let tick = 0;
const jobFor = (id) => { const j = JOBS[SCENARIOS[scenario].skin]; return 'e.g. ' + j[(hash(id) + tick) % j.length]; };

function applyScenario() {
  const app = $('app');
  app.classList.remove('swap'); void app.offsetWidth; app.classList.add('swap');
  app.dataset.skin = document.body.dataset.skin = SCENARIOS[scenario].skin;
  fill();
}
function fill() {
  const s = SCENARIOS[scenario];
  $('sys').textContent = s.sys;
  $('list-title').textContent = s.listTitle ?? 'Open invoices';
  $('cols').replaceChildren(...(s.cols ?? ['No.', 'Supplier', 'Amount']).map((t) => el('th', { textContent: t })));
  render();
}

const busy = () => paused || !$('hold').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
// Start on the standard ERP for 10 s, then step through the systems. Name, look and example all change on the
// same beat, so every phrase stays up for exactly STEP_MS.
const HOLD_MS = 10000, STEP_MS = 3500;
const step = () => { if (busy()) return; scenario = (scenario + 1) % SCENARIOS.length; tick++; applyScenario(); };
setTimeout(() => { step(); setInterval(step, STEP_MS); }, HOLD_MS);

function renderDetail() {
  const inv = state.invoices[state.sel];
  const sc = SCENARIOS[scenario], v = view(inv);
  const labels = sc.rows ?? ['Invoice', 'Supplier', 'Category', 'Amount', 'Purchase order', 'Invoice date', 'Note'];
  const rows = [[labels[0], inv.id], [labels[1], `${v.name} (${inv.country})`], [labels[2], v.cat], [labels[3], v.amount], [labels[4], inv.po || 'none'], [labels[5], inv.date], [labels[6], inv.note]];
  const cc = el('select', { id: 'cc', disabled: inv.status === 'posted' }, ...COST_CENTERS.map((c) => el('option', { value: c.code, textContent: sc.opts ? `${c.code} ${sc.opts[COST_CENTERS.indexOf(c)]}` : c.name, selected: c.code === inv.costCenter })));
  const asset = el('input', { id: 'asset', value: inv.asset, placeholder: sc.f ? sc.f[1].toLowerCase() : 'asset number (capex only)', disabled: inv.status === 'posted' });
  cc.addEventListener('change', () => { inv.costCenter = cc.value; });
  asset.addEventListener('input', () => { inv.asset = asset.value; });
  const info = el('dl');
  for (const [k, v] of rows) info.append(el('dt', { textContent: k }), el('dd', { textContent: v }));
  const dl = el('dl');
  dl.append(el('dt', { textContent: sc.f?.[0] ?? 'Cost center' }), el('dd', {}, cc), el('dt', { textContent: sc.f?.[1] ?? 'Asset number' }), el('dd', {}, asset));
  const save = el('button', { id: 'save', textContent: sc.save ?? 'Save and post', disabled: inv.status === 'posted' });
  save.addEventListener('click', () => trySave(inv));
  const status = el('span', { className: `st ${inv.status}`, textContent: inv.status });
  $('detail').replaceChildren(el('h2', { style: 'margin:0 0 10px;font-size:16px', textContent: (sc.listTitle ? sc.listTitle.replace(/^Open /, '').replace(/s$/, '').replace(/^./, (c) => c.toUpperCase()) : 'Invoice') + ' detail ' }, status), el('div', { className: 'top' }, info, arQr(inv)), dl, el('div', { className: 'bar' }, save, el('span', { id: 'msg', role: 'status' })));
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
