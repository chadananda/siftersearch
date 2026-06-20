# Building Entities from Seed

*A PRD for extracting people, places, and works — and **every reference to them** — from a library, the right
way. If we had to start over, this is what we'd want to know first: both the why and the how.*

---

## 1. The problem

To answer *"show me everything about this person across the library,"* search must first know **who's who**:
one record per real person/place/work, holding every name it is known by. This is hard because one figure
wears many names (birth name, honorific, conferred title, spelling variants, different scripts) while different
people share a name. And the references that matter most are usually **not the name** — they are epithets,
titles, kinship, and pronouns: *"the siyyid who had deserted the fort," "his nephew," "he."* A system that
matches only names finds a fraction of the passages and confuses look-alikes.

LLMs make this *look* easy and get it *structurally* wrong. Ask one to "extract entities" and it emits a row
per phrase — "his companions," "the believers," "that little band" — shattering each person into a fog of
strangers. The graph fragments before it can hold its shape.

## 2. The core idea: seed first, then resolve

Do not turn a program loose on ten thousand books at once. Build a **seed** first — a small, dense,
hand-verified core of the central figures/places/works, each with its canonical name, all its aliases, and
explicit notes that keep look-alikes apart. Then process every later book by **resolving its references
against the seed**, never re-deriving records from scratch. The index grows by accumulation; it does not
fragment.

> Get the seed right and every later book inherits a clean foundation. Get it wrong and every later book
> inherits the mistake. That asymmetry is the whole reason the seed is kept small and verified by hand.

## 3. Why *God Passes By* is the seed

Shoghi Effendi's 1944 history of the Faith's first century is the right nucleus on two reinforcing grounds:

- **Technical.** One careful, consistent transliteration system (a reliable canonical spelling onto which all
  variants map); spare, high-signal prose where every name is deliberate; one hand-checkable volume spanning
  the whole century — the backbone of the index from a single book.
- **Doctrinal.** Its author was the Faith's **authorized interpreter** — empowered to state authoritatively
  what figures and events *mean* and how they rank. So its judgments of significance and role are not one
  historian's opinion; within the Faith they are the settled reading.

### Two axes: facts vs. meaning

| Axis | The question | Who is trusted |
|---|---|---|
| **Identification** | Who is this? What dates? Which work is meant? | Primary documents and careful historians — reliable for facts. |
| **Characterization** | How significant? What role? How is an act framed? | *God Passes By* is primary — above later scholarship and more detailed histories. |

The characterization rule is narrow, not a claim that an interpreter outranks scripture (the revealed Word is
supreme *as revelation*). It says only that **interpreting** — explaining what elements mean and how they rank
— was the authorized role, so for that purpose his reading governs. Two consequences: a **later** authorized
interpretation supersedes an earlier one; and **translation is interpretation** — an authorized translator's
word choice fixes which sense an ambiguous term carries ("Bayán" can mean a specific book, the Báb's whole
Revelation, His community, or simply "utterance" — the translation, not a guess, decides).

## 4. Build order (the skyscraper)

Built from the ground down; each layer laid only once the one beneath is solid; the deeper it sits, the more
weight it bears, so the more it is verified by hand.

- **Footer — *God Passes By*.** Extracted in full, then every significant entity confirmed by hand: correct
  name, every alias/spelling, the book's exact wording, family and allegiance, explicit look-alike notes.
- **Slab — *The Dawn-Breakers*.** Nabíl's detailed narrative of the same early period, resolved onto the
  footer. Footer + slab are *the foundation* — a small share of all names but the **key** ones nearly every
  later book collides with — so the slab earns the same hand-verification, not a lighter pass.
- **First floor — Taherzadeh, Balyuzi, Mázandarání** (incl. Arabic/Persian-script works), resolved against the
  foundation rather than re-derived. **Then Momen and contemporary-account scholarship.**
- **Tower — the remaining thousands of documents**, each rising on the verified structure beneath, resolving
  against it instead of fragmenting into duplicates.

## 5. How extraction actually works (the mechanics)

Two engines, each to its strength: **a cheap bulk reader** captures every reference; **a judgment reconciler**
decides identity. Concretely:

### 5.1 Read — sequential, windowed, with a carried cast
Read the book **in reading order, paragraph by paragraph**, in overlapping **windows** of ~N paragraphs. Each
window call is given (a) the window's paragraphs and (b) a **running cast** — the people established so far,
each as `{stable label, description (who + distinguishing attributes), every surface form seen}`.

The reader returns, **for every referring expression in every paragraph**:
`{paragraph, exact span, cast label, type = name|title|epithet|role|kinship|pronoun, reason}` — and **updates
the cast** (new people, new surface forms). Pronouns and epithets are resolved *within the window* against the
cast: "he" → whoever the cast has on stage; "the deserter" → the cast member whose description records the
desertion.

**Why windowed + carried cast.** Coreference is book-spanning — the antecedent of "the Siyyid-i-Qumí who
deserted the fort" sits a chapter earlier. The model cannot hold the whole book in context, so the cast is the
**compressed memory** that travels with the reading head: not the raw earlier text, but the distilled *who is
on stage and what is known about them*. That is what lets a small-context reader do book-length coreference —
the way a person reads, carrying a mental roster instead of re-reading from page one each sentence.

