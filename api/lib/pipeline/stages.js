// pipeline/stages — THE registry. Every stage this system runs is declared here, once.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────────────
// On 2026-09-09 the codebase held SIX definitions of "what the stages are", and they disagreed:
//   bio.js:58              11 grounding stages, as a bare literal
//   run-grounding.js:15    the same 11, duplicated verbatim, with a comment saying they must match
//   stage-state.js:10      3 stages ('convert','ingest','relabel') — a different mechanism entirely
//   state.js:18            4 stages under DIFFERENT NAMES for the same work ('disambig' vs 'disambiguate')
//   anthropic-policy.js    two more sets, for concept and segment routing
// A session reading any one of them formed a confident and wrong picture of the pipeline. That cost real
// money in wasted analysis, and it is why `link` ran for two books and nobody noticed for weeks.
//
// So: ONE list. If you are adding a stage, add it here and import it. If you find yourself writing a stage
// name as a string literal somewhere else, that is the bug this file exists to prevent.
//
// ── THE RULE THAT MATTERS MOST ──────────────────────────────────────────────────────────────────────────
// DONE MEANS THE WORK WAS DONE, NEVER THAT IT PRODUCED OUTPUT. A stage that examined a paragraph and found
// nothing to do is COMPLETE for that paragraph. Measuring output instead brands sparse books incomplete
// forever and re-runs them until someone notices the bill. `processed.js` states this at length and is the
// authority; this file only records which stamp proves each stage ran.
//
// ── WHAT A STAGE MUST DO ────────────────────────────────────────────────────────────────────────────────
//   1. live in a MODULE under api/lib/rag/, exporting an async function
//   2. RETURN a result object — counts, not void. The caller emits it as telemetry.
//   3. be idempotent: re-running must be safe and must not duplicate work
//   4. never be invoked by shelling out to a script (see `link` below for what that cost)
//
// Deps: none. This file must stay dependency-free so anything may import it without a cycle.

/**
 * The grounding stages, IN EXECUTION ORDER. Order is load-bearing: `link` binds claims to entities and
 * therefore must run after `claims` (which creates them) and after `project` (which creates the entities
 * they bind to).
 *
 * module   — the implementation. `null` means NOT YET A MODULE, which is a defect, not a design.
 * stamp    — the column proving the stage ran on a row. `null` means completion is not yet recorded,
 *            which is why that stage's progress can only be guessed at.
 * emits    — whether run-grounding captures a result object from it. A stage that emits nothing cannot
 *            be observed, and an unobservable stage will eventually stop working quietly.
 */
export const GROUNDING_STAGES = [
  { name: 'disambiguate', module: 'rag/enrich/disambiguate.js',    stamp: 'context_model',    emits: true,
    does: 'resolve who/what each paragraph refers to; writes the NOTE later stages read' },
  { name: 'mentions',     module: 'rag/entities/mentions.js',      stamp: null,               emits: true,
    does: 'find every name mentioned in a paragraph and record it in entity_mentions_v2' },
  { name: 'claims',       module: 'rag/entities/claims.js',        stamp: 'extractor_version', emits: true,
    does: 'extract subject-relation-object claims with verbatim proof; identity DEFERRED (ids left null)' },
  { name: 'reconcile',    module: 'rag/entities/reconcile.js',     stamp: null,               emits: true,
    does: 'decide which mention clusters are the same person; writes entity_decisions' },
  { name: 'research',     module: 'rag/entities/research-resolve.js', stamp: null,            emits: true,
    does: 'resolve entities that the corpus alone cannot disambiguate' },
  { name: 'project',      module: 'rag/entities/project.js',       stamp: null,               emits: true,
    does: 'create graph_entities from reconciled clusters' },
  { name: 'link',         module: 'rag/entities/link.js',          stamp: null,               emits: true,
    does: 'BIND claims to entities — sets entity_claims.entity_id and target_entity_id' },
  { name: 'merge',        module: 'rag/entities/merge.js',         stamp: null,               emits: true,
    does: 'merge duplicate entities, repointing their relations' },
  { name: 'dedup',        module: 'rag/entities/dedup-guard.js',   stamp: null,               emits: true,
    does: 'prevent and detect duplicate entity creation' },
  { name: 'hype',         module: null,                            stamp: 'hyp_model',        emits: true,
    does: 'generate hypothetical questions each paragraph answers, for semantic retrieval' },
  { name: 'verify',       module: 'rag/entities/verify-link.js',   stamp: null,               emits: true,
    does: 'check bound claims against their proof before they are trusted' },
];

/** Just the names, in order — the shape the older call sites expect. */
export const GROUNDING_STAGE_NAMES = GROUNDING_STAGES.map((s) => s.name);

/**
 * Document lifecycle stages, tracked explicitly in `pipeline_run` via stage-state.js.
 * These are the ONLY stages that currently record that they ran. Extending that coverage to the
 * grounding stages above is the point of backlog item 0043.
 */
export const DOC_STAGES = ['convert', 'ingest', 'relabel'];

/** Stages whose model routing is governed by anthropic-policy.js. Declared here so that file stops owning a list. */
export const CONCEPT_STAGES = ['concept-extract', 'concept-disambiguate', 'concepts', 'concept-lexicon', 'hype-judge'];
export const SEGMENT_STAGES = ['concept-segment-original'];

/** Look up one stage's declaration. Returns undefined for an unknown name — callers should treat that as a bug. */
export const stage = (name) => GROUNDING_STAGES.find((s) => s.name === name);

/** Stages that are declared but have no module — i.e. work that happens somewhere unobservable. */
export const unimplemented = () => GROUNDING_STAGES.filter((s) => !s.module).map((s) => s.name);

/** Stages that cannot report completion, because nothing stamps the rows they touch. */
export const unstamped = () => GROUNDING_STAGES.filter((s) => !s.stamp).map((s) => s.name);
