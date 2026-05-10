# HyPE Bootstrap State

last_tick: 2026-04-30T13:18:00Z (post-resume)
tick_number: 3 (FINAL)
status: COMPLETE
current_task: Sonnet 4.6 batch enrichment of tier 1-7 (Bahá'í primary doctrinal) ~67K paragraphs
project_dir: /Users/chad/Dropbox/Public/JS/Projects/siftersearch.com

## Snapshot at tick 0 (T+0)

- siftersearch-enrichment-api running v2.17.2 (pm2 id=16, max_memory_restart=2G)
- siftersearch-enrichment running v2.17.1 (pm2 id=9, tier 8-9 via local Qwen3)
- 4 batches in_progress on Anthropic (IDs 6,7,8,9, 2500 reqs each = 10K paras in flight)
- Pending queue: 50K total, ~40K unassigned (worker submitting 1 batch / 30s)
- 0 paragraphs have hyp_thesis yet (no batches have completed)
- 234 paragraphs have hyp_questions only (from local Qwen3 working tier 8-9 — fine, expected)

## Snapshot at tick 1 (T+27 min)

- 16 batches succeeded, 39,953 paragraphs enriched (47 failed, 99.88% success)
- 3 batches in_progress, 1 just-submitted (#25)
- Pending: 28,071 (20,571 unassigned), tier range 4..7 (tier 1-3 done)
- Cost: $137 / $260 budget (pace suggests final ~$190-220)
- Quality EXCELLENT — sharp doctrinal thesis, Sufi tawakkul / Christian kenosis cross-tradition refs, distinctive-phrase quotes accurate
- No OOM restarts, no stuck pending batches, no quality regression

## Snapshot at tick 2 (T+~80 min) — PAUSED

- **Anthropic credit balance exhausted.** Real error message hidden by SDK as "400 terminated" — actual: "Your credit balance is too low to access the Anthropic API."
- 25 batches succeeded → **62,408 paragraphs enriched** (~93% of tier 1-7)
- 14 batches failed (all due to credit balance, post-exhaustion submissions)
- 5,628 paragraphs paused in pending queue
- Cost spent: **$224.09** (input 86M tokens + output 12.7M tokens, batch pricing)
- Quality on the 62,408 enriched: confirmed excellent across 6+ random samples
- Worker stopped (`pm2 stop siftersearch-enrichment-api`) so it isn't spin-failing
- Local Qwen3 (`siftersearch-enrichment`) still running — handling tier 8-9

## How to resume in the morning

1. **Top up Anthropic credits** at https://console.anthropic.com/settings/billing
   — needs ~$30 to safely complete the remaining 5,628 tier 1-7 paragraphs
   (running cost so far is ~$3.59 per 1000 paragraphs)
2. Restart worker: `ssh chad@tower-nas 'pm2 start siftersearch-enrichment-api'`
3. Worker will resume from pending queue, no manual rollback needed
4. Should complete in ~10-15 min once credits added

## Snapshot at FINAL tick (post-resume, 2026-04-30 ~13:18)

- ✅ **68,018 paragraphs with real hyp_thesis** (Sonnet 4.6 generated)
- ⚠️  18 paragraphs marked with placeholder (non-doctrinal artifacts: image
  markdown links, CSS/JS code, section dividers, empty signal lines)
  → these were content-parser noise that should never have been in `content`
  in the first place; harmless to leave with placeholder thesis
- 0 paragraphs pending
- **Total cost: $239.73** (under $260 budget)
- Worker (`siftersearch-enrichment-api`) restarted — idles until new tier 1-7
  documents are ingested, at which point they auto-route to Sonnet

## Morning report — what landed overnight

- ✅ Tier 1-7 (Bahá'í primary doctrinal): 62,408 paragraphs done with thesis + 5 questions
  - Includes: all of Shoghi Effendi, true compilations, 'Abdu'l-Bahá, Bahá'u'lláh,
    The Báb, Esslemont's *New Era*, Nabíl's *Dawn-Breakers*
- ⏸️ Remaining 5,628 await credit top-up
- ✅ Tier 8-9 (other religions + everything else): processing autonomously via local Qwen3,
  no API cost
- ✅ siftersearch-worker syncing new HyPE rows to Meili sidecar (search will improve as
  rows land)
- ✅ Public docs page at /docs/indexing-layers documenting the layered approach
- ✅ Migration 52 schema + tier-aware enrichment pipeline shipped
- ✅ Permanent ingestion-time routing in place — new Shoghi Effendi / 'Abdu'l-Bahá /
  Bahá'u'lláh docs auto-route to Sonnet on next enrichment tick

## What to verify each tick

1. Run `ssh chad@tower-nas 'cd ~/sifter/siftersearch && node scripts/verify-hype-progress.mjs'`
2. Check for stuck pending batches (status=pending, no external_batch_id, older than 2 min)
3. Check enrichment-api restart count (`pm2 show siftersearch-enrichment-api | grep restart`)
4. Once hyp_thesis paragraphs exist, eyeball quality samples in the script output

## Stuck-batch rollback recipe (if needed)

```bash
ssh chad@tower-nas 'sqlite3 ~/sifter/siftersearch/data/sifter.db "
  UPDATE enrichment_pending SET batch_id = NULL
    WHERE batch_id IN (SELECT id FROM enrichment_batches
                        WHERE status=\"pending\" AND external_batch_id IS NULL);
  DELETE FROM enrichment_batches
    WHERE status=\"pending\" AND external_batch_id IS NULL;"'
```

## Critical failure modes

- **OOM restart loop:** if `pm2 show siftersearch-enrichment-api | grep restart` shows restarts climbing fast — bump max_memory_restart in ecosystem.config.cjs, redeploy.
- **All batches failing on Anthropic side:** check `notes` field of failed enrichment_batches rows for error message.
- **Quality regression:** if hyp_thesis values look wrong (stock thematic boilerplate again), STOP — there's a prompt issue.

## Schedule

- T+0: bootstrap (this tick)
- T+25 min: first checkpoint — all batches submitted, first results
- T+1h: second checkpoint — bulk progressing, sample quality
- T+2-3h: most batches complete
- T+4-6h: tier 1-7 done, Meili sidecar repopulating via siftersearch-worker
- T+7h: final verification + morning summary

## Cost budget

- Sonnet 4.6 batch: $1.50/M in, $7.50/M out
- Estimated total: ~$260 for 67K paragraphs
- Burn rate alarm: if cost-so-far exceeds $300, something's wrong

## DON'T

- Don't restart siftersearch-enrichment-api without checking what's pending — restart loses log context but pending state is in DB so safe.
- Don't drop hyp_thesis again — we'd lose work. Only re-run drop-existing-hype.mjs if the user explicitly asks.
- Don't poll Anthropic API faster than once per minute — POLL_INTERVAL_MS is set, don't spam.

## Notes

- Document subagent for Jafar chat (api/lib/document-subagent.js) is unrelated, leave it alone.
- HyPE merge weight is back to 1.5 (was zeroed during diagnosis); search results may improve as new data lands.
