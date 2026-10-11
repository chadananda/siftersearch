# Worklist — order of operations

Kept current by Claude (Chad 10-11: "keep a checklist of tasks … so we do not forget anything and I can see the order of
operations coming"). `[x]` done · `[~]` running · `[ ]` queued. Top = now; bottom = later.

## Now (10-11)
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
- [x] Hollow check: 0 hollow books corpus-wide, 1 empty row (doc 14779); `scripts/ops/hollow-report.mjs`: unembedded + `synced=0` live rows draining (incl. the 14 Islamic works)
- [ ] Confirm the 72,751 new Arabic ¶ are in Qdrant (per-book check)
- [ ] Verify reader visually: Genesis (dividers), Douay (headings), Qur'an (Surah headings, pn)

## Next
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

## Waiting on Chad
- [ ] Strata launch plan; Laya pilot location (tower CPU vs boss GPU)
