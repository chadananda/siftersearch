#!/usr/bin/env node
// Keyword layer (runs ON tower-nas): every library paragraph → BM25 sparse vector (api/lib/keyword-tokens.js) → Qdrant
// `paragraphs_kw` (sparse 'bm25', modifier idf). Replaces Meili keyword retrieval. No AI spend.
// :rules: point id = paragraph id; --scope library = 'primary' (default), supplemental = the site-scraped copies (Meili's
//         per-site indexes); not duplicate; every point carries `scope`. Resumable: checkpoint per scope = last content id sent.
//   node scripts/phrase-index/keyword-index.mjs [--scope library|supplemental] [--fresh] [--limit N]
//   (avgLen comes from the library pass and is reused for supplemental, so BM25 weights stay comparable)
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tokens, bm25Doc } from '../../api/lib/keyword-tokens.js';
import { paragraphLang } from '../../api/lib/phrase-vectors.js';
import { boilerplateTexts, keepSiteParagraph } from '../../api/lib/site-boilerplate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(`--${k}`);
const DB = arg('db', join(ROOT, 'data', 'sifter.db'));
const QD = arg('qdrant-url', 'http://127.0.0.1:6333'), QK = process.env.QDRANT_KEY || '', COLL = arg('collection', 'paragraphs_kw');
const SCOPE = arg('scope', 'library'), DB_SCOPE = SCOPE === 'supplemental' ? 'supplemental' : 'primary';
const CKPT = arg('checkpoint', SCOPE === 'supplemental' ? '/tank/sifter/phrase-vectors/keyword-index-supplemental.json' : '/tank/sifter/phrase-vectors/keyword-index.json'), LIMIT = +arg('limit', 0), BATCH = 500, MAX_TERMS = 150000;   // Qdrant drops oversized requests (EPIPE) — cap by terms too
const log = (o) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }));

// Retries socket errors: a keep-alive socket that sat idle (e.g. while SQLite sorts) is closed by Qdrant, and fetch
// reuses it anyway → 'other side closed' / EPIPE (same race as the writer keepAlive bug, 2026-08-13).
async function qd(method, path, body) {
  const payload = body && JSON.stringify(body);
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(QD + path, { method, headers: { 'Content-Type': 'application/json', 'api-key': QK }, body: payload });
      if (!r.ok) throw Object.assign(new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`), { http: true });
      return r.json();
    } catch (e) {
      if (e.http || attempt >= 4) throw e;
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
}

const src = new Database(DB, { readonly: true, fileMustExist: true });
// scraped sites: skip markup-only lines and recurring page chrome (api/lib/site-boilerplate.js); library never filtered
const BP = SCOPE === 'supplemental' ? boilerplateTexts(src) : null;
const wanted = (text) => !BP || keepSiteParagraph(text, BP);
const SQL = `SELECT c.id, c.doc_id, c.text, d.language, d.religion, d.collection, d.author FROM content c JOIN docs d ON d.id = c.doc_id
  WHERE d.scope = '${DB_SCOPE}' AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND COALESCE(c.is_duplicate, 0) = 0 AND LENGTH(c.text) > 0
  AND c.id > ? ORDER BY c.id`;

let state = !has('fresh') && existsSync(CKPT) ? JSON.parse(readFileSync(CKPT, 'utf8')) : null;
if (!state) {
  let n = 0, total = 0;
  for (const p of src.prepare(SQL).iterate(0)) { if (!wanted(p.text)) continue; total += tokens(p.text).length; n++; }
  // supplemental reuses the library's average length: one BM25 scale across both scopes in the same collection
  const LIB_CKPT = '/tank/sifter/phrase-vectors/keyword-index.json';
  const avgLen = SCOPE === 'supplemental' && existsSync(LIB_CKPT) ? JSON.parse(readFileSync(LIB_CKPT, 'utf8')).avgLen : total / Math.max(1, n);
  state = { lastId: 0, sent: 0, avgLen, paragraphs: n };
  writeFileSync(CKPT, JSON.stringify(state));
  log({ phase: 'avg-len', paragraphs: n, avgLen: +state.avgLen.toFixed(1) });
}

const exists = await qd('GET', `/collections/${COLL}/exists`).then((r) => r.result.exists);
if (has('fresh') && SCOPE === 'supplemental') throw new Error('--fresh with --scope supplemental would delete the library points too; use --checkpoint to restart supplemental');
if (!exists || has('fresh')) {
  if (exists) await qd('DELETE', `/collections/${COLL}`);
  await qd('PUT', `/collections/${COLL}`, { vectors: {}, sparse_vectors: { bm25: { modifier: 'idf' } } });
  for (const [field_name, field_schema] of [['doc_id', 'integer'], ['lang_group', 'keyword'], ['religion', 'keyword'], ['collection', 'keyword'], ['author', 'keyword'], ['scope', 'keyword']])
    await qd('PUT', `/collections/${COLL}/index?wait=true`, { field_name, field_schema });
  log({ phase: 'collection-created', collection: COLL });
}
await qd('PUT', `/collections/${COLL}/index?wait=false`, { field_name: 'scope', field_schema: 'keyword' }).catch(() => {});   // made before scope existed; wait=false — a blocking index build on millions of points outlived the client timeout

const t0 = Date.now(); let batch = [], sentRun = 0, terms = 0, nextLog = 0;
const flush = async () => {
  if (!batch.length) return;
  await qd('PUT', `/collections/${COLL}/points?wait=false`, { points: batch });
  state.lastId = batch[batch.length - 1].id; state.sent += batch.length; sentRun += batch.length; batch = []; terms = 0;
  writeFileSync(CKPT, JSON.stringify(state));
  if (state.sent >= nextLog) { nextLog += 100000; log({ phase: 'upsert', sent: state.sent, of: state.paragraphs, per_hour: Math.round(sentRun / ((Date.now() - t0) / 3.6e6)) }); }
};
for (const p of src.prepare(SQL).iterate(state.lastId)) {
  if (!wanted(p.text)) continue;
  const v = bm25Doc(p.text, state.avgLen);
  if (v) terms += v.indices.length;
  if (v) batch.push({ id: p.id, vector: { bm25: v }, payload: { paragraph_id: p.id, doc_id: p.doc_id, lang_group: paragraphLang(p.text, p.language).group,
    religion: p.religion, collection: p.collection, author: p.author, scope: DB_SCOPE } });
  if (batch.length >= BATCH || terms >= MAX_TERMS) await flush();
  if (LIMIT && sentRun + batch.length >= LIMIT) break;
}
await flush();
log({ phase: 'done', sent: state.sent, minutes: +((Date.now() - t0) / 6e4).toFixed(1) });
src.close();
