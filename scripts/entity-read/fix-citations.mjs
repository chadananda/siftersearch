// Re-validate + repair the citation paraIds on ONE entity's research_notes. Each cited item (facts2 / episodes /
// characterizations) should link to the paragraph that ACTUALLY supports its statement — the enrichment sometimes
// tagged a window-start or nearby paragraph (e.g. GPB ¶152 = Ṭáhirih's passage attached to a Siyyid-Ḥusayn fact whose
// real text is ¶169). For each item we find the supporting paragraph in its cited doc — a verbatim quote/extract match
// first, else the best distinctive-token overlap with the statement — and only relocate when the new paragraph is
// CLEARLY better than the currently-cited one (so correct citations are never churned). Weak/uncertain → left as-is.
// Dry by default. Run ON tower-nas with SIFTER_WRITER_URL set. Env: ID=1247602 [WRITE=1]
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryAll, queryOne } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const ID = Number(process.env.ID || 0);

const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const nz = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, "'").toLowerCase();
const STOP = new Set('the of and who whom a an in at to is are were was his her him he she they them their with for on by from as that this which had has have been be will into not but or so all also it its been upon whose were'.split(' '));
const toks = (s) => [...new Set(nz(s).replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((t) => t.length > 3 && !STOP.has(t)))];

const paraCache = new Map();
const docParas = async (id) => { if (paraCache.has(id)) return paraCache.get(id); const r = await queryAll('SELECT external_para_id pid, paragraph_index pix, text FROM content WHERE doc_id=? AND deleted_at IS NULL', [id]); paraCache.set(id, r); return r; };
const docCache = new Map();
async function resolveDoc(source, docId) {
  if (docId) { const r = await queryOne('SELECT id, source_url u, title t FROM docs WHERE id=?', [docId]); if (r && r.u) return r; }
  if (!source) return null;
  if (docCache.has(source)) return docCache.get(source);
  let rows = await queryAll('SELECT id, source_url u, title t, (SELECT COUNT(*) FROM content c WHERE c.doc_id=docs.id AND c.deleted_at IS NULL) n FROM docs WHERE title=? AND source_url IS NOT NULL ORDER BY n DESC LIMIT 3', [source]);
  if (!rows.length) rows = await queryAll('SELECT id, source_url u, title t, (SELECT COUNT(*) FROM content c WHERE c.doc_id=docs.id AND c.deleted_at IS NULL) n FROM docs WHERE title LIKE ? AND source_url IS NOT NULL ORDER BY n DESC LIMIT 3', [`%${source.slice(0, 22)}%`]);
  const r = rows[0] || null; docCache.set(source, r); return r;
}
const fracIn = (text, qt) => { if (!qt.length) return 0; const t = nz(text); let s = 0; for (const w of qt) if (t.includes(w)) s++; return s / qt.length; };
const HON = new Set('siyyid sayyid mirza mulla mullá haji hájí shaykh aqa áqá khan khán hájar'.split(' '));
let NAME_TOKS = [];   // distinctive name tokens of the entity — a relocation target must actually mention the person
const isFootnote = (pid) => /^(fn_|h\d)/i.test(String(pid));

// returns {pid,pix,how,score,snip,curFrac,nameHit} or null
async function locate(doc, item) {
  const rows = await docParas(doc.id); if (!rows.length) return null;
  const cur = item.paraId || null;
  const qt = toks(item.statement || item.quote || '');
  const curRow = cur ? rows.find((r) => r.pid === cur) : null;
  const curFrac = curRow ? fracIn(curRow.text, qt) : 0;
  // 1. verbatim quote/extract — reliable enough to trust even a footnote target
  const verb = clean(item.quote || item.extract || '');
  if (verb.length >= 16) { const slice = nz(verb).slice(verb.length > 40 ? 6 : 0).slice(0, 56); const hit = rows.find((r) => nz(r.text).includes(slice)); if (hit) return { pid: hit.pid, pix: hit.pix, how: 'verbatim', score: 1, snip: clean(hit.text).slice(0, 150), curFrac, nameHit: true }; }
  // 2. best distinctive-token overlap
  if (!qt.length) return null;
  let best = null; for (const r of rows) { const f = fracIn(r.text, qt); if (!best || f > best.score) best = { pid: r.pid, pix: r.pix, score: f, snip: clean(r.text).slice(0, 150) }; }
  if (!best) return null;
  const bestRow = rows.find((r) => r.pid === best.pid); const bt = nz(bestRow.text);
  const nameHit = NAME_TOKS.length ? NAME_TOKS.some((nt) => bt.includes(nt)) : true;
  return { ...best, how: 'overlap', curFrac, nameHit };
}

