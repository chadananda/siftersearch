# Boss memory, in plain words (10-28)

Boss is a Ryzen AI Max+ 395 with **128 GB of physical memory split into two pools**:

| pool | size | who uses it | where to read it |
|---|---|---|---|
| **System RAM** | ~31 GB (`MemTotal`) | the OS, tailscaled, sshd, Chad's services, our containers' CPU work, every process's normal memory | `free`, `/proc/meminfo` (`MemAvailable`), `/proc/pressure/memory` |
| **GPU VRAM (BIOS carve-out)** | 96 GiB (`mem_info_vram_total`) | the GPU: llama-coder's model (~50 GB when loaded), UniPASE on ROCm (5-6 GB per job) | `/sys/class/drm/card*/device/mem_info_vram_{total,used}`; per process in `/proc/<pid>/fdinfo/*` (`drm-memory-vram`) |
| **GTT** | ~15.5 GiB (`mem_info_gtt_total`) | system memory the GPU may map; a job that spills out of VRAM lands here | `mem_info_gtt_{total,used}` |

`free` and `MemAvailable` describe **only the first row**. A box with 63 GB of VRAM in use looks "idle" in `free`; a box with 3 GB of system RAM left looks fine in `rocm-smi`. Trust, in this order: **memory pressure (PSI `some avg10`)** for "is the system RAM about to OOM" (it rises before the kill; `MemAvailable` falls too late); `MemAvailable` for how much is left; VRAM used/total for the GPU; GTT only if a job spills.

## What a UniPASE job really uses (measured on boss, 10-28)
About 2.2 GB system RAM (RSS) + 5-6 GB VRAM + 8 MB GTT. So it is admitted by **VRAM free** (6 GB + 1.5 GB margin) and by system RAM (3 GB + the 13 GB reserve), not by the 128 GB figure. A CPU-tail container: 6 GB RAM, no VRAM. llama-coder: ~0.7 GB RSS + ~50 GB VRAM when loaded, but its cgroup peaks at **22 GB of system RAM while the model loads** (page cache + anonymous): that load is what overran the box.

## The 10-28 incident
04:53: `tailscaled invoked oom-killer`; the kernel killed `llama-coder.service` (22.3 GB peak) and `laya.service`, and boss left the network until rebooted. Our restoration and CPU tails were resident on top of Chad's services; nothing capped them and the guards counted a 128 GB machine.

## What guards it now
* Every job the gate starts runs under `capped.sh`: its own cgroup, `MemoryMax` 5 GB (UniPASE 4 GB), `MemorySwapMax=0`, `oom_score_adj` 900 (first victim). CPU-tail containers: 6 GB, swap = memory, `--oom-score-adj 900`, one at a time.
* Tower admits a boss job only when MemAvailable >= its need + **13 GB**, PSI some avg10 <= 3 %, and (GPU jobs) VRAM free >= need + 1.5 GB. Read live from the gate every 30 s (`df` verb); shown as "unified pools" in system-checks and as `host_memory` in `/ops/services`.
* **VRAM is not bounded by cgroups.** It is bounded by job count and the per-job need above (UniPASE 6 GB, each admission re-checked against VRAM free).
* Swap: a 31 GB zram device (priority 100, compressed in RAM) + a 31 GB swapfile (priority 0); both about 0 used.

## Options for Chad (nothing was changed on boss)
**(a) Leave as is.** 96 GB VRAM for the LLM + restoration, 31 GB system RAM with the 13 GB reserve. Safe now; our CPU work is limited to what is left above the reserve.

**(b) Shrink the BIOS carve-out and let the GPU borrow system memory through GTT.** The OS then sees ~96-120 GB of RAM and the GPU draws what it needs dynamically. Steps (Strix Halo, amdgpu):
1. BIOS: *UMA Frame Buffer Size* -> 8 GB (or 16/32).
2. Kernel command line (`/etc/default/grub` or the bootloader entry): `amdgpu.gttsize=98304 ttm.pages_limit=25165824 ttm.page_pool_size=25165824` (GTT 96 GiB; pages are 4 KiB, so 96 GiB = 25,165,824 pages). Regenerate the config and reboot.
3. Verify: `free -g` shows ~120 GB; `cat /sys/class/drm/card1/device/mem_info_gtt_total` shows ~96 GiB.
4. llama.cpp / vLLM must then allocate from GTT (ROCm: `HSA_XNACK=1`; llama.cpp built with `-DGGML_HIP_UMA=ON`, or its Vulkan backend) instead of fixed VRAM.

What would change: **llama-coder and vLLM currently depend on the 96 GB carve-out** (a 50 GB model sits in VRAM today). With a small carve-out they run through GTT/UMA mode: model loads pass through system memory (the 22 GB peak becomes a real RAM event, so put `MemoryMax` on their unit files too). Our UniPASE (5-6 GB) works either way. Reboot required; try it first with the LLM services stopped.
