// Cross-corpus passage search for Phase-B deep research: find where a person is discussed ACROSS THE WHOLE LIBRARY
// (not just GPB/DB), so we add cited facts from the higher-detail histories. Returns JSON passages w/ book + human
// ref + docId + paraId + text, ranked by source authority. Run: NAME="Vaḥíd" ALIASES="Siyyid Yaḥyá-i-Dárábí" node scripts/entity-read/search-corpus.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const NAME = process.env.NAME || ''; const ALIASES = (process.env.ALIASES || '').split('|').map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(process.env.LIMIT || 24);
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
// distinctive search terms = the longest words of the name/aliases (skip honorifics) — match across the corpus
const HON = new Set(['mirza', 'mulla', 'siyyid', 'sayyid', 'haji', 'shaykh', 'aqa', 'khan', 'the']);
const terms = [...new Set([NAME, ...ALIASES].flatMap((n) => n.split(/[\s-]+/)).map((w) => w.replace(/['‘’`ʻ]/g, '')).filter((w) => w.length >= 4 && !HON.has(w.toLowerCase())))].slice(0, 4);
if (!terms.length) { process.stdout.write('[]'); process.exit(0); }
const like = terms.map(() => 'c.text LIKE ?').join(' OR ');
const params = terms.map((t) => `%${t}%`);
const rows = await queryAll(`SELECT c.doc_id, c.external_para_id pid, c.paragraph_index pix, c.text, d.title book, COALESCE(d.doc_priority,0) prio
  FROM content c JOIN docs d ON d.id=c.doc_id
  WHERE (${like}) AND c.deleted_at IS NULL AND length(c.text)>120
  ORDER BY d.doc_priority DESC, c.doc_id, c.paragraph_index LIMIT 400`, params);
// keep passages that contain at least 2 of the distinctive terms (tighter than any-term), de-noise, cap per book
const ntext = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hits = rows.filter((r) => { const t = ntext(r.text); return terms.filter((w) => t.includes(ntext(w))).length >= Math.min(2, terms.length); });
const perBook = {}; const out = [];
for (const r of hits) { perBook[r.doc_id] = (perBook[r.doc_id] || 0) + 1; if (perBook[r.doc_id] > 6) continue; if (out.length >= LIMIT) break;
  out.push({ book: r.book, docId: r.doc_id, paraId: r.pid, ref: `${(r.book || '').slice(0, 28)} ¶${r.pix}`, text: clean(r.text).slice(0, 900) }); }
process.stdout.write(JSON.stringify(out));
process.exit(0);
