# Talks hidden on purpose (reversible; nothing deleted)

Mechanism: a `talks` decision in `data/media-exclusions.json` (`decision: "exclude"`, by `id` or `slug`) → `media-exclude` sets state `excluded` (404 on every /media route, out of listings, speaker lists and counts), soft-deletes the transcript doc (out of search) and purges the edge. Audio, transcript, R2 objects and rows stay.

- `jones-01-thursday` "Early Days Teaching in Bucharest" (Chad 10-25: hidden for now). Restore: in `data/media-exclusions.json` change that entry's `"decision"` to `"restore"`, commit + push, then `SIFTER_API=https://api.siftersearch.com node scripts/ops/ops.mjs report media-restore --params '{"write":true}' --wait` (add `"write":false` first for the dry run).
