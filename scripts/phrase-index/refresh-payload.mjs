#!/usr/bin/env node
// Re-stamps `collection` on already-indexed points after documents are renamed (scripts/library/name-ool-sources.mjs):
// Qdrant `phrases` + `paragraphs_kw` (set_payload filtered by doc_id) and the vector store's units table, so a later
// re-upsert from the store keeps the new name. No re-embedding. Reads current names from sifter.db (read-only).
//   node scripts/phrase-index/refresh-payload.mjs --backup /tank/sifter/backups/ool-names-2026-10-02.json [--backup …]
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
const QD = 'http://127.0.0.1:6333', QK = process.env.QDRANT_KEY || '';
const backups = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--backup' ? [a] : []));
const ids = [...new Set(backups.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).map((p) => p.id)))];

const src = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
const store = new Database('/tank/sifter/phrase-vectors/vectors.db');
store.pragma('busy_timeout = 60000');   // the build writes this store concurrently
store.exec('CREATE INDEX IF NOT EXISTS units_doc ON units(doc_id)');   // without it each per-doc UPDATE scanned 1.5M rows under the write lock
const nameOf = src.prepare('SELECT collection FROM docs WHERE id = ?');
const setUnits = store.prepare('UPDATE units SET collection = ? WHERE doc_id = ?');

async function qd(path, body) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(QD + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': QK }, body: JSON.stringify(body) });
      if (!r.ok) throw Object.assign(new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 200)}`), { http: true });
      return r.json();
    } catch (e) { if (e.http || attempt >= 4) throw e; await new Promise((res) => setTimeout(res, 1000 * (attempt + 1))); }
  }
}

let n = 0;
for (const id of ids) {
  const c = nameOf.get(id)?.collection;
  if (!c) continue;
  const body = { payload: { collection: c }, filter: { must: [{ key: 'doc_id', match: { value: id } }] } };
  await qd('/collections/phrases/points/payload?wait=false', body);
  await qd('/collections/paragraphs_kw/points/payload?wait=false', body);
  setUnits.run(c, String(id));
  if (++n % 500 === 0) console.log(`${n}/${ids.length}`);
}
console.log(`done — ${n} documents re-stamped`);
