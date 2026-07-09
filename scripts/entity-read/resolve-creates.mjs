// CREATE dup-guard — correct reconcile 'create' proposals before they touch the projection:
//  • GROUP descriptor ("the companions of…", "the sons of…") → kind='other-type' (not a person to create).
//  • EXACT existing person (same name after stripping parens/diacritics) → kind='link' to it (no duplicate entity).
//  • otherwise → genuinely missing person; leave as 'create'.
// Deterministic + safe: only converts to link on an EXACT name match (essentially certain same person). Reversible.
//   DRY:   node scripts/entity-read/resolve-creates.mjs
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 node scripts/entity-read/resolve-creates.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../../api/lib/db.js');
const { skeletonKeys } = await import('../../api/lib/translit-key.js');
const WRITE = process.env.WRITE === '1';
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const stripP = (s) => String(s || '').replace(/\([^)]*\)/g, '').replace(/,.*$/, '').trim();   // drop paren + descriptor tail
const GROUP_RE = /\b(companions|supporters|the sons|the heirs|the people|followers of|brothers of|and others|group of|band of|kindred|relatives of|inhabitants|disciples of)\b/i;

const creates = await queryAll(`SELECT id, payload, confidence FROM entity_decisions WHERE kind='create' AND target_kind='mention-cluster' AND status='proposed'`);
let toGroup = 0, toLink = 0, genuine = 0;
for (const d of creates) {
  let p = {}; try { p = JSON.parse(d.payload || '{}'); } catch { /* */ }
  const canon = p.canonical || p.resolved_as || '';
  if (GROUP_RE.test(p.resolved_as || '') || GROUP_RE.test(canon)) {
    toGroup++; console.log(`  GROUP  “${canon.slice(0, 50)}”`);
    if (WRITE) await query(`UPDATE entity_decisions SET kind='other-type', payload=? WHERE id=?`, [JSON.stringify({ ...p, type: 'group' }), d.id]);
    continue;
  }
  const keys = [...skeletonKeys(canon)];
  const cands = keys.length ? await queryAll(
    `SELECT ge.id, ge.canonical_name cn FROM entity_lookup_keys lk JOIN graph_entities ge ON ge.id=lk.entity_id
      WHERE lk.skeleton_key IN (${keys.map(() => '?').join(',')}) AND ge.entity_type='person' GROUP BY ge.id`, keys) : [];
  const target = cands.find((c) => nrm(stripP(c.cn)) === nrm(stripP(canon)) && nrm(stripP(canon)).length > 3);
  if (target) {
    toLink++; console.log(`  DUP→LINK  “${stripP(canon).slice(0, 40)}” → #${target.id} "${target.cn.slice(0, 40)}"`);
    if (WRITE) await query(`UPDATE entity_decisions SET kind='link', payload=? WHERE id=?`, [JSON.stringify({ ...p, verdict: 'link', entity_id: target.id }), d.id]);
  } else { genuine++; }
}
console.log(`\n${WRITE ? 'APPLIED' : 'DRY'} — ${creates.length} creates: ${toLink} → link (exact dup), ${toGroup} → other-type (group), ${genuine} genuine creates remain`);
process.exit(0);
