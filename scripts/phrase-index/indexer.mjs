#!/usr/bin/env node
// Phrase indexer (runs ON tower-nas): content SQLite (read-only) → phrase units (api/lib/phrases.js) → Gemini Embedding 2
// → half-precision vector store on /tank (the permanent copy Qdrant is rebuilt from) → Qdrant `phrases`.
// :rules: resumable + idempotent — a vector is keyed by model + dims + exact text (never paid for twice); units keyed by
//         point id (paragraph × 1000 + k) with their segmenter version; Qdrant upserts only units not yet sent.
// :rules: spend is a LIVE cap — estimated per batch and kept in the store's `spend` ledger under --budget-key, so it holds
//         across restarts; the run stops cleanly when the next batch would cross --max-usd.
// :edge: library scope = scope 'primary'; supplemental = the site-scraped copies (bahai-library.com, oceanoflights.org),
//        Meili's per-site indexes — every point carries `scope` so search can include or exclude them. Script picks the segmenter.
//   node scripts/phrase-index/indexer.mjs --scope library --religion bahai --embed --qdrant --max-usd 180 [--scan-only]
//   node scripts/phrase-index/indexer.mjs --scope supplemental --embed --qdrant --max-usd 180
//   node scripts/phrase-index/indexer.mjs --scope originals --embed     (Bahá'í Arabic-script paragraphs only)
//   node scripts/phrase-index/indexer.mjs --docs 21380 --embed          (explicit documents, e.g. the Arabic Qur'an)
//   node scripts/phrase-index/indexer.mjs --field original --embed      (originals stored on translations: original_text)
//   node scripts/phrase-index/indexer.mjs --qdrant                      (upsert anything embedded but not yet sent)
//   … --monthly-usd 400   stop when this month's Gemini indexing spend (all indexers, /tank/sifter/gemini-spend.db) would pass $400
//   node scripts/phrase-index/indexer.mjs --field hype --scope library --store /tank/sifter/hype-vectors/vectors.db \
//        --collection hype --budget-key hype-build --embed --qdrant --max-usd 40
//        (HyPE: each stored question + the thesis is a unit; point id = paragraph × 1000 + k, thesis k = 999. Own store and
//         collection — ids would collide with phrase units, and the phrase build holds that store's write lock.)
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { unitsOf, vecKey, packF16, unpackF16, arabicShare, paragraphLang, estTokens } from '../../api/lib/phrase-vectors.js';
import { faShare } from '../../api/lib/arabic-script.js';
import { boilerplateTexts, keepSiteParagraph } from '../../api/lib/site-boilerplate.js';
import { paragraphAuthor } from '../../api/lib/authorship/effective.js';
import { authorKey } from '../../api/lib/search/qdrant-layers.js';
import { parseStoredHypQuestions } from '../../api/lib/search/hype.js';
import { logAIUsage } from '../../api/lib/ai-services.js';   // every Gemini batch is ALSO a row in the shared spend ledger

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(`--${k}`);
const DB = arg('db', join(ROOT, 'data', 'sifter.db'));
const STORE = arg('store', '/tank/sifter/phrase-vectors/vectors.db');
const SCOPE = arg('scope', 'originals');                  // originals | library | supplemental
const SCRIPT = arg('script', 'all');                      // library only: arabic | other | all
const RELIGION = arg('religion', 'all');                  // library only: bahai | other | all (plan order: Bahá'í first)
const FIELD = arg('field', 'text');                       // 'original' = the bilingual layer: content.original_text; 'hype' = HyPE questions
const DOCS = (arg('docs', '') || '').split(',').map(Number).filter(Boolean);
const MODEL = 'gemini-embedding-2', DIMS = 3072, BATCH = 96, CONC = +arg('concurrency', 16), LIMIT = +arg('limit', 0);
const CHUNK = +arg('chunk', 20000);                       // paragraphs per embed→upsert cycle
const MAX_USD = +arg('max-usd', 0), BUDGET = arg('budget-key', 'library-build'), PRICE = 0.20;   // $ per 1M tokens (online)
const QD = arg('qdrant-url', 'http://127.0.0.1:6333'), QK = process.env.QDRANT_KEY || '', COLL = arg('collection', 'phrases');
const log = (o) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }));

