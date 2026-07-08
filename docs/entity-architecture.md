# Entity Architecture — cited biographical identity, claims, and evidence

> Status: living design doc (started 2026-07-08). Describes where the entity system is,
> where it's going, and *why* — grounded in prior art (see "Industry audit"). The
> foundation here is built to survive the ROB ingest (~1,180 → ~3,600 people) and beyond.

## The one idea: the **cited claim is the atom**

Every phase of the system is an operation on a single unit — a **claim**: *this entity*, in
*this relation*, asserts *this statement*, proven by *this verbatim span* at *this
(document, paragraph)*, optionally about *this target entity*, with a *confidence*, a
*provenance tier*, and *verification flags*. If the claim is modeled once — rigorously,
with provenance and verification built in — the three phases inherit cleanliness, speed,
and accuracy. Today the claim is modeled three different ways across the phases, and the
seams between them are where bugs live (see case study).

A claim with no citation is a **hypothesis**, not a fact. Identity itself (aliases,
merges) is just another kind of cited claim.

## The three phases

1. **GATHER** — read source text (coreference-complete: name, title, epithet, role,
   pronoun), extract entities and **cited claims** with verbatim proof spans. Output:
   staged claims, each already carrying its (doc, paragraph) citation.
2. **INTEGRATE** — resolve-or-create against the existing collection. **Merge** the same
   person under variant names; **split** different people under the same name — decided by
   **evidence consistency**, not string similarity. Reversible.
3. **SEARCH** — let AI research tools pivot on people / relations / claims / involvement
   *fast*, and **muster citations to match or exclude** a candidate.

Each must be clean, efficient, effective, fast, and accurate.

## Current state (2026-07) — what exists and its debts

**Good foundations already in place (keep + extend):**
- `entity_mentions` — normalized, id-keyed, `extractor_version`-tagged (reversible binds).
- `entity_aliases` — normalized: `entity_id, surface, surface_norm, lang, confidence,
  source`, unique on `(entity_id, surface_norm, lang)`, indexed on `surface_norm` +
  `entity_id`. This is the *correct* pattern.
- Citation scheme: `${source_url}?paraId=para_NNNN` (verbatim, clickable, verified).
- Deterministic connection recall via shared-episode slugs (`bio.js`).

**Structural debts (the foundation work):**
1. **Facts are an unnormalized JSON blob.** `research_notes` holds *four* overlapping
   arrays — `facts`, `facts2`, `characterizations`, `episodes` — with no per-fact id, no
   provenance columns, no dedup, no cross-entity queryability. You cannot ask "which
   entities cite para_369, and does its subject match them?" — which is why the case-study
   bug was invisible.
2. **Two alias systems, unsynced, in effect one is empty.** The pipeline resolves against
   `er.aliases` (JSON); `resolveAlias()` reads the normalized `entity_aliases` table, which
   is unpopulated for these entities. One store must win (the normalized, typed one).
3. **String-keyed identity.** `entity_research` joins `graph_entities` on `canonical_name`
   (a string) — rename orphans the research, duplicates make the join ambiguous. Everything
   else is id-keyed.
4. **Verification is reactive, not a gate.** `fix-citations`, `scan-misbound-facts`,
   `fix-alias-contamination` are cleanup *after* bad data reached users. The checks they
   encode belong at write time.
5. **Search lets the LLM select and stretch evidence** (see case study residual).

## Case study — the Qurbán-‘Alí / Muṣṭafá fabrication (2026-07-07)

