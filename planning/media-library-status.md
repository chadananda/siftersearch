# Media library — status (morning of 10-22; update at the top, afternoon of 10-22)

Plan: `planning/media-library-plan.md`. Pilot review (reads the archive only): `node scripts/media/review.mjs --quotes --corrections` on tower.

## Update — 10-22 afternoon

* **Remastering listening test** (Chad picks by ear; production enhancement unchanged): **https://claude.ai/artifact/RFWUiPQwqrkitK1VvWcTj4** (private to Chad's account until shared)
  Four worst high-priority talks by grade (Sears at Anchorage, Rúḥíyyih Khánum at the National Convention, Collis
  Featherstone, Sears on Covenant-breaking): original / smart EQ / Resemble Enhance / VoiceFixer, level-matched, with
  scores and a blind mode. NISQA, original → Resemble: 1.89 → 4.71, 2.02 → 3.92, 1.86 → 3.92, 2.73 → 4.73 (VoiceFixer
  close behind; smart EQ ±0.3). Bandwidth 4–7 kHz → 13–18 kHz. 1932 Martha Root trial: NISQA 2.77 → 4.58 (Resemble) / 4.14 (VoiceFixer), bandwidth 8.3 → 19.5 / 13.1 kHz.
* **Faithfulness incident ("Nabips Narrative (Vol II)")**: the ASR heard *Nabeel's narrative* correctly; the
  **name-correction pass** swapped in a junk graph title held in the vocabulary. Fixed three ways: graph names enter the
  vocabulary without parentheticals/volumes/digits; the guard refuses any correction that adds to what was heard; and every
  edited layer is aligned with the ASR's words after the name pass and after the copy-edit, so added content is reverted
  (counted per item in `meta.faithfulness`, `insertions_reverted` in the quality report). Audit of all 33 items
  (`scripts/media/audit-insertions.mjs`): **3 insertions, all by the name pass** ("(Vol II)", "Robart" → "John Robarts" ×2),
  **0 by the copy-edit**.
* **Copy-edit pass, rebuilt with context** (Chad: "you had the right context to see the obvious error"): ~12-minute chunks
  plus neighbouring paragraphs, framed with speaker/title/date, using the model's own knowledge of Bahá'í names, works and
  Shoghi Effendi's transliteration. Model comparison on the pilot (5.3 h): **Sonnet tier chosen**: 209 substantive fixes
  vs 161 (Haiku); precision on a 25-edit read 24/25 vs 25/25; seeded checklist of 38 real errors 28 applied + 8 flagged vs
  31 + 2; **$0.23 vs $0.024 per audio hour**. Rolled out: all published items re-run from the name pass (run 1894).
  Whisper's prompt now leads with Forerunner, Will and Testament, World Order, Covenant, Bayán, Nabíl’s Narrative.
* **Topic subheaders**: a statement or a question at each shift of subject (~one per 3–5 min), Contents panel + `#slug`
  deep links, markdown headings in transcript.md. ~$0.003 per talk.
* **Citations are links**: "— ‘Abdu’l-Bahá, Tablets of the Divine Plan" is itself the link; no "read in context".
* **Quality grade** in the pipeline + `/admin/media` (repair list grouped by fix chain, per-dimension report) + a small
  public badge. Back-fill queued (run 1884).
* **Tower thread budget**: the first A/B batch (six runs, ~42 cores) took on-tower search to 7.9–9.1 s; stopped at once,
  capped in code (≤ 4 threads per run, ≤ 2 runs, nice 19); search back to 2.9 s median / 3.6 s p90. Heavy model work is
  moving to boss's GPU (ROCm PyTorch for gfx1151 being installed).
* **Name and work links** (stage `links`): people → `/biography/<id>` via the biography set + identity lookup; works →
  the canonical copy (OceanLibrary first) via the document finder and section index; ≥ 0.8 confidence, first mention per
  subheader section; the spoken words are the anchor. `media_links` (migration 166).
* **Audience + moments** (stage `assess`, Sonnet tier): audience 1 open … 5 internal per talk and per section, with intro
  ranges; 3–8 verbatim moments per talk, verified out of context, stable short keys (`/api/media/moments/:key`,
  `/moments`, `/intro-clips`, `?audience=`). Calibration on 15 talks: 1×1, 3×4, 4×10 (rubric then tightened so convention,
  fundraising and Covenant-breaking addresses rate 5); 71 moments kept / 40 rejected. `media_moments` (migration 167).
* **Back-fill**: run 1894 fanned out 33 re-runs from the name pass; they carry every new stage (faithfulness, Sonnet
  copy-edit, subheaders, links, audience, moments). The media service runs one job at a time, behind ~40 earlier runs.
