# Bahá'u'lláh's Works — Document Links + Verified Script + Sort-Check

> Companion to `gpb-enrichment-works.md`. That wave enriched characterization/timeline BEFORE the
> work→document-link rule existed, so the records didn't yet point at their actual corpus texts.
> This pass adds: (a) `source_doc_ids` + `text_in_corpus` per work; (b) **verified original script**
> from the in-corpus **Phelps Partial Inventory** (doc 8746 — the Bahá'u'lláh equivalent of the
> Phelps Báb inventory, authoritative, present in-corpus); (c) a sort-check confirming distinct
> works aren't merged and multi-part works are modeled right.
>
> Method: corpus-first. All doc IDs are `deleted_at IS NULL`, `scope='primary'` canonical docs,
> author `Bahá'u'lláh`. Script/BH-codes pulled from doc 8746 (Steven Phelps, *A Partial Inventory
> of the Works of the Central Figures*). The OoL best-known-works /fa/ table is a JS SPA (not
> renderable via WebFetch and not ingested in-corpus) — the Phelps inventory supersedes it as the
> authoritative, in-corpus, verified-script source, so the prior "likely" script flags are now
> **verified** where a BH-code matched.

## Corpus inventory source (KEY DISCOVERY)
- **doc 8746** — Phelps, *A Partial Inventory of the Works of the Central Figures of the Bahá'í Faith*
  (in-corpus, primary). Each entry = `BHxxxxx` code · transliterated title · word count · language
  (Ara/Per/mixed) · **original Arabic/Persian script** · opening-line English. This is the
  authoritative inventory backbone — every work below is pinned to its BH-code.
- supporting cross-reference: **doc 21875** "Tablets of Bahá'u'lláh: Cross-reference between Tablets",
  **doc 21879** "Proclamation of Bahá'u'lláh: Cross-reference to the Leiden List".
- NOTE on the `writings-bahaullah` 337xxx docs: those are **bahai-library.com** scrapes (supplemental
  scope, fragment-per-section), NOT the OoL table and NOT the canonical full texts. Use the
  `scope='primary'` docs below for the work→doc link, not the 337xxx fragments.

---

## Per-work document links + verified script

### 1. The Hidden Words (Kalimát-i-Maknúnih)
- **source_doc_ids: [20809, 8230]** · `text_in_corpus: yes` (full text)
  - 20809 "The Hidden Words of Bahá'u'lláh" (314 ¶, authorised) — primary full text
  - 8230 "The Hidden Words of Bahá'u'lláh" (245 ¶) — second copy
  - 15171 "Parallel Hidden Words in English (Early and Authorised)" (400 ¶) — parallel/study edition
- Phelps: **BH00113 Kalimat-i-Maknunih (Hidden Words — Persian)** + **BH00386 Kalimat-i-Maknunih
  (Hidden Words — Arabic)** → the work is TWO inventory entries (Arabic part + Persian part), matching
  GPB's "partly in Persian, partly in Arabic."
- **VERIFIED script: کلمات مكنونه** (was "likely" in gpb-enrichment-works.md → now confirmed via Phelps).

### 2a. The Seven Valleys (Haft-Vádí)
- **source_doc_ids: [20811, 8241]** · `text_in_corpus: yes`
  - 20811 / 8241 "The Seven Valleys and the Four Valleys" (205 ¶ / 185 ¶) — the two valleys travel as
    one published volume in the corpus (both works in each doc).
- Phelps: **BH00047 Haft Vadi (The Seven Valleys)** 6100 words, Per.
- **VERIFIED script: هفت وادی** (Phelps confirms).

### 2b. The Four Valleys (Chahár-Vádí)
- **source_doc_ids: [12403, 20811, 8241]** · `text_in_corpus: yes`
  - 12403 "Chahár Vádí (Four Valleys)" (48 ¶) — standalone Four Valleys
  - also within the combined volume 20811 / 8241
- Phelps: **BH00306 Chihar Vadi (The Four Valleys)** 2100 words.
- **VERIFIED script: چهار وادی** (Phelps; note Phelps transliterates "Chihar", OoL "Chihár").

