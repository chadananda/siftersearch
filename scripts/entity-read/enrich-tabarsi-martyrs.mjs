// Ṭabarsí martyr-roster enrichment. Nabíl's "List of the martyrs" (Dawn-Breakers ¶774–976) is the authoritative
// roster of those who defended/perished at Fort Shaykh Ṭabarsí — one martyr per paragraph, each with a specific
// fate. Per-person death-enrichment missed the THIN figures (e.g. Mullá Jalíl-i-Urúmí had death=null), so "who
// died at Ṭabarsí" under-recalled. This reads the roster, resolves each martyr to an entity (namesake-safe), and
// records a cited "martyred-at-tabarsi" FACT + sets death.place — using Nabíl's SPECIFIC wording (better prose too).
// Run ON tower-nas with SIFTER_WRITER_URL. Env: WRITE=1 CONC=5 FROM=774 TO=976
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const ai = await import('../../api/lib/ai.js');
const { query, queryAll } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1', CONC = Number(process.env.CONC || 5);
const FROM = Number(process.env.FROM || 774), TO = Number(process.env.TO || 976);
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, '').toLowerCase().replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
const key = (s) => norm(s).replace(/^the /, '').trim();

// resolver: canonical match wins (dupes→importance-dominant); alias match only if unique; namesakes → skip
const people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases FROM graph_entities ge
  JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person' AND ge.religion=''`);
const canonIdx = new Map(), aliasIdx = new Map(), byId = new Map();
for (const p of people) {
  byId.set(p.id, p); const ck = key(p.cn); if (ck.length >= 3) { (canonIdx.get(ck) || canonIdx.set(ck, new Set()).get(ck)).add(p.id); }
  let al = []; try { al = JSON.parse(p.aliases || '[]'); } catch {}
  for (const a of al) { const k = key(a); if (k.length >= 3) (aliasIdx.get(k) || aliasIdx.set(k, new Set()).get(k)).add(p.id); }
}
const dom = (ids) => { const r = ids.map((id) => ({ id, imp: byId.get(id)?.imp || 0 })).sort((a, b) => b.imp - a.imp); return r[0].imp > 0 && r[0].imp > (r[1]?.imp || 0) ? r[0].id : null; };
const resolve = (name) => { const k = key(name); const cs = canonIdx.get(k); if (cs) { const ids = [...cs]; return ids.length === 1 ? ids[0] : dom(ids); } const as = aliasIdx.get(k); return as && as.size === 1 ? [...as][0] : null; };

const rows = (await queryAll(`SELECT external_para_id pid, paragraph_index pix, text, (SELECT source_url FROM docs WHERE id=21308) url FROM content
  WHERE doc_id=21308 AND heading LIKE '%List of the martyrs%' AND paragraph_index BETWEEN ? AND ? ORDER BY paragraph_index`, [FROM, TO]))
  .filter((r) => clean(r.text).length > 40);
console.error(`Ṭabarsí roster: ${rows.length} paragraphs${WRITE ? ' [WRITE]' : ' [dry]'}`);

const SYS = `This is ONE paragraph from Nabíl's roster of the martyrs who defended the fort of Shaykh Ṭabarsí. It usually names ONE martyr and states his distinction and how/where he died. Extract: {"name": the martyr's name EXACTLY as written, "detail": a short verbatim-grounded phrase describing his fate or distinction (e.g. "was slain on the way between Bárfurúsh and the fort", "suffered martyrdom in the fort", "a Letter of the Living noted for his learning"), "diedAtTabarsi": true unless the text explicitly says he did NOT reach or die at the fort}. If the paragraph is an introduction/aside naming no specific martyr, return {"name": null}.
Return ONLY JSON: {"name":"…"|null,"detail":"…","diedAtTabarsi":true|false}.`;

let resolved = 0, enriched = 0, unresolved = 0; const unres = [];
async function one(r) {
  const ct = clean(r.text);
  try {
    const res = await ai.chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: ct.slice(0, 900) }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 300, responseFormat: { type: 'json_object' } });
    const m = (res.content || '').match(/\{[\s\S]*\}/); const e = m ? JSON.parse(m[0]) : {};
    if (!e.name) return null;
    const id = resolve(e.name);
    if (!id) { unresolved++; unres.push(e.name); return null; }
    resolved++;
    const p = byId.get(id);
    const full = await queryAll(`SELECT research_notes rn FROM entity_research WHERE canonical_name=?`, [p.cn]);
    let notes = {}; try { notes = JSON.parse(full[0]?.rn || '{}'); } catch {}
    const url = r.url && r.pid ? `${r.url}?paraId=${r.pid}` : null;
    const detail = clean(e.detail || 'suffered martyrdom at Fort Shaykh Ṭabarsí');
    // a verbatim proof span = the sentence of the roster paragraph naming him
    const sent = ct.split(/(?<=[.!?])\s+/).find((s) => key(s).includes(key(e.name).split(' ').filter((w) => w.length > 3)[0] || '')) || ct.slice(0, 240);
    const f2 = Array.isArray(notes.facts2) ? notes.facts2 : [];
    if (!f2.some((f) => /tabars/i.test(f.relation || '') || /Ṭabarsí|Tabarsi/i.test(f.statement || ''))) {
      f2.unshift({ statement: clean(`${p.cn} ${detail}`), quote: clean(sent).slice(0, 300), relation: e.diedAtTabarsi === false ? 'martyr' : 'martyred-at-tabarsi', when: '1849', source: 'The Dawn-Breakers', paraId: r.pid, url });
      notes.facts2 = f2;
    }
    if (e.diedAtTabarsi !== false) { const d = notes.death || {}; if (!d.place || /upheaval/i.test(d.place) || !d.cause) notes.death = { cause: d.cause || detail, place: 'Fort Shaykh Ṭabarsí', year: d.year || 1849, martyr: true, source: 'The Dawn-Breakers', url }; }
    if (WRITE) { await query(`UPDATE entity_research SET research_notes=?, updated_at=CURRENT_TIMESTAMP WHERE canonical_name=?`, [JSON.stringify(notes), p.cn]); enriched++; }
    return `  ${id} ${p.cn} :: ${detail.slice(0, 60)}`;
  } catch (e) { return null; }
}
for (let i = 0; i < rows.length; i += CONC) { const out = await Promise.all(rows.slice(i, i + CONC).map(one)); for (const l of out) if (l) console.log(l); }
console.log(`\n${WRITE ? 'APPLIED' : 'DRY'} — resolved ${resolved} martyrs (${enriched} enriched), ${unresolved} unresolved`);
console.log('unresolved (likely unmodeled martyrs): ' + unres.slice(0, 30).join(' · '));
process.exit(0);
