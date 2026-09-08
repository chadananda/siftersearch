---
id: "0041"
title: Anis needs direct tool access — the API exposes result shapes, not retrieval methods
state: ready
priority: P0
size: L
depends_on: ["0040"]
acceptance:
  - text: chat can reach every tool, and the battery proves which tool answered
  - text: retrieval method is selectable — keyword, semantic, HyPE — not only result shape
  - text: entity search covers persons, works, concepts and episodes
  - text: the battery in tests/anis/battery.yaml runs in CI and gaps stay visible as failures
---

## What Chad asked for
2026-09-08: "we need to make sure the Anis search api supports chat (all tools).
As well as direct access to tools: library / kw search / AI search (hype,
semantic) / entity search (persons, documents, episodes, concepts). A battery of
search examples should be developed to prove the effectiveness of all tools and
chat response formats."

## What the API actually offers, measured
`POST /api/v1/tools/search` takes `mode`, and the enum is:

    passages | documents | count | read

**Those are RESULT SHAPES, not retrieval methods.** There is no way to ask for
keyword vs semantic vs HyPE — the strategy is fixed and internal. So "direct
access to kw search / AI search" is not supported today.

`GET /api/v1/tools/library` takes **no parameters at all** — the agent-facing
library tool cannot filter by religion, collection, author or language, though
`/api/v1/library/documents` can.

## The four tool families and their state

    library      works. Authorship answers from metadata. BUT year=0 corpus-wide,
                 so dates must fall through to passages, and the agent-facing
                 tool takes no filters.
    search       works well on natural queries; poor on keyword-stuffed ones.
                 Result shapes only; no method selection.
    entities     persons BROKEN by diacritics and unranked importance; works
                 indexed under ONE designation; a near-miss returns a confident
                 WRONG match ("Iqan" → "Iqani", a person).
    episodes     DO NOT EXIST. See 0037.

## The battery
`tests/anis/battery.yaml` — 27 cases across library, search shapes, retrieval
methods, entity persons/works/concepts/episodes, chat, and response format.

Six marked `gap` (capability absent) and six `fail` (exists and is broken). Those
twelve are written to fail on purpose. **Do not delete them to go green** — a
green suite that dropped its hard cases is how recall silently disappears, which
is the lesson of 0036.

Response-format cases matter as much as retrieval: citation URLs must not be
swapped between quotes (jafar-pipeline already warns about this), the source
title must match what was actually retrieved, and the answer must distinguish
"the archive does not say" from "this did not happen".

## Why P0
Anis is the product being shipped. The battery is what makes iterative
improvement measurable rather than anecdotal — right now every judgement about
search quality, including two wrong ones I made on 2026-09-07, comes from ad-hoc
probing of a single endpoint.
