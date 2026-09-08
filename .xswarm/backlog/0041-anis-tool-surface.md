---
id: "0041"
title: Complete the OpenAPI tool surface — it is the prerequisite for testing anything
state: ready
priority: P0
size: L
acceptance:
  - text: every tool Anis can use is callable directly and documented in the OpenAPI spec
  - text: retrieval method is selectable — keyword, semantic (HyPE inside it), hybrid
  - text: the library tool filters by religion, collection, author, language, document
  - text: entity search covers persons, works, concepts and episodes
  - text: the librarian has CRUD — create, update, merge, correct, delete — with no raw SQL path
  - text: tests/anis/battery.yaml runs end to end, with gaps failing rather than absent
---

## The ordering error this item corrects
Chad, 2026-09-08: "If we don't have direct tool access, how do we test? And I've
specified from the beginning that we should have OpenAPI access to all search
tools. And the librarian should have additional CRUD tools."

A battery was written first, against capabilities that have no endpoint. Six of
its cases are documentation, not tests — they can never run. **The surface comes
first; the battery is downstream of it.** Requiring OpenAPI access to every tool
was a standing requirement, not a new one.

## Measured state, 2026-09-08

**Retrieval methods are not selectable.** `POST /api/v1/tools/search` takes
`mode`, and the enum is `passages | documents | count | read` — RESULT SHAPES.
The strategy underneath is fixed and internal.

**The agent-facing library tool takes no parameters at all.** `GET
/api/v1/tools/library` has zero query params, though `/api/v1/library/documents`
supports q, author, religion, collection, language, limit, offset. The agent has
the worse tool.

**There is no librarian CRUD.** Of 35 write endpoints, 22 are admin and exactly
two touch library content — `PATCH /admin/deep-research/{id}/content` (unrelated)
and `POST /entities/resolve` (a lookup). Nothing creates, edits, merges or
corrects a document, a paragraph, or an entity.

That is why agents reach for SQL. The standing rule — never mutate app data with
raw SQL, extend the admin API instead — was written after a blind `UPDATE`
clobbered a draft. The rule exists; the API that would let anyone obey it does not.

## What to build

**1. Retrieval methods, selectable.** Two plus their fusion — HyPE lives inside
semantic, not beside it:

    keyword    lexical/BM25 — exact names, phrases, rare terms
    semantic   vector, with HyPE — question-shaped queries
    hybrid     the fusion; should be the default and should beat either alone

Keep the existing `mode` for result shape; add `method` for retrieval. They are
orthogonal and conflating them is what produced the current confusion.

**2. The library tool gets the filters `/library/documents` already has.**

**3. Entity search across all four types** — persons, works, concepts, episodes.
Episodes do not exist yet (0037); expose the type so the battery fails loudly
rather than silently omitting it.

**4. Librarian CRUD**, and this is the half that unblocks everything else:

    documents   create, update metadata, soft-delete, restore
    content     edit a paragraph, re-segment, correct OCR
    entities    create, merge two into one, split, correct a designation,
                set canonical name, add alias
    provenance  every write records who and why — this corpus is a scholarly
                record and an unattributed edit is a defect

Entity merge and alias-add are the operations that fix 0038's fragmentation
(Mullá Ṣádiq exists as four entities; the Íqán is indexed under one designation).
Without them the only remedy is SQL, which is forbidden for good reason.

**5. All of it in the published OpenAPI spec** at `/api/v1/docs/json`, so both
Anis and the battery discover tools rather than hardcoding them.

## Then the battery
`tests/anis/battery.yaml` — 29 cases across library, search shapes, retrieval
methods, entity types, chat, and response format. It becomes runnable once the
surface exists. Cases marked `gap` and `fail` are written to fail on purpose;
deleting them to go green is how recall silently disappears (0036).

## Why P0
Everything else about Anis is unmeasurable until the tools are directly callable.
Two wrong conclusions about search quality were drawn on 2026-09-07 from ad-hoc
probing of a single endpoint — that is what testing looks like without this.
