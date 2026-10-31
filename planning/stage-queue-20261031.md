# Stage queue: typed media jobs, capability claims, re-runnable checklist (Chad 10-31)

> Approved 10-31: one media job queue with TASK TYPES; workers claim by capability. RunPods = GPU only, rented while the GPU queue
> is long. Aorus = GPU first, spare cores take CPU. Boss = all CPU media work. Tower = coordinator + LLM text + publish, never heavy media.
> Every talk is remastered with UniPASE (the only stack so far that improves). A talk is complete when its ordered checklist is all ticked;
> complete talks publish. Later stages (names, quotes…) must re-run cheaply as they improve.

Replaces `planning/worker-unify-20261030.md` §Target 1–2 / Order 5–7 (job kinds whole|restore|post|cleanup → typed chain below).

## 1. The checklist (Chad 10-31: "an ordered checklist, not a version number")
- Each talk has one ordered list of stages (`STAGES` in `api/lib/media/item.js`); each is complete or incomplete. Complete talk = every box ticked
  AND the remaster box ticked by UniPASE output that passed the word/quality check. Complete → publish. Nothing else decides publication.
- A ticked box records WHAT did it: `meta.stages[s] = { at, tool, settings, fp }` — tool (`unipase`, `dfn`, `whisper-large-v3`, `quotes-llm:haiku-5.5`…),
  the settings that matter, `fp` = short hash of tool+settings. Mirrored to `media_stages` (columns `tool`, `fp`).
- Each stage declares its current tool+settings in code (`api/lib/media/stage-tools.js`, git-audited), so "stale" = recorded fp ≠ current fp for that tool.
- **Re-run = a query over the record**, e.g. "noise reduction done by process B with old settings", "quotes whose fp ≠ today's". Never "all talks".
  Matching talks get that box and the boxes after it that depend on it unticked (`AFTER` edges; never earlier boxes — fixing names never re-does audio;
  a test asserts no text stage reaches an audio stage).
- **Published talks stay on air while re-done:** unticking marks `stale` instead of deleting `at`; public files change only at the final `update` swap.
  Text files are snapshotted before a re-run and restored on failure.
- **Cost first:** a dry run returns talks, audio hours and $ (p75 of recorded per-stage cost); a 20-talk canary runs first; larger runs wait for Chad's OK.

## 2. Job types (per talk chain)
`intake (tower) → cpu-prep (Boss) → gpu (pod | Aorus: transcribe, diarize, UniPASE, re-ASR guard, realign — one job, audio loaded once)
→ { cpu-finish (Boss: guard/verdict, verify, web+trim one encode, waveform) ∥ text (tower LLM: correct, clean, describe, headings, quotes, links, assess) }
→ publish (tower: thumb, render, ingest, catalog, update)`.
Pods PUT only to R2; home hosts return results to tower's LAN file endpoint; everyone GETs the original from R2 (tower uploads once).

## 3. Queue (edge DO `worker/queue/core.js`, extended)
Job `{ id: type-item-inputKey, type, item_id, stages, tools (expected fp), contract, inputs[{store,key,sha}], invoice{audio_s}, need, priority, avoid }`.
Dependencies are not stored: tower creates the next job after adopting the previous result; a pure `nextJobs(checklist)` re-derives anything lost.
Claim: `{ host, types (preference order), can, contract, device, free }`; Aorus adds `spill: ['cpu-prep','cpu-finish']` (taken only when its GPU deck is full
and the CPU queue > 1 h). Boss: `--types cpu-prep,cpu-finish --device none`. Pods: `--types gpu --idle-exit-min 10`.

## 4. Ordering and pod count
Priority is order, never a filter: new talk > remaster of a published talk > re-run campaign; 1 claim in 5 goes to the oldest lower band.
Pods wanted = `clamp(ceil((G+P)/2h − R_aorus) / R_pod), 0, maxPods)`, capped so pods never outrun Boss's prep rate. Pods leave by idle-exit only.
Rent only when the GPU queue is long (the pod formula above gives > 0); pods take only `gpu` jobs (`--types gpu --idle-exit-min 10`), and the first pod's measured gpu-only rate sets R_pod (until then at most one pod). Code: `podsWanted` / `podPlan` in worker/queue/core.js over both queues → `st.pod_plan`; drives rentals when `MEDIA_POD_TYPED=1`.

## 5. Result validity
Hash the words, not the file: `wordsKey = sha256([n, lang, words.w] per paragraph)` (JS `api/lib/media/words-key.js` + Python twin, shared fixture).
Timing re-stamps keep the key; `resign()` and whole-file `work_sha` go. Guard/realign compare to the RAW heard words, so text re-runs never invalidate audio.

## 6. Failure: bounded, ending at Chad
3 attempts per job (failing host → `avoid`); classes transient | input | contract. Per talk ≤ 6 attempts → `needs_chad` with the reason.
A UniPASE copy the check flags is NOT done: it goes to Chad's review list (A/B clip of the flagged spot), never back into the queue and never
published as "finished" on the original. Terminal outcomes: published | duplicate | excluded | needs_chad. Stuck detector: no change in 24 h → re-derive.

## 7. Steps (each ships working)
1. wordsKey (fixes false transcript rejections). 2. Checklist records tool/settings/fp; stale-instead-of-delete. 3. Re-run campaigns (text): query, dry run,
canary — names/quotes improvements ship here. 4. Queue core: type claim, spill, per-type rates. 5. Agent types (Boss CPU-only, Aorus spill).
6. Split whole → prep/gpu/finish behind a per-talk fraction. 7. Coordinator replaces queue-feed + ssh lanes. 8. Slim GPU image + CPU image.
9. Delete: ssh spool lane, homePick/podPick, ASR/DIAR lanes, gate/cloud/home-recording, resign, work_sha, old kinds.

## Open
- D1 DFN in the gpu job (else Boss uploads ~100 MB/audio-h to pods). Recommend gpu job.
- D2 Guard against raw heard words (recommended).
