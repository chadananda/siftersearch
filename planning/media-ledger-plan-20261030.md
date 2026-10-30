# Media ledger + staged audio (Chad 10-30)

> "We ran into difficulty getting solid numbers on which audio had which stages applied. All of that would have been better
> served with a lightweight sqlite table managing the stages of each staged or published audio file." — then "wrap all that
> in a nice internal CRUD API and give it to Dewey".

## Why the numbers were never solid
The truth of a talk's stages is `meta.json` in its folder (`meta.stages[name] = {at, ms, …}`). The DB only holds summaries
derived from it (`stages_done` string, `stages_missing`/`next_stage`/`verdict`, migr 173/187), refreshed when `runItem` finishes a
stage — but ~10 other code paths write `meta.json` (whole-recording results, cloud results, supersede, hints, identity,
descriptions, the whole-worker) and never refresh them. So counts drift, and a count needs a walk of 10k files.

## What exists already (reuse, don't duplicate)
- permanent id = `media_items.id`; slug; work folder = `media_items.dir`; `meta.json` with all metadata; `sha256` dedupe.
- the cloud lane (`mediaCloudRemasterJob`) = the single assigner; R2 stage-ahead (`r2-stage.js`) with removal on exit.

## Design
1. **`media_stages`** (sifter.db, repo `media-ledger-repo.js`): one row per (item, stage): `status` done|failed|running|redo,
   `at`, `ms`, `host`, `version`, `detail` JSON (small: verdict, sizes), `updated_at`. Indexed (stage,status). Counts = one GROUP BY.
2. **Sync from meta, not a second truth**: `ledgerSync(itemId, meta)` diffs `meta.stages` against the rows and upserts/deletes.
   Called from every meta writer (start: runItem save, whole-result, supersede); a reconcile REPORT (`media-ledger-reconcile`)
   walks all folders, catching any path not hooked yet, and reports drift count (target 0 → then a ratchet test forbids
   bare `meta.json` writes outside `meta-store.js`).
3. **Internal CRUD API** `/api/admin/ops/media/*` (X-Internal-Key): `GET items/:id` (row + stages + files), `GET items?stage=&status=`,
   `GET progress` (per-stage counts, audio-hours, rates), `POST items` (add by path/URL → existing media-scan), `POST items/:id/redo`
   (stages), `PATCH items/:id` (metadata fields). Mirrored in `ops.mjs`.
4. **Dewey tools**: `media_progress`, `media_status` (by id/slug/title), `add_media` (exists), `media_redo` (admin only).
5. **Staged form on tower** (cheap, gradual, all 10k): per item `audio.<ext>` = the original's audio track stream-copied
   (no re-encode — processing source; video never leaves tower), `raw.ogg` for streaming before remaster (web-encode slot),
   `meta.json` + sequence info. Preliminary transcript (first ~5 min → speaker/topic) is ASR = a WORKER job, never tower.
   Why not process the ogg: the web ogg is lossy and filtered (highpass + loudnorm) — the remaster would start from a damaged copy.
6. **R2 buffer**: the stager uploads `audio.<ext>` + `meta.json` + job bundle; pods pull; the lane deletes on completion (exists).
   Later: a pull dispatcher (Durable Object leases) so pods are fed through lane drains.

## Order
- [x] audio-only transfer (2b35266c)
- [x] 1. media_stages table + repo + ledgerSync + hook runItem/whole-result/supersede + reconcile report + tests
- [x] 2. CRUD API (`api/routes/media-ops.js`, logic `api/lib/media/media-status.js`) + `ops.mjs media …` + Dewey `media_progress`/`media_status` (redo = ops key only; Dewey has no admin role yet). PATCH metadata deferred
- [ ] 3. staged form (audio.<ext>, raw.ogg) gradual stager on tower; R2 bundle with meta.json
- [ ] 4. preliminary transcript job on workers; ratchet on meta.json writers
