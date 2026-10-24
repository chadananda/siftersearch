// dewey-received ops job { id } — a small DOCUMENT a member uploaded to R2 (worker/dewey-upload.js): stream it from the edge into the
// Dewey ingest folder (the existing check → appraise → offer path takes it from there), then drop the R2 copy. Streams to disk, no processing here.
import { createWriteStream } from 'fs';
import { mkdir, rename, unlink } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { getItem, updateItem } from '../repos/dewey-repo.js';
import { enqueue } from '../repos/ops-report-repo.js';
import { ingestDir } from './dewey-ingest-folder-job.js';

const EDGE = process.env.DEWEY_EDGE_ORIGIN || 'https://siftersearch.com';

export async function deweyReceivedJob({ id }, deps = {}) {
  const { fetchImpl = fetch, dir = ingestDir(), queue = enqueue } = deps;
  const item = await getItem(id), up = item?.identified?.upload;
  if (!item || !up?.key) return { skipped: 'no such upload' };
  if (item.state !== 'received') return { skipped: `already ${item.state}` };
  const headers = { 'x-internal-key': process.env.INTERNAL_API_KEY };
  const res = await fetchImpl(`${EDGE}/_dewey/blob?key=${encodeURIComponent(up.key)}`, { headers });
  if (!res.ok) { await updateItem(item.id, {}, `could not fetch the upload from the edge (${res.status}); will retry`); throw new Error(`edge ${res.status}`); }
  const folder = join(dir, 'uploads', String(up.userId));
  await mkdir(folder, { recursive: true });
  const dest = join(folder, `${up.key.split('/').pop()}`), tmp = `${dest}.part`;
  try { await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp)); await rename(tmp, dest); }
  catch (e) { await unlink(tmp).catch(() => {}); throw e; }
  await fetchImpl(`${EDGE}/_dewey/blob?key=${encodeURIComponent(up.key)}`, { method: 'DELETE', headers }).catch(() => {});
  await updateItem(item.id, { state: 'archived' }, `handed to the ingest folder (${up.name}); Dewey checks it against the library next`);
  await queue('dewey-ingest-folder', { batch: 5, round: 1 }, 'dewey-received');
  return { handed: dest };
}

/** dewey-discard { ids } — drop received uploads that are not wanted (test files, mistakes): delete the R2 object, mark the item declined. */
export async function deweyDiscardJob({ ids = [] } = {}, deps = {}) {
  const { fetchImpl = fetch } = deps, out = { discarded: [], skipped: [] };
  for (const id of ids.slice(0, 200)) {
    const item = await getItem(id), up = item?.identified?.upload;
    if (!item || item.state !== 'received' || !up?.key) { out.skipped.push(id); continue; }
    const r = await fetchImpl(`${EDGE}/_dewey/blob?key=${encodeURIComponent(up.key)}`, { method: 'DELETE', headers: { 'x-internal-key': process.env.INTERNAL_API_KEY } });
    if (!r.ok) { out.skipped.push(id); continue; }
    await updateItem(item.id, { state: 'declined' }, 'upload discarded; the stored copy was deleted');
    out.discarded.push(id);
  }
  return out;
}