* **Boss for model work**: ROCm PyTorch 2.10 (AMD TheRock, gfx1151) installed in `~/media-gpu/venv`, GPU visible; but
  measured per 45 s excerpt — Resemble: tower CPU×8 198 s · boss GPU 295 s · **boss CPU×16 53 s**; VoiceFixer: 48 · 157 ·
  **10 s**. The nightly ROCm stack is slower than boss's own CPU today (MIOpen untuned, GPU reports a low-power state), so
  remastering belongs on boss's CPU now; vLLM was not touched (GPU memory 1 GB in use). ASR already runs on boss.
* **Text fixes (Chad's screenshots)**: "ìWhy … book?î" was Whisper's own output (CP1252 punctuation read as MacRoman) —
  repaired where ASR words enter (199 words in 14 items before; Persian names keep their í); 348 inline markdown links in 28
  items had reached the indexed text and snippets — transcript.md is now plain text, links live in transcript.json /
  content_source_links / media_links; pronoun house style (He/Him only for God, the Manifestations, ‘Abdu’l-Bahá); a model
  call that times out is retried. The 16:16 text was a transcript paragraph on /media/<slug> (item 30, ¶26).
* **Audiogram shorts**: five templates (On Air, Archive Tape, Scripture Insert, Portrait Cinema, Minimal), captions from our
  alignment + .srt/.vtt, link back baked in (watermark, end card, QR), ready-to-paste post text; rendered on boss's CPU in
  4–15 s per 30 s clip; POST /api/media/shorts (public for moments), cached per range × format × template. Samples (Sears,
  Covenant Breaking, 3:54–4:24): `https://siftersearch.com/api/media/sears-covenant-breaking-part-3/file/shorts/<key>.mp4`
  with keys (render v3, compressed: 33 s incl. end card) 1f9e093e8bd3 Portrait Cinema 3.7 MB · c6ef34866fc8 On Air 3.0 MB ·
  5b812db8bd74 Archive Tape 4.6 MB (was 203 MB) · 41867c799994 Scripture Insert 2.7 MB · 07a11bfc6922 Minimal 2.1 MB — i.e.
  3.9–8.3 MB per minute; served from R2 at the edge, first byte ~0.15–0.4 s (was ~4 s through the tunnel). `media-shorts-moments` pre-renders Hands/UHJ moments once they exist.
  YouTube upload would need OAuth on Chad's channel (YouTube Data API v3 videos.insert + captions.insert, a Google Cloud
  project, the youtube.upload scope, a quota of ~6 uploads/day by default) — not built.
* **Diarization on boss** (10-22 watch: pyannote on tower took search to 6.6–8.6 s): through the gate beside the ASR job;
  tower only as a 4-thread fallback that waits while search p90 > 4 s. Search afterwards: median 1.85 s, p90 3.1 s.
* **No stretched pictures; extended portrait masters**: the old Portrait Cinema zoom stretched a square crop into 9:16 —
  every image is now scaled uniformly and cropped. Each of the 89 speaker portraits has ONE 9:16 master (1152×2048) whose
  margins were filled by gemini-3.1-flash-image (role image-outpaint; original pixels pasted back untouched): ~$0.042 each,
  $3.74 total, recorded on media_speakers (ext_*: AI-extended, model, prompt). API: `thumb.extended { url, width, height,
  ai_extended, model }` on items; the listing index carries it too.
* **Shorts default to Portrait Cinema** (Chad's pick), with Scripture Insert when the range quotes the Writings; light
  styling (warm grade, soft vignette, fine static grain, thin call-sign rule). Sample: Sears, Covenant Breaking 3:54–4:24 —
  https://siftersearch.com/api/media/sears-covenant-breaking-part-3/file/shorts/ff6e5ab0312f.mp4 (3.96 MB / 33 s ≈ 7.2 MB
  per minute; rendered on boss in 18.6 s).
* **The import's targets** (registered as catalogue rows, each with its status; /api/media/progress):
  YouTube target list 1,480 entries = 1,450 distinct videos (30 listed twice across sections) → 66 Shorts and 243 videos
  *about* a speaker (not by them) excluded → 1,141 → 186 repeat uploads of the same talk (138 duplicate groups, one taken
  each) → 955 → the queue had also skipped 76 clips under ~4 min (registered now, ranked within their own section) → 881
  queued + 76 = **957 YouTube targets** (curated 137 + 4 clips, Hooper Dunbar 169, other Hands/UHJ 575 + 72 clips).
  Local: 449 files in /tank/media/Baha'i/talks → 31 byte-identical copies (the Acuto folders repeat the Dunbar course) →
  **408 local recordings** (47 by Hands/UHJ, 361 others). Total ≈ **1,365 targets**; "1,880" counted every duplicate.
