---
id: "0027"
title: The concept track has no promotion stage and four spine texts un-run
state: ready
traces_to: docs/architecture/conceptual-track.md
priority: P1
size: L
acceptance:
  - text: something writes concept_entities, so promotion and linking can work at all
  - text: layer is derived per claim rather than hardcoded metaphorical
  - text: the four remaining spine texts are run
---

## Problem
From the track's own §8, verified against the tree:

1. **Nothing writes `concept_entities`.** Zero INSERT/UPDATE across every .js
   and .mjs; three readers. So entities is 0 by construction and
   `concepts/link` is dead in practice — it reads that empty table, so links can
   never be non-zero.
2. **`layer` is hardcoded `metaphorical`**, which labelled "Chicago = the first
   Bahá'í center in the Western world" a metaphor. Needs a per-claim column;
   migration 90 has none.
3. **Four spine texts un-run**: Some Answered Questions, the Kitáb-i-Íqán, the
   Kitáb-i-Aqdas, the Hidden Words — the ones carrying the Bible and Qur'án
   interpretations later texts bind against. 21307 hit its retry ceiling
   mid-hype and needs re-enqueueing.

## Note on this document
§8 warns that it has twice been wrong about its own status, once causing a
session to overwrite `lexicon.js` because it believed the extractor did not
exist. Verify against the tree, not the prose.
