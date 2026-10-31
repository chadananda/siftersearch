# Media stages: the checklist, classes, profiles, re-runs

Chad, 10-31: "the task checklist [should be] easily extensible so we can add new tasks easily along the way and reprocess just that task across the library."

**The one place:** `api/lib/media/stages.js`, specifically `STAGE_DEFS`. These all derive from it:

- `STAGES`, `COMPLETE_STAGES`, `AIR_STAGES` and `DEPENDENTS`
- the stage list of each job type (`TYPE_STAGES`) and each job's class (`JOB_CLASS`)
- the feed's stages
- every fingerprint

`buildRegistry` refuses a bad declaration, so a mistake fails at import time.

## How to add a stage

Add one line to `STAGE_DEFS`, at its place in run order:

```js
{ name: 'topics', class: 'llm', after: ['transcribe'], tool: 'llm:media-topics', settings: { model: 'haiku-5-5' },
  run: async ({ item, meta, dir, d, spend }) => ({ topics: n }) },
```

The fields are:

- **class** (required): `gpu`, `cpu` or `llm`. It decides where the stage may run (see below).
- **job**: the bundle the stage ships in. It defaults from the class: gpu → `gpu`, cpu → `cpu-finish`, llm → `text`. A bundle never mixes classes; the registry throws if one does.
- **after**: the stages this one is made from. They must come earlier in the list. Re-doing a parent un-ticks this stage. A text or publish stage can never be the parent of an audio stage, so a text fix never reaches the audio.
- **tool** and **settings**: what does the work today. The stage's fp is a hash of the two. Every tick records `{at, tool, settings, fp}` in `meta.stages`, and the ledger `media_stages` mirrors it.
- **required**: true by default. A talk that lacks a required stage is incomplete.
- **blocksAir**: false by default. A stage has to opt in. A talk that lacks a stage with blocksAir set is off air.
- **feed**: false by default. Setting it to true means the media feed completes the stage on every published talk that lacks it. Opting in is approval of that spend, so check the cost first. When feed is false, the stage runs on new talks as they pass through the pipeline, and on published talks only through a re-run campaign.
- **run**: an optional `async (ctx) => record`. The built-in stages are the branches of `runItem` in `api/lib/media/item.js`. A new stage can bring its own `run`.
- **infer**: an optional `(meta) => {tool, settings}`. It backfills the record of a stage that was ticked before records existed. The ledger reconcile (`media-ledger-reconcile` report) carries the backfill into `media_stages`.

That is all it takes. After the next deploy, every talk lacks the new stage, so `next_stage` names it. With `feed: true`, the feed queues only that stage and its dependents on those talks, paced by its class, and the talk stays on air unless the stage sets `blocksAir`. The tests in `tests/api/media-stages-registry.test.js` prove this with throwaway stages: `topics` (llm) and `radio` (cpu, after quiet + transcribe).

**Changing a stage's tool or settings** (a new model, a new version) changes its fp. That makes only that stage stale. Nothing re-runs by itself; you start a re-run campaign (below).

## Resource classes

Per-class settings live in `CLASSES` in `stages.js`, and nowhere else:

| class | what it is | where it runs | concurrency |
|---|---|---|---|
| gpu | processor-heavy, on a GPU | pods, Aorus | `MEDIA_GPU_CONCURRENCY` (2) |
| cpu | processor-heavy, on cores | Boss, Aorus spill | `MEDIA_STAGE_DEPTH` (2) |
| llm | service-bound: LLM, external API, light bookkeeping | tower or any host, async pool | `MEDIA_LLM_CONCURRENCY` (12), `MEDIA_LLM_RPM` (120) |

Tower runs llm stages only. A gpu or cpu stage reached on tower throws `WorkerWait`: the item is requeued, and there is never a tower fallback. Archive, thumb, render, ingest, catalog, links, preview and update are classed llm because they are light, not because they call an LLM.

## Worker profiles

The profiles are declared in `PROFILES` in `stages.js`. They are mirrored in `scripts/media/worker/job-types.json` under `profiles`, and a test keeps the two equal.

| profile | takes classes | hosts |
|---|---|---|
| `gpu` | gpu | pods, Aorus's GPU |
| `cpu+llm` | cpu, llm | Boss, Aorus's spare cores |
| `llm` | llm | tower, anywhere |

A worker starts with `queue-agent.mjs --profile <p>`. Its claim types are the contract types whose `needs` the profile takes, in contract order:

- Boss: `--profile cpu+llm --device none` claims `cpu-prep,cpu-finish`.
- A pod: `--profile gpu --idle-exit-min 10`.
- Aorus: `--profile gpu --spill cpu-prep,cpu-finish`. Spill stays an explicit host choice.

`--types` still works as an alias, and it wins when both are given. llm jobs (text, publish) are not queued yet; they run in tower's feed pool, so `--profile llm` on a worker is refused for now.

## Re-run campaigns

```
node scripts/ops/ops.mjs media stages                                        # the registry: class, job, fp, after, flags
node scripts/ops/ops.mjs media rerun <stage> [--where fp!=current|tool=X|fp=X|all] --dry-run
node scripts/ops/ops.mjs media rerun <stage> --canary [--limit 20]
node scripts/ops/ops.mjs media rerun <stage> --full
```

- **dry run**: reports the talk count, audio hours, and estimated $ (the stage's p75 $/audio-hour from the ledger × hours). Nothing changes.
- **canary**: marks 20 talks, or `--limit`. Check them before going on.
- **full**: runs as an ops job and marks every candidate. The feed then re-does them at the class's concurrency, in priority order. Priority is order, never a filter.

The feed then works the marked talks for that stage, and only those. It does not touch other talks that lack the stage. Marking a talk keeps the old tick and adds `stale: {at, campaign}`. The talk stays on air while the stage, and only that stage plus its dependents, is re-done. On a published talk, `update` is added so the page re-renders. A busy talk is skipped. Only llm stages and feed stages (quiet) can be re-run this way; any other gpu or cpu stage goes through the typed chain. There are no patch job types: a fix is a stage change, and the feed or chain completes it.
