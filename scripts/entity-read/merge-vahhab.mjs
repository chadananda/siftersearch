// Evidence-based merge: 1249589 ("‘Abdu'l-Vahháb") folds into 1249228 ("Mírzá ‘Abdu'l-Vahháb-i-Shírází").
// Proof: both = the Shíráz shopkeeper, son of Ḥájí ‘Abdu'l-Majíd (1249590, the Shíráz father who settled near
// Baghdad), who overtook Mullá ‘Alí at Shíráz (p222–224), followed Bahá'u'lláh from Karbilá to Ṭihrán, and was
// martyred chained with Him in the Síyáh-Chál (p1369–70). Does NOT touch 1250012 (the *assassin* "of Shíráz",
// kept distinct by the seed). Folds aliases/description, repoints mentions+aliases (graph.db) + relations
// (sifter.db), deletes the merged row; then binds the region-scoped seqread mentions of this man to the keeper.
// Backup taken before running. DRY=1 previews. Writes route via SIFTER_WRITER_URL.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync } from 'fs';
const { query, queryOne, queryAll, graphQuery, graphQueryAll } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const K = 1249228, M = 1249589;
const TARGET_CANONS = new Set(["‘Abdu'l-Vahháb (son of Ḥájí ‘Abdu'l-Majíd)", "Mírzá ‘Abdu'l-Vahháb-i-Shírází"].map(s => s.normalize('NFC')));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();

const kRow = await queryOne("SELECT canonical_name FROM graph_entities WHERE id=?", [K]);
const mRow = await queryOne("SELECT canonical_name FROM graph_entities WHERE id=?", [M]);
if (!kRow || !mRow) { console.log('keeper or merged row missing — aborting', { kRow, mRow }); process.exit(1); }
console.log(`KEEPER ${K} = "${kRow.canonical_name}"   MERGED ${M} = "${mRow.canonical_name}"`);
const kER = await queryOne("SELECT canonical_name, description, aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [kRow.canonical_name]);
const mER = await queryOne("SELECT canonical_name, description, aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [mRow.canonical_name]);
const aliases = new Set(); for (const r of [kER, mER]) { if (!r) continue; try { for (const a of JSON.parse(r.aliases || '[]')) aliases.add(a); } catch {} } aliases.add(mRow.canonical_name);
let desc = (kER?.description || '').trim(); if (mER?.description && mER.description.trim() && !desc.includes(mER.description.trim())) desc = desc ? desc + ' … ' + mER.description.trim() : mER.description.trim();
const mc = (await graphQueryAll("SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=?", [M]))[0]?.n || 0;
const rc = (await queryAll("SELECT COUNT(*) n FROM graph_relations WHERE source_entity_id=? OR target_entity_id=?", [M, M]))[0]?.n || 0;
console.log(`fold: ${mc} mentions + ${rc} relations repointed ${M}->${K}; aliases union=${aliases.size}`);

// region-scoped seqread mentions of THIS man (by the reader's own per-region recs) -> keeper
const dir = 'tmp/entity-research/seqread';
const regions = [];
for (const f of readdirSync(dir).filter(f => /^region-\d+\.json$/.test(f)).sort()) {
  const meta = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  let map = []; try { map = JSON.parse(readFileSync(`${dir}/${f.replace('.json', '-map.json')}`, 'utf8')); } catch {}
  const lm = new Map(); for (const rec of map) { const tgt = TARGET_CANONS.has(String(rec.canonical_name).normalize('NFC')); for (const n of [rec.label, ...(rec.surfaces || [])]) if (n && tgt) lm.set(norm(n), rec.canonical_name); }
  regions.push({ range: meta.range, lm });
}
const regionFor = p => regions.find(R => p >= R.range[0] && p <= R.range[1]);
const paraCid = new Map((await queryAll("SELECT paragraph_index, id FROM content WHERE doc_id=21308 AND deleted_at IS NULL")).map(r => [r.paragraph_index, String(r.id)]));
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const bindParas = new Set();
for (const m of mentions) { const R = regionFor(m.para); if (R && R.lm.has(norm(m.label))) bindParas.add(m.para); }
const existing = new Set((await graphQueryAll("SELECT content_id FROM entity_mentions WHERE entity_id=?", [K])).map(r => String(r.content_id)));
const toBind = [...bindParas].map(p => paraCid.get(p)).filter(c => c && !existing.has(c));
console.log(`seqread mentions of this man -> keeper: ${bindParas.size} paras, ${toBind.length} new links`);

if (!DRY) {
  // fold (graph.db)
  await graphQuery("UPDATE OR IGNORE entity_mentions SET entity_id=? WHERE entity_id=?", [K, M]);
  await graphQuery("DELETE FROM entity_mentions WHERE entity_id=?", [M]);
  await graphQuery("UPDATE OR IGNORE entity_aliases SET entity_id=? WHERE entity_id=?", [K, M]);
  await graphQuery("DELETE FROM entity_aliases WHERE entity_id=?", [M]);
  // fold (sifter.db, routed)
  await query("UPDATE OR IGNORE graph_relations SET source_entity_id=? WHERE source_entity_id=?", [K, M]);
  await query("UPDATE OR IGNORE graph_relations SET target_entity_id=? WHERE target_entity_id=?", [K, M]);
  await query("DELETE FROM graph_relations WHERE source_entity_id=? OR target_entity_id=?", [M, M]);
  await query("UPDATE entity_research SET description=?, aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [desc, JSON.stringify([...aliases]), kRow.canonical_name]);
  await query("UPDATE graph_entities SET description=? WHERE id=?", [desc, K]);
  await query("DELETE FROM entity_research WHERE canonical_name=? AND entity_type='person'", [mRow.canonical_name]);
  await query("DELETE FROM graph_entities WHERE id=?", [M]);
  // bind region-scoped seqread mentions of this man to the keeper
  for (const cid of toBind) await graphQuery("INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','seqread-v1')", [K, cid, 'subject', 0.95]);
  console.log(`MERGED ${M}->${K}; bound ${toBind.length} seqread links. Reverse: restore from backup.`);
} else console.log('[DRY] nothing written');
process.exit(0);