mkdirSync(dirname(STORE), { recursive: true });
const store = new Database(STORE);
store.pragma('journal_mode = WAL');
store.pragma('busy_timeout = 120000');   // other tools (refresh-payload) write this store too — a lock killed the 10-02 build
store.exec(`CREATE TABLE IF NOT EXISTS vec (key TEXT PRIMARY KEY, model TEXT, dims INTEGER, v BLOB, at INTEGER);
CREATE TABLE IF NOT EXISTS units (point_id INTEGER PRIMARY KEY, paragraph_id TEXT, doc_id TEXT, k INTEGER, start INTEGER, "end" INTEGER,
  seg_v TEXT, key TEXT, fa_share REAL, religion TEXT, author TEXT, lang_label TEXT, upserted INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS units_key ON units(key); CREATE INDEX IF NOT EXISTS units_up ON units(upserted);
CREATE TABLE IF NOT EXISTS spend (budget TEXT PRIMARY KEY, tokens INTEGER, usd REAL, at INTEGER);`);
const cols = new Set(store.prepare('PRAGMA table_info(units)').all().map((c) => c.name));
for (const [c, t] of [['field', "TEXT DEFAULT 'text'"], ['lang_group', 'TEXT'], ['collection', 'TEXT'], ['scope', 'TEXT']])
  if (!cols.has(c)) store.exec(`ALTER TABLE units ADD COLUMN ${c} ${t}`);

// MONTHLY cap across ALL Gemini indexing (Chad 10-05: "$400/month total"): one shared ledger every indexer adds to; a run
// stops cleanly when the month's spend would pass --monthly-usd, and is resumed next month (vectors are cached, so a stop
// costs nothing). Separate from --max-usd (a lifetime cap per budget key).
const MONTHLY = +arg('monthly-usd', 0);
const ledger = new Database(arg('ledger', '/tank/sifter/gemini-spend.db'));
ledger.pragma('busy_timeout = 60000');
ledger.exec('CREATE TABLE IF NOT EXISTS month_spend (month TEXT, source TEXT, tokens INTEGER DEFAULT 0, usd REAL DEFAULT 0, PRIMARY KEY (month, source))');
const thisMonth = () => new Date().toISOString().slice(0, 7);
const monthSpent = () => ledger.prepare('SELECT COALESCE(SUM(usd), 0) s FROM month_spend WHERE month = ?').get(thisMonth()).s;
const addMonth = ledger.prepare(`INSERT INTO month_spend (month, source, tokens, usd) VALUES (?, ?, ?, ?)
  ON CONFLICT(month, source) DO UPDATE SET tokens = tokens + excluded.tokens, usd = usd + excluded.usd`);

const spentRow = () => store.prepare('SELECT tokens, usd FROM spend WHERE budget = ?').get(BUDGET) || { tokens: 0, usd: 0 };
const addSpend = store.prepare(`INSERT INTO spend (budget, tokens, usd, at) VALUES (@b, @t, @u, @at)
  ON CONFLICT(budget) DO UPDATE SET tokens = tokens + @t, usd = usd + @u, at = @at`);

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

function source() {
  const src = new Database(DB, { readonly: true, fileMustExist: true });
  // FIELD 'original': the original lives on the (English) paragraph as original_text — the unit keeps that paragraph's id,
  // so translation and original stay linked; point ids cannot collide (those paragraphs' own text is not Arabic-script).
  const col = FIELD === 'original' ? 'c.original_text' : 'c.text';
  const rel = RELIGION === 'bahai' ? " AND d.religion = 'Baha''i'" : RELIGION === 'other' ? " AND d.religion <> 'Baha''i'" : '';
  const where = DOCS.length ? `d.id IN (${DOCS.join(',')})`
    : SCOPE === 'library' ? `d.scope = 'primary'${rel}` : SCOPE === 'supplemental' ? `d.scope = 'supplemental'${rel}` : "d.religion = 'Baha''i'";
  // PAGED by content.id, each page its own short read: ONE .iterate() over the whole scope held a single read transaction
  // for the entire build (12–27 h), so the WAL could never be checkpointed — it grew to 12 GB, and the worker restarted the
  // API every 15 min trying to free it (the 2026-10-03 "restart storm"). Never stream a long build through one statement.
  const page = src.prepare(`SELECT c.id, c.doc_id, ${col} AS text, ${FIELD === 'original' ? 'COALESCE(c.original_lang, d.language)' : 'd.language'} AS language,
      c.authors, d.author, d.religion, d.collection, d.scope${FIELD === 'hype' ? ', c.hyp_questions, c.hyp_thesis' : ''} FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE ${where} AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND COALESCE(c.is_duplicate, 0) = 0 AND LENGTH(${col}) > 0
      ${FIELD === 'hype' ? "AND (COALESCE(c.hyp_questions, '') <> '' OR COALESCE(c.hyp_thesis, '') <> '')" : ''}
      AND c.id > ? ORDER BY c.id LIMIT 5000`);
  const rows = { *iterate() { for (let last = 0; ;) { const got = page.all(last); if (!got.length) return; yield* got; last = got[got.length - 1].id; } } };
  return { src, rows };
}

