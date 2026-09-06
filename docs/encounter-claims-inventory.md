# What encounter claims already exist — backlog 0019

**Answer: extraction must NOT be repeated.** Meeting-type claims are already in
`entity_claims` in bulk — roughly 47,000 corpus-wide, 35,861 measured directly — each with its
verbatim proof span, source document, paragraph id and date. There is a real defect, and it is the
open-producer/closed-consumer shape the item feared, but it is repairable with SQL and costs no
model calls. Details and numbers below.

## How these numbers were obtained

`tower-nas` has been off Tailscale since 2026‑08‑29 (`tailscale status`: *offline, last seen 8d*),
so SSH to the box was unavailable. Its Fastify API is live through the Cloudflare tunnel
(`api.siftersearch.com/health` → 200, v2.187.33), and the public entity endpoints need no key, so
the survey was run against production over HTTP on **2026‑09‑06**:

    node scripts/encounter-claim-survey-api.mjs        # what produced everything below

`GET /api/v1/entities/{id}` returns **every** supported claim for that entity, so a person sampled
is a person counted completely — the sample is over *people*, never over one person's claims.
Scope: **importance rank 1–400 of 19,383 person entities; 367 of the 400 carry claims; 199,269
claims**. Two things the public API cannot see — `target_entity_id` (stripped by the response
schema) and `entity_mentions_v2` paragraph rows — are covered by the exact whole-table twin,
`scripts/encounter-claim-survey.mjs`, which must be run on the box:

    ssh chad@tower-nas 'cd ~/sifter/siftersearch && node scripts/encounter-claim-survey.mjs'

Where a figure below is an extrapolation rather than a measurement, it says so.

## 1. The distinct relations in `entity_claims`, with counts

**75 distinct relations** across 199,269 claims in the surveyed slice. This is an open vocabulary
and it behaves like one: a long head, a 20-relation body, and a tail of one-off inventions
(`proclaimed`, `characterized-as-by`, `held-office-by`) that are the extractor improvising.

| relation | claims | entities | |
|---|---:|---:|---|
| `characterized-as` | 56,388 | 314 |  |
| `related-to` | 24,787 | 296 |  |
| `visited` | 12,678 | 214 | **meeting** |
| `has-title` | 8,018 | 183 |  |
| `prophesied` | 6,567 | 75 |  |
| `decreed` | 6,454 | 77 |  |
| `met` | 6,206 | 204 | **meeting** |
| `testified-about` | 5,843 | 144 |  |
| `associated-with` | 5,276 | 188 |  |
| `corresponded-with` | 4,244 | 121 | **meeting** |
| `died` | 3,811 | 192 |  |
| `held-office` | 3,445 | 174 |  |
| `has-station` | 3,422 | 91 |  |
| `addressed-by` | 3,228 | 151 |  |
| `participated-in` | 3,131 | 198 | **meeting** |
| `summoned` | 3,084 | 100 | **meeting** |
| `imprisoned` | 2,731 | 102 |  |
| `recipient-of` | 2,648 | 156 |  |
| `accompanied` | 2,613 | 175 | **meeting** |
| `significance` | 2,543 | 77 |  |
| `hosted` | 2,065 | 121 | **meeting** |
| `teacher-of` | 2,046 | 94 |  |
| `honored-by` | 1,714 | 108 |  |
| `mentioned-in` | 1,575 | 122 |  |
| `compared-to` | 1,454 | 69 |  |
| `exiled` | 1,443 | 91 |  |
| `opponent` | 1,261 | 147 |  |
| `also-known-as` | 1,253 | 117 |  |
| `martyred` | 1,132 | 85 |  |
| `intervened-for` | 1,118 | 111 |  |
| `praised-by` | 1,084 | 84 |  |
| `appointed-by` | 1,071 | 100 |  |
| `son-of` | 999 | 99 |  |
| `buried-in` | 969 | 62 |  |
| `persecuted` | 959 | 111 |  |
| `believer` | 827 | 142 |  |
| `companion-of` | 813 | 90 | **meeting** |
| `father-of` | 752 | 86 |  |
| `relative-of` | 734 | 87 |  |
| `knew` | 659 | 81 | **meeting** |
| `follower-of` | 653 | 107 |  |
| `brother-of` | 546 | 73 |  |
| `taught-by` | 520 | 76 |  |
| `disciple-of` | 468 | 76 |  |
| `prophesied-by` | 406 | 45 |  |
| `killed` | 392 | 91 |  |
| `pioneer` | 376 | 53 |  |
| `condemned-by` | 350 | 69 |  |
| `member-of` | 335 | 81 |  |
| `executed` | 326 | 51 |  |
| `successor-of` | 309 | 36 |  |
| `husband-of` | 293 | 54 |  |
| `recognized` | 276 | 56 |  |
| `governor-of` | 268 | 38 |  |
| `daughter-of` | 255 | 22 |  |
| `secretary-of` | 254 | 28 |  |
| `sister-of` | 241 | 20 |  |
| `host-of` | 235 | 40 | **meeting** |
| `surnamed-by` | 225 | 45 |  |
| `ruler-of` | 219 | 36 |  |
| `converted-by` | 201 | 78 |  |
| `covenant-breaker` | 191 | 23 |  |
| `letter-of-the-living` | 148 | 21 |  |
| `wife-of` | 146 | 28 |  |
| `mother-of` | 141 | 24 |  |
| `interviewed-by` | 133 | 29 | **meeting** |
| `custodian-of` | 109 | 22 |  |
| `persecuted-by` | 90 | 24 |  |
| `uncle-of` | 89 | 22 |  |
| `cleric` | 21 | 18 |  |
| `proclaimed` | 3 | 1 |  |
| `characterized-as-by` | 2 | 2 |  |
| `claimed` | 1 | 1 |  |
| `testified-about-by` | 1 | 1 |  |
| `held-office-by` | 1 | 1 |  |

