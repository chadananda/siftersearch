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
- [ ] P1 data: migr 132 (inventory_items.raw, docs.frontmatter, tablet_meta, bib_codes); inventory import stores the raw
      row; ingester keeps full frontmatter; backfill endpoint reads files server-side; pure merge api/lib/tablet-meta.js
      (tests: date parse, code expansion, precedence); rebuild endpoint → tablet_meta; bibliography → bib_codes.
- [ ] P1b notes: mark notes docs as scholarship (not Writings), link each to its tablet (bookid stem), drop them from the
      translation queue; link the 46 attached English translations (never retranslate).
- [ ] P2 display: GET /api/v1/documents/:id/about; DocumentPresentation collapsible "About this tablet" (circumstance,
      manuscripts/publications/translations, subjects, audio, notes, links to OOL + Phelps).
- [ ] P3 search: Meili doc fields (recipient, place, period, year, genre, subjects, pin) filterable; planner uses them.
- [ ] P4 HyPE + disambiguation: tablet context header (recipient, date, place, subjects, notes excerpt) in stage prompts;
      version bump so it re-runs.
