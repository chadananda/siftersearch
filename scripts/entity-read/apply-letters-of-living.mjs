// Model the First Váḥid: link the eighteen Letters of the Living to their group entity (1247655) via
// reversible member relations, raise their importance to a station floor (their station outranks their
// often-scant story), and ensure each summary leads with that station. Reversible: relations carry
// relation_type='letter-of-the-living' (DELETE by that); a pre-change backup of the 18 entity_research +
// graph_entities rows is written to tmp/ before any write. Run ON tower-nas with SIFTER_WRITER_URL set.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';
const { query, queryOne, queryAll } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const GROUP = 1247655;                    // "the Letters of the Living (Ḥurúf-i-Ḥayy)" group entity
const FLOOR = 70;                         // station floor — a Letter of the Living is foundational
// the canonical eighteen, in order (id → note). Verified against the DB by name.
const LETTERS = [
  1247564, // 1  Mullá Ḥusayn-i-Bushrú'í (first to believe)
  1250147, // 2  Muḥammad-Ḥasan-i-Bushrú'í (his brother)
  1250146, // 3  Muḥammad-Báqir-i-Bushrú'í (his nephew)
  1247577, // 4  Mullá ‘Alíy-i-Basṭámí
  1249577, // 5  Mullá Khudá-Bakhsh-i-Qúchání (Mullá ‘Alí)
  1249578, // 6  Mullá Ḥasan-i-Bajistání
  1247602, // 7  Siyyid Ḥusayn-i-Yazdí
  1249579, // 8  Mírzá Muḥammad Rawḍih-Khán-i-Yazdí
  1249237, // 9  Shaykh Sa‘íd-i-Hindí
  1249581, // 10 Mullá Maḥmúd-i-Khu'í
  1249582, // 11 Mullá Jalíl-i-Urúmí
  1249583, // 12 Mullá Aḥmad-i-Ibdál-i-Marághi'í
  1247595, // 13 Mullá Báqir-i-Tabrízí
  1249345, // 14 Mullá Yúsuf-i-Ardibílí
  1249584, // 15 Mírzá Hádí, son of Mullá ‘Abdu'l-Vahháb-i-Qazvíní
  1249574, // 16 Mírzá Muḥammad-‘Alíy-i-Qazvíní
  1247554, // 17 Ṭáhirih (the only woman)
  1247552, // 18 Quddús (the last)
];
const STATION = 'One of the eighteen Letters of the Living (Ḥurúf-i-Ḥayy) — the first souls to recognize the Báb, who together with Him form the First Váḥid (Unity) of His Dispensation.';

const rows = await queryAll(`SELECT ge.id, ge.canonical_name AS name, ge.importance, er.summary
  FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE ge.id IN (${LETTERS.join(',')})`);
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
const missing = LETTERS.filter((id) => !byId[id]);
if (missing.length) { console.error('MISSING ids:', missing); process.exit(1); }

// backup before any write
mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/letters-of-living-backup.json', JSON.stringify(rows, null, 1));
console.log(`backup written for ${rows.length} entities → tmp/letters-of-living-backup.json`);

let relAdded = 0, impRaised = 0, sumLed = 0;
for (const id of LETTERS) {
  const r = byId[id];
  const newImp = Math.max(r.importance || 0, FLOOR);
  const hasStation = /letters? of the living/i.test(r.summary || '');
  const newSummary = hasStation ? r.summary : `${STATION}${r.summary ? ' ' + r.summary : ''}`;
  console.log(`  ${id} ${r.name}  imp ${r.importance}→${newImp}${hasStation ? '' : '  +station-lead'}`);
  if (!WRITE) continue;
  // member relation (reversible: relation_type='letter-of-the-living')
  await query(`INSERT OR IGNORE INTO graph_relations (source_entity_id, target_entity_id, relation_type, weight) VALUES (?,?,?,?)`,
    [id, GROUP, 'letter-of-the-living', 100]);
  relAdded++;
  if (newImp !== r.importance) { await query(`UPDATE graph_entities SET importance=? WHERE id=?`, [newImp, id]); impRaised++; }
  if (!hasStation) { await query(`UPDATE entity_research SET summary=?, updated_at=CURRENT_TIMESTAMP WHERE canonical_name=?`, [newSummary, r.name]); sumLed++; }
}
console.log(WRITE ? `\nAPPLIED — relations +${relAdded}, importance raised ${impRaised}, summaries led ${sumLed}` : `\nDRY RUN (set WRITE=1 to apply)`);
process.exit(0);