A search for *"Seven Martyrs of Ṭihrán who met Bahá'u'lláh"* returned **Mírzá Qurbán-‘Alí**
(an eminent Ni‘matu'lláhí *leader*, Bábí, martyred **1850**, converted by Mullá Ḥusayn) with
fabricated evidence about "cooking and eating, replied bluntly, transformed by the
conversation." Chain of failure:

1. The bare name **"Muṣṭafá"** — a *different* person (Bahá'u'lláh's roadside dervish,
   Dawn-Breakers **para_369**) — had been absorbed as an **alias** of Qurbán-‘Alí.
2. Because of the bad alias, the fact `"Muṣṭafá — dervish converted by Bahá'u'lláh"` was
   **mis-filed** under him.
3. Search grabbed that stray fact to satisfy "met Bahá'u'lláh," and the renderer
   **embroidered** it into an invented narrative.

**Lesson (drives this whole design):** identity is decided by **evidence consistency**, not
token/structural heuristics. A first attempt ("a lone single-name alias can't vouch
identity") was *wrong* — single-token **title-aliases** are legitimate and common (Navváb =
Ásíyih Khánum; Mu‘tamid = Manúchihr Khán; Quddús; Ṭáhirih). Of 6 flagged facts, only **1**
was real contamination; the rest were legit titles or transliteration variants. The true
discriminator is: *does the claim contradict the person's established profile?*
(dispensation, dates, nisba/place, role, converter). "Muṣṭafá converted by Bahá'u'lláh"
contradicts a Bábí martyred in 1850; "Navváb wife of Bahá'u'lláh" is consistent with Ásíyih
Khánum.

## Target architecture — the spine

```
entities(id, type, canonical_name_view, side, importance, era_start, era_end, ...)   -- id-keyed EVERYWHERE;
                                                                                     -- canonical name is a VIEW over aliases
entity_aliases(id, entity_id, surface, surface_norm, script_key, phonetic_key,       -- ONE alias store, typed
               kind, lang, is_display, confidence, source_para_id)   -- kind ∈ {name,title,epithet,translit}
alias_priors(surface_norm, entity_id, count)   -- self-improving P(e|m) = count(surface,entity) candidate-gen prior

relations(key, label, datatype, inverse, cardinality, ...)   -- CONTROLLED vocabulary (Wikidata-property style)

entity_claims(id, entity_id, relation, statement, proof_verbatim,
              doc_id, para_id, target_entity_id NULL,                 -- connection target is an ID, not a string
              valid_from, valid_to, asserted_at, superseded_at,       -- BI-TEMPORAL: world-time (era gate) + system-time
              source_belief, system_belief,                          -- CRMinf two layers: source-sure vs. we-judge
              rank,                                                   -- preferred | normal | deprecated (conflicts coexist)
              status,                                                 -- SUPPORTED | REFUTED | NOT-ESTABLISHED | CONTESTED
              proof_ok, subject_ok, consistency_ok,                  -- WRITE-TIME verification gates
              confidence, provenance_tier, extractor_version, claim_hash)   -- 3 orthogonal axes; hash = dedup/idempotent
claim_references(claim_id, source_doc_id, para_id, proof_verbatim, provenance_tier, retrieved_at)  -- MANY per claim
claim_evidence(claim_id, stance[support|refute], para_id, proof_verbatim, provenance_tier)         -- signed evidence

entity_relations(subject_id, object_id, relation, proof_para_id, confidence, valid_from, valid_to)  -- person↔person/work
identity_links(a_id, b_id, kind[same|probably-same|possibly-same|distinct], evidence_para_id, confidence)  -- link, don't merge
episodes(id, doc_id, slug, name, when) + episode_participants(episode_id, entity_id, role, proof_para_id)
research_notes  -- ONLY freeform, uncited working notes; never the fact-of-record

claims_best   -- MATERIALIZED projection: preferred-rank (else normal), deprecated excluded — the fast pivot surface
```

What this buys that the JSON blob cannot:
- **`target_entity_id`** — "met Bahá'u'lláh" is a claim whose target is an *id*; search
  hard-filters query-target-id == evidence-target-id. The "met the Báb ≠ met Bahá'u'lláh"
  class dies structurally.
- **`rank` + `claims_best` + multi-`claim_references`** — conflicting readings coexist (never
  deleted); the fast projection answers "the corpus's view" while the full table can
  *muster citations to exclude* a rejected reading. Corroboration is one claim, many refs.
- **Bi-temporal `valid_from/to`** — era-gating is a cheap deterministic index scan
  (dead-before/born-after excludes a candidate with no LLM call).
- **The three `_ok` flags + `claim_hash`** — verification computed once at write and
  re-checkable forever (cleanup scripts become continuous invariants); the hash makes
  re-ingest idempotent and apply/undo reversible.
- **Typed aliases (`kind`) + `script_key`/`phonetic_key` + `alias_priors`** — "Navváb"
  (title) is legitimate; a proposed `name` alias gets a stricter evidence check; matching is
  on the Arabic-script/phonetic key (not romanization); and every confirmed binding grows the
  `P(e|m)` prior — the cheapest strong candidate-generator in the literature.
- **`identity_links` (not merges)** — same/probably/possibly/distinct as evidenced, reversible
  assertions; the displayed entity is a *derived cluster*, so un-merge is free.

## The reusable heart — one **evidence comparator**

The whole lesson ("identity is decided by evidence consistency") becomes a single component,
not scattered logic. It takes two evidence sets (or a query predicate vs a candidate claim)
and returns `consistent | contradictory | insufficient` **with the axis**:

- **dispensation** (Bábí ≠ Bahá'í — a 1850 Bábí martyr can't be "converted by Bahá'u'lláh")
- **timeline / era** (died 1850 can't be at Riḍván 1863)
- **nisba / place** (Yazdí ≠ Turshízí — near-definitive)
- **role / station** (roadside dervish ≠ Ni‘matu'lláhí leader)
- **converter-chain, kinship, connection-target**

Called by **Integrate** (staged entity vs candidate → merge / split / hold), **Search**
(query predicate vs claim → qualify / reject), and **Verify** (claim vs profile → sets
`consistency_ok`). One comparator, three consumers.

**Scoring model (Fellegi-Sunter, adapted).** Each axis contributes a **signed weight**:
agreements add, contradictions subtract. Two properties from the ER literature make it
robust for our corpus:
- **Term-frequency weighting** — agreement on a *rare* name/nisba is strong evidence;
  agreement on a common one ("Khán", "Muḥammad", "Ḥusayn") is near-zero. Formalizes our
  "common honorific ≠ identifier."
- **Negative-evidence veto** — a nisba/dispensation/era contradiction carries enough negative
  weight to veto a merge regardless of how many weak positives agree (Yazdí ≠ Turshízí is
  near-definitive). This is the split half of the job that pure similarity scoring misses.

Two thresholds partition the score: **merge / HOLD / split**. The middle **HOLD** band is
the formal home of hold-ambiguous — it routes to the DeepSeek→Opus adjudication tier rather
than forcing a merge-or-create. Every decision stores its **weight breakdown** (which claims
added/subtracted) so a reviewer sees *why*, and can reverse it (merges are derived, not
destructive).

## Industry audit synthesis

We audited five disciplines that each independently solved part of this problem. The
striking result: **they converge on one architecture** — the same one this doc proposes.
Our two hardest-won practices (source-authority tiering + verbatim-proof-span-as-gate) are
things the frontier does *worse* than we already do; keep them first-class.

**The five closest prior arts (one per discipline):**
- **Digital prosopography — the FACTOID model** (King's College London; Bradley & Short;
  Prosopography of the Byzantine World, People of Medieval Scotland). *Our single closest
  precedent.* A factoid = "*a spot in a source S, at reference R, that states F about
  person P*" — it reifies **what a source asserts, not what is true**. Persons are near-empty
  identity hubs; everything known hangs off them as a typed, cited assertion. This is exactly
  our claim-as-atom, and it validates the posture that a fact with no citation isn't a fact.
- **Knowledge graphs — the Wikidata statement model.** Item → property → value, plus
  **qualifiers** (context), **references** (provenance, *multiple per statement*), and
  **rank** (preferred / normal / deprecated). Conflicting claims coexist as parallel
  statements; rank + a materialized "best" view arbitrate at read time. Never delete to
  resolve conflict.
- **Entity resolution — Fellegi-Sunter + Splink/Senzing.** Merge/split is a **weighted
  evidence vector**: each shared/contradicting attribute contributes a signed log-weight;
  two thresholds → merge / HOLD / split. **Term-frequency weighting** (a rare-name match is
  strong; "Khán"/"Muḥammad" near-zero) formalizes our "common honorific ≠ identifier."
  Merges are **derived clusters over immutable claims** (reversible, sequence-neutral).
- **Coreference / entity linking — cluster-then-link (BLINK/ReFinED/joint coref+EL).**
  Resolve a *coreference cluster* (name+title+epithet+pronoun) to *one* entity, so "the
  Master" inherits its link from a named mention in the cluster. **NIL detection → NIL
  clustering** is the collision-safe way to mint new people. Accumulate `count(surface,
  entity)` as a self-improving prior — "the cheapest, strongest single feature in the
  literature."
- **Claim/evidence stores — GraphRAG covariates + Graphiti bi-temporal + FEVER.** Store
  claims as first-class **covariates**; give edges **bi-temporal** stamps (valid-time for
  era-gating, transaction-time for audit); muster evidence with **three-lane hybrid
  retrieval** (structured IDs + BM25 spans + vectors, fused by RRF) and a **FEVER verdict
  per candidate** (SUPPORTS / REFUTES / NOT-ENOUGH-INFO, with citation) to match or exclude.

**The twelve convergent principles → our decisions:**

1. **Reify the assertion, not the fact.** `entity_claims` stores "source S asserts F about
   P," never "F is true." (factoid model, Wikidata, nanopublications)
2. **Two belief layers.** Separate *source-belief* (how sure the source is) from
   *system/scholar-belief* (how sure we are) — CRMinf's I2/I7. Implements our "source STATES
   vs. our inference" and "not established" doctrine as columns, not prose.
3. **Three orthogonal axes, never one number:** `confidence` (extraction certainty) ≠
   `provenance_tier` (source authority: GPB > DB > ROB) ≠ `rank` (editorial selection:
   preferred/normal/deprecated). (Wikidata + ER + our own tiering)
4. **Multiple references per claim.** GPB *and* Dawn-Breakers corroborating one fact = one
   claim, two references — a `claim_references` child table, not a citation column.
5. **Keep conflicting claims; never delete.** Rank + a materialized **best-rank projection**
   serve both "the corpus's answer" and "every source's claim, including the rejected one"
   (needed to *exclude* with a citation). Superseded ⇒ `deprecated`/expired, not deleted.
6. **Identity is an evidenced, defeasible, reversible assertion — link, don't merge.**
   SNAP:DRGN models same/probably/possibly/distinct as typed, rated relations between
   person-records; Senzing makes the merged entity a *derived cluster*. Both give free
   un-merge. No destructive string-match merge, ever.
7. **Merge/split by a signed evidence vector with veto.** Shared nisba/dates/kinship add
   weight; contradictions (nisba Yazdí≠Turshízí, dispensation, era) carry large **negative**
   weight that can veto any pile of weak positives. Middle band → **HOLD** (clerical-review /
   hold-ambiguous). Weight name agreement by corpus rarity.
8. **Appellations are first-class typed objects; canonical is a *view*.** Every name-string
   (incl. honorific+nisba and transliterations) is an alias row with `kind`
   (name/title/epithet/translit), a normalized **Arabic-script key**, and its own source.
   Match on the script/phonetic key; display the most-used romanization.
9. **Cluster-then-link coreference; NIL-cluster new people.** Bind whole coreference clusters
   to one entity; when nothing matches above threshold, mint a NIL id and cluster later
   unlinkable mentions to it. Never force a new person into an existing same-name entity.
10. **Bi-temporal, deterministic era-gating.** A candidate is **excluded** cheaply (no LLM)
    when an event interval lies outside a person's life/era interval (dead-before /
    born-after). Store valid-time + transaction-time.
11. **Three-lane hybrid retrieval, pivot on IDs.** Structured (entity_id, relation,
    target_id, place, era) + BM25 (proof spans, rare epithets) + vector (paraphrase), fused
    by RRF; constrain relation-verification to the **entity-pair**. Index IDs, not surface
    names.
12. **Evidence mustering = FEVER per candidate.** Structured+temporal pre-filter → per
    candidate NLI/LLM verdict over its proof span → SUPPORTS (include) / REFUTES (exclude) /
    NEI (hold), always with the citation. The LLM *judges pre-selected evidence*; it never
    selects or invents.

**Relations become a controlled vocabulary** (Wikidata properties): a typed `relations`
table enables per-relation validation (a death-year is a date; a `teacher-of` target is an
entity_id), constraint checks (≤1 birth), and fast pivots. Free-text relations kill
pivotability.

**Named anti-patterns to avoid** (all five audits agree): destructive/string-match merges;
hard `owl:sameAs` (non-defeasible, transitively contagious); one confidence scalar;
one-citation-per-claim; free-text relations; vector-only retrieval (misses epithets/rare
nouns); deleting superseded facts; transitive-closure over-merge through common-name
bridges; forcing every mention to link (no NIL path); over-normalization that collapses
distinct people; and — our own scar — a brittle "every proper noun must appear" guard on top
of the proof-span (it nuked all of ‘Abdu'l-Bahá's facts because GPB calls him "the Master").

**Sources (representative):** factoid model — Bradley & Short 2005, Pasin & Bradley 2015
(PBW, PoMS); Wikidata Help:Statements / Help:Ranking; PROV-O; nanopub.net; schema.org
ClaimReview; CIDOC-CRM + CRMinf; SNAP:DRGN; Fellegi-Sunter 1969, Splink (MoJ), Senzing,
Dedupe, Zingg; BLINK, ReFinED, GENRE/mGENRE, joint coref+EL; Microsoft GraphRAG, Zep/
Graphiti (arXiv 2501.13956), FEVER, HippoRAG, GraphCheck.

## Implementation path

**Quick wins (no migration):**
1. **Unify the alias store** — make `entity_aliases` (typed) the single source; backfill from
   `er.aliases`; `bio.js` reads it. (Closes the case-study bug class at its source.)
2. **Connection-target precision in `bio.js`** — evidence must name the queried target.
   *(Shipped 2026-07-08.)*
3. **Promote the three checks to write-time gates** in the `apply-*` scripts; run
   `scan-misbound-facts` + `fix-citations` as scheduled invariants.

**Foundational (migration — do BEFORE ROB ingest):**
4. **`entity_claims` table** — collapse the four JSON arrays into one normalized, verified,
   id-keyed store; keep `research_notes` for uncited notes only.
5. **Re-key `entity_research` ↔ `entities` on `entity_id`**, retiring the string join.
6. **Extract the evidence comparator** as a shared module used by integrate + search + verify.

Build normalized tables alongside, backfill, dual-read, cut over, then drop the JSON arrays.
