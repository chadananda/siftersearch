// throwaway debug: why doesn't the scan flag the known Muṣṭafá intruder under 1247617? Prints per-fact decisions.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai karbala mashhadi hajj the of son daughter dervish native an outstanding figure community known as one'.split(' '));
const sigToks = (s) => new Set(nrm(s).replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
const allToks = (s) => new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
const misSubject = (name, aliasArr, statement) => {
  const m = String(statement || '').match(/^\s*(.{2,60}?)\s+[-–—―−]\s+\S/);
  if (!m) return 'KEEP:no-dash';
  if (/^\s*(he|she|they|it|his|her|their|its|who|whom|this|that|these|those|in|on|at|when|after|before|during|next|owing|because)\b/i.test(m[1])) return 'KEEP:pronoun';
  const subj = sigToks(m[1]); if (!subj.size) return 'KEEP:empty';
  const mine = sigToks(name); for (const a of (aliasArr || [])) for (const t of sigToks(a)) mine.add(t);
  const whole = allToks(statement);
  for (const t of mine) if (subj.has(t) || whole.has(t)) return 'KEEP:named:' + t;
  return 'OFFENDER:' + m[1];
};
const rows = await queryAll(`SELECT ge.id, ge.canonical_name name, er.aliases, er.research_notes rn
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name WHERE ge.id=1247617`);
console.log('rows returned:', rows.length);
for (const r of rows) {
  let j; try { j = JSON.parse(r.rn); } catch { console.log('parse fail'); continue; }
  let aliasArr; try { aliasArr = JSON.parse(r.aliases || '[]'); } catch { aliasArr = []; }
  console.log('aliases:', JSON.stringify(aliasArr));
  const f2 = Array.isArray(j.facts2) ? j.facts2 : [];
  console.log('facts2 len:', f2.length);
  f2.forEach((f, i) => console.log(`  [${i}] ${misSubject(r.name, aliasArr, f.statement)}  ::  ${String(f.statement).slice(0, 70)}`));
}
process.exit(0);
