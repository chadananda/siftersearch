# The person/group/event/place graph — how to query it

## Cheat sheet

1. **Look up the node** — `GET /api/v1/entities/lookup?q=Badasht` (any transliteration; `type=event|place|group|person`).
2. **List the people** — `GET /api/v1/entities/{id}` → `participants[]` for an event/place/group; `GET /api/v1/entities/search?q=` for descriptive queries.
3. **Follow the edges** — filter evidence by `relation`: `participated-in`, `visited`, `hosted`, `died`, `met`, `accompanied`.

**Passage search (`/api/v1/search`, `/search/quick`, `/tools/search`) is for citation — quoting what you found — not for building the list.** It returns paragraphs, not people.

---

## The graph

```mermaid
graph LR
  P["person<br/>52,765 nodes"]
  G["group"]
  E["event"]
  L["place<br/>3,518 nodes"]
  W["work"]

  P -->|"related-to · met · teacher-of · accompanied<br/><b>structured edge</b> (object_id set)"| P
  P -.->|"participated-in · hosted<br/><i>prose only</i>"| E
  P -.->|"visited · died<br/><i>prose only</i>"| L
  P -.->|"member-of<br/><i>prose only</i>"| G
  P -->|"cited in"| W

  classDef solid fill:#e8f0fe,stroke:#3367d6,color:#111
  classDef dashed fill:#fdf0e8,stroke:#d67a33,color:#111
  class P,W solid
  class G,E,L dashed
```

Solid = a real edge you can join on. Dashed = the link exists only inside the claim's sentence.

## Where the edges actually live

**Every claim hangs off a PERSON.** `entity_claims.entity_id` is the person; the claim carries `relation`,
`statement`, `proof_verbatim`, `doc_id`, `para_id`, and *sometimes* `target_entity_id`.

| link | structured? | measured |
|---|---|---|
| person → person | **yes**, `target_entity_id` set | 392 of 1,508 claims on Quddús (26%) |
| person → event | **no** | 1 of 92 `participated-in` claims on Quddús |
| person → place | **no** | zero claims corpus-wide point `target_entity_id` at a place |

So an event node holds no claims of its own. `GET /api/v1/entities/{id}` on an event therefore assembles
`participants[]` by matching the node's name against claim prose — the same evidence `/entities/search`
returns — and labels that in `participantsProvenance`. **It is recall, not proof:** confirm each with its
`proof` span and `paraId`. `GET /api/v1/entities/capabilities` reports this under `structuredEvent` and
`structuredPlace` so you never have to infer it.

## Worked example — Letters of the Living ∩ `participated-in` Badasht Conference

```bash
# 1. the event node
curl -H "X-API-Key: $KEY" \
  "https://api.siftersearch.com/api/v1/entities/lookup?q=Badasht"
# → { "id": 1264029, "name": "Badasht Conference", "type": "event" }

# 2. its participants, with cited evidence
curl -H "X-API-Key: $KEY" \
  "https://api.siftersearch.com/api/v1/entities/1264029"
# → participants[]: { id, name, relations: ["participated-in"], evidence: [...] }

# 3. the group, to intersect against
curl -H "X-API-Key: $KEY" \
  "https://api.siftersearch.com/api/v1/entities/lookup?q=Letters%20of%20the%20Living"
```

Keep the participants whose `relations` include `participated-in`, then intersect with the Letters of the
Living. `visited`, `hosted` and `died` also answer "who was there" — the relation is yours to filter, and
nothing is dropped on your behalf.

**The proof query is a RULE, not a headcount** (BA + Tester, 2026-08-28). "Letters of the Living who
participated in Badasht" means BOTH of:

1. a **Letter membership edge** — the structured roster on the group node (`graph_relations`), and
2. relation **`participated-in`** on a claim that names Badasht.

`visited` is not attended. A Badasht claim without a membership edge is not a Letter. Verified live on
v2.187.19 — `GET /api/v1/people/search?q=Letters of the Living who participated in Badasht`:

| person | evidence | source |
|---|---|---|
| Quddús | participated-in Badasht conference | God Passes By ¶88 |
| Ṭáhirih | participated-in conference of Badasht | God Passes By ¶91 |
| Mullá Báqir-i-Tabrízí | participated-in Badasht | The Báb: The Herald of the Day |
| Mírzá Muḥammad-‘Alíy-i-Qazvíní | participated-in Badasht conference | Revelation of Bahá'u'lláh vol. 2 |
| Mírzá Hádí, son of Mullá ‘Abdu'l-Vahháb-i-Qazvíní | participated-in Badásht gathering | Ẓuhúru'l-Ḥaqq vol. 3 |

Correctly **excluded**: Mullá Ḥusayn (a Letter, but his Badasht claim is `visited`); Bahá'u'lláh and the Báb
(at Badasht, but not Letters — the roster excludes them and the corpus states Bahá'u'lláh was "not included
among the Letters"); Shoghi Effendi (mentions the Letters, is not one).

An earlier version of this page claimed 6, arrived at by prose matching that counted Bahá'u'lláh and the Báb
as Letters. That was wrong and is the reason the rule is now stated as two conditions.

`participantsProvenance.derivedFrom` says which path answered: `graph-relations` for a group (a real edge),
`claim-prose` for an event or place (recall, verify by proof span).

Only now reach for passage search, to quote what you found:

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"query":"Badasht Ṭáhirih unveiled","limit":5}' \
  "https://api.siftersearch.com/api/v1/search"
```

## Fields you will use

| field | on | meaning |
|---|---|---|
| `q` | lookup / search | name in any transliteration, or a description. Stop-words ignored; terms matched independently and ranked, so a missing word lowers rank instead of emptying the result. |
| `relation` | evidence | the edge type — what you filter on |
| `evidence.statement` | evidence | the claim in one line: subject — relation — object |
| `source` / `sourceAbbr` | evidence | book the claim was extracted from |
| `paraId` | evidence | proof paragraph; pass to `GET /api/v1/paragraph/{id}` to quote |

## Identity warning

`id` is `AUTOINCREMENT` and **renumbers on a full rebuild**. Store the `key` (natural key) instead and
re-resolve with `POST /api/v1/entities/resolve`. See `GET /api/v1/entities/capabilities` → `idStability`.
