# GPU unify State
last_tick: 2026-10-31T01:35Z
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

## Next
1. Boss onto the LAN agent (ROCm; boss currently on home path B, st.home.boss, image quiet-20261029). Needs a ROCm gpu-20261031 build.
2. Retire home ssh-docker (B) + gate (C) once aorus+boss run on the agent.
3. Step 6: pods run the agent (remote transport); retire the ssh spool.
4. Step 7: one Dockerfile ARG BASE (CUDA|ROCm).
