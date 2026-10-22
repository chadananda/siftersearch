# Storage wear and RAM plan for tower-nas (2026-10-21)

Chad on 10-21: "Indexing is too slow on platter but wears out drives on NVMe. We can allocate some RAM permanently for a RAM disk
and write to physical disk periodically." Also: the RAM is ECC, use all of it. Tower will run SifterSearch only. ZFS can be
kept to the HDD pools and the system drive if that helps. A large UPS is being ordered.

The measurements are read-only and come from 2026-10-22 02:40–02:51 UTC. Raw files are on tower in `/tank/sifter/wear/`, with
local copies in `tmp/wear/`. The 24 h re-measurement is described in `tmp/wear/followup.md`. Anything not measured is marked
**[est]** (estimate) or **[assume]** (assumption to verify).

---

## 0. Summary

1. **The wear has mostly been caused by configuration, not by the hardware.** Between 10-13 and 10-20 the 970 EVO Plus took
   **2.0–9.1 TB/day (6.2 TB/day on average)**. On 10-20 at 16:12 PDT `MEILI_WRITES=off` went in. Meilisearch had been
   rewriting its LMDB inside ZFS's 128K records on `/fast`. Within the hour the drive fell from about 100 MB/s to 1–2 MB/s.
   It now runs at **0.09 TB/day**. Qdrant was the other large writer: its own write counter shows **40.9 TB in 20.4 days
   (2.0 TB/day)**. That came from storing the 35 M-point `phrases` collection as float32 (the source vectors are float16)
   and from repeated segment merges.
2. **A RAM disk alone cannot hold the large stores.** The Qdrant `phrases` collection is 388 GB and the paid embedding store
   `vectors.db` is 240 GB, against 189 GiB of RAM. The design therefore uses RAM in three ways:
   - (a) a **64 GB RAM disk** for the small, write-heavy, rebuildable Qdrant collections and for build staging;
   - (b) **compressed vectors held in RAM** (binary quantisation) with full float16 vectors memory-mapped from SSD for
     rescoring;
   - (c) the **whole content DB held in the ARC** (30 GB compressed, 59 GB logical).
3. **The biggest gains are changes to Qdrant and to the per-device layout**:
   - float16 storage (halves every byte written);
   - bulk-load mode for builds, so each vector is written once and not merged repeatedly;
   - a sane segment size (the `phrases` optimizer is stuck red asking for 190 GiB);
   - Qdrant on XFS on the new 4 TB NVMe;
   - SQLite left on ZFS, where hourly incremental snapshots cost about 400 MB.
4. **Projected wear after the plan [est]:** about **0.1–0.2 TB/day across all SSDs while indexing**, and about 0.05 TB/day
   when idle. Before 10-20 the figure was 6 TB/day. That gives every SSD a write-endurance life of more than 10 years.

---

## 1. UPS: what to buy (read this first when ordering)

**What the OS sees now:** there is no UPS. `upower` lists only a Logitech mouse battery (`hidpp_battery_0`). NUT and apcupsd
are not installed, there is no UPS on USB, and `/sys/class/power_supply` shows only the mouse.

**Power draw of tower (Dell Precision 7910, 2× Xeon E5-2698 v4, 12× 16 GB DDR4 RDIMM, GTX 1070 + Quadro K4000, 2 HDD,
3 SSD):**

| state | CPU packages | DRAM | rest of system [est] | **wall [est]** |
|---|---|---|---|---|
| now (load avg ~10 of 80 threads) | **95 W measured** (RAPL: 45.1 + 50.0) | **23 W measured** (RAPL: 7.2 + 15.9) | GPUs idle ~40, disks ~25, board/fans/VRM ~50 | **~265 W** (PSU ~88 % efficient) |
| all cores busy, GPUs idle | 270 W (2 × 135 W TDP) | ~40 W | ~115 W | **~490 W** |
| GPUs also under load (not used today) | | | +200 W | ~720 W |

**Runtime needed for a clean power-down.** Sizes are the planned RAM-disk sizes. Write speeds are spec-sheet figures, not
measured, because measuring would mean writing to the SSDs.

| step | time |
|---|---|
| wait on battery before acting (rides through short outages) | 120 s |
| flush the RAM disk: worst case 64 GB to the 4 TB NVMe at ≥ 0.5 GB/s (a Qdrant snapshot is one tar stream) [est] | ≤ 130 s (25–40 GB in practice: 50–80 s) |
| drain and stop services (worker drain, SQLite WAL TRUNCATE, Qdrant stop) [est] | ≤ 120 s |
| ZFS sync, unmount, power off | ≤ 60 s |
| **total** | **≤ 7.2 min**; with a ×1.5 margin for battery age and heat, **~11 min** |

If the flush target were the A400 (`/crutch`, about 100–200 MB/s after its cache fills [assume]), 64 GB would take 5–11 min.
For that reason the flush target is the NVMe and never `/crutch`.

**Recommendation:**

- **Waveform:** pure sine wave output, either line-interactive or online. The 7910's PSU uses active PFC, and simulated sine
  wave units can make such PSUs drop out.
- **Rating:** at least **1500 VA / 1000 W**. Vendor runtime charts for this class [assume] give about 15–20 min at 265 W and
  about 7–9 min at 490 W. The 2200 VA / 1980 W class, or a 1500 VA unit with an external battery pack, gives about 15 min
  at peak. Choose that if budget allows.
- **Target:** at least 15 min at typical load and at least 8 min at peak.
- **Signalling:** a USB HID connection supported by NUT's `usbhid-ups` driver. Check the exact model on the NUT hardware
  compatibility list before buying. Also put the router/modem on the UPS, about 20 W, so alerts can still go out.
- **Measure the real draw** on the UPS display once it is installed, and replace the [est] rows above.

**Hooks after the UPS arrives** (sketched in §6.4): NUT `upsmon` + `upssched`.
- On battery, start a 120 s timer.
- When the timer fires: `systemctl start sifter-powerdown.target`. This flushes the RAM disk, stops services in order and
  then calls `shutdown -h now`.
- On `LOWBATT`: run the same thing immediately.
- On power return before the timer fires: cancel the timer.

### 1.1 UPS ordered (10-21) and the NUT test when it arrives

