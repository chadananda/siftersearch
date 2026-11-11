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
//   node scripts/phrase-index/indexer.mjs --tier core|gray|supplemental --embed --qdrant   (doctrinal tier, ORDER not filter: run core, then
//        gray, then supplemental; BOTH scopes; each PARAGRAPH by its own author — authority.js doctrinalTier; never a --scope)
//   node scripts/phrase-index/indexer.mjs --docs 21380 --embed          (explicit documents, e.g. the Arabic Qur'an)
//   node scripts/phrase-index/indexer.mjs --docs-file ids.txt --embed   (thousands of documents: argv tops out ~128 KB)
//   node scripts/phrase-index/indexer.mjs --field original --embed      (originals stored on translations: original_text)
//   node scripts/phrase-index/indexer.mjs --qdrant                      (upsert anything embedded but not yet sent)
//   … --monthly-usd 400   stop when this month's Gemini indexing spend (all indexers, /tank/sifter/gemini-spend.db) would pass $400
//   node scripts/phrase-index/indexer.mjs --field hype --scope library --store /tank/sifter/hype-vectors/vectors.db \
//        --collection hype --budget-key hype-build --embed --qdrant --max-usd 40
//        (HyPE: each stored question + the thesis is a unit; point id = paragraph × 1000 + k, thesis k = 999. Own store and
//         collection — ids would collide with phrase units, and the phrase build holds that store's write lock.)
//   node scripts/phrase-index/indexer.mjs --field concepts --scope library --store /tank/sifter/concept-vectors/vectors.db \
//        --collection concepts --budget-key concepts-build --embed --qdrant --max-usd 5
//        (concept claims: each proof-checked claim statement is a unit, point id = paragraph × 1000 + k; only docs with claims)
import Database from 'better-sqlite3';
import { limiterFromEnv, stateFileFor } from './embed-limiter.mjs';
import { createSyncEmbedder, watchWait } from './embed-sync.mjs';
import { createBatchEmbedder, batchStateFileFor } from './embed-batch.mjs';
import dotenv from 'dotenv';
import { mkdirSync, statfsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { unitsOf, unitChange, vecKey, packF16, unpackF16, arabicShare, paragraphLang, estTokens } from '../../api/lib/phrase-vectors.js';
import { faShare } from '../../api/lib/arabic-script.js';
import { dirBytes, hotVerdict, parseMemAvailable } from './hot-space.mjs';
import { boilerplateTexts, keepSiteParagraph } from '../../api/lib/site-boilerplate.js';
import { paragraphAuthor } from '../../api/lib/authorship/effective.js';
import { doctrinalTier } from '../../api/lib/authority.js';
import { authorKey } from '../../api/lib/search/qdrant-layers.js';
import { INDEXABLE_DOC_SQL, TAG_INDEX_SQL } from '../../api/lib/search/excluded-docs.js';
import { parseStoredHypQuestions } from '../../api/lib/search/hype.js';
import { logAIUsage } from '../../api/lib/ai-services.js';   // every Gemini batch is ALSO a row in the shared spend ledger
import { noteProviderError, isExhaustion } from '../../api/lib/spend-alerts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(`--${k}`);
const DB = arg('db', join(ROOT, 'data', 'sifter.db'));
const STORE = arg('store', '/tank/sifter/phrase-vectors/vectors.db');
const SCOPE = arg('scope', 'originals');                  // originals | library | supplemental
const SCRIPT = arg('script', 'all');                      // library only: arabic | other | all
const TIER = arg('tier', 'all');                          // core | gray | supplemental | all (default: unchanged scope behaviour)
if (!['core', 'gray', 'supplemental', 'all'].includes(TIER)) throw new Error(`--tier must be core|gray|supplemental|all, got '${TIER}'`);
const RELIGION = arg('religion', 'all');                  // library only: bahai | other | all (plan order: Bahá'í first)
const FIELD = arg('field', 'text');                       // 'original' = the bilingual layer: content.original_text; 'hype' = HyPE questions; 'concepts' = concept claims
const DOCS = (arg('docs', '') || (arg('docs-file') ? readFileSync(arg('docs-file'), 'utf8') : '')).split(/[,\s]+/).map(Number).filter(Boolean);   // --docs-file: a list too long for argv (E2BIG)
const TIER_ON = TIER !== 'all' && !DOCS.length;            // an explicit --docs list wins
const MODEL = 'gemini-embedding-2', DIMS = 3072, BATCH = 96, CONC = +arg('concurrency', 16), LIMIT = +arg('limit', 0);
const CHUNK = +arg('chunk', 20000);                       // paragraphs per embed→upsert cycle
const MAX_USD = +arg('max-usd', 0), BUDGET = arg('budget-key', 'library-build'), PRICE = 0.20;   // $ per 1M tokens (online)
const QD = arg('qdrant-url', process.env.QDRANT_URL || 'http://127.0.0.1:6333'), QK = process.env.QDRANT_KEY || '', COLL = arg('collection', 'phrases');
// PHASE 0 HOT LAYER (planning/storage-wear-ram-plan.md §6.6): --hot-url sends NEW points to --hot-collection in qdrant-hot (RAM
// disk) instead of COLL on /fast; those units are marked upserted = 2 so --reconcile-hot can re-send any the RAM disk lost
// (crash before a flush). Stale deletes go to both. Stops cleanly when the RAM disk (--hot-path) has < --hot-min-free-gb free.
const HOT = arg('hot-url', ''), HOT_COLL = arg('hot-collection', 'phrases_hot'), HOT_PATH = arg('hot-path', '/srv/qram'), HOT_MIN_FREE = +arg('hot-min-free-gb', 6) * 1e9;
const UP = HOT ? { url: HOT, coll: HOT_COLL, mark: 2 } : { url: QD, coll: COLL, mark: 1 };
const log = (o) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }));
// Progress + waits go to stderr (the ops job keeps its tail): a run never sits silent — every wait names what it waits on (job #77869).
const note = (o) => process.stderr.write(`${JSON.stringify({ at: new Date().toISOString(), ...o })}\n`);
const waiting = (on, p) => watchWait(on, p, { note });

