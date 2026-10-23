# The single writer's write path: audit, RAM-leaning changes, durability window, UPS read-only mode (10-23)

**Chad, 10-23:** "this computer has hashed [ECC] memory and UPS backup — and our data is literature not banking
transactions, so we should be able to lean into batch efficiency with chunked jobs using RAM more than most applications."
Later the same day he set the UPS policy: the battery is for an **emergency**. On battery the system flushes everything
held in RAM to disk and goes **read-only** while still serving reads. It shuts down **only** when the battery is very low.

This work builds on `planning/content-write-cost-20261023.md`, which covers the per-row cost of `content`: its indexes,
triggers and FK child indexes, migrations 179 and 180. This document does not touch content's indexes or triggers.
Rollback commands are in `tmp/wear/changes.md` § DB WRITE PATH.

---

## 1. Audit: who holds the writer (48 h, before)

The source is the new ops report `node scripts/ops/ops.mjs report write-stats --params '{"hours":48,"top":30}' --wait`
(run 9393). It reads `db_write_stats`: per minute × caller × batch name, batches, rows, ms total and ms max. The exact
per-batch latency is a new in-memory ring on the writer, at `curl 127.0.0.1:7849/latency?minutes=N`.

**Writer busy over 48 h: 2.9 %.** The busiest minute was 67.5 % busy, and the p95 minute (of minutes with writes) 7.7 %.
The writer is not saturated on average. The cost sits in a few contenders and in the tails.

| # | caller / batch name | share of writer time | batches/h | statements (48 h) | avg ms | max ms | schedule |
|---|---|---|---|---|---|---|---|
| 1 | indexer / **coverage:save** | **54.7 %** (2,738 s) | **15,517** | 10.4 M | 3.7 | 622 | every minute: the rolling refresh re-saves the 300 stalest documents |
| 2 | media / unnamed (content INSERT, enrichment_pending DELETE) | 12.8 % | 452 | 127 k | 29.4 | 9,771 | every minute while ingesting |
| 3 | embedding / unnamed (`UPDATE content SET embedding`) | 10.0 % | 40 | 94 k | 259 | 8,836 | every minute (batches of ~80) |
| 4 | reports / unnamed | 6.1 % | 330 | 1.23 M | 19.2 | 2,220 | continuous |
| 5 | **telemetry**, all callers (query_stats, slow_query_log, ai_usage) | **≈ 11 %** | ≈ 2,400 | ≈ 600 k | 3–9 | 1,950 | every minute per process (query-stats flush) |
| 6 | indexer / coverage:rebuild-totals | 1.1 % | 0.6 | 60 | 1,917 | 3,564 | at every indexer start (deploys) + daily |
| 7 | media / media:update | 0.9 % | 645 | 31 k | 1.4 | 813 | continuous |
| 8 | updater / unnamed (migrations) | 0.6 % | 9 | 434 | 68 | 4,856 | on deploy |

Telemetry rows by caller: reports 4.9 %, media 2.4 %, embedding 1.3 %, api 1.2 %, indexer 0.5 %, anis, deep-research,
grounding, carry and ops about 0.1 % each.

**The worker log of batches over 1 s** covers 10-11 to 10-23 (scratch `slowagg.mjs`). There were 18,858 slow batches and
779 BLOCKING writes (10,149 s). Most fell between 10-12 and 10-14, when unnamed reports writes ran heavily, up to 68 %
of an hour. In the last 48 h no hour exceeded about 1.3 %. The worst recent stalls are content-table writes: a 100-row
media INSERT of 9.8 s, an embedding UPDATE of 8.8 s, and the other agent's `DROP INDEX` of 68 s on 10-23. Those are the
per-row cost the content-write-cost work addresses.

**Exact latency, before** (ring, writer up since 22:33, 15 and 60 min windows): p50 3 ms, p95 5–6 ms, p99 82–162 ms,
max 68.4 s (the DROP INDEX), busy 12–15 %. That is one commit per request.

## 2. What changed

### 2.1 The top contender: coverage refresh writes only what changed (W2, commit 9d95a0e6)

