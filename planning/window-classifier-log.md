# Window classifier — iteration log

Goal (Chad 10-08): fast, cheap, accurate per-paragraph speaker + quoted/cited classifier. Eval: `scripts/authorship/window-eval.sh <tag>` on tower.
- gold = planning/authorship-gold-20261008.json (70 hand-labelled ¶: Dawn-Breakers 400-439, Priceless Pearl 300-339)
- official = Chaste / Scholarship / Crisis & Victory vs bahai.org edition (348 judged ¶; reader baseline 336)

| tag | change | gold speaker | gold quotes | gold detect | official speaker | Jev calls / LLM calls | seconds |
|---|---|---|---|---|---|---|---|
| v1 | 5+10+5, 2 passes, min 0.7, clip 700 | 59/70 | 59/70 | 59/70 | 326/348 | 24 / 22 (gold) | 36 |
| reader | current read-book | 59/70 | — | — | 336/348 | | |
| v2 | speaker = narrator unless wholly someone's words; condense long ¶ around quotes | 70/70 | 58/70 | 60/70 | 316/348 | 24 / 20 | 36 |
| v3h | --hybrid (evidence speakers fixed) + compiler never speaker | 70/70 | 58/70 | 60/70 | 336/348 | 24 / 20 | 33 |
| v4h | gold fixed from full text; LLM budget; NFC scoring | 70/70 | 65/70 | 63/70 | 336/348 | 24 / 20 | 33 |
| v4h1 | one pass | 70/70 | 63/70 | 60/70 | 336/348 | 12 / 10 | 17 |
| v5m0 | one pass, LLM only for "another person" | 70/70 | 64/70 | 62/70 | (336) | 12 / 7 | 14 |
| v5s5 | step 5 | 70/70 | 60/70 | 59/70 | 336/348 | 24 / 18 | 28 |
| v7 ×3 | quotes ≠ own speaker; reported teachings count; editor label | 70/70 | 59-62/70 | — | 336/348 | 12 / 5-7 | 11-14 |
| v9 ×2 | hybrid also fixes headings (→ compiler) and attribution lines | 70/70 | 59-60/70 | 56-58/64 | 336/348 (2-3 LLM) | 12 / 7 | 13 |

Run-to-run noise (Jev): about ±3 on 50-70 ¶.

**Held-out** (New Era, ‘Abdu’l-Bahá in London; gold amended once after v7 — see file): v9 speaker 47-50/50 (reader 38), quotes 49/50.
**Blind** (God Passes By, Memorials, Lights of Guidance; labelled before any run): v8 speaker 42/45 → v9 44/45 (reader 36), quotes 38-41/45, detect 34-37/40.

**Current best = v9: `--hybrid --passes 1 --min 0`.** Speaker ≈98% on 165 gold ¶ (reader 81%), = reader on compilations; quotes ≈90%.
Cost ≈ 500 Jev tokens/¶ (≈$0.02 per 1,000 ¶ at the logged Jev rate), ≈0.3 s per 10-¶ window, LLM in ~5% of windows.
Remaining errors: quotes reached only by pronoun ("He, in that same Tablet…"), first line of a verse quotation, run-to-run noise.
