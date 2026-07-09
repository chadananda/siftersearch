// Apply broad disambiguation decisions (per (paragraph, ambiguous-surface)).
//   refers=true  & not bound at para -> ADD binding (tag disambig-v1)   [recovers the right person]
//   refers=false & bound at para     -> REMOVE binding                  [drops the wrong twin]
//   all candidates refers=false      -> HOLD (don't strip the only binding; flagged)
// Reversible (adds tagged disambig-v1; removes recoverable from backup). DRY=1 previews.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
const { queryAll, graphQueryAll, graphQuery } = await import('../../api/lib/db.js');
const DOC = 21308, WRITE = process.env.WRITE === '1';
const decisions = JSON.parse(readFileSync('tmp/entity-research/seqread/broad-decisions.json', 'utf8'));
const cmap = new Map((await queryAll(`SELECT paragraph_index, id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [r.paragraph_index, String(r.id)]));
const bound = new Set((await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions')).map(r => r.entity_id + '|' + r.content_id));
let add = 0, rem = 0, errs = 0; const held = new Set();
for (const o of decisions) {
  if (o.error || !o.decisions) { errs++; continue; }
  const cid = cmap.get(o.para); if (!cid) continue;
  const anyTrue = o.decisions.some(d => d.refers === true);
  if (!anyTrue) { held.add(o.para); continue; }
  for (const d of o.decisions) {
    const key = d.id + '|' + cid, isBound = bound.has(key);
    if (d.refers === true && !isBound) { if (WRITE) await graphQuery("INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','disambig-v1')", [d.id, cid, 'subject', 0.9]); bound.add(key); add++; }
    else if (d.refers === false && isBound) { if (WRITE) await graphQuery('DELETE FROM entity_mentions WHERE entity_id=? AND content_id=?', [d.id, cid]); bound.delete(key); rem++; }
  }
}
console.log(`${WRITE ? 'APPLIED' : '[DRY]'} broad disambiguation: +${add} added (right person), -${rem} removed (wrong twin); ${errs} errors; ${held.size} all-ambiguous paras held`);
process.exit(0);