mkdirSync(dirname(STORE), { recursive: true });
const store = new Database(STORE);
store.pragma('journal_mode = WAL');
store.pragma('busy_timeout = 120000');   // other tools (refresh-payload) write this store too — a lock killed the 10-02 build
store.exec(`CREATE TABLE IF NOT EXISTS vec (key TEXT PRIMARY KEY, model TEXT, dims INTEGER, v BLOB, at INTEGER);
CREATE TABLE IF NOT EXISTS units (point_id INTEGER PRIMARY KEY, paragraph_id TEXT, doc_id TEXT, k INTEGER, start INTEGER, "end" INTEGER,
  seg_v TEXT, key TEXT, fa_share REAL, religion TEXT, author TEXT, lang_label TEXT, upserted INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS units_key ON units(key); CREATE INDEX IF NOT EXISTS units_up ON units(upserted);
CREATE TABLE IF NOT EXISTS spend (budget TEXT PRIMARY KEY, tokens INTEGER, usd REAL, at INTEGER);
-- paragraphs a 'text' run left out ON PURPOSE (scraped-site markup/page chrome): coverage counts them as done, not missing.
-- A paragraph that later gets units leaves this table (unitize).
CREATE TABLE IF NOT EXISTS skipped (paragraph_id INTEGER PRIMARY KEY, doc_id INTEGER, author TEXT, reason TEXT, at INTEGER);`);
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

// Adaptive (AIMD) concurrency up to --concurrency; EMBED_RPM / EMBED_TPM (the account's AI Studio quota) are optional hard caps; the ceiling is learned from 429s and shared via a state file (embed-limiter.mjs).
const limiter = limiterFromEnv(process.env, { max: Math.max(CONC, 32), start: Math.min(4, CONC), name: `embed-${MODEL}`, stateFile: stateFileFor(MODEL, process.env.GEMINI_API_KEY) });
// Bulk builds use the async Batch API (50 % price, <=24 h) unless --embed-mode sync / EMBED_MODE=sync; sync (adaptive limiter) is the fallback.
const EMBED_MODE = arg('embed-mode', process.env.EMBED_MODE || 'batch');
const batcher = EMBED_MODE === 'batch' ? createBatchEmbedder({ model: MODEL, apiKey: process.env.GEMINI_API_KEY, stateFile: batchStateFileFor(MODEL, process.env.GEMINI_API_KEY),
  maxWaitMs: DOCS.length ? 20 * 60000 : 46 * 3600000,   // a single talk is published when it is searchable: don't wait 24 h for it
  capTokens: Math.floor(+(process.env.EMBED_BATCH_CAP || 500000) * 0.8), onRetry: () => limiter.penalize(), note }) : null;
