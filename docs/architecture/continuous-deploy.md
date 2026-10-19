# Continuous deploy without breaking work

Chad, 10-19: "We need a way to rapidly iterate without breaking in-process work." The three asks:
1. partial updates;
2. queued updates (stop taking new work, update when idle);
3. spin-off work that continues through updates and is re-monitored after a restart.

## What broke (10-19)

- **The API was force-killed mid-answer.** It reloads gracefully (pm2 cluster), but pm2 force-kills the old instance after `kill_timeout: 30000`. Anís research answers take 40–120 s, so a reload in the middle of one returned 502.
- **Pushes reloaded everything.** Every push reloaded the API and the writer, even one that only changed a test script.
- **Reports workers were never reloaded.** They ran stale code until someone restarted them by hand, and that killed the running job (it was then requeued from scratch).
- **Synchronous mail drafts hit the edge timeout.** The mail worker calls `/draft` synchronously through the Cloudflare tunnel, which cuts requests at about 125 s (524). Slow answers were recomputed every minute and never delivered.
- **Code skew after a pull.** `git pull` rewrites the one tree every process runs from. A process that is still running lazily imports modules (`await import()` is everywhere), so after a pull it mixes old and new code.

## Contracts

| Process kind | Examples | On deploy |
|---|---|---|
| HTTP, cluster | siftersearch-api | `startOrReload`: the new instance starts first; the old one closes its listener and finishes in-flight requests and jobs (kill_timeout 300 s) |
| Single writer | siftersearch-worker | `startOrReload`; it finishes its current batch, and callers retry |
| Queue / loop worker | reports, reports-carry, audit, embedding, deep-research, library-watcher | **drain**: SIGHUP means stop claiming work, finish the current item, `exit(0)`; pm2 autorestart loads the new code |
| Cron app | digest, model-review, audit-digest | nothing: each run starts fresh |
| Detached run (phase 4) | long ops jobs, sites-ingest | never touched: runs its own release to the end, and the supervisor re-attaches |

## Partial updates

- `scripts/lib/runtime-files.js`: a push touching nothing a process loads (tests, docs, frontend, hand-run scripts) is pulled with no reload. **Done 10-19.**
- `scripts/lib/import-graph.mjs`: from each pm2 entry, follow static imports and literal dynamic imports to get the files that process loads. Only processes whose graph contains a changed file are reloaded or drained.
- Fallbacks to "affected":
  - a changed file under `api/` that is in no graph (computed dynamic imports), affects every api-based process;
  - `package*.json`, `.env-public` and `ecosystem.config.cjs` affect all.

## Jobs, not long requests

`api/lib/jobs/async-jobs.js` keeps a file store in `data/jobs/<key>.json`.

- **Idempotent start by key:** the same key returns the running or finished job.
- **Drain:** in-flight jobs are counted, and the API's shutdown waits for them, just as `fastify.close()` waits for requests.
- **Stale jobs:** a job still "running" after 15 min was killed. A poll then reports `lost`, and the caller retries.
- **First user:** Anís mail. `POST /draft {async:true, job:'mail-<id>'}` returns at once, and the mail cron polls `GET /draft/job/:key` every minute.

## Phase 4: releases and detached runs (designed, not built)

- **Releases:** each deploy runs `git worktree add ~/sifter/releases/<sha>`, with symlinks for `data/`, `logs/` and `.env-secrets`, and node_modules shared while the lock file is unchanged. `~/sifter/current` points at the newest release, and pm2 runs from it. A process keeps its own release's code until it exits, so there is no skew. Releases no running process uses (no matching `/proc/*/cwd`) are garbage-collected.
- **Detached runs:** an ops job runs as `node <release>/scripts/run-job.mjs <runId>` with `setsid`, outside pm2's process tree. It writes its pid, release, heartbeat and progress to `ops_report_runs`. After a restart, the reports worker re-attaches to every run whose pid is alive and whose heartbeat is fresh, and requeues only dead runs. The API's spawned tasks (sites-ingest) use the same registry, so their status survives API reloads.
- **Hot config:** the prompts (soul, house style, researcher), model roles and lint lists are read from data files whose modification time is checked on each use, so a wording change needs no restart.

## Built 10-19

| Service | Port | Mode | Owns |
|---|---|---|---|
| siftersearch-gateway | 7839 | cluster ×1 | the tunnel's target. It routes by path (`api/gateway.js`) and retries a restarting service for up to 10 s before returning 503. |
| siftersearch-api | 7845 | cluster ×1 | search, library, documents, the public and admin APIs. It is the primary: migrations, seeds and the sync worker. |
| siftersearch-anis | 7844 | cluster ×2 | `/api/chat`, `/api/v1/anis`, `/api/v1/reading`, `/api/v1/companion`, the widget |
| siftersearch-ops | 7843 | cluster ×1 | `/api/admin/ops/*`, including `services`, the health view |
| siftersearch-indexer | — | fork | phrase, HyPE, concept and section vectors, BM25 and the coverage ledger (`ops/index-reports.js`) |
| siftersearch-reports (-carry) | — | fork | the other ops jobs, Dewey's included |

- **Cut-over, 10-19:** 18 requests were retried while the search API moved off 7839, and none failed. A 61-question battery ran straight through it.
- **Coordinator:** it boots each new build of the gateway, Anís and ops services on a test port (`/healthz`) before any reload. A build that fails is not deployed.
- **Still to do:** the `ecosystem.config.cjs` rule is still global, so any edit to it touches every service. It should affect only the apps whose own block changed. Phase 4, release directories and detached runs, is not started.
