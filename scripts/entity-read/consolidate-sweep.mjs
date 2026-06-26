// Consolidate a person-sweep batch (from the person-sweep workflow): clean the descriptive canonical names, dedup,
// resolve namesake-safe against existing entities, classify enrich-vs-create, and (WRITE/CREATE) apply — building
// each new person with the self-contained citation schema (extract + ref + docId + paraId) and flagging for research.
// Run ON tower-nas. Env: IN=/home/chad/sifter/sweep-persons.json WRITE=1 CREATE=1
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'node:fs';
const { query, queryOne, queryAll, graphQuery } = await import('../../api/lib/db.js');
const IN = process.env.IN || '/home/chad/sifter/sweep-persons.json';
const WRITE = process.env.WRITE === '1', CREATE = process.env.CREATE === '1';
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const key = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, '').toLowerCase().replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');
// strip ALL trailing parentheticals + relational/appositive descriptors → the core canonical name. Critical: a swept
// name like "the Báb (Siyyid ‘Alí-Muḥammad)" or "Mullá Ṣádiq-i-Ḵhurásání (Muqaddas)" MUST reduce to its core so it
// resolves to the existing major entity instead of being created as a duplicate.
const core = (s) => clean(String(s || '')
  .replace(/\s*\([^)]*\)/g, '')                                                                 // drop any parenthetical
  .replace(/,\s*(?:son|brother|father|sister|wife|nephew|uncle|daughter|mother|the|one of|companion|imám|known|surnamed|originally|as a child|image)\b.*$/i, '')
).trim() || clean(s);
// reject pure descriptors / captions / unnamed figures — not real entity names
const isJunk = (cn) => { const k = key(cn); return k.length < 4 || /^(a |an |the )/.test(cn.toLowerCase()) || /\b(image caption|caption|executioner|treacherous|wife of|son of|brother of|daughter of|shaykh of considerable|one of the|unnamed|certain)\b/i.test(cn) || !/[a-z]/i.test(cn); };

const people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases FROM graph_entities ge
  JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person'`);
const canonIdx = new Map(), aliasIdx = new Map(), byId = new Map(), tokById = new Map();
const HONW = new Set(['mirza', 'mulla', 'siyyid', 'sayyid', 'haji', 'shaykh', 'aqa', 'khan', 'khanum', 'mir', 'the', 'son', 'of', 'and', 'karbilai', 'mashhadi', 'aqay']);
const fold = (s) => key(s).split(/[ -]/).map((w) => w.replace(/(ih|iy|i|y)$/, 'i')).filter((w) => w.length >= 4 && !HONW.has(w));
for (const p of people) {
  byId.set(p.id, p); const ck = key(p.cn); if (ck.length >= 3) (canonIdx.get(ck) || canonIdx.set(ck, new Set()).get(ck)).add(p.id);
  let al = []; try { al = JSON.parse(p.aliases || '[]'); } catch {}
  for (const a of al) { const k = key(a); if (k.length >= 4) (aliasIdx.get(k) || aliasIdx.set(k, new Set()).get(k)).add(p.id); }
  const t = new Set(); for (const nm of [p.cn, ...al]) for (const w of fold(nm)) t.add(w); tokById.set(p.id, t);
}
const dom = (ids) => { const r = ids.map((id) => ({ id, imp: byId.get(id)?.imp || 0 })).sort((a, b) => b.imp - a.imp); return r[0].imp > 0 && r[0].imp > (r[1]?.imp || 0) ? r[0].id : null; };
const resolve = (names) => {
  for (const nm of names) { const cs = canonIdx.get(key(nm)); if (cs) { const ids = [...cs]; return ids.length === 1 ? ids[0] : dom(ids); } }
  for (const nm of names) { const as = aliasIdx.get(key(nm)); if (as && as.size === 1) return [...as][0]; }
  for (const nm of names) { const rt = fold(nm); if (rt.length < 2) continue; const hits = [...tokById.entries()].filter(([, t]) => rt.every((w) => t.has(w))).map(([id]) => id); if (hits.length === 1) return hits[0]; }
  return null;
};

