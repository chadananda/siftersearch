# Media library — plan (10-21)

Chad 10-21: a proper archive of talks (audio/video), each with an enhanced copy, an aligned transcript corrected against our
own name/term spellings, quotations of the Writings linked to their English source, a standalone page, a slug URL with range
selection, a search document, and a cheap Dewey "add media" path. Status of the work: `planning/media-library-status.md`.

## 1. Architecture

```
/tank/media/<raw folders>      (inbox: never modified)          YouTube URL (yt-dlp, audio only, polite)
            │                                                            │
            └──── media-scan job: one item per file/URL ─────────────────┘
                                   │  (queues media-item jobs, one at a time, lane "media")
                                   ▼
 media-item job (resumable stage machine; each stage's output is a file in the item folder, a stage with its file present is skipped)
   archive → enhance → web → transcribe → correct → meta → quotes → thumb → render → ingest → catalog
     │         │       │        │           │        │       │        │        │        │         └ media_items row (repo)
     │         │       │        │           │        │       │        │        │        └ transcript.md → library → ingester; quote links → content_source_links
     │         │       │        │           │        │       │        │        └ page.html (no chrome), meta.json
     │         │       │        │           │        │       │        └ Wikimedia Commons (licence kept) → initials tile fallback
     │         │       │        │           │        │       └ candidate spans (role media-quotes) → SourceHunt → acceptSource gates
     │         │       │        │           │        └ speaker/date/place/event/topics/summary/chapters (role media-meta)
     │         │       │        │           └ names/terms only, against the controlled vocabulary; every change a diff (role media-correct)
     │         │       │        └ WhisperX (faster-whisper int8, VAD, per-file initial_prompt, no previous-text conditioning,
     │         │       │          wav2vec2 word alignment) + diarization (sherpa-onnx: pyannote-seg-3.0 + 3D-Speaker, no HF token)
     │         │       └ Opus 32 kbps mono (.ogg) + AAC 64 kbps mono (.m4a download) + waveform.json (BBC peaks format)
     │         └ light ffmpeg chain always; DeepFilterNet copy; metrics + ASR probe pick the transcription input
     └ folder, original/ (hard link, read-only), sha256, ffprobe
```

Heavy work is Python in `~/sifter/venvs/media` (uv, user space) driven by `scripts/media/*.py`, spawned from the ops job at
`nice 19` with a thread cap (`MEDIA_THREADS`, default 16 of 80). The job measures search latency on 127.0.0.1:7839 between
stages and halves its threads when search slows (> 1.5× baseline). Jobs run in the reports service (`siftersearch-reports`)
in their own lane `media` (one at a time); a drain yields between stages with a resume point.

## 2. Archive layout (per item)

`/tank/media/library/<Tradition>/<Collection>/<slug>/` (MEDIA_ARCHIVE_ROOT=/tank/media/library; raw folders stay the inbox)

| file | what |
|---|---|
| `original/<file>` | the master, hard-linked (never modified); YouTube: the downloaded audio |
| `enhanced/light.flac` | highpass 70 / lowpass 9.5 k, hum notch 50/60 + harmonics when detected, adeclick, afftdn light, EBU R128 loudnorm (−18 LUFS) |
| `enhanced/dfn.flac` | DeepFilterNet3 on light.flac (kept only when it measurably helps) |
| `web/<slug>.ogg`, `web/<slug>.m4a` | Opus 32 kbps mono (player), AAC 64 kbps mono (download / Safari fallback) |
| `waveform.json` | peaks, BBC audiowaveform v2 format, 8-bit, ~20 px/s |
| `transcript.json` | segments + words (ms) + speakers, `asr` (model, prompt, input choice, confidence), `corrections` (diff), `quotes`, `paragraphs` |
| `transcript.md` | clean Markdown for search: one paragraph per block, `{#para_N t0=… t1=… spk=…}` attrs |
| `page.html` | standalone, self-contained (no site chrome): player + transcript + quotes |
| `meta.json` | metadata, rights, source (file or YouTube id/channel/upload), thumbnail source + licence, stages + timings + costs |
| `thumb.jpg` / `thumb.svg` | speaker picture (licensed) or generated initials/waveform tile |

