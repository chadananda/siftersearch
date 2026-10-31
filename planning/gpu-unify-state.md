# GPU unify State
last_tick: 2026-10-31T02:55Z
status: IN_PROGRESS
project_dir: /Users/chad/Dropbox/Public/JS/Projects/siftersearch.com
node: N=/Users/chad/.local/share/fnm/node-versions/v25.9.0/installation/bin/node (bare `node` fails under the hook)
design: planning/worker-unify-20261030.md (steps 1-7)

## Chad's orders (10-30 evening, then left)
1. Pause rentals; fix; deploy to ONE pod and verify it works well before expanding to 3.
2. Job queue unified: two transports (local, remote) with an almost identical API.
3. One solid worker image (AMD+NVIDIA, local+remote) that can do/redo any or all pipeline parts. Minimal duplication; abstract differences.

## Root cause (the "3 remasters/hr")
Pod image (10-26) post.py had no `quiet`; tower requires realign+quiet+web since 34037cc7 → every pod result silently re-queued (395/24h).

## Done (all deployed)
- b530c3d7 rentals valve · 6126fe22 result contract handshake · dfc6a53b bundle guard · 0a182de2 no duplicate remasters
- 15fc7849 restore-job.js (step 3) · d2b68f7c agent runs every kind + device detect (step 4)
- accept-gpu2 PASSED on aorus (talk 1687, contract 2, realign+quiet+trim+web). Image ghcr …:gpu-20261031
  @sha256:c1b11face95c2253361d89f55433ec3856a0ae95b9c1515ebb18128fe1238e9a PROMOTED (previous 6e4d…). Rentals RESUMED max-pods 1.
- 74695192 LAN queue (step 5 transport): media-queue-repo.js + routes/media-queue.js, http://tower-nas:7843/api/admin/ops/queue. Tower ticks LAN then edge.
- ab2c9df8 `ops.mjs media queue` prints the machine key only with --key.

## In progress
- Pods: 3 old-image (6e4d) pods still hold 14-16 jobs each; lane drains outdated pods one at a time (media-jobs.js:1835) then rents
  ONE new-image pod (maxPods 1). Watch: scratchpad podwatch.sh (exit 0 when the new pod has ≥3 done or ≥2 failures).
  Then check post_refused / stale_image / libcublasLt in failure_log → only then `ops.mjs media rentals --max-pods 3`.
- Aorus → LAN queue: old edge agent (pid 2757083, --host aorus-q) SIGTERMed 01:24Z, draining q-whole-1909. When it exits, the waiter
  swaps bin/ to the new agent+client (old kept as *.edge-old) and starts `~/sifter-queue/run-lan.sh` (env-lan: MEDIA_QUEUE_URL + machine key;
  --host aorus --slots 1 --image sifter-media-worker:gpu-20261031 --can ${CAN:-whole}; log agent-lan.log).
  Verify: first LAN whole job adopted (st.q_lan.pulled.adopted). Then CAN=whole,restore after one restore verified.
  02:11Z SWAPPED: new agent pid 2842418 on LAN; 02:12Z claimed whole-2176 (94 min audio). Waiter bxz9c8cvn checks done + `ops.mjs media status 2176`.
  Old agent's last job whole-1909 failed "GPU admission timeout for restore_asr" — likely contention with accept-gpu2 (separate leases dir,
  aorus = 8 GB VRAM / 15 GB RAM). Never run an acceptance container beside the agent on aorus. Re-queued by tower.

## 10-31 02:55Z — throughput + step 6 (Chad: pods must use the edge Worker + R2 so tower being busy loses no work)
- a2083276 GPU admission: cgroup memory leaves out inactive file cache (the restore_asr admission timeouts on aorus + boss).
- ONE machine key for LAN + edge (edge QUEUE_KEY secret = machineKey() = HMAC(INTERNAL_API_KEY,'media-queue-machine')).
- Aorus on LAN agent (image gpu-20261031b after whole-2177; swap.sh). whole-2176 done 1865 s for 94 min, adopted (publish held: speech-gap text check).
- Boss on LAN agent: ~/sifter-queue/run-lan.sh, ROCm rocm-gpu-20261031b, 2 slots, log agent-lan.log.
- 54dfbe30 STEP 6: an image carrying queue-agent.mjs boots BOOTSTRAP_AGENT (cloud.js) with the machine key: pod claims from /_q, results → R2,
  tower adopts via queue-feed pull. Tower only watches (pgrep ALIVE, agent.log tail, gauges); SIGTERM-drains on image update / pool cut;
  closes the pod when the agent exits (agent --idle-exit-min 15 → terminate_self). Agent pods skip spool/scp entirely.
- Image gpu-20261031c @sha256:4cf25634c2372b9697a91a23633bcd4c6f800687995a7a7268f13d58404c7041 PROMOTED 02:53Z.
- Lane: old pods ujua (1 job) + 0d3v (7 jobs) drain one at a time, then the lane rents ONE agent pod. 13 jobs wait on the edge.
  Watcher: scratchpad agentpod.sh. VERIFY: claims, R2 results adopted (q_last.pulled.adopted), idle self-termination → then max-pods 3.

