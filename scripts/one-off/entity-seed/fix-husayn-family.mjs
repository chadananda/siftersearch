// One-off: disambiguate the two Shaykh Abú-Turábs, enrich Mullá Ḥusayn's sister, add his mother,
// and apply two "core" importance calibrations the user flagged (Báqir-i-Tabrízí, Báqir-i-Qá'iní).
// Matches by normalized name (tolerates transliteration-artifact canonicals). Run with SIFTER_WRITER_URL.
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, queryAll, graphQuery} = await import('../../../api/lib/db.js');
const {addAlias, normalizeSurface} = await import('../../../api/lib/graph-db.js');
const DRY = process.env.DRY === '1';
const normName = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
let _m = null;
async function findCur(name){
  const c = await queryOne("SELECT canonical_name FROM entity_research WHERE canonical_name=? AND entity_type='person'", [name]);
  if (c) return c.canonical_name;
  if (!_m){ _m = new Map(); for (const r of await queryAll("SELECT canonical_name FROM entity_research WHERE entity_type='person'")){ const k=normName(r.canonical_name); if(!_m.has(k))_m.set(k,[]); _m.get(k).push(r.canonical_name); } }
  const h = _m.get(normName(name)) || [];
  return h.length === 1 ? h[0] : null;
}
async function setImp(name, imp, reason){
  const cn = await findCur(name); if(!cn){ console.log(`  !! not found: ${name}`); return; }
  console.log(`  ${cn} -> imp ${imp}`);
  if(!DRY){
    await query("UPDATE entity_research SET importance=?, importance_reason=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [imp, reason, cn]);
    await query("UPDATE graph_entities SET importance=? WHERE canonical_name=? AND entity_type='person' AND religion=''", [imp, cn]);
  }
}
async function setSummary(name, {imp, summary, side}){
  const cn = await findCur(name); if(!cn){ console.log(`  !! not found: ${name}`); return; }
  console.log(`  ${cn} -> resummary${imp?` imp ${imp}`:''}`);
  if(!DRY){
    await query("UPDATE entity_research SET summary=?, importance=COALESCE(?,importance), side=COALESCE(?,side), updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [summary, imp??null, side??null, cn]);
    await query("UPDATE graph_entities SET summary=?, importance=COALESCE(?,importance) WHERE canonical_name=? AND entity_type='person' AND religion=''", [summary, imp??null, cn]);
  }
}

// 1) User's "core" calibrations
await setImp("Mullá Báqir-i-Tabrízí", 78, "A prominent Letter of the Living and core figure of the heroic age — disciple of Siyyid Káẓim, recipient of a Tablet from the Báb.");
await setImp("Mírzá Muḥammad-Báqir-i-Qá’iní", 70, "Builder of the Bábíyyih at Mashhad and a foremost military leader among the defenders of Shaykh Ṭabarsí — a core figure of the upheaval.");

// 2) Disambiguate the two Shaykh Abú-Turábs
//    (a) entity 38 "Shaykh Abú-Turáb" is the Imám-Jum'ih of Shíráz — strip the conflated sister-marriage clause
{
  const cn = await findCur("Shaykh Abú-Turáb");
  const newName = "Shaykh Abú-Turáb, the Imám-Jum‘ih of Shíráz";
  const summary = "Shaykh Abú-Turáb, the Imám-Jum‘ih of Shíráz — son of Shaykh Muḥammad Záhid and, after him, the city's foremost divine, greatly loved and admired. A figure of restraint during the Báb's confinement in Shíráz: upon his intervention the Báb was released on parole into the custody of His maternal uncle, and he declined to join the ‘ulamás' assembly convened against Him. (Distinct from the Shaykhí believer Shaykh Abú-Turáb-i-Ishtihárdí, who married Mullá Ḥusayn's sister.)";
  if (cn){
    console.log(`  ${cn} -> rename "${newName}" + Imám-Jum'ih summary`);
    if(!DRY){
      const geid = (await queryOne("SELECT id FROM graph_entities WHERE canonical_name=? AND entity_type='person' AND religion=''", [cn]))?.id;
      await query("UPDATE entity_research SET canonical_name=?, summary=?, side=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [newName, summary, 'Shí’ih clergy', cn]);
      await query("UPDATE graph_entities SET canonical_name=?, name=?, summary=? WHERE canonical_name=? AND entity_type='person' AND religion=''", [newName, newName, summary, cn]);
      if (geid) await addAlias(geid, { surface: 'Shaykh Abú-Turáb', source: 'disambig' });
    }
  } else console.log("  !! Shaykh Abú-Turáb (38) not found");
}
//    (b) Ishtihárdí — the timid Shaykhí companion who married the sister; martyred in the Ṭihrán prison
await setSummary("Shaykh Abú-Turáb-i-Ishtihárdí", {
  imp: 44, side: 'Bábí',
  summary: "Shaykh Abú-Turáb-i-Ishtihárdí — a leading Shaykhí disciple of Siyyid Káẓim-i-Rashtí from Ishtihárd (in the Qazvín region) who embraced the Báb's Cause and married the sister of Mullá Ḥusayn-i-Bushrú'í (Varaqatu'l-Firdaws). One of the best-informed eyewitnesses of the Badasht conference (1848); imprisoned for his services to the Cause, he died a martyr in the Ṭihrán prison.",
});

// 3) The sister — enrich Varaqatu'l-Firdaws + alias Bíbí Kúchak
await setSummary("Varaqatu’l-Firdaws", {
  imp: 38, side: 'Bábí',
  summary: "Varaqatu'l-Firdaws ('the Leaf of Paradise') — the sister of Mullá Ḥusayn-i-Bushrú'í (the Bábu'l-Báb) and wife of the Shaykhí believer Shaykh Abú-Turáb-i-Ishtihárdí. A woman of learning and devotion who, together with her mother, had been a Shaykhí and attended the classes of Siyyid Káẓim-i-Rashtí in Karbilá, where she was intimately associated with Ṭáhirih. ‘Abdu'l-Bahá honors her in Memorials of the Faithful.",
});
{
  const cn = await findCur("Varaqatu’l-Firdaws");
  if (cn && !DRY){ const geid=(await queryOne("SELECT id FROM graph_entities WHERE canonical_name=? AND entity_type='person' AND religion=''",[cn]))?.id; if(geid) await addAlias(geid,{surface:'Bíbí Kúchak', source:'enrich'}); }
}

// 4) Add Mullá Ḥusayn's mother (currently no entity; appears in footnotes)
{
  const name = "the mother of Mullá Ḥusayn";
  const summary = "The mother of Mullá Ḥusayn-i-Bushrú'í (the first Letter of the Living) and of his sister Varaqatu'l-Firdaws. A devout Shaykhí who, with her daughter, attended the classes of Siyyid Káẓim-i-Rashtí in Karbilá and was associated there with Ṭáhirih; she is remembered among the women of the earliest Bábí circle in the footnotes of the early histories.";
  const exists = await findCur(name);
  console.log(`  add "${name}"${exists?' (exists, update)':' (new)'}`);
  if(!DRY){
    await query("INSERT OR IGNORE INTO graph_entities (canonical_name, name, entity_type, religion, summary, importance) VALUES (?,?,?,'',?,?)", [name, name, 'person', summary, 26]);
    await query("INSERT OR IGNORE INTO entity_research (canonical_name, entity_type, side, summary, importance, importance_reason, status, created_at, updated_at) VALUES (?,?,?,?,?,?, 'proposed', datetime('now'), datetime('now'))", [name, 'person', 'Bábí', summary, 26, "Mother of Mullá Ḥusayn; an early Shaykhí/Bábí woman of the first circle, attested mainly in footnotes."]);
    // if it already existed, ensure the summary/importance are set
    await query("UPDATE entity_research SET summary=?, importance=26 WHERE canonical_name=? AND entity_type='person'", [summary, name]);
  }
}
console.log(DRY ? '\n[DRY] done' : '\ndone');
process.exit(0);
