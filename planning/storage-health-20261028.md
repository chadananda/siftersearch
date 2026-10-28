# Storage health and indexing, 2026-10-28

## Big picture (plain language)

- **Indexing is finished, not slow.** The phrase index covers every paragraph (ledger: generated = total in every scope). What arrives now is a trickle: one media talk at a time, about 800 phrases in 6 to 8 s, costing $0.006. The unfinished work is HyPE (LLM-written questions), 6.9M primary and 1.9M supplemental paragraphs. That is LLM cost, not drive wear.
- **I could not confirm "5x faster in RAM".** There is no like-for-like run. Old bulk runs: 34 phrases/s (job 82, 10-14) and about 50/s (job 105, 10-17, vectors.db on the HDD/A400). A re-check of already-indexed text now runs at 20,500 paragraphs/s, but that path never touches the embedding API or Qdrant. The embedding+upsert split is not yet measured (see Open).
- **The EVO is the one drive at risk.** SMART: 45% life left, 528.1 TB written, 129 days powered on (lifetime average 4.1 TB/day, mostly the earlier heavy indexing). Now it writes about 0.2 to 0.3 TB/day. At 0.315 TB/day it lasts about 3.8 years by SMART extrapolation; at the 0.15 TB/day target about 7.9 years. Measured by rated TBW (600), only 72 TB remain, so the conservative case is under a year. The 5-year target by SMART is 0.237 TB/day.
- **Nearly all EVO writes come from one process**, the single writer (`siftersearch-worker`). The ZFS and Qdrant layers add little. Which statements make those bytes is still unattributed.
- **Reads are already served from RAM.** ARC is full at 48 GiB, hit rate 96.5% overall, metadata 99.94%. Raising ARC is cheap and safe. More RAM is not justified yet.

## Measurements

| Device | Window | Written | TB/day |
|---|---|---|---|
| EVO nvme0n1 (pool fast) | 197 s | 717 MB (3.64 MB/s) | 0.315 |
| MP44 nvme1n1 (pool faster) | since boot | 0.17 TB/day incl. the 253 GB move | idle now |
| sdb / sdd (A400 crutch) | 197 s | 105 / 58 MB | 0.046 / 0.025 |

| Writer (by process, 197 s) | MB |
|---|---|
| unified-worker (single writer), main thread | 533 (100% of dataset writes) |
| media-worker | 9.9 |
| everything else | under 0.2 each |

- Dataset `fast/siftersearch-db` logical: 533 MB. Device 717 MB. **Amplification: 1.35x** (this window). The earlier "10-20x" came from a quiet 60 s window where logical writes were 0.37 MB/s.
- Writer thread split over 60 s: main thread 178.7 MB, checkpoint thread 0.6 MB. Writes are WAL appends plus inline checkpoints, not the 5 s checkpoint thread.
- Writer bursts: 3 to 4.5 MB/s with only about 100 counted row changes in some windows. Bytes per statement are not recorded, so the dominant statement is unknown.
- Current settings: ZFS recordsize 16K, logbias throughput, sync standard, lz4, atime off. SQLite: WAL, `synchronous=OFF`, checkpoint thread every **5 s** (not 60 s as assumed), autocheckpoint 20,000 pages.
- ARC: size = c_max 48 GiB. Hits 5.31G, misses 193M. Demand data misses 2.2%. During the 100 s after-window: +27.8M hits, +100k misses (99.6%).
- CPU slice `sifter-bulk`: nr_throttled 254 of 1.25M periods since boot (0.02%), 822 s throttled in total. Flat during the indexer run.
- Search health during the run: `/healthz` 2 to 5 ms, library stats 3 to 8 ms.
- RAM disk `/srv/qram`: 6.74 GB used, 40.5 GB free (indexer floor is 6 GB free).

### Indexing (re-check path, job 37112)

330,258 paragraphs in 16.1 s (20.5k/s). Indexer CPU 14.2 s of 16.1 s, so it is **bound by one CPU thread** (segmentation plus lookups). The vectors.db "already embedded?" lookups took 5.4 s (33% of wall time). Qdrant 0 ms, SQLite marks 0 ms, device writes about 7 MB, writer 0.9 MB.

### Lifetime (SMART via `/api/observatory/telemetry`)

| Drive | Life left | Written | Projection |
|---|---|---|---|
| EVO 970 Plus 1 TB | 45% | 528.1 TB | 0.315 TB/day: 3.8 y; 0.15: 7.9 y; by rated 600 TBW: 72 TB left (0.6 y at 0.315) |
| MP44 4 TB | 100% | 0.5 TB | 2,000 TBW: about 32 y at 0.17 TB/day |

## Changes made (each with rollback)

