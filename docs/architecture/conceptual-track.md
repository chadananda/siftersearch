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

**1a. Shoghi Effendi's LETTERS — the foundational tier, seeded first, and ALL of them before any translation.**
The **Dispensation of Bahá'u'lláh (in *The World Order of Bahá'u'lláh*) is processed FIRST** — the **ontology
keystone** (see below). Then GPB, *The Promised Day Is Come*, *The Advent of Divine Justice*, and the full body of
his administrative + teaching guidance letters. Those letters are, abstractly, **interpretive applications of the
three cornerstone charters he was given**:
  - **teaching** → the **Tablets of the Divine Plan** ('Abdu'l-Bahá)
  - **administration** → the **Will and Testament of 'Abdu'l-Bahá**
  - **(to a lesser degree) the World Centre** → the **Tablet of Carmel** (Bahá'u'lláh)

So his letters model the *application* of those charters — which is why they must be understood as a body before
his translations.

**1b. Shoghi Effendi's TRANSLATIONS — after all his letters, and before any secondary-translator translation.**
His renderings (the Íqán, *Gleanings*, the *Hidden Words*, *Prayers and Meditations*, the *Dawn-Breakers*, the
*Epistle to the Son of the Wolf*…) are authoritative interpretation in themselves — his word-choice fixes which
sense a term carries — and **often carry the doctrinally most important passages**. They are therefore the
**canonical English** for the Manifestations' works, outranking any secondary translation of the same text.

2. **'Abdu'l-Bahá's authoritative works** — *Some Answered Questions* (authoritative for prophetic-symbol
   interpretation); the cornerstone charters his Guardianship rests on (the **Will and Testament**, the **Tablets
   of the Divine Plan**); tablets.
3. **Bahá'u'lláh** — Kitáb-i-Íqán (the *primary* doctrinal work, per GPB's ranking), Kitáb-i-Aqdas, the **Tablet of
   Carmel** (the World-Centre charter), tablets — read in Shoghi Effendi's translations where they exist.
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

## Cumulative interpretive authority — the interpretive lexicon + concept-reconcile

This is the concept-level twin of the **person seed + evidence-based reconciliation**. For people we build a
cumulative seed in authority order, then bind each mention to an entity by evidence, authority-weighted. Concepts
work the same way, one level up — the cumulative artifact is an **interpretive lexicon**: an authority-ranked,
*cited* map of *symbol / concept → its authoritative interpretation(s)*.

| Person pipeline | Concept pipeline |
|---|---|
| a name mention | a symbol/metaphor occurrence (a Biblical "cloud") |
| fuzzy candidate entities | candidate authoritative interpretations (from the lexicon) |
| evidence = place/era/role fit | evidence = the passage's *context* fit (eschatological? about recognizing a Prophet?) |
| authority-weighted binding (GPB > scholars) | authority-weighted binding (later/higher interpretation governs) |
| proof span | the cited interpretation (Íqán ¶X) + the occurrence (verse Y) |

**The lexicon is self-feeding, top-down.** The higher texts don't just sit above the chain — *they are
interpretation.* The Kitáb-i-Íqán is a sustained authoritative interpretation of clouds, water, fire, resurrection,
the "return." So **extracting concepts from the Íqán *populates* the lexicon**; *Some Answered Questions* and the
Guardian's works add and refine. The lexicon **grows top-down and is spent bottom-up** — exactly as the person seed
grows as books are processed. This is *why the top-down order is load-bearing*: it is not only "authority governs,"
it is **the lexicon must accumulate before the symbols that draw on it are extracted.** Read the Bible first and the
lexicon is empty — you get only the literal story.

**Worked example — "clouds."** Processing the Íqán yields a lexicon entry: *"Bahá'u'lláh (Íqán ¶X) interprets 'the
clouds of heaven' = that which veils people from recognizing the Manifestation — the abrogation of former laws,
human limitations, the denials of literalist clergy"* (top authority, proof-gated). Much later, processing Matthew
24 ("the Son of Man coming on the clouds of heaven"), the extractor — lexicon in its cached prefix — **recalls** that
interpretation, checks the **context** (eschatological, the advent of the awaited One — it fits), and **binds** the
occurrence to the authoritative metaphorical meaning, cited both ways. The literal cloud is kept; the conceptual
layer is *added*, attributed to Bahá'u'lláh — and the Biblical, Qur'anic, and Bahá'í occurrences of "the clouds"
connect through one concept.

**Guards (the concept-namesake discipline — same failure mode as person over-binding):**
- **Context-fit, not surface-match.** A weather "cloud," or "a cloud of witnesses," is NOT the eschatological "clouds." Local evidence overrides, exactly as "Mírzá Aḥmad the amanuensis" overrides the famous scholar.
- **Cited interpretation only.** A lexicon entry must be a *real*, proof-backed interpretation from an actual authority — never AI-invented meaning (the proof-span gate, for interpretation).
- **Literal + metaphorical are distinct, attributed layers.** Never overwrite the story; *add* the interpretive layer, labeled with its authority. A literal reader still gets the plain text.
- **"Possible," not forced — under-bind.** The metaphor should have *possible* conceptual power: the binding is a candidate the authority *opens*, surfaced when the evidence fits, left un-bound when ambiguous. Under-bind rather than mis-bind.

**New stages this implies** (the twins of `cast-seed` + `reconcile.mjs`):
1. an **interpretive-lexicon seed** — cumulative, authority-ranked, cited, in the stable cached prefix — *populated by* extracting the higher texts;
2. a **concept-reconcile** step that binds symbol-occurrences in lower texts to lexicon interpretations by evidence + authority, proof-gated, keeping literal and metaphorical as separate layers.

Most lexicon entries come from the **Manifestations themselves** (the Íqán is the single richest source of symbol
interpretations); the designated Interpreters layer on top. This is what lets a Bahá'í-centric interfaith library
read Genesis and Isaiah *in the light of* the authoritative interpretation, not merely as literal story.

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
Components to build, in authority order:
1. the **interpretive-lexicon seed** — cumulative, authority-ranked, cited (the concept twin of `cast-seed`);
2. the **concept-carrying disambiguation** variant (carries the running argument + the lexicon so concept back-references resolve);
3. **concept extraction** — concept entities + interpretation-claims (this is what *populates* the lexicon from the higher texts);
4. **concept-reconcile** — evidence-based, authority-weighted binding of symbol-occurrences to lexicon interpretations, proof-gated, literal + metaphorical kept as separate layers (the concept twin of `reconcile.mjs`).
