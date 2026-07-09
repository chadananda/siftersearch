# Shí‘í Imáms — Entity Verification (READ-ONLY analysis; no DB writes performed)

Corpus: SifterSearch graph.db / sifter.db. Mention counts via `g.entity_mentions` (the
`entity_mentions` count column on `graph_entities` is STALE — counts below are live).
WebSearch corroboration: al-islam.org, Wikipedia (Muhammad al-Mahdi, History of the Baháʼí Faith).

---

## 1. Imám ‘Alí (ibn Abí Ṭálib, 1st Imám)

- **KEEPER:** `1227872` "Imám ‘Alí" — type=**person** (39 live mentions).
- **MERGES:** none found. No other "Imám ‘Alí" fragment surfaced.
- **CONFIDENCE:** High.
- **FIREWALL (critical):** Imám ‘Alí ≠ **the Báb** (Siyyid ‘Alí-Muḥammad Shírází) ≠
  Muḥammad-‘Alí (Quddús) ≠ Fatḥ-‘Alí Sháh ≠ Mullá ‘Alíy-i-Basṭámí ≠ any of the dozens of
  living ‘Alís in the Dawn-Breakers. The keeper's contexts are oblique (co-occurrence in
  Bábí-era narrative paragraphs) but the canonical name is unambiguous: the historical
  cousin/son-in-law of the Prophet, 1st of the Twelve Imáms. Do NOT fold any living ‘Alí in.
- **DESCRIBE:** ‘Alí ibn Abí Ṭálib (d. 661 CE), cousin and son-in-law of the Prophet
  Muḥammad, first of the Twelve Imáms of Shí‘í Islam; father of Ḥasan and Ḥusayn.
- **FLAGS:** Keeper has thin/oblique mention contexts — re-extraction (extract-v2) would
  improve mention precision, but identity is not in doubt.

## 2. Imám Ḥusayn (3rd Imám, martyr of Karbilá)

- **KEEPER:** `1219357` "Imám Ḥusayn" — type=**person** (71 live mentions).
- **RELATED (do NOT merge into the person):**
  - `1220108` "the shrine of the Imám Ḥusayn" (place, 24) + `1220110` "Shrine of the Imám
    Ḥusayn" (place, 4) → these two PLACE fragments are duplicates of each other and should
    merge → keeper `1220108` (place). Distinct from the person.
  - `1219398` "the return of the Imám Ḥusayn" (event, 2) — eschatological event, keep separate.
- **CONFIDENCE:** High (person); High (the two shrine places are the same place).
- **FIREWALL (critical):** Imám Ḥusayn (3rd Imám, d. 680 CE Karbilá) ≠ the many LIVING
  Ḥusayns of the corpus: **Mullá Ḥusayn** (Bushrú'í, Letter of the Living — heavily present at
  Ṭabarsí), **Siyyid Ḥusayn**, **Ḥusayn Khán**. Several keeper paragraphs co-mention Mullá
  Ḥusayn — verify the tag points at the martyr-Imám, not Mullá Ḥusayn, on re-extraction.
- **DESCRIBE:** Ḥusayn ibn ‘Alí (d. 680 CE), grandson of the Prophet, 3rd Imám, martyred at
  Karbilá; his shrine and his promised "return" are recurring Shí‘í/Bábí motifs.
- **FLAGS:** Merge the two shrine PLACE entities (1220108 ← 1220110). Audit person mentions
  for Mullá-Ḥusayn contamination.

## 3. Imám Ḥasan (2nd Imám)