**Completeness is non-negotiable.** The unit is the paragraph and the question is always "who is referred to
here," so nothing is skipped for lacking a name token. Windows that overflow the model's output are split
smaller, partial output is salvaged, and coverage is driven to 100% (every paragraph accounted for).

### 5.2 Resolve identity — triangulation, not matching
The reader's per-window labels are **provisional** — the same person is relabeled across windows ("Mírzá
Ḥusayn-i-Mutavallí" in one, "the Siyyid-i-Qumí" in another). The reconciler unifies them and binds each to a
**seed entity by triangulation**: a reference is fixed by the **conjunction of its attributes** — name,
nisba/origin, role, kinship, deeds, period. When the attributes uniquely determine one person, the
identification is **certain even when the surface name shares no letters** with the canonical record. Identity
across the book unifies *through the seed entity* — two passages that bind to the same record are the same
person, automatically.

This is the rule everything rests on: **resolve identity by reading and reasoning, NEVER by string/name
matching.** String matching fails in both directions — it *drops* epithet/pronoun references it cannot see,
and it *wrongly merges* namesakes. Flag "ambiguous" only when the same attributes genuinely fit more than one
person (two different men both "Mullá Báqir," separable only by nisba) — never force a namesake.

### 5.3 Apply — reversibly, additively, never destructively
Attach each resolved reference as a mention link on the seed entity, **tagged with a batch version so the
whole pass reverses with a single delete**. Additive only — existing links are never rewritten. **Never
auto-create a new person or auto-merge a duplicate**: route every new-person candidate, every ambiguity, and
every suspected duplicate to a **human review queue**. A wrong merge (two people into one) or a wrong split
(one person across several) does not stay contained — it spreads into every book that later resolves against
the seed.

### 5.4 Enrich — grounded, then calibrated
For each entity, read its **dossier** — every mention's full text across the corpus, not a snippet — and write
a faithful 2–4 sentence summary (who + true role; if a martyr, say so with when/where). Canonical name = the
**most-used** form (the full honorific+nisba form becomes an alias). Score **importance 1–100** by judgment
against a rubric, not a formula. Because independent passes drift, follow with a **single-judge calibration**
over the top tier with the whole list in view, and sweep rubric-anchored *categories* (e.g. the Letters of the
Living, who sit at foremost-hero weight) as a group.

### 5.5 Division of labour
The bulk **reading** is done by a cheap, large-context model (DeepSeek in *non-thinking* mode — its reasoning
modes silently spend the whole output budget on hidden thinking and return empty JSON). The **identity
judgment** — triangulation, namesake calls, duplicate discovery, verification — is done by the stronger model
(Claude). Reading is volume; reconciliation is judgment.

## 6. Verification standards (the seed especially)

- **Pin look-alikes explicitly.** The cast is full of collisions — several men named Mullá Ḥusayn; three
  officials called Ḥusayn Khán; the title "Gate of the Gate" belongs to one disciple, not to the Báb. Each is
  recorded as a rule later books carry forward.
- **Quote, don't paraphrase.** A characterization is stored in the book's own words, with its location — never
  silently invented or pinned on the wrong source (a sentence that names B while describing A via "this Book"
  or a pronoun must be filed under A).
- **Check absence, don't assume it.** Because spelling varies, a careless search misses text that is really
  there; a passage is hunted thoroughly before it is called missing. A false "not found" is as damaging as a
  fabrication.
- **Keep nuance.** The source is even-handed even toward antagonists; preserve that instead of flattening a
  figure into a label (a Grand Vizier who *freed* the Founder is not "an enemy").

## 7. Pitfalls we hit (each now a fix)

- **Keyword/name matching fails both ways** → resolve by reading + triangulation (§5.2).
- **Shallow summaries** from snippets/web mislabel figures → ground every summary in the full dossier (§5.4).
- **Fan-out scoring drifts** across independent agents → single-judge calibration + category sweep (§5.4).
- **Coreference is book-spanning** → carried cast in the reader; global unification in the reconciler.
- **Reasoning models emit empty JSON** (budget eaten by hidden thinking) → use the non-thinking model.
- **Dense roster paragraphs overflow** the output → shrink the window, salvage partial JSON, gap-fill to 100%.
- **No request timeout** → calls hang forever under concurrency → hard timeout + retry.
- **A name-query misses a major figure** on a diacritic/apostrophe form → normalized re-check before queueing.

## 8. Status

Footer in: *God Passes By* extracted and verified. Slab read end-to-end: *The Dawn-Breakers* — every paragraph
read in order, ~20,500 references captured, the high-confidence links applied (reversibly), with new people and
duplicate-merges sitting in a review queue. The tower rises next.

*See also: [Entity-Aware Search](/docs/entity-search) (how names resolve at query time) and
[Indexing Layers](/docs/indexing-layers) (how the same pass powers retrieval).*
