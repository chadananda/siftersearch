# OceanLibrary export 2026-10-23 — findings and replace-in-place plan

Source: `~/Downloads/MD_Export(23-Oct-2026 6-29 UTC).zip`. Examined only: nothing was ingested, written or deleted.
**Status (10-23, after Chad's decisions):**
- **Done:**
  - `sites.yaml` pause flag built (tested); the OceanLibrary tick is paused.
  - Ops job `ol-refresh` built (dry only).
  - Numbering-defect report for OceanLibrary written: `planning/oceanlibrary-export-20261023-numbering-defects.md`, with every block in the `.tsv` beside it.
  - Budget recorded in `data/approved-spend.json`.
- **Dry run done:** run 6333, summarised in `planning/oceanlibrary-export-20261023-dryrun.md`.
- **Next:** Chad approves the dry run before any write.

Per-book table: `planning/oceanlibrary-export-20261023-books.tsv` (650 rows: status, prod doc id, id grade, diff counts).
Production figures come from `corpus-status.mjs` (80,836 docs live) and `/api/admin/docs?sourceSite=oceanlibrary.com`
(564 live OL docs, 403,639 paragraphs).

## 1. Findings

### Structure
- **One `.md` per book**, in `<bookid>/<bookid>_<firstId>_<lastId>.md` (e.g. `suttanipata_en/suttanipata_en_2s_19v.md`).
  Images sit beside it in `illustrations/<md5>.png|jpg`. There are 627 books, 210 MB of markdown and about 2.3 GB of images.
- **The export's top-level folders are not trustworthy.** The 12 `__…` folders group books wrongly. For example,
  `__Hadith/` holds Genesis and the Gospel of John, `__Mahābhārata/` holds Ṣaḥīḥ al-Bukhārī, and `__The Tanakh/`
  holds Bihar al-Anwār. Placement must keep coming from front matter plus our `-sites` layout (`ol-works.js`),
  never from these folders.
- **The zip has 10 duplicate entries** (all illustrations, e.g. `gospel_of_buddha_en/illustrations/517b….jpg`), so
  unzip needs `-o`.
- **Front matter** is the same as before: `bookid, collection_id, slug, language, title, author(_2…_4),
  author_slug, ocean_category, weight, toc_id, display_number, translated_by…`. It has no `published` flag and no
  `ilm_id`: the `id` attribute on each block is the ILM block id (`bl30`, `2y`…).
- **Block markup:** `text {.classes id="bl5a9" num="13:1" type="par" language="en"}`.
  - `num` is the new display id. It appears on 449,750 of 457,505 paragraphs (98.3%) and on 46,062 headers.
  - List-item paragraphs carry their attributes on the next line, which the adapter already handles.
  - Footnotes are `[^n]: … {language="en"}` and have no id and no `num`.
  - Each block type has a fixed `subtype`: `title`, `header`, `hr` or `illustration`.
- **Languages:** en 600, fa 13, ar 7, pt 6, it 1.
- **Traditions:** Islam 204, Bahá'í 137, Judaism 95, Christian 56, Hindu 49, Buddhist 29, Zoroastrian 20,
  Confucian 12, Tao 11, Jainism 10, Sikh 4.
- **Images now resolve.** Our current files carry `{{…image_hash_key}}` placeholders, which the adapter drops.
  The export references real files, so 886 illustration blocks in held books changed only in their path.

### Display ids (sampled 30 books and graded all 627)

How the ids are shaped across all paragraphs:

| shape | paragraphs | examples |
|---|---|---|
| `N.N` (chap.par) | 212k | SAQ `1.4`, Tablets of the Divine Plan `2.3`, Gleanings `1.2` |
| `N.N.N` (section.sub.par) | 114k | Kitáb al-Kāfī `1.1.6`, Lights of Guidance `1.53.15` |
| `N:N` (chapter:verse) | 55k | Genesis `1:1`, Psalms, John, Rodwell suras `13:1` |
| `N` (running number) | 40k | Íqán `1…290`, Aqdas, Suttanipāta verses |
| roman / prefixed | ~35k | `I.1.2`, `p.3` (SAQ preface), `a1`/`p1` (Hidden Words), `f.10`, `qa.105` (Aqdas Q&A) |

Some books number the opening invocation and others do not; the export records each book's decision.

| book | id scheme | invocation | notes |
|---|---|---|---|
| Kitáb-i-Íqán | `1…290` | "In the name of our Lord…" **unnumbered** | **matches Chad's `#72`**; one phantom empty block has the `num` 12, so 12 appears twice |
| Kitáb-i-Aqdas | `1…190`, `qa.N` | "In the name of Him Who is the Supreme Ruler…" **numbered `1`** | **error:** "The first duty…" is `2` and "They whom God…" is also `2`. The 1992 edition has the invocation unnumbered, "first duty" as ¶1 and "They whom" as ¶2. Everything from ¶3 on matches |
| Gleanings | `1`, `1.2`, `1.3` … `2` | n/a | the first paragraph of each section is the bare section number. Our refs scheme in production writes `I`, `I.2` → **0/717 agree** |
| Some Answered Questions | `p.1…p.6`, `1.1…` | n/a | the preface has its own `p.` series |
| Hidden Words | `a1…a71`, `p1…p82` | "He Is the Glory of Glories" unnumbered | `num` sits on the address line ("O Son of Spirit!") and the body is unnumbered. Production merged address and body into one row, which holds the **body's** ilm_id, so a naive join finds no number for 161 rows. Production's own `pn` is `Arabic 1` |
| Lights of Guidance | `1` (item heading), `1.1.1` (quote), `1.2` (citation line) | — | the citation-line ids collide with the next item; 1,657 duplicates; leading spaces and trailing dots. **Not citable as is** |
| Tablets of the Divine Plan | `1.1, 1.2, 1.2, 1.3` | — | adjacent duplicates in 22 tablets (either continuation paragraphs or off-by-one) |
| Selections from the Writings of the Báb | `1.1…` | invocations ("He is the Most Glorious") share the following paragraph's number | 56 duplicates |
| Genesis, John (KJV) | `c:v` | — | 1 of 705 in John is a typo (`6.1` for `6:1`) |
| Psalms | `c:v` | — | Psalm 55: the split half of v.19 is labelled `55:20`, then the real 55:20 is also `55:20`. **Our computed `pn` is off by one from 55:21 on**; the export is right after the duplicate |
| Qur'an (Rodwell, per-sura) | `13:1`; a block holding several verses carries its first verse, the rest are `<sup>` | basmala **unnumbered** | Yusuf Ali numbers the basmala `N.1` and Palmer numbers it too. Each translation follows its own source |
| Suttanipāta | verse `1…1149` | — | 261 colophons ("Uragasutta is ended.") unnumbered |
| Sutra Collection B, Kāfī, Bihar, Mahābhārata | `N.N.N` | — | numbering restarts per sub-book, so 1–30% of ids are duplicates |

- **Grading (all 627 books):**
  - **A** (unique, ordered): 417 books, 161k paragraphs.
  - **B** (≤1% duplicates): 99 books, 119k paragraphs.
  - **C** (noisy): 107 books, 177k paragraphs.
  - none: 4 books.
- **Bahá'í books:** 69 A, 30 B, 37 C. The C group is mostly the letter collections (Unfolding Destiny, Messages to
  Canada, Light of Divine Guidance, Uncompiled Letters), plus Lights of Guidance and Bahá'í Administration.
