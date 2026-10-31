# One worker, one job API (Chad 10-30)

> "Two mechanisms for getting jobs and saving output — one local, one remote — with an almost identical API."
> "One solid worker image that can do or redo any part or all parts of the pipeline. Minimal code duplication."

## Today (mapped 10-30): five dispatch paths, three copies of everything

| path | kinds | in / out | tower intake |
|---|---|---|---|
| A RunPod spool (media-jobs.js cloud lane, ssh) | whole, restore, post, cleanup | scp / R2 → spool, `touch ready`; ssh `ls` DONE | `takeCloudRecording` / files → `enhanced/pod/` |
| B home ssh-docker (home-recording.js) | restore/post, whole | rsync | `podComplete` / `adoptWholeResult` |
| C boss gate (gate-recording.js + whole_gate.py) | post (CPU), whole (ROCm) | gate verbs | same as B, re-implemented |
| D edge queue (/_q DO + R2, queue-agent.mjs) | **whole only** | R2 stage/results | `adoptWholeResult` |
| E quiet repair | silence only | rsync | own |

Duplicated: the restore `post` config (3×), restore input mapping (3×), restore intake (3×; the pod lane's is the weakest),
whole path-safety (4×), docker run + admission (4×), four whole job-id formats. No version handshake (fixed for post.json: 6126fe22).
Device: only the gate sets `device`; docker flags hard-coded per path, so the queue agent cannot run ROCm.

## Target

**1. One job contract** (`scripts/media/worker/result-contract.json` is the start):
`job.json {v, id, kind: whole|restore|post|quiet, stages?, device, threads, inputs{}}` → `result.json|post.json {contract, …}`.
Job id = `<kind>-<itemId>-<inputSha12>` everywhere. Tower refuses by name (podVerdict / validateWholeResult).

**2. One agent, two transports** (`scripts/media/worker/queue-agent.mjs`):
```
transport.claim(can) → job | null      transport.heartbeat(job)      transport.get(job, name) / put(job, name, file)
transport.complete(job, result)         transport.fail(job, why, retry)
```
- `remote` = edge `/_q` DO + R2 (exists: `queue-client.mjs`).
- `local` = the same verbs on tower's LAN gateway (`/api/admin/ops/queue/*`, files streamed from the item dir). Same queue core (`worker/queue/core.js`, pure) so the semantics are literally the same code.
- Agent runs the image with `device` detected once (`nvidia-smi` → `--gpus all`; `/dev/kfd` → `--device /dev/kfd --device /dev/dri`), admission (VRAM/RAM/slots) in one place.
- RunPod pods run the SAME agent (remote transport) instead of tower ssh-pushing a spool. Aorus/boss run it with local transport.

**3. One tower intake per kind**: `adoptWholeResult` (exists), `adoptRestoreResult` (new: the three restore intakes → one, with podVerdict).
Feeds (`queue-feed.js`) put work on either transport; transport choice is config, not code.

**4. One image**: `Dockerfile` with `ARG BASE` (CUDA pytorch | ROCm TheRock) + one device layer; DFN/onnx2torch/torch_diar in both.
`capabilities.py` reports what the image can do + its contract version; the agent advertises it on claim.

## Order (each step shippable, local first)
1. ✅ result contract handshake (6126fe22); ✅ bundle guard (dfc6a53b); ✅ duplicates never remastered (0a182de2).
2. Delta image gpu-20261031 → Aorus acceptance → ghcr → promote → ONE pod → verify → 3 pods. (Chad's order)
3. `adoptRestoreResult` — collapse the 3 restore intakes; pod lane uses it (adds work_sha check it lacks).
4. Agent: device detection + `restore`/`post` kinds (farm_worker's dispatch rule) → queue agent can do every kind on CUDA or ROCm.
5. Local transport (tower LAN endpoints over the pure queue core) → Aorus/boss on the agent; retire B, C.
6. Pods on the agent (remote transport) → retire A's ssh spool.
7. Single Dockerfile (ARG BASE) → boss ROCm image from the same recipe.
