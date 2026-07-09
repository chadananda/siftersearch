// Consolidate a person-sweep batch THROUGH the shared resolution layer (api/lib/person-resolution.js): dedup, then
// for each candidate resolve-or-create with alias-learning + split/merge detection. Resolution, alias-learning, and
// split/merge are NOT re-implemented here — this is just the ingestion that rides the master-data layer.
//   - resolved → enrich (facts + cohort tags) and PERSIST learned aliases (graph self-heals)
//   - ambiguous → HOLD (never create a probable duplicate)
//   - create → new entity (CREATE) with citation schema + cohort tags + needs_corpus_research
// Run ON tower-nas. Env: IN=/home/chad/sifter/sweep-persons.json WRITE=1 CREATE=1
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'node:fs';
const { query, queryOne, queryAll, graphQuery } = await import('../../api/lib/db.js');
const { buildIndex, resolve, coreName, nkey, learnAlias, mergeCandidates } = await import('../../api/lib/person-resolution.js');
const IN = process.env.IN || '/home/chad/sifter/sweep-persons.json';
const WRITE = process.env.WRITE === '1', CREATE = process.env.CREATE === '1';
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const isJunk = (cn) => { const k = nkey(cn); return k.length < 4 || /^(a |an |the )/.test(cn.toLowerCase()) || /\b(image caption|caption|executioner|treacherous|wife of|son of|brother of|daughter of|shaykh of considerable|one of the|unnamed|certain)\b/i.test(cn) || !/[a-z]/i.test(cn); };

const people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases, er.kinship FROM graph_entities ge
  JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person'`);
const idx = buildIndex(people);
const cnById = new Map(people.map((p) => [p.id, p.cn]));

const raw = JSON.parse(readFileSync(IN, 'utf8'));
const merged = new Map();
for (const p of raw) {
  const cn = coreName(p.canonicalName); const k = nkey(cn); if (k.length < 4) continue;
  const m = merged.get(k) || { canon: cn, aliases: new Set(), kin: [], roles: new Set(), refs: [], origin: p.origin, fate: '', period: p.period, extract: p.extract, paraId: p.paraId, ref: p.ref };
  for (const a of [p.canonicalName, ...(p.aliases || [])]) if (coreName(a) !== cn) m.aliases.add(clean(a));
  for (const kk of (p.kin || [])) if (!m.kin.some((x) => x.who === kk.who && x.relation === kk.relation)) m.kin.push(kk);
  for (const r of (p.roles || [])) m.roles.add(clean(r));
  if (p.ref) m.refs.push({ ref: p.ref, paraId: p.paraId, fate: p.fate });
  if (!m.fate && p.fate) { m.fate = p.fate; m.extract = p.extract; m.ref = p.ref; m.paraId = p.paraId; }
  if (!m.origin && p.origin) m.origin = p.origin;
  merged.set(k, m);
}

const DOC = 21308, url = (pid) => pid ? `https://oceanlibrary.com/dawn-breakers_nabil?paraId=${pid}` : null;
let enrich = 0, create = 0, ambiguous = 0, learned = 0; const toCreate = [], splits = [], ambigs = [], gc = {};
let nextId = ((await queryOne('SELECT MAX(id) m FROM graph_entities'))?.m || 0) + 1;