The indexer's rolling refresh re-measures the 300 stalest documents every minute. It then **re-saved every one**: an UPDATE
subtracting the document's old rows from `coverage_totals`, 12 upserts into `index_coverage`, and an INSERT adding them
back. That made 14 statements and one transaction per document, 300 times a minute. Almost all re-measures are identical.

Now `saveCoverage` reads the document's stored rows (one primary-key read on a reader connection) and writes nothing when
every layer is unchanged. The refresh then moves the unchanged documents' `updated_at` in **one** UPDATE per ≤ 500 ids,
which keeps them rotating through "stalest". The totals are untouched because their delta is zero.
Tests: `tests/api/coverage-repo.test.js` ("unchanged re-measure writes nothing").

### 2.2 High-volume, low-value writes in their own database (W3)

`query_stats`, `slow_query_log` and `db_write_stats` now live in **`telemetry.db`**, at `/fast/siftersearch-db/telemetry.db`
next to `sifter.db`. That is the same ZFS dataset, so db-ship snapshots and ships it too.
- **Writes** still go through the single writer. The body carries `{db:'telemetry'}`, and the writer applies those
  batches through its own connection and its own group committer on that file. A telemetry batch never shares a
  transaction, a B-tree page, a WAL frame or a checkpoint with content. The telemetry queue in every process splits each
  flush in two: store rows, and content rows. **`ai_usage` stays in sifter.db**: it is the spend ledger, with about 25
  readers and the budget gate.
- **Reads** go through `telemetryAll` / `telemetryOne` in db.js, from any process. The repo function names are unchanged
  (`slowQueriesByHour`, `recordedPlans`, `writeStatsRows`). New `query-health-repo` functions replace the four raw queries
  in `routes/ingest.js` (`/server/query-time`, `/server/slow-queries`). system-checks reads the store's file.
- **Bootstrap**: the writer creates the tables and indexes from **sifter.db's own DDL** (`sqlite_master`), so production's
  real shape carries over, drift included. It then imports recent history once: 7 days of query_stats and db_write_stats,
  14 of slow_query_log. The import runs in 5,000-row chunks with a yield between them, starting at the window's first
  rowid, which it finds through the time index. Buckets that exist on both sides (the hour or minute of the switch) are
  **added together, not replaced**.
- **Retention**: 30 days, deleted daily in 500-row chunks with yields. Nothing ever pruned these tables before.
- The old tables in sifter.db are **left in place and no longer written**. Dropping them is a long write on content: a
  Chad decision (§8).
- Ratchets: the store's connection lives in db.js (infra), and the thread in `api/lib/repos/`. Both ratchets pass unchanged.

Tests: `tests/api/telemetry-store.test.js` (routing by target table, two posts, DDL copy, the import and its added
buckets, a missing store reading as empty).

### 2.3 The writer: group commit + prepared-statement reuse (W3)

`createGroupCommitter` in `api/lib/write-server.js`. `/write` requests that arrive in the same event-loop turn
(`SIFTER_GROUP_COMMIT_MS`, default 0 = `setImmediate`) share **one SQLite transaction**:
- Each request runs in its own **SAVEPOINT** (a nested better-sqlite3 transaction), so a failing request rolls back alone
  and gets its own error, while the rest of its group commits.
- Arrival order is kept, through a promise chain.
- A request of ≥ 2,000 statements runs alone, after whatever was already waiting.
- An idle writer adds no wait. A busy one groups by itself, because requests pile up behind a long flush.
- Each request's latency includes its share of the COMMIT, so `db_write_stats` and `/latency` stay exact.

Statements are prepared once per connection, in an LRU of 512 keyed by SQL text. DDL is never cached.

**Lab** (this Mac, tmp/bench/bench-gc.mjs; 4,000 two-statement upsert requests, 32 concurrent, WAL, 3 indexes):

| synchronous | one txn per request | grouped (window 0) | gain |
|---|---|---|---|
| FULL | 5,303 req/s | 25,370 | 4.8× |
| NORMAL | 9,905 | 30,719 | 3.1× |
| OFF | 16,102 | 31,633 | 2.0× |