## 10-31 03:30Z — publish blockers on whole results + leaner results
- 1c3093bf coverage gate: only a speech gap ≥15 s blocks publishing (Chad: a 5 s gap "is totally normal").
- 5016130f correct/clean re-stamp audio_alignment_hash (restampAlignment, item.js) when raw carries the aligned timings. The whole worker
  realigns BEFORE tower's correct/clean, so every whole result was blocked at render "timing changed after alignment" (2176 first).
  2176 redo clean+render queued after deploy.
- a4de1c24 result size: worker drops light/dfn probe copies + blanks unipase.cloud.flac; agent uploads exactly result.json's files
  (~1.45 → ~0.55 GB per 94-min talk). Images: ghcr gpu-20261031d (CUDA, built on aorus from 31c) — aorus running it since 03:20Z
  (job whole-2185); promote after its result is adopted. rocm-gpu-20261031d built on boss (local only; boss run-lan.sh points at it,
  takes effect on next agent restart).
- 061a27ed build-delta.sh uses the classic builder (BuildKit can't resolve a base that exists only locally).
- Aorus GPU admission on images < 31b: page cache counted → stuck waiters. Unstick: `docker run --rm --privileged --entrypoint sh <img>
  -c "sync; echo 1 > /proc/sys/vm/drop_caches"`.
- Boss: one HSA_STATUS_ERROR_EXCEPTION on whole-2182 (re-claimed). If it repeats → --slots 1.
- Cloud: ujua closed; 0d3v holds 1 job (2156) → then the lane rents ONE agent pod (31c promoted).
- 36 older failed items (pod-era ssh refusals, ffmpeg filter errors 187/234 at web, LLM timeouts) — separate backlog, not yet triaged.
- ecc82d90 /media machine cards: queue tick records leased-per-host (st.q_lan.leased / st.q_last.leased); cards count them, so
  LAN-agent hosts + agent pods (host pod-<name>) show working instead of offline/"no work last hour".
- 03:30Z: boss holds 2182 (retry after HSA exception) + 2183; aorus 2-slot agent on 2189/2201, old agent draining 2185 (watcher bl0rfmt4b);
  agent pod n5ou2n53jg8ox9 (sifter-unipase-367) booting, 4 min old.
- 71e23dd5 GPU pacing (Chad: "the CPU work can progress while the GPU is working on the next talk"): agent claims the next talk only
  after the GPU is <40% busy for 60 s and the last claim is ≥4 min old (scripts/media/worker/gpu-pace.mjs); --slots is now a cap.
  Rolled out 03:40Z: bin/gpu-pace.mjs + new agent on aorus + boss (old agent kept as bin/queue-agent.mjs.pre-pace); old agents
  SIGTERM-draining; ~/sifter-queue/swap-pace.sh <pids> (tail --pid) starts run-lan.sh when they exit. aorus cap 3, boss cap 2.
  Watch: boss gpu_busy_percent reads 100 — if it never drops below 40, boss stays at 1 talk → raise BUSY_PCT or use leases.
  Pods get pacing with the next image build (all .mjs in scripts/media/worker ship).
- Boss whole-2183 done 2954 s for 94 min. Agent pod 367 ready, claimed whole-2219 03:33 (watcher bg8ob364c for its first adopted result).

- 46c23cdc boss "clogged on one talk": gpu_lease RAM check summed every talk's lease against ONE container's 10 GB cap
  (3.5 restore_asr + 5.5 grade > 9). The agent now caps each container at 85% of host RAM (boss 26g, aorus 12g). Live `docker update`
  applied to the running containers; boss 2208 grade was admitted beside 2182 restore_asr (verified via leases.json).

- Shared-memory caveat (Chad): boss = 96 GB VRAM carve-out + 31 GB system, and GTT (up to 15 GB) is taken from the system side.
  The RAM check doesn't see GTT. GTT used was 0 at 04:00Z. TODO, coordinate with the gpu_lease.py owner: subtract live
  mem_info_gtt_used from free RAM in admission.

- 03:46Z aorus whole-2185 on 31d FAILED "Incomplete restoration result; no publication" (single_restore.py: post.json not ok/held/web).
  The reason was lost because the retry reuses the work dir. The paced agent re-claimed it at once. DON'T promote 31d yet.
  Watcher br95f8a5s captures post.json once it exists.

## Next
1. Boss onto the LAN agent (ROCm; boss currently on home path B, st.home.boss, image quiet-20261029). Needs a ROCm gpu-20261031 build.
2. Retire home ssh-docker (B) + gate (C) once aorus+boss run on the agent.
3. Step 6: pods run the agent (remote transport); retire the ssh spool.
   f697eb67: image now ships queue-agent.mjs + queue-client.mjs in /opt/sifter/media/worker (NOT in gpu-20261031 — next delta build).
   Pod boot = `MEDIA_QUEUE_KEY=… /usr/local/bin/node /opt/sifter/media/worker/queue-agent.mjs --host pod-<id> --run local --device cuda
   --root /workspace/q` (local run mode exists: python=/opt/conda/bin/python torch 2.8 cu128). Only after the one-pod verify.
4. Step 7: one Dockerfile ARG BASE (CUDA|ROCm).
