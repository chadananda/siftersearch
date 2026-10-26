# Validate worker images locally before RunPod

Paid rentals remain paused until the image passes on Aorus. A successful image build alone does not qualify it for paid use.

## Persistent rental hold

`data/run/cloud-rentals.pause` contains the operator's reason. Its presence blocks the lane keeper and the rental API,
including retries and restarts. An empty file also pauses rentals. The cloud lane finishes assigned jobs without taking
new ones, then closes its pods; queued talks and originals remain available for a later resume. The services endpoint
reports the reason as `cloud_gpu.rentals_paused`.

Keep the hold in place while testing. Remove it only after local validation succeeds and the validated image tag or digest
has been selected for production. Do not use a changing `latest` tag as evidence that the deployed image was tested.

## Aorus prerequisites

Docker and containerd must keep their image data on `/data`, not the small root filesystem. Confirm the Docker root and
containerd configuration, free space, GPU visibility, and that no existing containers need to be interrupted before moving
storage. Preserve the original storage and back up the configurations so a failed migration can be rolled back.

The prepared 2026-10-25 migration script is `/home/chad/aorus-docker-storage.sh` on Aorus. It requires an interactive sudo
login; the agent cannot supply a password. Until that step completes, do not pull the large worker image onto Aorus.

## Local image test

Run `scripts/media/local-image-test.sh <pinned-image-tag-or-digest> --gpu` on Aorus. It exercises the actual image entrypoint,
SSH, gate capacity, trim-window encoding, grade, DeepFilterNet, probe, and the baked image self-test. The harness requires an explicit version tag or digest, records the local image ID, and starts that exact image.
Each detached job is polled for up to ten minutes; grade and DFN run sequentially to fit the 8 GB validation GPU.
The test owns a unique
container and publishes SSH only on localhost; cleanup removes that container and its temporary files, without global
Docker pruning or deleting other containers.

Also run representative short English and Persian speech jobs through the GPU worker and alignment path before clearing
the hold. Check output duration, aligned word coverage, guard decisions, and GPU use. Retain image identity and test results.

## 2026-10-25 incident

The cloud keeper recreated three workers after maintenance even though Aorus validation had not happened. The workers were
created that evening, rather than being yesterday's abandoned instances. Rentals were held, the active cloud run yielded,
its restart entries were cancelled through the internal ops API, and RunPod subsequently reported zero SifterSearch pods.
The rental hold remains active. Local GPU validation and paid resumption are not complete.

## Follow-up verification, 2026-10-25 evening

Tower critical-path checks passed, including public pages, API health, internal search, the writer and signed S3 access.
Core service heartbeats were current. The rental hold is still present; the latest reaper reported zero pods.
Aorus still reports Docker root `/var/lib/docker`; `/data` has 3.4 TB available. Its RTX 3070 was idle at 49 °C.
`sudo -n` requires interactive authentication. The prepared migration has not been run; it changes system configuration
and stops Docker/containerd, so Chad's explicit approval and interactive sudo are required before proceeding.

The harness changes passed Bash syntax checking and rejected `latest` before any Docker access.
The image itself, representative English/Persian speech, guard and alignment still need GPU validation.

## Local acceptance completed, 2026-10-25

- Docker migration verified: `/data/docker`, containerd storage at `/data/containerd`; root remained at 45 GB used.
- Image: `ghcr.io/chadananda/sifter-media-worker@sha256:f6bbfcc807ebbe68a8faf54c133c1d58a6ad4c31e4297328de31dbb9f317b8ea` (tag `20261025-81a40a15`).
- Real entrypoint/SSH/gate smoke and baked self-test passed in 98 seconds after the cold pull.
- Aorus's 8 GB GPU could not hold UniPASE and Whisper together, so speech acceptance ran the same GPU stages sequentially. Combined residency remains for the >=16 GB rental canary to verify.
- English: GPU restoration, separate GPU transcription and 81/81 aligned words; the guard correctly held the clip at 16.7% fallback.
- Persian: GPU restoration, separate GPU transcription, 64/64 aligned words, 0% fallback and all four web encodes.
- Found and fixed a bootstrap cache mismatch: English alignment was baked under `/root/.cache/torch` but bootstrap selected `/opt/models/torch`, causing a 378 MB runtime download. Both English/Persian aligners loaded successfully with networking disabled after correcting the path.
- GPU host/spending tests: 77 passed, including the bootstrap cache regression assertion.
- Production image pinned to the digest; fresh canary gate set, queue and cumulative spend retained. Media service asked to drain gracefully while the rental hold remains active.
- Raw logs/results: Aorus `/data/sifter-image-validation-81a40a15.log`, `/data/sifter-speech-validation-81a40a15.log`, `/data/sifter-validation-81a40a15/speech-check.json`, `/data/sifter-offline-aligners-81a40a15.log`. Local copies: `tmp/gpu-validation/`.

### Long-job liveness fix

The GPU runner previously refreshed `.worker-status.json` only between synchronous `run_job` calls. Any healthy long job could therefore exceed Tower's four-minute stale-status threshold and have its pod retired. Status sampling now runs in an independent daemon thread, with a lock around controller state shared by the GPU and postprocessing threads. A regression test blocks the job thread while checking that heartbeat timestamps advance and memory pressure still stops admission. The full related set passes: 123 tests. The first rental received this code through the existing bootstrap script bundle (the image's dependencies/weights remain pinned).

First new rental: `sifter-unipase-99`, RunPod ID `967v58xw4qhdp9`, 24 GB GPU, $0.89/hour. Ready after roughly eight minutes; received four recordings; GPU utilization reached 98% while heartbeats continued. Initial first queued talk is 97 minutes. Pool stays at one until a complete result returns.

### Overnight continuation

The canary completed and published a real result (Ḥuqúqu’lláh, 460 seconds), with the original retained. A 97-minute talk completed UniPASE plus both ASR passes in 274 seconds (~21x real time). Continuation run 22674 raises the pool limit to three while preserving the canary and its pending results. Prefetch depth raised from four to six after observing the GPU waiting on four CPU postprocessing tails; execution admission and memory/temperature limits remain controlled by the worker. The idle clock now also advances during CPU postprocessing, so a long useful tail does not consume the worker’s idle allowance.

### Bound orchestration passes

Observed a second worker reach model-ready but receive no work while the shared orchestration tick transferred a large batch for the first pod. It idled out. Each ready pod now handles at most one finished-result download and one new upload per pass; uploads also stop as soon as the service is draining. This keeps startup/status checks moving and bounds graceful reload latency while retaining the six-job prefetch target. Two regression tests verify that four uploads and three completed results are spread over separate passes. GPU spending suite: 48 passed after this change.

### Resource-wait crash and allocation recovery

Reproduced a media-manager crash in a standalone Node child: `asr()` returned a rejected local fallback promise, then awaited temporary-file cleanup in `finally`, allowing `WORKER_WAIT` to become unhandled before the caller could receive it. `return await local(...)` fixes that ordering; the child-process regression now survives and receives `WORKER_WAIT` normally.

Restarting during a slow batch could also lose a newly rented pod before the next full state save. New paid allocations are now saved immediately, before any existing pod’s audio transfer. A regression checks the state file at that exact transfer boundary. During recovery, new rentals were paused and four unrecorded SifterSearch allocations were retired; other projects were untouched. The original canary returned eight results before ending.

Background light backfill now stops between recordings and passes its drain callback into remote encodes; it no longer holds a manager reload behind unrelated work. The targeted GPU host/spending suites pass 82 tests after these fixes.