A fixed 2 ms window was **slower** than no grouping under OFF: the wait cost more than a cheap commit saved. Hence the
default of 0. Rollback: `SIFTER_GROUP_COMMIT=0`.
Tests: `tests/api/write-group-commit.test.js` covers coalescing, savepoint isolation, order, big requests that drop nothing,
disabled = one per request, and the statement cache.

### 2.4 Checkpoints off the write path (W3)

`api/lib/repos/wal-checkpoint-thread.js` is a **worker thread with its own connection**. It runs `wal_checkpoint(PASSIVE)`
every 5 s, which never waits on readers and never blocks the writer.
- The writer's `wal_autocheckpoint` is raised from 1,000 pages (4 MB: a random commit paid the copy inline) to 20,000
  pages (80 MB), as a safety net only.
- `journal_size_limit` is 256 MB, so a reset WAL is truncated.
- The inline 60 s PASSIVE is gone.
- The 15-minute TRUNCATE now runs **on the thread**, **only when the WAL file stayed over 512 MB** (readers pinning old
  frames), and with a 3 s bounded wait. While a TRUNCATE is pending SQLite holds off new writers, so the main thread can
  wait at most 3 s, not the 10-13 tens of seconds.

The thread restarts itself 10 s after it dies. Test: `tests/api/wal-checkpoint-thread.test.js` (PASSIVE copies while the
writer commits; TRUNCATE empties the WAL).

### 2.5 PRAGMAs: lean into RAM (W3)

Applied at open (`applyRamPragmas` in db.js, logged with `pragmaSnapshot`; test `tests/api/db-pragmas.test.js`):

| setting | before | after | where | why |
|---|---|---|---|---|
| `cache_size` | 512 MB | **8 GB** | writer | content's ~35 indexes stay hot in the writer instead of being re-read from the ARC (syscall + lz4) per row. `max_memory_restart` 4G → 14G |
| `synchronous` | NORMAL | **OFF** | writer (env `SQLITE_SYNCHRONOUS`) | no fsync at commit or checkpoint, so no ZIL writes. Safe on ZFS: see §3 |
| `temp_store` | file | **MEMORY** | every connection | sorts and temp B-trees in RAM |
| `wal_autocheckpoint` | 1,000 | 20,000 (safety net) | writer | §2.4 |
| `journal_size_limit` | none | 256 MB | writer | bound the WAL file after a reset |
| `mmap_size` | 1 GB | **1 GB (unchanged)** | all | on ZFS a mapped page is cached twice (page cache + ARC). The ARC already holds all of sifter.db (31 GB compressed, 99 % hit rate), so a larger mmap would waste RAM (storage plan §4) |

The telemetry store runs with `synchronous=OFF` and a 64 MB cache.

### 2.6 Bulk paths

- **Deletes and whole-document updates.** `softDeleteByDoc`, `restoreByDoc` and `restoreRetiredDocs` were each **one
  UPDATE over a document's rows**, with every row firing content's triggers. They now go through
  `updateDocRowsChunked`: ids first (a read), then UPDATEs of ≤ 400 ids sized by the media agent's `adaptiveBatches`,
  with a yield between. Each chunk re-checks its WHERE, so a rerun is a no-op. Test:
  `tests/api/bulk-chunked-writes.test.js`. Already chunked before today: `deleteParagraphsByDoc` (500),
  `replaceParagraphsByDoc` (500), `safeSoftDeleteDocs` (adaptive, media agent), `hardDeleteExpired` (100), and now the
  telemetry prune (500).
- **Bulk ingest.** Per-document transactions and adaptive batch sizing are already in place (media agent,
  `adaptive-batch.js`). With group commit, many small requests now also share a commit. **Multi-row `INSERT … VALUES
  (…),(…)` was evaluated and not done:** content's per-row cost is index maintenance (≈ 0.28 ms/row after migrations
  179–180, about 30 b-trees per row), not statement overhead. Prepared statements are now reused, so one multi-row
  statement would save parse/bind only, roughly microseconds against a cost measured in tenths of a millisecond.
