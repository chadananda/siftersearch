// Diagnostic: dump given claim ids with their entity + a WIDE episode window (±8 before / ±3 after the cited
// paragraph), so we can read the actual coreference chain rather than the sweep's clipped ±3/±1 window.
//   node scripts/entity-read/inspect-claims.mjs 3686 3692 3693 3694 3696
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const ids = process.argv.slice(2).map((s) => +s).filter(Boolean);
if (!ids.length) { console.error('usage: inspect-claims.mjs <claim_id...>'); process.exit(1); }

const docParas = new Map(); const pidPos = new Map();
for (const doc of [21308, 21310]) { const ps = await queryAll(`SELECT external_para_id pid, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND external_para_id IS NOT NULL ORDER BY paragraph_index`, [doc]);
  const arr = ps.map((r) => ({ pid: r.pid, text: String(r.text).replace(/\s+/g, ' ').trim() })); docParas.set(doc, arr); arr.forEach((p, i) => pidPos.set(`${doc}|${p.pid}`, i)); }
const win = (doc, pid, before = 8, after = 3) => { const arr = docParas.get(doc); const pos = pidPos.get(`${doc}|${pid}`); if (pos == null) return '(para not found)';
  return arr.slice(Math.max(0, pos - before), pos + after + 1).map((p) => `${p.pid === pid ? '  »CITED[' + pid + ']« ' : '  [' + p.pid + '] '}${p.text}`).join('\n'); };

const claims = await queryAll(`SELECT ec.id, ec.entity_id, ge.canonical_name cn, ec.relation, ec.statement, ec.doc_id, ec.para_id, ec.status
  FROM entity_claims ec JOIN graph_entities ge ON ge.id=ec.entity_id WHERE ec.id IN (${ids.map(() => '?').join(',')}) ORDER BY ec.doc_id, ec.para_id`, ids);
for (const c of claims) {
  console.log(`\n${'='.repeat(90)}\nCLAIM ${c.id}  entity=${c.entity_id} "${c.cn}"  status=${c.status || 'supported'}\n  relation: ${c.relation}\n  statement: ${c.statement}\n  cited: ${c.doc_id === 21310 ? 'GPB' : 'DB'} ${c.para_id}\n${'-'.repeat(90)}`);
  console.log(win(c.doc_id, c.para_id));
}
console.log(`\n${'='.repeat(90)}\ndistinct entities in this set: ${[...new Set(claims.map((c) => c.entity_id + ':' + c.cn))].join(' | ')}`);
process.exit(0);
