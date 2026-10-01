#!/usr/bin/env node
// Phrase indexer (runs ON tower-nas): content SQLite (read-only) → phrase units (api/lib/phrases.js) → Gemini Embedding 2
// → half-precision vector store on /tank (the permanent copy Qdrant is rebuilt from) → Qdrant `phrases`.
// :rules: resumable + idempotent — a vector is keyed by model + dims + exact text (never paid for twice); units keyed by
//         point id (paragraph × 1000 + k) with their segmenter version; Qdrant upserts only units not yet sent.
// :edge: the store is its own SQLite file (not the content DB) → no load on the single writer.
//   node scripts/phrase-index/indexer.mjs --scope originals --embed [--concurrency 16] [--limit N] [--max-usd 40] [--scan-only]
//   node scripts/phrase-index/indexer.mjs --docs 21380 --embed     (explicit documents, e.g. the Arabic Qur'an)
//   node scripts/phrase-index/indexer.mjs --field original --embed  (originals stored on translation paragraphs: original_text)
//   node scripts/phrase-index/indexer.mjs --qdrant          (QDRANT_KEY in env; after --embed)
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { unitsOf, vecKey, packF16, unpackF16, arabicShare } from '../../api/lib/phrase-vectors.js';
import { faShare } from '../../api/lib/arabic-script.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(`--${k}`);
const DB = arg('db', join(ROOT, 'data', 'sifter.db'));
const STORE = arg('store', '/tank/sifter/phrase-vectors/vectors.db');
const SCOPE = arg('scope', 'originals');
const FIELD = arg('field', 'text');                      // 'original' = the bilingual layer: content.original_text on (English) paragraphs
const DOCS = (arg('docs', '') || '').split(',').map(Number).filter(Boolean);   // explicit documents, any religion (e.g. the Arabic Qur'an)                 // originals = Bahá'í paragraphs mostly in Arabic script
const MODEL = 'gemini-embedding-2', DIMS = 3072, BATCH = 96, CONC = +arg('concurrency', 16), LIMIT = +arg('limit', 0);
const MAX_USD = +arg('max-usd', 0);                       // spend guard: stop after the scan if the estimate exceeds it
const QD = arg('qdrant-url', 'http://127.0.0.1:6333'), QK = process.env.QDRANT_KEY || '', COLL = arg('collection', 'phrases');
const log = (o) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }));

mkdirSync(dirname(STORE), { recursive: true });
const store = new Database(STORE);
store.pragma('journal_mode = WAL');
store.exec(`CREATE TABLE IF NOT EXISTS vec (key TEXT PRIMARY KEY, model TEXT, dims INTEGER, v BLOB, at INTEGER);
CREATE TABLE IF NOT EXISTS units (point_id INTEGER PRIMARY KEY, paragraph_id TEXT, doc_id TEXT, k INTEGER, start INTEGER, "end" INTEGER,
  seg_v TEXT, key TEXT, fa_share REAL, religion TEXT, author TEXT, lang_label TEXT, upserted INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS units_key ON units(key); CREATE INDEX IF NOT EXISTS units_up ON units(upserted);`);
if (!store.prepare('PRAGMA table_info(units)').all().some((c) => c.name === 'field')) store.exec("ALTER TABLE units ADD COLUMN field TEXT DEFAULT 'text'");

async function embedBatch(texts) {
  const body = { requests: texts.map((t) => ({ model: `models/${MODEL}`, content: { parts: [{ text: `title: none | text: ${t}` }] }, outputDimensionality: DIMS })) };
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${process.env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
      if (r.ok) return (await r.json()).embeddings.map((e) => e.values);
      if (attempt >= 20 || ![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`gemini ${r.status} ${(await r.text()).slice(0, 200)}`);
    } catch (e) { if (attempt >= 20) throw e; }
    // per-minute quota (429) clears in minutes — wait it out (up to 5 min per try) instead of failing the run
    await new Promise((res) => setTimeout(res, Math.min(300000, 3000 * 2 ** attempt)));
  }
}