- **Duplicates overall:** 26,432 duplicate ids across 200 books.
- **Header nums:** headers carry numbers (`num="29"` on "Chapter XXIX") that often collide with paragraph ids, as in
  SAQ, where headings are numbered `1, 3, 1`. Header nums can be ignored, because headers are not stored as rows.
- **Ids are not normalised:** 166 have whitespace or a trailing dot, and the `6.1`/`6:1` style of typo appears.

### Export compared with what we hold

**Match key:** front-matter `bookid` = `docs.external_id`; block `id` = `block_attrs.ilm_id`.

**ilm ids are stable across exports.** In the 541 shared books:
- 443,419 blocks have the same id and the same text.
- 2,362 changed: 889 headers, 886 image paths, 584 paragraphs.
- 735 blocks were added and 50 removed.
- **418 books are identical except for the new `num`.**
- Real text edits are concentrated in a few books:

  | book | change |
  |---|---|
  | Religious Affections | 383 changes, all straight quotes → curly |
  | Quest of the Historical Jesus | 146 genuine edits |
  | Additional Prayers by ‘Abdu’l-Bahá | invocation merged into prayer; 27 blocks removed |
  | Midrash Tanhuma | 16 changes |
  | Messages to America | 10 changes |
  | Additional Tablets | 5 changes |

