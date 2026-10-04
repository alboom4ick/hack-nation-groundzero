// The floating island: the #voice panel inside a Picture-in-Picture window (or pinned on the page as a fallback).
// Capture and Teach both use it; the page supplies the #voice element and the .island styles.
import * as voice from './voice.js';

let pip = null;
let opening = null; // in-flight open, so overlapping calls share one window

export function openIsland({ width = 380, height = 170 } = {}) {
  voice.byId('voice').hidden = false;
  if (pip) return Promise.resolve();
  return (opening ??= openWindow(width, height).finally(() => { opening = null; }));
}

async function openWindow(width, height) {
  const el = voice.byId('voice');
  el.classList.add('island-float'); // fallback: pinned bottom-right of the page
  if (!('documentPictureInPicture' in window)) return;
  try {
    pip = await documentPictureInPicture.requestWindow({ width, height });
  } catch { return; } // no user gesture / unsupported
  el.classList.replace('island-float', 'island');
  for (const sheet of document.styleSheets) {
    const style = pip.document.createElement('style');
    try { style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n'); } catch { continue; }
    pip.document.head.append(style);
  }
  pip.document.body.style.margin = '0';
  pip.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? '';
  pip.document.body.append(el);
  voice.setDoc(pip.document);
  pip.addEventListener('pagehide', () => {
    document.body.append(el);
    el.classList.replace('island', 'island-float');
    voice.setDoc(document);
    pip = null;
  }, { once: true });
}

export const closeIsland = () => pip?.close();
export const dismissIsland = () => { voice.byId('voice').hidden = true; closeIsland(); };
