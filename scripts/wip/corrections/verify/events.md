# Events / Places Verification — Bábí-era upheavals

Scope: consolidate and correctly type the key Bábí-era events/places: Shaykh Ṭabarsí, Badasht, Naw-Rúz, Nayríz, Zanján.
Method: corpus fragment census (graph.db `entity_mentions`, counts STALE/indicative only) + WebSearch fact-check. READ-ONLY; no DB writes.

> All these are LIGHT reference entities — descriptions are empty in the DB and intentionally stay terse. The deliverable here is correct **typing + consolidation + a place-vs-event modeling recommendation**, not biography.

> **Firewall result (Ṭabarsí):** No competing PERSON entity exists. The only "Shaykh Aḥmad" in the graph is `1056602` = Shaykh Aḥmad-i-Aḥsá'í (Shaykhí founder), unrelated. The fort is named for the shrine of Shaykh al-Ṭabarsí (a 12th-c. Shí'í scholar buried there) but no person entity competes for the name. So Ṭabarsí splits cleanly into PLACE (shrine/fort) vs EVENT (upheaval) only — no person leg.

---

## 1. Shaykh Ṭabarsí

**VERDICT:** SPLIT — keep TWO entities (place + event). Do NOT collapse into one.
- **EVENT keeper:** `1219827` Ṭabarsí (type=event). Merge event fragments: `1219835` defenders of the Fort of Ṭabarsí, `1220482` Struggle of Ṭabarsí, `1219847` Heroes of Ṭabarsí, `1220376` Battle of Fort Tabarsi → all the same upheaval.
- **PLACE keeper:** `1219633` Ṭabarsí (type=place, m≈63 — dominant). Merge place fragments: `1219482` Shaykh Ṭabarsí, `1219481` Fort of Shaykh Ṭabarsí, `1227604` shrine of Shaykh Tabarsi → the shrine/fort location in Māzandarán.

**CONFIDENCE:** High (typing + split). Medium on the exact event-fragment merge boundary (some "defenders/heroes" mentions are arguably people-collectives, but they reference the single upheaval and are best folded into the event).

**DESCRIBE:** The fort/shrine of Shaykh Ṭabarsí in Māzandarán; site of the first major Bábí-state armed conflict, ~Oct 1848 – May 1849 (~8 months). Mullá Ḥusayn marched 202 disciples under the Black Standard from Mashhad; Quddús joined as leader. ~300+ Bábís held out against up to 10,000 troops; ~half the Letters of the Living (incl. Mullá Ḥusayn and Quddús) perished. The turning point at which the Qajar state moved to suppress the Bábí movement. (GPB + DB + Momen 11559 Māzandarán.)

**FLAGS:** Classic place-vs-event conflation. The PLACE (shrine, still a pilgrimage site) and the EVENT (the upheaval/"struggle") are distinct referents that share the name; modeling them as one entity would muddle "where" vs "what happened." Recommend a `located_at` / `event_at_place` link between event 1219827 and place 1219633 rather than a merge.

---

## 2. Badasht

**VERDICT:** Primarily an EVENT; keep a thin PLACE too.
- **EVENT keeper:** `1219420` Conference of Badasht (type=event, m≈16). This is the notable referent.
- **PLACE keeper:** `615714` Badasht (type=place, m≈25 — dominant by mentions). Merge place fragments: `1219564` Badasht, `1219547` hamlet of Badasht → the hamlet/locale.

**CONFIDENCE:** High. The 1848 conference is the canonical "Badasht" referent; the place is a minor hamlet known almost solely for the event.

**DESCRIBE:** Summer 1848 gathering of ~81 Bábís at the hamlet of Badasht (Khurásán/Shāhrúd region), hosted/financed by Bahá'u'lláh. Ṭáhirih appeared unveiled, proclaiming the break with Islamic law (the new dispensation); the conference established the Bábí Faith's independent character. (GPB + DB.)

**FLAGS:** Place-vs-event again, but asymmetric: the place would be near-orphan without the event. Acceptable to keep the place entity thin (it anchors the location), with the event 1219420 as the substantive entity. Link event→place.

---

## 3. Naw-Rúz

**VERDICT:** MERGE duplicates into ONE recurring festival entity (concept/event, NOT a one-time event).
- **Keeper:** `619760` Naw-Rúz (type=event, m≈42 — dominant).
- **Merge:** `1229590` Naw-Rúz (m≈12) and `1227618` Feast of Naw-Rúz (m≈4) → same festival.
- **Do NOT merge (distinct instances/other):** `1221225` first Naw-Rúz (1909), `1224207` Naw-Rúz 130, `1224526` Naw-Rúz 1978 are specific dated occurrences — leave as instance entities (or link as instances-of 619760). `900308` Naw-Rúz-‘Alí is a PERSON (name coincidence) — firewall, do not touch.

