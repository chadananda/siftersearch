---
id: "0043"
title: One completion model — the entity pipeline lives in scripts, so nothing knows it is unfinished
state: ready
priority: P0
size: L
acceptance:
  - text: every process that mutates corpus data is a registered stage, not a script
  - text: completion is READ from a recorded stamp, never derived by counting output
  - text: claim target binding runs to completion and reports coverage before and after
  - text: a stage that has never run is distinguishable from one with nothing to do
  - text: scripts/entity-read/ contains no writer that is not also a stage
---

## The question
Chad, 2026-09-09: "why on earth did this stop incomplete? I keep getting
conflicting explanations which suggests that our extraction and indexing pipeline
is poorly architected or confusing for each session."

He is right, and the confusion is structural rather than accidental.

## The answer: it never started
`entity_claims.target_entity_id` appears in the ENTIRE pipeline and entity-stage
source exactly once — as a comment in `claims.js:121` saying it stays null.

    // Map a validated claim to the stored row shape. entity_id / target_entity_id
    // stay null (deferred). The

Nothing in `api/lib/pipeline/` or `api/lib/rag/entities/` ever binds it. The only
writers are one-off scripts:

    scripts/entity-read/link-claims.mjs          binds entity_id + target_entity_id
    scripts/entity-read/apply-relation-vocab.mjs rewrites relation + target

`link-claims.mjs` defaults to the `gpb-v2/db-v2` import batches — God Passes By
and the Dawn-Breakers — or `DOC=426`, one book at a time, and its own header calls
that "wave-1". **There were meant to be later waves. There were none.**

Measured on production 2026-09-09:

    total entity_claims     615,211
    subject bound            306,635   (50%)
    TARGET bound              55,451   ( 9%)

So it did not stop incomplete. **It was never a stage.** It stopped when the person
running the script stopped, and nothing recorded that it had ever begun.

## Why every session gets a different explanation
There are THREE competing notions of "done", and a reader finds whichever one
they open first:

1. **`pipeline/stage-state.js`** — explicit records in `pipeline_run`. Its own
   header names the disease precisely: *"three different definitions of done
   disagreeing, and progress being inferred from side effects so that 'never
   started' and 'nothing to do' looked identical."* But
   `STAGES = ['convert','ingest','relabel']` — it governs THREE stages.
2. **`pipeline/processed.js`** — bars derived by counting columns
   (`meetsDisambBar`, `meetsHypeBar`, `meetsExtractBar`, `meetsReconcileBar`).
   Well-reasoned, well-documented, and a different mechanism from (1). Its header
   records the same class of bug recurring five times in five files.
3. **`scripts/entity-read/*.mjs`** — a dozen writers with `WRITE=1` env flags and
   no tracking whatsoever. `build-mentions`, `build-lookup-index`,
   `build-gazetteer`, `apply-decisions`, `apply-relation-vocab`, `link-claims`.

A session that reads `pipeline/` sees a coherent staged system with gates and
concludes the architecture is sound. It never learns that the entity graph is
actually built by hand-run scripts in another directory. **That is the confusion,
and it is guaranteed to recur until the three collapse into one.**

## The fix, in the data
Run target binding to completion — but as a stage, not another manual wave.
Report coverage before and after; the 9% figure is the baseline. Unbindable
targets are recorded as unresolved, never dropped: an unresolved target is
evidence of a person or place the archive knows and has not catalogued, which is
a finding.

## The fix, in the system
**Every process that mutates corpus data becomes a registered stage.** Concretely:

* Add the entity stages to `STAGES` — mentions, lookup, decisions, claims,
  link (subject+target), relation-vocab.
* Each records a run in `pipeline_run` via `beginRun`/`endRun`, which already exist.
* Each stamps a version on the rows it processed, following the doctrine
  `processed.js` already states: **DONE MEANS THE WORK WAS DONE, NEVER THAT IT
  PRODUCED OUTPUT.**
* Gates read the stamp. No gate counts output.

**Then delete the scripts, or reduce them to thin callers of the stage.** A writer
that exists only as a script is a stage nobody can see.

## The refactor toward simplicity
The single highest-value simplification available here:

> **One completion model. Completion is read, never derived.**

`processed.js` exists because completion was derived in five places and drifted.
The response was to centralise the derivation — better, but still derivation.
`stage-state.js` is the correct answer and covers three stages. Finish it: record
what ran, read the record. Then `processed.js` shrinks from the definition of done
to a reporting view, and the bars stop being load-bearing.

Second simplification: **`scripts/entity-read/` should not be able to write.**
Reading and diagnostics there are fine. Any writer moves into a stage. That single
rule makes the pipeline honest — what you can read in `pipeline/` becomes what
actually happens.

Third: the v1/v2 table split is dead weight — `entity_mentions`, `entity_aliases`,
`entity_sets`, `quote_clusters`, `entity_aliases_v2`, `concept_mentions` are ALL
at zero rows while `entity_mentions_v2` carries 216,533. Empty tables that look
live are a reading hazard; drop them or document them as retired.

## Why P0
Every downstream item — 0035 ranking, 0038 names, 0042 targets, 0037 episodes —
is unmeasurable while "done" means three different things. And the next session
will reach the same wrong conclusions I did, for the same structural reason,
however carefully it reads.