* **Throughput** (Chad 10-22: "about a month"): downloads have their own lane (~22 YouTube talks/h, paced); four items are
  processed at once (boss measured: 4 ASR jobs × 6 threads = 14.4 audio-min per minute vs 5.3 for one job × 24); talks are
  published as soon as the core is done; re-runs go behind new items. Measured: before 2.4 talks / 0.9 audio h per hour;
  after (first hour) 11.8 talks / 2.9 audio h per hour (≈ 3.2×).
* **Next**: related talks (phase 1), GPU tuning on boss (ask before touching vLLM), a review list for flagged copy-edits.

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

## Pilot results (as of 02:40)

| item | min | enhancement → ASR input · listening | ASR (boss) | quotes linked / candidates | CRs / candidates | corrections: marks / model | $ |
|---|---|---|---|---|---|---|---|
| Grossmann, World Order 2 (1999) — clean lecture, German accent | 46 | original (light −0.333 vs −0.246: the light chain HURT) · DFN | RTF 0.156, 3 voices | 4 / 6 | 9 / 23 | 30 / 38 | 0.036 |
| Cardell, Experiences with the Guardian (1988) — pilgrim recollection | 47 | original (= light) · light (DFN worse) | RTF 0.162, 3 voices | 1 / 11 | 4 / 15 | 35 / 10 | 0.031 |
| Nakhjavání, Talk to the Youth Q&A (1997) — Q&A | 92 | original (DFN +0.027, under the margin) · DFN | RTF 0.149, 4 voices | 26 / 28 | 9 / 20 | 103 / 26 | 0.046 |
| "Includes Martha Root" (1932 + narration) — old tape | 3 | original · DFN | RTF 0.169 | 0 | 0 | 0 / 0 | 0.002 |
| Furútan, Talk to the Youth (1992) — accented English (11 of 12 windows English, one Persian) | 71 | original · DFN | RTF 0.146, 2 voices | 6 / 12 | 3 / 5 | 141 marks+model | 0.025 |
| Chad Jones 01 (English + Romanian interpreter; rights *full*) | 48 | original · DFN | first pass single-language; re-run queued in interpreted mode (12-window detection) | | | | 0.026 |
| Furútan, Persian talk (YouTube) · Hooper Dunbar ×2 (YouTube) | | **held: YouTube bot check** (see problems) | | | | | |

**Enhancement**: measured, not assumed. The ASR probe (same three minutes, Whisper turbo) preferred the ORIGINAL in all
five: the light chain lowered confidence on the low-bitrate 16 kHz MP3s (Grossmann −0.25 → −0.33) and DeepFilterNet never
beat the original by the 0.03 margin. DeepFilterNet raised the blind SNR by 24–40 dB and became the listening copy in 4 of 5
(not for Cardell, where it cost recognition). So: transcription from the original, listening from the enhanced copy.

**Quotations** (read by hand: 37 linked quotations across four talks): **34 / 37 point to the right passage** (92 %);
the doubtful ones are a Summons paragraph at overlap 0.50 and two in Furútan's talk (a common phrase, "I want to be
sacrificed for you" → Tablets of the Divine Plan at 0.40; and a line linked to a neighbouring paragraph). Three of the right ones link a secondary copy (Bahá’í World
Faith, an Ocean of Lights PDF note, a scraped Sacred Writings book) rather than the canonical book. The spoken gate (0.45 /
0.25) added two correct links (Gleanings "Now that ye have refused the Most Great Peace…" at 0.30, Íqán at 0.43).
Nakhjavání's talk had 28 candidates, 26 linked.

