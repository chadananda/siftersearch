# Window classifier — iteration log

Goal (Chad 10-08): fast, cheap, accurate per-paragraph speaker + quoted/cited classifier. Eval: `scripts/authorship/window-eval.sh <tag>` on tower.
- gold = planning/authorship-gold-20261008.json (70 hand-labelled ¶: Dawn-Breakers 400-439, Priceless Pearl 300-339)
- official = Chaste / Scholarship / Crisis & Victory vs bahai.org edition (348 judged ¶; reader baseline 336)

| tag | change | gold speaker | gold quotes | gold detect | official speaker | Jev calls / LLM calls | seconds |
|---|---|---|---|---|---|---|---|
| v1 | 5+10+5, 2 passes, min 0.7, clip 700 | 59/70 | 59/70 | 59/70 | 326/348 | 24 / 22 (gold) | 36 |
| reader | current read-book | 59/70 | — | — | 336/348 | | |
