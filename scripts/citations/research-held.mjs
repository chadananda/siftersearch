#!/usr/bin/env node
// Re-search held SE quotations on the phrase index (runs ON tower): each unresolved item's English quote → Gemini query
// vector → Qdrant `phrases` (Arabic-script text only: English books quoting the same English crowd out the originals; all traditions — SE quotes the Qur'an too), best phrase per paragraph. Lists candidates NOT already shown in the review
// (matches/others), with the matched phrase, for manual reading — never decides. Deps: api/lib/search/qdrant-layers.js.
//   node scripts/citations/research-held.mjs <held-review-data.json> <out.json> [--top 8]
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { searchPhrases } from '../../api/lib/search/qdrant-layers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true });
const [IN, OUT] = process.argv.slice(2);
const TOP = +(process.argv[process.argv.indexOf('--top') + 1] || 8) || 8;

const CALIBRATE = process.argv.includes('--calibrate');   // known full matches instead: where does the true source rank/score?
const items = JSON.parse(readFileSync(IN, 'utf8')).items
  .filter((i) => (CALIBRATE ? i.fit === 'full' : i.fit !== 'full' && (!i.suggest || i.suggest === 'stitched')));
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true });
const para = db.prepare(`SELECT c.id, c.doc_id, c.paragraph_index pidx, c.text, d.title, d.author, d.collection
  FROM content c JOIN docs d ON d.id = c.doc_id WHERE c.id = ?`);
const strip = (t) => String(t ?? '').replace(/⁅\/?s\d+⁆/g, '');

const out = [];
for (const it of items) {
  const seen = new Set([...(it.matches || []).map((m) => `c${m.content_id}`),
    ...[...(it.matches || []), ...(it.others || [])].map((m) => (m.url || '').match(/doc=(\d+)#p(\d+)/)).filter(Boolean).map((m) => `${m[1]}#${m[2]}`)]);
  let hits;
  // the build shares this Gemini key and keeps the per-minute quota near full → wait out 429s instead of skipping items
  for (let attempt = 0; ; attempt++) {
    try { hits = (await searchPhrases(it.quote, { limit: TOP, filters: { langGroup: 'ar-fa' } })).hits; break; }
    catch (e) {
      if (attempt < 8 && /gemini (429|5\d\d)/.test(e.message)) { await new Promise((r) => setTimeout(r, 15000)); continue; }
      out.push({ id: it.id, error: e.message }); hits = null; break;
    }
  }
  if (!hits) continue;
  const cands = hits.map((h) => {
    const p = para.get(h.paragraph_id); if (!p) return null;
    const text = strip(p.text);
    return { content_id: p.id, doc: p.doc_id, pidx: p.pidx, title: p.title, author: p.author, collection: p.collection, score: +h.score.toFixed(4),
      phrase: text.slice(h.span.start, h.span.end), window: text.slice(Math.max(0, h.span.start - 220), h.span.end + 220), shown: seen.has(`c${p.id}`) || seen.has(`${p.doc_id}#${p.pidx}`),
      url: `https://siftersearch.com/library/view?doc=${p.doc_id}#p${p.pidx}` };
  }).filter(Boolean);
  if (CALIBRATE) { const r = cands.findIndex((c) => c.shown); out.push({ id: it.id, rank: r, score: cands[r]?.score, top: cands[0]?.score }); continue; }
  out.push({ id: it.id, fit: it.fit, author: it.author, quote: it.quote, new: cands.filter((c) => !c.shown), shown: cands.filter((c) => c.shown).length });
  process.stdout.write('.');
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`\n${out.length} items; ${out.filter((o) => o.new?.length).length} with unseen candidates → ${OUT}`);