const JOB_REQS = +arg('job-requests', 500);
const buildReqs = (texts) => texts.map((t) => ({ model: `models/${MODEL}`, content: { parts: [{ text: `title: none | text: ${t}` }] }, outputDimensionality: DIMS }));
async function embedBatch(texts) {
  const requests = buildReqs(texts);
  if (!batcher) { const v = await embedSync(requests); v.mode = 'sync'; return v; }
  return batcher.embed(requests, { tokens: texts.reduce((n, t) => n + estTokens(t), 0), sync: embedSync });
}
// Sync path: <= BATCH requests per call (the API rejects > 100), retries only 429/5xx/network; any other status fails the run loudly.
const embedSync = createSyncEmbedder({ model: MODEL, apiKey: process.env.GEMINI_API_KEY, limiter, estTokens, maxPerCall: BATCH, note,
  onProviderError: (e) => noteProviderError('Gemini', e), isExhaustion });   // out of credit → immediate email (not per-minute 429s)

function source() {
  const src = new Database(DB, { readonly: true, fileMustExist: true });
  // FIELD 'original': the original lives on the (English) paragraph as original_text — the unit keeps that paragraph's id,
  // so translation and original stay linked; point ids cannot collide (those paragraphs' own text is not Arabic-script).
  const col = FIELD === 'original' ? 'c.original_text' : 'c.text';
  const rel = RELIGION === 'bahai' ? " AND d.religion = 'Baha''i'" : RELIGION === 'other' ? " AND d.religion <> 'Baha''i'" : '';
  const claimsOf = "(SELECT json_group_array(cc.statement) FROM concept_claims cc WHERE cc.doc_id = c.doc_id AND cc.para_id = COALESCE(c.external_para_id, 'p' || c.id) AND cc.proof_ok = 1)";
  // TIER: documents are chosen in JS (the rule is not SQL), both scopes, read one document at a time like --docs. A non-Bahá'í document has
  // one tier; a Bahá'í document may mix writers (compilations), so it is a candidate for every tier and keep() tests each paragraph.
  const tierIds = TIER_ON ? src.prepare(`SELECT d.id, d.religion, d.collection, d.title, d.author FROM docs d WHERE d.deleted_at IS NULL AND ${INDEXABLE_DOC_SQL}${rel} ORDER BY d.id`).all()
    .filter((d) => /^bah/i.test(String(d.religion || '')) || doctrinalTier(d) === TIER).map((d) => d.id) : null;
  const list = DOCS.length ? DOCS : tierIds;
  const where = list ? 'd.id = ?' : FIELD === 'concepts' && !DOCS.length ? 'd.id IN (SELECT DISTINCT doc_id FROM concept_claims)'
    : SCOPE === 'library' ? `d.scope = 'primary'${rel}` : SCOPE === 'supplemental' ? `d.scope = 'supplemental'${rel}` : "d.religion = 'Baha''i'";
  // PAGED by content.id, each page its own short read: ONE .iterate() over the whole scope held a single read transaction
  // for the entire build (12–27 h), so the WAL could never be checkpointed — it grew to 12 GB, and the worker restarted the
  // API every 15 min trying to free it (the 2026-10-03 "restart storm"). Never stream a long build through one statement.
  const page = src.prepare(`SELECT c.id, c.doc_id, ${col} AS text, ${FIELD === 'original' ? 'COALESCE(c.original_lang, d.language)' : 'd.language'} AS language,
      c.authors, d.author, d.title, d.religion, d.collection, d.scope${FIELD === 'hype' ? ', c.hyp_questions, c.hyp_thesis' : ''}${FIELD === 'concepts' ? `, ${claimsOf} AS claims` : ''} FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE ${where} AND d.deleted_at IS NULL AND ${INDEXABLE_DOC_SQL} AND c.deleted_at IS NULL AND COALESCE(c.is_duplicate, 0) = 0 AND LENGTH(${col}) > 0
      ${FIELD === 'hype' ? "AND (COALESCE(c.hyp_questions, '') <> '' OR COALESCE(c.hyp_thesis, '') <> '')" : ''}
      AND c.id > ? ORDER BY c.id LIMIT 5000`);
  // An explicit --docs list is read ONE DOCUMENT AT A TIME on the doc_id index (10-14): as `d.id IN (<thousands>) …
  // c.id > ? ORDER BY c.id` SQLite walked the whole content table in id order for every 5,000-row page — job 91 read 47 GB
  // in 6 h and wrote nothing after its first hour.
  const perDoc = list ? page : null;
  const rows = { *iterate() {
    if (perDoc) {
      for (const id of list) for (let last = 0; ;) { const got = perDoc.all(id, last); if (!got.length) break; yield* got; last = got[got.length - 1].id; }
      return;
    }
    for (let last = 0; ;) { const got = page.all(last); if (!got.length) return; yield* got; last = got[got.length - 1].id; }
  } };
  return { src, rows };
}

