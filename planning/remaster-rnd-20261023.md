# Remaster R&D — 2026-10-23 (Chad: "We need to solve remastering. This is audible audio. It should be possible to make it more audible.")

Status: **round 3 is up and waiting for Chad's pick.** Nothing in production has changed, and no pipeline chain changes before his picks.
Code: `scripts/media/remaster-rnd/` (each step is a script; the README-style header of each file says how to run it).
Data: aorus `/data/remaster-rnd` (clips, wet model outputs, venvs, weights) · boss `/mnt/data4tb/remaster-rnd` (candidates,
screening, pages). Tower: nothing (the first screening ran there and was moved off at Chad's request; scratch deleted).

## Listening pages (blind, loudness-matched −18 LUFS, AAC 192k, A/B at the same moment, picks saved to the page db)
| round | link | versions |
|---|---|---|
| Ioas r1 (gentle denoise) | https://claude.ai/artifact/LPG3XoqqoFumgUefe8MtnA | original · classic EQ+ride · DFN capped 6 dB · MossFormer2-SE 60 % · Sidon 50 % |
| Ioas r2 (anti-"tube") | https://claude.ai/artifact/VAjobGRobTuoWMdY9W8oXT | original · MF2SE 60 % · +de-resonance+WPE · +exciter · +MF2-SR high band · +Resemble high band (borderline) |
| Ioas r3 (mud + sibilants) | https://claude.ai/artifact/DyCXbZMrDj8nMUq2o5ALV9 | original · r2 pick · mud −4/−7 dB @320 Hz + HPF 100, presence lift moved to 0.8–1.8 kHz, WPE 50/80 %, ± split-band de-esser 2–3.6 kHz |

**Chad's picks (page db):**
- r1: **MF2SE 60 %**. "E has less background noise. But none sound remastered."
- r2: **MF2SE 60 % + de-resonance EQ + WPE 50 %**, preferred over both exciters and the model high bands. "still muddy and loud sibilants".

So far the ear favours corrective EQ plus gentle denoise and dereverb over any synthesised highs.

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
