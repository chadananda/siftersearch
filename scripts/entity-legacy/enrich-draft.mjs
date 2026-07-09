// Research/enrichment drafter. For un-enriched DB-cast entities (empty/bare summary), pull the full dossier
// (all DB mentions) + Meili-discover the name across the WHOLE library, then DeepSeek drafts a FAITHFUL record
// strictly from that evidence: summary (who + role + martyrdom if any), side, importance (rubric),
// importance_reason, aliases, and a `notable` flag when cross-corpus adds real biography (=> Opus deep-review).
// Depth-calibrated: bare one-mention roster names get a light record. Read-only -> enrich-drafts.json.
// Env: LIMIT (n), MINMENTIONS (only >=), MODE=empty|bare (which gap). Order: mentions desc (significant first).
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const { getMeili, INDEXES } = await import('../../api/lib/search.js');
const meili = getMeili();
const DOC = 21308, LIMIT = +(process.env.LIMIT || 40), MIN = +(process.env.MINMENTIONS || 0);

const cids = new Set((await queryAll(`SELECT id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => String(r.id)));
const dbCount = new Map();
for (const m of await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions')) if (cids.has(String(m.content_id))) dbCount.set(m.entity_id, (dbCount.get(m.entity_id) || 0) + 1);
const ids = [...dbCount.keys()];
const rows = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.entity_type t, ge.description d, er.summary s, er.side, er.aliases a FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.id IN (${ids.join(',')}) AND er.entity_type='person'`);
// "bare" = empty, a DB: stub, very short, or an explicit roster/minimal-detail note — these are the records to
// upgrade by mining the rest of the library (the user's "find what we know about them in other books").
const isBare = s => { s = (s || '').trim(); return !s || /^DB:/.test(s) || s.length < 45 || /named only in|bare-name roster|no further biographical|minimal detail|named with minimal|named once|martyr-list entry|no further detail|named in a list/i.test(s); };
const gap = rows.filter(r => isBare(r.s)).filter(r => (dbCount.get(r.id) || 0) >= MIN)
  .sort((x, y) => (dbCount.get(y.id) || 0) - (dbCount.get(x.id) || 0)).slice(0, LIMIT);
console.error(`bare-record persons to enrich: ${gap.length} (MIN=${MIN})`);

const docTitle = new Map((await queryAll('SELECT id, substr(title,1,30) t FROM docs')).map(r => [r.id, r.t]));
const mById = new Map();
for (const m of await graphQueryAll(`SELECT entity_id, content_id FROM entity_mentions WHERE entity_id IN (${gap.map(g => g.id).join(',')})`)) { if (!mById.has(m.entity_id)) mById.set(m.entity_id, []); mById.get(m.entity_id).push(String(m.content_id)); }
const allCids = [...new Set([...mById.values()].flat())];
const ctext = new Map((allCids.length ? await queryAll(`SELECT id, doc_id, paragraph_index pi, substr(replace(text,char(10),' '),1,300) t FROM content WHERE id IN (${allCids.join(',')})`) : []).map(r => [String(r.id), r]));
async function discover(cn) {
  if (!meili) return [];
  const q = cn.replace(/\(.*?\)/g, '').replace(/martyr of.*/i, '').trim();
  try {
    const res = await meili.index(INDEXES.PARAGRAPHS).search(q, { limit: 6, attributesToRetrieve: ['id', 'doc_id'] });
    const hits = (res.hits || []).filter(h => h.doc_id !== DOC).slice(0, 4);
    if (!hits.length) return [];
    const rr = await queryAll(`SELECT doc_id, substr(replace(text,char(10),' '),1,240) t FROM content WHERE id IN (${hits.map(h => h.id).join(',')})`);
    return rr.map(r => `[${docTitle.get(r.doc_id) || r.doc_id}] ${r.t}`);
  } catch { return []; }
}
const SYS = `You write a FAITHFUL entity record for a Bábí/Bahá'í history figure, using ONLY the supplied DB mentions + cross-corpus passages. Do NOT add general knowledge or devotional embellishment; if little is known, say so plainly. RULES:
- summary: 2–4 sentences — who they were + their role/deeds AS THE EVIDENCE STATES. If they were martyred, state where/when/how if given. Separate what a source STATES from inference; never assert a flattering reading the text only implies. A one-mention bare roster name gets ONE sentence ("Named in The Dawn-Breakers' martyr list of <place>; no further detail in this source.").
- side: one of Bábí (Báb's dispensation), Bahá'í (Bahá'u'lláh's), opponent, other — by final allegiance.
- importance 1–100 (rubric: 90+ central figures; 70–89 Letters of the Living/foremost heroes/era-shaping; 45–69 taught figures/key antagonists; 20–44 named participants; 1–19 one-mention incidentals) + importance_reason (one line).
- aliases: distinct name forms seen in the evidence (no romanization noise).
- notable: true if the cross-corpus passages add real biography beyond the DB (kinship, dates, role-arc) — flags it for deeper human review.
Return ONLY JSON: {"summary":"...","side":"...","importance":N,"importance_reason":"...","aliases":[...],"notable":bool}.`;

const out = []; const CONC = 6;
for (let i = 0; i < gap.length; i += CONC) {
  const batch = await Promise.all(gap.slice(i, i + CONC).map(async g => {
    const ms = (mById.get(g.id) || []).map(c => ctext.get(c)).filter(Boolean).sort((a, b) => a.doc_id - b.doc_id || a.pi - b.pi);
    const dbm = ms.map(r => `[${docTitle.get(r.doc_id) || r.doc_id} ¶${r.pi}] ${r.t}`).join('\n');
    const corpus = await discover(g.cn);
    const prompt = `ENTITY: "${g.cn}" (current side: ${g.side || '?'}, ${dbCount.get(g.id)} DB mentions)\nCURRENT SUMMARY: ${g.s || '(none)'}\nDB MENTIONS:\n${dbm || '(none)'}\n\nCROSS-CORPUS (other books — verify the name truly matches THIS person before using):\n${corpus.join('\n') || '(none found)'}\n\nUpgrade the record ONLY with facts the evidence supports for THIS person; if the cross-corpus passages are a different same-named person or add nothing, keep the light record and set notable=false.`;
    try {
      const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: prompt }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 500, responseFormat: { type: 'json_object' } });
      const m = (res.content || '').match(/\{[\s\S]*\}/); const j = m ? JSON.parse(m[0]) : {};
      return { id: g.id, cn: g.cn, db: dbCount.get(g.id), corpusN: corpus.length, ...j };
    } catch (e) { return { id: g.id, cn: g.cn, error: String(e).slice(0, 80) }; }
  }));
  out.push(...batch); process.stderr.write(`  ${Math.min(i + CONC, gap.length)}/${gap.length}\n`);
}
writeFileSync('tmp/entity-research/seqread/enrich-drafts.json', JSON.stringify(out, null, 1));
console.log(`drafted ${out.length} | notable(cross-corpus adds biography): ${out.filter(o => o.notable).length}\n`);
for (const o of out) console.log(`[${o.id}] ${o.cn}  (imp ${o.importance ?? '?'}, side ${o.side || '?'}${o.notable ? ', NOTABLE' : ''}, corpus ${o.corpusN})\n   ${(o.summary || o.error || '').slice(0, 240)}`);
process.exit(0);
