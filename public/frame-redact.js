// Personal data on screen frames: configurable regions (fractions of the frame) are painted over before a frame
// leaves the browser for /api/describe or /api/tutor/check. A solid fill, not a blur, so nothing can be recovered.
// This is the "at minimum" form of A5; automatic detection (Presidio image redactor) is still open.
const KEY = 'groundzero.blur';

// "70,10,25,8; 0,90,100,10" (percent x, y, width, height) -> [{x,y,w,h}] as 0..1 fractions; bad entries are dropped.
export function parseRegions(text) {
  return String(text ?? '').split(/[;\n]/).map((part) => part.split(/[\s,]+/).filter(Boolean).map(Number))
    .filter((n) => n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 && n[0] >= 0 && n[1] >= 0 && n[0] < 100 && n[1] < 100)
    .map(([x, y, w, h]) => ({ x: x / 100, y: y / 100, w: Math.min(w, 100 - x) / 100, h: Math.min(h, 100 - y) / 100 }));
}

export const regionsText = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const saveRegionsText = (t) => { try { localStorage.setItem(KEY, t); } catch { /* private mode */ } };

// Returns paint(ctx, w, h); reads the saved regions on every call so edits apply to the next frame.
export function createBlurrer(read = () => parseRegions(regionsText())) {
  return (ctx, w, h) => {
    const regions = read();
    if (!regions.length) return 0;
    ctx.save();
    ctx.fillStyle = '#000';
    for (const r of regions) ctx.fillRect(Math.floor(r.x * w), Math.floor(r.y * h), Math.ceil(r.w * w), Math.ceil(r.h * h));
    ctx.restore();
    return regions.length;
  };
}