### 3. Gems of Divine Mysteries (Javáhiru'l-Asrár)
- **source_doc_ids: [20782, 8253, 15039]** · `text_in_corpus: yes`
  - 20782 "Gems of Divine Mysteries" (120 ¶, authorised) — primary
  - 8253 (124 ¶) second copy; 15039 "Gems of the Mysteries (Jawáhir al-Asrár)" (104 ¶, provisional)
- Phelps: **BH00012 Javahiru'l-Asrar (Gems of Divine Mysteries)**.
- **VERIFIED script: جواهر الاسرار** (Phelps confirms; was "likely").

### 4. Tablet of Patience — Súriy-i-Ṣabr / Lawḥ-i-Ayyúb ★ ANCHOR ★
- **source_doc_ids: [16631, 15743, 16287, 11463]** · `text_in_corpus: yes`
  - 16631 "Tablet of Patience (Lawh-i-Sabr or Lawh-i-Ayyúb)" (81 ¶) — best titled full text
  - 15743 "Tablet of Patience, or Tablet of Job" (83 ¶)
  - 16287 "Súrah of Patience" (104 ¶); 11463 "Súrih of Patience (Súrat as-Sabr)" (89 ¶)
- Phelps: **BH00034 Suriy-i-Sabr (=Lawh-i-Ayyub)** 7050 words, Ara — Phelps EXPLICITLY equates the two
  titles (`=`), confirming Súriy-i-Ṣabr ≡ Lawḥ-i-Ayyúb as ONE work (not two).
- **VERIFIED script: لوح صبر (لوح ايوب)** — Phelps opening line confirms the dedication to "‘abdahu Ayyúb"
  (His servant Job = Ḥájí Muḥammad-Taqí of Nayríz).

### 5. Súriy-i-Mulúk (Tablet of the Kings)
- **source_doc_ids: [20806, 8299]** · `text_in_corpus: yes` — within *Summons of the Lord of Hosts*
  - 20806 / 8299 "Summons of the Lord of Hosts" (491 ¶ / 497 ¶) — the authorised collected proclamation
    volume; Súriy-i-Mulúk is its opening tablet. (No standalone Súriy-i-Mulúk doc; it lives inside Summons.)
- Phelps: **BH00021 Suriy-i-Muluk** 8150 words, Ara.
- **VERIFIED script: سورة الملوك** (Phelps opening: «هذا کتاب من هذا الغلام...»; was "likely سوره ملوك").
- ⚠ SORT NOTE: Phelps also lists **BH00061 Suriy-i-Sultan** (5370 words, Ara — a DISTINCT Adrianople
  súrih) and **BH00127 Suriy-i-Qahir**. These are NOT the Súriy-i-Mulúk and NOT the Lawḥ-i-Sulṭán to the
  Sháh — keep separate (see sort-check §B).

### 6. Tablets to Individual Rulers (the Proclamation)
All collected in *Summons of the Lord of Hosts* (**20806 / 8299**) and/or *Tablets… After the Aqdas*
(**8270**). `text_in_corpus: yes`.
- **6a. Lawḥ-i-Napulyún I** — Phelps **BH01120 Lawh-i-Napoleon I** (750 words, mixed). In Summons (20806).
  Also excerpt docs 11801 / 16596 "First Tablet to Napoleon III: Excerpts" (`text_in_corpus: yes` but excerpt-only).
  **VERIFIED script opening: سبحانک اللهم یا اله...**
- **6b. Lawḥ-i-Napulyún II** — Phelps **BH00259 Lawh-i-Napoleon II** (2460 words, Ara). In Summons (20806).
  ★ The famous fall-prophecy ("thy kingdom shall be thrown into confusion") is in THIS second tablet.
  **VERIFIED script opening: قل یا ملک الباریس...** ("O King of Paris").
- **6c. Lawḥ-i-Malikih (Queen Victoria)** — Phelps **BH00662 Lawh-i-Malikah Victoria** (1150 words).
  Standalone docs: **16695** "Tablet to Queen Victoria (Lawh-i-Malikih)" (43 ¶), **15282** "Tablet to
  Queen Victoria" (31 ¶). Also in Summons (20806). **VERIFIED script: لوح ملكه (ويكتوريا)**.