- **Derived layers once per batch, not per row.** The coverage ledger is now written only on change (§2.1). The `table_counts`
  triggers and content's O(n) doc-count triggers belong to content-write-cost (migration 179). The non-content triggers
  are listed by the new `triggers` report (§5).

### 2.7 db-ship every 15 minutes

`scripts/ops/db-ship.sh` keeps `SHIP_KEEP_RECENT` / `SHIP_KEEP_DAYS` (default 24/14, unchanged). The cron goes from hourly to
`*/15` with `SHIP_KEEP_RECENT=96`: the newest 24 h at 15-min steps, then the first of each day for 14 days. That makes
telemetry.db and sifter.db recoverable from /tank to within 15 minutes if the 970 EVO dies.

## 3. The durability window (chosen)

The window is set by the failure, not by one number:

| failure | what is lost | bound |
|---|---|---|
| **process crash** (writer killed, OOM, deploy) | nothing committed: the WAL is in the kernel / ZFS buffers | 0 |
| **kernel panic, or power cut without a working UPS** | content and telemetry commits not yet in a ZFS transaction group. With `synchronous=OFF` nothing forces them earlier, and ZFS writes a txg at least every `zfs_txg_timeout` = **10 s** (sooner when dirty data builds up). ZFS txgs are atomic and applied in order, so the files on disk are always a **consistent earlier state**: SQLite's WAL checksums drop torn frames, and there is no corruption | **≤ ~20 s** (one txg + its write) |
| **power cut with the UPS working** | nothing: read-only mode flushes first (§6) | 0 |
| **the 970 EVO dies** (or a logical corruption is noticed late) | since the last db-ship to /tank | **≤ 15 min** (with the `*/15` cron) |
| **qdrant-hot (RAM disk) lost without warning** | up to 6 h of upserts to the hot collections, **but no source data**: every hot point is derived from `vectors.db` (on disk, `synchronous=FULL`) or SQLite. At boot qram-restore reloads the last snapshot, and the indexer's `phrase-hot-reconcile` re-sends missing points. The *index* is briefly stale; nothing paid for is lost | data 0; index catch-up = one reconcile |
| **Qdrant main** (phrases, on SSD) | its own WAL + `flush_interval_sec` 120 | ≤ 120 s of upserts, re-derivable from vectors.db |

**Recommended and implemented:** `synchronous=OFF` on the writer. On ZFS it is crash-consistent and the window is about
20 s, well under the 15-min target. NORMAL bought nothing here: on ZFS it only adds fsyncs at checkpoints, each copied
through the ZIL. With the UPS covering power cuts, crashes and panics bound the window, as Chad set out.

**Evaluated and rejected: the WAL or hot DBs on tmpfs.**
- SQLite requires the `-wal` file **next to** its database, so a WAL alone cannot move. Moving all of sifter.db means
  60 GB of tmpfs against 66 GB available, more than the RAM budget allows with qdrant-hot (44 GB) and the ARC (48 GB).
- It would also buy almost nothing. Reads already come from the ARC (99 % hits). With `synchronous=OFF`, commits already
  land in RAM, and ZFS writes them out asynchronously in txgs. A tmpfs copy would add a replication job whose interval
  becomes the loss window, for a gain measured in CoW overhead only.
- telemetry.db is small enough for tmpfs, but its writes are already cheap and async on ZFS.

## 4. Measurements: before → after

