# scripts/pipeline — unified enrichment pipeline drivers (v2)

Manual-phase CLIs over the `doc_pipeline` state substrate (api/lib/pipeline/). Design:
`docs/architecture/unified-enrichment-pipeline.md`. All run ON tower-nas; writes via SIFTER_WRITER_URL.

- `pipeline.mjs status|backfill` — corpus-wide stage view / (re)build doc_pipeline from DB.
- `run-pipeline.mjs [--dry | --once | --drain | --doc N --stage X]` — advance released books through the
  gated DISAMBIGUATE→{HyPE∥EXTRACT} stages (spawns scripts/entity-read/* as isolated subprocesses).
- `hype-batch.mjs` — HyPE batch CLI: `submit --core|--docs|--file [--limit N]`, `collect`, `status`, `run`. Light on tower; the work runs at the provider.
