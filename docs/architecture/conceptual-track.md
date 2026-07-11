# The Conceptual Track

Status: DESIGN (2026-07-11). The second of two independent pipelines; the other is the
[Historical Track](history-track.md). They share only the disambiguated text upstream and **link at the
graph** (a concept-claim references the `person`/`work` entities the Historical Track built) — no shared
logic, no shared ordering.

## 1. Aim

**Organize doctrine** — build a concept *ontology* and lift `concept`s to first-class entities, governed
top-down by authoritative interpretation. Less "extract these facts," more "structure this teaching under the
authority that interprets it." Kept separate from historical fact-extraction because the aims, ordering, and
quality gates are genuinely different.

## 2. The governing principle: authoritative interpretation, backwards-facing

Authoritative interpretation is **backwards-facing** — a later authorized figure interprets what came before,
and the latest governs. But interpretation is **not the exclusive function of the designated Interpreters**
('Abdu'l-Bahá, Shoghi Effendi). It runs through the *whole* chain, in two forms, both authoritative:

- **A Manifestation interpreting past scripture** — itself a major category of revelation. The Kitáb-i-Íqán is
  largely Bahá'u'lláh's authoritative reinterpretation of Qur'anic and Biblical scripture (the Day of
  Resurrection, the "return," the "seal of the prophets"); Christ reinterprets the Torah ("but I say unto you").
  The Manifestation's reading supersedes the earlier tradition's own.
- **A designated Interpreter interpreting the Manifestation's revelation** — Shoghi Effendi, being last, governs
  the reading of everything below — **for interpretation, not station** (Bahá'u'lláh's Revelation is supreme
  *as Revelation*; interpreting it was the Guardian's designated function).

This is why authority — and therefore the seed — runs top-down.

## 3. The seed: cumulative interpretive authority (the interpretive lexicon)

The conceptual track's engine is the concept-level twin of the **person seed + evidence-based reconciliation**.
For people we build a cumulative seed in authority order, then bind each mention to an entity by evidence,
authority-weighted. Concepts work the same way, one level up. The cumulative artifact is an **interpretive
lexicon**: an authority-ranked, *cited* map of *symbol / concept → its authoritative interpretation(s)*.

| Person pipeline | Concept pipeline |
|---|---|
| a name mention | a symbol/metaphor occurrence (a Biblical "cloud") |
| fuzzy candidate entities | candidate authoritative interpretations (from the lexicon) |
| evidence = place/era/role fit | evidence = the passage's *context* fit (eschatological? about recognizing a Prophet?) |
| authority-weighted binding (GPB > scholars) | authority-weighted binding (later/higher interpretation governs) |
| proof span | the cited interpretation (Íqán ¶X) + the occurrence (verse Y) |

**The lexicon is self-feeding.** The higher texts don't just sit above the chain — *they are interpretation.*
The Íqán is a sustained authoritative interpretation of clouds, water, fire, resurrection, the "return." So
**extracting concepts from the higher texts *populates* the lexicon**; the lower texts then bind their symbols to
it. The lexicon **grows top-down and is spent bottom-up** — exactly as the person seed grows as books are
processed. **This is why the seed order below is load-bearing:** the lexicon must accumulate *before* the symbols
that draw on it are extracted. Read the Bible first and the lexicon is empty — you get only the literal story.

## 4. The seed order (top-down by interpretive authority)

The order exists to build the lexicon correctly — highest authority first, so every lower layer resolves against
the interpretation that governs it. Priorities beyond this doctrinal spine (the histories, other traditions at
scale) are set in `api/lib/pipeline/profile.js`.

**Shoghi Effendi → 'Abdu'l-Bahá → Bahá'u'lláh → the Báb → Shaykhí → Imáms → Qur'án → New Testament → Tanakh**

**1. Shoghi Effendi — the foundational tier. His own works, in this internal order, ALL before any translation:**
   1. **God Passes By** — his only *book*: the comprehensive narrative + the person-seed + the **concept
      skeleton** (its breakdown of a work into specific cited assertions) + the work-rankings.
   2. **The Dispensation of Bahá'u'lláh** — his *testament* (in *The World Order of Bahá'u'lláh*): the **ontology
      keystone** — the Manifestation-vs-Interpreter distinction, the stations, the Covenant, the Administrative Order.
   3. **The general letters** — *The Advent of Divine Justice*, *The Promised Day Is Come*, the rest of *The World
      Order of Bahá'u'lláh*, etc.
   4. **All his other letters** — the broader body of administrative + teaching guidance.
   5. **His translations** — the Íqán, *Gleanings*, the *Hidden Words*, *Prayers and Meditations*, the
      *Dawn-Breakers*, the *Epistle to the Son of the Wolf*… His renderings are authoritative interpretation in
      themselves (his word-choice fixes which sense a term carries) and **carry the doctrinally most important
      passages** — so they are the **canonical English** for the Manifestations' works, before any secondary translation.

   His letters (3–4) are, abstractly, **interpretive applications of the three cornerstone charters he was given**:
   teaching → the **Tablets of the Divine Plan** ('Abdu'l-Bahá); administration → the **Will and Testament of
   'Abdu'l-Bahá**; the World Centre (to a lesser degree) → the **Tablet of Carmel** (Bahá'u'lláh).

**2. 'Abdu'l-Bahá's authoritative works** — *Some Answered Questions* (authoritative for prophetic-symbol
   interpretation); the cornerstone charters his Guardianship rests on (the **Will and Testament**, the **Tablets
   of the Divine Plan**); tablets.

