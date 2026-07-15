# Escalating Evidence-Weighted Adjudication (EEWA) for identity resolution

> Design for a better-than-human, cost-tiered process to decide the identity of each person-mention.
> Motivating principle (user, 2026-07-15): *"pack a month's human research into every decision, but let easy
> decisions use minimal time — escalate only when the evidence is thin or conflicting."*

## 1. The problem with today's reconcile

`entities/reconcile.js` calls one LLM per name-cluster with a THIN evidence bundle:
- the resolved name + frequency,
- a few scene notes (disambiguation context),
- candidate entities by **name-skeleton recall** (name + short summary only),
- cross-book "grounded" facts by loose token-match.

It never sees the evidence that actually settles identity — all of which is **already in the DB**:

| Unused signal | Where it lives | Why it matters |
|---|---|---|
| **The cluster's OWN facts** | `entity_claims` (`semantic_key = subject\|relation\|object`, `statement`, `time_value`, `proof_verbatim`) | The book's own testimony: "martyred at Ṭabarsí, from Sangsar, brother of X" — the strongest identity evidence. |
| **Candidates' full fact-profiles** | `entity_claims` bound to candidate, `entity_research` | Fact-to-fact comparison, not name-to-name. |
| **Relationship graph** | `graph_relations` (kinship/role/office, 1.2k+) + `related-to`/`has-title`/`held-office` claims (7.6k/1.7k/1.2k) | Resolve "the maternal uncle of the Báb" / "the governor of Zanján" by the *connection*, and detect kin/role conflicts. |
| **Episode co-occurrence** | `episodes` (shared-scene rosters) | Two mentions in the same scene as a known person are strong disambiguators (the Badasht three, the Ṭabarsí defenders). |
| **Disambiguation confidence** | `entity_mentions_v2.resolution_conf` / `resolution_basis` | A free triage signal. |

Consequences: (a) leaked facts (role/relationship refs punted to "uncertain" — see the "governor of Zanján" case),
(b) wrong merges when name matches but facts conflict, (c) an LLM call spent on every trivial cluster.

## 2. Architecture: a lazy evidence bundle + an escalating decision ladder

Two ideas: **assemble evidence lazily in widening rings**, and **spend model effort in proportion to difficulty**.
Every decision records the *decisive axis* and the evidence tier that produced it (auditable, tunable).

### 2.0 Ring 0 — SCENE-LOCAL COREFERENCE (the cheapest layer, applied first)

Before any candidate lookup or model research, resolve identity *within the scene* by coreference. In a scene the
same person appears as name → epithet → role → relationship → pronoun ("Mullá Ḥusayn" … "the Bábu'l-Báb" … "the
commander" … "he"). These are ONE person and must collapse to ONE scene-anchor:

1. Fix the scene's **named anchors** (persons the text names outright) — these go up the ladder (§2.2) once each.
2. **Bind every co-referring surface form in the same scene to its anchor by INHERITANCE** — no separate lookup,
   no research. An epithet/role/relationship/pronoun that the scene ties to a named anchor takes that anchor's
   identity (and so its facts attach). e.g. in a scene naming "Amír Aslán Khán", "the governor of Zanján", "the
   arrogant governor", and "he" all inherit him.
3. Only surface forms the scene does NOT tie to a local anchor (a role/relationship pointing *outside* the scene —
   "the maternal uncle of the Báb" with no uncle present) escalate to the ladder.

This is where the biggest cost saving and the biggest fact-recovery both come from: adjudicate **once per person
per scene**, not once per surface form. The disambiguation pass already carries the scene's cast (place · era ·
recent resolves), so the coreference signal is in hand — today it is applied *inconsistently* (named+role refs
sometimes share `resolved_as`, sometimes not), which is the direct cause of the leaked role/relationship facts.
Strengthening scene-coreference at disambiguation (resolve epithet/role/pronoun to the scene anchor) collapses
variant clusters *before* reconcile, so reconcile sees fewer, cleaner clusters and the ladder runs only on the
genuinely novel anchors.

### 2.1 The evidence bundle (assembled ring by ring, stop when confident)

- **Ring A — free/local, no compute:** name skeleton + nisba; the cluster's own claims (subject-matched via
  `semantic_key`); scene notes; `resolution_conf`.
- **Ring B — local-wide:** candidate full fact-profiles; `graph_relations` for the cluster's connected names;
  episode co-occurrence; cross-book grounded facts; the full paragraph text (not just the note).
- **Ring C — remote:** web research (`ctx.web`) and authoritative catalogs (Ocean of Lights, Phelps inventory,
  Balyuzi/Momen/Máz for people). Only for the residue.

### 2.2 The decision ladder (cost rises only as needed)

- **Tier 0 — Deterministic resolver (NO model).** Handles the easy majority:
  - unique skeleton candidate + compatible nisba + no ≠-guard → **LINK** (conf ~0.97);
  - gazetteer anchor → **LINK**;
  - no candidate + a real given name + ≥1 own-fact → **CREATE**;
  - no name, no relationship, no specific role ("a youth", "a bystander") → **uncertain**.
  Emits a confidence and the rule that fired. Ring A only.
