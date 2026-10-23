# OceanLibrary export 2026-10-23: ol-refresh dry run (run 6333)

**Nothing was written.** Ops job `ol-refresh` ran in dry mode on production (siftersearch-reports, heavy lane) on 2026-10-23, 14:16–14:20 UTC.
- Full result: `/tank/sifter/ol-refresh/dry-2026-10-23.json`.
- Per-book table: `oceanlibrary-export-20261023-dryrun-books.tsv`.
- Plan: `oceanlibrary-export-20261023-plan.md`.
- Defect report for OceanLibrary: `oceanlibrary-export-20261023-numbering-defects.md`.

## Held books matched to the export (541 of 564 live OL docs)

| status | books | meaning |
|---|---|---|
| unchanged | 169 | same text, same numbers (e.g. Íqán, whose `pn` already equalled OL's) |
| numbering-only | 340 | same text; only `pn` / `para_N` are written; row ids are kept |
| text-changed | 32 | at least one row's text changed, a row was removed, or a block was added |

- **Rows:**
  - 430,004 rows held, including 49,564 footnotes.
  - Matched by block id, in place: 377,559 exact and 292 merged spans. Another 1,329 id-less rows were matched by their words.
  - 1,041 id-less rows found no block. These are mostly `##` stubs and Qur'an sura headings; they keep their ids and get no number.
- **Text:** 175 rows change text, 44 rows are removed, and 99 content blocks are added (plus 112 signature lines, mostly in Uncompiled Letters).
- **Display numbers:**
  - 364,393 rows get a number: 319,199 new, 42,228 already equal, 2,966 changed, 26 cleared.
  - Changes from our local schemes include Gleanings `I.2→1.2` (717) and Hidden Words `Arabic 1→a1` (158).
  - Roman → Arabic conversions: 47,324, almost all in Kāfī, Bukhārī and Bihar.
- **Citable:**
  - 325,230 rows are citable as "Book #n".
  - 24,778 rows in 122 books are withheld because their number collides with another content paragraph.
  - Not citable by rule: 7,724 source lines, 4,318 signature lines, and 18,522 lead-ins (these cite with their paragraph).
  - 916 rows inherit their unit's number.
- **`para_N`** (the OL link anchor) shifts for 50,941 rows in 27 books, where OL added headers or blocks. It follows the live site.
- **Enrichment on rows whose text would change or be removed:** small.
  - Additional Prayers by ‘Abdu’l-Bahá: 26 HyPE, 23 alignment links.
  - Additional Tablets: 7 HyPE, 11 links.
  - Messages to America: 6 HyPE.
  - Everything else: none.
  - These carry over by `carry-map` on write.

### Text-changed books

| doc | book | text changed | removed | added | note |
|---|---|---|---|---|---|
| 21318 | The Quest of the Historical Jesus | 113 | 6 | 12 | editorial edits throughout (quotes reattributed) |
| 20897 | Uncompiled Published Letters | 0 | 0 | 49 | 49 content + 108 signature blocks the held copy lacks |
| 20900 | Additional Prayers Revealed by ‘Abdu’l-Bahá | 23 | 24 | 0 | invocation + prayer merged into one block (23 changed, 24 removed) |
| 21288 | Midrash Tanhuma | 10 | 2 | 3 |  |
| 21321 | Religious Affections | 3 | 4 | 8 |  |
| 20761 | Additional Tablets and Extracts from Tablets Revealed b | 5 | 6 | 0 |  |
| 20886 | Messages to America | 5 | 2 | 1 |  |
| 20938 | Sutra Collection (TU) | 0 | 0 | 4 |  |
| 21025 | The Mahabharata 8 | 2 | 0 | 2 | held row and export block hold DIFFERENT paragraphs under the same id: review |
| 21051 | Hayat Al-Qulub Vol.2 | 0 | 0 | 3 |  |
| 21056 | Kitab Al-Kafi 5 | 0 | 0 | 3 |  |
| 21001 | I Ching | 0 | 0 | 2 |  |
| 21057 | Kitab Al-Kafi 6 | 0 | 0 | 2 |  |
| 21073 | The Promised Mahdi, Part I | 0 | 0 | 2 |  |
| 21232 | Jeremiah | 1 | 0 | 1 | held row and export block hold DIFFERENT verses under the same id: review |
| 21254 | Ecclesiastes (Book of Ecclesiastes) | 2 | 0 | 0 |  |
| 21334 | Bihar al-Anwaar Vol 2 | 1 | 0 | 1 | export fixes held mojibake «��» |
| 21349 | Qabbalah: Writings of Solomon The Philosophical Writing | 1 | 0 | 1 |  |
| 20933 | Sutra Collection (L) | 0 | 0 | 1 |  |
| 20935 | Sutra Collection (N,O,P) | 1 | 0 | 0 |  |
| 20940 | The Amitâyur-dhyâna-sûtra | 0 | 0 | 1 |  |
| 21077 | Tahafut Al-Tahafut (The Incoherence of the Incoherence) | 0 | 0 | 1 |  |
| 21209 | Original Hebrew of a Portion of Ecclesiasticus | 1 | 0 | 0 |  |
| 21213 | Jerusalem: A Treatise On Ecclesiastical Authority And J | 0 | 0 | 1 |  |
| 21269 | Shir HaShirim (Song of Songs) | 1 | 0 | 0 |  |
| 21273 | Tehillim (Psalms) | 1 | 0 | 0 |  |
| 21283 | Yisheyah (Book of Isaiah) | 1 | 0 | 0 |  |
| 21311 | Messages to Canada | 0 | 0 | 1 |  |
| 21323 | St. Augustine’s City of God and Christian Doctrine | 1 | 0 | 0 | <br> artefact |
| 21338 | The Muqaddimah | 1 | 0 | 0 |  |
| 21340 | Bihar al-Anwaar Volume 8 | 1 | 0 | 0 | <br> artefact |
| 21359 | Pahlavi Texts, Part III | 1 | 0 | 0 | list-marker artefact |

## Display-number collisions: references withheld for those numbers only

There are 122 held books with at least one number shared by two content paragraphs. Every other number in these books keeps its reference. The withheld numbers per book are in the TSV (`withheld_ids`). The worst 25:

| doc | book | rows withheld | colliding numbers | citable rows |
|---|---|---|---|---|
| 21075 | Ṣaḥíḥ al-Bukhárí | 4059 | 1997 | 10152 |
| 21053 | Kitab Al-Kafi 2 | 3931 | 1312 | 2038 |
| 21057 | Kitab Al-Kafi 6 | 3046 | 1100 | 2368 |
| 21056 | Kitab Al-Kafi 5 | 2907 | 1042 | 2051 |
| 945940 | Yashts | 1372 | 460 | 713 |
| 21055 | Kitab Al-Kafi 4 | 1290 | 442 | 3554 |
| 21058 | Kitab Al-Kafi 7 | 1137 | 378 | 781 |
| 945931 | Bihar al-Anwaar Volume 1 | 690 | 340 | 488 |
| 21334 | Bihar al-Anwaar Vol 2 | 664 | 332 | 3363 |
| 21052 | Kitab Al-Kafi 1 | 607 | 255 | 4002 |
| 20924 | Mūlamadhyamakakārikā | 529 | 36 | 459 |
| 21210 | The Beginning of Wisdom | 388 | 181 | 58 |
| 20891 | The Light of Divine Guidance (Volume I) | 360 | 180 | 1154 |
| 21322 | The Book Of Mormon | 345 | 117 | 6561 |
| 20897 | Uncompiled Published Letters | 329 | 128 | 4252 |
| 20885 | Letters from the Guardian to Australia and New Zea | 238 | 111 | 588 |
| 21054 | Kitab Al-Kafi 3 | 234 | 76 | 5069 |
| 21316 | Sutra Collection (EFG) | 179 | 65 | 1673 |
| 20880 | Bahá’í Administration | 175 | 79 | 513 |
| 21049 | The Shahnama of Firdausi | 146 | 70 | 989 |
| 20888 | Messages to the Indian Subcontinent | 140 | 47 | 2244 |
| 21345 | Kalpa Sūtra | 123 | 36 | 280 |
| 20932 | Sutra Collection (HIJK) | 113 | 56 | 1588 |
| 21204 | Salat -The Muslim Prayer Book | 112 | 28 | 476 |
| 21312 | Unfolding Destiny | 102 | 51 | 2384 |

**Aqdas (doc 21307): use the published numbering (Chad 10-23).**
- The local override (`PN_OVERRIDES`) leaves the invocation unnumbered and makes "The first duty…" #1 and "They whom God…" #2.
- Checked against the production rows: 297 numbered, all citable, none withheld.
- Run 6333 predates the override, so its Aqdas row still shows the raw export.

## New books in the export

OL's own catalog (Bindery: bindery.lnker.com/api/libraries/oceanlibrary, the app oceanlibrary.com is built from, 620 books) is the publish signal. The site renders drafts and test books too, so a rendering page proves nothing.

- **Import: English, in OL's catalog (36 books, 35,237 paragraphs).**
  - KJV Lamentations, Nehemiah, Deuteronomy, Ezekiel, Judges, Nahum.
  - Li Ki I–II, Shih King, Shu King, Hsiao King.
  - Jaina Sūtras I–II, Chicago-Prashnottar, History of Indian Philosophy I.
  - Gospel of Buddha, Autobiography of a Yogi, Cloud of Unknowing.
  - Guru Granth Sahib 1–3, Religion of the Sikhs.
  - Taoist texts (8), Literary History of the Arabs, Awakening of the Soul, Persian Mystics (Rūmī), On the Harmony of Religions and Philosophy, Religious Ceremonies of the Parsees.
  - The re-keyed **Seven Valleys** (replaces doc 20811).
- **Held for Chad: English but NOT in OL's catalog (13 books).** These may be unpublished:
  - Ḥuqúqu’lláh (297); ‘Abdu’l-Bahá’s Commentary on the Quránic Vers (111); Avicenna: His Life and Works (472); “By the Fig and the Olive” ‘Abdu’l-Bahá’s Com (52); Commentary on the Islamic Tradition “I Was a  (106); Commentary on the Surah of the Sun (45); Munkidh min al-Dalal (Deliverance from Error) (103); The Incoherence of the Philosophers (874); Japan Will Turn Ablaze! (372); Lights of Guidance (7798); Bahá‘u’lláh as fulfilment of the theophanic p (74); The Apocryphal Acts of Paul, Peter, John, And (707); The Qur’an Commentary of Sayyid ‘Alí Muhammad (1289).
- **Junk, never imported (10):** Arem 09.2023; Arem book; smoke 03.09; Copy-The Kitáb-I-Íqán 06.08; The Dawn-Breakers; Messages to the Bahá’í World postpo; BROKEN Sura II. The Cow; TESTBOOK FOR REIMPORT; A Dog’s Tale; Messages to Canada.
- **Skipped for language (26):** 13 Persian, 7 Arabic (incl. Bihar 3/4/6), 6 Portuguese, 1 Italian (a test book).
- **Held as a deliberate duplicate:** Rodwell `quran_ocean_islam_en` (21343, `duplicate_of` 21104). It stays as it is.

## Held books not in the export (23)

Chad's decision moves these to the supplemental library and drops their OL link; they are not deleted. **However, OL's own catalog still lists 19 of them**, so the export is incomplete rather than OL having dropped them:
- the 17 Research Department compilations: Agriculture, Arts and Crafts, Prominent People, Service in Temples, Social and Economic Development, Teaching Among Aboriginal and Indigenous People, Teaching the Masses, The Covenant, Importance of the Arts, Formative Age, The Universal House of Justice, Trustworthiness, Radio and Television, Women, Writers and Writing, Youth;
- Divrei Yamim B (II Chronicles);
- The Masnavi.

**Recommendation:** keep these 19 in the OL collection and ask Oleksandr to re-export them. The catalog also lists Sikh Religion vols 1–6, which are in no export.

**Four are no longer in OL's catalog.** Each is superseded by a re-keyed book, so each moves or becomes `duplicate_of` its new copy:
- Seven Valleys `_bahai_en` (20811), replaced by the new Seven Valleys;
- Tablet to the Hague (20913), replaced by `tablets_to_the_hague_new_editon_en`, which we already hold;
- Avesta Selections (21305), replaced by `avesta_selections_ocean_zoroastrianism_en`, which we already hold;
- the two Divine Philosophy docs with no OL id (7189, 8308).

## For Chad to approve before any write

1. Write `pn` / `para_N` in place for the 509 unchanged and numbering-only books, as reported above.
2. The 32 text-changed books, especially the two where an id now holds a different paragraph (Mahābhārata 8, Jeremiah) and Additional Prayers by ‘Abdu’l-Bahá, where blocks were merged.
3. Import the 36 catalogued English books. Decide on the 13 uncatalogued books (Lights of Guidance, Ḥuqúqu’lláh, Japan Will Turn Ablaze, the Báb's Qur'an commentary…).
4. The 19 catalogued-but-not-exported books: keep and request a re-export (recommended), or move them to supplemental as decided.
