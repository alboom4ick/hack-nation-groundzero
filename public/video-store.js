// Videos of an action tree, in S3 through presigned URLs: the file goes straight from the browser to the bucket.
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 503 ? 'Video storage is not set up on this server yet.' : j.error ?? `HTTP ${r.status}`);
  return j;
}

export const listVideos = (treeId, name) => api(`/api/videos?tree=${encodeURIComponent(treeId ?? '')}&name=${encodeURIComponent(name ?? '')}`);
export const deleteVideo = (id) => api('/api/videos/delete', { id });

export async function uploadVideo(treeId, blob, { name = 'video', duration } = {}) {
  const contentType = (blob.type || 'video/webm').split(';')[0];
  const { id, uploadUrl } = await api('/api/videos', { treeId, name, contentType, size: blob.size, duration });
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
  if (!put.ok) throw new Error(`Upload to storage failed (HTTP ${put.status}).`);
  await api('/api/videos/confirm', { id });
  return id;
}
