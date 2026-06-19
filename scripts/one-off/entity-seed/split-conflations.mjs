// One-off: split two conflated person entities, each blending a Yazd martyr (GPB, 1-day massacre)
// with a Mullá Ḥusayn kinsman of the same bare given name (Dawn-Breakers, 1844). The ORIGINAL entity
// is kept as the Yazd martyr (its graph_relations + summary already fit); the kinsman is PEELED into a
// new entity carrying its companion mentions. DRY=1 prints only. Run with SIFTER_WRITER_URL set so
// content-db writes route through the single writer.
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, graphQuery} = await import('../../../api/lib/db.js');
const {addAlias} = await import('../../../api/lib/graph-db.js');
const DRY = process.env.DRY === '1';

const SPLITS = [
  {
    origId: 1247875,
    bareName: 'Muḥammad-Báqir',
    yazd: {
      name: 'Muḥammad-Báqir-i-Yazdí', side: 'Bahá’í',
      summary: "One of the seven Bahá'ís martyred in a single day at Yazd — at the instigation of the city's mujtahid and by order of the governor Maḥmúd Mírzá, the Jalálu'd-Dawlih (a son of the Ẓillu's-Sulṭán) — slain near the Mihríz gate.",
    },
    kin: {
      name: 'Muḥammad-Báqir-i-Bushrú’í', side: 'Bábí', importance: 20,
      importance_reason: 'Early companion of Mullá Ḥusayn (his nephew); minor episode participant.',
      summary: "Nephew of Mullá Ḥusayn-i-Bushrú’í who, with Mullá Ḥusayn's brother Muḥammad-Ḥasan, accompanied him from their native Bushrúyih and from Karbilá through Búshihr to Shíráz — among the earliest to gather round him on the eve of the Báb's declaration (1844).",
      mentions: [10833, 10834, 10835],
    },
    deleteMentions: [8088], // stray: a passage about Mullá Ḥusayn himself, not Muḥammad-Báqir
  },
  {
    origId: 1247877,
    bareName: 'Muḥammad-Ḥasan',
    yazd: {
      name: 'Muḥammad-Ḥasan-i-Yazdí', side: 'Bahá’í',
      summary: "A young Bahá'í of Yazd in his early twenties, beheaded with his brother ‘Alí-Aṣghar in the single-day massacre of seven believers GPB records for that city; his body was grievously mutilated, his head impaled on a spear and stoned by the crowd.",
    },
    kin: {
      name: 'Muḥammad-Ḥasan-i-Bushrú’í', side: 'Bábí', importance: 20,
      importance_reason: 'Early companion of Mullá Ḥusayn (his brother); minor episode participant.',
      summary: "Brother of Mullá Ḥusayn-i-Bushrú’í who, with their nephew Muḥammad-Báqir, accompanied Mullá Ḥusayn from their native Bushrúyih and from Karbilá to Shíráz — among his earliest companions on the eve of the Báb's declaration (1844).",
      mentions: [10841, 10842, 10843, 10844],
    },
    deleteMentions: [],
  },
];

for (const s of SPLITS) {
  const orig = await queryOne("SELECT canonical_name FROM graph_entities WHERE id=?", [s.origId]);
  if (!orig) { console.log(`!! orig ${s.origId} not found — skipping`); continue; }
  const oldName = orig.canonical_name;
  console.log(`\n== split ${s.origId} (${oldName}) ==`);

  // 1) keep original AS the Yazd martyr — rename + fix summary/side; bare name becomes an alias
  console.log(`  keep ${s.origId} as Yazd martyr -> "${s.yazd.name}"`);
  if (!DRY) {
    await query("UPDATE graph_entities SET canonical_name=?, name=?, summary=? WHERE id=?", [s.yazd.name, s.yazd.name, s.yazd.summary, s.origId]);
    await query("UPDATE entity_research SET canonical_name=?, summary=?, side=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [s.yazd.name, s.yazd.summary, s.yazd.side, oldName]);
    await addAlias(s.origId, { surface: s.bareName, source: 'split' });
  }

  // 2) create the kinsman entity (routed INSERTs), then fetch its id
  let kinId = null;
  if (!DRY) {
    await query("INSERT OR IGNORE INTO graph_entities (canonical_name, name, entity_type, religion, summary, importance) VALUES (?,?,?,'',?,?)", [s.kin.name, s.kin.name, 'person', s.kin.summary, s.kin.importance]);
    kinId = (await queryOne("SELECT id FROM graph_entities WHERE canonical_name=? AND entity_type='person' AND religion=''", [s.kin.name]))?.id;
    await query("INSERT OR IGNORE INTO entity_research (canonical_name, entity_type, side, summary, importance, importance_reason, status, created_at, updated_at) VALUES (?,?,?,?,?,?, 'proposed', datetime('now'), datetime('now'))", [s.kin.name, 'person', s.kin.side, s.kin.summary, s.kin.importance, s.kin.importance_reason]);
    if (kinId) await addAlias(kinId, { surface: s.bareName, source: 'split' });
  }
  console.log(`  new kinsman "${s.kin.name}" (id ${kinId || 'DRY'}) <- mentions ${s.kin.mentions.join(',')}`);

  // 3) repoint the kinsman's companion mentions to the new entity
  if (!DRY && kinId && s.kin.mentions.length) {
    const ph = s.kin.mentions.map(() => '?').join(',');
    await graphQuery(`UPDATE entity_mentions SET entity_id=? WHERE id IN (${ph})`, [kinId, ...s.kin.mentions]);
  }

  // 4) delete stray mentions that belong to neither identity
  if (s.deleteMentions.length) {
    console.log(`  delete stray mentions ${s.deleteMentions.join(',')}`);
    if (!DRY) { const ph = s.deleteMentions.map(() => '?').join(','); await graphQuery(`DELETE FROM entity_mentions WHERE id IN (${ph})`, s.deleteMentions); }
  }
}
console.log(DRY ? '\n[DRY] done' : '\ndone');
process.exit(0);