Chad ordered a **GoldenMate 1500VA/1000W LiFePO4** (line-interactive, sine wave, wall-mount; vendor software is Windows-only).
Linux support is unconfirmed: one owner of a GoldenMate Pro unit reports it working with NUT on ZimaOS, without naming the
driver ([ZimaSpace forum](https://community.zimaspace.com/t/nut-tools-support-for-golden-mate-pro-ups-in-zimaos/8109)).
Fallback: return it for a **CyberPower CP1500PFCLCD** (NUT `usbhid-ups`, well supported).

The NUT kit is in the repo, **not installed**: `deploy/nut/` (nut.conf, ups.conf, upsd.conf, upsd.users, upsmon.conf,
upssched.conf, upssched-cmd, sifter-ups-mail, sudoers.d-sifter-ups) and `scripts/ops/ups-mail.mjs` (mails through the ops
alert mailer; `powerdown` is a `[PAGE]`).

**Test procedure (about 30 min, no SifterSearch impact until the last step):**
1. Plug the UPS's USB into tower. `lsusb` → note the new line's `ID vvvv:pppp` and name. `dmesg | tail` → does the kernel
   bind it as `hid-generic` / "UPS" (HID power device: good sign for `usbhid-ups`) or as a serial device (`ttyUSB`, `cdc_acm`)?
2. `sudo apt install nut` (nut-server, nut-client). Stop the units it starts until configured.
3. `sudo nut-scanner -U` → it prints a ready `[nutdev1]` block with `driver = …`, `vendorid`, `productid` (and `subdriver`
   for nutdrv_qx). Copy those into `deploy/nut/ups.conf`'s `[tower]` section.
4. Install the configs (`sudo cp deploy/nut/{nut.conf,ups.conf,upsd.conf,upsd.users,upsmon.conf,upssched.conf} /etc/nut/`;
   `sudo chown root:nut /etc/nut/*; sudo chmod 640 /etc/nut/*`; set the password in upsd.users + upsmon.conf;
   `sudo install -m 755 deploy/nut/upssched-cmd deploy/nut/sifter-ups-mail /usr/local/bin/`; sudoers: `sudo visudo -cf
   deploy/nut/sudoers.d-sifter-ups && sudo install -m 440 deploy/nut/sudoers.d-sifter-ups /etc/sudoers.d/sifter-ups`).
5. Driver order: `sudo upsdrvctl -D start tower` with **`usbhid-ups`**. If it cannot claim the device, try **`nutdrv_qx`**
   (Megatec/Q1 protocol, common on OEM units; `port = auto`, plus `subdriver` from nut-scanner, else try `cypress`, `phoenix`,
   `fabula`, `krauler`), then **`blazer_usb`**. If none reads `ups.status`, **return it for the CyberPower**.
6. `sudo systemctl restart nut-server` → `upsc tower` must show `ups.status: OL`, `battery.charge`, `ups.load`,
   `battery.runtime` (record `ups.load` in watts: replaces the [est] wall-power rows in §1).
7. **Dry-run the events** with the hook in test mode: in `/etc/nut/upssched.conf` temporarily use
   `CMDSCRIPT /usr/bin/env SIFTER_TEST=1 /usr/local/bin/upssched-cmd` (logs "TEST would run…" instead of acting). Start
   `nut-monitor`. **Pull the UPS's wall plug:** within ~5 s `journalctl -t upssched-cmd -f` shows `ONBATT`, and the
   ON BATTERY mail arrives. Plug back in before 120 s → `ONLINE`, timer cancelled. Pull again and wait 120 s → the log shows
   `TEST would run: … sifter-powerdown.target` and `… upsmon -c fsd`. Also check `upsc tower ups.status` reads `OB` on battery.
8. Only after R14 (RAM disk) exists: remove `SIFTER_TEST=1`, and (planned window) do one real pull to the end: the RAM disk
   flushes, tower powers off cleanly, and comes back (BIOS: AC recovery → **Power On**, so it boots when mains returns).

---

## 2. Memory: ECC verified

- `dmidecode -t memory`: **Error Correction Type: Multi-bit ECC**. There are 12 × 16 GB DDR4-2133 RDIMMs and **4 empty
  slots**. MemTotal is 197,949,836 kB = **188.8 GiB**.
- EDAC: `mc0`–`mc3` all show **ce_count=0, ue_count=0** after 42 days of uptime.
- **Consequence:** bit rot in RAM is not the risk. Corrected errors are fixed silently and uncorrectable ones are reported.
  Keeping data resident for days is fine. The remaining risks are **power loss and kernel crashes** (§5).
- **Cheap upgrade path [assume prices]:** filling the 4 empty slots with 4 × 16 GB DDR4 ECC RDIMMs adds 64 GB (to 256 GB) for
  roughly $60–100 used. Every extra GB can go to the RAM disk.

---

## 3. Measured baseline (2026-10-22 02:40 UTC)

### 3.1 SMART

| device | role | lifetime writes | rated TBW [spec] | wear |
|---|---|---|---|---|
| nvme0n1 Samsung 970 EVO Plus 1 TB | `/fast` | **526.93 TB** (1,029,155,511 units) | 600 | **55 % used** at 3,025 h (51 % on 10-14); 0 media errors, 56 unsafe shutdowns |
| sdd Kingston A400 960 GB | `/crutch` | **46,541 GiB = 50.0 TB** | 300 | ~17 % of TBW |
| sdb Kingston A400 240 GB | `/` | **17,437 GiB = 18.7 TB** | 80 | ~23 % of TBW |
| sdc Seagate ST22000NM000C 22 TB | `/tank` | 101,241,268,899 LBAs = 51.8 TB | workload rating ~550 TB/yr [assume, check datasheet] | — |
| sda Seagate ST4000DM004 4 TB (SMR) | `/vault` | 1.9 TB | — | — |

**Remaining life of the 970 EVO.** percentage_used rose 4 points (51 → 55) in the week after 10-14. sysstat shows about
5–6 TB/day over that week. That is roughly **10 TB of host writes per 1 %**, which leaves **about 430 TB [est]** before
100 %. The drive is already past 88 % of its 600 TBW warranty figure. The percentage_used counter (an estimate of NAND wear)
is the better guide.

**TRIM.** `fast` has `autotrim=off` and was last trimmed on 10-04. Several hundred TB have been written since, and running
without TRIM raises the drive's internal write amplification. Neither A400 receives TRIM: `lsblk -D` shows a discard size
of 0 on this controller, and `zpool status -t` reports "trim unsupported".

### 3.2 Write rates

**10-minute window** (02:41:11–02:51:13 UTC, 602 s), **extrapolated to a day. This is only a 10-minute sample.**

| device | written in 10 min | **TB/day (extrapolated)** |
|---|---|---|
| nvme0n1 (`/fast`) | 611.7 MB | **0.088** |
| sdd (`/crutch`) | 2.5 MB | **0.000** (indexer idle) |
| sdb (`/`) | 388.3 MB | **0.056** |
| sdc (`/tank` HDD) | 11,672.6 MB | **1.675** |
| sda (`/vault` HDD) | 3.9 MB | 0.001 |

| dataset (objset `nwritten`, logical) | 10 min | TB/day (extrapolated) | device ÷ logical |
|---|---|---|---|
| fast/siftersearch-db | 177.9 MB | 0.026 | **3.4×** (612 MB on the NVMe) |
| fast (root dataset: Qdrant, embedding cache, …) | 0 | 0 | — |
| crutch (vector stores) | 0 | 0 | — |
| tank | 917.0 MB | 0.132 | **12.7×** (11.7 GB on sdc) |

| process (`/proc/<pid>/io` write_bytes) | 10 min | TB/day (extrapolated) |
|---|---|---|
| meilisearch (on `/tank` since 10-20 19:22) | 843.1 MB | **0.121** |
| siftersearch-worker (single SQLite writer) | 204.4 MB | **0.029** |
| siftersearch-api, anis, ops, indexer, gateway, updater, audit, reports-carry | < 0.5 MB each | ~0 |
| qdrant | 0 | 0 (no upserts or optimizer in this window) |

**History** (sysstat `sar -d`, daily averages, TB/day):

| day | 10-13 | 10-14 | 10-15 | 10-16 | 10-17 | 10-18 | 10-19 | 10-20 | **10-21** |
|---|---|---|---|---|---|---|---|---|---|
| nvme0n1 | 7.70 | 8.82 | 8.10 | 2.01 | 2.33 | 9.10 | 4.87 | 6.27 | **0.13** |
| sdd (A400 960) | 0 | 0 | 0 | 0.29 | 0.48 | 0.30 | 0.00 | 0.03 | 0.00 |
| sdc (tank) | 0.29 | 0.65 | 0.40 | 0.25 | 0.05 | 0.12 | 0.13 | 0.30 | 0.85 |
| sdb (root) | 0.07 | 0.11 | 0.03 | 0.03 | 0.04 | 0.05 | 0.04 | 0.07 | 0.05 |

The NVMe wrote a steady ~100 MB/s until **10-20 about 16:50 PDT**, and then dropped to 1–8 MB/s. That matches the deploy of
`MEILI_WRITES=off` (commit 10-20 16:12), which stopped the worker pushing paragraphs, HyPE, mentions and aliases to
Meilisearch while Meilisearch lived on `/fast`.

Since boot (42.6 days), the NVMe has taken 172.5 TB (4.0 TB/day) and the Qdrant process has written 40.9 TB in 20.4 days.

### 3.3 The top write sources and why

1. **Meilisearch LMDB inside ZFS 128K records (historically the largest source; still the largest on `/tank`).**
   - LMDB commits scattered 4 KiB pages and calls fsync on every commit.
   - On ZFS with `recordsize=128K` and `logbias=latency`, each dirty page makes ZFS rewrite its whole record at the next
     transaction group (`zfs_txg_timeout=10`). Each fsync also copies the data into the intent log (ZIL), which sits in the
     same pool because there is no separate log device.
   - Measured now on `/tank`: 0.84 GB written by Meilisearch became about 11.7 GB on the disk (**~14×**). The attribution
     is by elimination: Meilisearch is the only process writing materially to `/tank` in the window.
   - When Meilisearch lived on `/fast`, this was the ~100 MB/s steady stream.
   - Meilisearch still writes about 1.4 MB/s with `MEILI_WRITES=off`, which gives about 1.7 TB/day on the HDD. That is above
     a typical 550 TB/yr enterprise HDD workload rating [assume], and it keeps sdc busy.
2. **Qdrant `phrases`: float32 storage plus repeated merging (2.0 TB/day averaged over 20 days).**
   - The collection holds 35,424,005 points (36,672,180 indexed vectors, so about 1.25 M are outdated) of 3072-dim float32
     vectors (12 KiB each) in **111 segments, 388 GB**.
   - Its source, `vectors.db`, stores them as **float16**, so half of every byte written is padding.
   - The indexer upserts **256 points per request with `wait=true`**. That builds many small segments, which the merge
     optimizer then rewrites again and again. Each vector gets written several times.
   - The optimizer is now **red**: "Not enough space available for optimization, needed: 189.70 GiB". On 10-20 it retried
     every 5 s.
   - `/fast` now shows **388 GB free**, more than 190 GiB. **[risk]** When Qdrant next restarts, or the optimizer is
     re-triggered, it may start a single 190 GiB merge on the worn NVMe: about 0.2–0.4 TB of writes plus a very large HNSW
     build. Step R3 below prevents this.
3. **The SQLite content DB in ZFS (0.088 TB/day on the NVMe, 3.4× amplification).**
   - The worker wrote 204 MB in 10 minutes, which arrived in the dataset as 178 MB and on the NVMe as 612 MB.
   - Two causes:
     - the WAL checkpoint fsyncs (PASSIVE every 60 s, TRUNCATE every 15 min) copy data through the ZIL (`logbias=latency`);
     - SQLite's 4 KiB pages sit inside 16K records.
   - In absolute terms it is small.
   - Root SSD (sdb, 0.056 TB/day): the **8 GB swap file is full** (32 MB free, swappiness 60), pm2 logs are on `/` (the
     embedding log alone is 733 MB), and the GNOME desktop with tracker-miner runs there.
4. **The phrase indexer on `/crutch` (0.3–0.5 TB/day while it ran, 10-16 to 10-18; idle now).**
   - `vectors.db` is SQLite in WAL mode, with `INSERT OR IGNORE` into a 240 GB B-tree keyed by a text hash. That means
     random 4 KiB pages, each written twice (once to the WAL, once at checkpoint), inside 16K records.
   - It also runs per-row `UPDATE units SET upserted=1`.
   - zfs-auto-snapshot takes **frequent snapshots (every 15 min) and hourly ones on `crutch`**, which pins freed blocks.

---

## 4. RAM budget (188.8 GiB; SifterSearch only, Meilisearch retired)

Measured now:
- Qdrant: RssAnon 37.5 GB plus 6.6 GB swapped out, so **about 44 GB of anonymous memory** (RssFile 21.6 GB).
- All node processes together: **8.1 GB**.
- ARC: 83.6 GB (c_max 128 GiB).
- Meilisearch: 10.9 GB.
- MemAvailable: 52 GB. Swap: 8 GB, full.

| item | GiB | basis |
|---|---|---|
| Kernel, slab, page tables, systemd, no desktop | 5 | [est]; the GNOME desktop goes |
| Node services (gateway, api, anis ×2, ops, reports ×2, indexer, worker, embedding, deep-research, grounding jobs) | 10 | 8.1 measured + margin |
| **Qdrant main** (on SSD) anonymous memory: `phrases` binary-quantised vectors `always_ram` (35.4 M × 384 B = **13.6 GB**), HNSW graph in RAM (~6 GB [est]), payload indexes on 9 fields (~3–5 GB [est]), id tracker | 30 | 44 measured today includes the small collections that move to the RAM instance |
| **Qdrant hot** (RAM-disk instance) anonymous memory: quantised vectors, HNSW, BM25 sparse index | 6 | [est] |
| **ZFS ARC** (cap: `zfs_arc_max` 40 GiB, `zfs_arc_min` 32 GiB) | 40 | holds all of `sifter.db`: 30.4 GB on disk (compressed ARC; 59 GB logical, compressratio 1.84×), plus pool metadata and the `/tank` working set |
| Linux page cache: Qdrant main's mmap'd float16 vectors for rescoring, payload, and `vectors.db` reads | 14 | [est]; reads do not wear SSDs, so a smaller cache costs latency only |
| **RAM disk (tmpfs, `noswap`)** | **64** | §6.1 |
| Headroom (also covers unused RAM-disk space) | 19.8 | |
| **total** | **188.8** | |

**Notes**

- **"The hot DB fully in RAM"** means the ARC, not a RAM disk. `sifter.db` is the source of truth and stays on persistent
  storage. ZFS compresses blocks in the ARC, so 40 GiB of ARC holds the whole 59 GB file. Prewarm it at boot with
  `nice -n 19 cat sifter.db > /dev/null` (about 30 GB, roughly 1 min). Leave SQLite `mmap_size` at 1 GB: on ZFS, mmap'd
  pages are cached twice (page cache plus ARC), so a larger mmap would waste RAM.
- **"Compressed vectors in RAM"** means binary quantisation with `always_ram`, rescored against the full vectors mmap'd from
  SSD. Upgrade path if RAM allows (for example after the DIMM upgrade): Qdrant's 2-bit binary encoding for `phrases`, 27 GB
  instead of 13.6 GB, for better recall before rescoring. That needs a battery test.
- **Swap:** turn off the 8 GB swap file on the root A400 and use an 8 GB zram device. It uses RAM only when something
  actually swaps.
- **With 256 GB (DIMM upgrade):** make the RAM disk 128 GB. Then `phrases` itself could live in RAM if it is cut to 1536
  dims: Gemini embeddings are trained to be truncated (Matryoshka), so 35.4 M × 3 KiB float16 = 106 GB. **[needs Chad and
  a battery test:** a quality change, not just a storage change.**]**

---

## 5. What lives where, and what each flush interval puts at risk

### 5.1 Rebuildability

| store | size now | rebuildable? | cost to rebuild | RAM disk? |
|---|---|---|---|---|
| `sifter.db` (content, source of truth) | 59 GB logical / 30.4 GB on disk | **no** | — | **never**; ARC caches it |
| `vectors.db` phrase / hype / concept (Gemini embeddings) | 240 / 20 / 0.9 GB | only by paying again | ~$300–400 of Gemini at the indexer's price [est] | **never** |
| Qdrant `phrases` | 388 GB (float32) → ~230 GB as float16 | yes, from `vectors.db` | ~3.5 h for 35 M points (measured bulk load: 10 M points in 60 min = 37 min upload + 23 min HNSW) | no (bigger than RAM) |
| Qdrant `hype` | 30 GB → ~15 GB as float16 | yes, from `hype-vectors.db` | ~15 min [est from the same rate] | **yes** |
| Qdrant `concepts`, `t_ar`, `t_en` | 1.3 + 1.4 + 1.9 GB | yes | minutes | **yes** |
| Qdrant `paragraphs_kw` (BM25, 9.1 M points) | 5.2 GB | yes, from SQLite (keyword-index job) | hours [est] | **yes** |
| Qdrant `kw_smoke`, `lex_test` (tests) | 31 MB | yes | — | yes, or drop them |
| Build staging (new or rebuilt collections before they are promoted) | ≤ 30 GB at a time | yes | the build itself | **yes** |
| Meilisearch | 120 GB on `/tank` | being retired | — | no (retire it) |

> **Backup gap.** The HDD copies of the vector stores (`/tank/sifter/*-vectors.hdd-20261016`) are from 10-16:
> 197 GB against 240 GB now. About **42 GB of paid embeddings exist only on `/crutch`**: a single A400 with no TRIM and no
> redundancy. zfs-auto-snap snapshots on the same disk are not a backup. **Step R1 closes this gap. It needs Chad's
> approval** because it is a server job against `vectors.db`.

### 5.2 Flush intervals: phase 1 (before the UPS) and phase 2 (with the UPS)

A flush is a Qdrant snapshot per collection, written once and sequentially to the NVMe. A collection is flushed only if it
changed since its last flush. Each flush writes a new file and renames it into place, and two generations are kept, so a
crash during a flush leaves the previous snapshot intact.

| store | phase 1 interval | lost on power cut or crash | phase 2 interval | lost in phase 2 |
|---|---|---|---|---|
| Qdrant hot (RAM disk) | **every 6 h, if changed** (≤ 25 GB per flush, ≤ 0.1 TB/day) | up to 6 h of upserts to hype, concepts, t_*, paragraphs_kw. **No paid data:** the vectors are in `vectors.db` and BM25 comes from SQLite. | **every 24 h, if changed**, plus on UPS event and at every shutdown (≤ 0.025 TB/day) | power cut: nothing (UPS flush). Kernel panic or PSU failure: up to 24 h, recovered the same way. |
| Build staging | never flushed | the in-progress build (CPU time only; $0 Gemini, vectors are cached) | same | same |
| Qdrant main (`phrases`, on SSD) | Qdrant's own WAL plus `flush_interval_sec` (30 → 120 s) | at most the last 120 s of upserts. A torn segment after power loss leads to a rebuild from `vectors.db` (~3.5 h). | same | very unlikely |
| `sifter.db` | unchanged: WAL, `synchronous=NORMAL`, checkpoint every 60 s; ZFS transaction group every 10 s | commits since the last checkpoint fsync (≤ ~70 s). Hourly db-ship snapshot on `/tank`. | same | power cut: none (clean stop) |
| `vectors.db` | unchanged: WAL, SQLite default `synchronous` (FULL) | nothing committed | same | none |

**Recovery after a crash (both phases).** Restore the newest hot snapshots (§6.3). Then run the indexer's reconcile to
re-upsert the units it marked upserted after the snapshot time. This needs code change C2, a `units.upserted_at` column.
Without C2, the fallback is a full re-upsert of the hot collections: minutes for everything except `paragraphs_kw`.

---

## 6. Design

### 6.1 The RAM disk

- **tmpfs at `/srv/qram`, `size=64G,noswap,mode=0750,uid=chad`.** The kernel is 7.0, so `noswap` is supported. ECC makes
  tmpfs safe for long residency. ZFS checksums would add nothing on a RAM device.
- A **second Qdrant instance, `qdrant-hot`**, uses `/srv/qram/storage` on ports 6335/6336. Its
  `QDRANT__STORAGE__SNAPSHOTS_PATH` points at `/faster/qram-snapshots` on the NVMe, so a snapshot is written straight to the
  SSD once and never staged in RAM.
- Collections in `qdrant-hot` use `on_disk: true` for vectors and payload. On tmpfs, "disk" is RAM, and `on_disk: false`
  would load a second copy into anonymous memory.
- **Search change (code change C3):** the layer config gives each collection a URL. The hot collections are read from :6335.
- **Build staging:** a large build (a new embedding model, re-segmentation, a site's phrases) loads into `qdrant-hot` in
  bulk mode (§7.1). There, every merge and HNSW construction happens in RAM.
  - For a small collection: snapshot it, then recover the snapshot into the main instance. That is one sequential write of
    the final size.
  - For `phrases`-sized data: build in **chunks of 20–30 GB**, either as separate per-chunk collections fanned out at query
    time (code change), or as Qdrant custom shards recovered from shard snapshots **[assume: shard-snapshot recovery into a
    different collection works on 1.19; verify on a test collection first]**.

### 6.2 What stays out of RAM, and how it is protected

- `sifter.db` stays on ZFS on the 970 EVO (`fast/siftersearch-db`), with hourly `db-ship.sh` snapshot-and-send to
  `/tank/backups`. It is read from the ARC.
- `vectors.db` stores move to a ZFS dataset on the new NVMe (§8), with the same snapshot-and-send to `/tank` as db-ship.
- Qdrant `phrases` moves to XFS on the new NVMe, as a fresh float16 collection built once (§7.1, R8).

### 6.3 Boot order (systemd)

Qdrant now runs as a **user** unit (`qdrant-next.service`), and pm2 runs as the system unit `pm2-chad.service`. Ordering
between the user and system managers is weak, so both Qdrant units become **system** units with `User=chad`.

```
zfs-import.target → zfs-mount.service (fast, faster, tank, vault)
  → faster-xfs.mount (/faster)       → srv-qram.mount (tmpfs)
  → qdrant-main.service (storage /faster/qdrant)
  → qdrant-hot.service  (ExecStartPre: qram-restore; storage /srv/qram)
  → pm2-chad.service (gateway, api, anis, ops, worker, indexer, …)
  → sifter-postboot.service (oneshot: ARC prewarm of sifter.db at nice 19; indexer reconcile since the snapshot time)
```

**Restore time [est]:** about 25 GB of snapshots read from the NVMe at about 2 GB/s and unpacked by Qdrant. Roughly 2–5 min
before hype and concepts answer. Until then the hot layers are missing from search, and search must degrade (skip the
layer), not fail. `phrases` (main) is available as soon as `qdrant-main` is up.

### 6.4 Unit sketches

```ini
# /etc/systemd/system/srv-qram.mount
[Mount]
What=tmpfs
Where=/srv/qram
Type=tmpfs
Options=size=64G,noswap,mode=0750,uid=1000,gid=1000
[Install]
WantedBy=local-fs.target

# /etc/systemd/system/qdrant-hot.service
[Unit]
Description=Qdrant HOT (RAM disk; rebuildable collections)
Requires=srv-qram.mount
After=srv-qram.mount qdrant-main.service
RequiresMountsFor=/faster/qram-snapshots
[Service]
User=chad
Environment=QDRANT__STORAGE__STORAGE_PATH=/srv/qram/storage
Environment=QDRANT__STORAGE__SNAPSHOTS_PATH=/faster/qram-snapshots
Environment=QDRANT__SERVICE__HTTP_PORT=6335
Environment=QDRANT__SERVICE__GRPC_PORT=6336
EnvironmentFile=/home/chad/qdrant-next/env
# qram-restore prints "--snapshot <newest file>:<collection>" for each collection whose storage is missing
ExecStart=/bin/sh -c 'exec /home/chad/qdrant-next/qdrant $(/usr/local/bin/qram-restore --args)'
# flush (only collections that changed) BEFORE systemd sends SIGTERM
ExecStop=/usr/local/bin/qram-flush --all-dirty --wait
TimeoutStopSec=600
Restart=on-failure
[Install]
WantedBy=multi-user.target

# /etc/systemd/system/qram-flush.service + .timer
[Service]
Type=oneshot
User=chad
ExecStart=/usr/local/bin/qram-flush --all-dirty --wait
[Timer]
OnCalendar=*-*-* 00/6:30:00        # phase 1; phase 2: OnCalendar=*-*-* 03:30:00
Persistent=true

# /etc/systemd/system/sifter-powerdown.target (pulled in by NUT; a normal `shutdown` gives the same order, because
# qdrant-hot's ExecStop flushes and pm2 stops after it)
[Unit]
Description=Flush the RAM disk, stop SifterSearch, power off
Requires=qram-flush.service
After=qram-flush.service
[Install]
# started by upssched-cmd: `systemctl start sifter-powerdown.target && /sbin/shutdown -h now`
```

**Prepared, not installed (10-21):** the units above are in `deploy/qram/` (srv-qram.mount, qdrant-hot.service,
qram-flush.service/.timer, sifter-powerdown.target, wrappers qram-flush / qram-restore) and the logic in
`scripts/ops/qram.mjs` (tests: `tests/api/qram.test.js`). Install at R14 (after the MP44, `/faster`, and the float16
`phrases` rebuild): `sudo install -m 755 deploy/qram/qram-{flush,restore} /usr/local/bin/`; `sudo cp
deploy/qram/*.{mount,service,timer,target} /etc/systemd/system/`; `sudo mkdir -p /faster/qram-snapshots && sudo chown
chad: /faster/qram-snapshots`; `sudo systemctl daemon-reload`; `sudo systemctl enable --now srv-qram.mount qdrant-hot
qram-flush.timer`. Check first: `systemd-analyze verify` (on 10-21 its only complaint was the not-yet-installed
/usr/local/bin/qram-flush), RAM free ≥ 64 GB + headroom (§4), and the ARC cap (R13) in place.

`qram-flush` is a code change (C4). For each collection in `qdrant-hot` it:
1. compares `points_count` and the newest segment mtime with the values recorded at the last flush;
2. if they changed, calls `POST /collections/<c>/snapshots?wait=true`;
3. keeps two generations and records the time in `/faster/qram-snapshots/state.json`;
4. sends one line per collection to the ops log.

`qram-restore --args` picks the newest complete snapshot per collection.

**NUT** (after the UPS arrives):
- `ups.conf`: `[tower] driver=usbhid-ups port=auto`
- `upsmon.conf`: `MONITOR tower@localhost 1 upsmon <pw> primary`, `SHUTDOWNCMD "/sbin/shutdown -h +0"`,
  `NOTIFYCMD /usr/sbin/upssched`, `NOTIFYFLAG ONBATT SYSLOG+EXEC`, `NOTIFYFLAG ONLINE SYSLOG+EXEC`,
  `NOTIFYFLAG LOWBATT SYSLOG+EXEC`
- `upssched.conf`: `AT ONBATT * START-TIMER powerdown 120`, `AT ONLINE * CANCEL-TIMER powerdown`,
  `AT LOWBATT * EXECUTE powerdown`
- `upssched-cmd`: `powerdown) systemctl start sifter-powerdown.target; /sbin/upsmon -c fsd ;;`
- Also email Chad on `ONBATT` (the spend-alerts mailer already exists).

### 6.6 Phase 0: interim RAM disk until the MP44 (Chad 10-21)

Chad: indexing must not stop or slow during the week before the MP44 arrives. With the `phrases` optimizer frozen (R3), new
phrase points would pile up unindexed on `/fast` (brute-force scanned, and still EVO writes). Phase 0 is R14 sized for now:

- **RAM disk:** `srv-qram.mount`, tmpfs **44 G** (`noswap`) at `/srv/qram`. ARC max lowered 128 → **48 GiB** first (R13 early).
- **`qdrant-hot`** (system unit, ports 6335/6336, `Before=pm2-chad.service`) with storage on the tmpfs. Collection
  **`phrases_hot`**: same metric, binary quantisation and payload indexes as `phrases`, but `datatype: float16` (lossless:
  `vectors.db` holds f16; half the RAM). hype/concepts stay on `/fast`: their optimizers are not frozen and they grow by
  tens of thousands of points per run.
- **Indexer** (`QDRANT_HOT_URL` in `.env-public`): phrase-index sends NEW points to `phrases_hot` and marks them
  `upserted = 2`; stale deletes go to both. It stops cleanly (and mails) if the RAM disk has < 6 GB free. No build staging or
  scratch dirs exist in the indexer (it streams from `vectors.db`), so nothing else moves.
- **Search** (C3, `api/lib/search/qdrant-layers.js`): phrase queries go to main + hot in parallel and merge (best score,
  one per point id, hot wins); hot down or slow = main only. Writes to `phrases` (outbox deletes, stamp-voices,
  stamp-site) are mirrored to `phrases_hot`; coverage counts both.
- **Flush** (C4, `scripts/ops/qram.mjs`): `qram-flush.timer` every 6 h + qdrant-hot's `ExecStop`; snapshots of changed
  collections to **`/crutch/qram-snapshots`** (sequential, rare: fine on the A400 for a week); 2 generations kept. Qdrant's
  `temp_path` must stay on the tmpfs: CLI snapshot recovery unpacks into it and *renames* into storage, which fails across
  filesystems (tower crash test 10-21). So the indexer stops when the RAM disk's free space would drop below the hot data
  size (room for a snapshot's temp files): **usable hot capacity ≈ 22 GB ≈ 3 M phrase points** at float16.
- **What a crash or power loss loses: nothing paid, at most 6 h of upserts.** The embeddings are in `vectors.db` on disk.
  At boot qdrant-hot restores the newest snapshot; the indexer service queues `phrase-hot-reconcile` at every start, which
  checks every `upserted = 2` unit against `phrases_hot` and re-sends the missing ones from stored vectors (no Gemini spend).
  Tested: `tests/api/qdrant-hot.test.js` (indexer against a fake Qdrant: 5 sent, 2 lost, 2 re-sent) and on tower with a
  scratch collection: process crash → 0 lost; RAM wiped → restored to the last snapshot in 2 s; clean stop → flush → 0 lost.
- **When the MP44 arrives (R10–R12):** build `phrases_f16` on `/faster` from `vectors.db` (it contains every unit, main and
  hot), swap the alias, then unset `QDRANT_HOT_URL`, drop `phrases_hot`, and mark `upserted = 2` → 1. R14 then re-uses the
  same units at 64 G with snapshots on `/faster`.

---

## 7. Write-amplification fixes

### 7.1 Qdrant

| fix | effect | type |
|---|---|---|
| **float16 vectors** (`"datatype": "float16"` in the vector params) for every 3072-dim collection. The source is already float16 (`packF16` in `vectors.db`), so this is lossless. | halves the bytes of every upload, merge, snapshot and rescoring read; `phrases` goes 388 → ~230 GB | new collections + loader (code) |
| **Bulk-load mode** for a build or rebuild: create with `hnsw_config.m = 0` (or `optimizers_config.indexing_threshold = 0`), upload in parallel batches of 1,000–2,000 with `wait=false`, then PATCH `m = 16` once and wait for green | each vector is written about once and HNSW is built once; measured 10 M points/h on this box | loader (code) |
| **Bounded segments:** `optimizers_config.max_segment_size` (in **kilobytes**) = 10,000,000 (~10 GB) and `default_segment_number = 24` for `phrases` (~230 GB / 10 GB) | ends the "needs 189.70 GiB" merge; a merge never rewrites more than ~10 GB at a time | PATCH (setting) |
| **Freeze the `phrases` optimizer on the old NVMe until the move** (`max_optimization_threads: 0`) | stops a surprise 190 GiB merge now that `/fast` has 388 GB free | PATCH (setting) |
| **Larger, fewer upserts:** the indexer sends 256 points with `wait=true` and then one `UPDATE … upserted=1` per row. Change to 2,000 points with `wait=false` and a single `wait=true` at the end of each 20,000-paragraph chunk, and mark rows with one `UPDATE … WHERE point_id IN (…)` per batch | fewer, larger appendable segments, so less merge work; fewer SQLite WAL frames | code (`scripts/phrase-index/indexer.mjs`) |
| `flush_interval_sec` 30 → 120 on `phrases`; 5 → 120 on `t_ar`, `t_en`, `kw_smoke`, `lex_test` (these are rebuildable, and the WAL covers the gap) | fewer small mmap writebacks | PATCH (setting) |
| Drop `kw_smoke` and `lex_test` if they are no longer used | — | Chad |

### 7.2 ZFS (where ZFS stays)

| dataset | setting | why |
|---|---|---|
| `fast/siftersearch-db` | `logbias=throughput` (keep `sync=standard`, `recordsize=16K`) | checkpoint fsyncs write the data block directly and do not copy it into the ZIL first. Expected to remove most of the 3.4× (to be measured). |
| pool `fast` | `autotrim=on` (plus one `zpool trim fast` at night) | lowers the 970 EVO's internal write amplification; untrimmed since 10-04 |
| `crutch` | `com.sun:auto-snapshot=false` | 15-min and hourly snapshots of a churning store pin freed blocks and fragment a drive that cannot TRIM |
| `faster/vectors` (new) | `recordsize=4K`, `compression=off`, `logbias=throughput`, `sync=standard`, `atime=off` | matches SQLite's 4 KiB page, so there is no record rewrite; float16 vectors do not compress (crutch compressratio is 1.04×) |
| `faster/qram-snapshots` or `tank/qram-snapshots` (if on ZFS) | `recordsize=1M`, `sync=disabled`, `logbias=throughput`, `compression=off` | sequential, written once, rebuildable |
| any live Qdrant storage on ZFS (only until the move) | **not** `recordsize=1M`: mmap writebacks are 4 KiB and would rewrite 1 MiB records (256×). Use `sync=disabled` + `logbias=throughput` only, and only on a dataset that holds nothing else. | — |

> **Caution.** `sync=disabled` on the pool root `fast` would be inherited by `fast/siftersearch-db`. Never set it on `fast`
> itself.

`recordsize=1M` with `sync=disabled` is right for write-once flush targets and wrong for live mmap stores.

### 7.3 SQLite

- **`sifter.db`:** keep `journal_mode=WAL` and `synchronous=NORMAL`.
  - Raise the worker's PASSIVE checkpoint interval from 60 s to 300 s. A page dirtied many times is then written to the DB
    file once per 5 min, not once per minute. The cost is a WAL of up to about 5 min of writes: about 100 MB at the measured
    rate, far from the 4.6 GB that froze the writer on 10-13.
  - Keep the 15-min TRUNCATE.
  - A page-size change (4 KiB → 16 KiB, which needs a VACUUM) is **not** worth it. It does not reduce bytes written and costs
    a 59 GB rewrite.
  - (Code: `api/workers/unified-worker.js` ~l.875.)
- **`vectors.db`:** its WAL checkpoints automatically every 1,000 pages. Set `wal_autocheckpoint=10000` (40 MB) during
  builds so hot B-tree pages are written fewer times. Batch the `upserted` marks as in §7.1. (Code: `indexer.mjs`.)

### 7.4 Root SSD and the rest

- `swapoff /swap.img` and add zram (8 GB), with `vm.swappiness=10`.
- Move `~/.pm2/logs` and `~/sifter/siftersearch/logs` to `/tank/logs` with logrotate. The embedding log alone is 733 MB.
- Remove the desktop stack (§9).
- **Finish retiring Meilisearch, or stop it.** It still writes about 1.7 TB/day to the `/tank` HDD with `MEILI_WRITES=off`.

---

## 8. ZFS vs XFS/ext4 per device, and the layout after the 4 TB NVMe

### 8.1 The comparison

| factor | ZFS (tuned) | XFS/ext4 (or tmpfs + flush) |
|---|---|---|
| Write amplification on random 4 KiB writes (Qdrant mmap, LMDB, SQLite B-tree) | copy-on-write rewrites the whole record. Measured 3.4× (16K) and ~14× (128K). Fixable only by setting recordsize = page size, which loses compression. Plus the ZIL copy on fsync with `logbias=latency`. | in place, ~1× at the filesystem; only the SSD's own amplification, which TRIM keeps low (weekly `fstrim.timer` is already active) |
| Snapshots and incremental send (`db-ship.sh`) | **hourly incremental ≈ 400 MB** (`ship-20261022-0217` used 398 M) | the replacement would be SQLite `.backup` or `VACUUM INTO`, which copies all 59 GB each time (~150× more bytes) and holds a read transaction for its whole duration, so the WAL cannot be checkpointed (the 10-03 12 GB WAL incident) |
| Checksums | end to end; detects silent SSD corruption | metadata only (XFS). With ECC RAM and a rebuildable store, corruption leads to a rebuild from the source. |
| Caching | compressed ARC: `sifter.db` fully cached in 30 GB. mmap'd files are cached twice (ARC + page cache), which hurts Qdrant. | page cache once; right for mmap-heavy Qdrant |
| Migration effort and risk | none for what stays | Qdrant: build fresh on the new drive (no copying of the 111-segment collection); rollback is a Qdrant alias swap |

**Conclusion:**
- **Data that is the source of truth stays on ZFS:** `sifter.db` and `vectors.db`. Snapshot-and-send is the cheapest correct
  backup, and the ARC holds the DB compressed.
- **Rebuildable Qdrant goes to XFS or tmpfs.** It does not need snapshots, checksums or copy-on-write, and ZFS costs it both
  amplification and double caching.

### 8.2 Recommended layout per device

| device | filesystem | holds | why |
|---|---|---|---|
| **New 4 TB NVMe: TEAMGROUP MP44** (TLC, 2,000 TBW, HMB; Slot1 Gen3 x4; arriving ~10-24) | **p1 ~2.9 TB XFS `/faster`** (noatime, weekly fstrim) | Qdrant main storage (`phrases` as float16 ~230 GB + growth), `qram-snapshots`, build overflow | in-place writes, single page cache, fastest flush target |
| | **p2 ~0.8 TB ZFS pool `faster`** (`autotrim=on`, ashift=12) | `faster/vectors` (all three `vectors.db`, 260 GB → growing), snapshot-and-send to `tank/backups/vectors` with the db-ship procedure | paid data: checksums and cheap incremental backups; 4K records remove the record rewrite |
| | ~10 % left unpartitioned | — | extra over-provisioning for a consumer drive [assume it helps; cheap] |
| **970 EVO Plus 1 TB** (55 % worn) | ZFS `fast` (keep) | `fast/siftersearch-db` only, plus small read-mostly data (huggingface cache, `siftersearch-data` embedding cache 14 GB, sifter-vocab) | at about 0.05–0.09 TB/day the remaining ~430 TB lasts more than 10 years |
| **A400 960 GB** `/crutch` (no TRIM via this controller) | ZFS `crutch` (keep, auto-snapshots off) | nothing hot. Once the stores have moved: a second-generation copy of the qram snapshots (sequential, once a day) and a cold archive | DRAM-less, no TRIM, measured 82 % utilisation and 667 ms write latency under the indexer |
| **A400 240 GB** `/` | ext4 (keep) | OS only; no swap file, no logs | 18.7 of 80 TBW |
| **22 TB HDD** `/tank`, **4 TB HDD** `/vault` | ZFS (keep) | backups, docs, media, db-ship history, vector-store backups, logs; Meilisearch until it is retired | |

**Moving `sifter.db` to the new drive** is optional and should not happen before the new drive has run 1–2 months. The EVO
copes fine with SQLite alone, and keeping the source of truth and the paid vectors on different physical drives is a
benefit.

### 8.3 What moves from `/crutch`, and when

1. **Day 0 (drive installed, needs Chad):** create the `/faster` XFS partition and the `faster` pool.
   - Stop the indexer lane (ops: drain).
   - `zfs snapshot crutch@move`, then `zfs send crutch@move | zfs recv faster/vectors`. All three stores travel in one
     sequential pass of about 260 GB. `send` does not interpret the files, so this is not DB access by a script.
   - Repoint the `/tank/sifter/{phrase,hype,concept}-vectors` symlinks to `/faster/vectors/...`.
   - Restart the indexer.
   - Rollback: point the symlinks back to `/crutch` (untouched until day +7).
2. **Day 0–1:** build `phrases_f16` on `/faster` in bulk mode from `vectors.db` (~3.5 h [est from the measured 10 M/h]). Run
   the type battery against it, then swap the alias `phrases` → `phrases_f16`. Rollback: alias back. Keep the old
   collection on `/fast` read-only for 7 days, then delete it. That frees 388 GB on the EVO.
3. **Day 1–2:** stand up `qdrant-hot` on `/srv/qram` and recover hype, concepts, t_ar, t_en and paragraphs_kw into it from
   snapshots of the current instance. Switch search to it (C3). Rollback: the layer URL points back to the main instance.
4. **Day +7:** destroy the `crutch` copies and turn auto-snapshots off for good. `/crutch` becomes cold storage.

### 8.4 The new drive: TEAMGROUP MP44 4 TB (TM8FPW004T0C101)

| spec | value | source |
|---|---|---|
| Endurance | **2,000 TBW**, 5-year warranty, MTBF 1.6 M h | [TEAMGROUP product page](https://www.teamgroupinc.com/en/product-detail/ssd/T-FORCE/mp44/mp44-TM8FPW004T0C101/) |
| NAND | **TLC** (not QLC). Most 4 TB units: Maxio MAP1602A + YMTC 232-layer TLC; TEAMGROUP also ships Phison E18/E27T with Kioxia BiCS5/6 TLC under the same part number | [Tom's Hardware review](https://www.tomshardware.com/reviews/teamgroup-mp44-ssd-review), [PC Gamer 4 TB review](https://pcgamer.com/hardware/ssds/team-group-mp44-4-tb-review), [TheOverclockingPage](https://theoverclockingpage.com/2025/09/10/teamgroup-mp44-1tb-ssd-affordable-fast-and-efficient-but-not-always-the-same/?lang=en) |
| DRAM | **none (DRAM-less, uses HMB)**: borrows host RAM (typically 32–64 MB) for its mapping table | TEAMGROUP product page ("DRAM: No") |
| Cache | dynamic SLC cache (large; full-drive SLC on an empty drive); speed drops to native TLC once full | Tom's Hardware |
| Interface | PCIe 4.0 x4. On the 7910 (PCIe 3.0) it runs at **Gen3 x4, ~3.5 GB/s** at most | — |
| Thermal | reviews note a low throttle limit: the Sabrent card's heatsink is worth having | Tom's Hardware |

**What this changes in the plan:** the [assume] in §10 is resolved: TLC, 2,000 TBW. At the projected ~0.15 TB/day that is
~36 years of rated endurance; even one full `phrases` rebuild a month adds only ~3.6 TB/yr. HMB is fine on Linux (the
`nvme` driver grants it automatically); confirm with `nvme id-ctrl /dev/nvmeX | grep -E 'hmpre|hmmin'` (non-zero = HMB) and
`nvme get-feature /dev/nvmeX -f 0x0d -H` (Host Memory Buffer enabled). Record which controller arrived (`nvme id-ctrl`
`mn`/`fr` and `smart-log`) because the variant matters for sustained-write behaviour.

### 8.5 Slots on the Precision 7910 (read-only check, 10-21: `dmidecode -t slot`, `lspci -vv`, `lspci -tv`)

| slot (dmidecode) | electrical | CPU / root port | now |
|---|---|---|---|
| **Slot1** | **PCIe 3.0 x4** | **CPU1** (root port 00:01.1, bus 02) | **empty ("Available")** |
| Slot2 | PCIe 3.0 x16 | CPU1 | empty |
| Slot3 | PCIe **2.0** x4 | **chipset** (C610 root port 00:1c.4) | **970 EVO Plus** (link 5 GT/s x4: downgraded to Gen2, ~1.6 GB/s) |
| Slot4 | PCIe 3.0 x16 | CPU1 (00:03.0) | **GTX 1070** (drives the monitor on DP-1, nvidia 580) |
| Slot5 | 32-bit PCI | TI PCIe-to-PCI bridge | empty |
| Slot1_CPU2 | PCIe 3.0 x16 | CPU2 | **Quadro K4000** (no working driver: Kepler is not supported by the 580 driver) |
| Slot2_CPU2 | PCIe 3.0 x16 | CPU2 | empty |

- **Slot #1 is right for the MP44:** Gen3 x4 straight off CPU1 (no chipset hop), and it is free. An x4 drive gains nothing
  from an x16 slot, so the Sabrent card in Slot1 runs at the drive's full Gen3 speed (~3.5 GB/s). Slot1 sits at the top of
  the board; the GTX 1070 in Slot4 is not next to it. **Chad: confirm by eye** that no GPU cooler or cable overhangs Slot1,
  and that the Sabrent card's edge fits (Slot1 is an x16-length connector wired x4 on the 7910).
- **Booting:** tower boots in UEFI from `sdb` (Kingston A400 240 GB: `/boot/efi` = sdb1, `/` = sdb2; boot entry
  "Ubuntu" → sdb1 `shimx64.efi`). The MP44 is a **data drive only**, so the box's "BIOS NVMe support needed" note does not
  apply: Linux's `nvme` driver finds it like the 970 EVO (which already works the same way in a PCIe adapter). Do not add a
  boot entry for it.
- **BIOS (A34) to check if the drive does not appear:** Settings → System Configuration → **Slots**: Slot1 must be
  **Enabled** (some 7910s ship with unused slots disabled). Bifurcation settings are irrelevant: the Sabrent card holds one
  drive and needs no lane splitting.
- **Optional later:** Slot2 (Gen3 x16, CPU1) is also free. Moving the 970 EVO's adapter from Slot3 (Gen2, chipset) to Slot2
  would double its link speed. Not needed for wear; only do it in the same shutdown if convenient.
- The disks `sda`–`sdd` hang off an LSI SAS3008 HBA (`TRAN sas`); that HBA is why the A400s get no TRIM (§3.1).

### 8.6 Installing the drive (Chad, hands-on; no partitioning until R10)

1. **Before shutting down** (from a session on tower): drain the indexer (`pm2 stop siftersearch-indexer` after its jobs
   yield, or wait for idle) and check no ops job is running (`node scripts/ops/ops.mjs reports`).
2. `sudo shutdown -h now`. Unplug power; hold the power button 5 s.
3. **Pull the Quadro K4000** from Slot1_CPU2 (see the GPU note below). Keep the GTX 1070 in Slot4: the monitor is on it.
4. Put the MP44 on the Sabrent card (heatsink pad on, protective film off the pad), seat the card in **Slot1**, screw the
   bracket.
5. Boot. If the drive is missing, enter BIOS (F2) and enable Slot1 (above).
6. **First-boot checks (read-only):**
   - `sudo nvme list`: a second device (nvme1n1, ~4.0 TB, model "TEAMGROUP TM8FP…"). Device names can swap, so always use
     `/dev/disk/by-id/nvme-…` from here on.
   - `sudo lspci -vv -s $(lspci | awk '/Non-Volatile/{print $1}' | tail -1) | grep -E 'LnkCap|LnkSta'`: expect
     **Speed 8GT/s, Width x4** (Gen3 x4). 2.5/5 GT/s or x1/x2 means a bad seat or the wrong slot.
   - `sudo nvme smart-log /dev/nvme1n1 > /tank/sifter/wear/mp44-smart-day0.txt` and `sudo nvme id-ctrl /dev/nvme1n1 >
     /tank/sifter/wear/mp44-idctrl.txt` (baseline: data_units_written, percentage_used, temperature; controller variant
     and HMB fields).
   - `zpool status` (all pools ONLINE), `pm2 list` (all services back), and a search through 127.0.0.1:7839.
7. **Do not partition or format.** That is step R10 (§11), done as its own change with the layout in §8.2.

### 8.7 Which GPU to keep (Chad is removing one)

**Keep the GTX 1070; remove the Quadro K4000.**
- The monitor is connected to the 1070 (DP-1), and the 1070 is the card the installed nvidia 580 driver drives. The K4000
  (Kepler) has had no supported NVIDIA driver since the 470 legacy branch, which does not build on kernel 7.0: it does
  nothing now.
- Power: 1070 is 150 W TDP but idles at ~8–10 W; K4000 is 80 W TDP with ~15–20 W idle [spec/typical]. Removing the K4000
  saves its idle draw on the UPS.
- Outputs: 1070 has 3× DP 1.4, HDMI 2.0, DVI-D; K4000 has 2× DP 1.2 + DVI-I.
- Future use: the 1070 (8 GB, Pascal, CUDA 6.1) is supported by the 580 branch (NVIDIA's last branch for Pascal, with long-term legacy fixes), so it can run small local
  models or embeddings if the driver/library mismatch noted in §9 is fixed. The K4000 (3 GB, Kepler) cannot run modern CUDA.
- Removing the K4000 also frees CPU2's x16 slot. No driver change is needed for this.

---

## 9. Non-SifterSearch services running now (for Chad to confirm what leaves)

- **System services:**
  - ollama (no models listed; NVIDIA driver/library mismatch, so the GPUs are not usable as configured)
  - minio (S3 server on `/tank/backups`; pm2 also has `siftersearch-s3`, so is this SifterSearch's?)
  - smbd/nmbd (Samba shares documents, media, backups, fast)
  - NFS (`/tank` exported read-only to the tailnet; rpcbind, mountd, idmapd, statd, nfsdcld, blkmap)
  - docker + containerd (0 containers running; `fast/docker` is 440 KB)
  - cups, cups-browsed and the snap cups
  - gdm + GNOME desktop + gnome-remote-desktop
  - avahi, ModemManager, colord, fwupd, kerneloops, switcheroo-control, power-profiles-daemon, accounts-daemon, udisks2,
    ubuntu-advantage, canonical-livepatch, unattended-upgrades
- **User services:**
  - **dropbox (keep: it syncs the library)**
  - syncthing
  - evolution (×3), tracker-miner-fs-3 (indexes files and writes to the root SSD), pipewire/wireplumber, gvfs, GNOME
    settings daemons
- **Snaps:** firefox, chromium, thunderbird, code, powershell, gedit, snap-store.
- **pm2, not SifterSearch, stopped:** site2rag, site2rag-updater, site2rag-lnker, site2rag-report.
- **Cron:**
  - `~/rclone-sync.sh` 02:00 (pulls R2 buckets into `/tank/backups`)
  - `/etc/cron.d/zfs-replicate` 02:00 (replicates daily auto-snapshots)
  - zfs-auto-snapshot (frequent/hourly/daily; hits `crutch`)
- **Meilisearch** (user service): SifterSearch's own, being retired.

---

## 10. Projected writes and lifetimes

| device | before (10-13…10-20 avg) | now (10-21; 10-min extrapolation) | **after plan [est]** | rated / remaining | **life at "after" rate** |
|---|---|---|---|---|---|
| 970 EVO Plus (`/fast`) | **6.2 TB/day** | 0.09–0.13 | **0.05–0.09** (SQLite only, `logbias=throughput`) | ~430 TB to 100 % used [est] | **> 10 years** (age limits it first) |
| new 4 TB NVMe, XFS (Qdrant): **TEAMGROUP MP44, TLC, DRAM-less/HMB** (§8.4) | — | — | **~0.03 steady**; a full `phrases` rebuild ≈ 0.25–0.3 TB per event; hot flush ≤ 0.025/day | **2,000 TBW** (TEAMGROUP spec) | **> 20 years**, even with a monthly full rebuild |
| new 4 TB NVMe, ZFS (`vectors`) | — | — | **~0.1 while indexing** (4K records), ~0 idle | (same drive) | (included above) |
| A400 960 (`/crutch`) | 0.3–0.5 while indexing | 0 | **< 0.03** (daily snapshot copy) | 250 TB left of 300 | **> 20 years** |
| A400 240 (`/`) | 0.03–0.11 | 0.056 | **~0.02** (no swap, no logs) | 61 TB left of 80 | **> 8 years** |

The "after" figures assume that steady-state indexing adds about 3 M phrase points per day at the measured 142 K
phrases/h. Each point is about 6 KiB as float16 plus payload and is written about 1.5× (bulk-built), giving about
0.03 TB/day to Qdrant and about 0.05–0.1 TB/day to `vectors.db`.

**Warning.** If the old pattern came back (Meilisearch-style 4 KiB fsync churn inside large ZFS records, or a Qdrant merge
loop), even the MP44's 2,000 TBW would last about 11 months at 6 TB/day. **The configuration matters more than the drive.**
`system-checks` should alarm on NVMe `Data Units Written` rising more than 0.5 TB/day (code change C5).

---

## 11. Rollout: smallest risk first

Each step lists its type (S = setting only, C = code change, H = hardware) and whether it needs Chad's approval (**A**).
Every tower change needs Chad's OK under the read-only rule of this investigation. **A** marks the ones that need a real
decision from him, not just a go-ahead.

| # | step | type | rollback | expected effect |
|---|---|---|---|---|
| R1 | Back up the three `vectors.db` stores to `/tank` (server-side job using SQLite online backup, nice 19). **DONE 10-22 01:32**: ops job `vectors-backup` (own lane, skips stores being written, sample-verifies big stores, adopts complete copies); add to the nightly backup | C (ops job) **A** | — | closes the 42 GB paid-data gap |
| R2 | `zfs set com.sun:auto-snapshot=false crutch`; destroy its frequent/hourly snapshots. **DONE 10-21** | S | set true | less fragmentation on the no-TRIM A400 |
| R3 | PATCH `phrases`: `optimizers_config.max_optimization_threads=0` (freeze until the move). **DONE 10-21** (red → green) | S | PATCH back to 1 | prevents a 190 GiB merge on the worn EVO |
| R4 | `zpool set autotrim=on fast`; one `zpool trim fast` overnight. **DONE** (trim 23:30–23:51) | S | autotrim=off | lower internal amplification on the EVO |
| R5 | `zfs set logbias=throughput fast/siftersearch-db`; re-measure for 24 h (tmp/wear/followup.md). **SET 10-21**, re-measure pending | S | logbias=latency | expected: 3.4× → ~2× on DB writes [est] |
| R6 | `flush_interval_sec` → 120 on the rebuildable collections. **DONE 10-21** | S | PATCH back | fewer small writebacks |
| R7 | Swap file off plus zram 8 GB, swappiness 10; logs to `/tank` with logrotate. **DONE 10-21** (logs = ZFS datasets tank/logs/*) | S | swapon | root SSD ~0.05 → ~0.02 TB/day |
| R8 | Stop Meilisearch writes completely, or stop the service once no reader remains (retirement step 6). **DONE 10-21**: code retired, service stopped + disabled, data kept on /tank | S/C **A** | start the service | `/tank` 1.7 TB/day → ~0 |
| R9 | Indexer: 2,000-point upserts, `wait=false`, batched upserted marks, `units.upserted_at`, reconcile command (C1, C2) | C | git revert | fewer segments and WAL frames; enables crash recovery |
| R10 | 4 TB NVMe: install, partition, XFS `/faster` + pool `faster` (§8.2) | H **A** | remove the drive | — |
| R11 | Move the vector stores `crutch` → `faster/vectors` (§8.3 step 1) and add them to db-ship | S (ops) **A** | symlinks back | indexer off the A400; faster builds |
| R12 | Build `phrases_f16` in bulk mode on `/faster`; battery; alias swap (§8.3 step 2) | C **A** | alias back | `phrases` 388 → ~230 GB; EVO freed of Qdrant |
| R13 | ARC cap 128 → 40 GiB (`zfs_arc_max`), min 32 GiB, after R12 (Qdrant no longer on ZFS) | S | echo the old value | frees RAM for the RAM disk |
| R14 | RAM disk + `qdrant-hot` + `qram-flush` timer (phase 1: 6 h) + search layer URLs (C3, C4). **Phase 0 (44 G, `phrases_hot`, snapshots on /crutch) live 10-21, §6.6** | C + S **A** | layers back to main; stop the unit | hot layers in RAM; build staging |
| R15 | Remove non-SifterSearch services (§9) | S **A** | reinstall or enable | RAM and root-SSD writes |
| R16 | UPS + NUT + `sifter-powerdown.target`; flush interval → 24 h (phase 2) | H + S **A** | disable upssched | power cuts lose nothing |
| R17 | `system-checks`: alarm on SSD TB/day above budget (C5) | C | revert | catches regressions within a day |
| R18 | Optional: DIMMs to 256 GB, RAM disk to 128 GB; 1536-dim Matryoshka `phrases` in RAM (battery first) | H + C **A** | — | `phrases` served from RAM |

---

## 12. Open questions for Chad

1. **UPS:** GoldenMate 1500VA/1000W LiFePO4 ordered (CyberPower CP1500PFCLCD if Linux cannot talk to it; NUT kit in
   `deploy/nut/`). GPUs: Chad removes one; **keep the GTX 1070, pull the Quadro K4000** (§8.7).
2. ~~The 4 TB NVMe~~ answered: TEAMGROUP MP44 4 TB, TLC, 2,000 TBW, DRAM-less (HMB); Sabrent adapter in Slot1 (§8.4–8.6).
3. **Services leaving tower (§9):** confirm the list. Is minio / `siftersearch-s3` part of SifterSearch?
4. **R1:** approve the `vectors.db` backup to `/tank` now? About 42 GB of paid vectors have no second copy.
5. **Meilisearch:** stop it now? It is the largest writer on `/tank`.
6. **Later:** 1536-dim Matryoshka vectors (a quality trade, needs a battery) and the 64 GB DIMM upgrade.

## 13. Not measured (verify when possible)

- Wall power. The table uses RAPL for the CPU and DRAM plus estimates for the rest.
- The SSDs' sustained sequential write speed (spec sheets used; measuring needs writes).
- Qdrant 1.19 shard-snapshot recovery into a different collection.
- The effect of `logbias=throughput` on the DB's amplification. R5 measures it.
- The exact source of the 12.7× on `/tank`. It is attributed to Meilisearch by elimination.
- Rebuild times other than the measured 10 M points/h bulk load.
- ~~The 4 TB drive's endurance~~ (2,000 TBW, §8.4). Which controller/NAND variant arrived: read `nvme id-ctrl` on day 0.
