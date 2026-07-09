// Region-0 (intro) shah corrector. The intro is a century-spanning preface (quoting Curzon) + Nabíl's Shaykh
// Aḥmad chapter — its "the Sháh" refs are NOT all Náṣiri'd-Dín. Resolved by reading:
//   ADD   p113/114/117 "the Sháh of Persia" (Shaykh Aḥmad's host; his son Muḥammad-‘Alí Mírzá, son of
//         Fatḥ-‘Alí) -> Fatḥ-‘Alí Sháh 1247687
//   UNBIND p26/47/48/49/50/51/54/56/57/64/81 — Curzon's generic monarchy-as-institution / dynasty -> not a
//         resolvable individual; remove from Náṣiri'd-Dín 1247566
//   KEEP  p29/33/41 on Náṣiri'd-Dín (the Báb's persecution / Bahá'u'lláh's epistle to the king)
// All seqread-v1, reversible. DRY by default; WRITE=1 applies.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll, graphTransaction } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const NASIRI = 1247566, FATHALI = 1247687;
const REMOVE = [26, 47, 48, 49, 50, 51, 54, 56, 57, 64, 81];
const ADD = [113, 114, 117];
const cmap = new Map((await queryAll('SELECT id,paragraph_index FROM content WHERE doc_id=21308 AND deleted_at IS NULL AND paragraph_index<=213')).map(r => [r.paragraph_index, String(r.id)]));
const boundNasiri = new Set((await graphQueryAll("SELECT content_id FROM entity_mentions WHERE entity_id=? AND extractor_version='seqread-v1'", [NASIRI])).map(r => String(r.content_id)));
const boundFathali = new Set((await graphQueryAll("SELECT content_id FROM entity_mentions WHERE entity_id=? AND extractor_version='seqread-v1'", [FATHALI])).map(r => String(r.content_id)));

const removes = REMOVE.filter(p => cmap.get(p) && boundNasiri.has(cmap.get(p)));
const skippedRemoves = REMOVE.filter(p => !(cmap.get(p) && boundNasiri.has(cmap.get(p))));
const adds = ADD.filter(p => cmap.get(p) && !boundFathali.has(cmap.get(p)));
console.log(`UNBIND Náṣiri'd-Dín (1247566) at: [${removes.join(',')}]` + (skippedRemoves.length ? `  (not currently bound, skipped: [${skippedRemoves.join(',')}])` : ''));
console.log(`ADD Fatḥ-‘Alí Sháh (1247687) at: [${adds.join(',')}]`);

if (WRITE) {
  const tx = [];
  for (const p of removes) tx.push({ sql: "DELETE FROM entity_mentions WHERE entity_id=? AND content_id=? AND extractor_version='seqread-v1'", args: [NASIRI, cmap.get(p)] });
  for (const p of adds) tx.push({ sql: "INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','seqread-v1')", args: [FATHALI, cmap.get(p), 'monarch', 0.9] });
  if (tx.length) { await graphTransaction(tx); console.log(`\nWROTE: ${removes.length} deletes + ${adds.length} inserts`); }
} else console.log('\n[DRY] nothing written — re-run with WRITE=1 to apply');
process.exit(0);