**Whole-table extrapolation.** Claims collapse fast below rank 400. Probes at four depths:

| importance rank | people | with claims | claims | per person |
|---|---:|---:|---:|---:|
| 1–400 | 400 | 367 | 199,269 | 498.2 |
| 401–460 | 60 | 42 | 476 | 7.9 |
| 1,201–1,260 | 60 | 2 | 2 | 0.03 |
| 4,001–4,060 | 60 | 3 | 12 | 0.2 |
| 10,001–10,060 | 60 | 36 | 278 | 4.6 |

The four tail probes average 3.2 claims per person; across the remaining 18,983 people that is
roughly 61,000 claims, so **`entity_claims` holds on the order of 260,000 rows** and the top 400
people account for about three quarters of them. Treat that as an order of magnitude: the run-to-run
spread on the top-400 slice alone was ±5% (199,269 vs 209,633) because `order=importance` is not a
total order and paging through ties returns slightly different people each time.

## 2. Meeting-type claims: they already exist, and there are a lot of them

The item asks about `met`, `visited`, `hosted`, `travelled-with` and `companion`. Every one of them
is present, two of them under a different spelling — which is what an open vocabulary does, and why
the survey scripts search a 35-entry list of surface variants rather than five exact strings.

| asked for | present as | claims (rank 1–400) |
|---|---|---:|
| `met` | `met` | 6,206 |
| `visited` | `visited` | 12,678 |
| `hosted` | `hosted` + `host-of` | 2,300 |
| `travelled-with` | `accompanied` | 2,613 |
| `companion` | `companion-of` | 813 |
| — | `corresponded-with` | 4,244 |
| — | `participated-in` | 3,131 |
| — | `summoned` | 3,084 |
| — | `knew` | 659 |
| — | `interviewed-by` | 133 |

**35,861 meeting-type claims — 18.0% of the slice.** Scaled by the same ratio the whole table holds
roughly **47,000**. Every one carries `proof_verbatim`, `doc_id`, `para_id` and a date; re-running
extraction would recreate rows that are already there, already proof-gated.

**The specific fear in the item does not hold.** `api/lib/rag/concepts/relations.js` — the module
with the closed five-relation whitelist — governs `concept_claims`, the symbol/sense lexicon. It
never touches `entity_claims`. Encounter relations were not dropped by it, and the corresponding
`relations` table keys (`met`, `visited`, `hosted`, `accompanied`, `companion-of`,
`participated-in`) are all live in production.

## 3. The real defect: relations coerced to `related-to`, recoverable without a model

The *shape* the item warned about is present in `entity_claims`, one layer down.
`scripts/entity-read/extract-claims-v2.mjs:113`:

```js
const rel = relKeys.has(c.relation) ? c.relation : 'related-to';
```

`relKeys` comes from the `relations` table. Any verb the model invents that is not a key there is
silently rewritten to `related-to`. Open producer, closed consumer — exactly the pattern
`relations.js` was written to warn about.

**It is recoverable, because line 119 builds `statement` from the raw relation, not the coerced one:**

```js
const statement = `${c.subject} — ${c.relation}${c.object ? ' ' + c.object : ''}`.slice(0, 300);
```

So the invented verb is still sitting in the prose of every coerced row. Measured over the slice:

- **24,787** `related-to` claims
- **6,609 of them (26.7%)** carry a *more specific* verb in the statement
- **388** of those are encounter relations: `accompanied-by` (190), `traveled-to` (93),
  `received` (57), plus `attended`, `wrote-to` and others below the reporting threshold

Real rows currently invisible to any relation filter:

```
the Báb — traveled-to Mecca                              (p20541033)
the Báb — attended scholarly gatherings in Búshihr        (p16112684)
Siyyid ‘Alí-Muḥammad of Shíráz (the Báb) — received Mullá Ḥusayn-i-Bushrú'í   (para_394)
the Báb — wrote-to Muḥammad Sháh Qájár                    (p16114347)
```