- **Tier 1 — Cheap adjudication (small/flash model).** For ambiguous clusters (multi-candidate, guard fired,
  descriptor). Prompt gets Ring A + candidate summaries&top-facts + the cluster's own facts. Returns
  `{verdict, confidence, decisive_axis}`. `conf ≥ θ_hi` → commit (→ verify); else escalate.
- **Tier 2 — Deep local research (reasoning model, Ring B).** Full candidate profiles + relations + episode
  roster + full paragraph. Resolve, or escalate.
- **Tier 3 — Remote research (Ring C).** Web + catalogs for the residue. Resolve, or leave uncertain **with the
  gathered evidence recorded** (never a bare "uncertain").

### 2.3 The verification gate (after any proposed LINK — "no conflicting evidence")

Before committing a LINK, run a **contradiction check** across discriminative axes, comparing the cluster's facts
to the candidate's facts:

| Axis | Conflict rule |
|---|---|
| **nisba** | different nisba (Yazdí≠Turshízí) → REJECT (near-definitive) |
| **era** | birth/death windows disjoint (allowing a dead figure cited later) → REJECT |
| **death** | different place/cause/year of death → REJECT |
| **role/office** | incompatible office ("amanuensis" ≠ "traditions-scholar") → REJECT |
| **kinship** | contradictory parentage/relations via `graph_relations` → REJECT |
| **side** | Bábí/Bahá'í/opponent mismatch → flag |

A REJECT sends the cluster back up the ladder (or to split/create). Cheap deterministic for structured axes; a
single focused model call only when axes are fuzzy. This is where "weigh ALL claims and context" lives, and it is
what makes a false-merge (fabrication) rare.

### 2.4 Confidence & calibration
Each tier emits a calibrated `confidence` and a `decisive` axis string (already in the decision schema). Tune
`θ_hi` (commit) and `θ_lo` (give-up) against a labelled sample; log escalation rates per tier to watch cost.

## 3. Why this is "better than human"
- Every decision weighs **all** of the cluster's facts + **all** candidate profiles + relations + episodes +
  cross-book + (when needed) the web — more than a human holds at once.
- **Perspective-diverse verification**: the contradiction gate checks independent axes (nisba, era, death,
  kinship) rather than one holistic gut-call — redundancy catches what a single pass misses.
- **No decision survives a contradiction** — the gate is a hard veto.

## 4. Efficiency
- Tier 0 clears the easy majority with zero model spend; the "month of research" (Tiers 2–3) is spent only on the
  genuinely hard residue.
- Cache per book: candidate profiles, relation sub-graph, episode rosters (static during a run).
- Reuses existing infra: `pool()` concurrency, checkpointed decisions, the `only=<stage>` re-processing path.

## 5. Build order (phased, each independently shippable + testable)
0. **P0 (foundational — do alongside P1): strengthen SCENE-LOCAL COREFERENCE (§2.0).** At disambiguation, resolve
   every co-referring surface form (epithet/role/relationship/pronoun) to the scene's named anchor, so variant
   forms share `resolved_as` and collapse to one cluster before reconcile. Biggest efficiency + fact-recovery win;
   the ladder then runs only on genuinely novel anchors. Measure: variant-cluster count and leaked-role-ref count
   drop per book.
1. **P1 (biggest quick win): feed the evidence we already have.** In `reconcile` buildUser, add (a) the cluster's
   own facts (claims whose `semantic_key` subject matches `resolvedAs` in this doc), (b) each candidate's top
   facts (not just summary). Store: `getClusterFacts(docId, resolvedAs)`, extend `findCandidateEntities` to
   attach facts. Low risk, large accuracy gain. *(The relationship-as-evidence prompt change, commit 6effea7c, is
   the first slice of this.)*
2. **P2 verification gate:** deterministic contradiction check (nisba/era/death/role/kin) as `verifyLink()` before
   commit; reject → escalate. Pure, unit-testable.
3. **P3 Tier-0 deterministic resolver:** short-circuit the easy majority before any model call; measure the
   LLM-call reduction.
4. **P4 relationship + episode evidence:** candidate recall by connection (`<relation> of <NAME>` → entities
   related to NAME in `graph_relations`); episode roster into the bundle.
5. **P5 escalation controller:** wrap Tiers 0→3 with confidence thresholds + per-tier logging; wire Ring C.
6. **P6 re-resolve pass:** run the improved ladder (via `only=research` / a new `only=reresolve`) over the
   retained **unbound** relational clusters to recover their facts across the already-done corpus.

## 5b. Incremental re-adjudication — cheap, repeatable improvement sweeps (NEVER from scratch)

A hard requirement: improving the adjudicator must be cheap to re-apply, so we never hesitate to iterate. A sweep
reuses EVERYTHING already computed (mentions, claims, disambiguation notes, confident prior decisions) and
re-touches only the improvable minority.

