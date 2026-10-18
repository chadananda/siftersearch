# Dewey folder-sweep state (overnight 10-17 → 10-18)
status: IN_PROGRESS
task: Chad asleep. Test Dewey on folder 1 until every file works; then folder 2. Later: spider hard drives for missing books.
folder_1: ~/Dropbox/Ocean2.0 Supplemental/documents to sort and ingest/Shoghi Effendi pilgrim notes (270 files) — run 3 in progress, 0 errors so far
folder_2: ~/Dropbox/Ocean2.0 Supplemental/Ocean Supplemental - Source/Duane scans (738 files, 11 GB, 148 > 21 MB)
  → run with: --chat --server-root "/Users/chad/Dropbox=/tank/dropbox"  (read in place on tower; no upload)
tool: scripts/library/dewey-folder-sweep.mjs (key: tmp/dewey-test-key = key 9, Chad's; REVOKE after)
LOCAL COMMITS NOT YET PUSHED (push as ONE batch after folder 1 finishes): OCR 30% bar, accurate comparison wording,
  attach.path (read in place) + conversion off-thread.
PUSH POLICY: batch fixes, few deploys (each reload restarts the API).
Incidents tonight (all fixed, see docs/architecture/blocking-queries.md): 573 s per-row FTS freeze (Dewey's title search);
  restart storm = my watchdog sweep killing the live API (reverted) + too many deploys; stop_exit_codes tried & reverted.
folder_1 DONE 00:50 (270: 127 held, 4 partly, 29 possible, 89 offered, 1 undetermined, 17 audio). batch pushed 10a5954.
folder_2 STARTED ~01:00 → planning/dewey-chat-duane-scans.jsonl (log planning/.dewey-chat-2.log)
folder_2 RESUMED 01:30 after the child-process fix (3394301); at 192/736: 0 errors, api restarts steady at 3.
to look at later: Wider Horizon-type PDFs whose text is doubled (OCR layer + original) halve length_ratio; translations (Winckler held in Persian) are not matched.
next: monitor folder 2; fix issues (batch pushes); summary to Chad.
