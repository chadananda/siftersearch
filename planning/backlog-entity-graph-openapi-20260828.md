# Backlog — entity graph + OpenAPI + connector blurb (2026-08-28)

Source: Study Assistant, filed by SifterSearch PM after Chad pasted the comments.
Not a bot complaint. Agents cannot use person/event/group lookup because the contract is invisible.

Do this **before** disambiguation/bulk extract. HyPE v12 SAQ measure is written up
(`planning/hype-v12-measurement-20260827.md`); this is the next product-facing gap.

## Three-line cheat sheet (put this at the top of the public docs / connector)

1. Look up the event (`entities/lookup` or `entities/search`).
2. Look up the group (`entities/lookup` or `people/search`).
3. List the edges (`relation` on evidence: `participated-in`, `visited`, …).
Passage search (`sifter_search` / `sifter_search_quick`) is for **citation**, not for building the list.

## 1. Fill the OpenAPI

`@fastify/swagger` is registered in `api/server.js`. `api/routes/people.js` handlers have **no schema**,
so `/people` and `/entities` show no parameters and `Default Response`. Agents guess.

Document at least:

- `q`
- `relation`
- `evidence.statement`
- `source`
- `paraId`

Plus one worked example:

> Letters of the Living ∩ `participated-in` Badasht Conference

TDD: a contract test that the served OpenAPI for these routes lists those query/response fields
and includes that example. Fail first, then add Fastify schema on the routes.

## 2. Spell out the graph in one picture

Nodes: **person, group, event, place**.

Say **where the edges actually live** (claims/evidence vs the node document). Today
`GET /api/v1/entities/{id}` on Badasht Conference returns nothing, so the event looks unused.

**Product decision (PM + BA + Tester, 2026-08-28):** participants belong on the event node.
`GET /entities/{id}` must list them. A documented stub is the fallback only if this pass
cannot assemble them — not the product, and Tester will fail an empty GET that only says "stub."

Missing `object_id` is not "no participants." Event participation is mostly prose claims
(Badasht: participated-in / visited exist; ~99% lack a structured object). Resolve people
from those claims and put them on the node. Proof case: Letters of the Living ∩ Badasht.

The "who was at this event" page is a **follow-on**, not this ticket.

## 3. Connector blurb

Current steering text tells agents to prefer `sifter_search` and `sifter_search_quick` for research.
That is how Study Assistant wasted the first pass on a “who was at X” question.

Change it to:

- For “who was at X” / people linked to events or other people: start with
  `entities/lookup` and `people/search`, then follow `participated-in` / `visited` evidence.
- Use passage search to **quote**, not to build the list.

Update every copy of that blurb (MCP server description, Grok Bot connector custom instruction,
any README that repeats it).

## Done when

- OpenAPI for people/entities is not empty (params + example visible without reading source).
- One diagram (mermaid or equivalent) of person/group/event/place and where edges live.
- `GET /entities/{id}` on Badasht lists participants (Letters of the Living ∩ Badasht is the proof). Stub only if assembly is impossible this pass, and then OpenAPI + connector make `people/search` unambiguous.
- Connector blurb no longer sends “who was at X” through passage search first.
- Tests cover the OpenAPI contract; no schema-free Default Response on these routes.

---

## DONE — 2026-08-28, shipped v2.187.9 → v2.187.12

| done-when | result |
|---|---|
| OpenAPI not empty (params + example without reading source) | ✅ `q` documented with description, full evidence shape, Badasht example. 16 contract tests against the SERVED document, red first. |
| One diagram of person/group/event/place + where edges live | ✅ `docs/entity-graph-api.md` — mermaid, solid = structured edge, dashed = prose-only, with the measured table. |
| `GET /entities/{id}` on an event lists participants | ✅ **participants on the node**, not a stub. Badasht: `claims:[]` → 9 participants, 8 `participated-in`. |
| Connector blurb no longer routes "who was at X" to passage search | ✅ OpenAPI `info.description` + new `Entities` tag: lookup → list → follow relation; passage search named citation-only. |
| Tests cover the contract; no schema-free Default Response | ✅ 16 + 11 tests; suite 2031 green. |