async function embed() {
  const src = new Database(DB, { readonly: true, fileMustExist: true });
  // FIELD 'original': the original lives on the (English) paragraph as original_text — the unit keeps that paragraph's id,
  // so translation and original stay linked; point ids cannot collide (those paragraphs' own text is not Arabic-script).
  const col = FIELD === 'original' ? 'c.original_text' : 'c.text';
  const rows = src.prepare(`SELECT c.id, c.doc_id, ${col} AS text, ${FIELD === 'original' ? 'COALESCE(c.original_lang, d.language)' : 'd.language'} AS language,
      d.author, d.religion FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE ${DOCS.length ? `d.id IN (${DOCS.join(',')})` : "d.religion = 'Baha''i'"} AND d.deleted_at IS NULL AND c.deleted_at IS NULL
      AND COALESCE(c.is_duplicate, 0) = 0 AND LENGTH(${col}) > 0`);
  const haveUnit = store.prepare('SELECT seg_v, key FROM units WHERE point_id = ?');
  const putUnit = store.prepare(`INSERT INTO units (point_id, paragraph_id, doc_id, k, start, "end", seg_v, key, fa_share, religion, author, lang_label, field, upserted)
    VALUES (@pointId, @pid, @doc, @k, @start, @end, @segV, @key, @fa, @religion, @author, @lang, @field, 0)
    ON CONFLICT(point_id) DO UPDATE SET start=@start, "end"=@end, seg_v=@segV, key=@key, fa_share=@fa, religion=@religion, author=@author, lang_label=@lang, field=@field, upserted=0`);
  const haveVec = store.prepare('SELECT 1 FROM vec WHERE key = ?');
  const pending = new Map();                                   // key → embed text
  let paras = 0, units = 0;
  const tx = store.transaction((list) => { for (const u of list) putUnit.run(u); });
  let buf = [];
  for (const p of rows.iterate()) {
    if (SCOPE === 'originals' && arabicShare(p.text) < 0.5) continue;
    paras++;
    for (const u of unitsOf({ id: p.id, text: p.text, lang: 'ar' })) {
      const key = vecKey(MODEL, DIMS, u.embedText), old = haveUnit.get(u.pointId);
      if (!old || old.seg_v !== u.segV || old.key !== key)
        buf.push({ ...u, pid: String(p.id), doc: String(p.doc_id), key, fa: faShare(u.embedText), religion: p.religion, author: p.author, lang: p.language, field: FIELD });
      if (!haveVec.get(key)) pending.set(key, u.embedText);
      units++;
    }
    if (buf.length >= 5000) { tx(buf); buf = []; }
    if (LIMIT && paras >= LIMIT) break;
  }
  tx(buf); src.close();
  const est = [...pending.values()].reduce((s, t) => s + t.length, 0) / 3;
  const estUsd = +(est / 1e6 * 0.20).toFixed(2);
  log({ phase: 'scan', scope: SCOPE, paragraphs: paras, units, to_embed: pending.size, est_tokens: Math.round(est), est_usd: estUsd });
  if (MAX_USD && estUsd > MAX_USD) { log({ phase: 'stopped', reason: `estimate $${estUsd} exceeds --max-usd ${MAX_USD}` }); return; }
  if (has('scan-only')) return;
  const putVec = store.prepare('INSERT OR IGNORE INTO vec (key, model, dims, v, at) VALUES (?, ?, ?, ?, ?)');
  const entries = [...pending.entries()]; let done = 0, next = 0; const t0 = Date.now();
  async function worker() {
    while (next < entries.length) {
      const chunk = entries.slice(next, next += BATCH);
      const vs = await embedBatch(chunk.map(([, t]) => t));
      store.transaction(() => chunk.forEach(([k], i) => putVec.run(k, MODEL, DIMS, packF16(vs[i]), Date.now())))();
      done += chunk.length;
      if (done % 19200 < BATCH) log({ phase: 'embed', done, of: entries.length, per_hour: Math.round(done / ((Date.now() - t0) / 3.6e6)) });
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  log({ phase: 'embed-done', embedded: done, minutes: +((Date.now() - t0) / 6e4).toFixed(1) });
}

async function qd(method, path, body) {
  const r = await fetch(QD + path, { method, headers: { 'Content-Type': 'application/json', 'api-key': QK }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function upsert() {
  const exists = await qd('GET', `/collections/${COLL}/exists`).then((r) => r.result.exists);
  if (!exists) {
    await qd('PUT', `/collections/${COLL}`, { vectors: { literal: { size: DIMS, distance: 'Cosine', on_disk: true } }, quantization_config: { binary: { always_ram: true } } });
    for (const [field_name, field_schema] of [['paragraph_id', 'integer'], ['doc_id', 'integer'], ['lang_group', 'keyword'], ['religion', 'keyword'], ['author', 'keyword'], ['fa_share', 'float']])
      await qd('PUT', `/collections/${COLL}/index?wait=true`, { field_name, field_schema });
    log({ phase: 'collection-created', collection: COLL });
  }
  const page = store.prepare(`SELECT u.*, v.v FROM units u JOIN vec v ON v.key = u.key WHERE u.upserted = 0 LIMIT 256`);
  const mark = store.prepare('UPDATE units SET upserted = 1 WHERE point_id = ?');
  let sent = 0; const t0 = Date.now();
  for (;;) {
    const rows = page.all(); if (!rows.length) break;
    await qd('PUT', `/collections/${COLL}/points?wait=true`, { points: rows.map((r) => ({ id: r.point_id, vector: { literal: unpackF16(r.v) },
      payload: { paragraph_id: Number(r.paragraph_id), doc_id: Number(r.doc_id), k: r.k, start: r.start, end: r.end, seg_v: r.seg_v,
        lang_group: 'ar-fa', fa_share: r.fa_share, religion: r.religion, author: r.author, lang_label: r.lang_label, field: r.field || 'text' } })) });
    store.transaction(() => rows.forEach((r) => mark.run(r.point_id)))();
    sent += rows.length;
    if (sent % 25600 < 256) log({ phase: 'upsert', sent, per_hour: Math.round(sent / ((Date.now() - t0) / 3.6e6)) });
  }
  log({ phase: 'upsert-done', sent, minutes: +((Date.now() - t0) / 6e4).toFixed(1) });
}

if (has('embed')) await embed();
if (has('qdrant')) await upsert();
store.close();
