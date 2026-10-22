# Media library — status (morning of 10-22)

Plan: `planning/media-library-plan.md`. Pilot review (reads the archive only): `node scripts/media/review.mjs --quotes --corrections` on tower.

## What is built and live

* **Pipeline** (`api/lib/media/*`, ops jobs `media-scan` / `media-item` / `media-vocab` in their own service
  **siftersearch-media**): archive folder per item under `/tank/media/library/<tradition>/<collection>/<slug>/` (original
  hard-linked, never modified), light ffmpeg chain + DeepFilterNet copy, ASR probe on all three, WhisperX large-v3-turbo
  with word alignment, diarization (sherpa-onnx, English speaker embeddings), vocabulary-guarded name corrections,
  description/chapters, quotations → SourceHunt, attributed teachings → verified cross-references, transcript.md ingested
  (collection **Media**), quote/CR links in `content_source_links`, standalone `page.html`, Opus + AAC + waveform.
* **ASR runs on boss** (Zen 5): Whisper turbo at RTF 0.06 vs 0.36 on tower's Xeons, through a forced-command key
  (`scripts/media/boss-asr-gate.sh`, restricted to tower's address, audio in on stdin, JSON out). Diarization runs on
  tower at the same time. Tower search latency was unchanged while tower transcribed (1.6–2.3 s, same as before).
* **Drain-aware**: a deploy stops a running stage at once (child processes killed, also on boss) and the job resumes at
  that stage; verified on tower 23:01 (SIGHUP → yielded in 1 s → resumed on the new code).
* **API** `/api/media` (listing, facets, transcript search), `/api/media/:slug`, files with Range, signed ≤180 s clips.
* **Site** `/media` and `/media/<slug>` (Svelte): click a word to play, paragraph play buttons, FAB, follow-scroll with
  re-sync, playing-word highlight token, `?t=a-b` ranges, Media Session, quote links + cross-reference breakouts.
  Search hits on a transcript show **▶ Listen** (→ `/media/<slug>?p=<paragraph>`). Worker caches versioned media files
  in R2 bucket `siftersearch-media` (created).
* **Dewey**: `add_media` tool (a YouTube URL or a server path) and the drop folder `/tank/dewey-ingest/media`.
* **Rights**: YouTube → full (Chad 10-21), one permission record per channel (`media_channels`, switchable to clips or
  search); downloads off; local archive → clips until Chad decides.

## Pilot results

(see the sections below — filled from the review script)

## Search latency and the thread cap (coordinator watch, 10-21 23:49)

At 23:49 searches on tower took 5.8–6.0 s while a tower-side media process ran at ~1,100 % CPU (diarization at 12
threads; the ASR itself runs on boss). Measured with `tmp/search-latency.mjs` on tower (12 FRESH queries each — random
word pairs, so the answer cache never answers — POST `/api/search/multi`):

| tower media work | median | p90 | max |
|---|---|---|---|
| none | 1.8–2.2 s | 2.4–3.0 s | 2.5–3.9 s |
| diarization, 12 threads | 2.0 s | **3.8 s** | **5.3 s** |
| diarization, 8 threads | 1.6 s | 2.1 s | 2.1 s |
| diarization, 4 threads | 2.0 s | 2.6 s | 3.4 s |

**Cap chosen: 8 threads** for every tower-side media process (`MEDIA_THREADS`, default 8: DeepFilterNet/torch and
sherpa-onnx; ffmpeg filters are single-threaded), halved again while measured search latency is over 3 s (the governor in `api/lib/media/tools.js`). ASR,
alignment and the probes run on boss and do not touch tower's CPU or memory bandwidth.

## Problems / notes

* My first push touched `api/lib/model-roles.js`, which the indexer imports, so the indexer reloaded and a vectors-backup
  run was cut short (another agent fixed vectors-backup to finish its store through a drain). Media changes since then
  touch only media files.
* The source-folder speaker guess named one item "Misc Other"; fixed (the model's reading wins) and the two first pilot
  items were re-archived under clean slugs.
* A hard link shares the source file's inode: the first item's `chmod 0444` made the source file read-only. Restored
  (644) and the code no longer chmods a linked original.

## Decisions for Chad

1. **Rights default for the local talk archive** (now *clips*: ≤3-minute paragraph/range playback, no full stream).
2. **Persian**: no Persian-only recording exists in `/tank/media/Baha'i/talks` (all 449 files language-scanned; Persian
   appears only in interpreted Furútan talks). The Persian pilot item is a Furútan talk from YouTube.
3. **GPU**: not needed for ASR now (boss CPU is fast enough). Tower's driver mismatch (kernel module 580.173 vs library
   580.178) is the kind a reboot fixes; not touched.
