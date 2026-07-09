# Verify & Consolidate: Badí‘ + Mírzá Abu'l-Faḍl

Method: corpus mention-count (graph.db entity_mentions, STALE) + context inspection + WebSearch.
Counts via: `ATTACH "data/graph.db" AS g; JOIN graph_entities (main DB) ON g.entity_mentions.entity_id`.
content_id is TEXT float ("21055835.0") → CAST(... AS INTEGER) → content.id.

---

## VERDICT 1 — Badí‘ (the martyr, Áqá Buzurg-i-Níshápúrí)

**Keeper: 1219596 `Badí'` (person)**
Chosen over the higher-count 1233337 because 1233337 is CONFLATED (see FLAG below) and 1219596
is a clean, martyr-only node co-located with all the martyr-identifying aliases. Acceptable
alternative keeper if a clean re-extraction is run: 1233337 (highest raw count, 46) but only
AFTER it is split.

Merge into keeper (all confirmed = the 17-yr-old Tablet-bearer martyr):
- 1220521 `Áqá Buzurg of Khurásán` (person, 1) — his birth name + region
- 1220523 `Pride of Martyrs` (mis-typed `work`, 2) — his title Fakhru'sh-Shuhadá; retype → person/alias
- 1220855 `illustrious Badí'` (person, 1) — epithet form
- the MARTYR PORTION of 1233337 `Badí‘` (see FLAG) — contexts 6768022/36/37/39/41/42/43/45/55/64/87, 7525938, 7528585, 6010043, 6011870, 21055835, 21055919
- (628090 `Áqá Buzurg` bare — 0 live mentions; ignore. Ambiguous name, do NOT auto-fold.)

Confidence: **HIGH** on identity & merge set; **MEDIUM** on keeper-id choice (because the
top-count node is contaminated and ideally should be split before, not merged).

### FIREWALL (Badí‘ ≠ these — DO NOT MERGE)
- **619601 `Mírzá Buzurg`** = Bahá'u'lláh's FATHER (Mírzá Buzurg-i-Núrí, vizier). Entirely different
  person. Also its variant cluster: 620328, 625348, 625378, 632477, 638405, 946453, 1055351,
  1219778, 1055795 (Buzurg Khán), 1231409 (Buzurg-i-Afnan). NONE are the martyr. "Buzurg" =
  "great/elder", a common name component — name coincidence only.
- **1220979 `Mírzá Badí‘u'lláh`** = the YOUNGEST SON of Bahá'u'lláh, a COVENANT-BREAKER (d.1950).
  Opposite moral valence; not a martyr. Contexts: 21055941/44/70/71, 21056081/90/91/137, 6438146.