**Proof, live:** Letters of the Living ∩ `participated-in` Badasht = **6** (Bahá'u'lláh, the Báb, Quddús,
Ṭáhirih, Mírzá Hádí, Mírzá Muḥammad-‘Alíy-i-Qazvíní), cited to GPB ¶84/¶88 and Revelation vol. 2.

**Why 6 and not 8:** the unfiltered first cut returned 8, two of which were wrong — Shoghi Effendi
("participated-in Second Indian Cultural Conference") and ‘Abdu'l-Bahá ("Orient-Occident-Unity Conference")
rode in on the shared word *conference*. Participants now require the rarest word of the node's PRIMARY name
(parenthetical aliases excluded) that still matches somebody, reported as
`participantsProvenance.matchedOn`.

**Not structured, and labelled so:** of 92 `participated-in` claims on Quddús exactly ONE carries an
`object_id`; person→person edges ARE structured (392/1508). Participants are assembled from claim prose —
recall, not proof. `/entities/capabilities` gained `structuredEvent` alongside the existing `structuredPlace`.

### Left open
- **The MCP server description and Grok Bot connector instruction are not in this repo.** The only in-repo
  copies of the steering text were the OpenAPI blurb and `/tools/*`, both updated. Those external copies
  still say "prefer sifter_search" and need the same edit — someone must point at where they live.
- A pre-existing test flake under pre-commit load (passes 3/3 standalone, 2031 green). Predates this work.

---

## RETEST READY — v2.187.19 (Tester's five failures)

| # | failure | fixed | verified live |
|---|---|---|---|
| 1 | Badasht GET 30.5s vs 20s client timeout | fold once per row (MATERIALIZED CTE) + no per-term COUNT scans | **4.7s**; Letters **0.15s**; search 4.3s |
| 2 | Letters group dumped 30 incl. Shoghi Effendi | groups use the structured `graph_relations` roster | **16 members**, no Shoghi Effendi |
| 3 | people/search shape + wrong set | spec-shaped `people[]`; membership edge AND `participated-in` AND topic term | 5 people, both conditions true |
| 4 | /people/{id} empty spec | params + response schema | `params: id`, 200 schema present |
| 5 | no contract test caught any of it | behavioural suite + arity test | 2049 tests green |

**Item 3 is a rule, not a number:** Letter membership edge AND relation `participated-in` on a claim naming
Badasht. Result: Quddús, Ṭáhirih, Mullá Báqir-i-Tabrízí, Mírzá Muḥammad-‘Alíy-i-Qazvíní, Mírzá Hádí.
Excluded: Mullá Ḥusayn (`visited`), Bahá'u'lláh and the Báb (not Letters), Shoghi Effendi (mentions only).

### Mistakes made getting here, so they are not repeated
- **Chasing a headcount.** 6 then 5 were targets, and the matcher was bent twice to reach them. The 6 was my
  own prose-matching error, which counted Bahá'u'lláh and the Báb as Letters.
- **A generic token doing the matching, three times**: "conference" on the event node, "letters" on the group
  node, "participated" on people/search. Each time the discriminating token went unchecked.
- **Broke production**: 2.187.14 returned 500 on entities/search and every event dossier — 1+3n parameter
  values for 1+2n placeholders. Every behavioural test passed because a stubbed db never binds parameters.
  The suite now counts parameters per placeholder.
- **A green check on the relation is not a check on the subject.** Every result carried `participated-in`
  while two of them had no Badasht claim at all. Reading the statements found it; counting never would.

### Still open
- MCP server description + Grok Bot connector instruction are NOT in this repo and still route "who was at X"
  through passage search. Held pending Tester sign-off.
- `entity_claims` data quirk: a claim attributed to Mullá Ḥusayn carries the statement "the Báb —
  participated-in pilgrimage to Ḥijáz". Subject/attribution mismatch, not fixed here.
