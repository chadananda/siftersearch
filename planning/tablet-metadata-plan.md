# Tablet metadata — collect, merge, expose (Chad, 2026-09-29)
"The powerful thing about tablets from Phelps and OOL is the metadata … collapsible intro box … search … HyPE …
disambiguation." + "Oceanoflights often has an attached 'notes' PDF in Farsi with some scholarship."

## Sources (measured 2026-09-29)
- Phelps PI v6.01 CSV (29,028): recipient 78%, date 74% (`1265-09-01 [1849-Jul-21]`), place 46%, period 100% (codes like
  `G-'Akka2`), manuscripts 49%, publications 53%, translations 30% (codes), volume_title 100%, first lines, notes 3%,
  abstracts 0.5%, musical 1.4%, extract 4%, authorized 6%. inventory_items keeps only part (no manuscripts, publications,
  notes, abstracts, musical, volume_title, extract, authorized).
- PI bibliography.txt: 844 source codes (two-column pdf text) → citation + url.
- OOL frontmatter (5,442): description 100% (generated), subjects 95%, genre 95%, addressee 30%, title_alternates 30%,
  citations 19%, prayer_occasion 21%, known_names 14%, period_id 16%, place 8%, date 5%; titles mostly generated
  (564 established). Attachments: 1,106 audio · 145 notes PDFs · 46 English translations. NONE of it is in the DB except
  bookid/pin.
- OOL notes: 12 notes docs sit in Core Tablets under the Central Figures (128 queue units, 73k chars queued for
  translation as scripture); 205 notes/sources docs kept from the site2rag scrape.
- Precedence: circumstance + textual history → Phelps; content + media → OOL; every field keeps its source.

## Phases
- [x] P1 data (DONE 2026-09-29, v2.187.309–311): migr 132 live; 29,028 PI raw rows, 478 bib codes (99.4% refs cited),
      frontmatter for 24,117 Core Tablets docs, tablet_meta built for 24,117 (22,804 with PIN); GET /api/documents/:id/about live.
      Re-run if interrupted: POST /api/admin/tablets/bib (planning/merge-review/pi/bib.json) then /tablets/rebuild {dir:"Baha'i/Core Tablets"}.
      Check doc 936038 date = 1913-04-23 (the bare-Gregorian fix).
  (was) P1 data: migr 132 (inventory_items.raw, docs.frontmatter, tablet_meta, bib_codes); inventory import stores the raw
      row; ingester keeps full frontmatter; backfill endpoint reads files server-side; pure merge api/lib/tablet-meta.js
      (tests: date parse, code expansion, precedence); rebuild endpoint → tablet_meta; bibliography → bib_codes.
- [x] P1b notes (DONE, migr 133, v2.187.312): 125 of 217 notes docs linked to their tablet (127 links; tablet_notes),
      doc_role 'notes', author 'oceanoflights (notes)', excluded from the translation queue. 92 unmatched
      (planning/merge-review/notes-unmatched.json) → next: match by the incipit the notes quote (مطلع لوح). Notes have
      labelled Persian lines (عنوان لوح / مطلع لوح / محل نزول) → extract later as DERIVED fields. 46 attached translations: TODO link.
  (was) P1b notes: mark notes docs as scholarship (not Writings), link each to its tablet (bookid stem), drop them from the
      translation queue; link the 46 attached English translations (never retranslate).
- [x] P2 display (DONE, verified in browser): TabletAbout.svelte in DocumentPresentation + DocumentViewer; LTR on RTL pages,
      short citations. Also fixed: view?doc reader showed ⁅sN⁆ markers.
  (was) P2 display: GET /api/v1/documents/:id/about; DocumentPresentation collapsible "About this tablet" (circumstance,
      manuscripts/publications/translations, subjects, audio, notes, links to OOL + Phelps).
- [ ] P3 search — NEEDS CHAD (timing): add tablet fields in unified-worker paragraph sync (per-doc tablet_meta lookup) +
      paragraphSettings (searchable 'tablet_about'; filterable place/period/genre/year_from/year_to/pin). Settings change →
      Meili re-indexes EVERY paragraph (hours, slower search); then synced=0 for Core Tablets (~166k).
  (was) P3 search: Meili doc fields (recipient, place, period, year, genre, subjects, pin) filterable; planner uses them.
- [ ] P4 — NEEDS CHAD (spend): tabletContextLine() into HyPE + disambiguation prompts; version bump = re-run over tablets.
  (was) P4 HyPE + disambiguation: tablet context header (recipient, date, place, subjects, notes excerpt) in stage prompts;
      version bump so it re-runs.

## 2026-09-29 evening — generalised to DOCUMENT metadata (Chad: "flexible document metadata … separately indexed")
- [x] doc_meta (migr 134–137): one sourced record for 114,078 docs (24,092 tablets), context line, facets, authority.
      Index = SQLite FTS5 doc_meta_fts, NOT Meilisearch (Meili queue ~65k tasks at ~1.5/min; paragraph-index settings
      changes = week-long re-index — never). Search: exact title → phrase → every word → any word, bm25 × authority.
- [x] GET /api/documents/meta/search · GET /api/documents/:id/about (reader box) · lib/doc-meta-store.js
- [x] chat tools: document_info, find_documents_by_metadata (api/routes/chat.js)
- [x] disambiguation + HyPE prompts: "Catalogue: <context>" via rag-adapter getDocMeta — new runs only (no version bump).
- [x] rebuild: POST /api/admin/docmeta/rebuild {dir} — 200-doc pages + pause (123 s for the library; /health ~10 ms).
      A 2,000-doc/one-pass rebuild blocked the API (health 7–18 s / timeouts) — don't.
- [ ] keep doc_meta fresh: rebuild a doc after ingest (hook into ingest-file / reindex).
- [ ] planner: use doc_meta to narrow raw search (doc_id filter) for circumstance queries (chat tool covers chat now).
- [ ] notes: 92 unmatched (match by incipit); link the 46 attached OOL English translations; notes' labelled lines → derived fields.