- **1219511 `Kitáb-i-Badí'`** = a WORK (Bahá'u'lláh's book), not a person.
- **1228336 `Badí‘ calendar`** = the Badí‘ calendar (concept), not a person.
- **1237025 `Badí‘u'lláh Farid`** = a different modern individual.

### DESCRIBE
Badí‘ ("Wonderful"), b. Áqá Buzurg-i-Níshápúrí (Khurásán) c.1852, d.1869. Converted by Nabíl.
At seventeen, sole bearer (on foot to Ṭihrán, summer 1869) of Bahá'u'lláh's Lawḥ-i-Sulṭán —
the Tablet to Náṣiri'd-Dín Sháh. Arrested, branded with hot irons over three days, head crushed
with a rifle-butt. Titled **Fakhru'sh-Shuhadá ("Pride of Martyrs")** and "the Trust of God."
Bahá'u'lláh affirmed "the spirit of might and power was breathed" in him. His father was later
also martyred. (GPB; Taherzadeh vol.3 ch. on Badí‘; Balyuzi.)

---

## VERDICT 2 — Mírzá Abu'l-Faḍl (the scholar, Gulpáygání)

**Keeper: 1060906 `Mírzá Abu’l-Faḍl` (person, 42)** — highest live count, clean scholar contexts
(secretary; sent to U.S. by 'Abdu'l-Bahá; debates Revd Bruce; The Bahá'í Proofs).

Merge into keeper (all confirmed = Gulpáygání, the apologist):
- 631348 `Mírzá Abu'l-Faḍl` (22) — ASCII-apostrophe duplicate; cites *The Bahá'í Proofs*
- 1240648 `Mírzá Abu’l-Faḍl` (14) — sent to U.S.; Tabríz dialogue with Revd Bruce
- 620016 `Gulpáygání` (3) — surname-form, quotes his writing on Muḥammad
- 1228297 `Abu'l-Fazl Gulpáygání` (2) — "His honour, the dearly loved Abu'l-Faḍl… in Cairo"
- 1220505 `Mírzá Abu'l-Faḍl` (1) — Egypt expansion context

Confidence: **HIGH** — all six nodes resolve to the same scholar across GPB + Taherzadeh; no
contamination found.

### FIREWALL (Abu'l-Faḍl ≠ these)
- Any OTHER `Abu'l-Faḍl` / bare `Faḍl` / `Faḍá'il` not tied to Gulpáygání, Cairo, the U.S.
  teaching trip, *The Bahá'í Proofs*, or *Ad-Duraru'l-Bahiyyih*. (None such found among live
  mentions — all current nodes are the scholar.) Note 'Abdu'l-Bahá addressed him as
  **Abu'l-Faḍá'il** ("progenitor of virtues") — that epithet IS him, not a separate entity.
- Do NOT fold a bare "Faḍl"/"Mírzá Muḥammad" without Gulpáygání context (his given name was
  Muḥammad — collision risk).

### DESCRIBE
Mírzá Abu'l-Faḍl-i-Gulpáygání (b. Muḥammad, near Gulpáygán, Iran, 1844; d. Cairo, 21 Jan 1914).
Foremost Bahá'í scholar and apologist; one of the 19 Apostles of Bahá'u'lláh (though he never
met Him in person). Spread the Faith in Egypt, Turkmenistan ('Is̱hqábád), and the U.S. Author of
*The Bahá'í Proofs* and *Ad-Duraru'l-Bahiyyih* (The Shining Pearls, 1900). Self-chose alias
Abu'l-Faḍl ("father/progenitor of virtue"); 'Abdu'l-Bahá called him Abu'l-Faḍá'il.

---

## FLAGS (must address before/at consolidation)

1. **CRITICAL — 1233337 `Badí‘` (46 mentions) is a CONFLATED node** mixing two distinct people:
   - MARTYR portion (Taherzadeh vol.3 narrative: 6768022–6768087, 7525938, 7528585, 6010043,
     6011870; GPB 21055835/919) → belongs with Badí‘ the martyr.
   - COVENANT-BREAKER portion (the BULK): Mírzá Badí‘u'lláh, youngest son of Bahá'u'lláh —
     5076772, 5076835, 5098742/63/64/55/57/60/61/62/63/64/69/70/71/74, 5098953/57/58/59/82,
     5099203 → belongs with FIREWALL entity 1220979, NOT the martyr.
   Do not blindly merge 1233337 into either keeper. SPLIT first (re-extract / hand-split), then
   route halves. If unable to split now, prefer keeper 1219596 for the martyr and leave 1233337
   for cleanup rather than poison the martyr node with covenant-breaker text.
2. 1220523 `Pride of Martyrs` is typed `work` but is a TITLE (alias) of the person — retype on merge.
3. 628090 bare `Áqá Buzurg` (0 live mentions) and 1219519/1227553 are Bahá'u'lláh nodes nearby —
   ambiguous; do not auto-fold "Áqá Buzurg" without Níshápúr/Khurásán/martyr context.
4. Counts are STALE (graph.db entity_mentions not pruned on delete — see open task #2). Treat
   numbers as relative, not absolute.
