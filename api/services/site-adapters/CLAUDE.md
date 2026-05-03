# api/services/site-adapters — Per-site ingestion adapters

Each adapter exports two functions consumed by `api/services/sites-ingester.js`:

```js
parseDoc(relativePath, content, { siteRoot, siteConfig })
  -> { docFields, paragraphs, raw_frontmatter }

detectSupersedee(incomingDoc, hashCandidates, metadataCandidates, opts)
  -> { supersedes: doc_id|null, reason, candidates_inspected }
```

## Current adapters
- `oceanlibrary.js` — OceanLibrary.com markdown (Pandoc-attr blocks). Skips footnote definitions. Religion-map sourced from `siteConfig.religion_map` (defaults baked in for direct invocation). Two-signal supersession: hash-overlap + title+author metadata fallback (covers cases where our existing corpus has `[aN]` reference-prefix markers that prevent paragraph hash matches).

## Adding a new adapter
1. Drop a file here named after the site id from `-sites/sites.yaml`.
2. Export both contract functions.
3. Reuse `_internal` helpers from oceanlibrary.js (fuzzyTitleMatch, fuzzyAuthorMatch, levenshtein, normalizeForFuzzy) where they apply.
4. Add the site to `<library_base>/-sites/sites.yaml` and `config/sites.example.yaml`.
5. The next sites-ingester tick (or `node scripts/sites-ingest.mjs --site <id>`) picks it up automatically.

See `docs/sites-integration.md` for the full pipeline description.
