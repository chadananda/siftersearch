// READ-ONLY scope scan for the "cross-filed roster fact" defect: a facts2 entry in the "<Subject> — description"
// roster form whose SUBJECT is a DIFFERENT named person than the entity it's filed under (e.g. the fact
// "Muṣṭafá — dervish converted by Bahá'u'lláh" mis-filed under Mírzá Qurbán-‘Alí). These leak into bio-search
// evidence and get elaborated into fabricated narratives. This script finds every such fact so we can size the
// reversible quarantine pass. No writes. Run ON tower-nas: node scripts/entity-read/scan-misbound-facts.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync, existsSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai karbala mashhadi hajj the of son daughter dervish native an outstanding figure community known as one'.split(' '));
const sigToks = (s) => new Set(nrm(s).replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
const allToks = (s) => new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
// returns the offending subject string if the fact is a cross-filed roster fact, else null (mirrors bio.js factSubjectOk)
const misSubject = (name, aliasArr, statement) => {
  const m = String(statement || '').match(/^\s*(.{2,60}?)\s+[-–—―−]\s+\S/);
  if (!m) return null;
  if (/^\s*(he|she|they|it|his|her|their|its|who|whom|this|that|these|those|in|on|at|when|after|before|during|next|owing|because)\b/i.test(m[1])) return null;
  const subj = sigToks(m[1]); if (!subj.size) return null;
  const mine = sigToks(name); for (const a of (aliasArr || [])) { const at = sigToks(a); if (at.size >= 2) for (const t of at) mine.add(t); }   // canonical + MULTI-token aliases only
  const whole = allToks(statement);
  for (const t of mine) if (subj.has(t) || whole.has(t)) return null;   // subject or full statement names this person → fine
  // contamination fingerprint: does the (rejected) subject equal a BARE single-token alias of this entity?
  const bareAliases = new Set((aliasArr || []).map((a) => sigToks(a)).filter((s) => s.size === 1).flatMap((s) => [...s]));
  const viaAlias = [...subj].some((t) => bareAliases.has(t));
  return { subject: m[1].trim(), viaAlias };                             // a different named subject, entity absent
};

const rows = await queryAll(`SELECT ge.id, ge.canonical_name AS name, er.aliases, er.research_notes
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE ge.entity_type='person' AND (er.research_notes LIKE '%"facts2"%' OR er.research_notes LIKE '%"episodes"%')`);

const offenders = [];
let personsScanned = 0, factsScanned = 0, personsHit = 0;
for (const r of rows) {
  let rn; try { rn = JSON.parse(r.research_notes || '{}'); } catch { continue; }
  const f2 = Array.isArray(rn.facts2) ? rn.facts2 : [];
  const eps = Array.isArray(rn.episodes) ? rn.episodes : [];
  if (!f2.length && !eps.length) continue;
  personsScanned++; factsScanned += f2.length + eps.length;
  let aliasArr; try { aliasArr = JSON.parse(r.aliases || '[]'); } catch { aliasArr = []; }
  let hit = false;
  for (const [arr, kind] of [[f2, 'facts2'], [eps, 'episodes']]) {
    for (const f of arr) {
      const res = misSubject(r.name, aliasArr, f.statement);
      if (res) { offenders.push({ id: r.id, entity: r.name, arr: kind, subject: res.subject, viaAlias: res.viaAlias, statement: f.statement, relation: f.relation || f.name || null, source: f.source || null, paraId: f.paraId || null }); hit = true; }
    }
  }
  if (hit) personsHit++;
}

offenders.sort((a, b) => a.entity.localeCompare(b.entity));
console.log(`persons w/ facts2 scanned : ${personsScanned}`);
console.log(`facts2 statements scanned : ${factsScanned}`);
console.log(`cross-filed roster facts  : ${offenders.length}`);
console.log(`persons affected          : ${personsHit}`);
console.log(`  of which via a bad ALIAS : ${offenders.filter((o) => o.viaAlias).length}  (the subject IS a bare alias of the entity — contaminated identity)`);
console.log(`\n=== first 40 offenders (SUBJECT  ⟵ filed under ENTITY) ===`);
for (const o of offenders.slice(0, 40)) console.log(`  [${o.id}] (${o.arr})${o.viaAlias ? ' [ALIAS!]' : ''} ${o.subject}  ⟵  ${o.entity}   ${o.paraId || ''}\n      "${String(o.statement).slice(0, 100)}"`);

const dir = 'tmp/entity-research'; if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/misbound-facts.json`, JSON.stringify(offenders, null, 0));
console.log(`\nwrote ${dir}/misbound-facts.json (${offenders.length} offenders)`);
process.exit(0);