for (const m of merged.values()) {
  if (isJunk(m.canon)) continue;
  const names = [m.canon, ...m.aliases];
  const fate = clean(m.fate || ''); const martyr = /martyr|slain|killed|put to death|beheaded|fell|massacre|crown of/i.test(fate);
  const ctx = `${fate} ${[...m.roles].join(' ')} ${m.period || ''} ${(m.refs || []).map((r) => r.fate).join(' ')}`.toLowerCase();
  const groups = [];
  if (/letter of the living/i.test(ctx)) groups.push('Letters of the Living');
  if (/seven martyrs/i.test(ctx)) groups.push('Seven Martyrs of Ṭihrán');
  if (/ṭabarsí|tabarsi|mázindarán|mazindaran/i.test(ctx)) { groups.push('Mázindarán Upheaval (Fort Ṭabarsí)'); groups.push(martyr ? 'Fort Ṭabarsí — martyr' : (/surviv|escaped|spared|to this day|resides/i.test(ctx) ? 'Fort Ṭabarsí — survivor' : 'Fort Ṭabarsí — defender')); }
  if (/nayríz|nayriz/i.test(ctx)) groups.push(martyr ? 'Nayríz Upheaval — martyr (1850)' : 'Nayríz Upheaval (1850)');
  if (/zanján|zanjan/i.test(ctx)) groups.push(martyr ? 'Zanján Upheaval — martyr' : 'Zanján Upheaval');
  for (const t of groups) gc[t] = (gc[t] || 0) + 1;
  const fact = { relation: martyr ? 'martyred' : 'mentioned', statement: clean(`${m.canon}${m.origin ? ' (of ' + m.origin + ')' : ''} — ${fate || [...m.roles].join('; ') || 'named in The Dawn-Breakers'}`), extract: clean(m.extract || ''), ref: m.ref, docId: DOC, paraId: m.paraId, period: m.period || null, source: 'The Dawn-Breakers', url: url(m.paraId) };

  const r = resolve(idx, { names, origin: m.origin, kin: m.kin, era: m.period });
  if (r.action === 'ambiguous') { ambiguous++; ambigs.push(`${m.canon} → [${r.candidates.map((id) => cnById.get(id)).join(' | ')}]`); continue; }
  if (r.action === 'resolved') {
    enrich++;
    if (r.splitFlag) splits.push(`${cnById.get(r.id)} :: ${r.splitFlag} (from "${m.canon}")`);
    if (WRITE) {
      const cn = cnById.get(r.id); let n = {}, al = []; const row = await queryOne('SELECT research_notes rn, aliases al FROM entity_research WHERE canonical_name=?', [cn]);
      try { n = JSON.parse(row?.rn || '{}'); } catch {} try { al = JSON.parse(row?.al || '[]'); } catch {}
      const f2 = Array.isArray(n.facts2) ? n.facts2 : []; let ch = false;
      if (!f2.some((f) => f.paraId === m.paraId && f.relation === fact.relation)) { f2.push(fact); n.facts2 = f2; ch = true; }
      if (groups.length) { const g = new Set([...(n.groups || []), ...groups]); if (g.size !== (n.groups || []).length) { n.groups = [...g]; ch = true; } }
      for (const a of r.learnAliases) { if (!al.some((x) => nkey(x) === nkey(a))) { al.push(a); learnAlias(idx, r.id, a); learned++; ch = true; } }   // self-heal: persist new surface forms as aliases
      if (ch) await query('UPDATE entity_research SET aliases=?, research_notes=?, updated_at=CURRENT_TIMESTAMP WHERE canonical_name=?', [JSON.stringify(al), JSON.stringify(n), cn]);
    } else { for (const a of r.learnAliases) learnAlias(idx, r.id, a); }
    continue;
  }
  // create
  create++; toCreate.push(`${m.canon}${m.origin ? ' /' + m.origin : ''}`);
  if (WRITE && CREATE) {
    if (await queryOne('SELECT id FROM graph_entities WHERE canonical_name=?', [m.canon])) continue;
    const eid = nextId++;
    const summary = clean(`${m.canon}${m.origin ? ', of ' + m.origin : ''}${m.roles.size ? ' — ' + [...m.roles].slice(0, 3).join('; ') : ''}. ${fate || ''} Named in The Dawn-Breakers (${m.ref}); pending cross-corpus research.`);
    const death = martyr ? { cause: fate || 'martyred', place: /tabarsi|ṭabarsí/i.test(fate) ? 'Fort Shaykh Ṭabarsí' : (m.origin || null), year: null, martyr: true, source: 'The Dawn-Breakers', url: url(m.paraId) } : null;
    const notes = JSON.stringify({ facts2: [fact], death, kinship: m.kin, groups, needs_corpus_research: true, created_from: 'person-sweep', roster_source: m.ref });
    await query('INSERT INTO graph_entities (id, name, canonical_name, entity_type, religion, mention_count, doc_count, description, summary, importance) VALUES (?,?,?,?,?,?,?,?,?,?)', [eid, m.canon, m.canon, 'person', '', 1, 1, summary, summary, 8]);
    await query("INSERT INTO entity_research (canonical_name, entity_type, side, summary, importance, importance_reason, aliases, kinship, research_notes, sources, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
      [m.canon, 'person', 'Bábí', summary, 8, `Named in The Dawn-Breakers (${m.ref}); minor figure pending cross-corpus research.`, JSON.stringify([...m.aliases]), JSON.stringify(m.kin), notes, `The Dawn-Breakers (${m.ref})`, 'proposed']);
    const cid = (await queryAll(`SELECT id FROM content WHERE doc_id=${DOC} AND external_para_id=? AND deleted_at IS NULL`, [m.paraId]))[0]?.id;
    if (cid) await graphQuery("INSERT OR IGNORE INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','sweep-v1')", [eid, String(cid), 'subject', 0.85]);
  }
}
const mc = mergeCandidates(idx);
console.log(`${merged.size} distinct → ${enrich} enrich · ${create} ${CREATE ? 'create' : 'WOULD create'} · ${ambiguous} ambiguous(held) · ${learned} aliases learned  ${WRITE ? '[APPLIED]' : '[dry]'}`);
console.log('group tags: ' + Object.entries(gc).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}=${n}`).join(' · '));
if (splits.length) console.log(`\nSPLIT flags (${splits.length}): ` + splits.slice(0, 15).join('  |  '));
if (mc.length) console.log(`MERGE candidates (${mc.length}): ` + mc.slice(0, 10).map((p) => `${cnById.get(p.a)}≈${cnById.get(p.b)}`).join('  |  '));
if (ambigs.length) console.log(`\nAMBIGUOUS held (${ambigs.length}): ` + ambigs.slice(0, 12).join('  |  '));
console.log('\nto CREATE (first 40): ' + toCreate.slice(0, 40).join(' · '));
process.exit(0);