All of W2 and W3 went live together at **23:04 UTC**. Another agent's push from the shared tree carried the commits, so
W2 and W3 cannot be separated in time; per-name attribution separates them instead. **Before** = 10-22 23:00 → 10-23
22:00 (23 h; ends before the other agent's index drops). **After** = 23:06 → 23:50 (0.74 h; it will be re-read over 24 h).
Reports 9702 (before) and the after run; `/latency` ring at 23:50.

| measure | before | after | change |
|---|---|---|---|
| **writer busy %** (Σ ms ÷ wall) | 3.36 % (120.9 s/h) | **1.30 %** (46.9 s/h) | **−61 %** |
| busiest minute | 41.5 % | 7.5 % | −82 % |
| p95 minute (of minutes with writes) | 9.0 % | 6.2 % | −31 % |
| coverage (save + touch) | 58.4 s/h, 15,693 batches/h | **≈ 2.0 s/h**, 91 + 51 batches/h | **−96.5 %** |
| media content INSERT, ms per row | 4.86 | 3.48 | −28 % (with migrations 179–181) |
| embedding `UPDATE content SET embedding`, ms per row | 5.75 | 2.86 | −50 % (with migrations 179–181) |
| media content INSERT, p95 of per-minute worst batch | 1,267 ms | 1,743 ms | small after-sample (0.74 h); re-read at 24 h |
| embedding batch, p95 of per-minute worst | 1,455 ms | 1,021 ms | −30 % |
| **batch latency (exact ring)**: p50 / p95 / p99 / max | 3 / 5–6 / 82–162 / 68,411 ms | 1 / 24–36 / 110–134 / 2,573 ms | see note |
| commits per request | 1.00 | 0.85 (172 of 4,437 grouped) | the writer is rarely contended now; grouping matters in bursts |
| statement cache | n/a | 21,475 hits / 178 misses (99.2 %) | |
| inline checkpoint work on the writer thread | PASSIVE every 60 s + autocheckpoint every 4 MB + TRUNCATE every 15 min | **none** (556 PASSIVE on the thread: 23.2 s total, max 2.2 s) | off the write path |
| telemetry on the content DB | 14.6 s/h (query_stats, slow_query_log, ai_usage) | 12.5 s/h (ai_usage only) + 4.1 s/h in telemetry.db | content no longer carries query/slow/write stats |

**Notes**
- **The overall p95 went UP while every contender's cost went down.** Before, 15.7k tiny coverage batches an hour (3.7 ms)
  made up most requests and held the p95 low. With them gone, the remaining requests are the heavier ones. Per-contender
  costs are the comparable numbers: the per-row costs above.
- **The content-table gains are shared.** Migration 179 (doc-count triggers to NOT EXISTS), 180 (six redundant indexes
  dropped) and 181 (FK child indexes) landed in the same hour as the 8 GB cache and synchronous=OFF.
- **Ingest throughput.** The writer's capacity for media transcript rows went from ~206 to ~287 rows per writer-second
  (+39 %). That is about 2.5 → 3.4 transcripts of ~85 rows each per writer-second. The **observed** ingest rate (≈ 4.1k
  content statements/h) is set upstream by ASR/LLM: the writer is 1.3 % busy. Docs per minute therefore did not change
  and cannot change from this work. Headroom did.
- **Lab** (§2.3): group commit takes small concurrent requests from 16k to 32k/s under OFF, and from 5k to 25k/s under FULL.

## 5. Derived data off the write path

The `triggers` ops report lists every trigger by table, with the tables it writes:
`node scripts/ops/ops.mjs report triggers --wait`.

**Tower, 10-23 23:20: 22 triggers on 3 tables.**

| table | triggers | writes | verdict |
|---|---|---|---|
| content | 11 | table_counts (9), index_outbox (2) | content-write-cost-20261023 (migration 179 fixed the two O(n) ones; dropping the seven unread `table_counts` triggers is on Chad's list there) |
| docs | `docs_fts_ai/ad/au` | docs_fts (title/author search) | **keep**: only on INSERT/DELETE and on UPDATE **OF** title/author/collection/description; docs writes are low volume; search reads it (docs-repo, sections-repo) |
| docs | `docs_outbox_delete/leave` | index_outbox | **keep**: removals must reach the search indexes |
| docs | `trg_docs_insert/soft_delete/undelete` | table_counts | **unread** (nothing in api/scripts/src/worker reads table_counts). One single-row UPDATE per doc change: cheap, but pure waste. Drop together with content's (Chad decision) |
| graph_entities | `trg_ge_insert/update/delete` | graph_entity_changes | **keep**: it is the change feed the external entity client polls (entity-catalog `changesSince`); entity work is idle, so the volume is ~0 |

**Inline derived writes moved off the write path today:**
- coverage totals: now only on change (§2.1)
- query/slow/write stats: in their own DB (§2.2)
- WAL checkpoints: on a thread (§2.4)
- the coverage totals rebuild: now **once a day**, not at every indexer start (commit f9cba1e3). Every deploy used to cost
  2–3.5 s on the writer.

None of the remaining derived writes is both expensive and safe to defer:
- The FTS triggers must stay synchronous or doc search lies.
- The outbox triggers ARE the async mechanism: they enqueue, and a job drains.

## 6. UPS: read-only power mode (Chad 10-23)

### 6.1 Policy, as built

| event | what happens |
|---|---|
| mains lost < 10 s | nothing (upssched debounce) |
| **on battery 10 s** | `ups-power.sh enter`: **drain → read-only → flush everything held in RAM to disk**. Search and Anís keep serving reads |
| mains back | resume timer starts (60 s); losing mains again cancels it |
| **mains stable 60 s** | `ups-power.sh resume`: qdrant-hot reloaded from its snapshot if it was lost, flag cleared, writers resume |
| **battery very low** (runtime ≤ 180 s or charge ≤ 10 %: `ups.conf` `ignorelb` + overrides) | upsmon → `sifter-ups-shutdown`: the final flush (a no-op if already done) → clean `shutdown -h` |

There is **no timed shutdown**. The old 120 s power-down timer is gone.

### 6.2 The flag and who honours it

The flag is `/dev/shm/sifter-power.json`, written only by `scripts/ops/ups-power.sh`. It lives on tmpfs, so a reboot
(always on mains) can never leave the system stuck read-only. `api/lib/power-mode.js` reads it with a cached stat, at most
once a second. The modes:
- `normal`: the file is absent.
- `draining`: no new work starts anywhere; writes still land, so jobs in hand can save their resume points.
- `readonly`: every write is refused.

| component | honours it by |
|---|---|
| runService services (indexer, media, reports, reports-carry) | the **same drain as SIGHUP** (`watchPower` → `startDrain('power')`): jobs yield at their safe point and save where they stopped. A service that **starts** while held **parks** (`waitForNormalPower`) and claims and requeues nothing until the flag clears, then starts normally and its yielded jobs resume |
| embedding, deep-research, audit, library-watcher (no park) | `pm2 stop` (SIGINT, a clean drain), recorded in the flag's `stopped`, and `pm2 start` again on resume |
| the single writer | `/write` → **503 `read-only (power)`**; its own loop (sync, jobs, periodic writes) idles; its write-stats stay in memory |
| every client (db.js `postWriteBatch`) | refuses before any network: `PowerReadOnlyError`, `fatal`, no writer-down streak. A 503 from a process that has not seen the flag yet is the same verdict |
| telemetry (search_log, query stats, …) | dropped and counted, never queued behind a refused writer |
| gateway, api, anis (reads), edge cache | unchanged: they keep serving |
| system-checks, `/api/admin/ops/services`, heartbeats | show `POWER: read-only mode since …`, the stopped list and `flushed_at`. Apps stopped by power mode are not alarms; power drains are not "stuck" |

### 6.3 `enter`: making it safe to lose power

1. **Detect.** `upsc tower@localhost ups.status` must answer (otherwise: inert, exit 0) **and read OB** (otherwise power
   came back during the debounce: nothing happens).
2. Flag `draining`. SIGHUP the runService apps; `pm2 stop` the others (only those online).
3. Wait until content writes have been quiet for 5 s (`GET :7849/power` → `quiet_ms`), at most `SIFTER_UPS_GRACE` = 60 s.
4. Flag `readonly`. Writes are refused from here on.
5. **Flush:** `POST :7849/power/flush` (the writer finishes queued groups, then `wal_checkpoint(TRUNCATE)` on sifter.db
   on the checkpoint thread with up to 30 s of waiting, and on telemetry.db). Then `systemctl start qram-flush.service`
   (dirty qdrant-hot collections → snapshots on disk), `zpool sync`, and `db-ship.sh`.
6. Flag `flushed_at`. A mail goes out if any step failed.

**After step 6 nothing writable exists only in RAM.**
- SQLite WALs are empty and the DB files are synced.
- ZFS has no dirty data.
- qdrant-hot's RAM copy equals its newest snapshot, so the RAM disk is now a *cache of the disk copy*: `qram-flush`
  marks every collection clean (`state.json`).
- The newest db-ship is on /tank.
- The only in-RAM state left is per-process telemetry counters and the writer's unflushed write-stats minute: telemetry,
  dropped by design.

`enter` is idempotent: a second event finds `flushed_at` and does nothing.

### 6.4 Without warning (UPS fails, kernel panic)

This is §3: content ≤ ~20 s, sifter.db/telemetry.db never corrupt, qdrant-hot re-derived from disk, no paid data lost.
The 6-hourly `qram-flush.timer` only bounds how much of the hot index must be re-sent; it does not bound data loss.

### 6.5 Install runbook (tomorrow, with the UPS)

Everything is inert until step 6. Storage plan §1.1 has the driver-selection detail.

1. Plug the UPS's USB into tower. `lsusb` → note `ID vvvv:pppp`. `dmesg | tail` → a HID power device (good for
   `usbhid-ups`) or a serial `ttyUSB`/`cdc_acm` (→ `nutdrv_qx`).
2. `sudo apt install nut` and stop the units it starts. `sudo nut-scanner -U` → copy `driver`, `vendorid`, `productid`
   (and `subdriver`) into `deploy/nut/ups.conf` `[tower]`. Keep `ignorelb` and the two `override.battery.*.low` lines.
3. Install the configs:
   `sudo cp deploy/nut/{nut.conf,ups.conf,upsd.conf,upsd.users,upsmon.conf,upssched.conf} /etc/nut/ && sudo chown root:nut /etc/nut/* && sudo chmod 640 /etc/nut/*`.
   Set one password in upsd.users and upsmon.conf:
   `P=$(openssl rand -hex 16); sudo sed -i "s/CHANGE_ME/$P/" /etc/nut/upsd.users /etc/nut/upsmon.conf`.
4. Install the scripts and sudoers:
   `sudo install -m 755 deploy/nut/upssched-cmd deploy/nut/sifter-ups-mail deploy/nut/sifter-ups-shutdown /usr/local/bin/`
   `sudo visudo -cf deploy/nut/sudoers.d-sifter-ups && sudo install -m 440 deploy/nut/sudoers.d-sifter-ups /etc/sudoers.d/sifter-ups`
   (deploy/qram's units and `sifter-powerdown.target` are already installed: changes.md Phase 0.)
5. Driver: `sudo upsdrvctl -D start tower`. If `usbhid-ups` cannot claim it, try `nutdrv_qx` (with the `subdriver` from
   nut-scanner, else `cypress`/`phoenix`/`fabula`/`krauler`), then `blazer_usb`. **If none reads `ups.status`, swap it for
   the CyberPower CP1500PFCLCD** (usbhid-ups).
6. `sudo systemctl restart nut-server`. Then `upsc tower` must show `ups.status: OL`, `battery.charge`,
   `battery.runtime` and `ups.load`. Record the watts in storage plan §1. **If there is no `battery.runtime`, only the
   10 % charge threshold applies**: raise it to 25 % for LiFePO4 (flat voltage curve).
7. **Dry run.** In `/etc/nut/upssched.conf`, set `CMDSCRIPT /usr/bin/env SIFTER_TEST=1 /usr/local/bin/upssched-cmd` and
   start `nut-monitor`. Watch with `journalctl -t upssched-cmd -t ups-power -f`.
   - Pull the wall plug for 5 s and plug it back: you should see `ONBATT` → `ONLINE` and **no** `READONLY`.
   - Pull it for 20 s: `TEST would run: … ups-power.sh enter`. Plug it back and wait 60 s: `TEST would run: … resume`.
8. **Drill, live but without pulling power**:
   `SIFTER_UPS_FORCE=1 scripts/ops/ups-power.sh enter`. Expect:
   - `cat /dev/shm/sifter-power.json` shows `readonly` and `flushed_at`.
   - `curl -s -XPOST 127.0.0.1:7849/write -d '{"statements":[]}'` returns 503 read-only.
   - Search answers: run `node scripts/ops/critical-path.mjs --local`.
   - `ls -la /fast/siftersearch-db/*.db-wal` shows 0 bytes.
   - `scripts/system-checks.mjs --check` shows POWER.
   Then `SIFTER_UPS_FORCE=1 scripts/ops/ups-power.sh resume`: the flag disappears, the indexer/media/reports start
   claiming again (their heartbeats), and embedding/deep-research are back online.
9. Go live: remove `SIFTER_TEST=1`. One real pull of ≥ 20 s in a planned window should show `enter` complete in the
   journal (`read-only; flushed (ok=1)`), then plug back in for resume. Leave the battery-to-shutdown test for a planned
   window: let it run to `LB` once to confirm the runtime threshold triggers before the UPS dies.
10. The qram flush timer stays 6-hourly (phase 1 values; the flush on battery covers power cuts).

**Manual exit** from a stuck read-only mode: `rm /dev/shm/sifter-power.json`. Services resume by themselves; `pm2 start`
whatever the flag's `stopped` field listed.

## 7. Rollback

Per piece, in `tmp/wear/changes.md` § DB WRITE PATH:
- group commit: `SIFTER_GROUP_COMMIT=0`
- synchronous: delete the `SQLITE_SYNCHRONOUS` line → NORMAL
- cache: delete `SQLITE_CACHE_MB`
- autocheckpoint: `SQLITE_WAL_AUTOCHECKPOINT=1000`
- coverage: `git revert 9d95a0e6`
- everything: revert the W3 commits. The old telemetry tables in sifter.db still exist, so writes simply return to them.
- db-ship cron: back to `17 * * * *` without the env.

## 8. Decisions for Chad

1. **Drop the old telemetry tables in sifter.db** (`query_stats`, `slow_query_log`, `db_write_stats`, no longer written;
   their full history — only the last 7–14 days, 0.42 M rows, were copied into telemetry.db). A DROP is one long write on the content DB (the other agent's DROP INDEX took 68 s), so it
   should run in a quiet window. Until then they are harmless dead weight.
2. **Drop the three unread `table_counts` triggers on `docs`**, together with content's seven, which are already on your
   list in content-write-cost-20261023.
3. **UPS:** the runbook in §6.5 runs tomorrow with the hardware. Confirm the policy numbers: read-only after **10 s** on
   battery, resume after **60 s** stable, shutdown at **≤ 180 s runtime or ≤ 10 % charge** (raise to 25 % if the
   GoldenMate reports no runtime).
4. **qdrant-hot flush cadence:** kept at 6 h. The flush on battery covers power cuts, and a crash loses no source data
   (§3). A 15-min flush would rewrite up to 22 GB each time while indexing (≈ 2 TB/day), against the wear plan.
5. **ai_usage stays in sifter.db** (the spend ledger + budget gate, ~25 readers). Moving it would save ~9 s/h of writer
   time (0.25 %) and needs those readers ported. Not worth it now.

## 9. Summary

- **Top contender:** the rolling coverage refresh, 55 % of all writer time, cut by 96.5 %.
- **Writer busy:** 3.36 % → 1.30 % (−61 %). The worst minute went from 41.5 % to 7.5 %.
- **Per-row cost of content writes:** −28 % on ingest INSERTs and −50 % on embedding UPDATEs, together with the other
  agent's index and trigger fixes.
- **Telemetry** has its own database.
- **Checkpoints** have left the write path.
- **Group commit and the statement cache** are live for bursts.
- **Durability window:** ≤ ~20 s for a crash or panic, 0 for a power cut with the UPS, ≤ 15 min for drive loss (db-ship
  every 15 min). No corruption in any of them, on ZFS.
- **UPS read-only mode** is built, tested and inert until NUT is installed tomorrow.
