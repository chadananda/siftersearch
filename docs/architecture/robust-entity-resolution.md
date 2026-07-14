# Robust Entity Resolution

**Goal:** make splitting and merging accurate *at the source*, so the ad-hoc cleanup passes
(keystone-gate, split-audit, coherence-audit) become regression *tests* that stay green — not tools we
keep re-running. Applies **forward** (new books) and **backward** (re-resolve the entities we already have).

## The problem — two failure modes, one root cause

| Mode | Example (this corpus) | Mechanism |
|---|---|---|
| **Split** (one person → N entities) | Mírzá Músá / Áqáy-i-Kalím / "the ablest of His brothers" = 3 entities | binding clusters by **surface name** |
| **Conflation** (N people → one entity) | Wilhelm Herrigel merged into Mírzá Muḥammad-‘Alí on "both covenant-breakers"; a bare "Muḥammad" absorbed into the Prophet | binding **guesses on ambiguity** and matches on **name or role** |

**Root cause:** identity is decided at bind-time by the *weakest* signal (surface string, or shared role),
while the *richest* signal is discarded — the disambiguation stage already resolved *who each mention is*
into `content.context`, but the mention→entity binding never consumes it.

Empirical proof (broad `split-audit`, 2026-07-13): screening 645 fact-bearing persons proposed only 4
cross-name merges and **one was wrong** (Herrigel ≠ Mírzá Muḥammad-‘Alí — matched on shared role). So a
fact-search pass is both *incomplete* (misses thin name/title splits) and *unsafe* (role ≠ identity). The
cure is not more passes; it is better binding.

## The four rules

1. **A curated GAZETTEER anchors the central cast.** ~100 recurring figures, each with *all* forms
   (name · titles · epithets · nisbas · relational forms · transliteration variants), distinguishing facts,
   and explicit `≠namesake` guards. Binding consults it **first** → the important figures resolve
   deterministically and *identically in every book, forever*. (Front-loads correctness by frequency.)

2. **Binding CONSUMES the disambiguation context**, not the surface string. `content.context` already
   states "Áqáy-i-Kalím = Bahá'u'lláh's brother" — cluster mentions by that *resolved identity*. Collapses
   name/title/epithet splits at the source.

3. **Asymmetric, discriminative evidence rules:**
   - distinctive/qualified name (nisba, title, foreign) → merge on **absence of contradiction** (kills splits)
   - bare/common name → require a **positive discriminative tie** (kills conflations)
   - differing **nisba / death / kin / era** → hard **DISTINCT**
   - **shared role or side is NOT identity** → never a merge basis (the Herrigel rule)

4. **Recall-before-create, HOLD-don't-guess.** Never mint a new entity until multi-signal recall
   (translit-key ∪ title/alias index ∪ shared *discriminative* fact ∪ shared episode) + evidence
   adjudication fails — NIL only as last resort (stops cross-book re-fragmentation). A mention with no
   confident bind stays **UNRESOLVED** (quarantine), never force-bound — a held mention is honest; a wrong
   bind fabricates.

## Architecture

The atom of identity is the **mention** (name@position in context). An **entity** is a *resolved cluster*
of mentions; the materialized `graph_entities` graph is a **disposable projection** over
`entity_mentions_v2` + append-only `entity_decisions`. This is what makes everything reversible and
re-runnable — and what makes backward application possible.

```
mentions (deferred entity_id)  ──►  RESOLVE  ──►  entity_decisions (append-only)  ──►  project → graph_entities
   ▲ source-anchored, has context        │
   └── content.context (disambiguation)  │  RESOLVE = for each mention/cluster:
                                          │    1. GAZETTEER consult (forms + ≠guards)      → anchor hit ⇒ bind
                                          │    2. recall: translit-key ∪ alias/title ∪ fact ∪ episode → candidates
                                          │    3. adjudicate by EVIDENCE (asymmetric rules; role≠identity)
                                          │    4. no confident bind ⇒ HOLD (unresolved), never create-on-guess
```

Every decision records its **proof** (doc/para + verbatim span) in `entity_decisions.rationale`, is
`status='proposed'|'applied'`, and is reversible.

## Backward application — YES

Because the graph is a projection over mentions+decisions, **the same resolver runs over the mentions we
already have.** The mentions (`entity_mentions_v2`) and the disambiguation (`content.context`) are already
computed for the grounded books; only the *binding* was weak. So the backward pass is:

1. Freeze current bindings as reversible baseline (they already are — append-only).
2. Re-run RESOLVE over existing mentions with the four rules → new merge/split/HOLD **decisions** (proposed).
3. Review high-impact decisions (frequency-ordered), apply, **re-project** the graph.

No re-extraction, no re-disambiguation, no re-grounding — just re-resolution. The keystone merges and the
Yaḥyá/Navváb fixes done manually this session are exactly what this automates and generalizes.

## Build plan (in lurches)

- **S1 — Gazetteer scaffold.** Derive an anchor set from the current top-N grounded entities (canonical +
  aliases + key facts already exist as summaries) + the `≠namesake` pairs found this session (Qumí≠Kalím,
  Herrigel≠Muḥammad-‘Alí, Zanjání-chronicler≠Bábu'l-Báb, Badí‘u'lláh≠Badí‘…). Store as data, not code.
- **S2 — Adjudicator hardening.** Encode the asymmetric rules + "role≠identity" into the shared evidence
  comparator used by `reconcile`/`merge`/`dedup-guard` (one comparator, not three).
- **S3 — Resolver = gazetteer-anchored, context-consuming reconcile** with recall-before-create + HOLD.
- **S4 — Backward re-resolve** over existing mentions (frequency-ordered, proposed decisions, reviewed apply).
- **S5 — Gates → DoD regression tests** (`keystone-gate` wired ✓; add `split-audit`/`coherence-audit` as
  non-blocking DoD reports). Green = binding is holding; a flag = a real regression.

## Tests / DoD

The three auditors stay as the correctness spec, moved into the per-book DoD as **regression detectors**:
`keystone-gate` (major figures single) · `split-audit` (no cross-name duplicate persons) · `coherence-audit`
(no conflation under one entity). Acceptance arcs (Badasht three, Letters of the Living) remain the eval.
