# Edge job queue — one image everywhere (Chad 10-30)

Goal: tower stops coordinating GPUs. It imports and stages, enqueues; a Cloudflare Worker hands out jobs;
every machine (aorus, boss, RunPod pods) runs the SAME image and pulls work; results land in R2; tower pulls
them at leisure, validates and places.

## Why
Today the lane on tower (`api/lib/ops/media-jobs.js`) pushes jobs over ssh/gate per host, holds per-host state,
and a deploy drains it (requeues in-flight remaster runs → backlog → held lane → idle GPUs). Home hosts need
special builds (`HOME_BUILDS`) and a separate transport (gate). Every new machine = new code paths.

## Shape
1. **Queue = Durable Object** (`media-queue`, one instance; strongly consistent, single-threaded → no double
   claims). D1 mirror for the /media dashboard + history.
2. **Job JSON** (tower writes it on enqueue):
   `{ id, item_id, kind: whole|restore|post|cleanup, inputs: [{ name: 'raw.ogg', sha256, local: '/tank/…/raw.ogg', r2: 'stage/<id>/raw.ogg' }, { name: 'meta.json', … }], image, params, need: { vram_mb, ram_gb } }`
3. **Workers pull**: `POST /q/claim { host, free_vram_mb, free_ram_gb, has_local: true|false }` → a job whose `need`
   fits, with a lease (e.g. 10 min) + presigned R2 GET/PUT URLs. `POST /q/heartbeat` extends; expired lease →
   job goes back. `POST /q/done | /q/fail`.
4. **Fetch rule in the image**: use `local` if the path exists and the sha256 matches, else `r2`. Home machines on
   the Dropbox/NFS mount read locally; pods read R2. No other per-host difference.
5. **Results → R2** via presigned PUT URLs the Worker signs (bytes never pass through the Worker: its request body
   limit is 100 MB, a 2 h talk's outputs exceed that). Done record lists keys + hashes.
6. **Tower pulls** done results on its own schedule (a light job, no GPU), validates hashes + the word guard
   verdict, places files, marks the item. A tower deploy no longer touches running GPU work.
7. **Pods**: the Worker (cron) rents/terminates RunPod pods from queue depth + budget; or keep that on tower in
   phase 1 and move later.

## Phases
- **P1** DO queue + claim/lease/heartbeat/done API + tests; tower enqueues alongside the current lane (shadow).
- **P2** worker-side `pull.py` in the image (claim loop, local-or-R2 fetch, presigned upload); run on aorus.
- **P3** tower result-puller + placement; aorus+boss switch to pull; lane stops pushing to home hosts.
- **P4** pods switch to pull; pod rental moves to the Worker cron; retire gate transport + HOME_BUILDS.

## Decisions (Chad 10-30)
- **Pod rental stays on tower.** Rule: rent pods when the queued work is estimated at > 3 days for the engaged
  home machines (estimate = queued audio hours ÷ measured per-host rates).
- **R2 is a padded window, not a mirror.** Tower keeps only enough jobs staged (raw.ogg + meta.json in R2,
  enqueued) for an estimated several hours of work across all engaged devices; when the staged estimate drops
  below a low-water mark it stages more. Inputs are deleted from R2 when their job is done. Home machines may
  still read their local copy; the R2 copy is what makes a job claimable by anyone.
- The queue only ever holds staged jobs — so a claim never waits on an upload.