- **KEEPER:** `1219346` "Imám Ḥasan" — type=**person** (5 live mentions).
- **MERGES:** none.
- **CONFIDENCE:** Medium. Of the 5 mentions, at least one is CORRECT ("Quddús … a direct
  descendant of the Imám Ḥasan, the grandson of the Prophet"), but at least one paragraph is
  actually about the **Twelfth/Hidden Imám** ("did not die … disappeared … Surra-man-Ra'á
  A.H. 329") — that paragraph is MIS-TAGGED (the occulted Imám is the 12th, son of the 11th
  Imám Ḥasan al-‘Askarí; the extractor likely snagged the "Ḥasan" in al-‘Askarí). Keep the
  Imám Ḥasan person entity; flag the occultation paragraph for re-tag to the Qá'im concept.
- **FIREWALL:** Imám Ḥasan (2nd Imám, brother of Ḥusayn) ≠ Imám Ḥasan al-‘Askarí (11th Imám,
  father of the Hidden Imám) ≠ Ḥasan-i-Zunúzí ≠ Mullá Ḥasan ≠ any living Ḥasan.
- **DESCRIBE:** Ḥasan ibn ‘Alí (d. 670 CE), elder grandson of the Prophet, 2nd of the Twelve
  Imáms.
- **FLAGS:** Mis-tagged occultation paragraph (belongs to Qá'im/12th Imám). Possible
  conflation with the 11th Imám (al-‘Askarí) — neither has its own entity; acceptable to
  leave as-is given tiny volume, but note the 11th Imám is effectively unrepresented.

## 4. Twelfth Imám / Qá'im / Mihdí / Ṣáḥibu'z-Zamán — the QÁ'IM RECONCILIATION

WebSearch confirms (al-islam.org, Wikipedia): **al-Qá'im, al-Mahdí (Mihdí), Ṣáḥibu'z-Zamán
(Lord of the Age), al-Ḥujjah, al-Ghá'ib, the Hidden/Twelfth Imám** are ALL titles of the
single occulted Twelfth Imám (Muḥammad ibn al-Ḥasan al-‘Askarí, occultation A.H. 260/329).
In the Bábí/Bahá'í frame, "Qá'im / Promised One" is the **messianic STATION the Báb claimed
to fulfill** ("Yá Ṣáḥibu'z-Zamán!" was the Bábí battle-cry at Ṭabarsí — see 1227889/1227844).

**DISPOSITION — confirm & extend the prior person→concept decision.** Prior work already
flagged Qá'im `1227649` and Ṣáḥibu'z-Zamán `1227889` toward concept/title. The corpus usage
is overwhelmingly TITLE/STATION (sovereignty of the Qá'im, coming of the Qá'im, return of the
Hidden Imám, the battle-cry), NOT a flesh-and-blood biographical person in the narrative.

- **KEEPER (the title/concept):** `1227649` "Qá'im" — RE-TYPE person→**concept**, the
  single canonical title-entity. It is the highest-volume fragment (127).
- **MERGE INTO 1227649 (all the same title/station):**
  - `1219320` "Qá'im" (person, 33) → concept
  - `1141936` "Qá'im" (person, 4) → concept
  - `1219332` "Qá'im" (concept, 1)
  - `1227661` "the Mihdí" (person, 2) → concept
  - `638935` "Imám Mihdí" (person, 3) → concept
  - `1237838` "Promised Qá'im" (concept, 2)
  - `1227889` "Ṣáḥibu'z-Zamán" (person, 14) → concept
  - `1227844` "Ṣáḥibu'z-Zamán" (concept, 10)
  - `1219322` "Ṣáḥibu'z-Zamán" (concept, 9)
  - `1219366` "the Hidden Imám" (concept, 28)
  - `644172` "Hidden Imám" (person, 4) → concept
  - the Surra-man-Ra'á occultation paragraph currently under `1219346` Imám Ḥasan → re-tag here
  - **Variant/derived (judgment call — keep as distinct facet entities, do NOT fold the
    phrases into the bare title):** `1219594` "Yá Ṣáḥibu'z-Zamán" (battle-cry, concept),
    `1219570` "spiritual sovereignty of the Ṣáḥibu'z-Zamán" (concept), `1219619` "Cause of the
    Ṣáḥibu'z-Zamán" (concept), `1219397` "the coming of the Qá'im" (event), `1219962`
    "Revelation of the Qá'im Himself" (event), `1220437` "Companions of the Qá'im" (group).
    These are phrases ABOUT the title, not the bare title — relate-to, don't merge.
- **CONFIDENCE:** High that all bare-title fragments are one referent and that concept is the
  correct type. Medium on whether to keep a *parallel* person entity (see caveat).
- **FIREWALL (critical):** The Qá'im title is **related to** the Báb (who claimed to fulfill
  it) but must **NOT be merged into** the Báb's person entity, nor into any living person.
  Also firewall against the Mihdí/Qásim NAMESAKES that polluted the search: **Mírzá Mihdí**
  (52 — Bahá'u'lláh's son, the Purest Branch, + others), **Mihdí-Qulí Mírzá**, **Siyyid
  Mihdí**, **Mullá Mihdí**, **Mihdí Samandarí**, **Mírzá Abu'l-Qásim**, **Ḥájí Qásim**,
  **qá'im-maqám(s)** (a GOVERNORSHIP office — "deputy", false-friend of Qá'im), **Qá'im-Maqám**
  — NONE of these are the Twelfth Imám. Mihdí≠Mahdí-the-title; Qásim/qá'im-maqám≠Qá'im.
- **DESCRIBE:** The Qá'im ("He who shall arise") / Mihdí / Ṣáḥibu'z-Zamán / Hidden Twelfth
  Imám — the Shí‘í messianic station of the occulted Imám expected to return at the end of
  the age; the title the Báb declared Himself to fulfill in A.H. 1260 (1844 CE). Treated here
  as a title/concept entity, related to (not identical with) the Báb.
- **FLAGS:** Optionally retain a single thin PERSON entity for the historical 12th Imám
  (Muḥammad ibn al-Ḥasan) IF biographical mentions exist — but the corpus shows none; usage
  is title/expectation. Recommend concept-only. The two PLACE shrine entities (§2) and the
  governorship "qá'im-maqám" entities are explicitly OUT of this cluster.

---

### Cross-cutting notes
- All `description` fields are NULL across these entities — populate on the corrective pass.
- The `entity_mentions` count column on `graph_entities` is STALE; use live `g.entity_mentions`
  joins (done here).
- No `duplicate_of` column exists on `graph_entities`; merges are by canonical_name/type union
  via the single-writer API, not a self-FK.
- This file is ANALYSIS ONLY. No writes, no pm2, no files created on the server.
