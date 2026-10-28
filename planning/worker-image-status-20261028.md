# Worker image / AMD GPU path - status and handoff (10-28)

## Done (committed + pushed, deployed to tower)
- **ASR benchmark** (scripts/media/asr-bench/, results in worker-image-design-20261028.md): whisper.cpp HIP on boss gfx1151 wins - WER 2.7-8.3 % (CPU int8 4.1-7.5 %), RTF 0.023-0.05 (CPU 0.12-0.14), 450 MB RSS + ~2.7 GB VRAM per stream. **Boss GPU ASR is proven.**
- **GPU-only ASR path**: `worker/cpp_asr.py` (refuses unless the log names the GPU backend), `media_tool.py asr_engine()` (whisper.cpp on a host with /dev/kfd, faster-whisper CUDA otherwise), `runpod_worker.new_asr`, ROCm sampling in `gpu_lease.py` and `controller.py` (GPU-busy % and CPU-busy % in the heartbeat).
- **Host admission** `worker/capabilities.py`: proven GPU (either vendor) + VRAM >= 8 GB + RAM >= 16 GB + >= 4 CPUs, else exit 3 with the reason; pods self-terminate. Test: tests/api/media-capabilities.test.js.
- **`:rocm` image** (`docker/media-worker/Dockerfile.rocm`, built on boss by `scripts/media/whole-worker/build-rocm.sh`, 14.7 GB): admission self-test passes in the container; a full whole job (grade, enhance, ASR, diarize, UniPASE, realign, encodes, verdict - 16 files) ran on boss. Local tag `sifter-media-worker:rocm-cand`; push to `ghcr.io/chadananda/sifter-media-worker:rocm` was still uploading from boss when this was written (log `/mnt/data4tb/rocm-push.log` on boss; "digest: sha256" at the end = done; then `docker logout ghcr.io` as root on boss - a write:packages token is stored there until then).
- **Boss takes `whole` orders** through the restricted gate (`whole_gate.py` start_whole / `bossWholeRecording`): one container at a time, 10 GB cap, MemAvailable >= 23 GB, GPU devices only, MIOpen cache mounted. Enabled by `boss_whole: true` in tower `data/run/media-worker-accepted.json` (set 10-28; set false to turn it off - nothing else changes).
- **One host per order**: `homeEligibleItem` (media-jobs.js) never offers an order another host holds. Vendor-blind: no aorus-first rule; a free host pulls the next order. Test: tests/api/media-whole-dispatch.test.js.

## Not done
- **Capability-ranked scheduling** (EWMA audio-seconds per wall-second per host, more concurrent jobs for the stronger host): only the free-host pull exists. Boss runs ONE whole container; no concurrency from the live monitor yet.
- Digest-pinned `:rocm` in `whole-image-rocm.txt` on boss (uses the local tag until the push finishes), CI build of `:rocm` (the workflow still builds only the CUDA image; the ROCm build needs the CUDA image's data, so it is built on boss).
- Alignment is the slow stage on boss (whisperx CTC, 0.38 RTF under load) - worth profiling. Whole job on boss measured ~1.0 RTF total on a 300 s clip (dfn 0.26, transcribe+align 0.38, UniPASE 0.25, restore ASR 0.05).
- Diarization on AMD runs on the CPU provider (no ROCm sherpa build); ClearVoice cleanup venv (/opt/cv) is not in the `:rocm` image, so held talks get no deterministic cleanup there.
- Hardware probe / self-calibration written to the manifest, but the R2 / HTTP-input pod path (design points 4-8) is not built. No pods were rented.

## Exact next commands
- Is the push done: `ssh boss 'tail -2 /mnt/data4tb/rocm-push.log'`; then `ssh boss 'sudo docker logout ghcr.io'` and put the digest in `~/media-asr/whole-image-rocm.txt`.
- Watch boss whole orders: tower `data/run/cloud-remaster.json` (`home.boss`, `done[]` mode whole, `failed[]`), GET /api/admin/ops/services (cloud_gpu, host_memory).
- Turn boss whole off: set `boss_whole` false in tower `data/run/media-worker-accepted.json`.
- Rebuild the image: `node scripts/media/whole-worker/prepare-image.mjs tmp/rocm-ctx`, rsync to boss, `scripts/media/whole-worker/build-rocm.sh <ctx> sifter-media-worker:rocm-<tag>`.

## Needs Chad
- Aorus was offline for hours earlier today and is back (4 slots); it still has the pre-cap `capped.sh` / old gate to copy when convenient.
- Decide boss memory option (a/b) in docs/ops/boss-memory.md; the whole container needs MemAvailable >= 23 GB, which boss often lacks while llama-coder/laya are resident, so boss whole orders will wait on that rule, by design.
