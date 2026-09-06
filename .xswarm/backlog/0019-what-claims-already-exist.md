---
id: "0019"
title: Find out what encounter claims already exist before extracting anything
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: S
acceptance:
  - text: the distinct relations present in entity_claims are listed with counts
  - text: it is established whether meeting-type claims (met, visited, hosted, travelled-with, companion) already exist and how many
  - text: paragraph co-occurrence of two person entities is counted from entity_mentions_v2 — the candidate set for encounters
  - text: a written answer to "must extraction be repeated", with numbers
---

## Why this comes before 0017
Chad asked whether encounters require repeating extraction. The evidence says
probably not, or not fully — and that is cheap to confirm before spending.

**The schema already models encounters.** `entity_claims` carries
`entity_id · relation · target_entity_id · statement · proof_verbatim ·
doc_id · para_id · valid_from · valid_to · time_value · time_precision ·
time_basis · time_anchor · confidence · provenance_tier · claim_group ·
semantic_key`. That is subject–relation–object with the attesting passage,
dated with precision and basis, and grouped for cross-source merging. No
migration is needed to hold "A met B at P in T, attested by S".

**The extractor may already be emitting them.** From the project's own
`api/lib/rag/concepts/relations.js`:

> the extractor emits an OPEN vocabulary — it invents relations as the text
> warrants, and 20+ have appeared in production. The lexicon consumed a CLOSED
> whitelist of five inlined in a SQL string, and everything else was dropped
> SILENTLY.

That module classifies **concept** relations — `means`, `signifies`, `teaches`,
`ranks`. Encounter relations appear in neither list, which by the module's own
description means any that were extracted went nowhere. `met`, `visited`,
`companion` and `encounter` all appear in the codebase.

**Co-occurrence is already queryable.** `entity_mentions_v2` holds
`doc_id · para_id · entity_id`, so every paragraph mentioning two people is a
candidate encounter — available now, at no extraction cost.

## The likely answer, to be confirmed by this item
Not a repeat of ingestion, parsing or embedding — the corpus has not changed.
At most a **targeted re-analysis** of paragraphs where two or more person
entities co-occur, which is a small fraction of 6.7M paragraphs. Possibly less
than that, if meeting claims are already sitting in `entity_claims` unused.

## Why this matters beyond cost
The module warns: "Impact is not proportional to count, so \"only a few rows\"
is never the argument." Seven dropped claims previously included two the gold
standard wanted. If encounter claims are being dropped the same way, the count
will look small and matter enormously.
