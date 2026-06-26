// ROSTER CAPTURE — every named person in a martyr/participant roster becomes an entity. Lists like Nabíl's
// "List of the martyrs" of Fort Ṭabarsí (Dawn-Breakers ¶774–976) name many minor figures who were never modeled.
// This reads a roster section, extracts each person with the fullest identifying form Nabíl gives (name, nisba/
// town, kin, fate), RESOLVES to an existing entity (namesake-safe) or CREATES one, records death = the event +
// a cited fact, and flags each for cross-corpus research (they may be documented elsewhere in the library).
// Reusable for other rosters via HEADING/FROM/TO/EVENT/YEAR. Run ON tower-nas with SIFTER_WRITER_URL.
//   Env: DOC=21308 HEADING='List of the martyrs' FROM=774 TO=976 EVENT='Fort Shaykh Ṭabarsí' YEAR=1849 CONC=6 WRITE=1 CREATE=1
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const ai = await import('../../api/lib/ai.js');
const { query, queryOne, queryAll, graphQuery } = await import('../../api/lib/db.js');
const DOC = Number(process.env.DOC || 21308), CONC = Number(process.env.CONC || 6);
const HEADING = process.env.HEADING || 'List of the martyrs';
const FROM = Number(process.env.FROM || 774), TO = Number(process.env.TO || 976);
const EVENT = process.env.EVENT || 'Fort Shaykh Ṭabarsí', YEAR = Number(process.env.YEAR || 1849);
const WRITE = process.env.WRITE === '1', CREATE = process.env.CREATE === '1';
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const key = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, '').toLowerCase().replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');

const people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases FROM graph_entities ge
  JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person'`);
const canonIdx = new Map(), aliasIdx = new Map(), byId = new Map();
for (const p of people) { byId.set(p.id, p); const ck = key(p.cn); if (ck.length >= 3) (canonIdx.get(ck) || canonIdx.set(ck, new Set()).get(ck)).add(p.id);
  let al = []; try { al = JSON.parse(p.aliases || '[]'); } catch {} for (const a of al) { const k = key(a); if (k.length >= 4) (aliasIdx.get(k) || aliasIdx.set(k, new Set()).get(k)).add(p.id); } }
const dom = (ids) => { const r = ids.map((id) => ({ id, imp: byId.get(id)?.imp || 0 })).sort((a, b) => b.imp - a.imp); return r[0].imp > 0 && r[0].imp > (r[1]?.imp || 0) ? r[0].id : null; };
const resolve = (names) => { for (const nm of names) { const k = key(nm); const cs = canonIdx.get(k); if (cs) { const ids = [...cs]; return ids.length === 1 ? ids[0] : dom(ids); } } for (const nm of names) { const as = aliasIdx.get(key(nm)); if (as && as.size === 1) return [...as][0]; } return null; };

const rows = (await queryAll(`SELECT external_para_id pid, paragraph_index pix, text, (SELECT source_url FROM docs WHERE id=?) url FROM content
  WHERE doc_id=? AND heading LIKE ? AND paragraph_index BETWEEN ? AND ? ORDER BY paragraph_index`, [DOC, DOC, '%' + HEADING + '%', FROM, TO])).filter((r) => clean(r.text).length > 40);
console.error(`roster '${HEADING}' ${EVENT}: ${rows.length} paragraphs${WRITE ? (CREATE ? ' [WRITE+CREATE]' : ' [WRITE enrich-only]') : ' [dry]'}`);

const SYS = `This is ONE paragraph from a roster of people connected to a single historic episode (a martyrdom/defence list). It usually describes ONE person: their name, where they were from, their kin, and their fate. Extract:
{"canonicalName": the fullest identifying name the text gives (INCLUDE the nisba/town if stated, e.g. "Muḥammad-Ḥusayn-i-Ardistání", "Mírzá Muḥammad-Báqir, nephew of Mullá Ḥusayn"), "aliases": [other names/forms given], "origin": town/region or null, "kin": [{"relation":"…","who":"…"}], "detail": a short verbatim-grounded phrase on their distinction/fate, "diedThere": true unless the text says they did NOT reach or die at the place, "letter": true if it says they were a Letter of the Living}.
If the paragraph names NO specific person (an intro, a section header like "From the town of X the following suffered martyrdom", or an aside), return {"canonicalName": null}.
Return ONLY JSON.`;

