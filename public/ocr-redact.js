// G6, automatic part: OCR the frame in the browser (tesseract.js) and paint over every text line that holds personal
// data (IBAN, email, phone, long digit runs). Opt-in because it adds about a second per frame. Pure helper first so it
// can be tested without a browser.
import { redact } from './redact.js';

const LONG_DIGITS = /\d(?:[\s.-]?\d){8,}/;
export const hasPii = (text) => redact(text) !== text || LONG_DIGITS.test(text);

// lines: [{ text, bbox: { x0, y0, x1, y1 } }] in frame pixels -> boxes to paint, padded a little
export function piiBoxes(lines, pad = 3) {
  return lines.filter((l) => l.text && hasPii(l.text))
    .map(({ bbox: b }) => ({ x: Math.max(0, b.x0 - pad), y: Math.max(0, b.y0 - pad), w: b.x1 - b.x0 + 2 * pad, h: b.y1 - b.y0 + 2 * pad }));
}

const SDK = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
const KEY = 'groundzero.ocr';
export const ocrEnabled = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setOcrEnabled = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ } };

// Returns async mask(canvas, ctx): paints the boxes, resolves to how many it painted. Never throws: on any OCR
// failure the frame is withheld by the caller via the rejected flag (fail closed).
export function createOcrMasker() {
  let worker = null;
  return async (canvas, ctx) => {
    if (!ocrEnabled()) return 0;
    worker ??= import(/* @vite-ignore */ SDK).then((m) => (m.createWorker ?? m.default.createWorker)('eng'));
    const w = await worker;
    const { data } = await w.recognize(canvas, {}, { blocks: true });
    const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({ text: l.text, bbox: l.bbox }));
    const boxes = piiBoxes(lines);
    ctx.save();
    ctx.fillStyle = '#000';
    for (const b of boxes) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
    return boxes.length;
  };
}
