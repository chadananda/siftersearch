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
