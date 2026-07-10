# 05 — The Entity Knowledge Layer

> **The RAG problem:** "Which Letters of the Living met Bahá'u'lláh, and where?" is *unanswerable*
> by nearest-neighbor search over paragraphs. No single chunk contains the answer; it lives in the
> relationships *between* people across many passages. Chunk-retrieval RAG has no model of people,
> places, or events — so it cannot reason about them. This layer builds that model, as a knowledge
> graph over **cited claims**, and it is the most principled part of the system.

This is also where the system's hardest lessons live. Getting entity resolution wrong doesn't just
degrade search — it *fabricates*, filing one person's facts under another's name. So this layer is
governed by explicit doctrine, enforced in the schema.

---

## The governing principles

Read these first; the mechanics below are their consequences.

1. **Identity is mention-anchored.** A bare name is not an entity. "A hundred Aḥmads" are a hundred
   different people who happen to share a label. The **atom of identity is the mention** — a name
   at a position, in its surrounding context. An **entity** is a *resolved cluster of mentions*. A
   **name** is just a label attached to that cluster.

2. **Name nominates, evidence binds.** A name may *suggest* which entity a mention refers to.
   Whether to actually bind (or to merge two entities, or split one) is decided by **evidence
   consistency**, never by string matching. "Mírzá Aḥmad" the amanuensis and "Mírzá Aḥmad" the
   scholar are bound apart by evidence, not joined by their identical name.

3. **Provenance or it didn't happen.** Every entity, alias, and claim carries a citation
   (`doc_id` + `para_id`) and, for claims, a **verbatim proof span** that literally occurs in the
   cited paragraph. A fact you cannot cite cannot be verified, corrected, or improved — so the
   system refuses to store it. Enforced by a write-time gate.

4. **Entities come from the source, not from research.** Entities are created **only** from
   mentions in the source text, expanded book by book in a fixed coverage order (GPB → +Dawn-Breakers
   → +Revelation of Bahá'u'lláh → …). Research and AI *enrich* existing entities (add cited facts,
   resolve identity); they **never mint** new entities from outside knowledge. A promoter that
   invents uncited names is the root cause of provenance-less data — it is retired in favor of
   rebuilding from source, which is self-correcting.

5. **Search reads the catalog; it never writes it.** Retrieval surfaces cited claims. It does not
   gather or synthesize new facts. Conflating the two is how a hallucination becomes a stored
   "fact." (A real incident: a legacy "fact" — a dervish embracing the Faith — was mis-cited to a
   paragraph that actually described a poisoning. The fix was to cut biography search off the
   contaminated fact store and onto the proof-gated claims. See §biography search.)

---

## The substrate: an append-only spine + a regenerable projection

The layer separates **what happened** (an immutable record) from **the current best view** (a
recomputed projection). This is what makes every identity decision auditable and reversible.

```
   entity_mentions_v2      entity_claims           entity_decisions
   (name@position)         (cited facts)           (append-only log:
        │                       │                   merge/split/verify/…)
        └───────────┬───────────┴───────────┬───────────┘
                    ▼                        ▼
              graph_entities  ◄──────  (projection rebuilt from the spine)
              (current view: canonical name, type, description, prominence)
                    │
              entity_lookup_keys  (transliteration-invariant recall index)
              graph_relations     (entity ↔ entity edges)
```

### `entity_mentions_v2` — the atoms

One row per mention: `doc_id`, `para_id`, `occurrence`, `surface` (the actual form, e.g.
"Bahá'u'lláh"), `surface_norm` (diacritics-stripped, case-folded). The `anchor` column is a hash of
the source location, so **re-extracting the same text yields the same stable anchor** — extraction
is idempotent. Crucially, `entity_id` is **NULL until resolved**: extractors record *that a name
occurred here*; deciding *who it is* is a separate, evidence-based step. This is principle #2 made
physical — the extractor is forbidden from binding by name.

### `entity_claims` — the cited facts

One row per claim (a "factoid"): a `relation` (born/died/wrote/witnessed/met/…), a `statement`
(prose), and the enforcement columns that make provenance non-negotiable:

- **`proof_verbatim`** — an exact quote that must occur in the cited paragraph. This *is* the
  support gate: the claim is only as good as a span you can point to.
- `doc_id` + `para_id` — where the proof lives.
- Temporal fields — `time_value`, `time_precision` (year/month/day/approximate), `time_basis`,
  `time_anchor` — so a date is explicitly a PIN or an ESTIMATE, never a silently-exact guess.
- Validation gates — `proof_ok`, `subject_ok`, `consistency_ok`, `confidence`, `rank`
  (normal/primary/secondary), `status` (supported/disputed/provisional), `provenance_tier`.

> **The proof span *is* the gate — a subtle lesson.** An earlier guard required "every proper noun
> in the statement must appear in the cited paragraph." It silently deleted *all* of ‘Abdu'l-Bahá's
> facts, because the source (*God Passes By*) calls him "the Master," not by name. The correct gate
> is that the **verbatim proof span** occurs in the paragraph — the claim's support is the quote,
> not a proper-noun checklist. This is why `proof_verbatim` exists as its own column.

### `entity_decisions` — the append-only log

Every merge, split, verify, reassign, or quarantine is a row: `kind`, `target_ids`, `evidence`,
`rationale`, `actor`, and **`actor_tier`** (3 = human > 2 = strong model > 1 = flash model >
0 = derived), plus `supersedes` links. Nothing is destructively edited. To reverse a decision you
append a superseding one. The projection is rebuilt from this log, so the graph is always a pure
function of an auditable history — and a bad merge is undoable by construction.