**3. Bahá'u'lláh** — the **Kitáb-i-Íqán** (the *primary* doctrinal work, per GPB's ranking, and the single richest
   source of symbol interpretations), the Kitáb-i-Aqdas, the **Tablet of Carmel**, tablets — read in Shoghi
   Effendi's translations where they exist.

**4. The Báb** — the Bayán, tablets.  **5. Antecedents, backward** — Shaykhí → Imáms → Qur'án → New Testament → Tanakh.

Extracting a concept from a lower layer before the layer above it is seeded = interpretively building on sand —
the concept-level equivalent of extracting entities before disambiguation.

## 5. What the top of the chain provides

- **The Dispensation = the ontology (type system).** It gives the structure the rest presupposes; every
  person/concept/work maps *into* it: the Báb, Bahá'u'lláh → `Manifestation`; 'Abdu'l-Bahá, Shoghi Effendi →
  `Interpreter` (only gettable from the Dispensation); concepts get their canonical meaning fixed at the top.
- **GPB = the concept skeleton, at cited-claim granularity.** GPB breaking the Íqán into *N specific assertions*
  (not "the Íqán is about faith") sets the bar: concepts live at the specificity of a **cited doctrinal
  assertion**. Those assertions become **`entity_claims`**, each linking a `work` → a `concept` → a specific
  teaching, proof-gated. **The concepts are the entities; the assertions are the claims** — the existing
  claim/entity model applied to the `concept` type.

## 6. Binding the lower texts: concept-reconcile

The lexicon is *spent* here — the twin of `reconcile.mjs`. A symbol/metaphor occurrence in a lower text is
bound to its authoritative meaning by evidence + authority, proof-gated.

**Worked example — "clouds."** Extracting the Íqán yields a lexicon entry: *"Bahá'u'lláh (Íqán ¶X) interprets
'the clouds of heaven' = that which veils people from recognizing the Manifestation — the abrogation of former
laws, human limitations, the denials of literalist clergy"* (top authority, proof-gated). Much later, processing
Matthew 24 ("the Son of Man coming on the clouds of heaven"), the extractor — lexicon in its cached prefix —
**recalls** that interpretation, checks the **context** (eschatological, the advent of the awaited One — it fits),
and **binds** the occurrence to the authoritative metaphorical meaning, cited both ways. The literal cloud is
kept; the conceptual layer is *added*, attributed to Bahá'u'lláh — and the Biblical, Qur'anic, and Bahá'í
occurrences of "the clouds" connect through one concept.

A concept accumulates an **authority-ranked set of developments**, radiating from the authoritative core (GPB's
characterization → the Íqán's development → other tablets → secondary works → antecedents, each weighted by
source authority; lower ones fill gaps and link, never override). Cross-tradition concepts stay **distinct
entities, linked** — and many bridges are drawn by the **Manifestations themselves** (the Íqán *is* a
reinterpretation of Qur'anic/Biblical concepts). Both kinds of bridge are authoritative; a scholarly comparison is not.

**Guards (the concept-namesake discipline — same failure mode as person over-binding):**
- **Context-fit, not surface-match.** A weather "cloud," or "a cloud of witnesses," is NOT the eschatological "clouds." Local evidence overrides.
- **Cited interpretation only.** A lexicon entry must be a *real*, proof-backed interpretation from an actual authority — never AI-invented meaning.
- **Literal + metaphorical are distinct, attributed layers.** Never overwrite the story; *add* the interpretive layer, labeled with its authority.
- **"Possible," not forced — under-bind.** The metaphor should have *possible* conceptual power: bind only when the evidence fits; leave un-bound when ambiguous.

## 7. Feeding disambiguation + HyPE

The same lexicon, sliced per work, is the **concept-seed** that flows into the earlier stages. The disambiguation
*context* is the carrier per-paragraph HyPE reads; for doctrinal texts it must carry the running concept/argument
development so a back-reference ("this Will," "the aforementioned station") resolves standing alone. So there are
three levels of the *same* idea, each feeding the next:

| Level | Scope | Role |
|---|---|---|
| carried context (disambiguation) | within a work | makes the passage interpretable; feeds HyPE |
| HyPE | per paragraph | retrieval — find passages by concept |
| **concept entity + lexicon** | whole corpus | the development itself, aggregated + authoritatively interpreted |

Because the seed comes from GPB + the Dispensation + the Íqán, concepts resolve against the *authoritative*
enumeration, not an AI guess.

## 8. Build status

Not yet built — a deliberate separate effort. Prerequisite: the Guardian's works (in the §4 internal order) must
be in the corpus and seeded, since they head the chain. Components, in authority order:
1. the **interpretive-lexicon seed** — cumulative, authority-ranked, cited (the concept twin of `cast-seed`);
2. the **concept-carrying disambiguation** variant (carries the running argument + the lexicon);
3. **concept extraction** — concept entities + interpretation-claims (this *populates* the lexicon from the higher texts);
4. **concept-reconcile** — evidence-based, authority-weighted binding of symbol-occurrences to lexicon
   interpretations, proof-gated, literal + metaphorical kept as separate layers (the twin of `reconcile.mjs`).
