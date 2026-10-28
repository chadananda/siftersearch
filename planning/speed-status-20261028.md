# Speed and wear status, 2026-10-28

## Done (all pushed, deployed, persistent)
| Change | Where | Result |
|---|---|---|
| Logical bytes per caller x name | `write-server.js`, `write-stats.js`, `db_write_stats.bytes`, `:7849/stats`, `/latency` io, `write-stats` report (`top_bytes`) | attribution live |
| Unnamed batches labelled by first statement | `write-stats.js` `unnamedLabel` | `unnamed:UPDATE docs` etc. |
| Watcher path-flip bug: same-hash second file (`-dewey661`) treated as a move | `ingester.js` | was 99% of writer bytes (2.1 GB / 30 min) |
| Same-shelf rename no longer dirties paragraphs; no-op UPDATE of reused paragraphs skipped | `ingester.js` | fewer row rewrites |
| `getIndexingStatus` null Meili crash-loop (1262 restarts) | `indexer.js` | watcher stable |
| RAM defer lane (coverage:touch, activity:log held 30 s) | `write-server.js` `createDeferLane`, worker `/power/flush` + SIGTERM | verified by forced UPS enter/resume |
| Group commit 25 ms, checkpoint 300 s, defer 30 s | `ecosystem.config.cjs` (worker env) | persistent |
| `pendingRuns` uses status index | `ops-report-repo.js` | was 14 s worst scan |
| ZFS `recordsize` 16K -> 8K on `fast/siftersearch-db` | live property (persists in the pool) | rollback: `zfs set recordsize=16K fast/siftersearch-db` (only new blocks change) |

UPS forced test: `enter` 92 s (defer lane flushed, qram flush, zpool sync, db-ship), `resume` 0.8 s, services online, healthz 200.

## Measured
| | before | after |
|---|---|---|
| EVO TB/day (30 min windows) | 0.221 (baseline 0.315) | 0.40 under the Core Tablets re-ingest bulk; writer alone about 0.012 TB/day logical without bulk |
| Writer logical TB/day | 0.108 (99% watcher bug) | 0.13-0.17 (new inserts of the bulk ingest) |
| Writer batch p95 / busy | n/a | 9-11 ms / 1-7% |
| ARC hit | 95.65% | 95.66% |
| Search `/api/search/quick` uncached p50 / p95 | 1.7 s / 3.8 s | 2.6 s / 6-9 s (worse: box out of memory) |

## Search latency root cause (not fixed)
Stages: query embedding 0.2-1 s; Qdrant phrase layer first touch 0.5-1.4 s (warm 0.11 s); keyword layer 0.03-0.14 s; merge + SQLite hydrate of about 500 rows 0.3-1.1 s.
Cold because of memory exhaustion: `qdrant-main` f16 build holds 75 GB anon at about 1200% CPU, zram swap full (8/8 GB), 1.2 GB free, ARC shrank 72 -> 26 GB, disk reads 400-500 MB/s, load 25-42. CPUWeight/MemoryLow on `qdrant-next` had no effect (reverted). Memory budget is owned by another agent (a191d42d087a604a6).

## Remains
- Finish or cap the f16 build, then re-run the search battery; expect about 0.1-0.3 s warm.
- Re-measure EVO TB/day in a quiet window after the Core Tablets re-ingest ends (target <= 0.15).
- Device writes run about 2.3x the writer's logical bytes; cause unknown (4K pages into 16K/8K records is the lead; recordsize 8K only affects new blocks).
- Not done: query-embedding precompute, parallelising hydration, indexer paragraphs/min (last measured 56,656/h on 10-07, embedding-API bound; phrase backlog is zero now).
- Pre-existing failure: `tests/api/ops-reports.test.js` (names list), not from these changes.