- **Production join:** across the 30 sample books, 39,216 of 39,289 non-footnote production rows (99.8%) find their
  block by `ilm_id`, and 38,662 (98.4%) receive a `num`.
- **Production already has `pn` on 5,569 of those rows** (from the verse-pn and refs schemes). It agrees with the
  export on 4,685; Gleanings and Hidden Words make up most of the disagreement.

| set | count | detail |
|---|---|---|
| In both | **541** | 391,315 production paragraphs (footnotes included) against 378,328 export paragraphs |
| New in export | 86 | **75 real books, 72,282 paragraphs**, of which 18,225 are Bahá'í. Included: the 31 published books missing from the Feb-5 export (KJV Deuteronomy/Judges/Nehemiah…, Li Ki, Jaina Sūtras, Gospel of Buddha, Autobiography of a Yogi…); the 19 fa/ar books that `remove-junk.js` had dropped (Makátíb vols 1–8, Āyāt-i-Ilāhī 1–2, Nidā-yi Rabb al-Junūd, Arabic Bayān, Arabic Hidden Words…); 6 Portuguese books; Sikh (Guru Granth Sahib 1–3); Lights of Guidance; Ḥuqúqu’lláh; Japan Will Turn Ablaze. Re-keyed copies of held books: Seven Valleys, Tablets to the Hague (new edition), Avesta Selections |
| New but junk | 11 | `arem_sprint_*`, `test_book_*`, `omal_12_03_en` (Mark Twain filed under Jainism, 0 paragraphs), "TESTBOOK FOR REIMPORT", "Copy-The Kitáb-I-Íqán 06.08" by "A. A. Milne", "BROKEN Sura II", `dawn_breakers_temporary_copy_en`, a second Messages to Canada, "Messages to the Bahá’í World postponed". **The export includes drafts and tests**, so a publish check is mandatory |
| Held but not in export | 21 live (+2 Divine Philosophy docs with no `external_id`: 7189, 8308) | **19 are still live on oceanlibrary.com** (17 Research Department compilations such as Youth, Women and The Covenant; The Masnavi; II Chronicles), so **the export is incomplete. Keep them.** 4 are gone from the site and superseded by re-keyed books: Seven Valleys `_bahai_en`, Tablet to the Hague, Avesta Selections, and the Greek-titled John/Matthew |

The Rodwell `quran_ocean_islam_en` (21343) is held only as `duplicate_of` 21104; that was deliberate, so leave it.

**Metadata defects to carry forward:**
- Compilations list Bahá'u'lláh as `author`. The existing `compilationAuthor` rule handles this.
- Lights of Guidance's real compiler is Helen Hornby.
- "Messages to Canada" has an empty author.
- The `bookid` `abandonment_or_absolute_surrender_en` belongs to a book titled "Religious Ceremonies and Customs of the Parsees".

### The trap: a plain re-ingest would orphan most of what we have built
Dropping the converted files into `-sites/oceanlibrary.com` would change their file hashes. The hourly watcher tick
(`library-watcher.js:1055` → `runSitesIngestTick`, **no per-site pause flag**) would then re-ingest them through
`content.replaceParagraphsByDoc`. That function inserts every row new and deletes every old one, so **every
paragraph id changes**. Unlike the main ingester, it does not reuse rows by word hash and does not detach dependents.

**What would be lost, by store:**

| store | outcome |
|---|---|
| `content_source_links` (246k) | orphaned, not carried |
| `concept_claims`, `entity_claims`, `concept_mentions` | orphaned, not carried |
| graph.db `paragraph_extractions`, `quote_instances`, `paragraph_roles` | orphaned, not carried |
| `doc_episodes` paragraph ids | orphaned, not carried |
| Qdrant `concepts` points | left stale; this collection is not in the outbox |
| authorship v18b (17,545 rows), `para_meta`, `original_text` / `translation_text` | lost |
| HyPE and context columns | carried only by hash, so they survive only where the text is unchanged |

