// Apply the disambiguation engine's decisions. Policy:
//   - CLEAR WINNER (>=1 candidate refers=true at the paragraph): remove the refers=false candidates' bindings.
//   - ALL FALSE (engine pinned no candidate — name-only roster, or a rhetorical allusion): HOLD (don't mass-
//     unbind; could lose the only real binding). Listed for review.
// Reversible (backup taken). DRY=1 previews.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
const { queryAll, graphQueryAll, graphQuery } = await import('../../api/lib/db.js');
const DOC = 21308, WRITE = process.env.WRITE === '1';
const decisions = JSON.parse(readFileSync('tmp/entity-research/seqread/disambiguation-decisions.json', 'utf8'));
const cmap = new Map((await queryAll(`SELECT paragraph_index, id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [r.paragraph_index, String(r.id)]));
let removed = 0; const held = [];
for (const o of decisions) {
  if (o.error || !o.decisions) continue;
  const anyTrue = o.decisions.some(d => d.refers === true);
  if (!anyTrue) { held.push(o.para); continue; }
  const cid = cmap.get(o.para); if (!cid) continue;
  for (const d of o.decisions) {
    if (d.refers !== false) continue;
    const n = (await graphQueryAll('SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=? AND content_id=?', [d.id, cid]))[0].n;
    if (!n) continue;
    if (WRITE) await graphQuery('DELETE FROM entity_mentions WHERE entity_id=? AND content_id=?', [d.id, cid]);
    removed++;
  }
}
console.log(`${WRITE ? 'REMOVED' : '[DRY] would remove'} ${removed} wrong-twin bindings (clear-winner paragraphs)`);
console.log(`HELD ${held.length} all-false paragraphs for review (name-only rosters / allusions): [${held.sort((a, b) => a - b).join(',')}]`);
process.exit(0);
