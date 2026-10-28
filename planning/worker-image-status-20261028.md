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

## Update (later 10-28)
- **Boss whole memory**: option (a) kept (no BIOS/kernel change; llama-coder stays stopped). Measured cgroup peak of a whole container = 7.5 GB (incl. reclaimable cache), so admission is now MemAvailable >= 8 + 13 reserve (was 10 + 13); the 10 GB cap, oom_score_adj 900, PSI/thermal rules are unchanged. Boss was at 24 GB available, so whole orders flow (container recording-w1528 running).
- **Capability-ranked scheduling** (`updateRate`, `rankedSlots` in media-jobs.js; state `st.rates`): per-slot EWMA audio-s/wall-s from completed home orders; each tick a host keeps round(max slots x its rate / best rate) slots (min 1; unmeasured hosts keep all). Vendor-blind; one-host-per-order unchanged. Tests in media-whole-dispatch.test.js.
- **Aorus (RTX 3070 8 GB, 15 GB RAM) with 4 whole containers**: VRAM is fine (3 GB used with 4 running; in-container GPU leases serialise the heavy stages), but RAM was the real limit (4 x 10 GB caps on 15 GB). A container now starts only while the host has >= 5 GB MemAvailable (`WHOLE_HOST_MIN_AVAIL_GB`). Deployed to aorus only via tower (no change needed on aorus).
- `:rocm` in CI: not done (the build copies data assets from the CUDA image, so it is built on boss).
- GHCR push of `:rocm` from boss: all layers pushed except the final manifest at time of writing; check `/mnt/data4tb/rocm-push.log`, then `docker logout ghcr.io` on boss.
- **Open bug (boss whole)**: container recording-w1945 failed after 45 min in UniPASE with `cuFFT error: HIPFFT_PARSE_ERROR` (torch.fft.irfft, ROCm hipFFT runtime compile); tower retries once. A 300 s test ran clean; the 66-min talk w1528 passed UniPASE (~35 min, so ~0.5 RTF for that stage) and was in restore_asr at write time. Next: check `docker logs` for w1528, confirm result adoption on tower, and if hipFFT recurs mount a hipfft/hiprtc cache dir and add libstdc++/headers it needs (see Dockerfile.rocm MIOpen note).
