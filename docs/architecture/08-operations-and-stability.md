# 08 — Operations & Stability

> **The RAG problem nobody warns you about:** a retrieval system is a set of *loops* — watch,
> ingest, embed, sync, enrich. If any loop can retry the same failing item forever, then the first
> un-processable input doesn't just fail — it pins a CPU, floods the index queue, and starves search
> across the whole system. Stability is not luck; it is a property you design in, one loop at a time.

This document is about keeping the system fast, cheap, and — above all — **convergent**. It doubles
as a case study, because the central lesson here was learned by breaking production.

---

## The convergence principle

> **Every loop that writes content or syncs to the index must converge: each item either succeeds
> (done) or reaches a recorded terminal state (not retried), never infinite-retry.**

A loop without a terminal failure state is a time bomb. It runs fine until it meets one item it
cannot process — then it retries that item every cycle, forever, doing no useful work at 100% CPU
while the real queue backs up behind it. Search slows not because search is slow, but because the
indexer is thrashing.

The observable signature of *health* is drainage: over any window, with all workers running,

- Meili's **enqueued** task count is flat or falling (not growing),
- **`content` rows with `synced = 0`** are flat and low (no dirty churn),
- no worker sits at 100% CPU,
- keyword search latency stays bounded (sub-second).

If any of these grows without bound, a loop is non-convergent. This is measurable, and it is
measured (see §monitoring).

---

## Case study: the file that took down production

The failure that motivated this whole discipline:

1. A few oversized paragraphs in the `bahai-library` set exceeded the embedding model's
   8192-token input limit. The embed call returned a 400.
2. The ingester recorded a document's `file_hash` **only after** a successful embed. Because the
   embed threw, the hash was never recorded.
3. Next cycle, the watcher saw a file with no recorded hash → "changed" → re-ingest → embed → 400 →
   throw → no hash. **Forever.** One CPU pinned at 100%, re-processing the same handful of files
   every cycle.
4. Meanwhile every legitimate paragraph waited behind the thrash, so the Meili queue never drained
   and semantic search stayed slow. The symptom ("search is slow") was three steps removed from the
   cause ("an un-embeddable file loops").

The wrong fixes (tried and discarded): reset `synced` flags, restart workers, blame RAM, blame load.
The user's diagnosis cut through it: *"I have not used Meili for search in weeks and have not added
documents. Any backlog is structural, not load."* Exactly right — a system with no new work and a
growing queue has a non-convergent loop.

### The structural fix

Make the embed call **incapable of the throw** that broke convergence. `embedOpenAI`
([07](07-embeddings-and-vector-index.md)) now caps every input to 8000 chars, replaces empty inputs,
and bounds each request by both count and total characters. For *any* input any caller can produce,
it returns vectors instead of a 400. The oversized file now embeds (truncated), the ingester records
its `file_hash`, and the file is **skipped next cycle**. The loop terminates.

Note the shape of the real fix: not "handle this file specially," but "**remove the failure mode
that prevented the loop from ever reaching a terminal state.**" That is what "fix it structurally"
means.

---

## Convergence built into the data model

The schema is designed so convergence is checkable per stage. Each projection has its **own dirty
flag** on `content`:

| Flag | Loop | Terminal condition |
|---|---|---|
| `synced` | paragraph → Meili `paragraphs` | Meili task `succeeded` → `synced = 1` |
| `enhanced_synced` | HyPE → `hype_questions` | questions embedded + upserted → `1` |
| `grounded_synced` | grounded embedding → Meili | synced → `1` |
| `graph_enriched` | entity extraction | extraction recorded → `1` |

Because each flag is independent, one stage stalling never forces another to re-run, and each can be
*proven* to drain to zero on its own. Every enrichment worker follows the same contract: **select
`WHERE not-done`, do the work, mark done.** A worker that re-processes already-done rows creates
`synced = 0` churn — a non-convergence — and is a bug.

The **verified sync** ([02](02-ingestion.md) §5) is the paradigm case: `synced = 1` means "Meili
confirmed it," so a failed task simply leaves the row dirty for retry — it converges instead of
silently losing data (which optimistic marking would do).

---

## Performance decisions

Stability first, then speed. The speed levers, in order of leverage:

1. **Binary quantization** ([07](07-embeddings-and-vector-index.md)) — 32× smaller vector index,
   ~10–40× faster ANN. The single biggest search-speed win. (Enabling it triggers a one-time,
   multi-hour re-quantization of existing vectors that blocks other indexing — do it in a
   maintenance window.)
2. **512-dim MRL embeddings** — 6× smaller and faster to index than the model's native 3072, with
   most of the quality retained.
3. **The deterministic/AI split** — keeping the LLM out of the retrieval hot path means the fast
   layer is genuinely fast; the seconds of latency in a full search are the *AI analysis*, isolated
   and separately optimizable, not the retrieval.
