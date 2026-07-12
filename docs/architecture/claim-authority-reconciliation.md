# Claim Authority Reconciliation — consistency against the authoritative core

**Problem.** As ingestion expands past the authoritative core (God Passes By, the Central Figures'
revealed Writings, the Dispensation, Nabíl's Dawn-Breakers), it will pull in lower-authority histories,
pilgrim notes, secondary compilations, and eventually hostile / Covenant-breaker polemics. These carry
**mistakes** (honest but wrong) and **accusations** (malicious). A claim that contradicts the core, or
that makes an unsupported negative assertion about a core figure, must NOT be served as fact — it must be
identified and marked.

**Two independent axes** (do not conflate them):

| Axis | Question | Low end → | Bad-claim label |
|---|---|---|---|
| **Authority** | How *definitive* is the source? | pilgrim note, minor history | **likely-mistake** |
| **Trust** | How *honest* is the source? | polemic, Covenant-breaker text | **accusation** |

A source can be low-authority yet honest (mistake-prone) or low-trust and hostile (accusation-prone). GPB
is the apex on both. Authority follows the interpretive hierarchy — **a GPB characterization outranks every
scholar, even against strong secular consensus** (e.g. the Amír-Niẓám) — not mere recency.

## The core is the reference frame

The **authoritative core** = the highest doc-tiers (`getDocTier` tier 1: Shoghi Effendi's GPB + interpretive
letters, the Central Figures' Writings, Dawn-Breakers). Core claims are the truth against which everything
else is checked. Each claim already records its source; `provenance_tier` = the source's authority tier, and
a separate `source_trust` (new, per-source) marks hostile/low-trust origins.

## Mechanism (reuses existing columns: `status`, `rank`, `provenance_tier`, `consistency_ok`)

A **claim-consistency reconcile** stage, run after entity binding (so claims are grouped by resolved entity):

1. **Fact-slot grouping.** Group claims by slot = `entity_id · relation-family · normalized-object`, where a
   *relation-family* collapses synonyms and unites opposites into one contestable axis (allegiance:
   loyal-to ↔ betrayed; character: upright ↔ corrupt; a birthplace slot; a death slot). Claims in one slot
   are directly comparable.

2. **Adjudicate disagreeing slots (AI judgment; deterministic selection is only the retrieval-backstop).**
   Select slots that (a) hold claims from >1 authority tier, or (b) contain an adversarial/negative relation,
   or (c) come from a low-trust source. An AI judge reads the competing claims + their proofs and returns:
   consistent · complementary · **contradictory**. On contradiction the **higher-authority claim wins**.

3. **Mark, never delete** (provenance is sacred — a bare accusation is still evidence *of the accusation*):
   - core-corroborated → `status=corroborated`, `rank=preferred`
   - lower-tier claim contradicting the core → `status=superseded`, `rank=deprecated`
   - contradiction *within* comparable authority, unresolved → `status=contested`
   - negative/adversarial claim about a core-covered entity with **no** core support → `status=accusation`
   - novel claim a low-authority source makes that the core would be expected to cover but doesn't →
     `status=likely-mistake` (a.k.a. `unverified`)
   - `consistency_ok=1` only for claims that survive as servable fact.

4. **Serving filter.** Search / bio / Q&A treat only `status ∈ {supported, corroborated}` +
   `rank ∈ {preferred, normal}` as fact. `contested / accusation / likely-mistake` are withheld from
   authoritative answers (surfaced only with an explicit caveat or on request); `superseded / deprecated`
   are hidden. This is the single chokepoint that keeps malice and error out of answers.

## Malicious-source handling

Tag known-hostile sources (Covenant-breaker literature, polemics) with `source_trust=hostile` at ingest.
Claims from a hostile source **default to `accusation`** and can never reach `supported` without independent
core corroboration. This is orthogonal to authority: a hostile source is not merely "weak," it is presumed
adversarial.

## Build trigger + status

**Not yet built.** Building a contradiction detector before contradicting data exists is untestable and
risks mis-flagging good core claims. The correct trigger is **the first ingest of a sub-core / low-trust
source** — validate the stage on real dissent (a known Covenant-breaker accusation should land as
`accusation`; a pilgrim-note date error contradicting GPB should land as `likely-mistake`/`superseded`).

**Already in place:** the schema columns (`status`, `rank`, `provenance_tier`, `consistency_ok`),
`getDocTier`, the per-claim quality verifier (`scripts/entity-read/verify-claim-direction.mjs` — intra-claim
direction/assertion; this new stage is its cross-source, authority-weighted sibling), and the improvable-
architecture decision log. First build increments: (a) populate `provenance_tier` on every claim from its
source doc's tier; (b) add `source_trust`; (c) the slot-grouping + AI-adjudication stage; (d) wire the
serving filter. Related: `docs/entity-improvable-architecture.md`, quote-authority model, and the
GPB-outranks-scholars doctrine in the entity-research skill.