**Three run modes for reconcile (today it has two — this adds the third):**
- `resume:true` — skip every already-decided cluster. For resuming an interrupted run. (exists)
- `resume:false` — decide all. Full run. (exists)
- **`readjudicate:{maxConf, includeUncertain, sinceVersion}` — process ONLY clusters whose CURRENT decision is
  improvable** (kind=uncertain, or confidence < maxConf, or decided by an older method_version), skipping every
  confident/current one. (new)

**The selector** `getReadjudicationClusters(docId, {maxConf, sinceVersion})` returns just that improvable set. It
is cheap: for 15228, uncertain(357)+low-conf ≈ 370 of ~1,455 decisions (~25%). A whole-corpus sweep therefore
re-runs a quarter of the work, not all of it — and Tier 0 / scene-coreference clears much of that with no model
call at all.

**Idempotent replacement (already-supported columns):** a re-adjudication writes a NEW decision with
`supersedes = <old decision id>` (append-only log; never mutate history). Then:
- `getProposedDecisions()` returns the **latest non-superseded** decision per (docId,resolvedAs) — GAP TO CLOSE.
- `project` **re-binds** on a superseded change: if the new decision links a cluster elsewhere than the applied
  one, unbind the old and bind the new (mentions + inherited claims move) — GAP TO CLOSE. Confident-unchanged
  clusters are never touched.

**How a sweep runs (reuses the re-processing plumbing already built):**
`POST /grounding/start {docId, only:'reconcile'}` (or a dedicated `only:'reresolve'`) with a `readjudicate`
predicate → reconcile re-decides only the improvable clusters with the current (better) logic → project re-binds
the changed ones → done. Reports live via `run_json` like any run. Sweeping the corpus = loop this over books;
each book costs ~the improvable-fraction, not a full re-ground.

**Versioning drives the sweep:** stamp each decision with the adjudicator `method_version`. Bumping the version
when the logic improves makes `sinceVersion` select exactly the stale decisions — so "apply the new improvement
everywhere" is one predicate, and re-running it is idempotent (already-current decisions are skipped).

### 5c. Versioned adjudication + passive per-book upgrade

Treat EVERY adjudication run as an upgrade — including a book's first pass. But "first pass" does NOT mean
"version 1": the stamp is the engine's version AT THAT MOMENT (if the engine is at 245, a brand-new book's first
pass stamps it 245, an upgrade from "unprocessed", not from 1). So no book is ever unversioned, and each book
carries a stamp saying how modern its identity resolution is.

- **`ADJUDICATOR_VERSION` = the engine version** — a single monotonic integer for the whole adjudication engine
  (e.g. 245), bumped whenever the logic improves (scene-coreference, verification gate, new evidence rings…). It is
  NOT per-rule or per-decision-type; the entire engine has one version number at any time.
- **Book-level stamp = the engine version at the time the book was processed.** Process a new book while the
  engine is at 245 → the book is stamped 245. Upgrade the engine to 246 → every book with version < 246 is, by
  definition, "processed by an older engine" and a candidate for a re-pass. Full simplicity: `book.version <
  ADJUDICATOR_VERSION` ⇒ due.
- **One refinement for incremental sweeps (§5b):** because a sweep may re-decide only *part* of a book, also keep
  `adjudicator_min_version` = the OLDEST decision version still in the book. A full pass sets book.version =
  engine version cleanly; a partial sweep leaves min-version at the oldest un-refreshed decision — so
  prioritisation uses the min-version to know a book's weakest part is still old even if its last touch was recent.
- **Passive-upgrade worklist (free prioritisation):**
  `SELECT doc_id, adjudicator_min_version, COUNT(stale decisions) FROM … WHERE adjudicator_min_version <
  ADJUDICATOR_VERSION ORDER BY adjudicator_min_version ASC, stale_count DESC`
  → the books that benefit MOST from a re-pass, worst-first. When resources are free (idle worker, budget), the
  orchestrator pops the top of this list and runs an incremental `readjudicate` sweep (§5b) — cost ≈ the book's
  stale fraction, not a re-ground.
- **Surface it** — show each book's adjudicator version on the roadmap (a small "v3" badge / greyed if behind
  current), so a human sees at a glance which books are modern and which are due for a pass. Same idea as the
  honest-done gate: the UI tells the truth about maturity, not just done/not-done.
- **Self-improving loop:** improve logic → bump `ADJUDICATOR_VERSION` → the worklist repopulates automatically →
  idle capacity drains it → the whole corpus converges to the current version over time, no manual bookkeeping.
  Because every run stamps, and sweeps are idempotent + incremental, this is safe to leave running passively.

## 6. Notes
- All facts are RETAINED even when unbound (`entity_mentions_v2`/`entity_claims` rows with `entity_id NULL`), so
  the corpus can be re-resolved retroactively — no data was lost, only unused.
- Fabrication guardrail is non-negotiable: prefer uncertain over a wrong link; the verification gate enforces it.
- Pure library boundary holds: evidence-gathering ports live in `rag-adapter/store.js`; `rag/entities/*` stays
  DB-free.