// scraped sites: skip markup-only lines and recurring page chrome (api/lib/site-boilerplate.js); library never filtered
let BP = null;
const keep = (text) => {
  if (SCOPE === 'supplemental') {
    BP ??= boilerplateTexts(new Database(DB, { readonly: true, fileMustExist: true }));
    if (!keepSiteParagraph(text, BP)) return false;
  }
  if (SCOPE === 'originals' && !DOCS.length) return arabicShare(text) >= 0.5;
  if (SCRIPT === 'arabic') return arabicShare(text) >= 0.5;
  if (SCRIPT === 'other') return arabicShare(text) < 0.5;
  return true;
};

const haveUnit = store.prepare('SELECT seg_v, key FROM units WHERE point_id = ?');
const putUnit = store.prepare(`INSERT INTO units (point_id, paragraph_id, doc_id, k, start, "end", seg_v, key, fa_share, religion, author, lang_label, field, lang_group, collection, scope, upserted)
  VALUES (@pointId, @pid, @doc, @k, @start, @end, @segV, @key, @fa, @religion, @author, @lang, @field, @group, @collection, @scope, 0)
  ON CONFLICT(point_id) DO UPDATE SET start=@start, "end"=@end, seg_v=@segV, key=@key, fa_share=@fa, religion=@religion, author=@author,
    lang_label=@lang, field=@field, lang_group=@group, collection=@collection, scope=@scope, upserted=0`);
const haveVec = store.prepare('SELECT 1 FROM vec WHERE key = ?');
const putVec = store.prepare('INSERT OR IGNORE INTO vec (key, model, dims, v, at) VALUES (?, ?, ?, ?, ?)');
const tx = store.transaction((list) => { for (const u of list) putUnit.run(u); });

// The units of one paragraph: its phrases, or (--field hype) its HyPE questions + thesis.
const HYPE_SEG = 'hype-v1';
function unitsFor(p, seg) {
  if (FIELD !== 'hype') return unitsOf({ id: p.id, text: p.text, lang: seg });
  const qs = parseStoredHypQuestions(p.hyp_questions).slice(0, 998), thesis = String(p.hyp_thesis || '').trim();
  const u = (k, text) => ({ pointId: p.id * 1000 + k, k, start: null, end: null, segV: HYPE_SEG, embedText: text });
  return [...qs.map((q, k) => u(k, q)), ...(thesis ? [u(999, thesis)] : [])];
}

// Paragraphs → units (stored) + texts still needing a vector. Returns the pending map for this chunk.
function unitize(paras) {
  const pending = new Map(), buf = [];
  for (const p of paras) {
    const { seg, group } = paragraphLang(p.text, p.language);
    for (const u of unitsFor(p, seg)) {
      const key = vecKey(MODEL, DIMS, u.embedText), old = haveUnit.get(u.pointId);
      if (!old || old.seg_v !== u.segV || old.key !== key)
        buf.push({ ...u, pid: String(p.id), doc: String(p.doc_id), key, fa: faShare(u.embedText), religion: p.religion, author: paragraphAuthor(p),
          lang: p.language, field: FIELD, group, collection: p.collection || null, scope: p.scope || 'primary' });
      if (!haveVec.get(key)) pending.set(key, u.embedText);
    }
  }
  tx(buf);
  return { pending, units: buf.length };
}

