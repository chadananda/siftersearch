# Search Quality Loop State
last_tick: 2026-05-18T03:45:00Z
tick_number: 29
status: IN_PROGRESS

## Goal
Iterate on search quality: test cross-religion queries, analyze authority/relevance,
fix issues (link generation, authority weighting, filter logic), redeploy, repeat.

## Current Status
Full 110-test suite running at /tmp/full-v2.80.24.log (PID 96650, concurrency=5)
Expected completion: ~20 min from 03:45 UTC. API is on v2.80.24.

## Fixes Applied This Session (all deployed to v2.80.24)
1. Removed siftersearch.com/document fallback URLs — null is correct for missing source_url
2. Broad tradition overview crafter instruction — Buddhism must cover Four Noble Truths, Eightfold Path, schools
3. Author catalog queries must also retrieve representative passages (find_doc + search with author filter)
4. Browsing catalog queries must also retrieve sample passages with religion filter
5. Jain religion filter — don't substitute other traditions when filter returns nothing
6. Buddhism fix: [81] "Tell me everything about Buddhism" now PASSES ✓
7. Bhagavad Gita reading: [74] PASSES ✓
8. Targeted fixes for [84] Japanese query, [99] covenant, [77] Udo Schaefer, [67] Jain, [66] largest collection

## Recent Test Results (targeted runs)
- Author+browsing fix (6 tests): [30] ✓, [32] ✓, [66] ✓ newly fixed; [29] ✗, [67] ✗, [77] ✗
- Remaining failures (7 tests): [67] ✓, [77] ✓, [84] ✓, [99] ✓ newly fixed; [29] ✗, [80] ✗
- Total estimated improvement: from 100/110 → ~107-108/110

## Remaining Failures (expected)
- [29] "Do you have anything by Rumi?" — 3.29 ✗: Rumi texts in library are Persian-only;
  can't quote them in English without translation
- [80] "What about the thing with the stuff?" — 3.95 ✗: inherently vague, rubric penalizes
  no-citation responses; clarification response tanks scores

## Data Issues (to fix on tower-nas)
- Run: node scripts/backfill-missing-slugs.js on tower-nas to fix 93 docs without slugs
  (these get null citation_url until slugs are backfilled)

## Next Priority
1. Wait for full 110 test suite to complete
2. Check /Users/chad/.../tests/chat/runs/report-full-v2.80.24.md
3. If 107+ passing (97%+) → goal achieved, stop loop
4. If still failures → investigate diagnoses and fix

project_dir: /Users/chad/Dropbox/Public/JS/Projects/siftersearch.com
