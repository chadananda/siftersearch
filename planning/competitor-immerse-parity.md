# Competitor parity — Immerse (bahaiwritings.app)

**Requested:** Chad, 2026-10-09 — "periodically monitor that site to make sure we have feature and content parity and exceed it".
**Last reviewed:** 2026-10-09 (their changelog read through Oct 9, 2026). **Review cadence:** weekly.

## How we monitor (and what we don't do)
- Their `robots.txt` disallows all automated access; their data endpoints (`/api/changelog`, `/api/works`, `/api/stats`,
  `/api/features`) return 403 without a signed-in user, and even the sitemap is forbidden to non-browsers. So: **no scraper,
  and never with Chad's login.**
- **Weekly review in Chad's own browser** (he has an account): read *What's New* (`#changelog`) from the last-reviewed
  date, and *Library → Library statistics* (`#stats`). Record new features and content below, update the gap table,
  turn real gaps into backlog items, move "Last reviewed".
- Ask Claude "review Immerse" in any session: open the changelog in Chad's browser, diff against the date above.

## Content (2026-10-09)
| | Immerse | SifterSearch |
|---|---|---|
| Works | 5,303 (Bahá'í only) | 114,245 documents, 12 traditions; **57,884 Bahá'í** (incl. Persian/Arabic originals) |
| Words / paragraphs | 56.0M words | 6.49M paragraphs (word count: compute for the Bahá'í portion) |
| Their mix | Individual Authors 43.0%, Historical Records 24.8%, Provisional Translations 10.6%, Shoghi Effendi 4.2%, UHJ 3.7%, Compilations 2.7%, Bahá'í Studies 2.5%, NSA US 1.7%, Ruhi 1.6%, ‘Abdu’l-Bahá 1.6%, Bahá'u'lláh 1.1% | — |

**Content items to verify we hold (from their changelog):** Star of the West vols 1–25 · The Bahá'í World vols 1–34 ·
Journal of Bahá'í Studies · Ruhi books / units · ~600 recorded talks · Bahá'í songs · films · Feast programmes ·
provisional translations (we hold Phelps' renderings — labelled) · NSA documents (US, Canada, NZ, British Isles) ·
ITC and BIC statements · "651 new works" (Oct 1) — which?

## Feature inventory → our status
Legend: ✅ we have it · ◐ partial · ⬜ missing · 📋 in our backlog.

| Their feature (first seen) | Ours |
|---|---|
| AI search / answers with sources, multi-turn (Mar–Apr) | ✅ Anís (web + email), Jev-planned search |
| Quote provenance, cross-source quote links (May 9) | ✅ SourceHunt + link API (originals, Phelps inventory) — **ahead** |
| Phrase anchoring, self-correcting search, smarter retrieval | ✅ phrase index, type battery |
| Authoritative-only filter, sources filter, scholar mode | ◐ authority ranking; no explicit toggle in UI |
| Quotes-only view (Jun 20) / Smart Copy (May 18) | ⬜ |
| Exact source highlights (Oct 7) | ✅ OceanLibrary **range links** (Oct 9) |
| Figure context, name linkification, encounters tab, maps (Mar–Apr) | ◐ entity graph + who-met-whom (API); no maps / UI tab |
| Provisional translations (May 25) | ◐ Phelps renderings held (public domain), not surfaced as a class |
| Study guides (Hidden Words, Gleanings, Priceless Pearl, Ruhi, Íqán themes) | 📋 backlog-anis-study-guides |
| Quizzes (Mar 17) | ⬜ |
| Daily Reading (Sep 23), reading position / continue (Oct 8–9), reader scrubber, move by section | 📋 backlog-anis-reading-plan (◐ our reader has paragraphs, no position memory) |
| Audiobook playback, TTS pronunciation (Mar 18–19) | 📋 backlog-anis-voice (OceanLibrary narration) |
| Compilations: gather, board view, sections, drag, export Word/PDF/MD/JSON, present (Jul–Sep) | ⬜ **biggest gap** |
| Sharing: specific people, link, feed, shared-with-me, recently viewed, pin posts (Apr–Oct) | ◐ threads + published conversations; no per-person sharing / feed |
| Saved / recent searches, search titles, pin chats | ◐ threads drawer |
| Upload your own documents, private sources, Google Drive (Apr–Jun) | ⬜ |
| Bring your own API key, search credits (Apr) | ◐ API keys + metered billing exist (for developers, not end users) |
| PWA / add to home screen (Sep 4) | 📋 backlog-anis-app |
| Dark mode, font size, product tour, profile activity calendar, Badí' calendar | ◐ theme exists; others ⬜ |
| Library folders, layers, page references, mini search while reading (Jun–Oct) | ◐ library tree; page refs via `<pb>` markers (new) |
| Personalized search suggestions (Jun 21) | ⬜ |
| Visual schematics / interactive artifacts in answers (Jul 5–6) | ◐ charts/tables in Anís mail + chat |

## Where we are clearly ahead (keep it that way)
Interfaith corpus (12 traditions) · originals in Persian/Arabic with alignment and CTAI concordance · SourceHunt finds the
original Tablet behind a translation · paragraph-level speaker/quote attribution · range links into OceanLibrary · Anís by
email · entity graph with who-met-whom · public API for third parties.

## Chad's observations
- **2026-10-09: "They seem much better at extracting stories or narratives or concepts."** Their Encounters tab, figure
  context, study guides and themed answers draw on narrative units: episodes, stories, concept threads. Ours sits at the
  paragraph and entity level. The episode model, who-met-whom and concept claims exist, but there is no *story* unit
  people can browse or search. Concept extraction comes after the Qdrant switchover (order of 10-04). A narrative/episode
  layer (Dawn-Breakers chapter › episode headings are now stored as `block_attrs.path`) belongs in that same pass.
- **2026-10-09: talks.** "I legitimately want to be careful about secondary materials, but we need to provide youtube
  talks for sure." They have ~600 recorded talks. See `backlog-youtube-talks-20261009.md`.

- **2026-10-09: figure pages.** "They are clearly extracting enough facts to build a summary page with timeline of every
  character" (`/study/_cross-references?fig=tahirih#figures/tahirih`).
  - **Theirs:** about 1,000 figures sorted into curated groups (Letters of the Living, Hands, Martyrs, Enemies,
    Government…). Each has a one-paragraph summary, a dated timeline of about 15 events written as narrative with
    pull-quotes, typed relationships (family, teacher/student, guardian, companion, adversary) shown as a list and a
    graph, aliases with their meanings, map and journeys, and "appears in".
  - **Their sources:** about 6 study-guide books (Dawn-Breakers, GPB, Revelation of Bahá'u'lláh 1–3, Mahmúd's Diary),
    cited by book only, never by passage.
  - **Their flaws:** duplicate figures (Zia Bagdádí / Zia Baghdadi; Jahrumí listed twice), many figures with 0 mentions,
    and conflicting events (Badasht dated both "1848 Jun" and "1848 Jul"; the martyrdom appears twice).
  - **Ours (Ṭáhirih, id 1247554, `/api/graph/bio/person/:id`):** 576 dossier persons. Ṭáhirih has 1,522 mentions,
    141 books, 91 aliases, a summary, kinship, a GPB reading path with range links, and **3,522 characterizations with
    proof quotes, 2,476 of them dated, drawn from 127 sources**.
  - **What we lack:** we have far more raw material, cited at the passage level, but no *synthesis*. `dates` is empty,
    there are only 2 typed relations, and we have no curated life timeline, no grouping into categories, and no map or
    journeys.
  - **Proposed (not started):** per-person life-timeline synthesis. Cluster the dated facts by event. Prefer stated
    dates over estimates and authoritative sources (GPB, Dawn-Breakers) over secondary ones. Make one LLM call per
    person to write 10–25 events, each citing every supporting passage with range links and flagging conflicts rather
    than duplicating events. Type relationships from kinship plus met / companion / adversary facts, and draw journeys
    from visited / imprisoned places.

## Top gaps to consider (ranked by user value)
0. **Recorded talks (YouTube)** — Chad: a must. Curated, labelled as secondary.
1. **Compilation builder** (gather quotes while searching → arrange → export Word/PDF/Markdown) — their most-developed
   feature; pairs naturally with SourceHunt and range links.
2. **Reading & study loop** — daily reading, position memory, study guides, audio (all already in our backlog).
3. **Sharing** — share an answer/compilation with specific people; a feed of shared research.
4. **Bring your own sources** — upload documents / Drive, searched privately beside the library.
5. **Figure life pages** (timeline, typed relationships, journeys) built from our existing dated facts — see observations.
6. **Stories / narratives / concepts as browsable units** (episodes, story threads, concept pages) — see observations.
7. Quotes-only view, smart copy (quote + citation), quizzes.