const items = [];
async function extract(r) {
  const ct = clean(r.text);
  try {
    const res = await ai.chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: ct.slice(0, 950) }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 400, responseFormat: { type: 'json_object' } });
    const m = (res.content || '').match(/\{[\s\S]*\}/); const e = m ? JSON.parse(m[0]) : {};
    if (!e.canonicalName) return;
    const names = [e.canonicalName, ...(Array.isArray(e.aliases) ? e.aliases : [])].map(clean).filter(Boolean);
    const sent = ct.split(/(?<=[.!?])\s+/).find((s) => key(s).includes((key(e.canonicalName).split(' ').filter((w) => w.length > 3)[0]) || '##')) || ct.slice(0, 260);
    items.push({ ...e, names, canonicalName: clean(e.canonicalName), origin: e.origin ? clean(e.origin) : null, detail: clean(e.detail || ''),
      kin: Array.isArray(e.kin) ? e.kin : [], pid: r.pid, pix: r.pix, url: r.url && r.pid ? `${r.url}?paraId=${r.pid}` : null, quote: clean(sent).slice(0, 300), id: resolve(names) });
  } catch {}
}
for (let i = 0; i < rows.length; i += CONC) await Promise.all(rows.slice(i, i + CONC).map(extract));

let enriched = 0, created = 0, skipped = 0;
let nextId = ((await queryOne('SELECT MAX(id) m FROM graph_entities'))?.m || 0) + 1;
for (const it of items) {
  const martyrFact = { statement: clean(`${it.canonicalName} ${it.detail || 'suffered martyrdom at ' + EVENT}`), quote: it.quote, relation: it.diedThere === false ? 'martyr' : 'martyred-at-tabarsi', when: String(YEAR), source: 'The Dawn-Breakers', paraId: it.pid, url: it.url };
  const death = it.diedThere === false ? null : { cause: it.detail || `martyred at ${EVENT}`, place: EVENT, year: YEAR, martyr: true, source: 'The Dawn-Breakers', url: it.url };
  if (it.id) {  // resolve → enrich existing
    const p = byId.get(it.id); let notes = {}; try { notes = JSON.parse((await queryOne('SELECT research_notes rn FROM entity_research WHERE canonical_name=?', [p.cn]))?.rn || '{}'); } catch {}
    const f2 = Array.isArray(notes.facts2) ? notes.facts2 : [];
    if (!f2.some((f) => /tabars/i.test(f.relation || '') || new RegExp(EVENT.split(' ').pop(), 'i').test(f.statement || ''))) { f2.unshift(martyrFact); notes.facts2 = f2; }
    if (death && (!notes.death?.place || /upheaval/i.test(notes.death.place))) notes.death = death;
    if (WRITE) { await query('UPDATE entity_research SET research_notes=?, updated_at=CURRENT_TIMESTAMP WHERE canonical_name=?', [JSON.stringify(notes), p.cn]); enriched++; }
    else { enriched++; }
  } else {  // unmodeled → create
    if (!CREATE) { skipped++; continue; }
    const canon = it.canonicalName;
    if (await queryOne('SELECT id FROM graph_entities WHERE canonical_name=?', [canon])) { skipped++; continue; }
    const id = nextId++;
    const summary = clean(`${canon}${it.origin ? ', of ' + it.origin : ''} — ${it.detail || 'a defender of ' + EVENT}. Named in Nabíl's roster of the martyrs of ${EVENT} (Dawn-Breakers ¶${it.pix}); not yet researched across the wider corpus.`);
    const notes = JSON.stringify({ death, facts2: [martyrFact], needs_corpus_research: true, roster_source: `Dawn-Breakers ¶${it.pix}`, created_from: 'tabarsi-roster' });
    if (WRITE) {
      await query('INSERT INTO graph_entities (id, name, canonical_name, entity_type, religion, mention_count, doc_count, description, summary, importance) VALUES (?,?,?,?,?,?,?,?,?,?)', [id, canon, canon, 'person', '', 1, 1, summary, summary, 8]);
      await query("INSERT INTO entity_research (canonical_name, entity_type, side, summary, importance, importance_reason, aliases, kinship, research_notes, sources, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
        [canon, 'person', 'Bábí', summary, 8, `Martyr of ${EVENT} named in Nabíl's roster (DB ¶${it.pix}); minor figure, pending cross-corpus research.`, JSON.stringify(it.names), JSON.stringify(it.kin), notes, `Dawn-Breakers ¶${it.pix} (martyr roster)`, 'proposed']);
      const cid = (await queryAll(`SELECT id FROM content WHERE doc_id=${DOC} AND paragraph_index=${it.pix} AND deleted_at IS NULL`))[0]?.id;
      if (cid) await graphQuery("INSERT OR IGNORE INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','roster-v1')", [id, String(cid), 'subject', 0.9]);
    }
    created++;
  }
}
console.log(`\n${WRITE ? 'APPLIED' : 'DRY'} — ${items.length} roster persons: ${enriched} enriched (existing), ${created} ${CREATE ? 'created' : 'WOULD create'}, ${skipped} skipped`);
console.log('to CREATE (sample): ' + items.filter((i) => !i.id).slice(0, 24).map((i) => i.canonicalName + (i.origin ? ' /' + i.origin : '')).join(' · '));
process.exit(0);
