import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSegment } from './lib/describe.js';
import { speak } from './lib/tts.js';
import { transcribe } from './lib/stt.js';
import { scribeToken } from './lib/scribe.js';
import { signedUrl } from './lib/agents.js';
import { checkAction, gradePrediction } from './lib/tutor.js';
import { proposeWorkMap, explainWorkMap, judgeTeachBack } from './lib/workmap.js';

const here = fileURLToPath(new URL('.', import.meta.url));
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
  return JSON.parse((await readRaw(req)).toString() || '{}');
}

const need = (...names) => {
  const v = names.map((n) => process.env[n]).find(Boolean);
  if (!v) throw Object.assign(new Error(`${names[0]} is not set in .env`), { status: 500 });
  return v;
};

const elevenKey = () => need('ELEVENLABS_API', 'ELEVENLABS_API_KEY');

const agentIds = () => ({ tutor: process.env.ELEVENAGENTS_TUTOR_ID, interviewer: process.env.ELEVENAGENTS_INTERVIEWER_ID });

const routes = {
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
  'POST /api/describe': async (req, res) => {
    const { frames, frameTimes, tStart, tEnd, context } = await readJson(req);
    if (!Array.isArray(frames) || !frames.length) throw Object.assign(new Error('frames required'), { status: 400 });
    const out = await describeSegment({ frames, frameTimes, tStart, tEnd, context }, need('ANTHROPIC_API_KEY'));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
  },
  'POST /api/workmap': async (req, res) => {
    const { nodes, debrief } = await readJson(req);
    if (!Array.isArray(nodes) || !nodes.length) throw Object.assign(new Error('nodes required'), { status: 400 });
    const out = await proposeWorkMap({ nodes, debrief: Array.isArray(debrief) ? debrief : [] }, need('ANTHROPIC_API_KEY'));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
  },
  'POST /api/teachback': async (req, res) => {
    const { steps } = await readJson(req);
    if (!Array.isArray(steps) || !steps.length) throw Object.assign(new Error('steps required'), { status: 400 });
    const out = await explainWorkMap({ steps }, need('ANTHROPIC_API_KEY'));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
  },
  'POST /api/teachback/judge': async (req, res) => {
    const { explanation, reply } = await readJson(req);
    if (typeof explanation !== 'string' || typeof reply !== 'string' || !reply.trim()) throw Object.assign(new Error('explanation and reply required'), { status: 400 });
    const out = await judgeTeachBack({ explanation: explanation.slice(0, 2000), reply: reply.slice(0, 2000) }, need('ANTHROPIC_API_KEY'));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
  },
  'POST /api/tutor/check': async (req, res) => {
    const { workMap, frames, said } = await readJson(req);
    if (!Array.isArray(workMap?.steps) || !workMap.steps.length) throw Object.assign(new Error('workMap required'), { status: 400 });
    if (!Array.isArray(frames) || !frames.length) throw Object.assign(new Error('frames required'), { status: 400 });
    const out = await checkAction({ workMap, frames, said: typeof said === 'string' ? said : '' }, need('ANTHROPIC_API_KEY'));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
  },
  'POST /api/tutor/predict': async (req, res) => {
    const { step, answer } = await readJson(req);
    if (!step?.title || !Array.isArray(step.guardrails) || typeof answer !== 'string' || !answer.trim()) throw Object.assign(new Error('step and answer required'), { status: 400 });
    const out = await gradePrediction({ step, answer: answer.slice(0, 1000) }, need('ANTHROPIC_API_KEY'));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
  },
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

createServer(async (req, res) => {
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
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(process.env.PORT ?? 3000, () => console.log('http://localhost:' + (process.env.PORT ?? 3000)));