| Change | Status | Rollback |
|---|---|---|
| Migration 184: partial index `idx_ops_report_runs_queued` (name, id) WHERE status='queued' for the `claimNext` poll. Test `ops-report-queue-index`. Build scans the ~37k-row table once; expected under a second. | Deployed (tower at 83a74680+). Slow-query disappearance not yet confirmed. | `DROP INDEX idx_ops_report_runs_queued` |
| Indexer timing split (`timing` in chunk/done lines) and `limit` job param | Deployed | revert commit |
| Adaptive embedding limiter `scripts/phrase-index/embed-limiter.mjs`: AIMD concurrency 4 up to 16, Retry-After and RetryInfo honoured, optional token buckets at 85% from `EMBED_RPM` / `EMBED_TPM`. Tests. | Deployed, throughput gain **not measured** | revert commit |
| `sifter-bulk.slice` CPUQuota 2000% to 4000% (runtime and unit file, copy in `docs/ops/`). A weights-only slice cannot protect the pm2 API, which runs in `system.slice`, so a ceiling stays. | Live, `cpu.max` = 4000000 | `systemctl --user set-property --runtime sifter-bulk.slice CPUQuota=2000%` and restore `.bak-20261028` |
| Writer: `SIFTER_CHECKPOINT_MS` 120000, `SQLITE_WAL_AUTOCHECKPOINT` 100000, `SQLITE_JOURNAL_LIMIT_MB` 1024 in `ecosystem.config.cjs` | Live (verified in the process environment). Before 543 MB/120 s, after 395 MB/100 s, **inconclusive** (the activity differed and the writer restarted several times). | delete the three lines |
| Drive-wear line in `system-checks --daily`: per-device TB/day from `/proc/diskstats` deltas, years left from SMART, top writer by `/proc/PID/io`. WARN if EVO is above 0.15 TB/day or any drive is under 5 years. Test `storage-wear`. | Deployed, first rate appears after the second daily run | revert commit |

## Ranked recommendations (wear saved per risk)

1. **Attribute the writer's bytes** (add a bytes-per-caller counter to `db_write_stats`). 100% of EVO writes come from one process and the 4.5 MB/s bursts do not match the row counts. Expected saving: unknown until attributed. Likely candidates: `coverage:touch` (3,600 rows per minute), watcher ingest (22k changes in one minute), telemetry commits. Risk none.
2. **Re-measure the checkpoint change over a quiet hour**, comparing writer MB per 1,000 changes. If it holds, expect 10 to 30% fewer writer bytes (0.03 to 0.09 TB/day).
3. **Batch or skip the per-minute `coverage:touch` and report-run progress rewrites** (durability-neutral). Size unknown until item 1.
4. **ARC 48 to 72 GiB** (needs sudo, safe, reversible): `echo 77309411328 | sudo tee /sys/module/zfs/parameters/zfs_arc_max`, persist in `/etc/modprobe.d/zfs.conf` as `options zfs zfs_arc_max=77309411328`. Memory budget: services about 57 GB + ARC 72 + RAM disk up to 44 = 173 of 188 GB. Gain: misses fall from 2.2% of demand data, so it only trims read latency, not writes. Rollback: write 51539607552 back.
5. **API SQLite cache** from the 512 MB default to 2 GB (`SQLITE_CACHE_MB` on `siftersearch-api`). Do not raise `mmap_size` (double-caches against ARC).
6. **Durability-relaxing, queued; the UPS pull test passed, but I have no sudo and applied none:**
   - `echo 30 | sudo tee /sys/module/zfs/parameters/zfs_txg_timeout` (now 10). Fewer txg flushes. Loss window grows to about 30 s. Rollback: write 10.
   - `synchronous=OFF` is already set on the writer. For the telemetry store, set `SIFTER_TELEMETRY_SYNCHRONOUS=OFF` (already the default).
   - Do **not** set `zfs sync=disabled` (gain is small because SQLite does not fsync at commit).
   - After each: `SIFTER_UPS_FORCE=1 scripts/ops/ups-power.sh enter`, then `resume`, and confirm the flush completes.
7. **recordsize**: 16K against SQLite 4K pages. Only new blocks change. Safe method: `zfs create` a new dataset with recordsize=8K, copy during a maintenance window, swap mountpoints. Gain is unproven at 1.35x total amplification, so do not do it until item 1 says the ZFS layer matters.
8. **RAM purchase**: not justified by the evidence (ARC miss rate is low). To get the spec anyway, run as root: `sudo dmidecode -t memory | grep -E 'Size|Speed|Type:|Rank|Part Number|Locator'` and match the 12 installed DIMMs (DDR4 ECC RDIMM, same speed and rank).
9. **Gemini Batch API** (50% price, separate quota, enqueued-token limit 500k Tier 1 / 5M Tier 2 / 10M Tier 3) for non-urgent bulk indexing. Not needed while the phrase backlog is zero.

## Open (not measured)

- Time split for a real embed+upsert batch: the timing field is deployed, so the next media-talk `phrase-index` run will report `embed_ms`, `qdrant_ms`, `sqlite_ms`, `cpu_ms`. Read it with `ops.mjs report phrase-index --latest`.
- Whether new points go to `phrases_hot`: the job is configured for it (`hotArgs`), not verified by counts.
- Google's embedding RPM/TPM/RPD: the public docs do not list them. Read them at aistudio.google.com/rate-limit (tier needs $100 cumulative for Tier 2, $1,000 for Tier 3), then set `EMBED_RPM` and `EMBED_TPM` on the indexer.
- 25 tests in `tests/api` (media-item, media-gpu-spend, media-images) fail in a full run. I did not establish whether they fail without my changes.
