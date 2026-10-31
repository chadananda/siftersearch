# GPU unify State
last_tick: 2026-10-31T07:50Z
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

- 01ad03e6 pacing v2 "one talk on deck": claim when nothing waits at GPU admission (leases.json.wait) and last claim ≥2 min old.
  Live 04:05Z: aorus new agent 3/3 (2201/2210/2212) + old draining 2189, GPU 84%; boss 2211/2215 + old draining 2208, GPU 100%.
- Pod 367 CLOSED by tower: ssh refused >4 min while it held 12 edge talks (slots = max_jobs), 0 results. 41a83547: agent pods are
  kept alive while queue heartbeats are fresh (q_last.beat, 10 min) and run at most CLOUD.agentSlots = 4. Deployed.
  Its 12 jobs requeue when their edge leases expire. Pod images ≤31c have no pacing; next image build carries gpu-pace.mjs.

## 10-31 04:15–05:00Z — exact deck, pod deaths = RAM
- 6295148f exact one-on-deck (no timers): claim when no fresh GPU-admission waiter AND no claimed talk still heading to the GPU (ledger key
  ownership: container pid ns / descendant pid). Slots = capacity (pod max_jobs). f8f2dfad pod gauge cgroup v1 CPU. 2b6cee07 failure reasons
  survive (post.error.txt, 2500-char stderr tail, queue clip head+tail). whole-2185 on 31d DONE 3111 s, adopted (publish held: 29 s speech gap).
- Pod 368 (31c, 12 slots) closed 04:47 "ssh refused" — gauges froze 04:34, so the POD died, as 367 did ~40 min in. q_last.beat was empty
  because its leases had expired: heartbeat liveness didn't help a dead pod. CAUSE (likely): agent read /proc/meminfo = the HOST's RAM on RunPod,
  so its RAM guard never fired with 12 × 94-min talks → container OOM.
- f42461e3 agent RAM from cgroup (v2 memory.max / v1 limit_in_bytes, minus inactive file) + slots ≤ RAM/6 GB (--gb-per-talk; aorus run-lan 5).
- Image 31g = ghcr …:gpu-20261031g @sha256:4623eefea98f9718c381e5d4d8137b43981f92dfeaac47aec48c4339ee5607e8 PROMOTED 04:55Z (31f superseded).
  Rentals resumed max-pods 1 (spent $128.82). Watcher: /tmp/pod31g.py on tower (done / fails / pod closed).
