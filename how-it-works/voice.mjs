// Generates the voice-over mp3 for each clip with ElevenLabs (same key and voice as the app's /api/tts).
// usage: node voice.mjs            (all clips) -> ../public/landing/how/<clip>.mp3
//        node voice.mjs 3-paper    (one clip)
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {speak} from '../lib/tts.js';

process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const key = process.env.ELEVENLABS_API || process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API missing in .env');
const lines = JSON.parse(readFileSync(new URL('./narration.json', import.meta.url), 'utf8'));
const only = process.argv[2];
for (const [name, text] of Object.entries(lines).filter(([name]) => !only || name === only)) {
  const mp3 = await speak(text, key, { voiceId: process.env.ELEVENLABS_VOICE_ID || undefined, voiceSettings: { speed: 1.08 } });
  writeFileSync(fileURLToPath(new URL(`../public/landing/how/${name}.mp3`, import.meta.url)), mp3);
  console.log(name, mp3.length, 'bytes');
}