let stopped = null;
async function embedPending(pending) {
  const entries = [...pending.entries()]; let next = 0, done = 0;
  async function worker() {
    while (next < entries.length && !stopped) {
      const chunk = entries.slice(next, next += BATCH);
      const tokens = chunk.reduce((s, [, t]) => s + estTokens(t), 0), usd = tokens / 1e6 * PRICE;
      if (MAX_USD && spentRow().usd + usd > MAX_USD) { stopped = `budget ${BUDGET} would pass $${MAX_USD}`; break; }
      if (MONTHLY && monthSpent() + usd > MONTHLY) { stopped = `monthly cap: ${thisMonth()} would pass $${MONTHLY}`; break; }
      const vs = await embedBatch(chunk.map(([, t]) => t));
      store.transaction(() => {
        chunk.forEach(([k], i) => putVec.run(k, MODEL, DIMS, packF16(vs[i]), Date.now()));
        addSpend.run({ b: BUDGET, t: tokens, u: usd, at: Date.now() });
      })();
      addMonth.run(thisMonth(), BUDGET, tokens, usd);
      // The shared ledger (ai_usage) is where all spend is read (analytics, Anís costs). gemini-spend.db stays as this
      // script's own monthly cap counter; until 10-10 it was the ONLY record, so $322 of vectors never showed (Chad 10-10).
      logAIUsage({ provider: 'google', model: MODEL, serviceType: 'embedding', promptTokens: tokens, caller: `phrase-index:${BUDGET}` });
      done += chunk.length;
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  return done;
}

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

async function ensureCollection() {
  const exists = await qd('GET', `/collections/${COLL}/exists`).then((r) => r.result.exists);
  if (!exists) {
    await qd('PUT', `/collections/${COLL}`, { vectors: { literal: { size: DIMS, distance: 'Cosine', on_disk: true } }, quantization_config: { binary: { always_ram: true } } });
    log({ phase: 'collection-created', collection: COLL });
  }
  for (const [field_name, field_schema] of [['paragraph_id', 'integer'], ['doc_id', 'integer'], ['lang_group', 'keyword'], ['religion', 'keyword'],
    ['author', 'keyword'], ['author_fold', 'keyword'], ['collection', 'keyword'], ['fa_share', 'float'], ['scope', 'keyword']])
    await qd('PUT', `/collections/${COLL}/index?wait=true`, { field_name, field_schema }).catch(() => {});   // already there → fine
}

const page = store.prepare(`SELECT u.*, v.v FROM units u JOIN vec v ON v.key = u.key WHERE u.upserted = 0 LIMIT 256`);
const mark = store.prepare('UPDATE units SET upserted = 1 WHERE point_id = ?');
async function upsert() {
  let sent = 0;
  for (;;) {
    const rows = page.all(); if (!rows.length) break;
    await qd('PUT', `/collections/${COLL}/points?wait=true`, { points: rows.map((r) => ({ id: r.point_id, vector: { literal: unpackF16(r.v) },
      payload: { paragraph_id: Number(r.paragraph_id), doc_id: Number(r.doc_id), k: r.k, start: r.start, end: r.end, seg_v: r.seg_v,
        lang_group: r.lang_group || 'ar-fa', fa_share: r.fa_share, religion: r.religion, author: r.author, author_fold: authorKey(r.author), collection: r.collection,
        lang_label: r.lang_label, field: r.field || 'text', scope: r.scope || 'primary', ...(r.field === 'hype' ? { is_thesis: r.k === 999 } : {}) } })) });
    store.transaction(() => rows.forEach((r) => mark.run(r.point_id)))();
    sent += rows.length;
  }
  return sent;
}

async function scanOnly() {
  const { src, rows } = source(); const seen = new Set(); let paras = 0, units = 0, tokens = 0;
  for (const p of rows.iterate()) {
    if (!keep(p.text)) continue;
    paras++;
    const { seg } = paragraphLang(p.text, p.language);
    for (const u of unitsFor(p, seg)) {
      units++;
      const key = vecKey(MODEL, DIMS, u.embedText);
      if (!seen.has(key) && !haveVec.get(key)) { seen.add(key); tokens += estTokens(u.embedText); }
    }
    if (LIMIT && paras >= LIMIT) break;
  }
  src.close();
  log({ phase: 'scan', scope: SCOPE, script: SCRIPT, religion: RELIGION, paragraphs: paras, units, to_embed: seen.size, est_tokens: tokens,
    est_usd: +(tokens / 1e6 * PRICE).toFixed(2), spent_so_far: spentRow() });
}

async function build() {
  if (has('qdrant')) await ensureCollection();
  const { src, rows } = source(); const t0 = Date.now();
  let paras = 0, units = 0, embedded = 0, sent = 0, batch = [];
  const flush = async () => {
    const r = unitize(batch); units += r.units; batch = [];
    if (has('embed')) embedded += await embedPending(r.pending);
    if (has('qdrant')) sent += await upsert();
    log({ phase: 'chunk', paragraphs: paras, units, embedded, upserted: sent, spent: spentRow(), month_usd: +monthSpent().toFixed(2),
      paras_per_hour: Math.round(paras / ((Date.now() - t0) / 3.6e6)) });
  };
  for (const p of rows.iterate()) {
    if (!keep(p.text)) continue;
    batch.push(p); paras++;
    if (batch.length >= CHUNK) await flush();
    if (stopped || (LIMIT && paras >= LIMIT)) break;
  }
  if (batch.length && !stopped) await flush();
  src.close();
  log({ phase: stopped ? 'stopped' : 'done', reason: stopped, paragraphs: paras, units, embedded, upserted: sent, spent: spentRow(),
    minutes: +((Date.now() - t0) / 6e4).toFixed(1) });
}

if (has('scan-only')) await scanOnly();
else if (has('embed')) await build();
else if (has('qdrant')) { await ensureCollection(); log({ phase: 'upsert-done', sent: await upsert() }); }
store.close();