- **6d. Lawḥ-i-Malik-i-Rús / Lawḥ-i-Qiṣar (Czar Alexander II)** — Phelps **BH01042 Lawh-i-Malik-i-Rus**
  (800 words). In Summons (20806). **VERIFIED script: لوح ملك الروس**. (Phelps title settles it: the
  catalog name is *Malik-i-Rús* = "King of Russia"; "Qiṣar/Qayṣar" is the descriptive Czar-title, not
  the catalog title.) NB Phelps also has **BH05904 Lawh-i-'Ali Haydar Shirvani (2nd Tablet to the Czar)**
  — a distinct minor tablet, keep separate.
- **6e. Lawḥ-i-Páp (Pope Pius IX)** — Phelps **BH00347 Lawh-i-Pap (Tablet to Pope Pius IX)** (1900 words).
  In Summons (20806). **VERIFIED script: لوح پاپ**.
- **6f. Sulṭán ‘Abdu'l-‘Azíz — ⚠ HUMAN-REVIEW FLAG CONFIRMED / RESOLVED:** the Phelps inventory has
  **NO standalone tablet to Sulṭán ‘Abdu'l-‘Azíz** (searched Aziz / Sultan-i- across all BH-codes → 0).
  This independently corroborates the GPB finding: ‘Abdu'l-‘Azíz is addressed *within* the Súriy-i-Mulúk
  (and his ministers separately — Lawḥ-i-Ra'ís to ‘Alí Páshá = **BH00269**; Lawḥ-i-Fu'ád to Fu'ád Páshá).
  → **No discrete "Tablet to ‘Abdu'l-‘Azíz" entity.** Model it as a recipient WITHIN Súriy-i-Mulúk, not a
  standalone work. (Lawḥ-i-Ra'ís full text in-corpus: docs 16683/16697/16679; Lawḥ-i-Fu'ád: 16299/15145.)
- **6g. Lawḥ-i-Sulṭán (Náṣiri'd-Dín Sháh)** — Phelps **BH00038 Lawh-i-Sultan** (6890 words, mixed) — note
  Phelps confirms it is "mixed" Arabic/Persian and is the LENGTHIEST single-sovereign epistle.
  Standalone full texts: **16700** "Tablet to Nasiri'd Din Shah (Lawh-i-Sultan)" (167 ¶ — fullest),
  **11468** "Tablet to Nasiri'd Din Shah" (141 ¶), plus shorter 1706/16694/16696 (46 ¶). Also in Summons.
  **VERIFIED script opening: یا ملک الارض اسمع ندآء هذا المملوک...** ("O King of the Earth, hearken…").
  OoL /fa/ "Kitáb-i-Sulṭán" variant retained as alias.

### 7. Tablet of Aḥmad (Arabic) — Lawḥ-i-Aḥmad
- **source_doc_ids: [1616, 16618]** · `text_in_corpus: yes`
  - 1616 "Tablet of Ahmad (Lawh-i-Ahmad)" (16 ¶) — the Arabic, recited tablet (English full text)
  - 16618 "Tabla de Aḥmad" (es, 16 ¶); 16620 (es, 20 ¶) — Spanish
- Phelps: **BH02022 Lawh-i-Ahmad (Arabic)** 440 words, Ara — DISTINCT from **BH00249 Lawh-i-Ahmad
  (Persian)** 2510 words, Per (the Aḥmad-i-Káshání tablet).
- **VERIFIED script: لوح احمد** · opening «هذه ورقة الفردوس...».
- ⚠ Two-tablet model CONFIRMED by inventory: do NOT merge the Arabic (Yazd, recited) with the Persian (Káshán).

### 8. Súriy-i-Haykal (Tablet of the Temple)
- **source_doc_ids: [16658, 15169, 20806, 8299]** · `text_in_corpus: yes`
  - 16658 "Tablet of the Temple (Súrih-i-Haykal)" (223 ¶, year 1900) — standalone full text
  - 15169 "Tablet of the Temple: Two translations collated" (148 ¶)
  - also within Summons (20806/8299), which carries the Haykal + the five enclosed ruler tablets
- Phelps: **BH00007 Suriy-i-Haykal (Surih of the Temple)** 20670 words, Ara — the single largest of
  the proclamation works (consistent with it enclosing the five ruler tablets in pentacle form).
- **VERIFIED script: سورة الهيكل** · opening «سبحان الذی نزل الایات لقوم یفقهون...».
- ⚠ SORT NOTE: the five ruler tablets (Napoleon I/II, Victoria, Czar, Pope) are SEPARATE Phelps
  entries with their own BH-codes (above) AND are embedded within the Haykal pentacle — model as
  distinct works that are *also* contained by Súriy-i-Haykal (a contains-relationship), not as merged.

### 9. The Kitáb-i-Aqdas (The Most Holy Book)
- **source_doc_ids: [8274, 21307, 16712]** · `text_in_corpus: yes`
  - 8274 "The Kitáb-i-Aqdas" (398 ¶) — authorised, fullest; 21307 "The Kitáb-i-Aqdas" (298 ¶)
  - 16712 "The Most Holy Book (Kitáb-i-Aqdas)" (477 ¶, year 1922)
  - 15766 "Parallel Translation of the Kitáb-i-Aqdas" (465 ¶); 8270 "Tablets… Revealed After the
    Kitáb-i-Aqdas" (664 ¶) = the SUPPLEMENTARY post-Aqdas tablets, NOT the Aqdas itself — keep separate.
- Phelps: **BH00001 Kitab-i-Aqdas** 10520 words, Ara (entry #1 — the largest, first-ranked work).
- **VERIFIED script: كتاب اقدس / الكتاب الأقدس** · opening «ان اول ما کتب الله علی العباد عرفان...».
- ⚠ Phelps also lists **BH00505 Lawh-i-Aqdas (Tablet to the Christians)** — a DISTINCT short tablet
  ("Most Holy Tablet"), NOT the Kitáb-i-Aqdas. Do not merge the two on the "Aqdas" string.

### 10. Epistle to the Son of the Wolf — Lawḥ-i-Ibn-i-Dhi'b
- **source_doc_ids: [20780, 8273]** · `text_in_corpus: yes`
  - 20780 "Epistle to the Son of the Wolf" (269 ¶, authorised) — primary; 8273 (317 ¶) second copy
- Phelps: **BH00005 Lawh-i-Ibn-i-Dhi'b (Epistle to the Son of the Wolf)** — entry #5, a major late work.
- **VERIFIED script: لوح ابن الذئب** (Phelps confirms; was "likely").

### 11. Tablet of Carmel — Lawḥ-i-Karmil
- **source_doc_ids: [8270]** · `text_in_corpus: yes` (within *Tablets… Revealed After the Kitáb-i-Aqdas*,
  section 1 — confirmed by opening «Call out to Zion, O Carmel…»). Related: 5666 "'The Book of Names'
  Mentioned in the Tablet of Carmel" (25 ¶) = a *study note about* a phrase in Carmel, `mentioned-only`.
- Phelps: **BH02324 Lawh-i-Karmil (Tablet of Carmel)** 380 words, Ara (+ BH05706 = a *commentary on*
  its revelation, distinct).
- **VERIFIED script: لوح كرمل** · opening «حبذا...».

### 12. Kitáb-i-‘Ahd (Book of My Covenant) — added (was not in gpb-enrichment per-work list but in task scope)
- **source_doc_ids: [8270]** · `text_in_corpus: yes` (within *Tablets… Revealed After the Kitáb-i-Aqdas*;
  confirmed text "Book of My Covenant"). Also surfaced thematically in 20865 "The Covenant" compilation
  (`mentioned-only` for the compilation).
- Phelps: **BH00003 Kitab-i-'Ahd (Book of the Covenant)** 920 words, Per — entry #3, the Will/Testament.
- **VERIFIED script: كتاب عهدى** · the "Crimson Book" alluded to in the Epistle to the Son of the Wolf.

---

## catalog_ids — cross-reference block per work (PERSIST AS ENTITY FIELDS)

Each Bahá'u'lláh work entity carries `{phelps, inba, oceanlibrary, doc_id}`. `phelps` = code from
in-corpus doc 8746; `inba` = Iran National Bahá'í Archives ms number from the Phelps "Mss:" line
(authoritative source — OceanLibrary frontmatter has NO INBA field; corpus `docs.metadata` only holds
`translator`); `oceanlibrary` = curated `Core Tablets/Bahá'u'lláh` (or `Tablet Translations/Baha'u'llah`)
filename; `doc_id` = primary corpus doc(s). Unknowns marked explicitly.

```yaml
# 1. Hidden Words
{ phelps: [BH00386 (Arabic), BH00113 (Persian)], inba: [INBA36:440, INBA30:002, INBA65:115, INBA36:383, INBA30:014], oceanlibrary: "Tablet Translations/Baha'u'llah - Parallel Hidden Words in English (Early and Authorised).md (parallel only; no authorised file in curated roster)", doc_id: [20809, 8230, 15171] }
# 2a. Seven Valleys
{ phelps: BH00047, inba: [INBA35:293, INBA33:101], oceanlibrary: "none (combined-volume only; provisional split not in roster)", doc_id: [20811, 8241] }
# 2b. Four Valleys
{ phelps: BH00306, inba: INBA36:334, oceanlibrary: "Tablet Translations/Baha'u'llah - Chahar Vadi (Four Valleys) - tr. Juan Cole.md", doc_id: [12403, 20811, 8241] }
# 3. Gems of Divine Mysteries
{ phelps: BH00012, inba: [INBA46:001, INBA66:036, INBA99:001], oceanlibrary: "Tablet Translations/Baha'u'llah - Gems of the Mysteries (Jawahir al-Asrar) - tr. Juan Cole.md", doc_id: [20782, 8253, 15039] }
# 4. Tablet of Patience (Súriy-i-Ṣabr / Lawḥ-i-Ayyúb)
{ phelps: BH00034, inba: [INBA36:173, INBA73:082], oceanlibrary: "Tablet Translations/Baha'u'llah - Tablet of Patience (Lawh-i-Sabr or Lawh-i-Ayyub) - tr. Khazeh Fananapazir.md", doc_id: [16631, 15743, 16287, 11463] }
# 5. Súriy-i-Mulúk
{ phelps: BH00021, inba: INBA71:123, oceanlibrary: "none discrete (within Summons; not a standalone curated file)", doc_id: [20806, 8299] }
# 6a. Lawḥ-i-Napulyún I
{ phelps: BH01120, inba: "unknown (no INBA ms in Phelps line — other repositories)", oceanlibrary: "Tablet Translations/Baha'u'llah - First Tablet to Napoleon III Excerpts - tr. Hippolyte Dreyfus, Ismael Velasco.md (excerpt)", doc_id: [20806, 11801, 16596] }
# 6b. Lawḥ-i-Napulyún II
{ phelps: BH00259, inba: INBA34:033, oceanlibrary: "none discrete (within Summons)", doc_id: [20806] }
# 6c. Lawḥ-i-Malikih (Queen Victoria)
{ phelps: BH00662, inba: INBA34:044, oceanlibrary: "Tablet Translations/Baha'u'llah - Tablet to Queen Victoria (Lawh-i-Malikih) - tr. Shoghi Effendi, Unknown.md", doc_id: [16695, 15282, 20806] }
# 6d. Lawḥ-i-Malik-i-Rús (Czar Alexander II)
{ phelps: BH01042, inba: INBA34:041, oceanlibrary: "none discrete (within Summons)", doc_id: [20806] }
# 6e. Lawḥ-i-Páp (Pope Pius IX)
{ phelps: BH00347, inba: INBA34:026, oceanlibrary: "none discrete (within Summons)", doc_id: [20806] }
# 6f. Sulṭán ‘Abdu'l-‘Azíz — NO STANDALONE WORK
{ phelps: "none (absent from inventory; folded into BH00021 Súriy-i-Mulúk)", inba: n/a, oceanlibrary: "none", doc_id: "n/a — recipient within Súriy-i-Mulúk (20806)" }
# 6g. Lawḥ-i-Sulṭán (Náṣiri'd-Dín Sháh)
{ phelps: BH00038, inba: INBA34:047, oceanlibrary: "Tablet Translations/Baha'u'llah - Tablet to Nasiri'd Din Shah (Lawh-i-Sultan) - tr. E.G. Browne, Shoghi Effendi.md", doc_id: [16700, 11468, 1706, 16694, 16696, 20806] }
# 7. Tablet of Aḥmad (Arabic)
{ phelps: BH02022, inba: [INBA19:001, INBA32:002, INBA36:041, INBA71:199, INBA30:076], oceanlibrary: "Tablet Translations/Baha'u'llah - Tablet of Ahmad (Lawh-i-Ahmad) - tr. Unknown.md", doc_id: [1616, 16618] }
#   (distinct: Tablet of Aḥmad Persian = BH00249, inba: [INBA38:018, INBA65:185, INBA35:073, INBA36:401] — NOT this work)
# 8. Súriy-i-Haykal
{ phelps: BH00007, inba: INBA34:001, oceanlibrary: "Tablet Translations/Baha'u'llah - Tablet of the Temple (Surih-i-Haykal) - tr. Anton F. Haddad, Shoghi Effendi.md", doc_id: [16658, 15169, 20806, 8299] }
# 9. Kitáb-i-Aqdas
{ phelps: BH00001, inba: INBA43:069, oceanlibrary: "Tablet Translations/Baha'u'llah - The Most Holy Book (Kitab-i-Aqdas) - tr. Shoghi Effendi, Anton Haddad.md", doc_id: [8274, 21307, 16712] }
# 10. Epistle to the Son of the Wolf
{ phelps: BH00005, inba: "unknown (no INBA ms in Phelps line)", oceanlibrary: "none in curated roster", doc_id: [20780, 8273] }
# 11. Tablet of Carmel
{ phelps: BH02324, inba: "unknown (no INBA ms in Phelps line)", oceanlibrary: "none discrete (within Tablets After the Aqdas, doc 8270)", doc_id: [8270] }
# 12. Kitáb-i-‘Ahd (Book of My Covenant)
{ phelps: BH00003, inba: INBA65:101, oceanlibrary: "none discrete (within Tablets After the Aqdas, doc 8270)", doc_id: [8270] }
```

## OceanLibrary curated roster — mapping notes
- **`Core Tablets/Bahá'u'lláh`** is sparse on-disk: only **2 materialized `.md` files** (rest are Dropbox
  online-only placeholders, invisible to `find`). The two present — "Sahifat-Allah (Scroll of God)"
  (→ corpus docs 18843/15326) and "Tablet 137 Mulla Muhammad Shafi" (→ doc 1624) — are NOT among the 13
  GPB target works. Their filename numeric prefix ("137") is a Star-of-the-West/collection sequence
  number, NOT a Phelps BH-code or INBA number. OceanLibrary frontmatter fields = title/author/translator/
  year/sourceUrl/textQuality — **no INBA, no Phelps code**, so OceanLibrary contributes the filename only.
- **`Tablet Translations/Baha'u'llah`** is the richer roster (provisional translations) — it provides the
  `oceanlibrary` filename for most target works (mapped above). The fully-authorised major texts (Hidden
  Words authorised, Summons, Epistle to the Son of the Wolf, Gleanings) are NOT in this provisional folder.

---

## A. Sort-check — distinct works NOT merged (string-collision traps)

| String | The works that share it — KEEP DISTINCT |
|---|---|
| **"Sultan"** | Lawḥ-i-Sulṭán (BH00038, to Náṣiri'd-Dín **Sháh**, 6890w) · Súriy-i-Sulṭán (BH00061, Adrianople súrih, 5370w) — DIFFERENT works. Súriy-i-Mulúk (BH00021) is also "to the kings" but distinct again. |
| **"Aqdas"** | Kitáb-i-Aqdas (BH00001, the Book) · Lawḥ-i-Aqdas (BH00505, Tablet to the Christians) · "Tablets Revealed After the Kitáb-i-Aqdas" (doc 8270, the post-Aqdas compilation) — three different things. |
| **"Ahmad"** | Lawḥ-i-Aḥmad Arabic (BH02022, Yazd, recited) · Lawḥ-i-Aḥmad Persian (BH00249, Káshán) — two tablets. |
| **"Napoleon"** | Lawḥ-i-Napulyún I (BH01120, 750w) · Lawḥ-i-Napulyún II (BH00259, 2460w, fall-prophecy) — two tablets. |
| **"Czar/Rús"** | Lawḥ-i-Malik-i-Rús (BH01042, to Alexander II) · Lawḥ-i-‘Alí Ḥaydar Shírvání (BH05904, "2nd Tablet to the Czar") — distinct. |
| **"Karmil"** | Lawḥ-i-Karmil (BH02324, the Tablet) · Commentary on the revelation of the Lawḥ-i-Karmil (BH05706) — work vs. commentary. |
| **"Carmel"** | Tablet of Carmel (in doc 8270) · doc 5666 "Book of Names Mentioned in the Tablet of Carmel" (a note, mentioned-only). |
| **"Maknúnih"** | one work (Hidden Words) carried as TWO inventory entries — Arabic (BH00386) + Persian (BH00113). Merge to ONE entity, capture both codes. |
| **"Súriy-i-Ṣabr / Lawḥ-i-Ayyúb"** | ONE work, two titles (Phelps explicit `=`). Merge — do NOT split. |

## B. Sort-check — multi-part works modeled correctly
1. **Súriy-i-Haykal CONTAINS the five ruler tablets** (Napoleon I, Napoleon II, Victoria, Czar, Pope),
   written in pentacle form. Each ruler tablet is its own Phelps BH-code AND a `contained_by:
   Súriy-i-Haykal` relationship. Distinct works + a containment link — not merged, not orphaned.
2. **Summons of the Lord of Hosts (docs 20806/8299)** is the *collected proclamation volume* — it bundles
   Súriy-i-Mulúk + Súriy-i-Haykal + Lawḥ-i-Sulṭán + the individual ruler tablets as published sections.
   Use it as a `source_doc` for each constituent (the text IS there), but the *work entities* remain the
   individual tablets, not "Summons" as a single work.
3. **The two Napoleon tablets** are correctly two entities; fall-prophecy is in #II (BH00259). Verified.
4. **No standalone Tablet to ‘Abdu'l-‘Azíz** — confirmed absent from the inventory; recipient lives
   inside Súriy-i-Mulúk. The prior GPB flag is RESOLVED (not fabricated; correctly folded).

## C. Flags / corrections carried forward
- **Script forms upgraded "likely" → VERIFIED** for: Hidden Words, Seven Valleys, Four Valleys, Gems,
  Súriy-i-Ṣabr, Súriy-i-Mulúk, Súriy-i-Haykal, Lawḥ-i-Sulṭán, Tablet of Aḥmad, Kitáb-i-Aqdas, Epistle to
  the Son of the Wolf, Tablet of Carmel, all four named ruler tablets, Kitáb-i-‘Ahd — source = in-corpus
  Phelps inventory (doc 8746), which is authoritative and supersedes the un-renderable OoL /fa/ SPA.
- The **OoL best-known-works /fa/ table is NOT in-corpus** and its SPA can't be WebFetched; the Phelps
  inventory is the better in-corpus substitute and was used. If exact OoL /fa/ glyph confirmation is later
  wanted, drive the catalog with the `tablet-catalog` browser-automation skill (oceanoflights.org/catalog,
  chapter path `/chapter/bahaullah-en/`).
- The **337xxx `writings-bahaullah` docs are bahai-library.com scrapes** (supplemental, fragmented) —
  excluded from `source_doc_ids`; they are not the canonical full texts.
- All `source_doc_ids` are `scope='primary'`, `deleted_at IS NULL`, author Bahá'u'lláh. Every listed work
  is `text_in_corpus: yes` — the full text of all 13 target works (plus Kitáb-i-‘Ahd) IS held in the corpus.
