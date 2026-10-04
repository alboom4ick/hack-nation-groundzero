// Dev helper: render several frames of one composition to PNG to eyeball the layout.
// usage: node stills.mjs S1Expert 40,90,150 ./out-dir
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const [id, frames, dir] = process.argv.slice(2);
mkdirSync(dir, {recursive: true});
const serveUrl = await bundle({entryPoint: fileURLToPath(new URL('./src/index.ts', import.meta.url))});
const composition = await selectComposition({serveUrl, id});
for (const frame of frames.split(',').map(Number)) {
  await renderStill({composition, serveUrl, frame, output: `${dir}/${id}-${String(frame).padStart(3, '0')}.png`});
}
console.log('done', frames);
