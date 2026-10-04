// Renders the route map to a static HTML file with a tiny DOM shim (no browser needed).
import { readFileSync, writeFileSync } from 'node:fs';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
class Node_ {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.kids = []; this.dataset = {}; this.listeners = {};
    const self = this;
    this.classList = { toggle(c, on) { const set = new Set((self.attrs.class ?? '').split(/\s+/).filter(Boolean)); (on ? set.add(c) : set.delete(c)); self.attrs.class = [...set].join(' '); } }; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') return; }
  append(...k) { this.kids.push(...k.map((x) => (typeof x === 'string' ? { text: x } : x))); }
  addEventListener() {}
  set textContent(t) { this.kids = [{ text: t }]; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.kids) if (c.tag) { if (c.dataset.step !== undefined) out.push(c); walk(c); } }; walk(this); return out; }
  html() {
    const a = { ...this.attrs }; if (this.dataset.step !== undefined) a['data-step'] = this.dataset.step;
    return `<${this.tag}${Object.entries(a).map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}>${this.kids.map((c) => (c.tag ? c.html() : esc(c.text))).join('')}</${this.tag}>`;
  }
}
globalThis.document = { createElementNS: (_, t) => new Node_(t) };
const { renderRouteMap } = await import('../public/route-map.js');
const { startDraft, toggleStep } = await import('../public/tree-edit.js');
const sample = JSON.parse(readFileSync('public/workmaps/invoice_demo.json', 'utf8'));
let d = startDraft(sample);
d = toggleStep(d, 's5');
const css = readFileSync('public/route-map.css', 'utf8');
const theme = readFileSync('public/theme.css', 'utf8').split('\n').filter((l) => !l.includes('@font-face')).join('\n');
const svg = renderRouteMap(d.steps, { selected: 's4' }).html();
writeFileSync('preview/route-map.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Route map preview</title>
<style>${theme}\nmain{padding:32px}\n${css}\n.note{color:var(--muted);font-size:15px;margin:8px 0 24px}</style></head><body><main>
<p class="eyebrow">Route map</p><h1 style="font-size:34px">${esc(sample.process.name)}</h1>
<p class="note">Step 4 selected, step 5 switched off. Scroll sideways for the whole route.</p>
<div class="rm-wrap">${svg}</div>
<p class="legend"><span><i class="ev"></i>Start / done</span><span><i></i>Step</span><span><i class="gw"></i>Decision</span><span><i class="lim"></i>Limit: branch that rejoins</span><span><i class="exc"></i>Exception: branch that rejoins</span><span><i class="stp"></i>Stop and ask: branch that ends</span></p>
<h2 style="margin-top:32px">Same map, fit to width</h2>
<div class="rm-wrap fit">${svg}</div>
</main></body></html>`);
