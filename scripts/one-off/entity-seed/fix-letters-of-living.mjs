// One-off: lift the eighteen Letters of the Living to the rubric's foremost-hero band (70-89).
// They are a defined, foundational group (the Báb's first disciples) the rubric anchors at 70+, yet the
// fan-out + calibration left most at 18-62. Identified precisely from the Dawn-Breakers enumeration
// (NOT the summary-keyword heuristic, which false-positives on Farhádí brothers, Dawlatábádí, persecutors).
// Also rewrites the two summaries the split pass left wrong (Mullá Ḥusayn's nephew + brother, both Ṭabarsí
// martyrs). Matches by normalized name (tolerates transliteration-artifact canonicals). Run with SIFTER_WRITER_URL.
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, queryAll} = await import('../../../api/lib/db.js');
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
const R = "One of the eighteen Letters of the Living, the first disciples of the Báb (rubric: foremost-hero tier).";
const RECS = [
  { name: "Muḥammad-Báqir-i-Bushrú’í", imp: 72, reason: R,
    summary: "One of the eighteen Letters of the Living, the first disciples of the Báb. The nephew of Mullá Ḥusayn-i-Bushrú’í, he accompanied his uncle — together with Mullá Ḥusayn's brother Muḥammad-Ḥasan — from their native Bushrúyih to Karbilá and on to Shíráz, where they recognized the Báb and were enrolled among the Letters of the Living. He shared in the defence of the fort of Shaykh Ṭabarsí and was martyred in that upheaval (1849)." },
  { name: "Muḥammad-Ḥasan-i-Bushrú’í", imp: 72, reason: R,
    summary: "One of the eighteen Letters of the Living, the first disciples of the Báb, and the brother of Mullá Ḥusayn-i-Bushrú’í. With their nephew Muḥammad-Báqir he accompanied Mullá Ḥusayn from Bushrúyih to Shíráz, where they embraced the Báb's Cause; he was among the defenders of Shaykh Ṭabarsí, taken captive when the fort fell, and martyred (1849)." },
  { name: "Mullá ‘Alíy-i-Basṭámí", imp: 76, reason: "Letter of the Living; the first of the Báb's disciples to suffer and be martyred for the Faith (foremost-hero tier)." },
  { name: "Siyyid Ḥusayn-i-Yazdí", imp: 78, reason: "Letter of the Living and the Báb's amanuensis, who shared His imprisonment and transcribed His revelation (foremost-hero tier)." },
  { name: "Mullá Yúsuf-i-Ardibílí", imp: 72, reason: R },
  { name: "Mullá Báqir-i-Tabrízí", imp: 72, reason: R },
  { name: "Mullá Jalíl-i-Urúmí", imp: 72, reason: R },
  { name: "Mullá Aḥmad-i-Ibdál-i-Marághi’í", imp: 72, reason: R },
  { name: "Mírzá Muḥammad-‘Alíy-i-Qazvíní", imp: 72, reason: "Letter of the Living and brother-in-law of Ṭáhirih, who bore her letter and message to the Báb (foremost-hero tier)." },
  { name: "Shaykh Sa‘íd-i-Hindí", imp: 70, reason: R },
  { name: "Mullá Maḥmúd-i-Khu’í", imp: 70, reason: R },
  { name: "Mullá Khudá-Bakhsh-i-Qúchání", imp: 70, reason: R },
  { name: "Mullá Ḥasan-i-Bajistání", imp: 70, reason: R },
  { name: "Mírzá Muḥammad Rawḍih-Khán-i-Yazdí", imp: 70, reason: R },
  { name: "Mírzá Hádí, son of Mullá ‘Abdu’l-Vahháb-i-Qazvíní", imp: 70, reason: R },
];
let done = 0; const miss = [];
for (const r of RECS){
  const cn = await findCur(r.name);
  if (!cn){ miss.push(r.name); continue; }
  console.log(`  ${cn} -> imp ${r.imp}${r.summary ? ' +summary' : ''}`);
  if (!DRY){
    if (r.summary){
      await query("UPDATE entity_research SET importance=?, importance_reason=?, summary=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [r.imp, r.reason, r.summary, cn]);
      await query("UPDATE graph_entities SET importance=?, summary=? WHERE canonical_name=? AND entity_type='person' AND religion=''", [r.imp, r.summary, cn]);
    } else {
      await query("UPDATE entity_research SET importance=?, importance_reason=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [r.imp, r.reason, cn]);
      await query("UPDATE graph_entities SET importance=? WHERE canonical_name=? AND entity_type='person' AND religion=''", [r.imp, cn]);
    }
    done++;
  }
}
console.log(`${DRY ? '[DRY] ' : ''}updated=${done} missing=${miss.length}${miss.length ? ' :: ' + miss.join(' | ') : ''}`);
process.exit(0);
