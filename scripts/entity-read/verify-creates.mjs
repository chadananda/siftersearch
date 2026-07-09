// Verify reconcile CREATE proposals against the lookup index — a 'create' is genuine only if NO existing entity
// plausibly matches. Uses a BROADER transliteration-invariant lookup than reconcile did: the FULL canonical incl.
// the parenthetical alias (reconcile's coreName stripped it), maximizing recall to catch dups. Deterministic first
// pass (no AI): flags creates that have strong existing candidates → likely should be link, not create.
//   node scripts/entity-read/verify-creates.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const { skeletonKeys } = await import('../../api/lib/translit-key.js');

const creates = await queryAll(`SELECT id, payload, confidence FROM entity_decisions WHERE kind='create' AND target_kind='mention-cluster' AND status='proposed'`);
const parsed = creates.map((d) => { let p = {}; try { p = JSON.parse(d.payload || '{}'); } catch { /* */ } return { id: d.id, p }; });
let genuine = 0, dup = 0;
const rows = [];
for (const d of parsed) {
  const name = d.p.canonical || d.p.resolved_as || '';
  const keys = [...skeletonKeys(name)];                       // full name incl. paren alias → max recall
  let cand = [];
  if (keys.length) cand = await queryAll(
    `SELECT ge.canonical_name cn, ge.importance imp, COUNT(DISTINCT lk.skeleton_key) shared
       FROM entity_lookup_keys lk JOIN graph_entities ge ON ge.id=lk.entity_id
      WHERE lk.skeleton_key IN (${keys.map(() => '?').join(',')}) AND ge.entity_type='person'
      GROUP BY lk.entity_id ORDER BY shared DESC, (ge.importance IS NULL), ge.importance DESC LIMIT 3`, keys);
  const strong = cand.filter((x) => x.shared >= 2 || (x.imp || 0) >= 30);
  if (strong.length) { dup++; rows.push({ name: name.slice(0, 46), freq: d.p.freq, cand: strong.map((x) => `${x.cn}(${x.shared}k/i${x.imp ?? '?'})`).join(', ') }); }
  else genuine++;
}
console.log(`\n=== CREATE verification: ${parsed.length} proposals ===`);
console.log(`  ${genuine} GENUINE (no existing candidate) · ${dup} with existing candidate (likely DUP → link)\n`);
console.log('--- possible DUPS (create proposals that DO have an existing entity) ---');
rows.sort((a, b) => (b.freq || 0) - (a.freq || 0)).forEach((r) => console.log(`  ${r.freq}×  “${r.name}”  ↔  ${r.cand}`));
process.exit(0);