**Cross-references** (attributed teachings → a canonical passage that states them, strict yes/no by the Haiku role, read
by hand: 22): **19 good, 3 weak** (two loose matches in Cardell, one from a pilgrim's notes). After the first item the
search was restricted to canonical works (book authority ≥ 7) — a visitor's account had been used for ‘Abdu’l-Bahá.

**Name/term corrections**: a deterministic pass restores marks on exact vocabulary matches (Bahá'u'lláh → Bahá’u’lláh,
100 % right, 30–100 per talk); the model pass fixes mishearings against the vocabulary (Sogefendik / Sergei Fendi / Shogu
Effendi → Shoghi Effendi, universal health justice → Universal House of Justice, Haziratul Ghots → Ḥaẓíratu’l-Quds,
Nasruddin Shah → Náṣiri’d-Dín Sháh). Read: 74 model edits, **65 right**; the wrong ones were 4 that swallowed a spoken word
("Shogu Effendi told" → "Shoghi Effendi"), 3 "Baola" → "Bahá" (should be Bahá’u’lláh) and 2 doubtful. Fixed (edits are trimmed to the
name itself — a swallowed or copied neighbouring word is taken off, never lost; clipped names are offered their full form)
and the talks re-run: a random sample of 20 model edits on the re-run Nakhjavání talk is **20 / 20 right** (refused: 2,
was 6); on the re-run Grossmann talk 50 of 57 formerly refused edits became right fixes.

**Cost**: Haiku-class calls ≈ **$0.03–0.05 per hour of audio** (corrections, description, quotations, verification).
SourceHunt, ASR and enhancement are local. **Speed**: ≈ 25 minutes of wall time per hour of audio, one item at a time
(enhancement on tower ~8 min/h incl. three ASR probes, web renditions ~3 min/h, ASR + alignment on boss ~9 min/h —
alignment is two thirds of it — quotes ~4 min/h). 450 local hours ≈ 8 days; the 824 YouTube hours ≈ 14 days.

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

## Links (live)

* **https://siftersearch.com/media** — the listing (deployed 02:06, site 2.187.727, after the preview was verified: clips,
  full playback through the Worker's R2 cache with Range 206, word click, highlight, FAB, follow-scroll, ranges, mobile)
* A player with quotations and cross-references: https://siftersearch.com/media/nakhjavani-talk-to-the-youth-q-and-a-1997
* A range: https://siftersearch.com/media/cardell-experiences-with-the-guardian-1988?t=754-812
* Full playback (Chad's own talk): https://siftersearch.com/media/jones-01-thursday
* Standalone page: https://siftersearch.com/api/media/cardell-experiences-with-the-guardian-1988/file/page.html?v=1
* API: https://siftersearch.com/api/media (listing, `?q=` searches all transcripts), `/api/media/<slug>`
* Pipeline state: `GET /api/media/admin/status` (internal key) · on tower: `node scripts/media/review.mjs --quotes`

## The full run (queued 02:15–02:45, running unattended)

* `media-scan` of `/tank/media/Baha'i/talks` ran at 02:55: **402 recordings queued, 31 byte-identical duplicates** (the
  Acuto folders repeat the Dunbar course) recorded and skipped; one item at a time, ≈ 8 days. The YouTube queue (881 talks)
  is behind it. YouTube items wait while YouTube is cooling down; local files go on.
* `media-vocab` rebuilds the vocabulary from the entity graph (the first build found no names — fixed).
* A failing recording is recorded on its item (`GET /api/media/admin/status`), never mailed per file.
* Robustness: long stages run detached (boss job / tower process) and survive deploys; tower-side work is capped at 8
  threads; a held YouTube item is retried once per 6-hour cool-down.

## YouTube is blocked for now

The first YouTube downloads hit "Sign in to confirm you're not a bot" (tower's address was already rate-limited by the
target-list discovery). As instructed, nothing was bypassed (no cookies, no login): the items are **held**, and no
YouTube work starts for a 6-hour cool-down, then one polite retry. Local talks continue meanwhile. The Persian pilot item
and both Hooper Dunbar pilot items are among the held ones. The ordered YouTube queue (881 talks, 824 hours: curated
sheet → single-speaker channels with Dunbar first → other Hands/UHJ talks; Shorts and "about" videos skipped, duplicate
groups taken once) is in `planning/media-targets/youtube-queue.json`.

## Decisions for Chad

1. **Rights default for the local talk archive** (now *clips*: ≤3-minute paragraph/range playback, no full stream).
2. **Persian**: no Persian-only recording exists in `/tank/media/Baha'i/talks` (all 449 files language-scanned; Persian
   appears only in interpreted Furútan talks). The Persian pilot item is a Furútan talk from YouTube.
3. **GPU**: not needed for ASR now (boss CPU is fast enough). Tower's driver mismatch (kernel module 580.173 vs library
   580.178) is the kind a reboot fixes; not touched.
4. **YouTube downloads**: wait for the rate limit to lift (the pipeline retries politely every 6 hours), or allow a
   different route (another network, or the channel owners' own files — Sharaf could share the Dunbar archive directly).
5. **Boss access**: tower now reaches boss through a restricted key (forced command `~/media-asr/asr-gate.sh`, from tower's
   addresses only) for ASR. Remove the line in boss's `~/.ssh/authorized_keys` to revoke.
