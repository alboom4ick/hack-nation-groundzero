// First-pass object grounding: open-source COCO-SSD (TensorFlow.js) running in the browser.
// Maps an anchor label ("red-label bottle") to a COCO class and returns its screen position.
// Labels with no COCO class (pen, regions) return null -> player falls back to tap-to-locate.

const TFJS = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
const COCO = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';

// keyword in label -> COCO classes. Override per anchor with `"detect": ["cup"]` in the workflow JSON.
const KEYWORDS = {
  bottle: ['bottle'], cup: ['cup'], mug: ['cup'], glass: ['wine glass', 'cup'],
  notebook: ['book', 'laptop'], book: ['book'], laptop: ['laptop'], computer: ['laptop'],
  phone: ['cell phone'], mouse: ['mouse'], keyboard: ['keyboard'], remote: ['remote'],
  scissors: ['scissors'], case: ['suitcase', 'handbag', 'backpack'], bag: ['handbag', 'backpack'],
  backpack: ['backpack'], bowl: ['bowl'], banana: ['banana'], apple: ['apple'], orange: ['orange'],
  vase: ['vase'], clock: ['clock'], chair: ['chair'], plant: ['potted plant'], monitor: ['tv'], screen: ['tv'],
  toothbrush: ['toothbrush'], umbrella: ['umbrella'], knife: ['knife'], fork: ['fork'], spoon: ['spoon'],
};

export function classesFor(anchor) {
  if (!anchor || anchor.type === 'region') return null;
  if (Array.isArray(anchor.detect)) return anchor.detect;
  const words = String(anchor.label ?? '').toLowerCase().split(/[^a-z]+/);
  for (const w of words) if (KEYWORDS[w]) return KEYWORDS[w];
  return null;
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error(`failed to load ${src}`));
    document.head.append(s);
  });
}

let modelPromise;
function loadModel() {
  modelPromise ??= (async () => {
    await loadScript(TFJS);
    await loadScript(COCO);
    return window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
  })();
  return modelPromise;
}

// Video pixel box -> normalized screen coords, accounting for object-fit: cover.
function toScreen(box, video) {
  const [x, y, w, h] = box;
  const W = window.innerWidth, H = window.innerHeight;
  const vw = video.videoWidth, vh = video.videoHeight;
  const k = Math.max(W / vw, H / vh);
  const ox = (vw * k - W) / 2, oy = (vh * k - H) / 2;
  return { x: ((x + w / 2) * k - ox) / W, y: ((y + h / 2) * k - oy) / H };
}

const inView = (p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;

// Resolves to {x, y} (normalized screen coords) of the best match, or null.
export async function locate(video, anchor, minScore = 0.45) {
  const classes = classesFor(anchor);
  if (!classes || !video.videoWidth) return null;
  const model = await loadModel();
  const found = await model.detect(video, 10, minScore);
  const hit = found.filter((d) => classes.includes(d.class)).sort((a, b) => b.score - a.score)
    .map((d) => toScreen(d.bbox, video)).find(inView);
  return hit ?? null;
}

export const canDetect = (anchor) => classesFor(anchor) != null;
export const warmUp = () => loadModel().catch(() => {});
