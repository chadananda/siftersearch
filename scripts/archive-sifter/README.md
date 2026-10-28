# archive-sifter
Browser tool to triage big copied drives (/tank/archives/<name>/) and hand approved files to Dewey intake. Standalone: own SQLite per archive in ~/archive-sifter/<name>.db, never touches the Sifter DB.
- Run (tower): `pm2 start scripts/archive-sifter/server.mjs --name archive-sifter --interpreter scripts/ops/in-slice.sh` (nice 15, sifter-bulk slice). Listens only on 100.77.148.41:7860 (env ARCHIVE_SIFTER_HOST/PORT).
- Login: shared token in `~/.archive-sifter-token` on tower (create: `openssl rand -hex 16 > ~/.archive-sifter-token`).
- New archive: drop a folder under /tank/archives; it appears in the picker and is scanned (incremental, every 10 min + Rescan button).
- Suggestions: `~/archive-sifter/<name>.classified.jsonl` (rows with path/cls new|duplicate|excluded|version|unsure/note/dup), same-bytes twins, and library title/duration matches from /api/media/index.
- Import: hard-links (same ZFS pool, passes Dewey's root check) into /tank/dewey-ingest/media/golden-age-approved/<rel> (media) or new/_add-anyway/golden-age/<rel> (books), plus `.source.json`. Idempotent.
- Needs `npm i` in this folder (music-metadata; no ffprobe, tower must not probe media).
