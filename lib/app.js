import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSegment } from './describe.js';
import { speak } from './tts.js';
import { transcribe } from './stt.js';
import { scribeToken } from './scribe.js';
import { signedUrl, syncKnowledge } from './agents.js';
import { toAgentMarkdown } from '../public/agent-export.js';
import { checkAction, gradePrediction } from './tutor.js';
import { handleMcp } from './guardrail-mcp.js';
import { proposeWorkMap, explainWorkMap, judgeTeachBack } from './workmap.js';
import { readWorkMap } from '../public/workmap.js';

const here = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(join(here, '.env'))) process.loadEnvFile(join(here, '.env'));

const root = join(here, 'public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const MAX_BODY = 20 * 1024 * 1024;

async function readRaw(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  try { return JSON.parse((await readRaw(req)).toString() || '{}'); }
  catch (err) { throw err.status ? err : Object.assign(new Error('request body is not JSON'), { status: 400 }); }
}

const need = (...names) => {
  const v = names.map((n) => process.env[n]).find(Boolean);
  if (!v) throw Object.assign(new Error(`${names[0]} is not set in .env`), { status: 500 });
  return v;
};

const elevenKey = () => need('ELEVENLABS_API', 'ELEVENLABS_API_KEY');

const agentIds = () => ({ tutor: process.env.ELEVENAGENTS_TUTOR_ID, interviewer: process.env.ELEVENAGENTS_INTERVIEWER_ID });

// The Work Map the MCP guardrail lookup serves: GUARDRAIL_MAP (a path) or the bundled sample.
const mcpMap = async () => readWorkMap(JSON.parse(await readFile(process.env.GUARDRAIL_MAP ?? join(root, 'workmaps', 'invoice_demo.json'), 'utf8')));

const sendJson = (res, body, headers = {}) => res.writeHead(200, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));

const routes = {
  'POST /mcp': async (req, res) => {
    const msg = await readJson(req);
    const map = await mcpMap();
    const out = Array.isArray(msg) ? msg.map((m) => handleMcp(map, m)).filter(Boolean) : handleMcp(map, msg);
    if (out === null || (Array.isArray(out) && !out.length)) { res.writeHead(202).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
  },
  'GET /api/scribe/token': async (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ token: await scribeToken(elevenKey()) }));
  },
  'GET /api/agent/status': async (req, res) => {
    const ids = agentIds();
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ tutor: !!ids.tutor, interviewer: !!ids.interviewer }));
  },
  'GET /api/agent/session': async (req, res) => {
    const role = new URL(req.url, 'http://x').searchParams.get('role');
    const id = agentIds()[role];
    if (!id) throw Object.assign(new Error(`ElevenAgents ${role} is not set up (run node scripts/setup-agents.js)`), { status: 503 });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ signedUrl: await signedUrl(id, elevenKey()) }));
  },
  'POST /api/describe': async (req, res) => sendJson(res, await describeSegment(await readJson(req), need('ANTHROPIC_API_KEY'))),
  'POST /api/workmap': async (req, res) => sendJson(res, await proposeWorkMap(await readJson(req), need('ANTHROPIC_API_KEY'))),
  'POST /api/teachback': async (req, res) => sendJson(res, await explainWorkMap(await readJson(req), need('ANTHROPIC_API_KEY'))),
  'POST /api/teachback/judge': async (req, res) => sendJson(res, await judgeTeachBack(await readJson(req), need('ANTHROPIC_API_KEY'))),
  'POST /api/tutor/knowledge': async (req, res) => {
    const workMap = readWorkMap((await readJson(req)).workMap);
    const id = agentIds().tutor;
    if (!id) throw Object.assign(new Error('ElevenAgents tutor is not set up (run node scripts/setup-agents.js)'), { status: 503 });
    const name = String(workMap.process?.name ?? 'process').slice(0, 80);
    sendJson(res, { id: await syncKnowledge(id, { name, text: toAgentMarkdown(workMap) }, elevenKey()) });
  },
  'POST /api/tutor/check': async (req, res) => sendJson(res, await checkAction(await readJson(req), need('ANTHROPIC_API_KEY'))),
  'POST /api/tutor/predict': async (req, res) => sendJson(res, await gradePrediction(await readJson(req), need('ANTHROPIC_API_KEY'))),
  'POST /api/tts': async (req, res) => {
    const { text } = await readJson(req);
    if (typeof text !== 'string' || !text.trim() || text.length > 500) throw Object.assign(new Error('text required (max 500 chars)'), { status: 400 });
    const audio = await speak(text, elevenKey(), { voiceId: process.env.ELEVENLABS_VOICE_ID || undefined });
    res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(audio);
  },
  'POST /api/stt': async (req, res) => {
    const audio = await readRaw(req);
    if (audio.length < 1000) throw Object.assign(new Error('audio too short'), { status: 400 });
    const text = await transcribe(audio, req.headers['content-type'], elevenKey());
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text }));
  },
};

export async function handler(req, res) {
  const path = new URL(req.url, 'http://x').pathname;
  const handler = routes[`${req.method} ${path}`];
  if (handler) {
    try { await handler(req, res); }
    catch (err) {
      console.error(err.message);
      res.writeHead(err.status ?? 502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    // A bare directory path (/sandbox) serves its index.html, as Vercel does.
    const dir = !extname(file);
    const body = await readFile(file).catch((err) => (err.code === 'EISDIR' ? readFile(join(file, 'index.html')) : Promise.reject(err)));
    res.writeHead(200, { 'content-type': types[extname(file)] ?? (dir ? types['.html'] : 'application/octet-stream') });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}

