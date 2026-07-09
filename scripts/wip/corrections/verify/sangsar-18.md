# The 18 Sang-Sar Martyrs of Shaykh Ṭabarsí

**Source:** Dawn-Breakers, doc_id 21308, para_1188 (header) → para_1189–1206 (the 18 names).
**Status:** NOW IMPORTED (previously missing — recovered by the hashContent dataloss fix). Roster paras 1189–1206 carry fresh content ids (23666805–23666822); para_1188 header retains old id 21054530.
**Verification mode:** READ-ONLY. WebSearch confirmed the Dawn-Breakers text verbatim (bahai-library.com Ch. XX/XIX). Cross-corpus Momen docs 11559 (Mázandarán/Gurgán) and 11501 (Sháhmírzádí/Ḥájí Akhund) contain NO Sang-Sar roster treatment — these 18 are corpus-internal to the Dawn-Breakers.

## Key finding: ZERO existing entities for the roster

Querying `entity_mentions` joined to the 18 roster content ids returns **0 rows**. extract-v2 has not yet run on the re-imported paragraphs, so every martyr below needs a CREATE. Name-collision candidates that exist in `graph_entities` are NOT these martyrs (verified by mention context):

- **1055802 "Siyyid Aḥmad" (19 mentions)** — a MIXED/conflated cluster; its mentions are about castle towers (doc 40108) and Siyyid Aḥmad-i-Afnán (doc 432). NOT the Sang-Sarí martyr. Do not attach the martyr to this cluster.
- **1064513 "Mírzá Abu'l-Qásim" (4 mentions)** — the **Qá'im-Maqám / Grand Vazír** (doc 21308, "the Qá'im-Maqám, or Grand Vazír"). A THIRD, unrelated Abu'l-Qásim — neither Sang-Sar man.
- High-id orphans (1237000 "Mír Siyyid Aḥmad", 1238380 "Mír Abu'l-Qásim", 1238570 "Pahlaván Ṣafar-‘Alí", 1238351 "Siyyid ‘Abdu'l-‘Aẓím-i-Ḵhu'í") have **0 mentions** — stale/empty stubs, not safe anchors; recommend CREATE fresh and let ER merge if warranted.

## Family tree (Siyyid Aḥmad's kin — 4 of the 18)

```
                    Mír Mihdí
                 (paternal UNCLE)
                        │
        ┌───────────────┴───────────────┐
   Siyyid Aḥmad  ──brother──  Mír Abu'l-Qásim   [Abu'l-Qásim #1]
  (noted divine,              (martyred the night
   cut to pieces by            Mullá Ḥusayn died)
   Mírzá Muḥammad-Taqí
   + 7 ‘ulamás of Sárí)
        │
   Mír Ibráhím (BROTHER-IN-LAW of Siyyid Aḥmad)
```

## Second family pair (2 of the 18)

```
   Karbilá'í Abú-Muḥammad
            │
   ┌────────┴────────┐
 Muḥammad-‘Alí ── brother ── Abu'l-Qásim   [Abu'l-Qásim #2]
```

## The TWO distinct Abu'l-Qásims (resolves the 1064513 split concern)

There are in fact **three** unrelated Abu'l-Qásims in play; do not conflate:
1. **Mír Abu'l-Qásim** (para_1190) — Siyyid Aḥmad's BROTHER, Sang-Sar martyr. → CREATE (suggest canonical "Mír Abu'l-Qásim Sang-Sarí").
2. **Abu'l-Qásim** (para_1195) — Muḥammad-‘Alí's BROTHER, Sang-Sar martyr. → CREATE (suggest canonical "Abu'l-Qásim (brother of Muḥammad-‘Alí) Sang-Sarí").
3. **Mírzá Abu'l-Qásim, the Qá'im-Maqám / Grand Vazír** = existing 1064513 — NOT a Sang-Sar martyr; leave untouched. The earlier "1064513 split" is correct to keep separate; neither #1 nor #2 should ever merge into 1064513.

Likewise **Siyyid Aḥmad** the Sang-Sarí (para_1189) ≠ cluster 1055802 (mixed, Afnán-contaminated). CREATE a distinct entity rather than attaching to 1055802.

## Per-martyr records (all CREATE)

