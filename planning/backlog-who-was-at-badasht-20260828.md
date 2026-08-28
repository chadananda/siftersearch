# Brief — "Who was at this event" page (2026-08-28)

**Ship:** a working, crawlable page at `/who-was-at/badasht`. The page IS the query — not a writeup about
the query. No `/docs/entity-search`, no second explainer.

## The rule this page implements (BA lock)

Intersect the **two node rosters**. Nothing else decides membership.

1. **Event node** `GET /api/v1/entities/1264029` (Badasht Conference) → `participants[]`.
   Keep relation **`participated-in`**.
2. **Group node** `GET /api/v1/entities/1247655` (the Letters of the Living) → `participants[]`.
   Keep relation **`letter-of-the-living`**.
3. The page's answer = people in **both**.

Consequences, all verified live:

| person | on Letters node | on Badasht node | on the page |
|---|---|---|---|
| Quddús | letter-of-the-living | participated-in | **yes** |
| Ṭáhirih | letter-of-the-living | participated-in | **yes** |
| Mírzá Muḥammad-‘Alíy-i-Qazvíní | letter-of-the-living | participated-in | **yes** |
| Mírzá Hádí, son of Mullá ‘Abdu'l-Vahháb-i-Qazvíní | letter-of-the-living | participated-in | **yes** |
| Mullá Ḥusayn | letter-of-the-living | **visited** | no — visited is labelled, not attended |
| Mullá Báqir-i-Tabrízí | letter-of-the-living | **absent from the event node** | no — even though people/search has a claim |
| Bahá'u'lláh, the Báb | **not members** | participated-in | no |
| Shoghi Effendi | not a member (mentions only) | absent | no |

**Do not chase 4/5/6.** The rule produces the list; the count is whatever it is. `people[]` is the answer if
the page also calls search; `ids` is only a projection of it.

## On the page

- Look up the event → look up the group → list the edges.
- Every person is a real node, with `evidence.relation` / `statement` / `source` / `paraId`.
- Passage search appears as **citation under a person**, never as how the list was built.

## Not on the page

- No OpenAPI paste, no connector cheat sheet.
- No "try this search" links that run `sifter_search`.

## Non-functional

- Unique HTML for "who was at Badasht" and "Letters of the Living at Badasht". Shareable, crawlable URL.
- GET completes under a 20s agent client. Budget today: event node 4.6s + group node 0.16s.

## TDD

Fail a test against the live page contract FIRST — proof URL returns the intersection; Báqir, Ḥusayn,
Shoghi and Bahá'u'lláh absent; evidence fields present; not a docs dump — then implement.