// scraped sites: skip markup-only lines and recurring page chrome (api/lib/site-boilerplate.js); library never filtered
let BP = null;
// why a paragraph is left out of this run: 'tier' (another tier's run takes it), 'site' (scraped-site markup or page chrome —
// never indexed, by design), 'script' (another script's run); null = index it
const skipWhy = (text, p = null) => {
  // tier runs span both scopes: site-scraped paragraphs (scope 'supplemental') still get the boilerplate filter
  if (TIER_ON && p) { if (doctrinalTier(p, { author: paragraphAuthor(p) }) !== TIER) return 'tier'; if (p.scope === 'supplemental') { BP ??= boilerplateTexts(new Database(DB, { readonly: true, fileMustExist: true })); if (!keepSiteParagraph(text, BP)) return 'site'; } }
  if (SCOPE === 'supplemental') {
    BP ??= boilerplateTexts(new Database(DB, { readonly: true, fileMustExist: true }));
    if (!keepSiteParagraph(text, BP)) return 'site';
  }
  if (SCOPE === 'originals' && !DOCS.length && !TIER_ON) return arabicShare(text) >= 0.5 ? null : 'script';
  if (SCRIPT === 'arabic') return arabicShare(text) >= 0.5 ? null : 'script';
  if (SCRIPT === 'other') return arabicShare(text) < 0.5 ? null : 'script';
  return null;
};
const keep = (text, p = null) => !skipWhy(text, p);

const haveUnit = store.prepare('SELECT seg_v, key, start, "end", upserted FROM units WHERE point_id = ?');
const restamp = store.prepare('UPDATE units SET seg_v = ? WHERE point_id = ?');
const putUnit = store.prepare(`INSERT INTO units (point_id, paragraph_id, doc_id, k, start, "end", seg_v, key, fa_share, religion, author, lang_label, field, lang_group, collection, scope, upserted)
  VALUES (@pointId, @pid, @doc, @k, @start, @end, @segV, @key, @fa, @religion, @author, @lang, @field, @group, @collection, @scope, 0)
  ON CONFLICT(point_id) DO UPDATE SET start=@start, "end"=@end, seg_v=@segV, key=@key, fa_share=@fa, religion=@religion, author=@author,
    lang_label=@lang, field=@field, lang_group=@group, collection=@collection, scope=@scope, upserted=0`);
const haveVec = store.prepare('SELECT 1 FROM vec WHERE key = ?');
const putVec = store.prepare('INSERT OR IGNORE INTO vec (key, model, dims, v, at) VALUES (?, ?, ?, ?, ?)');
const tx = store.transaction((list) => { for (const u of list) putUnit.run(u); });
const putSkip = store.prepare('INSERT OR REPLACE INTO skipped (paragraph_id, doc_id, author, reason, at) VALUES (?, ?, ?, ?, ?)');
const unskip = store.prepare('DELETE FROM skipped WHERE paragraph_id = ?');
const saveSkips = store.transaction((list) => { for (const r of list) putSkip.run(...r); });

// The units of one paragraph: its phrases, (--field hype) its HyPE questions + thesis, or (--field concepts) its claims.
const HYPE_SEG = 'hype-v1';
function unitsFor(p, seg) {
  if (FIELD === 'concepts') {
    let claims = []; try { claims = JSON.parse(p.claims || '[]').filter(Boolean); } catch { /* none */ }
    return claims.slice(0, 998).map((text, k) => ({ pointId: p.id * 1000 + k, k, start: null, end: null, segV: 'concept-v1', embedText: text }));
  }
  if (FIELD !== 'hype') return unitsOf({ id: p.id, text: p.text, lang: seg });
  const qs = parseStoredHypQuestions(p.hyp_questions).slice(0, 998), thesis = String(p.hyp_thesis || '').trim();
  const u = (k, text) => ({ pointId: p.id * 1000 + k, k, start: null, end: null, segV: HYPE_SEG, embedText: text });
  return [...qs.map((q, k) => u(k, q)), ...(thesis ? [u(999, thesis)] : [])];
}

// Points a paragraph no longer has (re-hyped to fewer questions, claims re-extracted): hype/concepts units are numbered
// k = 0..n, so anything past the new set in the paragraph's id block is stale and must leave the store and the collection.
const unitsInBlock = store.prepare('SELECT point_id FROM units WHERE point_id BETWEEN ? AND ?');
const dropUnit = store.prepare('DELETE FROM units WHERE point_id = ?');
const stale = [];

