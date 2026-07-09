// Reverse the one wrong merge: 1249513 ("Mullá Muḥammad-Ḥusayn (martyr of Míyámay)", the p808 SECOND
// Míyámay Muḥammad-Ḥusayn) was wrongly folded into 1249499 (the p794 FIRST one) — they are two distinct
// enumerated martyrs. Recreate 1249513 from backup values; re-split bindings so 1249499→p794 only,
// 1249513→p808 only; strip the cross-aliases. Writes route via SIFTER_WRITER_URL (worker :7849).
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, graphQuery } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const CN513 = 'Mullá Muḥammad-Ḥusayn (martyr of Míyámay)';
const CN499 = 'Mullá Muḥammad-Ḥusayn-i-Míyámay’í';
const SUM = "A Bábí martyr of the village of Míyámay named in The Dawn-Breakers' martyr-roster.";
const DESC = 'DB: Mullá Muḥammad-Ḥusayn (martyr of the village of Míyámay)';
console.log(WRITE ? 'APPLYING reversal' : '[DRY]');
if (WRITE) {
  // 1) recreate entity 1249513 (graph_entities + entity_research keyed by canonical)
  await query("INSERT INTO graph_entities (id, name, canonical_name, entity_type, religion, mention_count, doc_count, description, summary, importance) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [1249513, CN513, CN513, 'person', '', 1, 1, DESC, SUM, 8]);
  await query("INSERT INTO entity_research (canonical_name, entity_type, side, aliases, description, summary, importance, importance_reason, sources, confidence, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
    [CN513, 'person', 'Bábí', JSON.stringify(['Mullá Muḥammad-Ḥusayn (second martyr of Míyámay, idx 808)']), DESC, SUM, 8, 'One-mention martyr-list entry, no further detail.', 'Dawn-Breakers (gather)', 0.85, 'proposed']);
  // 2) re-split mentions: move row 15446 (p808) to 1249513; drop the duplicate 794 (14679) and other 808 (10580)
  await graphQuery('UPDATE entity_mentions SET entity_id=1249513 WHERE id=15446');
  await graphQuery('DELETE FROM entity_mentions WHERE id IN (14679, 10580)');
  // 3) clean 1249499 aliases (it had absorbed 1249513's canonical + "second martyr" labels) + fix counts
  await query("UPDATE entity_research SET aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [JSON.stringify(['Mullá Muḥammad-Ḥusayn']), CN499]);
  await query('UPDATE graph_entities SET mention_count=1 WHERE id=1249499');
}
console.log(WRITE ? 'DONE' : 'would: recreate 1249513, move p808→1249513, leave p794→1249499, strip cross-aliases');
process.exit(0);
