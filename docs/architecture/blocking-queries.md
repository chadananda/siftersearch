# Blocking queries — the standing rule (Chad 10-17: "every time there is a blocking query, come up with a strategy to make sure it never happens again")

better-sqlite3 is synchronous: a slow statement on a serving process's MAIN thread freezes every request it serves
(health fails → [PAGE] → watchdog/pm2 restarts → "restart storm"). One such query cost 9½ minutes on 10-17.

## For EVERY blocking query in the system-checks email
1. **Find the exact statement** — `slow-queries` ops report (`POST /api/admin/ops/reports/slow-queries {hours, minMs}`); the
   `name` tag says which repo function.
2. **Fix the shape, not the symptom** — EXPLAIN it; the usual causes: a per-row correlated subquery (re-running a search
   per row), an unbounded scan (no index for the WHERE), user text turned into a query that matches everything.
3. **Prove it with a test that fails on the old code** — a structural assertion (the SQL's shape) plus, where it can be
   made realistic, a timing test at library scale. Run it against the old code once to see it fail.
4. **Move heavy work off the event loop** — anything that can be slow by nature (search over user text, whole-book
   comparisons, roadmaps) runs in a worker thread with its own read connection and a hard time limit
   (`progress-worker.js`, `dewey/holdings-worker.js`). Scheduled scans are ops reports, never request-path work.
5. **Classify honestly** — worker-thread rows are tagged `<proc>/thread` (db.js) and reported as info; only main-thread
   reads in serving processes and slow writes anywhere count as blocking.

## Log
| date | statement | cause | fix | guard |
|---|---|---|---|---|
| 10-17 | `docs-repo:find` 573 s (API) | ORDER BY re-ran the FTS MATCH per row; Dewey passed a long first line → prefix terms like "the"* matching everything | MATCH once in a ranked, bounded join; stopwords/1–2-letter prefixes dropped, ≤ 8 terms; Dewey's check off-thread with a 120 s limit | tests/api/docs-find.test.js (structural + 20k-doc timing; old code > 10 min, new 87 ms) |
| 10-17 | roadmap reads 6 s ("api") | already off-thread (progress-worker) but logged as main-thread | tag worker-thread rows `/thread`; not counted as blocking | system-checks BATCH filter |
| 10-19 | entity claim search `WITH c AS MATERIALIZED (… entity_claims …)` 10–13 s, ~200×/day in api + anis | every person search (chat `entity_search`, people/search, every entity dossier) scanned and accent-folded the whole claims table on the serving thread | claims held folded in memory on ONE long-lived worker thread (`claim-search.js` / `claim-search-worker.js`, own read connection, 30 min refresh); a query is a JS scan there | tests/api/claim-search-off-thread.test.js (entitySearch issues no claims SQL; fails on old code) |
| 10-19 | HyPE sidecar sync `SELECT … FROM content INDEXED BY idx_content_hype_to_sync JOIN docs … LIMIT 100` 24 s on the WRITER | rows of deleted documents and empty question lists were skipped but never marked synced, so every batch re-read them first; the writer's /health went silent and the watchdog restarted it 4× in a day | mark every never-indexed row synced (doc_deleted selected, not filtered); v14 question objects parsed | tests/api/hype-sync-marks.test.js |
| 10-19 | `deep-research-runner.mjs --status` graph_enriched COUNT 26–83 s | an 8-day-old CLI process never exited (imported refresh timers) and kept running 10-11-era scans | runner exits after main(); orphan killed | tests/api/monitor-scans.test.js |
| 10-19 | monitors: pipeline-snapshot (5 min), system-checks (30 min), stall-guard (1 h) whole-table scans | kept the 57 GB DB out of the 32–37 GB ZFS ARC → search hydration 0.2–1 s per batch, searches 5–15 s | slow-probe cache (≤1/h), content scans daily-only, MAX(rowid) | tests/api/monitor-scans.test.js |
| 10-20 | writer: `siftersearch-concepts` batches of 29,148 statements (1.5–3 s) repeatedly, then 8–15 s stalls | each concept run's promote stage rebuilt concept_entities whole (DELETE all + ~29k INSERT) in one transaction | diff by (canonical, tradition), ≤500 per transaction | tests/rag/concept-entities-diff.test.js |
| 10-20 | bio.js citation labels `content WHERE external_para_id IN (…)` 7 s (api) | index is (doc_id, external_para_id); filter lacked doc_id | query per document | tests/api/monitor-scans.test.js |
