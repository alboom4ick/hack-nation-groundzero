// Renders every clip to ../public/landing/how/<name>.mp4 plus a poster <name>.jpg.
// usage: node render.mjs            (all clips)
//        node render.mjs 3-paper    (one clip)
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const OUT = fileURLToPath(new URL('../public/landing/how/', import.meta.url));
// composition id → file name, and the share of the clip at which the busiest, most telling frame sits (the poster)
const CLIPS = [
  {id: 'S1Expert', name: '1-expert', poster: 0.97},
  {id: 'S2Screen', name: '2-screen', poster: 0.95},
  {id: 'S3Paper', name: '3-paper', poster: 0.96},
  {id: 'S4Map', name: '4-map', poster: 0.97},
  {id: 'S5Teach', name: '5-teach', poster: 0.975},
  {id: 'S6Agent', name: '6-agent', poster: 0.8},
];

const only = process.argv[2];
mkdirSync(OUT, {recursive: true});
const serveUrl = await bundle({entryPoint: fileURLToPath(new URL('./src/index.ts', import.meta.url))});

for (const clip of CLIPS.filter((c) => !only || c.name === only)) {
  const composition = await selectComposition({serveUrl, id: clip.id});
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 25,
    pixelFormat: 'yuv420p',
    x264Preset: 'slow',
    muted: true,
    outputLocation: `${OUT}${clip.name}.mp4`,
    onProgress: ({progress}) => process.stdout.write(`\r${clip.name} ${(progress * 100).toFixed(0)}%   `),
  });
  await renderStill({composition, serveUrl, frame: Math.round(composition.durationInFrames * clip.poster), imageFormat: 'jpeg', jpegQuality: 84, output: `${OUT}${clip.name}.jpg`});
  console.log(`\r${clip.name} done (${composition.durationInFrames} frames)`);
}
