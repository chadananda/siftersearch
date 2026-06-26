// Apply Phase-B cross-corpus research facts — but VALIDATE each first: the verbatim `extract` must be found in the
// corpus, which both proves the fact is real (no fabrication) and REPAIRS the citation to the true docId/paraId/ref
// (agents sometimes put a ref or footnote-anchor in paraId). Validated facts are added to the person's facts2 with
// source + period + a working oceanlibrary link; research_status is set. Run ON tower-nas. Env: IN=/home/chad/sifter/phaseb.json WRITE=1
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'node:fs';
const { query, queryAll, queryOne } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const IN = process.env.IN || '/home/chad/sifter/phaseb.json';
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const nz = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, "'").toLowerCase();

const research = JSON.parse(readFileSync(IN, 'utf8'));
const cnById = new Map((await queryAll(`SELECT id, canonical_name cn FROM graph_entities WHERE entity_type='person'`)).map((r) => [r.id, r.cn]));
const urlCache = new Map();
const docUrl = async (docId) => { if (urlCache.has(docId)) return urlCache.get(docId); const r = await queryOne('SELECT source_url u, title t FROM docs WHERE id=?', [docId]); const v = { u: r?.u || null, t: r?.t || '' }; urlCache.set(docId, v); return v; };

// validate a fact's extract → real {docId, paraId, pix, book}; prefer the agent's cited docId among matches
async function locate(ex, preferDoc) {
  const e = clean(ex); if (e.length < 14) return null;
  const slice = e.slice(e.length > 38 ? 8 : 0).slice(0, 56).replace(/[%_]/g, ' ').trim(); if (slice.length < 12) return null;
  // fast path: search WITHIN the cited doc (doc_id is indexed → scans one book, not 4M rows). Agents' docId is usually right.
  let rows = preferDoc ? await queryAll(`SELECT doc_id, external_para_id pid, paragraph_index pix FROM content WHERE doc_id=? AND text LIKE ? AND deleted_at IS NULL LIMIT 3`, [preferDoc, `%${slice}%`]) : [];
  if (!rows.length) rows = await queryAll(`SELECT doc_id, external_para_id pid, paragraph_index pix FROM content WHERE text LIKE ? AND deleted_at IS NULL LIMIT 5`, [`%${slice}%`]);   // fallback (rare): full scan
  if (!rows.length) return null;
  const row = rows.find((r) => r.doc_id === preferDoc) || rows[0];
  const { u, t } = await docUrl(row.doc_id);
  return { docId: row.doc_id, paraId: row.pid, ref: `${(t || '').slice(0, 30)} ¶${row.pix}`, url: u && row.pid ? `${u}?paraId=${row.pid}` : null, source: t };
}

let applied = 0, dropped = 0, touched = 0;
for (const r of research) {
  const cn = cnById.get(r.id); if (!cn) { continue; }
  const row = await queryOne('SELECT research_notes rn FROM entity_research WHERE canonical_name=?', [cn]); let n = {}; try { n = JSON.parse(row?.rn || '{}'); } catch {}
  const f2 = Array.isArray(n.facts2) ? n.facts2 : []; const have = new Set(f2.map((f) => nz(f.statement).slice(0, 60)));
  let added = 0;
  for (const f of (r.facts || [])) {
    const loc = await locate(f.extract, f.docId);
    if (!loc) { dropped++; continue; }                                   // unverifiable extract → drop (no fabrication)
    const key = nz(f.statement).slice(0, 60); if (have.has(key)) { continue; } have.add(key);
    f2.push({ relation: clean(f.relation || 'fact'), statement: clean(f.statement), extract: clean(f.extract), ref: loc.ref, docId: loc.docId, paraId: loc.paraId, url: loc.url, period: f.period || null, source: loc.source || f.source, tier: 'cross-corpus' });
    added++; applied++;
  }
  if (added) { n.facts2 = f2; n.research_status = 'cross-corpus-researched'; touched++; if (WRITE) await query('UPDATE entity_research SET research_notes=?, updated_at=CURRENT_TIMESTAMP WHERE canonical_name=?', [JSON.stringify(n), cn]); }
}
console.log(`${WRITE ? 'APPLIED' : 'DRY'} — ${applied} validated facts added to ${touched} persons · ${dropped} dropped (extract not found verbatim)`);
process.exit(0);