Recovery is a regex over a column that already exists: add the missing keys to `relations`, then
`UPDATE entity_claims SET relation = <verb parsed from statement> WHERE relation='related-to'`.
Minutes of SQL, zero model calls. The item's own warning applies and is the reason to do it —
388 rows in a 400-person slice is small, and impact is not proportional to count.

The largest non-encounter recoveries are worth the same treatment while the query is open:
`opposed` (986), `authored` (589), `addressed` (394), `born` (97), `resided-in` (33).

## 4. Paragraph co-occurrence of two person entities — the candidate set

Two measurements, because the public API can only see one of them.

**From claim paragraphs (measured 2026‑09‑06, rank 1–400):** 83,445 distinct paragraphs carry a
claim about at least one sampled person.

| people in the paragraph | paragraphs |
|---:|---:|
| 1 | 69,509 |
| 2 | 11,187 |
| 3 | 2,104 |
| 4 | 437 |
| 5 | 148 |
| 6 | 36 |
| 7 | 13 |
| 8+ | 11 |

**13,936 paragraphs hold two or more of these people — 22,859 person-pair instances.**

**From `entity_mentions_v2` (the criterion's own substrate):** counted for the same 400 people,
the v2 mention index holds **97,496 rows** (the dossier's `mentionCount` is exactly
`SELECT COUNT(*) FROM entity_mentions_v2 WHERE entity_id=?` summed per document, see
`api/lib/entity-api.js`). Grouping those rows *by paragraph* is the one figure no public endpoint
will serve — `entity_mentions_v2` is only read behind admin-gated routes — so the exact histogram
needs the box. `scripts/encounter-claim-survey.mjs` computes it:

```sql
SELECT m.doc_id, m.para_id, COUNT(DISTINCT m.entity_id) AS persons
  FROM entity_mentions_v2 m
  JOIN graph_entities ge ON ge.id = m.entity_id AND ge.entity_type='person'
 WHERE m.entity_id IS NOT NULL AND m.para_id IS NOT NULL
 GROUP BY m.doc_id, m.para_id
```

That 97,496 is **0.49× the 199,269 claims those same people carry**. Quddús: 1,029 mention rows
against 1,508 claims. This reverses one of the item's premises. It assumed `entity_mentions_v2` was
the broad substrate and `entity_claims` the narrow one, so that re-analysing two-person paragraphs
would be a cheap delta on top of a large mention index. For the people who matter it is the other
way round — the claim substrate already reaches more paragraphs than the mention index does, and the
two-person candidate set cannot be much larger than the 13,936 paragraphs measured above.

The number that would actually justify spending is *two-person paragraphs carrying no meeting claim
yet*. That query is in the script as
`coOccurrence.twoPersonParagraphsAlreadyCarryingAMeetingClaim`; on the measured ratios the residue
is small.

## 5. Must extraction be repeated? No.

1. **The claims exist.** ~47,000 meeting-type claims corpus-wide (35,861 measured), proof-gated,
   sourced and dated. Re-extraction would spend model budget recreating them.
2. **The vocabulary exists.** All five relations the item names are live keys; two under a
   different spelling. Nothing was dropped by the `relations.js` whitelist, which governs
   `concept_claims` only.
3. **The one real loss is a SQL repair, not an extraction.** 6,609 coerced rows in the slice,
   388 of them encounters, with the true verb still readable in `statement`.
4. **The candidate-set argument is weaker than assumed.** `entity_mentions_v2` is *sparser* than
   `entity_claims` for high-importance people (0.49×), so a targeted re-analysis of two-person
   paragraphs adds less than the item's estimate suggested.
5. **What is genuinely missing is linking, not extraction.** `target_entity_id` is almost never
   set — `api/routes/people.js` records that of 92 `participated-in` claims on Quddús exactly one
   carries an `object_id`, and 392 of his 1,508 claims carry one at all. "A met B" is stored as a
   subject plus prose, not as a subject→object edge. Making encounters queryable is reconcile /
   entity-linking work over rows that already exist. That is what 0017 should be scoped to.

### Order of work

1. Run `scripts/encounter-claim-survey.mjs` on tower-nas once it is reachable — exact whole-table
   counts, exact `entity_mentions_v2` co-occurrence, exact `object_id` coverage. Everything above
   is either a direct measurement of a 400-person slice or an extrapolation labelled as one.
2. Add the recovered verbs to the `relations` table and backfill `entity_claims.relation` from
   `statement`. SQL only.
3. Add an `unknownRelations`-style detector on the claim write path, the way `relations.js` did for
   the lexicon, so the next invented verb surfaces instead of silently becoming `related-to`.
4. Only then scope any re-extraction, and scope it to two-person paragraphs that carry no meeting
   claim — a number step 1 produces.
