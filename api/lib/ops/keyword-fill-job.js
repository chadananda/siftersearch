// keyword-fill ops job: closes BM25 gaps from the coverage LEDGER, not an id watermark. The hourly keyword-catchup cron
// only sends paragraphs with ids above its checkpoint, so paragraphs that became live again (restored, re-scoped,
// un-duplicated) never got keyword points — 10-16: ~666K, mostly doctrinal core (Zoroastrian 330K, Islam 302K).
// Chad 10-16: BM25 is the first layer after paragraph ingestion (no external model). Per document: its paragraphs →
// bm25Doc (the one tokenizer, api/lib/keyword-tokens.js) → upsert (id = paragraph id; idempotent) → re-measure the
// ledger. Supplemental (scraped sites) leaves out page chrome — markup-only lines and texts repeated across ≥10 site
// documents (api/lib/site-boilerplate.js) — counted as unindexable; that scan runs as keyword-fill-sites in the heavy lane.
// params { ids?, limit? (documents), scope?, significant?, structured? }. No AI spend. The reports worker queues { significant: true }
// every 10 minutes while real gaps exist, so a newly ingested document has BM25 within minutes (Chad 10-16: BM25 first).
import { existsSync, readFileSync } from 'fs';
import { bm25DocWithContext } from '../keyword-tokens.js';
import { paragraphLang } from '../phrase-vectors.js';
import { paragraphAuthor, paragraphVoices } from '../authorship/effective.js';
import { authorKey } from '../search/qdrant-layers.js';
import { keywordGapDocs, keywordRowsForDoc, siteBoilerplateTexts, structuredDocs } from '../repos/keyword-repo.js';
import { keepSiteParagraph } from '../site-boilerplate.js';
import { measureDoc, saveCoverage, saveUnindexable } from '../repos/coverage-repo.js';
import { hypeVersion } from './coverage-job.js';
import { logActivity } from '../repos/activity-repo.js';

const QD = () => process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const BATCH = 500;
// the library's mean token count, fixed at the first full pass so BM25 weights stay comparable across runs
const AVG_LEN_FILE = '/tank/sifter/phrase-vectors/keyword-index.json';
export const avgLen = () => { try { return existsSync(AVG_LEN_FILE) ? JSON.parse(readFileSync(AVG_LEN_FILE, 'utf8')).avgLen : 74.2; } catch { return 74.2; } };

/** One paragraph row → its Qdrant point (null when it has no tokens). Same payload as scripts/phrase-index/keyword-index.mjs. */
export function keywordPoint(p, avg) {
  const v = bm25DocWithContext(p.text, p.section, avg);
  if (!v) return null;
  const author = paragraphAuthor(p);
  return { id: p.id, vector: { bm25: v }, payload: { paragraph_id: p.id, doc_id: p.doc_id, lang_group: paragraphLang(p.text, p.language).group,
    religion: p.religion, collection: p.collection, author, author_fold: authorKey(author), voices_fold: paragraphVoices(p).map(authorKey), scope: p.scope, ...(p.section ? { section: p.section } : {}) } };
}

async function upsert(points, fetchImpl = fetch) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetchImpl(`${QD()}/collections/paragraphs_kw/points?wait=true`, { method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.QDRANT_KEY || '' }, body: JSON.stringify({ points }), signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`qdrant upsert → ${r.status} ${(await r.text()).slice(0, 200)}`);
      return;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
    }
  }
}

export async function keywordFillJob({ ids = null, limit = 0, scope = 'primary', significant = false, structured = false } = {}, { fetchImpl = fetch } = {}) {
  // structured: re-send every document whose structure was found, so its points carry the section path
  if (structured) ids = await structuredDocs();
  const docs = ids?.length ? ids.map((id) => ({ id: Number(id) })) : await keywordGapDocs({ scope, significant });
  const avg = avgLen(), v = await hypeVersion();
  const chrome = scope === 'supplemental' ? await siteBoilerplateTexts() : null;
  const stats = { docs: 0, of: docs.length, points: 0, tokenless: 0, still_short: 0, short_samples: [] };
  let lastLog = Date.now();
  for (const d of limit ? docs.slice(0, limit) : docs) {
    const rows = await keywordRowsForDoc(d.id);
    let tokenless = 0, sample = null;
    const batches = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const pts = [];
      for (const p of rows.slice(i, i + BATCH)) {
        const pt = chrome && !keepSiteParagraph(p.text, chrome) ? null : keywordPoint(p, avg);
        if (pt) pts.push(pt); else { tokenless++; sample ??= String(p.text).slice(0, 60); }
      }
      batches.push(pts);
    }
    // already complete except for rows with no words: just record those — no re-send (spares the NVMe a rewrite)
    const complete = d.indexed != null && d.indexed + tokenless >= rows.length;
    if (complete) stats.recorded_only = (stats.recorded_only || 0) + 1;
    else for (const pts of batches) { if (pts.length) { await upsert(pts, fetchImpl); stats.points += pts.length; } }
    await saveUnindexable(d.id, 'keyword', tokenless);   // before measuring, so the ledger leaves them out
    const measured = await measureDoc(d.id, { hypeVersion: v });
    if (measured.length) await saveCoverage(d.id, measured);
    const kw = measured.find((r) => r.layer === 'keyword');
    if (kw && kw.indexed < kw.total) {   // punctuation-only paragraphs tokenise to nothing and have no point
      stats.still_short++;
      if (stats.short_samples.length < 8) stats.short_samples.push({ id: d.id, total: kw.total, rows: rows.length, tokenless, indexed: kw.indexed, sample });
    }
    stats.tokenless += tokenless; stats.docs++;
    if (Date.now() - lastLog > 60000) { lastLog = Date.now(); logActivity('index', `bm25 fill · ${stats.docs}/${stats.of} documents · +${stats.points.toLocaleString('en-US')} keyword points`); }
  }
  return stats;
}
