# Worklist — order of operations

## STATUS 10-12 12:55 — running on tower (watched: background stall-check every 20 min)
- reingest-carry: 1,155 / 1,806 books (run 46 of 35–53), ~115 books/h → done ≈ 19:00
- ingest-files: batch 15 (the Arabic fiqh tail: Radd al-Muhtar 171,927 ¶, Jawahir 126k ¶ — hours each), 16–24 queued after
- phrase-index 54 (supplemental, $90 cap) running 12.5 h; ITS PROGRESS IS INVISIBLE (job swallows the indexer's phase lines;
  Qdrant phrases flat 27.85M — walking already-embedded rows?). Fix: log the phase lines (needs reports-worker restart → wait)
- Grounding plan queue woke with the 09:53 deploy: 16 complete-book.mjs at once, DeepSeek ~$2.5/h (~$60/day) — ASK CHAD
- DB WAL 10.5 GB but not growing (checkpoints OK; file not truncated)
- Deploys: updater now resets + retries an aborted deploy (11:03/11:08 slow smoke → 11:13 deployed)

Kept current by Claude (Chad 10-11: "keep a checklist of tasks … so we do not forget anything and I can see the order of
operations coming"). `[x]` done · `[~]` running · `[ ]` queued. Top = now; bottom = later.

## ▶ NEXT BUILD — Anís READING GUIDE ("notes" strategy, Chad 10-12) — proof of concept: The Dawn-Breakers (doc 21308)
- Trigger: mail "help me study <book>" / "read <book> with me" → Anís resolves the book, shows its layout, ASKS where to start
  (Introduction by **George Townshend** — recommend for a first read · Nabíl's narrative ch. 1 · any chapter/event). DONE: intro ¶6–46 credited to Townshend, ¶20 Curzon.
- Each email ≈ one page in whole ¶s, numbered ¶N (guessed OceanLibrary numbering, marked as a guess); notes AFTER EACH ¶.
- Notes: persons (script, literal meaning of each name part, titles + who gave them, compact timeline incl. FATES — spoilers OK,
  relations, other library mentions), places (modern name, 1840s, why here), tablets (title meaning, when/whom, range link),
  terms; Hijri↔Gregorian dates; "How Nabíl knew this" (informant chain); "In the Writings" (quotes, range links); one "Look closer"; teaser line.
- COMPACT + speakable: later audio = OceanLibrary reading voice for ¶ + ElevenLabs voice for notes; may pause mid-¶ at strategic points.
- State per reader+book: position, ¶s read, entities already explained (never repeat facts within a book; one-line "met in ¶14").
- REPLIES (Chad 10-12): "continue"/"next" (or an empty-ish reply) = next page · "again"/"try again" = the research was NOT
  deep enough → redo the same page with a deeper pass (more sources, web layer, longer timelines) · anything else = a question,
  answered in-thread (audited) without moving the bookmark · also back / skip to chapter N or an event / where are we?
- WEB DEPTH layer: Perplexity (api/lib/perplexity.js, key on tower) + Parallel.ai (PARALLELAI_API_KEY on tower; client to
  write) for context the library lacks — e.g. the economic/social background of a town in the 1840s, a governor's career,
  trade routes. Web findings are cited as WEB sources, kept apart from library citations (web-lead.js rule: web = lead +
  context, never dressed as library text). LIBRARY FIRST, always: the web is consulted ONLY when the library cannot answer
  (Chad 10-12) — on a first pass, on "again", or for a question.
- SUBJECT LINES (Chad 10-12): `[Reading] <Book> #<chapter>.<¶> - <what happens>` — e.g. `[Reading] Dawn-Breakers #5.7 - Bab's
  pilgrimage to Mecca`; introduction = `#Intro.6`. Sortable, scannable: the mailbox reads as the book's table of contents.
- NOTES CACHE (Chad 10-13 — AFTER the notes are dialled in): a `paragraph_notes` table — per paragraph × target × LEVEL
  (3 levels, e.g. newcomer · serious reader · scholar), with note text, cited sources, model, prompt version, created_at.
  Cache NOTES, not pages: a page is assembled per reader from cached notes minus what that reader has already been told
  (explained set) — so precaching never makes the guide repetitive. Then precache whole books (cost estimated first);
  "again" writes a deeper note and keeps both; a prompt-version bump invalidates. Same notes serve email, web, audio.
- Research per ¶: entity graph (disambiguated mentions) → /biography pages + claims → CTAI (name meanings) → gazetteer → Phelps
  (tablets to them) → library search for other passages; ONE model call writes notes from cited evidence only. Measure $/page first.

## ⛔ HIGHEST PRIORITY (Chad 10-12) — what the Anís audits identify as a useful search-strategy extension
"Whatever the audits identify as a useful extension for our search strategies is our highest priority" — and the CTAI
API (ours) may be extended for it (e.g. a "Shoghi Effendi word frequency chart" tool).
- [x] Admin Threads view: every conversation + each reply's audit (/admin/anis#threads); 30 of 61 audited replies warranted
      a better strategy (10-12)
- [ ] A. Strategy-gap report: cluster the audits' new_strategy needs / best_strategy changes / evidence causes by frequency
      (Threads page section + ops report) → the ranked work queue
- [ ] B. Term strategy (item 15 below) — the top gap seen so far (term questions never reaching the originals)
- [ ] C. CTAI endpoints the strategies need (word frequency / rendering chart over Shoghi Effendi's translations, root
      study, paired passages) — add to CTAI rather than work around
- [ ] D. Every strategy records its evidence for the auditor (term-study counts done 10-12)
- [ ] E. SourceHunt fixes from Liliane's BSW review (BH exception.xlsx, 15 items; re-run 10-12 → scratch hunt.json):
      fixed by now: #30 #57 (Íqán originals via CTAI pairing), #98 (Gleanings XCIII), range links #57 #68 #76 #89;
      #98/#122 book links → fixed 10-12 ('[93.1]' markers). STILL WRONG:
      · #44 the BSW book ITSELF (doc 921362, a PDF in Books) wins as "source" → exclude/penalise compilations of the
        quote under test; original should be Amr va Khalq 3:56 (OOL bahaullah-pub25-056-fa, she: opening chopped)
      · #86 REGRESSION: "My God, My Master, My Desire!… this atom of dust" → Hidden Words #12 by MEANING; 10-05 had the
        right Prayer at the Time of Departure from Iran (BH00951) — a meaning-only origin must not beat a verbatim one
      · #90 a bahai-library article (Savi, Hymn to Love) chosen over God Passes By, where the English is published
      · #77 source = an oceanoflights /file/…docx; original should be bahaullah-pub17-010-fa
      · #91 original should be Asrar al-Athar vol. 4 (oceanoflights asrar-ul-athar-jild-4-fa)
      · #16 #122 #136 catalog (Phelps PIN) wrong while the matched original text is right → check pin assignment per
        paragraph vs per document (compilation docs carry one pin); #136 timed out on re-run
      Then re-run all 450 BSW entries and send Liliane the corrected table.

## Now — LIBRARY CLEANUP (Chad 10-11: "get all the library cleanup tasks done so we can start concept extraction, hype and working on Anis and Dewey")
- [~] 1. Qdrant phrase layer: primary changed books (run 30, $20 cap) then supplemental scrapes COMPLETE (Chad approved 10-11,
      $90 cap) — ops index lane, overnight window 22:00–07:00
- [x] 2. Language codes: ONE normaliser (`language-codes.js`), ingest + sites-ingest normalise, 2,414 docs relabelled + re-synced (source files left: ingest normalises)
- [x] 3. Segmentation tail: 3,425 more oversized ¶ → 16,185 in 34 books, 0 verify failures, all re-ingested
- [x] 4. Sentence markers for the 7 deferred hadith books: SKIPPED on value (~$15; markers only serve translation alignment, none exist for these)
- [~] 5. ID/pn for every book: `{id="para_N" pn="M"}` written into 33,996 library files (5.66M ¶, 0.1% ambiguous skipped);
      ids job: 3.38M of 4.12M rows matched; 695k drifted rows in 13,060 books (old ingest merged/split/kept markup).
      reingest-impact: 11,250 books carry NO enrichment on drifted rows → re-ingesting (ops ingest-files, 12 batches queued 10-11);
      1,810 books carry enrichment there → `reingest-carry` (Chad 10-12: "try to carry the enrichment across"): backup →
      re-ingest (localOnly, paced) → map old→new rows by word containment → HyPE questions pooled on merges, columns,
      links (split pieces / best), mentions (v2 + graph). Pilot 4 books verified: 8,450/8,450 questions, 846/846 graph
      mentions; 1,806 queued (runs 35–53). Backups: /tank/sifter/carry-backups/
      `block-attrs` ops job copying them onto rows (no re-ingest); files with ids keep their blocks at ingest
- [x] 6. CTAI: 8 original-language docs built FROM THE ENGLISH (`Baha'i/CTAI Originals/`, 3,013 ¶ = 1 per English ¶ with a CTAI
      pair), ingested via ops `ingest-files`, linked 1:1 (`ctai-link`, basis ctai-pair, 0 unresolved); audit: aligned = live,
      no one-to-many. pn follows the English: re-run ops `ctai-originals` + `ingest-files` once the English has pn
      (Gleanings/ESW after this re-ingest; the 6 OL hosts after the ILM export)
- [x] 9. Shelves (Chad 10-12): Mormon Texts, Deuterocanonical Books, Emanuel Swedenborg close into ONE boxed card (collection
      covers; Swedenborg = first book's cover, "6 more" kept); citations unchanged. Greek-titled Gospels (20994/20995) were
      KJV John/Matthew text → marked duplicate_of 20989/20992 via new ops job `retire-duplicates` (dry run default)
- [ ] 10. WAITING on OceanLibrary: Sikh books being added there now (Chad 10-12), not in the ILM export yet. When they land:
      ingest, then box 'The Sikh Religion' + 'Sri Guru Granth Sahib' with their Bindery covers (col-sikh-religion.png not yet
      in R2 — copy it). Swedenborg = author shelf, NOT boxed (Chad 10-12)
- [x] 11. Slow-query load (Chad 10-12 "why still the hollow warning"): new ops report `slow-queries` (per hour × proc ×
      caller). Hollow = one stale 10-11 entry; real load ~100/h → fixed: roadmap cache 30 min, spend rollups 30 min, bio
      cost 1 h, retired graph_enriched count dropped; alert now leads with last-3h top offender. Re-check after 24 h.
- [ ] 12. Writer TRANSACTIONs 22–44 s during re-ingest of very large books (57/day) — chunk the ingest write per N rows
- [x] 13. Range links everywhere (Chad 10-12): OL selectionString (checked vs OL reader JS) + Ocean of Lights #(start)(end)
      from our stored copy; all producers → one output pass (JSON, SSE, SourceHunt stream, Anís). SourceHunt `translated_by`.
- [ ] 14. Translator mining as an ops job (port scripts/authorship/translators.mjs, legacy direct-DB): coverage 10-12 =
      68,794 ¶ / 760 books, but Bahá'í core thin (Shoghi Effendi 22 books; Gleanings rows have none). Add OL frontmatter
      `translated_by:` (the script reads only `translator:`), propagate along translation links + verbatim quote links,
      paced overnight. Then a curated list for the core translations (names from Chad/trusted source).
- [ ] 15. TERM search strategy (Chad 10-12: "deserves its own search strategy"; Liliane's "What is Irfan?" got 'cannot find'
      because the term path hid behind a regex in front of English search). One strategy in plannedSearch (so Anís, chat,
      API, SourceHunt all get it), chosen by the planner, not a regex:
      1 detect a word/concept question (planner shape 'term'; Latin translit, Arabic script, or an English concept word
        with a known original); 2 resolve to original spellings (ی/ي, with/without ال and prefixes);
      3 find the word in OUR originals (Core Tablets / OL Arabic / CTAI Originals; Arabic phrase+keyword layer);
      4 pair each hit with its English via content_alignment / original_text — authority order (Shoghi Effendi first);
      5 renderings chart + paired passages, OUR range links (OceanLibrary / Ocean of Lights), CTAI as extra source/fallback.
      Done 10-12 meanwhile: "what is X" triggers the CTAI path; mixed-script name repair; inbound mail unwrapped.
- [ ] 16. Liliane's question (10-12): 2 stale drafts in review (ids 28, 30) — discard; re-draft after the fixes deploy
- [x] 7. Rodwell single-volume 21343 retired → Sura I (21104); doc 14779 re-ingested, 0 empty rows corpus-wide
- [x] 8. Reader verified in a browser (Genesis: pn margin, CHAPTER 2 divider, no image row). FOUND: 2 stale API cluster workers from 10-10 were serving day-old code on :7839 (fixes seemed intermittent) — killed; updater now kills unmanaged API processes; critical path checks for strays
- [x] Deploy hygiene: legacy SQL migration runner retired (failed every deploy since 10-10); writer-restart false [ACTION] fixed

- [x] HARD RULE tightened: scripts + agents never touch production data → internal ops API (`scripts/ops/ops.mjs`,
      `/api/admin/ops/reports`), health scans = reports run by `siftersearch-reports`; 195 scripts frozen (shrink-only)
- [ ] Move the running/legacy data tools behind the API, biggest first: phrase indexer, segment-paragraphs, library-fixes,
      sites-ingest, reingest-document (each → a server-side job + endpoint; script becomes a client)

## Then — the real value
- [ ] Concept extraction · HyPE · Anís · Dewey

## Done 10-11
- [x] Paragraph segmentation — 180 Arabic books split (9,682 → 72,751 ¶, $8.36), all re-ingested, 0 failures
- [x] Held-9 hollow Arabic books ingested (`sentence_markers: defer`)
- [x] LM Studio retired — segmentation = Haiku 5.5 in every language; dead-host breaker
- [x] Verse `pn`: KJV, Tanakh, Rodwell, Greek Gospels, both Arabic Qur'ans, Douay-Rheims (book names in pn + headings)
- [x] Reader: margin shows pn; soft-deleted rows hidden; image placeholders removed (915 rows)
- [x] Reader: chapter dividers where pn changes chapter; heading rows render as headings
- [x] DB hard rule: repo-only access ratchet (299 legacy files frozen); writer default on tower; `db_write_stats`
- [x] deep-research → `api/lib/repos/deep-research-repo.js` (34 named functions; legacy list 299 → 296)
- [x] Tower follow-up chain (`/tank/sifter/followups-20261011.sh`):
  - [x] 1. re-placed 115 more ¶ (→ 669) in 93 books, re-ingested; 164 left for the re-plan
  - [x] 2. bahai-library: 3 failed files re-ingested, 0 errors
  - [x] 3. bahai-library: 244 secondary duplicates retired (1,324 candidates were already retired)
- [x] Index caught up (20:10 UTC: 714 awaiting embeddings, 6 awaiting sync; Qdrant 7 collections green)
- [x] Content-drop alarm explained (10-10 approved bahai-library junk retirement, 302k ¶) + rebased; `scripts/ops/deletions-report.mjs`
- [x] Hollow check: 0 hollow books corpus-wide, 1 empty row (doc 14779); `scripts/ops/hollow-report.mjs`

## Parked until cleanup is done
- [x] Model roles: ONE table `api/lib/model-roles.js` + `modelFor(role)`; monthly review (`siftersearch-model-review`, 1st 08:00, [ACTION] email); literal-model ratchet (34 files frozen)
- [~] Model bake-off (in SifterSearch, no Claude Code needed): scoring + blind judge + multilingual scenarios DONE;
      next: runner (cost estimate + cap) → results in DB → monthly new-model detection (provider model-list APIs) →
      role assignments in DB (switch without deploy) → /model-refresh skill as a shortcut
- [ ] Registry: current flash tier verified 10-11 ✅; anisCraft reaches Anthropic via OpenAI-compat endpoint, bypassing the spend policy — close
- [ ] Re-measure flagged roles vs Haiku 5.5 (anis-answer, anis-term, deep-research ×2, bio, jafar ×2, publish ×2) — small eval each, $ estimate first; a switch to Haiku also needs an anthropic-policy stage entry
- [ ] deep-research as a SEARCH STRATEGY over `plannedSearch` (HyPE, entities, phrase index, concepts, Qdrant) — today it
      calls legacy Meili `hybridSearch` 6×; keep its LLM steps, swap retrieval; also unblocks Meili retirement
- [ ] Segmentation tail: re-plan the 143 rows replaced during re-ingest (small Haiku batch)
- [ ] Sentence markers for the 7 `sentence_markers: defer` books (Haiku batch, half price) — estimate $ first
- [ ] Restart remaining pm2 apps so every writer reports its caller in `db_write_stats`
- [ ] DB repos phase D1: remaining workers (embedding, graph-*, sync) → repos
- [ ] Read observability: per-repo-function tags + call/latency counters
- [ ] ID/pn mechanism for all books: `scripts/library/assign-block-ids.mjs` (OL-compatible attrs; `--align-to` English for CTAI)
- [ ] CTAI audit: originals paragraphed from the English, aligned, matching pn, DB links both ways

## Later
- [ ] DB repos phases D2–D5 (services → routes → lib → scripts; delete dead one-offs)
- [ ] HyPE + concept extraction ("the real value") — after the above
- [ ] Yusuf Ali Qur'an pn — waits for ILM re-export
- [ ] Rodwell single-volume (21343) — probable duplicate, check + retire

## Waiting
- [ ] Strata — waits until xswarm moves to another worker (Chad 10-11)
- [ ] Laya pilot location (tower CPU vs boss GPU)
