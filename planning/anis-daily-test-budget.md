# Anís daily test budget — $5/day, spent surgically (Chad 11-07)

"Please spend your testing budget gradually and surgically to get as much improvement out of each day as possible."

## Measured costs (11-07)
- One eval item (full Anís turn, billed to improve-anis-test): $0.04–0.12, mean ≈ $0.086 (3 items, $0.26).
- Full 78-item set ≈ $6.70 → NEVER in one day. `anis-eval.mjs --max-usd` (default $1) stops a run at its limit.
- Opus 5.5 judge ≈ $0.018/reply, Opus deep analysis ≈ $0.041 (11-05/06 ledger). Off by default.
- `siftersearch-improve` (Opus on every trace) is pm2-STOPPED. Do not restart without Chad's figure.

## Order of every fix (cheapest evidence first)
1. **Free:** forensics on real traffic (`ops.mjs anis-trace`, `search-trace --slow/--zero`, `search-replay --class`), code scorer, unit tests.
2. **Fix** in code/data, unit-tested.
3. **Paid confirm:** only the items of the fixed class, tune split first (~3 items ≈ $0.25); held split only if tune passes.
4. Opus only when free traces cannot say WHY — a handful per day, never on every reply.

## Daily allotment ($5)
| use | $ |
|---|---|
| before/after on the class being fixed (2–3 fixes × ~6 items) | ~2.50 |
| rotating held baseline (~13 items/day → full held set every ~3 days) | ~1.00 |
| Opus diagnosis when traces are not enough | ≤0.50 |
| reserve (never planned) | 1.00 |

## Ledger (one line per paid run: date · what · $ · result)
- 11-07 · 3-item cost probe (stage-over-budget) · $0.26 · 1/3 pass; both fails = max_ms (28.6 s, 25.6 s); the slow turns were the costly ones
