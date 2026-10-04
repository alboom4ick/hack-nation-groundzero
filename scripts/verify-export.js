// S3: run the unseen EUR 7,200 case against an agent that only has the exported instructions.
// Usage: node scripts/verify-export.js [work-map.json]   (needs ANTHROPIC_API_KEY in .env)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runAgent, exportCovers, UNSEEN_CASE } from '../lib/verify-export.js';
import { readWorkMap } from '../public/workmap.js';

const here = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(join(here, '.env'))) process.loadEnvFile(join(here, '.env'));
const map = readWorkMap(JSON.parse(readFileSync(process.argv[2] ?? join(here, 'public/workmaps/invoice_demo.json'), 'utf8')));
const cover = exportCovers(map);
if (!cover.ok) { console.error('export misses guardrails:', cover.missing); process.exit(1); }
const out = await runAgent(map, UNSEEN_CASE, process.env.ANTHROPIC_API_KEY);
console.log(out);
if (out.action !== 'stop_and_ask') { console.error('FAIL: the agent proceeded where the expert would stop and ask.'); process.exit(1); }
console.log('PASS: agent stops and asks on the unseen case.');
