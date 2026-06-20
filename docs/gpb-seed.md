# The GPB Seed

> The canonical authority spine of the entity graph, extracted from **God Passes By** (Shoghi Effendi, 1944).
> Why this book is the seed: [divine-entity-seed.md](divine-entity-seed.md). How seeds are built and grown:
> [building-entities-from-seed.md](building-entities-from-seed.md). This document is the reference for the
> seed *as it currently stands*.

---

## What it is

The GPB seed is the small, authoritative, hand-verified set of canonical entities that God Passes By names
into their proper places. It is **the spine every later book resolves against** — not a census but a *correct*
core: every name on it is named the way the Faith itself names it, every relationship stated the way the Faith
states it. Completeness is what later works supply; the seed supplies authority.

- **Source document:** `docs.id = 21310` ("God Passes By"). This is the canonical full text. (The corpus also
  holds study guides, reviews, page-chunk imports `343xxx`, and translations of its French passages — the seed
  is built from **21310 only**.)
- **Authority status:** GPB is doctrine, not secondary literature — written by the Guardian in his interpretive
  capacity, from a station now permanently closed. Its identifications, document listings, significance signals,
  and prophetic bridges are authoritative determinations. The seed inherits that authority. (See the vision essay.)

---

## Current state (live counts)

Entities currently sourced from GPB (have at least one mention in doc 21310):

| Type   | In GPB seed | Total in graph (all books) |
|--------|-------------|----------------------------|
| person | 563         | 1,271                      |
| place  | 575         | 688                        |
| work   | 123         | 195                        |
| group  | 106         | 135                        |

The "total" column exceeds the seed because later books (chiefly The Dawn-Breakers) resolved against the seed
and added new entities and cross-references. The seed proper is the ~1,367 GPB-named canonical entities; the
review page (`/admin/entities`) tags each entity `[GPB]` vs. the book that introduced it.

**Status:** review-ready. Full book gathered and chapter-mapped; persons deduped and enriched (dossier-grounded
summaries, most-used canonical names, importance scores calibrated against the rubric). The Letters of the
Living are seated at foremost-hero weight; the central figures, kings of the Tablets, and principal opponents
are all present with their relationships.

---

## The five dimensions it encodes

GPB is not a name list with a story attached — it is an authoritative interpretation on five interlocking
dimensions, all extracted into the seed (detail in [divine-entity-seed.md](divine-entity-seed.md)):

1. **People** — canonical names, titles, relationships, roles, and *significance* (importance priors).
2. **Documents** — the major works, with addressees, composition periods, and relative weight.
3. **Doctrines** — named concepts in their authoritative meanings and relations.
4. **Episodes & periods** — theologically bounded epochs and the episodes within them, used to place
   undated events ("during the Adrianople period…") into known date ranges.
5. **Prophetic bridges** — authoritative edges from Bahá'í figures to figures of earlier traditions
   (Bahá'u'lláh as the Promised One of Isaiah, the Báb as the Shíʿí Mahdí), pre-specified for cross-tradition linking.

---

## How it was built

(General method: [building-entities-from-seed.md](building-entities-from-seed.md) §2. GPB-specific:)

- **Gathered by periods**, in reading order, over the whole book — not cold-extracted name-by-name.
- **Canonical name = the name most commonly used** (Quddús, Ṭáhirih, the Báb), with the full honorific+nisba
  form kept as an alias.
- **Chapter-mapped**: each entity is placed in the GPB chapter where it is first introduced, so the review
  page can present the seed in the book's own structure.
- **Deduped by reading, never by keyword** — AI adjudication reads identity (commentary ≠ source,
  name-coincidence ≠ duplicate); namesakes are kept apart by context (nisba, side, timeframe, kinship).
- **Enriched from the dossier** (the entity's full cross-corpus mention text), not from snippets — faithful
  summaries (who + role, martyrdom stated), importance by rubric, then a single-judge calibration pass to
  reconcile cross-batch drift.

---

## How later books attach to it

The seed is the fixed point. Each subsequent book is **resolved against it**, never re-seeded first:

- A roster export (canonical + aliases) is given to the read pipeline so known figures attach to the existing
  seed entity rather than spawning a transliteration duplicate.
- The sequential-read pipeline ([building-entities-from-seed.md](building-entities-from-seed.md) §3–§5) reads
  the new book, captures every reference, and binds each — by triangulation — to a seed entity, or queues a
  genuinely-new person for review.
- The Dawn-Breakers has been read this way (2026-06-19): its obscure figures, named by regional epithet or
  kinship, resolve onto the GPB spine; new Bábí-period figures were added beneath it.

The order is doctrine, not preference: **GPB is the seed of authority and is built first; The Dawn-Breakers and
all later works come after and resolve against the verified seed.** Do not start a later book before the seed
it depends on is right.

---

## Where it lives / how to inspect

- **Data:** `entity_research` (canonical record, summary, importance, aliases) + `graph_entities` (graph node)
  in `data/sifter.db`; mentions in `data/graph.db` `entity_mentions`.
- **Review page:** `/admin/entities` (admin-auth SSR; per-type tabs, per-chapter sections, `[GPB]` badges,
  importance-sorted). Direct: `/api/admin/entity-review`.
- **Seed/enrich/dedup tools:** `scripts/one-off/entity-seed/`.

---

## Pending / known follow-ups

- Alias / kinship / date research for the new Dawn-Breakers figures (the seed got this; DB figures partly deferred).
- The duplicate-merge candidates and new-person queue surfaced by the Dawn-Breakers read
  (`tmp/entity-research/seqread/FINDINGS.md`) — await per-item review before applying to the seed.
- Semantic/coreference entity *search* over the seed is still future work (the entity index is name-only today).

---

*— SifterSearch entity extraction project. Update the counts and status as the seed evolves.*
