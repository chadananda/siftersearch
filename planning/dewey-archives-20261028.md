# Dewey archives: sift a whole drive on tower (handoff 2026-10-28)

Status: DESIGN + FINDINGS ONLY. No code is committed. The migration 186 and schema draft were reverted so nothing is half-applied.

## Goal
Copy each drive to /tank/archives/<id>/ (raw, read-only after), catalog it, classify against the library, then sift with Dewey in admin pages until every file is decided. Chad's selection in the sift tool is the approval (books and media).

## Findings (verified in code)
- Migrations: bump `CURRENT_VERSION` in api/lib/migrations/runner.js (now 185), add `186: async () => {...}` in v72-v90.js, update the "currently N" line in api/lib/migrations/CLAUDE.md.
- Long work = an ops job registered in api/lib/ops/reports.js (`REPORTS['name'] = fn`) and a lane in `LANES` (add `archive: ['archive-copy','archive-catalog','archive-match']`; hours of hashing must not block the intake lane). Jobs re-enqueue themselves in batches (see dewey-ingest-folder-job.js).
- Ops endpoints: add api/routes/archives-ops.js, register in api/routes/ops-reports.js beside deweyJobsOps; guard `requireInternal` (internal key OR admin JWT, so the admin pages can call /api/admin/ops/archives/*). CLI: add `archive-add|archive-status` to scripts/ops/ops.mjs.
- Repo: api/lib/repos/archives-repo.js using `query/queryOne/queryAll/transaction` from ../db.js; tests use the in-memory rig in tests/dewey/helpers.js (swap in ARCHIVES_SQL).
- Known-sha lookups: `findMediaBySha` (media-repo), `findBySha` (dewey-repo), `dewey_checks` by sha256. Title near-dup: `findMediaByWords`, `titleOverlap` (api/lib/dewey/media-holdings.js), `matchTitle` (title-index.js).
- music-metadata is NOT installed on tower: add to package.json, import lazily, degrade to tags=null.
- Add as media: place file (hardlink or copy) under /tank/dewey-ingest/media/<archive>/<rel> with a `.source.json` sidecar, then enqueue `media-scan {paths:[dest], roots:[], batch:1}`. The 292 golden-age files already sit there with sidecars (class, duration, codec, bitrate): adopt that folder as archive `golden-age`, no second copy.
- Add as book: place under /tank/dewey-ingest/new/_add-anyway/archives/<id>/<rel> (that folder is the existing "approved" signal), refuse exact-dup rows unless forced, enqueue `dewey-ingest-folder {batch:5}`.
- Replace held copy: `POST /ops/media/supersede` (plan with write=false first; needs slug, newSource, evidence duration_s + sample_text). Longer is not better: compare transcript and quality.
- Preview: tower must not serve media bytes. Use a worker-made 60 s clip pushed to R2/edge (media-preview job family), not a tower Range stream.
- Admin pages: src/pages/admin/*.astro with AdminLayout + a Svelte component (client:only), calls via `request('/api/admin/...')` in src/lib/api.js; use liveRefresh from src/lib/live-data.js; semantic color tokens only.

## Draft schema (migration 186, new empty tables)
`archives(id TEXT PK, label, origin, source_path, root, status copying|cataloging|ready|done, files, bytes, cataloged, progress, error, created_by, created_at, updated_at, finished_at)`
`archive_files(id, archive_id, rel_path, folder, name, ext, type, size, mtime, sha256, tags, duration_s, bitrate, codec, lang, quality, hay, class, class_reason, match, hint, sample, decision, decision_note, decided_by, decided_at, added_ref, cataloged_at, matched_at, UNIQUE(archive_id, rel_path))` with indexes (archive_id,class), (archive_id,folder), sha256 partial, and a partial "todo" index on cataloged_at IS NULL.
Classes: new, exact-dup, near-dup, different-version, unsure, junk. Decisions: add_media, add_book, skip, hold, replace, reviewed.

## Plan
A. schema+migration+repo, adopt/copy (rsync under ionice idle in sifter-bulk slice; sourcePath must be under /mnt or /tank, no `..`, archive id `^[a-z0-9-]{2,40}$`), catalog job (walk, size, mtime, streaming sha256, tags), classify (pure, junk rules, exact-dup by sha, near-dup by title), golden-age hints import from tmp/golden-age/classified.jsonl (paths relative to drive root; hints, not truth), ops endpoints + CLI, tests.
B. /dewey/archives and /dewey/archives/<id>: folder tree with counts, virtualized table with filters/sort, detail pane, bulk actions, keyboard triage, decisions saved per file; `npm run deploy`.
C. worker sampling jobs (transcript/OCR excerpt, language, page count, quality) and preview clips.
Before every push: scripts/ops/precheck.mjs; after: scripts/ops/deploy-check.mjs. Do NOT copy the physical GOLDEN AGE drive until Chad says so.
