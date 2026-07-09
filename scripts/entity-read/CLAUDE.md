# scripts/entity-read — entity pipeline tooling

The CURRENT pipeline is the disambiguation-first, source-anchored, decision-logged architecture
(docs: `docs/entity-improvable-architecture.md`, `docs/disambiguation-methodology.md`,
`docs/entity-architecture.md`). Everything NOT in the "Current pipeline" list below is **legacy**
(the pre-substrate model) and slated to move to `scripts/entity-legacy/`. When in doubt, do not run a
legacy script — it likely uses a retired pattern (literal name-match, fact-JSON extraction, reactive
cleanup) the current architecture deliberately replaced.

## Current pipeline (run in this order; all run ON tower-nas, writes via SIFTER_WRITER_URL)

Shared: `../../api/lib/translit-key.js` `skeletonKeys` (transliteration-invariant RECALL key — never a
binding decision). `_translit-key.mjs` re-exports it + self-test. `_disambig-gate.mjs` `assertDisambiguated`.

| Step | Script | Writes | Notes |
|---|---|---|---|
| 1 Structure | `chapter-map.mjs` | (in-mem) | parse book `<h>` TOC → chapters/scenes (GPB/DB only) |
| 2 Main chars | `cast-seed.mjs` | (in-mem seed) | book who's-who + `≠` namesake guards → disambiguation prompt |
| 3 Disambiguate | `disambiguate-book.mjs` | `content.context` | faithful per-para note (identity + pin/est time); gate: none (produces the gate's input) |
| — Mentions | `build-mentions.mjs` | `entity_mentions_v2` | source-anchored mentions; `entity_id` DEFERRED (never literal-bound) |
| 3b Claims | `extract-claims-v2.mjs` | `entity_claims` (`*-v2`) | cited claims, proof-gated, `semantic_key`+`when`; gate: `assertDisambiguated` |
| — Relations | `build-relation-vocab.mjs` → `apply-relation-vocab.mjs` | `relations` | controlled relation vocab used by 3b |
| — Lookup | `build-lookup-index.mjs` | `entity_lookup_keys` | rebuildable projection index → `/api/v1/entities/lookup` (fast, AI-free); re-run after any entity change |
| 4 Reconcile | **(to build)** `reconcile.mjs` | `entity_decisions` | candidate-gen (translit-key recall) → evidence adjudication → decisions; sets the projection |

Diagnostics (keep): `context-coverage.mjs`, `inspect-claims.mjs`, `probe-headings.mjs`, `probe-toc.mjs`,
`test-index-coverage.mjs`.

## Legacy (pre-substrate model — archive to scripts/entity-legacy/)

~80 scripts dated 2026-06-19…07-08 implementing the SUPERSEDED approach: the seqread pipeline
(`seq-read`, `apply-seqread`, `recover-*`), fact-JSON enrichment (`enrich-*`, `assess-facts`,
`aggregate`, `capture-roster`), name-based cluster/merge (`cluster-*`, `merge-*`, `apply-*-merges`,
`namesake-*`, `orphan-*`, `roster-*`), the old reconcile/review pages (`overnight-sweep`,
`readjudicat*`, `conflation-*`, `hallucination-review`, `divergence-report`), reactive cleanup
(`fix-*`, `scan-misbound-facts`, `unify-aliases`, `*-correct`, `*-audit`), one-off investigations
(`investigate-vahhab`, `*-probe`, `ismail-research`, `merge-vahhab`, `reverse-mh-merge`), portrait
tooling (`bio-*` — keep if still used for portraits), and the v1 claim extractor
(`build-claims-gpb`/`build-claims-source` — superseded by `extract-claims-v2`).

Legacy DATA likewise superseded: claim batches `db-v1`/`gpb-v1` (4,869, extracted from fact-JSON before
disambiguation — retire in favour of `db-v2`/`gpb-v2`); `research_notes.facts/facts2`; `graph.db`
`entity_mentions` (→ `entity_mentions_v2`). NB: `graph_entities` + `er.aliases` still SERVE the live
biography browser (bio.js) — retire only at the post-reconcile cutover, not before.