| # | para_ | content_id | Name (as imported) | Kinship / role | Existing entity | Action |
|---|-------|-----------|--------------------|----------------|-----------------|--------|
| 1 | para_1189 | 23666805 | Siyyid Aḥmad | noted divine; cut to pieces by Mírzá Muḥammad-Taqí + 7 ‘ulamás of Sárí | none (1055802 is a different, mixed cluster) | CREATE |
| 2 | para_1190 | 23666806 | Mír Abu'l-Qásim | BROTHER of Siyyid Aḥmad; martyred night Mullá Ḥusayn died | none (≠1064513 Qá'im-Maqám) | CREATE |
| 3 | para_1191 | 23666807 | Mír Mihdí | paternal UNCLE of Siyyid Aḥmad | none | CREATE |
| 4 | para_1192 | 23666808 | Mír Ibráhím | BROTHER-IN-LAW of Siyyid Aḥmad | 628077 "Mír Ibráhím" (3 m) — unverified, no Sang-Sar link | CREATE (flag possible merge) |
| 5 | para_1193 | 23666809 | Ṣafar-‘Alí | son of Karbilá'í ‘Alí (who, w/ Karbilá'í Muḥammad, roused Sang-Sar; both too infirm to reach the fort) | none (1238570 orphan) | CREATE |
| 6 | para_1194 | 23666810 | Muḥammad-‘Alí | son of Karbilá'í Abú-Muḥammad | none (common name) | CREATE |
| 7 | para_1195 | 23666811 | Abu'l-Qásim | BROTHER of Muḥammad-‘Alí (#6) — SECOND Abu'l-Qásim | none | CREATE |
| 8 | para_1196 | 23666812 | Karbilá'í Ibráhím | — | none | CREATE |
| 9 | para_1197 | 23666813 | ‘Alí-Aḥmad | — | none | CREATE |
| 10 | para_1198 | 23666814 | Mullá ‘Alí-Akbar | — | none (≠11501 Ḥájí Akhund Sháhmírzádí) | CREATE |
| 11 | para_1199 | 23666815 | Mullá Ḥusayn-‘Alí | — | none | CREATE |
| 12 | para_1200 | 23666816 | ‘Abbás-‘Alí | — | none | CREATE |
| 13 | para_1201 | 23666817 | Ḥusayn-‘Alí | — | none | CREATE |
| 14 | para_1202 | 23666818 | Mullá ‘Alí-Aṣg̱har | — | none | CREATE |
| 15 | para_1203 | 23666819 | Karbilá'í Ismá‘íl | — | none | CREATE |
| 16 | para_1204 | 23666820 | ‘Alí Ḵhán | — | none | CREATE |
| 17 | para_1205 | 23666821 | Muḥammad-Ibráhím | — | 983841 "Muḥammad-Ibráhím" (3 m) — unverified, no Sang-Sar link | CREATE (flag possible merge) |
| 18 | para_1206 | 23666822 | ‘Abdu'l-‘Aẓím | — | none (1238351 orphan = Ḵhu'í, different) | CREATE |

**Two non-martyr supporting figures** named in para_1193 (do NOT count among the 18): **Karbilá'í ‘Alí** (father of Ṣafar-‘Alí) and **Karbilá'í Muḥammad** — the two elders who roused Sang-Sar but were too infirm to reach Ṭabarsí. Consider CREATE as minor associated entities. Also **Karbilá'í Abú-Muḥammad** (para_1194), father of Muḥammad-‘Alí.

## Recommended SET entity

Create an `entity_sets` record:
- **name:** "Sang-Sar martyrs of Shaykh Ṭabarsí"
- **set_type:** martyr_group (or group)
- **religion:** Baha'i (Bábí dispensation — these are Bábí martyrs of 1848–49; tag `side: Bábí`)
- **notes:** "The eighteen companions of the village of Sang-Sar (district of Simnán) martyred in connection with the Shaykh Ṭabarsí upheaval; enumerated in Dawn-Breakers Ch. XIX–XX, para_1188–1206. Includes the four-member kin group around Siyyid Aḥmad (brother Mír Abu'l-Qásim, uncle Mír Mihdí, brother-in-law Mír Ibráhím) and the Muḥammad-‘Alí / Abu'l-Qásim brother pair."
- **set_members:** the 18 created person entities (#1–#18 above).

## Caveats
- Single-source: the entire roster rests on this one Dawn-Breakers passage; no independent Momen corroboration found in the corpus for the lesser-known 12 (#7–#18 are bare names with no attributes).
- #4 (Mír Ibráhím / 628077) and #17 (Muḥammad-Ibráhím / 983841) have name-matching existing entities with mentions but NO confirmed Sang-Sar context — flagged for ER review, not auto-merge.
- Several names are honorific+given only (no nisba/surname per classical-Iran naming) → high collision risk; per dictionary doctrine resolve by context, keep the name, do not drop shared names.
