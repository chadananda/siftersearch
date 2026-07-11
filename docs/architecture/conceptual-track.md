# The Conceptual Track

Status: DESIGN (2026-07-11). The second of two independent pipelines; the other is the
[Historical Track](history-track.md). They share only the disambiguated text upstream and **link at the
graph** (a concept-claim references the `person`/`work` entities the Historical Track built) — no shared
logic, no shared ordering.

## Aim

**Organize doctrine** — build a concept *ontology* and lift `concept`s to first-class entities, governed
top-down by authoritative interpretation. Less "extract these facts," more "structure this teaching under
the authority that interprets it." This is deliberately separate from historical fact extraction because the
aims, ordering, and quality gates are genuinely different.

## The governing principle: authoritative interpretation, backwards-facing

Authoritative interpretation is **backwards-facing** — a later authorized figure interprets what came before,
and the latest governs. But interpretation is **not the exclusive function of the designated Interpreters**
('Abdu'l-Bahá, Shoghi Effendi). It runs through the *whole* chain, in two forms, both authoritative:

- **A Manifestation interpreting past scripture** — a *major category of revelation itself*. The Kitáb-i-Íqán is
  largely Bahá'u'lláh's authoritative reinterpretation of Qur'anic and Biblical scripture (the Day of Resurrection,
  the "return," the "seal of the prophets"); Christ reinterprets the Torah ("but I say unto you"); the Qur'án
  reinterprets Biblical narrative. The Manifestation's reading of an earlier concept *is* revelation, and it
  supersedes the earlier tradition's own reading of it.
- **A designated Interpreter interpreting the Manifestation's revelation** — 'Abdu'l-Bahá and Shoghi Effendi
  interpreting Bahá'u'lláh's writings. Shoghi Effendi, being last, governs the reading of everything below —
  **for interpretation, not station** (Bahá'u'lláh's Revelation is supreme *as Revelation*).

Both are backwards-facing, so the ordering is still top-down:

**Shoghi Effendi → 'Abdu'l-Bahá → Bahá'u'lláh → the Báb → Shaykhí → Imáms → Qur'án → Christianity → Judaism**

Each earlier layer's concepts resolve *against* the later, backwards-facing interpretation that has authority
over them. Extracting a concept from a lower layer before the layer above it is seeded = interpretively building
on sand (the concept-level equivalent of extracting entities before disambiguation). Consequence for extraction:
**interpretation is a first-class, authoritative relationship at every level** — "Bahá'u'lláh (in the Íqán)
reinterprets ⟨the Qur'anic Day of Resurrection⟩ as ⟨the advent of a new Manifestation⟩" is an authoritative
concept-claim *because a Manifestation made it*, not only when a designated Interpreter does. Many cross-tradition
concept bridges are therefore drawn by the **Manifestations themselves**, not just by the Guardian.

## Seed order (top-down by interpretive authority)

1. **Shoghi Effendi's complete works — the foundational tier, seeded first, as one tier.** Within it, the
   **Dispensation of Bahá'u'lláh (in *The World Order of Bahá'u'lláh*) is processed FIRST** — it is the
   **ontology keystone** (see below). Then GPB, *The Promised Day Is Come*, *The Advent of Divine Justice*, and
   his **translations** (his renderings fix the canonical English concept names → authority-bearing).
2. **'Abdu'l-Bahá's authoritative works** — *Some Answered Questions* (authoritative for prophetic-symbol
   interpretation), the Will and Testament, tablets.
3. **Bahá'u'lláh** — Kitáb-i-Íqán (the *primary* doctrinal work, per GPB's ranking), Kitáb-i-Aqdas, tablets.
4. **The Báb** — the Bayán, tablets.
5. **Antecedents, backward** — Shaykhí → Imáms → Qur'án → New Testament → Tanakh.

## Two things GPB + the Dispensation seed

**The Dispensation = the concept ontology (type system).** GPB gives characterizations, work-rankings, and
concept *enumerations*; but the Dispensation gives the *structure those presuppose* — the ranks and stations,
the twin Manifestations, the load-bearing **Manifestation vs authorized-Interpreter** distinction, the Covenant,
the Administrative Order. Every person/concept/work maps *into* it:
- the Báb, Bahá'u'lláh → `Manifestation`; 'Abdu'l-Bahá, Shoghi Effendi → `Interpreter` — *only gettable from the Dispensation*
- concepts ("the Covenant," "progressive revelation") get their canonical meaning fixed at the top of the chain.

**GPB = the concept skeleton, at cited-claim granularity.** GPB breaking the Íqán into *N specific assertions*
(not "the Íqán is about faith") sets the bar: concepts live at the specificity of a **cited doctrinal assertion**.
So GPB's assertions become **`entity_claims`**, each linking a `work` → a `concept` → a specific teaching,
proof-gated. **The concepts are the entities; the assertions are the claims.** No new machinery — the existing
claim/entity model applied to the `concept` type.

## Mapping outward (authority-weighted)

A concept accumulates an **authority-ranked set of developments**, radiating from the authoritative core:

```
GPB's characterization (skeleton, supreme)
  └─ the Íqán's development (primary doctrinal source — the canonical flesh)
       └─ other tablets / secondary works (weighted by GPB rank)
            └─ histories, scholarship, other-tradition antecedents (fill gaps / link, never override)
```

Retrieval and synthesis about a concept flow outward from GPB+Íqán, weighted by each source-work's GPB authority.
Cross-tradition concepts stay **distinct entities, linked** (the graph's bridge relations) — and many of those
bridges are drawn by the **Manifestations themselves**: Bahá'u'lláh's Íqán *is* an authoritative reinterpretation
of Qur'anic/Biblical concepts, so it lays down bridge after bridge (the "Day of Resurrection," the "return" of the
Imám Ḥusayn, the "seal of the prophets" → their Bahá'í meaning). The designated Interpreters (GPB) add and confirm
more. Both kinds of bridge are authoritative; a scholarly comparison is not.

## How this makes HyPE + context better (the concept-seed)

The disambiguation *context* is the carrier that per-paragraph HyPE reads. Today it carries place/era/who; for
doctrinal texts it must carry the **running concept/argument development** so a back-reference ("this Will," "the
aforementioned station") resolves standing alone. The mechanism is a **concept-seed pass** (parallel to the person
cast-seed): a first pass yields (a) the concept glossary → the stable cached prefix → richer disambiguation context
→ concept-aware HyPE, and (b) the seed of the `concept` entities. For the Bahá'í corpus the seed is *not* AI-invented
— it comes from **GPB + the Dispensation**, so concepts resolve against the authoritative enumeration, not a guess.

## Three levels of "idea," each feeding the next

| Level | Scope | Role |
|---|---|---|
| carried context (disambig) | within a work | makes the passage interpretable; feeds HyPE |
| HyPE | per paragraph | retrieval — find passages by concept |
| **concept entity** | whole corpus | the development itself, aggregated + related — the real home of "carrying ideas forward" |

## Build status

Not yet built — a deliberate separate effort. Prerequisites before any concept extraction: the Guardian's
interpretive works (Dispensation/World Order first) must be in the corpus and seeded, since they head the chain.
Next groundwork: inventory which of Shoghi Effendi's and 'Abdu'l-Bahá's authoritative works are present, then
build the concept-seed pass + concept-carrying disambiguation variant + concept reconciliation, in authority order.
