# Night watch — 2026-08-18/19

Written 06:25 AZ. Everything below was verified against the live API, not inferred.

## Decisions waiting on you (4)

### 1. Relabel ~3,000 mislabelled books — RECOMMENDED FIRST
Persian, Arabic and Spanish books carry `language='en'`, so they route down the **English DeepSeek path** —
garbage output *and* a breach of the Anthropic-for-Persian-only rule.

- Population: **25,600** real books (≥10 paras, inventory stubs excluded) labelled `en`/NULL
- Two independent samples: **11.9%** (n=109) and **14.5%** (n=83) — overlapping intervals
- **Projected ~3,000 mislabelled (95% CI 1,764–5,638)**; every mismatch was fa/ar/es
- Cost: **zero model tokens** (local detector). It is a ~3k-row data mutation.

```bash
node scripts/relabel-languages.mjs --all            # dry run — prints what it would change
node scripts/relabel-languages.mjs --all --apply    # writes docs.language via the single writer
```
Live number any time: `GET /api/admin/ingest/language-audit?sample=150`. The health check now warns on it.

### 2. One `pm2 restart siftersearch-updater` — unblocks two other fixes
The updater applies every deploy but **never restarts itself**, so the cron-enforcement fix committed
yesterday is inert on disk. One deliberate restart activates it, and it then corrects the schedules itself.

```bash
pm2 restart siftersearch-updater
```
Fixes, on the next deploy: all four cron apps run **12× too often** (`*/5` live vs hourly declared —
converter `5`, book-ingest `35`, relabel `40`, digest `50`). The relabel stage alone re-evaluates 1,814 rows
~288×/day instead of 24 (~48 min of DB time daily for 4 min of work), and the deliberate 30-min
convert→ingest offset is not in effect at all.

If you would rather not wait for a deploy: `pm2 delete <name> && pm2 start ecosystem.config.cjs --only <name>`
per app (`startOrReload` will NOT update cron).

### 3. Publish-route authorization model
Publishing, thread↔dialog linkage, the fail-closed PII sanitizer and the UI's dialogue link **all exist and
work**. The only gap: publishing is admin-only (`POST /admin/conversations/save` + `X-Admin-Key`), so a
signed-in user cannot share their own thread. Needs your call on the authorization model before I add a
public write endpoint on a path handling personal conversation data.

### 4. First real run of the conceptual track (spend)
Code-complete and wired (5 modules, 9 store ports, tables since migration 90, CLI verbs) but **never run on a
real document** — `concept_lexicon` is empty. First run costs model calls, so it is a spend decision.
Prerequisite is met: the doctrinal spine is seeded, 6/7 done.

## What ran itself (no action needed)
- **Aqdas (21307)** is already re-enqueued with the correct resume point (`opts={"from":"hype"}`) and runs
  automatically when off-peak opens **16:30Z**. It hit its retry ceiling mid-hype; coverage is healthy
  (304/304 disambiguated, 304/304 extracted, reconcile decisions 0→17).
- **Doctrine phase 6/7 complete**: WOB, SAQ, Hidden Words, Promised Day, Advent, Íqán.

## Fixed and verified in production overnight
| Fix | Evidence |
|---|---|
| Chapter citations (the original complaint) | search returns `Some Answered Questions │ The Justice and Mercy of God` |
| Same bug in `/search/quick` | now returns heading + documentId + paragraphIndex |
| book-ingest never exited (1,758 restarts, ~200MB idling, killed mid-run) | restarts **flat at 1760 for 5 hours**, status `stopped` |
| Phantom `convert pending: 10` reported forever | `pending` gone, `done` 2004→2014 |
| Silent AI-assessment failure in the librarian | now `swallow()`-counted |
| 7 `catch { /* table may not exist */ }` hiding real errors | narrowed via `ignoreMissingTable` |

## Things I got wrong (corrected, for the record)
- Claimed the concept extractor did not exist → it did; I then **overwrote the real `lexicon.js`** before
  listing the directory. Restored; pre-commit tests caught it. Doc that misled me is now fixed.
- Claimed all 9 concept store ports were missing → **`grep` was silently returning empty** in this shell.
- Claimed "12,561 `_fa` docs mislabelled" → **fuzzy-match artifact** (Meili tokenised `_fa`→`fa`, matching
  *Factors*, *Fathers*). Discarded before it reached a decision.
- Said off-peak was "~1 hour" away, twice → pm2 `last_start` is **UTC**, not Arizona; it was six hours.
- Called 10 pending convert rows "a stall" → already ingested; stale bookkeeping.

## Standing proof-point: MET
All six released books make real model calls and none carries "did not reach verify":
12443 (423, $1.61) · 519 (389, $1.51) · 12373 (469, $1.11) · 11279 (301, $0.95) · 15965 (298, $0.82) ·
12344 (159, $0.41). The disambiguation stamp/note fix is confirmed working in production.

## Why the changelog has been flat 6 days
Not a broken ingest. **Conversion exhausted its supply**: 2,004 converted / 2,058 ingested / zero awaiting.
Of 3,766 rejected — **2,807 have no source file** (the landing-page-resolver population, ~3.3% recoverable
≈ 93 books) and **~950 are scanned images with no text layer** (needs OCR, which the converter cannot do).
More books requires OCR or source resolution, not a pipeline fix.

## Spend
DeepSeek **$16.82** (frozen under peak block since ~00:30Z), essentially all of it the authorised 7-book
doctrine seeding. Anthropic $21.72. I notified you when it crossed your $12 line.
