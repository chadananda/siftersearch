// dedup-repo — the donor dedup registry (migration 194): one fingerprint row per donor file, keyed drive+path. Written by ops/archive-sample-job.js from a worker probe.
// Read by ops/archive-import-dryrun-job.js + archive-import-job.js (archives/dedup.js clusters them). Deps: db.js.
import { query, queryAll } from '../db.js';

/** Insert/refresh one file's fingerprint { drive_id, path, item_id, sha256, norm_sha, minhash, title_norm, title, words, pages, bytes, cls, fmt }. */
export const upsertFingerprint = (r) => query(`INSERT INTO dedup_registry (drive_id, path, item_id, sha256, norm_sha, minhash, title_norm, title, words, pages, bytes, cls, fmt, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(drive_id, path) DO UPDATE SET item_id = excluded.item_id, sha256 = excluded.sha256, norm_sha = excluded.norm_sha,
  minhash = excluded.minhash, title_norm = excluded.title_norm, title = excluded.title, words = excluded.words, pages = excluded.pages, bytes = excluded.bytes, cls = excluded.cls, fmt = excluded.fmt`,
[r.drive_id, r.path, r.item_id ?? null, r.sha256 ?? null, r.norm_sha ?? null, r.minhash ?? null, r.title_norm ?? null, r.title ?? null, r.words ?? null, r.pages ?? null, r.bytes ?? null,
  r.cls ?? null, r.fmt ?? null, new Date().toISOString()], 'dedup:upsert');

/** Every fingerprint seen on any drive (the cross-collection view a new drive is deduped against). */
export const registryRows = () => queryAll('SELECT * FROM dedup_registry', [], 'dedup:all');
