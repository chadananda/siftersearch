# Improvable Entity Architecture — design of record

The goal: **improve entities forever without regenerating them.** Method changes and better
models must add value incrementally, never force a from-scratch rebuild that clobbers accumulated
human corrections, verified facts, and adjudicated merges/splits.

## The one principle

**Separate what is cheaply *regenerated* from what is expensively *decided*; anchor identity to the
source, not to the run; make an entity a *projection*, never an authored record.**

`graph_entities` today is an authored row that each pass overwrites — which is exactly why every
improvement means regeneration. We flip it: the entity becomes a computed view over a stable
substrate plus an append-only log.

## The layers — regenerable vs. precious

| Layer | Content | On upgrade |
|---|---|---|
| 0 Source | corpus paragraphs (`content`) | immutable |
| 1 Mentions | every name-occurrence at a text position (`entity_mentions_v2`) | re-detectable, **stably identified** |
| 2 Disambiguation | per-paragraph notes (`content.context`) | **regenerate freely** — no human judgment |
| 3 Claims | cited facts w/ proof + `when` (`entity_claims`) | regenerate; source-anchored |
| 4 Entities | clusters of mentions (`graph_entities`) | **materialized projection — never authored** |
| 5 Decisions | merge/split/verify/research/correction (`entity_decisions`) | **append-only, precious, never clobbered** |

Layers 1–3 are *derived* — rebuild with a smarter model any time. Layer 5 is the *accumulated value*.
The whole trick: **regenerating 1–3 cannot damage 5.**

## The linchpin: identity anchored to source

- **Mention id = `anchor = hash(doc_id, para_id, surface_norm, occurrence)`** — stable across re-runs.
  Re-extraction of the same source yields the *same* id; new facts get new ids (purely additive).
- **Claim identity = `semantic_key = (subject_entity, normalized_relation, object, para_id)`** — robust
  to rewording. A better extractor that finds the same fact maps to the same key (phrasing/proof
  update in place, status carries); genuinely new facts are additive.

Every Layer-5 decision references these stable ids, so re-derivation leaves every merge, split, and
verified fact still pointing at something real. This is the difference between additive improvement
and starting over.

## Entities as a projection of an append-only decision log

`entity = f(mentions, decision_log)`:
1. **Cluster** mentions by the accumulated `merge`/`split`/`reassign` decisions (a union-find).
2. **Attach** the claims that hang off those mentions.
3. **Override** with `verify`/`set` decisions (verified attributes win).
4. **Materialize** into `graph_entities` for fast/indexed search — a *disposable cache*, always
   rebuildable from log + mentions.

A merge is `append {kind:merge, targets:[E1,E2], evidence, actor, confidence}`. A split is
`append {kind:split, target:E, payload:{mentions:[…]→newE}}`. A correction is
`append {kind:set, target:E, payload:{death:"Ṭihrán 1850"}, actor:human, actor_tier:3}`.
**Nothing is rewritten or deleted — only superseded by a later appended record that points back at the
one it replaces.** Every operation is therefore reversible and every past state reconstructable.

## Precedence + versioning (upgrades never regress)

- Every derived record carries `method_version` + `model`. Re-derive *only* records below the current
  version; diff v1↔v2; roll back a bad method — selectively, not globally.
- **Precedence by `actor_tier`: 3 human-verified > 2 strong-model > 1 flash > 0 derived-default.**
  Re-derivation may *propose* but never *overwrite* a higher-precedence record; a conflict with a
  verified fact **flags for review** instead of clobbering. Human corrections are a floor.
- **Bitemporal**: `valid_time` (when true in history — the timeline) + `decided_at` (when we recorded it).

## Per-entity upgrade loop (independent assessability)

Because `entity = cluster + its decisions`, one entity re-opens with a bounded blast radius:
1. Pick an entity (by importance, uncertainty, or "not assessed since method-v_N" — `last_assessed_version`).
2. Assemble its dossier: mentions, claims, evidence, current decisions, cross-corpus sources.
3. Run the better model / more research → it *proposes* changes.
4. Adjudicate: auto-apply if high-confidence AND not contradicting a verified decision; else queue.
5. Append. Recompute *that* entity's projection. Nothing else moves.

**Onboarding a smarter model is not a reset:** it re-derives the cheap layers (survives, anchors are
stable), then re-adjudicates the hard cases *as proposals measured against the accumulated verified
decisions* — which double as a regression suite. A new model must beat the gold decisions before it is
trusted; it cannot silently undo them.

## The four-table substrate (sifter.db, migration 86)

- **`entity_mentions_v2`** — `(id, anchor UNIQUE, doc_id, para_id, occurrence, surface, surface_norm,
  entity_id, resolved_as, resolution_basis, resolution_conf, method_version, model, status)`.
- **`entity_decisions`** — append-only log: `(id, kind, target_kind, target_ids JSON, payload JSON,
  evidence JSON, rationale, actor, actor_tier, confidence, status, supersedes, valid_time, decided_at)`.
- **`entity_claims`** (extended) — `+ time_value, time_precision, time_basis(pin|estimate), time_anchor,
  method_version, semantic_key`. (Already had bitemporal `valid_from/valid_to`, `status`, `superseded_at`.)
- **`graph_entities`** (redefined as projection) — `+ last_assessed_version, projection_rev, book_prominence`.

Pass 4 (reconcile), the review pages, and every future model write **decisions**, not edits. We never
regenerate the graph — we replay the log over the substrate.

## Fast lookup layer (recall, never determinative)

`entity_lookup_keys` (migration 87) is a rebuildable index of **transliteration-invariant** keys
(`api/lib/translit-key.js` `skeletonKeys`, folding Arabic↔Persian shifts th↔s / ḍ↔z / w↔v / q↔gh) over
every projected entity's canonical + aliases. It powers **`GET /api/v1/entities/lookup?q=<any spelling>`**
— an AI-free, indexed candidate lookup for human and AI researchers (Sadeq→Ṣádiq, Rezvan→Riḍván,
Ghoddus→Quddús). It returns **RECALL candidates only** ("bind by evidence, not by this list"); the
canonical is a lookup handle + display label, **never** determinative of identity. Rebuild with
`scripts/entity-read/build-lookup-index.mjs` after any entity-projection change — deterministic, no LLM.

## Pipeline passes & tooling

DISAMBIGUATE → EXTRACT → INTEGRATE → SEARCH, as four passes: (1) Structure `chapter-map`, (2) Main
Characters `cast-seed`, (3) Disambiguate `disambiguate-book` → Mentions `build-mentions` → Claims
`extract-claims-v2`, (4) Reconcile `reconcile` (candidate-gen recall → evidence adjudication →
`entity_decisions`). Full script index + the legacy (pre-substrate) tooling to retire: see
`scripts/entity-read/CLAUDE.md`. Also [entity-architecture.md](entity-architecture.md),
[disambiguation-methodology.md](disambiguation-methodology.md).