// Paragraphs → units (stored) + texts still needing a vector. Returns the pending map for this chunk.
function unitize(paras) {
  const pending = new Map(), buf = [], relabel = [];
  for (const p of paras) {
    const { seg, group } = paragraphLang(p.text, p.language);
    const units = unitsFor(p, seg);
    let changed = 0;
    for (const u of units) {
      const key = vecKey(MODEL, DIMS, u.embedText), tl = performance.now(), old = haveUnit.get(u.pointId);
      T.lookup_ms += performance.now() - tl;
      const how = unitChange(old, u, key), same = how !== 'changed';
      if (how === 'restamp') relabel.push([u.segV, u.pointId]);
      if (!same) changed++;
      if (!same)
        buf.push({ ...u, pid: String(p.id), doc: String(p.doc_id), key, fa: faShare(u.embedText), religion: p.religion, author: paragraphAuthor(p),
          lang: p.language, field: FIELD, group, collection: p.collection || null, scope: p.scope || 'primary' });
      // An unchanged unit already UPSERTED had its vector (the upsert joins vec), so skip the lookup: vec's key index is
      // gigabytes on /tank's spinning disk and one random seek per unit held a re-run of already-indexed documents to a
      // crawl (10-14, job 92: 36 s CPU in 15 min, sdc 93% busy). A stored-but-never-upserted unit is still checked.
      if (!(same && old.upserted)) { const tv = performance.now(), have = haveVec.get(key); T.lookup_ms += performance.now() - tv; if (!have) pending.set(key, u.embedText); }
    }
    // Points the paragraph no longer has (re-segmented into fewer phrases, re-hyped to fewer questions, claims re-extracted)
    // leave the store and the collection. Phrase text checks only when one of its units changed; hype/concepts always did.
    if (FIELD === 'hype' || FIELD === 'concepts' || changed) {
      const keep = new Set(units.map((u) => u.pointId));
      for (const { point_id: id } of unitsInBlock.all(p.id * 1000, p.id * 1000 + 999)) if (!keep.has(id)) { dropUnit.run(id); stale.push(id); }
    }
  }
  if (FIELD === 'text') store.transaction(() => { for (const p of paras) unskip.run(p.id); })();
  tx(buf); if (relabel.length) store.transaction(() => relabel.forEach((r) => restamp.run(...r)))();
  return { pending, units: buf.length };
}

