// Kinship VERIFICATION pass (Opus-on-subscription, hand-verified). DeepSeek systematically inverts parent/
// child relation direction and misremembers genealogies, so the authoritative kinship column is written ONLY
// from hand-verified data here. Sets research_notes.kinship_verified=true. Reversible (backup). Writes via :7849.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryOne } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
// hand-verified top-tier kinship (relation = the entity's <relation> is <who>)
const V = {
  1247562: [{ relation: 'father', who: 'Mírzá Buzurg-i-Núrí' }],
  1247563: [{ relation: 'father', who: "Bahá'u'lláh" }, { relation: 'grandson', who: 'Shoghi Effendi' }, { relation: 'sister', who: 'Bahíyyih Khánum' }],
  1248214: [{ relation: 'grandfather', who: "‘Abdu'l-Bahá" }],
  1247564: [{ relation: 'brother', who: 'Muḥammad-Ḥasan (Letter of the Living)' }],
  1247552: [{ relation: 'lineage', who: 'Siyyid (descendant of the Prophet Muḥammad)' }],
  1247554: [{ relation: 'father', who: 'Ḥájí Mullá Muḥammad-Ṣáliḥ-i-Baraghání' }, { relation: 'uncle', who: 'Ḥájí Mullá Muḥammad-Taqí-i-Baraghání' }, { relation: 'cousin', who: 'Mullá Muḥammad (son of Mullá Taqí)' }],
  1247711: [{ relation: 'father', who: "Bahá'u'lláh" }, { relation: 'brother', who: "‘Abdu'l-Bahá" }],
  1247566: [{ relation: 'father', who: 'Muḥammad Sháh Qájár' }, { relation: 'son', who: "Muẓaffari'd-Dín Sháh" }],
  1247602: [{ relation: 'brother', who: 'Siyyid Ḥasan' }],
  1247647: [{ relation: 'father', who: "‘Abdu'lláh" }, { relation: 'daughter', who: 'Fáṭimih' }],
  1247674: [{ relation: 'father', who: 'Amram (Imrán)' }, { relation: 'brother', who: 'Aaron' }, { relation: 'wife', who: 'Zipporah' }],
  1247826: [{ relation: 'husband', who: "Bahá'u'lláh" }, { relation: 'son', who: "‘Abdu'l-Bahá" }, { relation: 'daughter', who: 'Bahíyyih Khánum' }],
  1247553: [{ relation: 'father', who: 'Siyyid Ja‘far-i-Kashfí' }],
  1247683: [{ relation: 'son', who: 'Isaac' }, { relation: 'son', who: 'Ishmael' }, { relation: 'nephew', who: 'Lot' }],
  1247565: [{ relation: 'grandfather', who: 'Fatḥ-‘Alí Sháh' }, { relation: 'father', who: '‘Abbás Mírzá' }],
  1247744: [{ relation: 'brother', who: 'Sultan ‘Abdu’l-Majíd (Abdülmecid)' }],
  1247605: [{ relation: 'nephew-of-relation', who: 'uncle of Muḥammad Sháh (son of Fatḥ-‘Alí Sháh)' }],
  1247648: [{ relation: 'father', who: '‘Alí ibn Abí Ṭálib' }, { relation: 'grandfather', who: 'the Prophet Muḥammad' }],
  1249921: [{ relation: 'father', who: 'Mírzá Muḥammad-‘Alíy-i-Nahrí' }, { relation: 'husband', who: "‘Abdu'l-Bahá" }],
};
let n = 0;
for (const [id, kin] of Object.entries(V)) {
  const cn = (await queryOne('SELECT canonical_name FROM graph_entities WHERE id=?', [id]))?.canonical_name;
  if (!cn) { console.log(`  skip ${id} (gone)`); continue; }
  console.log(`  ${DRY ? 'would set' : 'SET'} ${id} "${cn}": ${kin.map(k => k.relation + '=' + k.who).join(', ')}`);
  if (DRY) { n++; continue; }
  const er = await queryOne("SELECT research_notes FROM entity_research WHERE canonical_name=? AND entity_type='person'", [cn]);
  let notes = {}; try { notes = JSON.parse(er?.research_notes || '{}'); } catch {}
  notes.kinship_verified = true;
  await query("UPDATE entity_research SET kinship=?, research_notes=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [JSON.stringify(kin), JSON.stringify(notes), cn]);
  n++;
}
console.log(`\n${DRY ? '[DRY] would verify' : 'VERIFIED'} ${n} kinship records`);
process.exit(0);
