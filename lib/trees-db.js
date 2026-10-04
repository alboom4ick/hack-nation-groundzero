// The action-tree store in Postgres (Aurora Serverless v2, see infra/). The draft is kept whole as jsonb; the
// steps and guardrails are also written as rows so the metadata can be queried.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { readSteps } from '../public/workmap.js';

export const SCHEMA_SQL = `
create table if not exists action_trees (
  id text primary key, name text not null, base_id text, base_name text,
  step_count int not null, guardrail_count int not null, doc jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists action_steps (
  tree_id text not null references action_trees(id) on delete cascade, position int not null,
  step_id text not null, title text not null, decision text, reason text, enabled boolean not null, custom boolean not null,
  primary key (tree_id, position));
create table if not exists action_guardrails (
  tree_id text not null, step_position int not null, position int not null,
  kind text not null, rule text not null, enabled boolean not null, custom boolean not null,
  primary key (tree_id, step_position, position),
  foreign key (tree_id, step_position) references action_steps(tree_id, position) on delete cascade);`;

let pool;
export const dbConfigured = () => !!process.env.DATABASE_URL;
const db = () => {
  if (!dbConfigured()) throw Object.assign(new Error('DATABASE_URL is not set in .env'), { status: 503 });
  // The connection is encrypted and the server certificate is checked against the AWS RDS CA bundle.
  const ca = readFileSync(new URL('./certs/rds-global-bundle.pem', import.meta.url), 'utf8');
  return (pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { ca, rejectUnauthorized: true }, max: 3, connectionTimeoutMillis: 30000 }));
};

export const migrate = () => db().query(SCHEMA_SQL);

export async function listTrees() {
  const { rows } = await db().query('select id, name, updated_at, doc from action_trees order by updated_at desc');
  return rows.map((r) => ({ id: r.id, name: r.name, base: r.doc.base ?? null, saved_at: r.updated_at.toISOString(), draft: r.doc }));
}

export async function getTree(id) { return (await listTrees()).find((t) => t.id === id) ?? null; }

export async function saveTree({ id, draft }) {
  readSteps(draft?.steps);
  const name = String(draft.process?.name ?? '').trim().slice(0, 120);
  if (!name) throw Object.assign(new Error('the tree needs a name'), { status: 400 });
  id = typeof id === 'string' && /^[\w-]{1,40}$/.test(id) ? id : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const steps = draft.steps, rails = steps.flatMap((s) => s.guardrails);
  const c = await db().connect();
  try {
    await c.query('begin');
    await c.query(`insert into action_trees (id, name, base_id, base_name, step_count, guardrail_count, doc) values ($1,$2,$3,$4,$5,$6,$7)
      on conflict (id) do update set name=$2, base_id=$3, base_name=$4, step_count=$5, guardrail_count=$6, doc=$7, updated_at=now()`,
      [id, name, draft.base?.id ?? null, draft.base?.name ?? null, steps.filter((s) => !s.off).length, rails.filter((g) => !g.off).length, { ...draft, process: { ...draft.process, name } }]);
    await c.query('delete from action_steps where tree_id=$1', [id]);
    for (const [i, s] of steps.entries()) {
      await c.query('insert into action_steps values ($1,$2,$3,$4,$5,$6,$7,$8)', [id, i, s.id, s.title, s.decision ?? null, s.reason?.words ?? null, !s.off, !!s.custom]);
      for (const [k, g] of s.guardrails.entries()) await c.query('insert into action_guardrails values ($1,$2,$3,$4,$5,$6,$7)', [id, i, k, g.kind, g.rule, !g.off, g.source === 'custom']);
    }
    await c.query('commit');
  } catch (err) { await c.query('rollback'); throw err; } finally { c.release(); }
  return getTree(id);
}

export async function deleteTree(id) { await db().query('delete from action_trees where id=$1', [id]); }
