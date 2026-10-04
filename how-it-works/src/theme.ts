import {Easing, continueRender, delayRender, interpolate, staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';

// Same palette and type as public/landing/index.html, so the clips sit in the page without a seam.
export const C = {
  night: '#0b1d1a',
  night2: '#0f2a26',
  fg: '#e9f1ec',
  muted: '#a3bbb3',
  line: 'rgba(143,209,199,.22)',
  mint: '#8fd1c7',
  glow: '#2dd4bf',
  amber: '#f0a93b',
  amberDk: '#b45309',
  paper: '#f5f1ea',
  surface: '#fffdf9',
  ink: '#242722',
  inkMuted: '#5e645c',
  rule: '#cbc7be',
  accent: '#176b63',
  tint: '#ddede8',
  rec: '#e0493f',
  blue: '#1f5fbf',
};

export const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
export const SANS = "'Atkinson Hyperlegible',system-ui,sans-serif";
export const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

const fontsHandle = delayRender('Loading Atkinson Hyperlegible');
Promise.all([
  loadFont({family: 'Atkinson Hyperlegible', url: staticFile('atkinson-400.woff2'), weight: '400'}),
  loadFont({family: 'Atkinson Hyperlegible', url: staticFile('atkinson-700.woff2'), weight: '700'}),
])
  .catch((err) => console.error(err))
  .finally(() => continueRender(fontsHandle));

export const ease = Easing.bezier(0.2, 0.7, 0.2, 1);
export const ease2 = Easing.bezier(0.5, 0, 0.2, 1);
export const pop = Easing.bezier(0.2, 0.9, 0.3, 1.25);

/** 0..1 progress of `f` between frames a and b. */
export const p = (f: number, a: number, b: number, e: (t: number) => number = ease) =>
  interpolate(f, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e});

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Fade in at `a`, out at `b` (both 8 frames). */
export const window_ = (f: number, a: number, b: number) => p(f, a, a + 8) * (1 - p(f, b, b + 8));

export const typed = (text: string, f: number, start: number, cps = 28) =>
  text.slice(0, Math.max(0, Math.floor(((f - start) * cps) / 30)));

/** Piecewise path through [frame, x, y] keyframes, eased between each pair. */
export function path(f: number, pts: [number, number, number][]): {x: number; y: number} {
  if (f <= pts[0][0]) return {x: pts[0][1], y: pts[0][2]};
  for (let i = 1; i < pts.length; i++) {
    const [f0, x0, y0] = pts[i - 1];
    const [f1, x1, y1] = pts[i];
    if (f <= f1) {
      const t = ease2((f - f0) / (f1 - f0));
      return {x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t};
    }
  }
  const last = pts[pts.length - 1];
  return {x: last[1], y: last[2]};
}

export const W = 1280;
export const H = 720;
export const FPS = 30;
