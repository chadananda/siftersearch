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
| clef ×1 | v9 with --backend clef | 70/70 | 60/70 | 54/64 | 336/348 | 12 / 3 | 29 |
| clef-flash ×1 | v9 with --backend clef-flash | 67/70 | 55/70 | 52/64 | 336/348 | 12 / 1 | 11 |
| **v10 ×2** | **+ per-book LLM brief (prompt tuner): speakers, how to recognise them, ≤5 book rules** | **70/70** | **65-66/70** | 60-62/64 | 336/348 | 12 / 9-10 | 22-27 |

v10 held-out: speaker 50/50 ×2, quotes 48-49/50. v10 BLIND: speaker 44-45/45, quotes 43-44/45, detect 39-40/40.
**All 165 gold ¶: speaker 164-165 (≈99.7%; reader 133 = 81%), quotes 157-159 (≈96%).** Compilations unchanged (336/348 = reader; official edition itself errs on some).
Clef ≈ Jev on speaker, a little worse on quotes, slower; Clef-flash clearly worse → Jev stays primary; every call logged for Laya.
Cost v10: ≈840 Jev tokens/¶ (brief rules + richer criteria), 1 LLM call per book for the brief + LLM in ~5-10% of windows.
At the logged Jev rate (~$0.043/M tokens): ≈$0.04 per 1,000 ¶ → OceanLibrary (475k ¶) ≈ $17; whole corpus (~4.6M ¶) ≈ $165 before Laya.
Speed: ≈0.4 s per 10-¶ window, sequential within a book (anchors), parallel across books.

## Change precision (what would be WRITTEN) — spot-checks of 36-46 sampled changes over 6 whole books
| version | change | change precision (judged) | gold speaker (tune/held/blind) |
|---|---|---|---|
| v13 | (baseline) | ~67% (12/36 wrong: quotes introduced in narration credited to the quoted person) | 70/50/45 |
| v14 | narration guard (speech verbs / name outside quotes), captions & titles no speaker | ~78% | 68/–/– |
| v15 | guard: no-verb introductions, short tags, third-person narration, 3-letter names; source_link protected | ~87% (prayers in Memorials) | 70/50/45 |
| v16b | unmarked blocks need an introduction (prev ¶ names AND introduces, attributing heading, continuation) | ~95% (+ trailer-prev protected after) | 70/49/45 |
Tokens on whole narrative books ≈1,250/¶ (compilations ≈500/¶). God Passes By: 0 changes (all earlier ones were wrong).