Slug: `<speaker>-<title>-<year>` (ASCII-folded, ≤ 80 chars), suffix `-2…` on collision; never changes once published.

## 3. Data model — migration 163 `media_items` (catalogue; the folder is the source of truth, the row is rebuildable)

`id, slug UNIQUE, title, speaker, tradition, collection, language, year, date, duration_s, has_video, source_kind (file|youtube),
source_ref (path or URL), youtube_id, channel, rights (full|clips|search), stage, state (queued|running|done|failed|held),
doc_id, thumb, quotes_n, words_n, asr_conf, meta JSON, created_at, updated_at`. Repo: `api/lib/repos/media-repo.js` (list with
filters, get by slug, upsert, stage update). Permissions per YouTube channel: `media_channels (channel_id PK, name, playback,
granted_by, note, updated_at)` — Chad edits via the admin API.

Transcript paragraphs become `content` rows of the ingested doc (collection **Media**, religion of the item); `t0/t1/spk` live
in `block_attrs`. Quote links: `content_source_links` (quote_id = transcript paragraph, method `media-sourcehunt`).

## 4. Jobs (ops registry, lane `media`)

| job | params | does |
|---|---|---|
| `media-scan` | `{ root?, paths?, urls?, batch=1, round }` | finds new files/URLs, holdings check by sha256/YouTube id, creates items, queues the next `media-item`, re-queues itself behind it (gradual, like dewey-ingest-folder) |
| `media-item` | `{ slug, from?, only? }` | the stage machine above; resumable; costs + timings into meta.json |
| `media-vocab` | `{}` | controlled vocabulary: curated core terms + graph entity names (≥ N mentions) → `data/media-vocab.json` |
| `media-requote` | `{ slugs?, gate? }` | re-run quote linking with another gate (measurement) |

Dewey "add media": drop a file in `/tank/dewey-ingest/media/` or POST `/api/dewey/media { url }` (queues `media-scan` with the
URL). Same holdings rule: a file already archived (sha256) or a YouTube id already held is not added twice.

## 5. URLs and serving

* `/media` — listing (filters: speaker, tradition, collection, year, language, duration, has-video) + transcript search.
* `/media/<slug>` — player; `?t=754` start, `?t=754-812` clip (also `#t=754,812`); sentence highlight; click to seek;
  Media Session API; "copy link to this range". YouTube items carry "Source: <channel> on YouTube" at the same timestamp.
* API (search service): `GET /api/media` (list/filter, `q` = transcript search), `GET /api/media/:slug` (meta + paragraphs),
  `GET /api/media/:slug/file/:name` (web rendition, waveform, thumb, page.html — Range supported, immutable, versioned),
  `GET /api/media/:slug/clip?t=a-b&sig=` (clips-level items: ≤ 180 s cut on demand with `ffmpeg -c copy`, HMAC-signed, 1 h).
* Worker: `/api/media/*/file/*` → R2 bucket `siftersearch-media` (key `<slug>/<name>@<version>`): hit → serve from R2 with
  Range (206); miss → fetch the whole file from the tunnel, `put` to R2, serve. Clips: edge cache only (URL carries the token).
* Search hits from a Media doc link to `/media/<slug>?t=<t0>` (paragraph start) and show the YouTube source link when present.

## 6. Rights

`meta.rights.playback`: `full` (stream + download) · `clips` (≤ 180 s ranges, no full file, no download) · `search` (text only).
Defaults (Chad to confirm): local talk archive → `clips`, except Chad Jones's own talks → `full`; YouTube without channel
permission → `clips` with a prominent "watch the full talk on YouTube" link; channels with permission (`media_channels`) → `full`.
YouTube download: one at a time, 20–60 s apart, no cookies/login, stop the run on any bot check (never bypass).

## 7. Quotations (firm requirement)

