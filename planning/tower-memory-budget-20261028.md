# Tower memory budget (188.8 GiB), applied 2026-10-28

Chad: search and indexing are the two primary activities; maintenance uses what is left. All settings persist (systemd `set-property`, `/etc/sysctl.d`, `/etc/modprobe.d`, unit files).

| tier | members | protection / limit |
|---|---|---|
| 1 search | qdrant-next (serving), qdrant-hot, pm2 API/gateway/anis | qdrant-next `MemoryMin=48G`, qdrant-hot `MemoryMin=8G`, `pm2-chad.service MemoryMin=14G`; parents `system.slice 26G`, `user.slice/user-1000.slice/user@1000.service 56G` |
| 1 indexing | indexer (`sifter-index.slice`: CPUWeight 100, High 40G, Max 60G); qdrant-main build (own unit, `MemoryMax=125G`, runtime CPUWeight/IOWeight were lowered while it built) | pending: pm2 reload with `--update-env` moves the indexer |
| 2 maintenance | `sifter-bulk.slice`: CPUWeight 10, MemoryHigh 14G, MemoryMax 20G; grounding/hype/concept runs now start through `in-slice.sh` (api/lib/pipeline/spawn.js), OOM score 500 (die first) | takes only leftovers |
| kernel/ZFS | ARC max 56 GiB (was 72), `vm.swappiness=1`, txg 120 s unchanged | `/etc/modprobe.d/zfs.conf` (backup `/root/zfs.conf.bak-20261028`), `/etc/sysctl.d/90-sifter-memory.conf` |

Sum at worst: 8 system + 56 search floor + 22 hot RAM disk + 14 pm2 + 56 ARC = 156 GiB, about 17 % free.

**Before** (09:50, f16 build running): used 155 GB, free 14.7, swap 8/8 GB full and thrashing (si 900 KB/s, bi 1.3 GB/s), ARC 8.7 GB, search quick p50 3.7 s / p95 8.5 s.
**After** (11:25, qdrant-main stopped, swap cleared with `swapoff -a; swapon -a`): used 81 GB, free 56, available 112, swap 0, vmstat si/so 0, search quick p50 150 ms / p95 216 ms.

Cause of the incident: qdrant-main (HNSW build then idle) held 42-73 GB anonymous memory; ARC and qdrant-next's page cache were evicted. Rule going forward: a Qdrant build runs only with its own MemoryMax and while nothing else is being validated; it is stopped when idle.

Rollback: `sudo sed -i 's/zfs_arc_max=60129542144/zfs_arc_max=77309411328/' /etc/modprobe.d/zfs.conf`; `sudo rm /etc/sysctl.d/90-sifter-memory.conf`; `systemctl set-property` with `MemoryMin=0` on the units above; restore the slice values from `docs/ops/`.
