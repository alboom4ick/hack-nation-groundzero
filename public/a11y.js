// Text size + high-contrast toggles, remembered per browser. Mounts into #a11y.
const KEY = 'gz-a11y';
const root = document.documentElement;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
const state = { size: 'normal', contrast: false, ...load() };

function apply() {
  if (state.size === 'normal') root.removeAttribute('data-size'); else root.dataset.size = state.size;
  if (state.contrast) root.dataset.theme = 'contrast'; else root.removeAttribute('data-theme');
  document.querySelectorAll('#a11y [data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === state.size)));
  document.querySelector('#a11y [data-contrast]')?.setAttribute('aria-pressed', String(state.contrast));
}
apply();

const mount = document.getElementById('a11y');
if (mount) {
  mount.className = 'a11y';
  mount.setAttribute('role', 'group');
  mount.setAttribute('aria-label', 'Display settings');
  mount.innerHTML = `<span class="sizes" role="group" aria-label="Text size">
    <button type="button" data-size="normal" aria-label="Normal text">A</button>
    <button type="button" data-size="large" aria-label="Larger text" style="font-size:20px">A</button>
    <button type="button" data-size="xlarge" aria-label="Largest text" style="font-size:24px">A</button></span>
    <button type="button" data-contrast>High contrast</button>`;
  mount.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.size) state.size = b.dataset.size; else state.contrast = !state.contrast;
    save(state); apply();
  });
  apply();
}
