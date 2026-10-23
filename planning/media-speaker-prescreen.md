# Speaker-count prescreen — validated 10-23, NOT shipped (flag stays off)

Idea (coordinator 10-23): skip full diarization for monologues. `media_tool.py spkscreen` embeds one 2 s window per 10 s
of Whisper speech with the diarization's own WeSpeaker model and scores each window against a robust main-voice centroid;
`api/lib/media/spkscreen.js` calls single / multi / unsure (title veto, ≥ 6 windows, no "question / introduction" transcript
lines, ≤ k far windows). Wired into the diarize stage behind `MEDIA_SPK_PRESCREEN` (default OFF).

## Validation (508 diarized published talks, tower /tmp/claude-spk)

Ground truth from the published labels is noisy toward "multi": full diarization + the labeller invent second speakers
in monologues ("Co-presenter" saying "I've been on the Universal House of Justice" is Nakhjavání; "Chair" reading Phelps's
own Wigner passage). So two references:
- **A** — raw labels: a non-main labelled speaker with > 30 s (243 of 508 talks).
- **B** — voice-checked: that labelled speaker's 60 s excerpt is a different voice by a second model (titanet, cos < 0.8)
  (161 of 508). Gap A − B ≈ 82 talks (16 %) where the "other speaker" is the main speaker's own voice.

| | single | false (B) | false (A) |
|---|---|---|---|
| 2-fold held-out (thresholds tuned on the other half) | 54 | 7 (13.0 %, 95 % upper 24 %) | 10 (18.5 %) |
| chosen thresholds (tau 0.75, k 3, frac 0.05), in-sample | 94 (19 % of talks) | 2 (2.1 %, upper 7.4 %) | 7 (7.4 %) |

- Acoustics alone fail: audience questions recorded on the room microphone sit at cosine 0.8–0.9 to the lecturer in 2 s
  windows (every acoustic-only false single was a class with questions). Transcript cue lines ("Yes?", "Pardon?", "a
  question", "Mr. President", introductions) close most of it, but not to < 2 % held-out.
- Gain is small anyway: the singles are short talks — **7 % of diarized audio** → ≤ ~7 % more diarization capacity.

**Verdict: does not meet the < 2 % bar; not worth the risk for ~7 %.** Keep the flag off. Better levers for diarization
throughput: more GPU diarization capacity, or fixing the over-split labels (a quality issue the B reference exposes).