1. Candidates: role `media-quotes` (Haiku-class) marks spans that are recitations or introduced quotations ("Bahá'u'lláh
   says…") — span = word index range, never rewritten — plus an archaic-register heuristic (thee/thou/hath/verily/"O Son of").
2. Each candidate → `sourceHunt()` (phrase + BM25 layers) → `acceptSource()` (writer, own work, not a compilation/mirror) with
   the overlap gate: printed 0.6 verbatim / 0.3 translation; a looser **spoken** gate is measured on the pilot (precision sample
   of 20 read by hand) before it is used.
3. Persian/Arabic recitation → the authorized English translation of that passage when held (link graph), else the original.
4. Stored as span (words + ms) + source paragraph id + `linkFor()` URL in transcript.json; in transcript.md/page.html the
   speaker's words stay and carry the link + citation; `content_source_links` rows on the ingested paragraphs.

## 8. Costs (estimates; measured in the pilot)

* LLM (Haiku 5.5 roles `media-correct`, `media-meta`, `media-quotes`): ~40–60k tokens in, ~10k out per hour of audio
  ≈ **$0.01–0.03 / hour**. SourceHunt is local (no paid model).
* CPU: WhisperX turbo int8 on 16 threads ≈ 0.15–0.3× real time (to be measured); DeepFilterNet ≈ 0.05×; diarization ≈ 0.05×.
* Storage per hour: original + light FLAC (~100 MB) + dfn FLAC (~100 MB) + Opus 14 MB + AAC 28 MB. 11 GB of talks ≈ 450 h →
  ~ 110 GB on /tank (FLAC copies can be pruned to the chosen one). R2: web renditions only, ~19 GB → ~$0.30/month.
* Spend allowance: data/approved-spend.json "media pipeline pilot" ≤ $20/day until 2026-11-05.

## 9. Pilot

Six talks from /tank/media/Baha'i/talks + 1–2 Hooper Dunbar YouTube talks (from planning/media-targets/youtube-talks.json):
clean lecture (Grossmann, World Order 2, 1999) · old tape (Catharine Nourse c1961) · pilgrim recollection (Ted Cardell 1988) ·
interpreted talk (Furutan, if language ID confirms) · Persian talk · Q&A (Nakhjavani, Talk to the Youth Q&A 1997).
Measure per item: enhancement metrics (LUFS, WADA-SNR, hum, clipping) for original / light / DFN; ASR probe confidence on
the same 3 × 60 s excerpts for each; chosen input; real-time factor per stage; correction count + 20 read by hand; quote
count + precision sample; cost. Pass → process the rest of the talks with the same jobs, paced.

## 10. Quality grade (Chad 10-22: grading in the normal pipeline, as detailed as possible, organised by solution)

Stage `grade` (after archive, before enhancement; drain-aware) runs `media_tool.py grade` on the ORIGINAL and stores
`meta.quality`: the raw measurements (with tool versions: DNSMOS pDNSMOS, NISQA v2 via torchmetrics 1.9), a report per
dimension, the overall grade, primary/secondary issues, the fix chain with its cost, and the repair priority. After
transcription (`catalog`) intelligibility and per-speaker loudness join and the item is re-graded. Code:
`api/lib/media/grade.js` (thresholds below are its `THRESHOLDS`, calibrated on the pilot: the 1932 Martha Root tape grades
A/B on bandwidth and noise; the 24 kbps Grossmann class grades E on bandwidth with a 50 Hz hum).

| dimension | measured | A / B / C / D cut points | fix |
|---|---|---|---|
| bandwidth (muffled) | effective bandwidth of speech frames (kHz), NISQA coloration | ≥7 / 5.5 / 4 / 3 kHz; coloration ≥3.5 / 3.0 / 2.5 / 2.0 | bandwidth restoration (Resemble Enhance / AudioSR) |
| noise | frame SNR (dB), DNSMOS BAK, mains-hum line prominence (type: hum / broadband / crowd-room) | SNR ≥32 / 27 / 22 / 17; BAK ≥3.8 / 3.4 / 3.0 / 2.5; hum ≥10 dB → C, ≥20 → D | notch · DeepFilterNet · Demucs |
| reverb | Brouhaha C50 | not measured yet (not installed) | dereverb |
| clipping | % of samples at full scale | <0.01 / 0.05 / 0.2 / 1 % | declip |
| dropouts | sudden drops to silence per hour, NISQA discontinuity | ≤0.5 / 2 / 5 / 15 per h; disc. ≥3.5 / 3.0 / 2.5 / 2.0 | manual/spectral repair |
| level | integrated LUFS, loudness range, per-speaker imbalance | LUFS in −26…−14 / −30…−12 / −34…−10 / −40…−8; imbalance <3 / 6 / 9 / 12 dB | leveling / per-speaker gain |
| speed / pitch | median speaking F0 | 70–260 Hz A; 60–300 C; else D (a check by ear decides) | speed correction |
| intelligibility | Whisper probe log-prob, share of words with alignment score < 0.4, low-confidence minutes and spans | log-prob ≥ −0.2 / −0.3 / −0.45 / −0.65; low share <2 / 5 / 12 / 25 % | — |
| perceived | NISQA MOS, DNSMOS OVRL | MOS ≥3.6 / 3.0 / 2.4 / 1.8; OVRL ≥3.3 / 3.0 / 2.6 / 2.2 | — |

Overall = 35 % intelligibility + 35 % perceived + 30 % the worst fixable dimension. Issues = fixable dimensions at C or
worse; the chain is in processing order: declip → hum notch → denoise → vocal isolation → dereverb → spectral repair →
bandwidth restoration → speed → leveling. Priority = (5 − grade score) × importance, grade score A=5 … E=1; importance =
speaker tier (Hands of the Cause / UHJ 3, curated scholars 2, others 1; `data/media-speaker-tiers.json`) × uniqueness
(0.5 when another copy exists) + plays/hits later. Surfaces: `GET /api/media/admin/repairs` (grouped by chain),
`/api/media/admin/quality/<slug>`, the listing's `grade` / `issue` filters and `sort=priority`.

## 11. Concept cross-linking (Chad 10-22, PLAN ONLY beyond phase 1)

Goal: each talk links to related talks (media↔media) and to the source texts it discusses (media→texts), by
CONCEPT and not only by shared words. Most of this waits for indexing and concept extraction (project order 10-16:
findability → disambiguation + HyPE → concepts); phase 1 uses only what exists today.

**Order:** after the quality grade surfaces and the remastering A/B demo, which come first.

**Phase 1: cheap, built now from existing data**
- *Related talks* on each item page: the ingested transcript paragraphs are already in the vector index
  (collection `Media`). For a talk, take a handful of its paragraph vectors (e.g. one per chapter, or the summary
  line's), search within `collection = Media` excluding the talk itself, and score talks by summed similarity of
  their best-matching paragraphs. Keep the top 5, each with the matching moment (`?t=`) so the link lands on the
  passage. Computed at the catalog stage, stored in meta.json `related` (no per-request search), refreshed
  by a `media-related` job when new talks arrive.
- *Related passages*: the talk's own quote and CR links (`content_source_links`, methods `media-sourcehunt` /
  `media-cr`), listed together as "Texts discussed in this talk", ordered by first appearance.
- Endpoint: `GET /api/media/:slug` gains `related: [{slug, title, speaker, t0, score}]`. The item page gets a
  "Related talks" and "Texts discussed" panel. Tests: the scorer is pure (fixture vectors).

**Phase 2: after the concept index covers the corpus** (depends on the concept-extraction pipeline:
the kernel idea catalogue + canonical questions, `api/lib/pipeline/` and the monthly re-link pass. Do not start
until that pipeline has run over the library)
- Tag transcript paragraphs with the catalogue's ideas, using the same linker that tags text paragraphs, so talks
  enter the concept layer like any document.
- Concept pages then list both the canonical passages and the talks (with moments) that discuss each idea.
- Talks link to each other through shared concepts (weighted by idea rarity), replacing or re-ranking the
  phase-1 vector neighbours.

**Phase 3: per-talk concept map and entity links**
- A "concept map" panel per talk: the ideas it covers in order, each linked to its concept page and the moment.
- Entity links: people and places mentioned (disambiguated mentions, same pipeline as texts) → biography pages
  (`/biography/<id>`) and place pages.

**Dependency summary:** phase 1 needs only the Media vectors and the quote/CR links (both live). Phases 2–3 need the
concept-extraction pipeline and disambiguated entity mentions to cover transcripts. They are scheduled after
concepts reach the corpus, not before.
