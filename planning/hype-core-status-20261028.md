# HyPE core books, batch mode: status 10-28

Queued in tower's grounding queue (front, positions -10..-8; note "hype-core 10-28"). The queue supervisor drives it; no laptop or session involved.
- Core roster (14 books via core-roster.js): 20810 20783 20809 20911 21307 20914 20780 20894 21310 20893 20890 20882 20887 21308.
- Finding: all 14 were already >=95% disambiguated; only TDP 20914 (95%, bar 98%) needs a disambiguate row (queued first). The rest pass the gate.
- Each book has a hype-only row. The hype stage uses the persisted batch runner (HYPE_MODE=batch, hype-v15-seeker). Most core paragraphs are already v15, so only gaps and failures are sent. A hype row that starts before TDP's disambiguation fails the gate and the queue retries it with backoff.
- Doc 26 hype row (noDisambig) retries the ~38 failed proof-run paragraphs.
- Batch state: tower `~/sifter/siftersearch/data/run/hype-batch/state.json` (resumes after restart/deploy; failed items retry, 3 attempts then stamped empty).
- Spend: expected well under $5 (only gaps are sent; Haiku batch ~$0.2-0.35 per 1k paragraphs). Library-wide run NOT started.

Check:
- `node scripts/pipeline/hype-batch.mjs status` (on tower)
- `GET /api/admin/grounding/queue` (rows with note hype-core)
- `node scripts/ops/ops.mjs report spend --hours 2 --wait` (caller hype-batch)

Expected finish: minutes to a few hours, depending on queue concurrency (5 slots).