**CONFIDENCE:** High. The bare `Naw-Rúz` event 619760 vs 1229590 are an obvious split-duplicate of the same festival.

**DESCRIBE:** Persian New Year, the vernal-equinox festival (~21 March); marks the end of the 19-day Bahá'í Fast and is one of the nine Bahá'í holy days. A recurring annual observance — best typed as a festival/observance concept rather than a singular historical event.

**FLAGS:** This is a RECURRING festival, not a one-time event. Current type=`event` is acceptable but ideally `concept` (festival/holy day). Dated occurrences (1909, BE 130, 1978) are separate instance entities and must not be folded into the recurring festival.

---

## 4. Nayríz

**VERDICT:** SPLIT — keep PLACE + EVENT(s).
- **PLACE keeper:** `620197` Nayríz (type=place, m≈83 — dominant). Merge `1238593` Nayríz (place, m≈2).
- **EVENT keeper:** `1219381` Nayríz upheaval (type=event, m≈8). Note this single entity covers BOTH the 1850 and 1853 upheavals; corpus does not separate them cleanly.
- **Related fragments (do not fold into the single-place keeper):** `1239994` Martyrs of Nayríz (concept), `1227621` People of Nayriz (organization), `1219516` Heroes of Mázindarán and Nayríz (event, multi-site), `1219738` Bloody episodes of Mázindarán/Nayríz/Zanján (event, multi-site) — these are multi-referent and best left as their own cross-cutting entities, optionally linked.

**CONFIDENCE:** High on place; Medium on whether to split the upheaval into two (1850 vs 1853). Corpus has one "Nayríz upheaval" entity; recommend keeping one event entity with both dates noted rather than minting a second on thin evidence.

**DESCRIBE:** Town in Fárs province. Site of two Bábí upheavals led by Siyyid Yaḥyá Dárábí (Vaḥíd): first 1850 (Bábís held Fort Khájih ~4 weeks before betrayal/massacre); second Oct–Dec 1853 (reprisal; Bábí women notably outnumbered surviving men). (GPB + DB + Momen 11559.)

**FLAGS:** Place-vs-event split required. Secondary modeling question: one upheaval entity (both 1850 & 1853) vs two. Recommend ONE with both dates in the description until corpus mentions warrant a split — avoid minting thin duplicates.

---

## 5. Zanján

**VERDICT:** SPLIT — keep PLACE + EVENT.
- **PLACE keeper:** `631459` Zanján (type=place, m≈111 — dominant).
- **EVENT keeper:** `1219622` Zanjan upheaval (type=event, m≈7). Merge event fragments: `1220393` Struggle of Zanjan, `1219664` Siege of Zanján → same 1850–51 upheaval.
- **Firewall (PERSON — do NOT fold into place/event):** `1227591` Hujjat-i-Zanjani, `1219376` Mullá Muḥammad-'Alíy-i-Zanjání, `1220392` Najaf-'Alíy-i-Zanjání are people whose nisba is "Zanjání" — name-coincidence with the town. Leave as person entities.
- **Multi-site:** `1219738` Bloody episodes of Mázindarán/Nayríz/Zanján (event) — cross-cutting, keep separate.

**CONFIDENCE:** High. Place dominant; event fragments (upheaval/struggle/siege) clearly the same episode.

**DESCRIBE:** City in NW Iran. Site of the Bábí upheaval of 5 May 1850 – Jan 1851 (~9 months) led by Mullá Muḥammad-'Alí (Ḥujjat). ~2,000 Bábí fighters with families held part of the town against a far larger Qajar army; fewer than a hundred survived to be executed. (GPB + DB + Momen 11528 Zanján.)

**FLAGS:** Place-vs-event split; plus a PERSON firewall — the "-Zanjání" nisba must not be merged into the town place entity.

---

## Cross-cutting recommendation: combined vs split model

For Ṭabarsí, Nayríz, Zanján (and to a lesser degree Badasht), the data already exists as **separate place and event entities** and they were extracted that way. **Recommend keeping them split** (PLACE = location, still extant/visitable; EVENT = the upheaval, a dated historical episode), joined by an `event_occurred_at` relation. A combined entity would conflate "where" with "what happened" and break clean retrieval. Naw-Rúz is the exception: a single recurring festival entity (merge the duplicates), with dated occurrences as instance-entities linked to it.
