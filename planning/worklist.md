# Worklist — order of operations

Kept current by Claude (Chad 10-11: "keep a checklist of tasks … so we do not forget anything and I can see the order of
operations coming"). `[x]` done · `[~]` running · `[ ]` queued. Top = now; bottom = later.

## Now — LIBRARY CLEANUP (Chad 10-11: "get all the library cleanup tasks done so we can start concept extraction, hype and working on Anis and Dewey")
- [~] 1. Qdrant phrase layer: coverage report (ops API) — primary library missing ~214k ¶ (~$11, run in progress, $20 cap);
      supplemental scrapes missing 0.55–1.4M ¶ (~$30–73) — AWAITING Chad's go-ahead
- [x] 2. Language codes: ONE normaliser (`language-codes.js`), ingest + sites-ingest normalise, 2,414 docs relabelled + re-synced (source files left: ingest normalises)
- [x] 3. Segmentation tail: 3,425 more oversized ¶ → 16,185 in 34 books, 0 verify failures, all re-ingested
- [x] 4. Sentence markers for the 7 deferred hadith books: SKIPPED on value (~$15; markers only serve translation alignment, none exist for these)
- [~] 5. ID/pn for every book: `{id="para_N" pn="M"}` written into 33,996 library files (5.66M ¶, 0.1% ambiguous skipped);
      `block-attrs` ops job copying them onto rows (no re-ingest); files with ids keep their blocks at ingest
- [ ] 6. CTAI audit: originals paragraphed FROM THE ENGLISH, aligned, matching pn, DB links both ways
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
