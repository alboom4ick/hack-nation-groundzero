// Videos that belong to an action tree: bytes in a private S3 bucket (browser uploads and plays through presigned
// URLs, so they never pass through this server), metadata in Postgres next to the tree.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { query } from './trees-db.js';

export const VIDEOS_SQL = `
create table if not exists action_videos (
  id text primary key, tree_id text not null, s3_key text not null, name text not null,
  content_type text not null, size_bytes bigint, duration_s real, uploaded boolean not null default false,
  created_at timestamptz not null default now());
create index if not exists action_videos_tree on action_videos (tree_id);`;

const TYPES = ['video/webm', 'video/mp4', 'video/quicktime'];
const MAX_BYTES = 2 * 1024 ** 3;
let s3;
const bucket = () => {
  if (!process.env.S3_VIDEO_BUCKET) throw Object.assign(new Error('S3_VIDEO_BUCKET is not set in .env'), { status: 503 });
  return process.env.S3_VIDEO_BUCKET;
};
const client = () => (s3 ??= new S3Client({ region: process.env.AWS_REGION ?? 'us-west-1' }));
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const treeId = (v) => { if (typeof v !== 'string' || !/^[\w-]{1,40}$/.test(v)) throw bad('tree id required'); return v; };
const ext = (type) => (type === 'video/mp4' ? 'mp4' : type === 'video/quicktime' ? 'mov' : 'webm');

export const migrateVideos = () => query(VIDEOS_SQL);

// -> { id, uploadUrl }. The row is created now and marked uploaded by confirmVideo once the PUT succeeded.
export async function startUpload({ treeId: tree, name, contentType, size, duration }) {
  tree = treeId(tree);
  const type = String(contentType ?? '').split(';')[0];
  if (!TYPES.includes(type)) throw bad(`video type must be one of ${TYPES.join(', ')}`);
  if (!(size > 0 && size <= MAX_BYTES)) throw bad('video size must be between 1 byte and 2 GB');
  const id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const key = `trees/${tree}/${id}.${ext(type)}`;
  const label = String(name ?? 'video').slice(0, 120);
  await query('insert into action_videos (id, tree_id, s3_key, name, content_type, size_bytes, duration_s) values ($1,$2,$3,$4,$5,$6,$7)',
    [id, tree, key, label, type, Math.round(size), Number.isFinite(duration) ? duration : null]);
  const uploadUrl = await getSignedUrl(client(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: type }), { expiresIn: 900 });
  return { id, uploadUrl };
}

export async function confirmVideo(id) {
  const { rowCount } = await query('update action_videos set uploaded=true where id=$1', [String(id)]);
  if (!rowCount) throw Object.assign(new Error('unknown video'), { status: 404 });
}

// A tree's videos: those saved under its id, plus the recording its Work Map came from (matched by video name).
export async function listVideos(tree, name) {
  const { rows } = await query('select * from action_videos where uploaded and (tree_id=$1 or name=$2) order by created_at desc', [tree ? treeId(tree) : '', name ? String(name).slice(0, 120) : null]);
  return Promise.all(rows.map(async (r) => ({
    id: r.id, name: r.name, size: Number(r.size_bytes), duration: r.duration_s, created_at: r.created_at.toISOString(),
    url: await getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: r.s3_key }), { expiresIn: 3600 }),
  })));
}

export async function deleteVideo(id) {
  const { rows } = await query('delete from action_videos where id=$1 returning s3_key', [String(id)]);
  if (rows[0]) await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: rows[0].s3_key }));
}

// Videos of a tree that is deleted go with it.
export async function deleteTreeVideos(tree) {
  const { rows } = await query('delete from action_videos where tree_id=$1 returning s3_key', [treeId(tree)]);
  for (const r of rows) await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: r.s3_key }));
}