The `reingest-carry` job exists but wraps the main ingester, never the OL path. A possible extra failure: foreign keys on
`enrichment_pending` and `deep_research_quotes` can block the DELETE after the insert, which would leave a book doubled.

**Therefore: no OL book is re-ingested. Matched books are updated in place.**

## 2. Display-id model (Chad 10-23)

**Code:** `api/lib/library/ol-display-ids.js` (pure; tests in `tests/lib/ol-display-ids.test.js`).

- **OceanLibrary's numbering wins everywhere.** Our local schemes are replaced: Gleanings `I.2` becomes `1.2`, Hidden Words `Arabic 1` becomes `a1`.
  - Numbers are shown as regular Arabic numerals: uppercase-roman segments I–XXXIX become Arabic (`I.1.2` → `1.1.2`).
  - Front and back matter keep their prefixes exactly as OL assigned them (`p.3`, `a1`, `qa.105`).
  - Whitespace and a trailing dot are trimmed. Nothing else is reinterpreted, so `L1.1` and `6.1`-for-`6:1` typos stay as they are and go on the defect report.
- **Storage:** `content.block_attrs.pn`, plus `pn_src: "ilm"` so that `refs-assign` and `verse-pn` never overwrite it. `ilm_id` is kept.
- **Which blocks are citable:**
  - **Content paragraphs** are citable: "Author, Book #pn".
  - **Not citable:**
    - Source and citation lines: "(From a letter…)", class `.reference`, a parenthesised line after a quotation.
    - Signature and closing lines.
    - Headers.
  - These non-citable lines attach to their item for display and context, and their stray `num` is ignored.
  - **Lead-ins:** a short block (≤ 30 words) such as a salutation, invocation or hadith reference + chain that carries the same number as the next paragraph belongs to that paragraph and cites as its number.
  - **Unit bodies:** an unnumbered content block inside a numbered unit (no header or hr between them) cites as the unit. For example, the body under a Hidden Word cites as `#a1`.
  - **Invocations** with no number get none.
- **Duplicates:** OceanLibrary display numbers must be unique within a book, so every duplicate is an OL defect.
  - Where two content paragraphs still share a number, **only those numbers** lose their `#` reference until OL fixes them. Every unique number in the same book keeps its reference.
  - The dry run lists the withheld numbers per book. The defect report goes to Oleksandr.