const raw = JSON.parse(readFileSync(IN, 'utf8'));
// re-dedup on the cleaned core name (merge records of the same person)
const merged = new Map();
for (const p of raw) {
  const cn = core(p.canonicalName); const k = key(cn); if (k.length < 4) continue;
  const m = merged.get(k) || { canon: cn, aliases: new Set(), kin: [], roles: new Set(), refs: [], origin: p.origin, fate: '', period: p.period, extract: p.extract, paraId: p.paraId, ref: p.ref };
  for (const a of [p.canonicalName, ...(p.aliases || [])]) if (core(a) !== cn) m.aliases.add(clean(a));
  for (const kk of (p.kin || [])) if (!m.kin.some((x) => x.who === kk.who && x.relation === kk.relation)) m.kin.push(kk);
  for (const r of (p.roles || [])) m.roles.add(clean(r));
  if (p.ref) m.refs.push({ ref: p.ref, paraId: p.paraId, extract: p.extract, fate: p.fate });
  if (!m.fate && p.fate) { m.fate = p.fate; m.extract = p.extract; m.ref = p.ref; m.paraId = p.paraId; }
  if (!m.origin && p.origin) m.origin = p.origin;
  merged.set(k, m);
}
let enrich = 0, create = 0; const toCreate = []; const gc = {};
let nextId = ((await queryOne('SELECT MAX(id) m FROM graph_entities'))?.m || 0) + 1;
const DOC = 21308, url = (pid) => pid ? `https://oceanlibrary.com/dawn-breakers_nabil?paraId=${pid}` : null;
for (const m of merged.values()) {
  if (isJunk(m.canon)) continue;
  const names = [m.canon, ...m.aliases];
  const id = resolve(names);
  const fate = clean(m.fate || ''); const martyr = /martyr|slain|killed|put to death|beheaded|fell|massacre|crown of/i.test(fate);
  // GROUP-MEMBERSHIP tags (cohorts) — named groups + event-cohorts; powers deterministic set queries
  const ctx = `${fate} ${[...m.roles].join(' ')} ${m.period || ''} ${(m.refs || []).map((r) => r.fate).join(' ')}`.toLowerCase();
  const groups = [];
  if (/letter of the living/i.test(ctx) || (m.roles && [...m.roles].some((r) => /letter of the living/i.test(r)))) groups.push('Letters of the Living');
  if (/seven martyrs/i.test(ctx)) groups.push('Seven Martyrs of Ṭihrán');
  if (/ṭabarsí|tabarsi|mázindarán|mazindaran/i.test(ctx)) { groups.push('Mázindarán Upheaval (Fort Ṭabarsí)'); groups.push(martyr ? 'Fort Ṭabarsí — martyr' : (/surviv|escaped|spared|to this day|resides/i.test(ctx) ? 'Fort Ṭabarsí — survivor' : 'Fort Ṭabarsí — defender')); }
  if (/nayríz|nayriz/i.test(ctx)) groups.push(martyr ? 'Nayríz Upheaval — martyr (1850)' : 'Nayríz Upheaval (1850)');
  if (/zanján|zanjan/i.test(ctx)) groups.push(martyr ? 'Zanján Upheaval — martyr' : 'Zanján Upheaval');
  const fact = { relation: martyr ? 'martyred' : 'mentioned', statement: clean(`${m.canon}${m.origin ? ' (of ' + m.origin + ')' : ''} — ${fate || [...m.roles].join('; ') || 'named in The Dawn-Breakers'}`), extract: clean(m.extract || ''), ref: m.ref, docId: DOC, paraId: m.paraId, period: m.period || null, source: 'The Dawn-Breakers' };
  for (const t of groups) gc[t] = (gc[t] || 0) + 1;
  if (id) { // enrich existing
    enrich++;
    if (WRITE) { const p = byId.get(id); let n = {}; try { n = JSON.parse((await queryOne('SELECT research_notes rn FROM entity_research WHERE canonical_name=?', [p.cn]))?.rn || '{}'); } catch {}
      const f2 = Array.isArray(n.facts2) ? n.facts2 : []; let ch = false;
      if (!f2.some((f) => f.paraId === m.paraId && f.relation === fact.relation)) { f2.push(fact); n.facts2 = f2; ch = true; }
      if (groups.length) { const g = new Set([...(n.groups || []), ...groups]); if (g.size !== (n.groups || []).length) { n.groups = [...g]; ch = true; } }
      if (ch) await query('UPDATE entity_research SET research_notes=?, updated_at=CURRENT_TIMESTAMP WHERE canonical_name=?', [JSON.stringify(n), p.cn]); }
  } else { // create
    create++; toCreate.push(`${m.canon}${m.origin ? ' /' + m.origin : ''}`);
    if (WRITE && CREATE) {
      if (await queryOne('SELECT id FROM graph_entities WHERE canonical_name=?', [m.canon])) continue;
      const eid = nextId++;
      const summary = clean(`${m.canon}${m.origin ? ', of ' + m.origin : ''}${m.roles.size ? ' — ' + [...m.roles].slice(0, 3).join('; ') : ''}. ${fate || ''} Named in The Dawn-Breakers (${m.ref}); pending cross-corpus research.`);
      const death = martyr ? { cause: fate || 'martyred', place: /tabarsi|ṭabarsí/i.test(fate) ? 'Fort Shaykh Ṭabarsí' : (m.origin || null), year: null, martyr: true, source: 'The Dawn-Breakers', url: url(m.paraId) } : null;
      const notes = JSON.stringify({ facts2: [{ ...fact, url: url(m.paraId) }], death, kinship: m.kin, groups, needs_corpus_research: true, created_from: 'person-sweep', roster_source: m.ref });
      await query('INSERT INTO graph_entities (id, name, canonical_name, entity_type, religion, mention_count, doc_count, description, summary, importance) VALUES (?,?,?,?,?,?,?,?,?,?)', [eid, m.canon, m.canon, 'person', '', 1, 1, summary, summary, 8]);
      await query("INSERT INTO entity_research (canonical_name, entity_type, side, summary, importance, importance_reason, aliases, kinship, research_notes, sources, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
        [m.canon, 'person', 'Bábí', summary, 8, `Named in The Dawn-Breakers (${m.ref}); minor figure pending cross-corpus research.`, JSON.stringify([...m.aliases]), JSON.stringify(m.kin), notes, `The Dawn-Breakers (${m.ref})`, 'proposed']);
      const cid = (await queryAll(`SELECT id FROM content WHERE doc_id=${DOC} AND external_para_id=? AND deleted_at IS NULL`, [m.paraId]))[0]?.id;
      if (cid) await graphQuery("INSERT OR IGNORE INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','sweep-v1')", [eid, String(cid), 'subject', 0.85]);
    }
  }
}
console.log(`${merged.size} distinct persons → ${enrich} enrich (existing), ${create} ${CREATE ? 'create' : 'WOULD create'}  ${WRITE ? '[APPLIED]' : '[dry]'}`);
console.log('group tags: ' + Object.entries(gc).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}=${n}`).join(' · '));
console.log('to CREATE (first 40): ' + toCreate.slice(0, 40).join(' · '));
process.exit(0);
