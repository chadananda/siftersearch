# VERIFY: Vaḥíd (Siyyid Yaḥyáy-i-Dárábí)

## VERDICT
**keeper = 651297** (canonical_name "Vaḥíd") for **Vaḥíd / Siyyid Yaḥyáy-i-Dárábí**
← merged ids: **1219861, 638311, 1219608, 638223, 651553**
(drop empty shells: **614913, 651296** — 0 entity_mentions each)

**Resolves the 614913-vs-1219861 conflict:** BOTH prior keepers are wrong.
- Sibling agent's **614913** ("Vahid", no diacritics) = **empty shell, 0 entity_mentions.** Invalid keeper.
- Earlier ledger's **1219861** = real but narrow: only **2 docs** (Dawn-Breakers narrative DB 21308 + GPB 21310), 67 mentions.
- Correct keeper **651297**: **76 of 84 mentions in person-bearing docs**, spanning **14 docs** across the full cross-corpus (Dawn-Breakers TOC, GPB, Balyuzi, Momen/Nicolas, chronologies). Most correct person mentions AND widest corpus spread → keeper per the most-correct-mentions rule.

## CONFIDENCE
**High.** All six merge ids independently verified as the same man (Siyyid Yaḥyáy-i-Dárábí, surnamed Vaḥíd by the Báb, Nayríz). Firewall against Mírzá Yaḥyá confirmed by reading both. Only caveat is minor contamination in the keeper (below).

## EVIDENCE (real entity_mention counts, not stale mention_count)
| id | name | mentions | docs | identity |
|----|------|----------|------|----------|
| **651297** | Vaḥíd | 84 (76 person) | **14** | KEEPER — full cross-corpus: DB-TOC 16275, GPB 21310, Balyuzi 429/430/431/427, Momen/Nicolas 40108 |
| 1219861 | Vaḥíd | 67 | 2 | merge — Dawn-Breakers Nayríz narrative (DB 21308) + GPB 21310, all the person |
| 638311 | Siyyid Yaḥyá | 18 | 4 | merge — his conversion/Nayríz; doc 40108 records his fate (strangled) |
| 1219608 | Siyyid Yaḥyáy-i-Dárábí | 9 | 3 | merge — "delegated by Muḥammad S̱háh… surnamed Vahid (Peerless)" |
| 638223 | Siyyid Yaḥyáy-i-Dárábí | 4 | 3 | merge — "surnamed Vaḥíd… delegated by the Sháh"; Balyuzi "came to Yazd" |
| 651553 | Siyyid Yaḥyá Dárábí | 2 | 1 | merge — Báb's-works essay (doc 8632), the person |
| 614913 | Vahid | **0** | 0 | DROP empty shell |
| 651296 | Siyyid Yaḥyáy | **0** | 0 | DROP empty shell |

Representative keeper/merge text:
- 651297 / GPB 21310: *"…delegated the trusted Siyyid Yaḥyáy-i-Dárábí, surnamed Vaḥíd, one of the most erudite, eloquent and influential of his subjects…"*
- 1219608 / 429: *"Siyyid Yaḥyáy-i-Dárábí, surnamed Vahid (Peerless)… referred to by Bahá'u'lláh as 'that unique and peerless figure of his age'… embraced the Cause of the Báb."*
- 1219861 / DB 21308: *"…the momentous happenings of Nayríz which culminated in the death of Vaḥíd."*

## FIREWALL (DO NOT MERGE)
- **Mírzá Yaḥyá (Ṣubḥ-i-Azal) = entity 620167** — 354 mentions, a DIFFERENT person sharing only the name "Yaḥyá". His mentions are Bahá'u'lláh dictating an epistle *to* him, Tablet of Kullu't-Ṭa'ám context (doc 11445, DB 21308). NEVER merge into Vaḥíd.
- **Vaḥíd's son, Siyyid Aḥmad (at Nayríz)** — a SEPARATE entity; not among the candidate ids and not merged here.
- The Arabic word **"váḥid / vahid" = "One/Unity/19" (Letters of the Living)** is NOT this person. It is the source of contamination in keeper 651297 (docs 4068, 6542, 7165, 8632 partial — ~8 mentions). These are concept-mentions, not person-mentions; they ride along in the keeper but do not change identity. See FLAGS.

## DESCRIBE
**Siyyid Yaḥyáy-i-Dárábí** (of Dáráb, Fárs), surnamed **Vaḥíd** ("Peerless/Unique") by the Báb — among the most erudite and influential divines of Persia. Sent by **Muḥammad Sháh** to investigate the Báb; after interviews at Shíráz he was overpowered and converted, writing his findings to the chamberlain Mírzá Luṭf-‘Alí. He proclaimed the Faith at Yazd (arriving 1 Jamádíyu'l-Avval 1266 A.H.) and then led the **Nayríz upheaval (1850)**.
**Fate (verified, correcting the task prompt's tentative phrasing):** he was **strangled with his own girdle at Nayríz** by a man whose two brothers had died in the siege (doc 40108, citing Nicolas / A Traveller's Narrative). He was NOT beheaded by ‘Abbás-Qulí (that is Quddús/Ṭabarsí confusion) and NOT "dragged by the Zanján" (Zanján = Ḥujjat's separate upheaval). Bahá'u'lláh refers to him as "that unique and peerless figure of his age" (Kitáb-i-Íqán).

## FLAGS
1. **Keeper carries minor concept-contamination.** ~8 of 651297's 84 mentions are the Arabic word "váḥid/vahid" (Unity / 19 / Letters of the Living), not the person — docs 4068, 6542, 7165, and part of 8632. Recommend a later mention-level cleanup to detach those concept-mentions from the person entity. Does not affect the keeper decision (76 person-mentions, widest spread).
2. **Sibling agent's keeper 614913 was an empty shell (0 mentions)** — flag the sibling ledger; its Vaḥíd identification pointed at a no-op node.
3. After merge, re-derive `mention_count` (stale across the board).
4. **Siyyid Aḥmad (Vaḥíd's son)** not located among candidates; ensure no future Nayríz "Siyyid Aḥmad" entity is folded into 651297.