// Where the time goes (ms, summed over the run; embed is wall time of the concurrent API calls): logged on every chunk/done line
const T = { unitize_ms: 0, lookup_ms: 0, embed_ms: 0, qdrant_ms: 0, sqlite_ms: 0 };   // lookup_ms (vectors.db already-embedded checks) is INSIDE unitize_ms
const cpu0 = process.cpuUsage();
const timing = () => { const c = process.cpuUsage(cpu0); return { ...Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)])), cpu_ms: Math.round((c.user + c.system) / 1000) }; };
let stopped = null;
// onProgress(done, tokens): called after every embedded job, so a long chunk is never silent (11-09: a dense 20K-paragraph chunk
// embedded ~130K texts over ~35 min while the progress line still showed the previous chunk's numbers)
async function embedPending(pending, onProgress = null) {
  const entries = [...pending.entries()]; let next = 0, done = 0, toks = 0;
  async function worker() {
    while (next < entries.length && !stopped) {
      let take = BATCH; if (batcher) { let tk = 0; take = 0; while (take < JOB_REQS && next + take < entries.length && (tk += estTokens(entries[next + take][1])) < batcher.stats.cap_tokens / 4) take++; take = Math.max(1, take); }
      const chunk = entries.slice(next, next += take);
      const tokens = chunk.reduce((s, [, t]) => s + estTokens(t), 0), usd = tokens / 1e6 * PRICE;
      if (MAX_USD && spentRow().usd + usd > MAX_USD) { stopped = `budget ${BUDGET} would pass $${MAX_USD}`; break; }
      if (MONTHLY && monthSpent() + usd > MONTHLY) { stopped = `monthly cap: ${thisMonth()} would pass $${MONTHLY}`; break; }
      const vs = await waiting(`embed ${chunk.length} texts (~${tokens} tokens)`, embedBatch(chunk.map(([, t]) => t)));
      const usd2 = vs.mode === 'batch' ? usd * 0.5 : usd;   // batch = half price
      store.transaction(() => {
        chunk.forEach(([k], i) => putVec.run(k, MODEL, DIMS, packF16(vs[i]), Date.now()));
        addSpend.run({ b: BUDGET, t: tokens, u: usd2, at: Date.now() });
      })();
      addMonth.run(thisMonth(), BUDGET, tokens, usd2);
      // The shared ledger (ai_usage) is where all spend is read (analytics, Anís costs). gemini-spend.db stays as this
      // script's own monthly cap counter; until 10-10 it was the ONLY record, so $322 of vectors never showed (Chad 10-10).
      logAIUsage({ provider: 'google', model: MODEL, serviceType: 'embedding', promptTokens: tokens, batch: vs.mode === 'batch', caller: `phrase-index:${BUDGET}` });
      done += chunk.length; toks += tokens; onProgress?.(done, toks);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  return done;
}

// Retries socket errors: a keep-alive socket that sat idle (e.g. while SQLite sorts) is closed by Qdrant, and fetch
// reuses it anyway → 'other side closed' / EPIPE (same race as the writer keepAlive bug, 2026-08-13).
async function qd(method, path, body, base = QD) {
  const payload = body && JSON.stringify(body);
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'api-key': QK }, body: payload });
      if (!r.ok) throw Object.assign(new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`), { http: true });
      return r.json();
    } catch (e) {
      if (e.http || attempt >= 4) throw e;
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
}

async function ensureCollection({ url = UP.url, coll = UP.coll } = {}) {
  const exists = await qd('GET', `/collections/${coll}/exists`, undefined, url).then((r) => r.result.exists);
  if (!exists) {
    // the hot copy stores float16 (lossless: vectors.db holds f16) — half the RAM; same metric, quantization and indexes
    // hype keeps its full vectors in RAM (11-02, Chad: ~28 GB; the rescore read was the slow part of every search). phrases
    // (35M points, ~430 GB) cannot fit — on disk.
    const literal = { size: DIMS, distance: 'Cosine', on_disk: coll !== 'hype', ...(url === HOT ? { datatype: 'float16' } : {}) };
    await qd('PUT', `/collections/${coll}`, { vectors: { literal }, quantization_config: { binary: { always_ram: true } } }, url);
    log({ phase: 'collection-created', collection: coll, url });
  }
  for (const [field_name, field_schema] of [['paragraph_id', 'integer'], ['doc_id', 'integer'], ['lang_group', 'keyword'], ['religion', 'keyword'],
    ['author', 'keyword'], ['author_fold', 'keyword'], ['voices_fold', 'keyword'], ['site', 'keyword'], ['collection', 'keyword'], ['fa_share', 'float'], ['scope', 'keyword']])
    await qd('PUT', `/collections/${coll}/index?wait=true`, { field_name, field_schema }, url).catch(() => {});   // already there → fine
}

/** RAM disk free bytes (null when the path is absent — e.g. not on tower). */
const hotFree = () => { try { const f = statfsSync(HOT_PATH); return f.bavail * f.bsize; } catch { return null; } };
/** RAM disk bytes in use. */
const hotUsed = () => { try { const f = statfsSync(HOT_PATH); return (f.blocks - f.bfree) * f.bsize; } catch { return 0; } };
/** Room to keep free: at least --hot-min-free-gb, and at least what is stored — a snapshot's temp files live on the RAM
 *  disk too (Qdrant's snapshot restore cannot cross filesystems), so the data must never fill more than half of it. */
const hotNeedFree = (used, minFree) => Math.max(minFree, used);
/** The box's MemAvailable (tmpfs pages are RAM; null off Linux). */
const memAvail = () => { try { return parseMemAvailable(readFileSync('/proc/meminfo', 'utf8')); } catch { return null; } };

/** After a qdrant-hot loss: units marked as sent to hot (upserted = 2) but absent there either were FOLDED into main
 *  (qdrant-hot-fold deletes them from hot after verifying) — re-marked 1 — or were lost with the RAM disk (crash between
 *  flushes) — back to 0, so the next upsert re-sends them from the stored vectors (no Gemini spend). */
async function reconcileHot() {
  const page = store.prepare('SELECT point_id FROM units WHERE upserted = 2 AND point_id > ? ORDER BY point_id LIMIT 1000');
  const setMark = store.prepare('UPDATE units SET upserted = ? WHERE point_id = ?');
  let after = -1, checked = 0, missing = 0, folded = 0;
  const ids = async (url, coll, list) => new Set(((await qd('POST', `/collections/${coll}/points`, { ids: list, with_payload: false, with_vector: false }, url)).result || []).map((p) => Number(p.id)));
  for (;;) {
    const rows = page.all(after); if (!rows.length) break;
    after = rows[rows.length - 1].point_id;
    const inHot = await ids(HOT, HOT_COLL, rows.map((r) => r.point_id));
    const away = rows.filter((r) => !inHot.has(Number(r.point_id)));
    if (away.length) {
      const inMain = await ids(QD, COLL, away.map((r) => r.point_id));
      const fold = away.filter((r) => inMain.has(Number(r.point_id))), lost = away.filter((r) => !inMain.has(Number(r.point_id)));
      store.transaction(() => { fold.forEach((r) => setMark.run(1, r.point_id)); lost.forEach((r) => setMark.run(0, r.point_id)); })();
      folded += fold.length; missing += lost.length;
    }
    checked += rows.length;
  }
  log({ phase: 'reconcile-hot', checked, missing, folded });
  return { checked, missing, folded };
}

const page = store.prepare(`SELECT u.*, v.v FROM units u JOIN vec v ON v.key = u.key WHERE u.upserted = 0 LIMIT 256`);
const mark = store.prepare('UPDATE units SET upserted = ? WHERE point_id = ?');
// Units stored before their doc was retired as a duplicate or found to be a tag index page (or reset by --reconcile-hot)
// must not reach Qdrant: search excludes those docs, and their points were purged (11-04). The unit row is dropped — its
// vector stays in `vec`, so a doc restored later re-derives the unit at no spend. One short read of docs per run.
let withheld = null;
const withheldDocs = () => {
  if (withheld) return withheld;
  const src = new Database(DB, { readonly: true, fileMustExist: true });
  try { withheld = new Set(src.prepare(`SELECT d.id FROM docs d WHERE d.duplicate_of IS NOT NULL OR ${TAG_INDEX_SQL}`).all().map((r) => String(r.id))); }
  finally { src.close(); }
  return withheld;
};
async function upsert() {
  let sent = 0, pages = 0, dropped = 0;
  const skip = withheldDocs();
  while (stale.length) {
    const points = stale.splice(0, 1000);
    await qd('POST', `/collections/${COLL}/points/delete?wait=true`, { points });
    if (HOT) await qd('POST', `/collections/${HOT_COLL}/points/delete?wait=true`, { points }, HOT);
  }
  for (;;) {
    if (HOT && pages++ % 20 === 0) {
      // a snapshot in flight holds a temporary copy in <storage>/tmp: wait for it to finish, then measure (11-05)
      while (hotVerdict({ free: hotFree(), used: hotUsed(), tmp: dirBytes(join(HOT_PATH, 'storage', 'tmp')), minFree: HOT_MIN_FREE }) === 'snapshot') {
        note({ phase: 'waiting', reason: 'qdrant-hot snapshot in progress' });
        await new Promise((r) => setTimeout(r, 15_000));
      }
      const free = hotFree(), need = hotNeedFree(hotUsed(), HOT_MIN_FREE), mem = memAvail();
      // the ops job reads this reason (starts 'hot RAM disk'): it queues a fold and continues the run after — never a stall
      if (free != null && free < need) { stopped = `hot RAM disk ${HOT_PATH} has ${(free / 1e9).toFixed(1)} GB free (< ${(need / 1e9).toFixed(1)} GB: min ${HOT_MIN_FREE / 1e9} GB and room for a snapshot): fold into main before indexing more`; break; }
      if (free != null && mem != null && mem < HOT_MIN_FREE) { stopped = `hot RAM disk ${HOT_PATH}: the box has ${(mem / 1e9).toFixed(1)} GB MemAvailable (< ${HOT_MIN_FREE / 1e9} GB): fold into main before indexing more`; break; }
    }
    let t1 = Date.now();
    let rows = page.all(); if (!rows.length) break;
    const out = rows.filter((r) => skip.has(String(r.doc_id)));
    if (out.length) { store.transaction(() => out.forEach((r) => dropUnit.run(r.point_id)))(); dropped += out.length; rows = rows.filter((r) => !skip.has(String(r.doc_id))); }
    T.sqlite_ms += Date.now() - t1; t1 = Date.now();
    if (!rows.length) continue;
    await qd('PUT', `/collections/${UP.coll}/points?wait=true`, { points: rows.map((r) => ({ id: r.point_id, vector: { literal: unpackF16(r.v) },
      payload: { paragraph_id: Number(r.paragraph_id), doc_id: Number(r.doc_id), k: r.k, start: r.start, end: r.end, seg_v: r.seg_v,
        lang_group: r.lang_group || 'ar-fa', fa_share: r.fa_share, religion: r.religion, author: r.author, author_fold: authorKey(r.author), collection: r.collection,
        lang_label: r.lang_label, field: r.field || 'text', scope: r.scope || 'primary', ...(r.field === 'hype' ? { is_thesis: r.k === 999 } : {}) } })) }, UP.url);
    T.qdrant_ms += Date.now() - t1; t1 = Date.now();
    store.transaction(() => rows.forEach((r) => mark.run(UP.mark, r.point_id)))();
    T.sqlite_ms += Date.now() - t1;
    sent += rows.length;
  }
  if (dropped) note({ phase: 'withheld', units: dropped, reason: 'retired duplicate or tag index page' });
  return sent;
}

async function scanOnly() {
  const { src, rows } = source(); const seen = new Set(); let paras = 0, units = 0, tokens = 0;
  for (const p of rows.iterate()) {
    if (!keep(p.text, p)) continue;
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
  note({ phase: 'start', docs: DOCS.length ? DOCS : undefined, scope: DOCS.length ? undefined : SCOPE, tier: TIER_ON ? TIER : undefined, field: FIELD, embed_mode: EMBED_MODE, target: `${UP.url}/${UP.coll}` });
  if (has('qdrant')) await waiting(`qdrant collection ${UP.coll}`, ensureCollection());
  const { src, rows } = source(); const t0 = Date.now();
  let paras = 0, units = 0, embedded = 0, sent = 0, batch = [], embedTokens = 0, embedMs = 0, shownAt = 0;
  const flush = async () => {
    let t1 = Date.now();
    const r = unitize(batch); units += r.units; batch = []; T.unitize_ms += Date.now() - t1; t1 = Date.now();
    note({ phase: 'unitized', paragraphs: paras, units: r.units, to_embed: r.pending.size });
    // mid-chunk progress: the same 'chunk' line (the parent shows it in the activity feed) with live counts, at most once a minute;
    // embed_tokens_per_hour = tokens embedded / time spent embedding (Gemini's real throughput, re-reads excluded)
    const progress = (done, toks) => {
      if (Date.now() - shownAt < 60000) return; shownAt = Date.now();
      const ms = embedMs + (Date.now() - t1);
      log({ phase: 'chunk', paragraphs: paras, units, embedded: embedded + done, upserted: sent, spent: spentRow(), month_usd: +monthSpent().toFixed(2),
        paras_per_hour: Math.round(paras / ((Date.now() - t0) / 3.6e6)), in_chunk: `${done}/${r.pending.size}`,
        embed_tokens_per_hour: ms > 0 ? Math.round((embedTokens + toks) / (ms / 3.6e6)) : 0 });
    };
    if (has('embed')) { let toks = 0; embedded += await embedPending(r.pending, (d, t) => { toks = t; progress(d, t); }); embedTokens += toks; }
    T.embed_ms += Date.now() - t1; embedMs += Date.now() - t1;
    if (has('qdrant')) { note({ phase: 'upserting', embedded }); sent += await waiting(`qdrant upsert to ${UP.coll}`, upsert()); }
    log({ phase: 'chunk', paragraphs: paras, units, embedded, upserted: sent, spent: spentRow(), month_usd: +monthSpent().toFixed(2),
      paras_per_hour: Math.round(paras / ((Date.now() - t0) / 3.6e6)), timing: timing() });
  };
  let skips = [];
  for (const p of rows.iterate()) {
    const why = skipWhy(p.text, p);
    if (why) { if (why === 'site' && FIELD === 'text') { skips.push([p.id, p.doc_id, paragraphAuthor(p), why, Date.now()]); if (skips.length >= 5000) { saveSkips(skips); skips = []; } } continue; }
    batch.push(p); paras++;
    if (batch.length >= CHUNK) await flush();
    if (stopped || (LIMIT && paras >= LIMIT)) break;
  }
  if (batch.length && !stopped) await flush();
  if (skips.length) saveSkips(skips);
  src.close();
  log({ phase: stopped ? 'stopped' : 'done', reason: stopped, paragraphs: paras, units, embedded, upserted: sent, spent: spentRow(),
    minutes: +((Date.now() - t0) / 6e4).toFixed(1), timing: timing() });
}

if (has('scan-only')) await scanOnly();
else if (has('embed')) await build();
else if (has('qdrant')) {
  await ensureCollection();
  if (HOT && has('reconcile-hot')) await reconcileHot();
  const sent = await upsert();
  log({ phase: stopped ? 'stopped' : 'upsert-done', reason: stopped, sent });
}
store.close();
