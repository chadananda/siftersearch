// Finalize the martyr-list resolution: BIND the held roster lines to the existing seed martyr entities.
// No creates — the seed (built from a prior full pass of this same list) already holds every one of these
// martyrs; the held mention lines only needed binding. Sources of binds:
//   1. roster-dedup.json  — the context-verified binds (real surrounding-list context)
//   2. roster-decisions.json direct binds — kept EXCEPT the place-bug contaminated ones (HOLD)
//   3. RECOVER — three the dedup engine missed under huge same-core candidate lists, recovered by hand
// HOLD = entries left unresolved (contaminated or unmarked-section bare names) for later cross-corpus work.
// All binds land in graph.db via graphQuery (no sifter.db write → no SQLITE_BUSY). DRY=1 previews; WRITE=1 applies.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
const { queryAll, graphQuery, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308, WRITE = process.env.WRITE === '1';
const HOLD = new Set([801, 812, 906]);                         // 801: Letter-of-Living contamination; 812: dedup picked Sang-Sar but the line is in the Míyámay block (already bound to 1249517); 906: unmarked section, no twin
const RECOVER = { 799: 1249504, 811: 1249516, 956: 1249754 };  // engine missed these under 7/23/36-candidate lists (all already bound by earlier passes)
// the crashed prior run wrongly bound p801 to 1247595 (Mullá Báqir-i-Tabrízí, a Letter of the Living who
// SURVIVED Fort Ṭabarsí — cannot be in a martyr list). Reversibly remove it (re-add: entity 1247595).
const REMOVE = [{ para: 801, id: 1247595 }];
const resolve = JSON.parse(readFileSync('tmp/entity-research/seqread/roster-decisions.json', 'utf8'));
const dedup = JSON.parse(readFileSync('tmp/entity-research/seqread/roster-dedup.json', 'utf8'));
const binds = [
  ...resolve.filter(o => o.id).map(o => ({ para: o.para, id: o.id })),
  ...dedup.binds.map(b => ({ para: b.para, id: b.id })),
  ...Object.entries(RECOVER).map(([para, id]) => ({ para: +para, id })),
].filter(b => !HOLD.has(b.para));
const cmap = new Map((await queryAll(`SELECT paragraph_index, id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [r.paragraph_index, String(r.id)]));
const bound = new Set((await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions')).map(r => r.entity_id + '|' + r.content_id));

let added = 0, skipped = 0;
console.log(`binds proposed: ${binds.length} | holding: ${[...HOLD].join(', ')}`);
for (const b of binds) {
  const cid = cmap.get(b.para);
  if (!cid) { console.log(`  (no content id) p${b.para}`); continue; }
  if (bound.has(b.id + '|' + cid)) { skipped++; continue; }
  console.log(`  BIND p${b.para} -> ${b.id}`);
  if (WRITE) await graphQuery("INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','disambig-v1')", [b.id, cid, 'subject', 0.9]);
  added++;
}
let removed = 0;
for (const r of REMOVE) {
  const cid = cmap.get(r.para); if (!cid) continue;
  console.log(`  REMOVE p${r.para} -> ${r.id} (contamination)`);
  if (WRITE) await graphQuery("DELETE FROM entity_mentions WHERE content_id=? AND entity_id=? AND extractor_version='disambig-v1'", [cid, r.id]);
  removed++;
}
console.log(`\n${WRITE ? 'APPLIED' : '[DRY]'}: ${added} new binds, ${skipped} already bound, ${removed} removed`);
process.exit(0);