const row = await queryOne('SELECT ge.canonical_name cn, er.research_notes rn FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.id=?', [ID]);
if (!row) { console.log('entity not found:', ID); process.exit(1); }
let notes = {}; try { notes = JSON.parse(row.rn || '{}'); } catch {}
NAME_TOKS = toks(row.cn).filter((t) => !HON.has(t));
console.log(`Entity ${ID} = ${row.cn}  (name tokens: ${NAME_TOKS.join(', ')})\n`);

let fixed = 0, ok = 0, weak = 0, nodoc = 0;
async function pass(list, label) {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (!item || (!item.statement && !item.quote)) continue;
    const doc = await resolveDoc(item.source, item.docId);
    if (!doc) { nodoc++; console.log(`[${label}] NO-DOC  src="${item.source}"  ${clean(item.statement).slice(0, 70)}`); continue; }
    const loc = await locate(doc, item); const cur = item.paraId || null;
    if (!loc) { console.log(`[${label}] NOLOCATE ${doc.t}  ${clean(item.statement).slice(0, 70)}`); continue; }
    // relocate only when clearly better: verbatim hit elsewhere, OR strong overlap that (a) beats current by a clear
    // margin, (b) actually mentions the person, (c) isn't a footnote (those need verbatim to trust). Guards against the
    // coincidental-token false match (e.g. a 3-token statement matching an unrelated footnote about executions).
    const better = loc.pid !== cur && (loc.how === 'verbatim'
      || (loc.score >= 0.6 && loc.nameHit && !isFootnote(loc.pid) && loc.score >= loc.curFrac + 0.2));
    if (loc.pid === cur) { ok++; console.log(`[${label}] OK   ${cur} (${loc.how} ${loc.score.toFixed(2)}) ${doc.t} ¶${loc.pix}`); continue; }
    if (!better) { weak++; console.log(`[${label}] KEEP ${cur || '-'} (cur ${loc.curFrac.toFixed(2)} vs best ${loc.pid} ${loc.score.toFixed(2)}) — not clearly better; left as-is`); console.log(`        stmt: ${clean(item.statement).slice(0, 90)}`); continue; }
    fixed++;
    console.log(`[${label}] FIX  ${cur || '-'} => ${loc.pid} (${loc.how} ${loc.score.toFixed(2)}, cur ${loc.curFrac.toFixed(2)}) ${doc.t} ¶${loc.pix}`);
    console.log(`        stmt: ${clean(item.statement).slice(0, 90)}`);
    console.log(`        new : ${loc.snip}`);
    item.paraId = loc.pid; item.url = doc.u ? `${doc.u}?paraId=${loc.pid}` : null; item.ref = `${(doc.t || '').slice(0, 30)} ¶${loc.pix}`;
  }
}
await pass(notes.facts2, 'facts2');
await pass(notes.episodes, 'episode');
await pass(notes.characterizations, 'charz');
console.log(`\n${WRITE ? 'WRITE' : 'DRY'} — ${fixed} relocated, ${ok} already-correct, ${weak} kept (not clearly better), ${nodoc} no-doc`);
if (WRITE && fixed) { await query('UPDATE entity_research SET research_notes=?, updated_at=CURRENT_TIMESTAMP WHERE canonical_name=?', [JSON.stringify(notes), row.cn]); console.log('research_notes written.'); }
process.exit(0);
