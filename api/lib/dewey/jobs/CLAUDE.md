# api/lib/dewey/jobs — Dewey's job registry (Phase 1 of planning/dewey-v2-design-20261028.md)

Registry over the existing executors; tower decides, workers (scripts/dewey/worker) fetch/unzip/scan. Valve: `DEWEY_V2=0` or flag `paused` (POST /api/admin/ops/dewey-jobs/pause).

- `schema.js` migration 185 SQL · `states.js` state machine · `policy.js` caps (20 jobs/4 GB/200 pages/40 research/$2 per day, admin x5, global $50), trust, valve
- `registry.js` startJob (idempotent, capped) · advance · fail/retry · rollup of children · addCost (80 % note, ceiling pause) · `track.js` dual-write from old verbs
- `tick.js` dispatcher (reports worker, 15 s): follows items, file children (dedupe first), media hand-off, reaps dead leases · `live.js` published = doc + search points
- `worker.js` tower side of the worker contract (claim/event/blob/complete/fail) · `tools.js` fetch_url + archive start · `decide.js` job-page yes/no
- `status.js` plain-words status · `notify.js` chat notices always, email only when asked (outbox the Worker sends via ZeptoMail)