- **Recount with these rules (all 627 books):**
  - 423k content paragraphs, of which 398k (94%) are citable.
  - 10,825 source lines, 5,367 signature lines and 19,617 lead-ins are not citable.
  - Books with real content collisions: **142 of 627** (Bahá'í: 45 of 137). This replaces the earlier "107 noisy". 484 books are clean.
  - Most collisions are in Kāfī, Bukhārī, Bihar and Yashts, where numbering restarts per sub-book. Among Bahá'í books: Messages to Canada (385), Light of Divine Guidance I (180), Uncompiled Letters (128), Lights of Guidance (127), and Letters to Australia and NZ (111).
- **Lights of Guidance:** items cite as the item number (`#37`); a paragraph inside an item cites as OL assigned it (`#1.37.1`). The stray numbers on source lines are ignored.
- **Aqdas: not corrected (Chad 10-23).** The export numbers the invocation `1` and gives "The first duty…" and "They whom God…" both the number `2`. As exported, `#2` is withheld as a collision and the invocation would cite as `#1`. The dry run and the defect report flag it, and Chad decides.
- **Reference text:** `${citeAuthor}, ${olCiteTitle} #${pn}`.
  - Example: *Bahá’u’lláh, Kitáb-i-Íqán #72*.
  - Multi-part works use "<work>, <part>".
  - Compilations use the paragraph's own author.
  - A new formatter goes beside `olCiteTitle`, with tests (none exists yet).
- **Links** go to OceanLibrary: `https://oceanlibrary.com/<slug>/?paraId=para_N`, in range form when there is a quote.
  - `para_N` is recomputed from the export, so it follows the live site.
  - The siftersearch canonical form is `/<doc-slug>#pn-<pn>`.

## 3. Strategy: replace in place

1. **Freeze the OL tick. DONE.**
   - `sites.yaml` now takes `paused: true` per site: `ingestAllSites` skips the site, while explicit `sites-ingest --site … --files …` runs still work. Tested.
   - `oceanlibrary.com` is paused in the live `-sites/sites.yaml`. It takes effect when this code deploys; before that, the unknown key is ignored.
2. **Ops job `ol-refresh`** (`api/lib/ops/ol-refresh-job.js`, heavy lane, single writer).
   - It matches stored rows to export blocks by `block_attrs.ilm_id`. Rows held without an id are matched by their words. A row holding several blocks (address + body, a paragraph joined across a page) is matched as one span.
   - **Dry mode (built):** reports everything listed in §4.
   - **Write mode (refuses until approved):** per matched row, an UPDATE of `block_attrs` (`pn`, `pn_src`, `cite`) and `external_para_id`, keeping the same `content.id`.
     - Text edits are an UPDATE on the same row, then re-embedding and phrase/HyPE refresh.
     - Added blocks are INSERTed.
     - Removed rows are retired only after review; their dependents move with `carry-map`.
     - Last of all, the new `-sites` file and its `file_hash` / `body_hash` are written, so the unpaused tick sees "unchanged". Rollback jsonl goes to `/tank/sifter/ol-refresh/`.
3. **New books: English only (Chad 10-23).**
   - Persian, Arabic, Portuguese and Italian books are skipped for now.
   - Test and draft books are excluded, and the live page decides whether a book is published.
   - Ingest with `sites-ingest --files` (these books have no prior ids, so nothing can be orphaned). The quality gate stays on.
4. **Held books missing from the export (Chad 10-23): move them to the supplemental library.** They are not deleted.
   - Each moves out of `-sites/oceanlibrary.com` into the supplemental library: same doc id, `source_site` changed, OceanLibrary link dropped.
   - This needs a move job that keeps doc and row ids (`docs-repo` file move, as in 10-10).
   - **Evidence from the dry run (run 6333):** OceanLibrary's own catalog (Bindery, 620 books) **still lists 19 of these 23**: the 17 Research Department compilations, II Chronicles and the Masnavi. So the export is incomplete, rather than OL having dropped them. The catalog also lists Sikh Religion vols 1–6, which no export contains. **Recommendation:** keep the 19 and ask Oleksandr for a re-export. Chad decides.
   - Tablet to the Hague, Seven Valleys `_bahai_en`, Avesta Selections and the Greek-titled John/Matthew are no longer live. They are superseded by re-keyed books, so each moves (or becomes `duplicate_of` the new copy) after review.

## 4. Dry run (before any write)
Run with `node scripts/ops/ops.mjs report ol-refresh --params '{"dir":"/tank/sifter/ol-export-20261023"}' --wait`. The export markdown is staged on tower at that path (627 files, 116 MB, no images). The run writes its full result to `/tank/sifter/ol-refresh/dry-<date>.json`.

**Per held book, it reports:**
- status: `unchanged` / `numbering-only` / `text-changed`;
- rows matched (exact / merged / by text), id-less rows, removed rows, text changes (with samples), added blocks;
- `pn` set / same / changed (samples, e.g. `Arabic 1 → a1`) / new / cleared;
- citable rows, rows withheld for content collisions (the withheld numbers are listed), inherited unit numbers, rows that are not citable by kind;
- `para_N` shifts, roman → Arabic conversions, numbered invocations;
- enrichment on rows that would change.

**Overall, it reports:**
- new English books (publish-checked), with junk and non-English books listed separately;
- held books not in the export, each live-checked.

A local check on 30 production books found every paragraph matched by id in place. The few text changes were `<br>` artefacts, now ignored.

## 5. Order of operations and rollback

| step | what | rollback |
|---|---|---|
| 0 | Pause OL tick; snapshot `-sites/oceanlibrary.com` to `source-backups-20261023/` | restore folder |
| 1 | Dry run, then review | — |
| 2 | `ol-refresh` on the 418 identical books (block_attrs only), Bahá'í first | the job writes the prior `block_attrs` and `external_para_id` per row to `/tank/sifter/ol-refresh/rollback-<date>.jsonl`; a `rollback` param replays it |
| 3 | `ol-refresh` on the 123 changed books | same jsonl, plus prior text; inserted ids are listed for deletion |
| 4 | Ingest the 75 new books (Bahá'í, then scripture, then the rest) | soft-delete by doc id |
| 5 | Retire the 4 superseded books after review; send OL the defect list (Aqdas ¶1/2, Lights of Guidance, duplicates, typos, missing books, test books) | clear `duplicate_of` |
| 6 | Unpause the tick; confirm the next tick reports 0 re-ingests for OL | re-pause |

## 6. Re-indexing, enrichment and cost

| work | volume | cost | time |
|---|---|---|---|
| `pn` in place (identical books) | ~380k rows, ~800 writer batches | $0 | <1 h paced |
| Changed paragraphs: re-embed, phrase, keyword, HyPE | ~600 rows | <$1 | minutes |
| New books: embeddings (3-large @512) | 72k ¶, ~6.4M tokens | **~$0.85** | ~1 h |
| New books: phrase index and keyword fill | 72k ¶ | embedding cost of the same order (~$1–3); keyword free | hours (indexer lane) |
| New books: authorship window (Bahá'í only) | 18k ¶ | ~$0.65 (840 Jev tokens/¶) | <1 h |
| New books: pipeline (disambiguate → HyPE ∥ extract) | 72k ¶ (Bahá'í 18k first) | **estimate $20–40** for all; measure on 2 books with the spend meter first | days, queue-paced |
| fa/ar books (19): sentence markers | ~5k ¶ | deferred (the LMSTUDIO host is down); they already carry paragraph ids | — |
| Images to R2 | ~1,500 blocks, ~2.3 GB | ~free | <1 h |
| Edge cache | reader pages | stale then revalidate; no purge needed | ~5 min |

**Nothing needs re-running for the 541 matched books:** HyPE, authorship, links, claims, mentions, phrase points and
alignment all stay on unchanged row ids.

## 7. Validation
- Every live OL doc keeps its doc id and slug, and the row count changes only by the reviewed adds and removes.
- Spot links resolve to the right paragraph:
  - `Íqán #72`, `Aqdas #1` (after the decision below), `Gleanings #125.3`, `SAQ #p.3`, `SAQ #11.4`;
  - `Hidden Words #a1` and `#p82`, `Genesis #1:1`, `Psalms #55:21`, `Rodwell Sura XIII #13:2`, `Suttanipāta #1149`.
- `content_source_links`, `concept_claims`, `entity_mentions_v2` and `content_alignment` show 0 dangling ids for OL
  docs, checked with an ops report before and after.
- Coverage ledger `refs` layer: with_pn rises from about 1% to ≥95% of rows in A and B books.
- Next watcher tick: 0 OL re-ingests. The Qdrant `concepts` collection has no points for retired rows.
- Anís and SourceHunt cite "Author, Book #id" in 20 sampled answers. The links open OL at the right paragraph.

## 8. Decisions (Chad 10-23)
1. **Numbering:** OL's numbering wins everywhere, as Arabic numerals; front and back matter keep OL's prefixes. Local schemes are replaced.
2. **Aqdas:** do not auto-correct; flag it in the dry run. (The coordinator is explaining it to Chad.)
3. **Duplicates:** books import normally; only the duplicated numbers lose `#` references, listed per book. Source, signature and header lines are never citable.
4. **Unnumbered blocks:** the body under a Hidden Word cites as that Hidden Word's number; invocations get no number.
5. **Pause:** the per-site `sites.yaml` flag is built and OceanLibrary is paused.
6. **New books:** English only for now.
7. **Missing books:** the 19 move to the supplemental library and lose their OL link; they are not deleted. *Open:* the live-site evidence in §3.4.
8. **Budget:** $25–45 is approved and recorded in `data/approved-spend.json`.

**Still waiting on Chad:**
- the dry-run approval;
- the Aqdas decision;
- whether the 19 move while their pages are still live on OceanLibrary.
