# GPU saturation: handoff (10-30, evening)

Goal: saturate the GPUs on the pods, Aorus and Boss, with every stage on the GPU on every platform. No CPU fallback for GPU stages (Chad).
Rules: no production DB access (use ops.mjs and the internal API); ssh tower-nas is for reads only; tower does no heavy media work;
poll with `scripts/ops/wait-until.sh`; budget cap $200; commit, push and deploy continuously.

## FIRST on restart: check the "3 remasters/hr" readout (Chad's screenshot ~/tmp/clipboard-20261030-172742.png)
- /media says 5 workers but only about 3 remasters per hour. Chad: "That is simply not possible or our entire pipeline is junk."
- Verify two things:
  1. Is the number right? The rate comes from the stage ledger, counting remasters finished in the last hour (commit a29b8231). Cross-check with `node scripts/ops/ops.mjs media progress` and `ops.mjs media stage remaster --after …`.
  2. If it is right, where does the time go? Run `ops.mjs media gauges --hours 6` (per-host busy-but-GPU-idle share and the stages behind it).
- Known suspects:
  - The light **encode** chain costs about 6 CPU-min per talk.
  - DFN and sherpa diarize ran on the CPU in the old pod image. The pods still run the 10-26 image, so the fix below has not reached them.
  - Aorus runs 1 slot on 6 CPUs.

## Done this session (commit 66dab2da, pushed; frontend deployed 2.187.875)
- **Diarize goes through the GPU torch** (`scripts/media/worker/torch_diar.py`, `MEDIA_DIAR_PROVIDER=torch` in `whole-worker/recording.mjs`). On ROCm, a model with no torch port raises instead of falling back to the CPU.
- **DFN runs in `/opt/gate/venv` (GPU torch)** and checks that its parameters are on cuda (`media_tool.py cmd_dfn`).
- Measured on the Aorus 3070 with a 600 s clip:
  - diarize: 11 s, 742 MB VRAM.
  - dfn: 7 s, 1.2 GB VRAM.
- **`docker/media-worker/Dockerfile.delta` + `scripts/media/whole-worker/build-delta.sh <base@sha256> <tag>`** layer the current code and deps onto the accepted image, giving a few-MB delta built on Aorus.
  - Already built: `sifter-media-worker:gpu-20261030` on Aorus (image 057404909c31; smoke test passed).
- **New route `POST /api/admin/ops/media/worker-image`**, with the CLI `ops.mjs media promote-image <ghcr…@sha256:…> --evidence "…" [--home aorus=tag,boss=tag] [--quiet aorus,boss]`.
  - Writes `data/run/media-worker-accepted.json` atomically and keeps `previous_image`.
  - It replaces ssh edits of that file.
  - Code is in `api/lib/media/cloud.js promoteWorker`. Tests: `tests/api/media-promote-worker.test.js` and `media-gpu-stages.test.js`.
- The /media machine cards are tighter (RestoredStrip.svelte) so the CRT lines fit.
- Tower deploy check for 66dab2da: see the commit log; re-run `node scripts/ops/deploy-check.mjs` if unsure.

## In flight
- **Acceptance run on Aorus:** container `accept-gpu1`, job dir `/data/media-gpu/tmp/accept-gpu1`.
  - It is a full whole-recording talk (id 1687, amatul-baha, 5221 s) with `device: cuda`, `--cpus 8 --memory 10g`, using image gpu-20261030.
  - At 17:25 it was in `encode`.
  - Check it with `ssh aorus 'cat /data/media-gpu/tmp/accept-gpu1/progress.json; docker logs --tail 20 accept-gpu1'`.
  - Then check result.json and the per-stage timings.
- Container tip: the image's entrypoint ignores the command, so pass `--entrypoint /opt/gate/venv/bin/python` (or node) for ad-hoc runs.

## Next steps, in order
1. If accept-gpu1 passes, push the image from Aorus:
   ```
   docker tag sifter-media-worker:gpu-20261030 ghcr.io/chadananda/sifter-media-worker:gpu-20261030 && docker push …
   ```
   Then read the digest and run `ops.mjs media promote-image <digest> --evidence "…" --quiet aorus,boss`, or `--home` if home builds are needed.
   - Pods pick up the new image by draining as stale images (one at a time, no in-flight talk lost).
   - Background on pod images: pods run the immutable accepted image only, so no code overlay is shipped. `HOME_BUILDS` in `api/lib/ops/media-jobs.js` (~line 1575) maps digests to home tags.
   - Verify that GPU use rises with `ops.mjs media gauges`.
2. **Make the light encode cheaper:** adeclick, single-pass loudnorm, fewer probes. It is the biggest CPU sink per talk.
3. **Raise Aorus capacity:** more queue-agent slots and a higher `--cpus` (box: 2.8 TB free, 15 GB RAM).
4. **Boss ROCm:** rebuild with the same deps (build-rocm.sh), test diarize and dfn on Boss, then raise its concurrency.
5. Put the delta's pip deps into both full Dockerfiles (CUDA and ROCm): deepfilternet 0.5.6, deepfilterlib, onnx2torch, onnxsim, loguru, appdirs and the rest.
6. Leave `scripts/media/worker/gpu_lease.py`'s uncommitted diff alone. It belongs to another session.

## Collection importer (Chad asked, still unanswered in chat)
Per planning/donor-intake-plan-20261030.md, another session built part of it today:
- **Done:** A (donors, drives and items; the golden-age catalog adopted, 283,964 files → 143,705 items) and C (the /admin/imports page plus /api/admin/imports/*).
- **Not done:** B (worker samples), D (import plus the printed report per drive) and E (backfill of older collections).
- "More info" only records the request.
