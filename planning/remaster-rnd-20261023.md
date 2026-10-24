# Remaster R&D — 2026-10-23 (Chad: "We need to solve remastering. This is audible audio. It should be possible to make it more audible.")

Status: **UniPASE is the lead candidate** (Chad: "UniPASE is great! clear and realistic without changing the voice").
A blind confirmation page (original vs UniPASE on the 5 defect clips + 10 muffled pilot talks) is the last check before a
production build. Nothing in production has changed.
Code: `scripts/media/remaster-rnd/` (each step is a script; the README-style header of each file says how to run it).
Data: aorus `/data/remaster-rnd` (clips, wet model outputs, venvs, weights) · boss `/mnt/data4tb/remaster-rnd` (candidates,
screening, pages). Tower: nothing (the first screening ran there and was moved off at Chad's request; scratch deleted).

## Listening pages (blind, loudness-matched −18 LUFS, AAC 192k, A/B at the same moment, picks saved to the page db)
| round | link | versions |
|---|---|---|
| Ioas r1 (gentle denoise) | https://claude.ai/artifact/LPG3XoqqoFumgUefe8MtnA | original · classic EQ+ride · DFN capped 6 dB · MossFormer2-SE 60 % · Sidon 50 % |
| Ioas r2 (anti-"tube") | https://claude.ai/artifact/VAjobGRobTuoWMdY9W8oXT | original · MF2SE 60 % · +de-resonance+WPE · +exciter · +MF2-SR high band · +Resemble high band (borderline) |
| Ioas r3 (mud + sibilants) | https://claude.ai/artifact/DyCXbZMrDj8nMUq2o5ALV9 | original · r2 pick · mud −4/−7 dB @320 Hz + HPF 100, presence lift moved to 0.8–1.8 kHz, WPE 50/80 %, ± split-band de-esser 2–3.6 kHz |

| Ioas r4 (de-essing) | https://claude.ai/artifact/XsW7WpWAPnAC14BJPi2FMn | r3 pick F + s-detecting de-esser −12/−16 dB, lift ends 1.4 kHz, MF2SE 45 % — Chad: "awful" |
| **Ioas remaster lab** (one page, republished) | https://claude.ai/artifact/1Kb1nDdGwNtAGuZ1p6iVTr | original · gentle F · ElevenLabs · Sidon · UniPASE · ElevenLabs+Sidon blends · →LavaSR · →UniPASE · VoiceFixer |

**Chad's picks (page db):**
- r1: **MF2SE 60 %**. "E has less background noise. But none sound remastered."
- r2: **MF2SE 60 % + de-resonance EQ + WPE 50 %**, preferred over both exciters and the model high bands. "still muddy and loud sibilants".

- r3: **F = t3-mud7-wpe-deess**. "Still a lot of ess". r4: "awful" — the gentle-EQ method was finished there.
- Lab: "the ElevenLabs voice isolate is the best I have heard" → "ElevenLabs and Sidon are the clearest. Sidon is more
  clear but less realistic" → **"UniPASE is great! clear and realistic without changing the voice."**

The lesson: a 3 kHz recording cannot sound restored without regenerating the voice; the gentle chains were the wrong
method, not wrong tuning. The right regenerator is one built NOT to invent words (UniPASE / PASE family: WavLM phonetic
features → vocoder), not a full-band generative model fed band-limited input (VoiceFixer/Resemble/SGMSE lost 29–67 words).

Chad on r1: "it still sounds like we're listening through a tube" → r2 attacks the boxy midrange, the room and the
missing highs, keeping the original below the band edge.

## Test set (40 s, most speech-dense window; `clips.py`)
| clip | defect | grade (meta.json) |
|---|---|---|
| ioas | muffled + hiss | bw 2.98 kHz, SNR 17.6 dB, NISQA 1.30, D |
| panahi (1952) | heavy tape hiss | SNR 15.4 dB, bw 9.25 kHz, ASR −0.47, E |
| muhajir (1963) | room / reverberant lecture | crowd/room, bw 7.29 kHz, ASR −0.49, D |
| sears (1987) | low-level quiet speech | LUFS −36.2, LRA 12.5 dB, D/C |
| banani | 50 Hz hum + old tape | hum 15.4 dB, bw 5.46 kHz, D |

## Method
- **Candidates** (`build_cands.py`, `cands.json`, `tube.py`). One classic baseline (HPF, hum notch, −3 dB at 300 Hz,
  +4 dB at 2.5 kHz, dynaudnorm slow ride, 2:1 compression). Neural WET outputs (`run_*.py`, aorus GPU, 10 s chunks
  with 1 s raised-cosine overlap-add). **Parallel wet/dry mixes**, so the dry path keeps every syllable. **Band-split
  blends**: the original below the band edge, model content only above it.
- **Screening** (`screen.py`, CPU only). faster-whisper large-v3-turbo with word timestamps, aligned to the original's
  words: words lost and added, and the change in matched-word confidence. Energy of each word and of its first 60 ms,
  measured against the original's timings (catches gated syllables). SQUIM non-intrusive STOI/PESQ. WeSpeaker voice
  similarity. Bandwidth and 99 % roll-off. Clipping.
- **Veto** (`rank.py`): a candidate fails if it
  - loses more than max(3, 6 % of words) + 2 words;
  - lowers matched-word confidence by more than 0.02;
  - scores voice similarity below 0.85;
  - clips;
  - gates any word by more than 6 dB.

## Findings so far
1. **Full-strength generative restoration loses words, measurably.** On Ioas:
   - SGMSE+ (EARS-WHAM, 48 kHz diffusion) lost 67 of 81 words;
   - Resemble enhancer lost 44;
   - VoiceFixer lost 27–31;
   - Sidon 100 % lost 9, with voice similarity 0.53;
   - Resemble denoise-only lost 9.

   This matches Chad's 10-23 "mangled, words clipped" verdict, so the screening reproduces his ear.
2. **Gentle mask-type models at partial mix pass everywhere.** These are DFN capped at 6 dB, DFN 12 dB at 50 %,
   MossFormer2-SE at 35–60 %, and Resemble denoise at 60 %. On Ioas SQUIM STOI rose 0.54 → 0.90, with 0–6 words lost and
   voice similarity 0.95–0.99. But they **don't fix the muffled "tube"**: bandwidth only rises 2.95 → ~4.3 kHz.
3. **Full-strength MossFormer2 changes the voice** (similarity 0.57–0.85). It stays at ≤ 60 % wet.
4. **The classic chain fails the veto on 3 of 5 clips.** Its level ride raises hiss and room noise between words:
   Panahi lost 25 words, Sears had 14 gated onsets, Muhajir's word confidence fell.
5. **The voice-similarity veto works against de-muffling.** Restoring highs to a muffled voice moves the speaker embedding
   by itself (0.97 → 0.73–0.85 for high-band blends). Chad's ear should set this threshold for BWE chains; 0.85 is
   too strict there.
6. **Generated high bands confuse ASR at the crossover.** At fc 2.5–2.9 kHz, Sidon, Resemble and VoiceFixer high bands
   cost 8–15 words at −4 dB. MossFormer2-SR at −4 dB passes (7 lost against a floor of 5). Next to try: a higher
   crossover, a lower level, or a band envelope-locked to the original's.
7. **Room clip (Muhajir).** Everything gentle passes. VoiceFixer at 100 % passes the word check there (1 lost, PESQ
   2.03 → 3.07, bandwidth 20 kHz) but its voice similarity is 0.89. SGMSE+ at 60 % passes.

8. **Round 3 (`tube3.py`).** All four chains pass: 4–5 words lost, voice 0.96, PESQ estimate up to 1.93 against the
   original's 1.19. The de-esser acts on about 20 % of 5 ms frames.
9. **AudioSR does not fit beside production on the 3070.** It loads about 7 GB, and its first load briefly OOM'd a
   production DFN job at 19:44 (the job retried itself and completed). It is off aorus for good: a boss-GPU candidate only.
   VoiceRestore (fully generative, 24 kHz) fails the word-confidence check at 100 %. Its high band at −4 dB keeps the
   words (5 lost) but scores voice 0.82.

## Compute and spend (all local; $0 API)
- **aorus RTX 3070.** Wet passes for 5 × 40 s clips:
  - MF2SE ~1 s/clip; VoiceFixer ~1.5 s; Sidon ~1–3 s; Resemble denoise ~2 s; Resemble enhancer ~25 s;
  - SGMSE+ ~6–10 min/clip (≈10–15× real time; too slow for the library as it stands).
  - Peak VRAM is ≤ 2.6 GB for any model. Jobs run one at a time, wait for VRAM/RAM, and pause at ≥ 83 °C (the card hit
    86–88 °C beside production).
- **Screening.** About 40 min CPU for 74 candidates: ~30 s each on tower and boss at nice 15 / ionice c3 / 4 threads,
  NISQA off on boss. Boss RAM guard: exits under 3 GB free, restarts at ≥ 7 GB.
- **Disk.** aorus root stays clean: the uv cache was cleared (−25 GB) and venvs and weights sit on /data (~16 GB venvs).

## Next, after Chad's picks
Encode the winning chain per defect class (grade → chain) with the veto and wet/dry/band-split mixing, run a 10-talk
pilot, and do a short blind check before any backfill (§13).


## Regeneration round (lab) — measurements on Ioas (81 words; word check = information only)
| version | runs on | lost/added words | voice sim | bandwidth | GPU min per audio hour |
|---|---|---|---|---|---|
| ElevenLabs Voice Isolator | API | 16 / 20 | 0.52 | 9.8 kHz | 60k credits (≈ $3.30 at plan rate) |
| Sidon | aorus / boss | 10 / 10 | 0.53 | 15 kHz | 3 (aorus) · 102–333 (boss, cold ROCm) |
| UniPASE | boss / aorus | see confirmation page | | 48 kHz out | **7.4–9.1 (aorus 3070) · 11–17 (boss 8060S, warm)** |
| StuPASE → LavaSR | boss | | | | 35 + 4 |
| VoiceFixer (full) | aorus | 29 / 25 | 0.76 | 13 kHz | 2.5 |
| VoiceFixer, true 3 kHz cutoff | boss | | | | 232 (cold) |
| Resemble Enhance λ 0.5/0.9 | aorus | 58–66 lost | 0.57 | 18–20 kHz | 42–65 |
| VoiceRestore | aorus | 5 / 4 | 0.88 | 5.6 kHz (barely regenerates) | 47 |

- Generative outputs carry real timing offsets (5–60 ms), measured reliably by 5 ms ENVELOPE correlation (r 0.6–0.96);
  waveform correlation (r ≈ 0.05) is meaningless for them, so earlier wet/dry mixes of generative models were partly
  misaligned. `rnd_common.env_align`.
- Boss ROCm: AMD TheRock torch 2.9.1 + ROCm 7.13 for gfx1151 in `/mnt/data4tb/remaster-rnd/venvs/rocm` works for
  UniPASE, StuPASE, LavaSR, Sidon, VoiceFixer (no CPU fallback). First runs pay kernel compiles; quote warm numbers.
- ElevenLabs at library scale: 1,000 credits per audio minute (measured: 667 for 40 s) → 1,450 h = 87M credits =
  14.5 months of the 6M plan ($330/month ≈ $0.055/1k credits ≈ $3.30 per audio hour, ≈ $4,800 total at plan rate;
  the overage rate is on the billing page, not in the API).
- Commercial: only ELEVENLABS has a key. Auphonic Studio Voice (beta, ~$1/h, 2 free h/month) needs Chad's signup.
  ai-coustics now sells real-time denoise only; Resemble's hosted API is discontinued; dolby.io is gone; Adobe has no API.

## Confirmation page — https://claude.ai/artifact/BFpv8wTF4vy68jKZrYGmBS
21 clips, original vs UniPASE blind: 5 defect clips, 10 muffled talks never used in tuning, 2 clean A/B controls
(Dunbar 2003, Razavi 2015), 4 multilingual (Furútan 1963 Persian+English, Fatheazam Persian, Prayer chant fa/ar, Dunbar
Spanish; word check in that language). Ioas: UniPASE lost 5 / added 6 words (ASR churn level), mean word confidence
0.928 → 0.961; speaker-embedding similarity reads 0.46 although Chad hears the voice unchanged — the embedding metric
does not survive bandwidth restoration and must not gate UniPASE.

Production wiring (media agent, 10-23) uses these venvs — do not delete/upgrade: aorus `/data/remaster-rnd/venvs/venv-rnd`
(torch 2.14 cu130), boss `/mnt/data4tb/remaster-rnd/venvs/rocm` (torch 2.9.1 ROCm 7.13); config `~/media-gpu/unipase.conf`
/ `~/media-asr/unipase.conf`; repo + weights copied to `/data/media-gpu/unipase` and `/mnt/data4tb/media-asr/unipase`.
Boss runs at 96–99 °C under production: R&D there is short, niced, and stops at 90 °C.

## UniPASE production plan (PLAN ONLY — build after the confirmation page passes Chad's ear)
0. **Which talks get UniPASE (gates, checked in order; any "no" → the transparent chain, originals always kept):**
   - **Language (Chad 10-23):** a talk with ANY substantial non-English speech is skipped at talk level — more than 30 s or
     3 % of its speech not English by the existing `langid` stage (per-segment language probes; `meta.languages`), which also
     catches consecutive translation (e.g. Muhajir 1963: 10 s of Persian in its first 40 s) and Arabic/Persian chanting.
     PENDING Chad's ear on the confirmation page's multilingual section (Persian+English translation, Persian, Arabic/Persian
     chant, Spanish) — he heard it "even works with multilanguage", so this gate may be relaxed per language later.
   - **Grade:** overall C–E → UniPASE; A/B keep the transparent chain (two clean A/B controls are on the confirmation page
     to hear whether UniPASE helps, hurts or does nothing there).
   - **Music / chant / singing segments:** keep the original for those windows. Detect with the transcript (Whisper emits
     no words or `♪`/[Music] markers over music), the langid `ar` probes for chanting, and the speech-share of the
     segment; a small speech/music classifier (e.g. the inaSpeechSegmenter model, CPU) if those miss cases. Chant-heavy
     talks are already skipped by the language gate.
1. **Chain.** Original → UniPASE (authors' long-form path: 8 s segments, 4 s hop, centre-cropped joins; 48 kHz out) →
   −18 LUFS → listening copy. Variant flag `shifts_time: true`.
2. **Word guard, per segment (never worse than the original).** Transcribe the UniPASE copy (same Whisper model, word
   timestamps) and align its words to the talk's FINAL transcript per paragraph window. A paragraph whose words differ beyond
   the ASR churn floor (max(1, 6 %) of its words + 1, or any changed name/number/scripture term) is replaced in the
   listening copy by the ORIGINAL (transparent chain) for that window, with 150 ms equal-power crossfades at word gaps.
   Every swap is logged per talk; > 15 % of the talk swapped → the talk goes to the human review queue (§13).
3. **Re-align (§15).** `realign` runs on the final listening copy (forced alignment of the final text per paragraph
   window) because UniPASE shifts timing 5–60 ms; then trim + update. No new transcription, no LLM.
4. **Encode.** Web Opus at **96 kb/s, application `audio`, 48 kHz** (the 32 kb/s `voip` Ogg caps bandwidth at ~4 kHz and
   would throw away what UniPASE restores); m4a AAC 128k for Safari fallback. FLAC master in `enhanced/unipase.flac`.
5. **Throughput (warm, measured):**
   | host | GPU min per audio hour | 1,450 h library | cost |
   |---|---|---|---|
   | aorus RTX 3070 (beside production ASR; 4.1 GB VRAM) | 7.4–9.1 | ≈ 180–220 GPU-h ≈ 8–9 days if dedicated | $0 |
   | boss Radeon 8060S (ROCm; leaves 50 GB for the LLM) | 11–17 | ≈ 270–410 GPU-h ≈ 11–17 days | $0 |
   | both, split by queue | | ≈ 5–6 days wall clock | $0 |
   | RunPod (option below) | ~3–4 (est.) | ≈ 75–100 GPU-h | ≈ $30–110 |
   Plus the word guard's ASR pass (~3–6 min per audio hour on boss CPU / aorus) and realign (~1–3 s per 10 min).
6. **RunPod option (Chad's key, in the searchlayerpdf.com project; not fetched, nothing spent).**
   - Image: the prebuilt `runpod/pytorch` (CUDA 12.x, torch 2.x) base + `pip install einops omegaconf soundfile` + the
     UniPASE repo (MIT, ~1 MB) + weights (2.1 GB, Apache) on a **network volume** (one upload, reused) or baked into a small
     derived image (~6 GB). No large software install; cold start = image pull + 2.1 GB weight load (~1–3 min).
   - GPU: RTX 4090 or L4/A5000 class (UniPASE peaks at 4.1 GB VRAM, so the cheapest 16–24 GB cards work). Estimated
     ~3–4 GPU-min per audio hour on a 4090 (≈ 2–2.5× the 3070).
   - Cost (community/secure pod at roughly $0.35–0.70/h; serverless flex roughly $1–1.2/h for 24 GB — verify current
     prices): ≈ 75–100 GPU-h → **≈ $30–70 on a pod, ≈ $80–120 serverless**, plus a network volume (~$0.07/GB/month × 5 GB).
   - Data handling: ~1,450 h of audio leaves our hosts (as Opus 96k ≈ 43 MB/h → ≈ 62 GB up, similar down). RunPod pods are
     single-tenant but it is a third party; keep only public-rights talks there, delete volumes after the run, never send
     private/pilgrim-note recordings without Chad's OK. Versus boss+aorus: $0 and nothing leaves, at the cost of ~1 week.
7. **QA gate (§13)** records per talk: segments swapped, ASR deltas, bandwidth/roll-off, loudness; weekly digest pairs.
8. **Rollout:** confirmation page → 10-talk pilot through the real pipeline (listening copy + realign + encode) with a
   short blind check → backfill by priority (§10), never touching a talk's original.