- Home agents swapped 04:57Z to f42461e3 code (aorus pid 2950204 3 slots, boss 476767 2 slots); old ones draining.
  NOTE: never `pgrep -f queue-agent.mjs` inside an ssh command — it matches the ssh shell itself; `ps -C node` matches nothing
  (node's comm is "MainThread"). Use `ps -eo pid,args | awk '$2 ~ /node$/ && /queue-agent/{print $1}'`.
- 1f98218a agent holds claims while the CPU is full (cgroup cpu.stat/cpuacct + quota, ≥90 % over 60 s). Why: grade takes its GPU lease, then
  decodes on the CPU, so "reached the GPU" freed the deck in seconds. Pod 370 (31g) took its 9 slots in 40 s: load 78 on 31 CPUs, GPU 0 %,
  cgroup 58 GB (meminfo 251), RAM peak 16 GB. Image 31h = …:gpu-20261031h @sha256:75e640e7f0fb640ee906454d38f8dc962c78e7eb5770993f62ffef207590a217
  PROMOTED 05:05Z → 370 drains (finishes its 9), then the lane rents ONE 31h pod. Home agents on 1f98218a since 05:07Z (aorus 2961558, boss 500813).
- Aorus GPU sampled over 8 s = 50–100 % (single samples mislead), 4 stages queued at admission → saturated as designed.
- VERIFY on the 31g pod: start log slots/ram_gb sane, claims paced, results adopted, no OOM → then max-pods 3.
- 05:20Z pod 370 REAPED by tower "idle 10 min": ledgerTick's `assigned` looked only at st.jobs, so an agent pod holding 9 leases with the GPU
  quiet (all 9 in ffmpeg prep, ~1.2 cores each, 8+ min) counted as idle. 9 talks lost → requeue on lease expiry. Fix 8f1863d6: leases
  (q_last.leased['pod-<name>']) count as assigned (+test). Breaker opened (367, 368, 370 = 3 never worked); auto-canary ~05:50Z on 31h.
  Watcher: /tmp/pod31h.py on tower.
- 05:41Z canary pod 371 (31h) claimed 5 talks in 50 s, GPU 1 MiB: every talk held a `grade` lease (grade leases for RAM admission, then
  runs entirely on CPU — its torch tensors never leave the CPU). 9d2bca90: gpuLedger ignores CPU_STAGES (grade, guard), so such a talk is
  still on deck. Image 31i = …:gpu-20261031i @sha256:5cc61fdebca50c189c6a89a8d47946dc602189947e9f91d826199d8d5157b336 PROMOTED ~06:00Z
  (built from tmp/wt-delta at 9d2bca90 — clean of the other session's gpu_lease.py). 371 drains its 9; home agents restarted on it
  (aorus 2997625, boss 562461). Watcher b4qiunqoh → /tmp/pod31g.py (matches 31h+31i).
- 06:20Z pod 372 (31i) sat at GPU 0 % for 5+ min with 1 talk in prep encode. cfea6675 + edfac70f (TDZ fix): RAMP — GPU < 30 % for a minute
  and nothing queued at it → one more talk per 90 s (CPU-full, RAM, disk 8 GB/talk end it). Hot-swapped onto 372 (new agent 3377, old 647
  draining whole-2235; env in /workspace/agent.env, log /workspace/agent.log): 5 claims in 8 min, as designed. Home agents on aorus+boss
  updated + restarted 06:40Z. Image 31j = …:gpu-20261031j @sha256:9a18fdb4cccf22a7aee94bf36a9d33cbef08ca4ec7ec541efd5e958a0b3e6397 pushed,
  NOT promoted (promotion drains 372, which already runs it) — promote when 372 ends or before renting more pods.
  Sampler /tmp/podsample.py → /tmp/podsample.log on tower (cgroup mem, df, RSS, nvidia-smi, lease stages) to catch the ~40-min pod death.
- 06:47Z 372 died like 367/368/371: lastOk exactly ~24 min after ready, then "connection refused"; RAM 11/62 GB, disk 7.5/60 — healthy.
  ROOT CAUSE: docker/media-worker/entrypoint.sh zombie guard `sleep 1500; [ -e /workspace/.lane-seen ] || self-terminate` — BOOTSTRAP_WHOLE
  touches .lane-seen, BOOTSTRAP_AGENT never did. Every agent pod killed itself at 25 min, mid-work. Fix 1a8d23b9 (+test), deployed.
  31j PROMOTED ~07:05Z (no live pods then except 373 booting on 31i → drains, lane rents one 31j pod). Watcher b0pvzu6i2 → /tmp/pod31j.py.
  NEXT: one 31j pod past 25 min AND adopted results → then rentals --max-pods 3.
- ~07:30Z pod 374 (31j) PROVEN: past 25 min, 10 talks delivered via queue + adopted, 0 fails, GPU 100 % with 5 GPU stages at once, RAM peak
  48/62 GB. Raised --max-pods 3, but lane stayed at 1: st.proven only set on the ssh lane. e4e1dffa: queue-feed provePool() — a pod-* delivery
  sets proven (+test), deployed. 375 warming, 376 booting (~07:50Z); spent $132.4 / $200. Watcher bq5t6b8j4 → /tmp/pods3.py (exits when both
  deliver, any pod fail, or a terminate). NEXT: confirm 375+376 deliver past 25 min; watch RAM via /tmp/podsample.log; watch budget.

## Next
1. Boss onto the LAN agent (ROCm; boss currently on home path B, st.home.boss, image quiet-20261029). Needs a ROCm gpu-20261031 build.
2. Retire home ssh-docker (B) + gate (C) once aorus+boss run on the agent.
3. Step 6: pods run the agent (remote transport); retire the ssh spool.
   f697eb67: image now ships queue-agent.mjs + queue-client.mjs in /opt/sifter/media/worker (NOT in gpu-20261031 — next delta build).
   Pod boot = `MEDIA_QUEUE_KEY=… /usr/local/bin/node /opt/sifter/media/worker/queue-agent.mjs --host pod-<id> --run local --device cuda
   --root /workspace/q` (local run mode exists: python=/opt/conda/bin/python torch 2.8 cu128). Only after the one-pod verify.
4. Step 7: one Dockerfile ARG BASE (CUDA|ROCm).
