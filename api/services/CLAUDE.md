# api/services — Background pipelines + content services

These are the I/O-heavy / multi-step services. Routes call them; workers run them.

## Document ingestion
- `library-watcher.js` — chokidar-based watcher for the religion-root tree. Hourly disk scan + live ADD/DELETE events + sites-ingester tick. Orphan cleanup. The religion-root whitelist (`.religion/meta.yaml` marker) is the central invariant — `discoverReligionRoots`, `isInReligionFolder`. Tested at `tests/api/library-watcher.test.js`.
- `ingester.js` — markdown → docs+content lifecycle. `ingestDocument`, `parseDocument`, `removeDocument`, hash helpers. Handles re-ingest, body-hash move detection, soft-delete. **Mega-file (2,143 lines) — split deferred.**
- `block-parser.js` — Markdown block parser. `parseMarkdownBlocks`, `BLOCK_TYPES`.
- `indexer.js` — chunking + embedding + Meili indexing. `indexDocumentFromText`, `chunkDocumentForIndexing`, `removeDocument`, embedding cache lookup with sidecar harvest.
- `verification.js` — content / index verification probes.

## External-source ingestion
- `sites-ingester.js` — drives external sites (OceanLibrary etc.) into the corpus. Walks `-sites/<id>/`, applies adapter, embeds, supersedes our copies, auto-restores on file delete. Tested at `tests/api/sites-ingester.test.js`.
- `site-adapters/` — per-site `parseDoc` + `detectSupersedee` modules.

## Segmentation / language
- `segmenter.js` — text segmentation pipeline. AI-segmentation for Arabic/Farsi/Hebrew/Urdu. **Mega-file (3,850 lines) — split deferred.** Tested at `tests/api/segmenter.test.js`.

## Translation
- `translation.js` — translation jobs queue + LLM segmentation. **Mega-file (2,652 lines) — split deferred.** Tested at `tests/api/translation.test.js`.

## Workers + jobs
- `embedding-worker.js` — generate + persist embeddings for unembedded paragraphs.
- `enhancement-worker.js` — disambiguation + HyPE generation pump.
- `sync-worker.js` — Meili sync helpers shared by sync-processor.
- `jobs.js` — generic job queue (translation, enrichment, etc.).
- `progress.js` — import-batch progress tracking visible to the API.

## Other
- `audio.js` — TTS for narrated paragraphs.
- `email.js` — SendGrid wrapper for transactional mail.
