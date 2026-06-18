# scripts/one-off/entity-seed

One-off tooling for building the GPB (God Passes By, doc_id 21310) entity-dictionary **seed** — the foundational who's-who that later books (Dawn-Breakers, etc.) resolve against. Committed (not gitignored) so the process is version-tracked and reaches tower-nas via the normal git-pull deploy path, then run there against the live DB.

Run from the project root on tower-nas (writes route through the single-writer API):

```bash
cd ~/sifter/siftersearch && git pull --ff-only
# merge a gather chunk (entity_research + graph_entities + entity_mentions + aliases)
SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/one-off/entity-seed/merge-chapter.mjs <gather-file.json>
# find duplicate-candidate clusters (read-only)
node scripts/one-off/entity-seed/find-dups.mjs
# merge duplicates per a plan file (DRY=1 to preview)
DRY=1 node scripts/one-off/entity-seed/merge-dedup.mjs <dedup-plan.json>
SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/one-off/entity-seed/merge-dedup.mjs <dedup-plan.json>
# dedup repeated " … "-separated fragments inside descriptions (idempotent fixup)
SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/one-off/entity-seed/dedup-desc.mjs
```

## Table layout (important)
- `entity_research`, `graph_entities`, `graph_relations` — **sifter.db** (routed via `query`)
- `entity_mentions`, `entity_aliases` — **graph.db** sidecar (via `graphQuery`); their `entity_id` references `graph_entities.id` *by value* (cross-file, no enforced FK)
- `graph_relations.source_entity_id` / `target_entity_id` → `graph_entities.id` (FK NO ACTION — must repoint before deleting a merged entity)

## Gather schema
Gather agents emit a JSON array of:
`{"canonical_name","is_new":bool,"entity_type":"person|work|place|group","side":"","gpb_statements":["verbatim",…],"mention_idxs":[…]}`
The `is_new` flag is advisory — `merge-chapter.mjs` resolves every entity against the *current* roster by normalized canonical_name, so cross-chunk duplicates auto-resolve regardless.