### `graph_entities` — the projection

The materialized current view: `canonical_name`, `entity_type` (person/place/work/group/event/
concept), `description`, mention/doc counts, `book_prominence`. Regenerated from the substrate; never
the source of truth.

- **Canonical name = the name most used**, not the longest honorific. Shoghi Effendi's simple
  usages win — "Quddús," "Ṭáhirih," "the Báb" — because simple names are learnable and memorable.
  Full honorific+nisba forms become *aliases*.

### `entity_lookup_keys` — recall, never decision

A `skeleton_key → entity` index built from names, aliases, and variants. The skeleton is
**transliteration-invariant** (consonant-skeleton / phonetic), so Ṣádiq / Sadeq / Sadiq collapse to
one key. This is candidate *recall* only — it suggests who a mention *might* be. Binding remains an
evidence decision (principle #2). This directly encodes another hard rule: **never bind or merge by
literal romanization match** — that fails on per-book transliteration, on misspellings, and
re-conflates namesakes. Fuzzy recall → candidate set → evidence adjudication.

---

## How entities get built: disambiguation-first extraction

The pipeline order ([overview](README.md)) is **DISAMBIGUATE → EXTRACT → INTEGRATE → SEARCH**, run
one book at a time in coverage order:

1. **Sequential coreference read.** A model reads the book in windows with a *carried cast*,
   capturing **every** reference to a person — name, title, epithet, role, and pronoun — not just
   surface-name occurrences. (Finding an entity's references is a coreference task, not a
   `LIKE '%name%'` scan: the keystone Quddús-martyrdom scene calls the betrayer "the Siyyid-i-Qumí,"
   not by name — a string match misses it. "We're matching strings where we need to be resolving
   people.") Every reference becomes a mention with `entity_id = NULL`.

2. **Reconcile by triangulation.** Region reconcilers bind mentions to entities by comparing
   evidence — nisba, side/allegiance, timeframe, roster co-membership — against the existing seed.
   Different nisbas mean different people (Yazdí ≠ Turshízí); a nisba mismatch is near-definitive.
   Honorifics are discriminative features and are preserved. High-confidence bindings apply
   (reversibly, via the decision log); uncertain ones are queued for review. **No merge or split is
   ever auto-applied without review.**

3. **Extract cited claims.** From the *disambiguated* text, pull factoids into `entity_claims`,
   each with its verbatim proof span. The write-time gate rejects anything unprovable.

4. **Integrate.** Reconcile claims and mentions into the projection; recompute `graph_entities`.

Because every stage writes to an append-only substrate keyed by source anchors, the whole thing is
**re-runnable and reversible** — a book can be re-ingested and the mentions/claims regenerate
deterministically.

---

## Episodes: the fix for relational questions

Per-person fact lists still can't answer "who was at Badasht together" — that's a property of an
*event*, not of any one person. So **episodes** (from the books' own scene headings) are modeled as
first-class objects with participant rosters. A connection query then becomes a **deterministic
shared-roster lookup** ("who shares an episode with Bahá'u'lláh"), not an LLM guessing over hundreds
of lines (which once dropped Ṭáhirih from the Badasht three). The acceptance test is exactly that:
Badasht returns Bahá'u'lláh, Ṭáhirih, and Quddús together.

---

## Biography search: reading the catalog

`bioSearch` (`api/lib/bio.js`) answers person/relationship questions **entirely from
`entity_claims`** — the proof-gated, cited catalog — and never from a free-form fact store:

- Characterizations and facts come from `entity_claims`, each rendered with its citation (the
  citation URL is always looked up from the `docs` table — `${source_url}?paraId=${external_para_id}`
  — never hardcoded).
- **Group/roster questions** ("Letters of the Living who met Bahá'u'lláh") resolve group membership
  via `graph_relations`, then filter by connection.
- **Connection questions** are answered by claims whose `target_entity_id` is the other party *or*
  whose proof span names the target — the deterministic broad path — with an LLM precision path for
  phrasing.
- When there is no cited evidence, it says so honestly ("not established"), rather than
  manufacturing a flattering answer. Contested points are marked, not asserted.

This is principle #5 in action: biography search *reads* the cited catalog and phrases it; it never
gathers new "facts." Cutting it over from a contaminated legacy fact store to `entity_claims` is
what eliminated a class of confident, wrong, mis-cited answers.

---

## Recreating this

1. Store **mentions** (name@position) as the atom, with `entity_id` NULL until an evidence step
   binds it. Extraction records; it never binds by name.
2. Store **claims** as cited factoids with a **verbatim proof span** that must occur in the
   paragraph; gate writes on it.
3. Keep an **append-only decision log** (with actor tiers) and rebuild the entity projection from
   it, so every merge/split is auditable and reversible.
4. Recall candidates with a transliteration-invariant skeleton index; **decide** identity by
   evidence consistency (nisba, side, time, roster), never by string match; never auto-apply
   merges/splits.
5. Model **events/episodes** with rosters so relational questions are deterministic lookups.
6. Build entities from source text only, book by book; let search *read* the catalog, never write
   it.

→ Next: [06 — Retrieval](06-retrieval.md), the life of a query — how all of this is assembled into
an answer.
