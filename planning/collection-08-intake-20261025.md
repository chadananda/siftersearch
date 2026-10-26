# Collection-08 intake — 2026-10-25

The copy destination `/tank/media/collection-08` was outside the automatic Dewey media drop folder. Its scan was deliberately deferred during maintenance and had never been requested afterward.

Requested `media-scan` through the internal ops API, run **22396**, roots `["/tank/media/collection-08"]`, batch 1. It started at 2026-10-26T04:03:50Z. The job checks source paths and SHA-256 duplicates before registering recordings. Companion documents remain in the source folder.

Verified via `/api/media/progress/live` that the pipeline picked up the new recordings: 10 active items, including Dorothy Baker, Sears Victories, Rabbani Day of Victory, and Giachery Shoghi Effendi’s Works. The waiting count had risen to 114 while the scan was still running; this is an interim queue count, not the collection total.

The scan runs independently of this session. Check `/api/admin/ops/reports/runs/22396` for its final added/held/skipped counts. Paid cloud rental hold remains in place.

Final scan result: **1,021 recordings added**, zero SHA duplicates held, no error. Companion documents were not audio queue items. Requested a `media-rank` pass with `register:false` to apply existing speaker/history priorities without registering extra YouTube targets.
