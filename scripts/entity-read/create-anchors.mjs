// Create verified missing ANCHOR entities surfaced by the disambiguation-prior cards (relatives the seed
// lacked). Hand-verified only. Each: graph_entities + entity_research (with verified kinship + sourced note);
// bind a DB mention where one exists. Reversible (backup). DRY=1 previews. Writes via :7849.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryOne, queryAll, graphQuery } = await import('../../api/lib/db.js');
const DOC = 21308, DRY = process.env.DRY === '1';
const ANCHORS = [
  {
    canon: 'Mírzá Ibráhím-i-Nahrí', side: 'Bábí', importance: 45, bindPara: 422,
    summary: "A merchant of Iṣfahán, brother of Mírzá Muḥammad-‘Alíy-i-Nahrí and Mírzá Hádíy-i-Nahrí, and father of the two celebrated martyrs Sulṭánu’sh-Shuhadá (King of Martyrs) and Maḥbúbu’sh-Shuhadá (Beloved of Martyrs). He invited the Báb to his home in Iṣfahán (Dawn-Breakers ¶422).",
    kinship: [{ relation: 'brother', who: 'Mírzá Muḥammad-‘Alíy-i-Nahrí' }, { relation: 'brother', who: 'Mírzá Hádíy-i-Nahrí' }, { relation: 'father', who: "Sulṭánu'sh-Shuhadá (Mírzá Muḥammad-Ḥasan)" }, { relation: 'father', who: "Maḥbúbu'sh-Shuhadá (Mírzá Muḥammad-Ḥusayn)" }, { relation: 'father', who: 'Ḥájí Siyyid Mihdíy-i-Nahrí' }],
    reason: 'Father of the Twin Shining Lights; named in DB ¶422; surfaced as missing anchor by the Nahrí cards.',
  },
  {
    canon: 'Ḥájí Siyyid Mihdíy-i-Nahrí', side: 'other', importance: 25, bindPara: null,
    summary: "Patriarch of the Bábí Nahrí family of Iṣfahán; father of Mírzá Muḥammad-‘Alí, Mírzá Hádí and Mírzá Ibráhím-i-Nahrí. Per Bahá’u’lláh’s King of Glory account, his other (non-believing) sons opposed the brothers and seized the major share of their inheritance.",
    kinship: [{ relation: 'son', who: 'Mírzá Muḥammad-‘Alíy-i-Nahrí' }, { relation: 'son', who: 'Mírzá Hádíy-i-Nahrí' }, { relation: 'son', who: 'Mírzá Ibráhím-i-Nahrí' }],
    reason: 'Nahrí patriarch named in cross-corpus (Bahá’u’lláh — The King of Glory); referenced by 3 verified kinship records.',
  },
];
let nextId = (await queryOne('SELECT MAX(id) m FROM graph_entities')).m + 1;
for (const a of ANCHORS) {
  const exists = await queryOne('SELECT id FROM graph_entities WHERE canonical_name=?', [a.canon]);
  if (exists) { console.log(`  (exists ${exists.id}) ${a.canon}`); continue; }
  const id = nextId++;
  const notes = JSON.stringify({ created_as_anchor: true, reason: a.reason, kinship_verified: true });
  console.log(`  ${DRY ? 'would CREATE' : 'CREATE'} ${id} "${a.canon}" (imp ${a.importance})${a.bindPara ? ' + bind ¶' + a.bindPara : ''}`);
  if (DRY) continue;
  await query('INSERT INTO graph_entities (id, name, canonical_name, entity_type, religion, mention_count, doc_count, description, summary, importance) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, a.canon, a.canon, 'person', '', a.bindPara ? 1 : 0, a.bindPara ? 1 : 0, a.summary, a.summary, a.importance]);
  await query("INSERT INTO entity_research (canonical_name, entity_type, side, summary, importance, importance_reason, kinship, research_notes, sources, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
    [a.canon, 'person', a.side, a.summary, a.importance, a.reason, JSON.stringify(a.kinship), notes, 'disambiguation-prior anchor', 'proposed']);
  if (a.bindPara) {
    const cid = (await queryAll(`SELECT id FROM content WHERE doc_id=${DOC} AND paragraph_index=${a.bindPara} AND deleted_at IS NULL`))[0]?.id;
    if (cid) await graphQuery("INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','anchor-v1')", [id, String(cid), 'subject', 0.9]);
  }
}
console.log(DRY ? '\n[DRY]' : '\nDONE');
process.exit(0);