4. **Cross-tradition fan-out** is kept only while its sub-queries are cheap (which binary
   quantization ensures); it collapses to a single query + in-app diversification if measurement
   ever shows the fan-out dominating.

The discipline throughout: **measure before optimizing, and don't make speculative changes to tuned,
critical paths.** The fan-out is not collapsed on a hunch; it is collapsed only if the numbers demand
it.

---

## The AI provider layer (cost control)

All model calls route through a central layer (`api/lib/ai.js`, `api/lib/ai-services.js`,
`api/lib/model-registry.js`) so that:

- **Providers swap without touching call sites.** The registry maps logical model names to concrete
  API model IDs; changing a provider is a config edit.
- **Every call is logged** for cost and usage tracking.
- **Tiering matches model to job.** Heavy, parallel **backend** work (disambiguation, HyPE,
  extraction) uses **DeepSeek** — cheap at volume, and prefix-cache-friendly (per
  [03](03-disambiguation-and-segmentation.md)): v4-flash for the bulk, v4-pro for flagship +
  doctrinal books. **User-facing** answers use **fast GPT-turbo / Haiku-class** models — where
  latency is felt and quality-of-phrasing matters. (The former local-Qwen-on-`boss` bulk-enrichment
  path was retired 2026-07-10 along with the six always-on enrichment/entity workers — see
  [unified-enrichment-pipeline.md](unified-enrichment-pipeline.md).)

Centralization is what makes "switch everything to DeepSeek for backend" or "use Haiku for the live
answer" a one-place change rather than a scavenger hunt through hardcoded model strings.

---

## Monitoring and proof

Stability is *claimed* only when *measured*. A committed harness,
`scripts/siftersearch-meili-stability-check.mjs`, samples the convergence signals over a window (all
workers running) and prints a verdict:

```
node scripts/siftersearch-meili-stability-check.mjs [samples=12] [intervalSec=30]
```

It reports, per sample: Meili `enqueued`/`processing`, `isIndexing`, `content` rows with
`synced = 0`, and Meili keyword-search latency. The verdict is **STABLE** only if, across the whole
window, the enqueued queue is not growing, `synced = 0` is flat and low, and keyword p95 stays under
a threshold. This turns "it feels stable now" into a repeatable, falsifiable check — the difference
between *hoping* it's fixed and *proving* it.

Two other operational aids: a cron-generated status JSON served at
`/api/admin/server/pipeline` (instant health without SSH probing), and PM2 for process supervision.

> **Recovery, not reset.** If Meili needs rebuilding, **restore from the rsync backup** — do *not*
> `UPDATE content SET synced = 0` on millions of rows. A mass reset queues millions of re-sync jobs
> and takes days at the sync throughput; restoring the index directory takes minutes. The health
> check deliberately fails fast on "MASS RESET DETECTED" as a tripwire.

---

## Deployment (two surfaces, three paths)

The system spans two surfaces ([overview](README.md)), and *how a change ships depends on what it
is*:

| Change | Path | Time to live |
|---|---|---|
| API / backend / scripts | commit + push → `siftersearch-updater` polls, pulls, restarts PM2 | ~5 min |
| Frontend (`.astro`/`.svelte`/layouts) | commit triggers the pre-commit hook → `npm run build` → `wrangler pages deploy` | ~2–3 min |
| DB content (docs, conversations) | admin API PUT (no commit) | edge-cache TTL (~5 min) |

The pre-commit hook runs lint → tests → version bump → build → Cloudflare Pages deploy, in that
order. Frontend changes reach the live site **only** through that hook — a `--no-verify` commit
skips the build+deploy, so frontend work committed with `--no-verify` never ships. The single canonical
SQLite lives on `tower-nas`; the **single-writer rule** (only the worker and watcher write; the API
is read-only) is what makes the whole convergence story possible — two writers racing on the
`synced` flag would reintroduce exactly the silent-loss failure that verified sync prevents.

---

## Recreating this

1. Make every write/sync loop converge: success **or** recorded-terminal, never infinite-retry.
   Record the "done" marker on *any* outcome, not only success.
2. Give each derived projection its own dirty flag; workers select `WHERE not-done`, do work, mark
   done — and never re-touch done rows.
3. Use verified sync (mark done only when the downstream confirms), so failures retry instead of
   losing data.
4. Measure convergence (queue not growing, dirty flat, no pinned CPU, latency bounded) with a
   committed harness; claim stability only when the verdict says so.
5. Optimize only what you've measured; don't destabilize tuned paths on a hunch.
6. Route all model calls through one layer so providers and tiers are config, not code.

→ Next: [09 — Appendix: schema & config](09-appendix-schema-and-config.md) for the full table
definitions and configuration reference.
