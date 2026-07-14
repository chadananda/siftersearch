# Letters of the Living — Group 2 (cross-corpus verification)

Scope: 10 figures from the Báb's 18 first disciples. side = **Bábí** for all (Báb's dispensation; Báqir-i-Tabrízí later became Bahá'í — see his entry).
Sources: DB `graph_entities`/`entity_mentions` + `content` (Dawn-Breakers roster [3.37], Balyuzi, Momen, Samandar), WebSearch (Bahaipedia, Bahai Chronicles, Wikipedia, bahai-library Momen on Ṭáhirih's family).

**Canonical anchor — Dawn-Breakers roster [3.37]** (verbatim from corpus, content_id confirmed): lists all 18 in order. The relevant tail:
> …Mírzá Muḥammad Rawḍih-Ḵhán-i-Yazdí, Sa‘íd-i-Hindí, Mullá Maḥmúd-i-Ḵhu’í, Mullá Jalíl-i-Urúmí, Mullá Aḥmad-i-Ibdál-i-Marág̱hi’í, Mullá Báqir-i-Tabrízí, Mullá Yúsuf-i-Ardibílí, Mírzá Hádí (son of Mullá ’Abdu’l-Vahháb-i-Qazvíní), Mírzá Muḥammad-‘Alíy-i-Qazvíní, Ṭáhirih, Quddús.

This single passage authoritatively confirms LotL status for 9 of the 10 targets and **answers the task's open question**: Hádí & Muḥammad-‘Alí were **sons of Mullá ’Abdu'l-Vahháb-i-Qazvíní** (a Qazvín mujtahid), NOT sons of the Imám-Jum‘ih.

---

## 1. Mullá Maḥmúd-i-Khu'í — VERDICT: keeper (no graph entity; needs creation) — confidence HIGH
- **LotL**: yes, the **10th** Letter of the Living. In roster [3.37].
- **Role/fate**: from Khu'í (Ádhirbáyján), Shaykhí background; **martyred at Fort Shaykh Ṭabarsí, 1849**.
- **Graph status**: NO dedicated graph entity exists. id 623542 "Maḥmúd" (323 mentions) and id 978776 "Mullá Maḥmúd" (9) are generic/ambiguous — do NOT auto-merge.
- **FIREWALL (critical, per task)**: distinct from **Mullá Mihdí-i-Khu'í** (also written "Mullá Mihdíy-i-Khu’í"), who appears in a SEPARATE corpus disciple-list passage (content found: "…Mullá Yúsuf-i-Ardibílí Mullá Mihdíy-i-Khu’í Siyyid Ḥusayn-i-Turshízí…"). Both Khu'í men are real and co-occur — never collapse Maḥmúd→Mihdí. Also firewall from **Mírzá Maḥmúd-i-Khushnivis** (the Báb's father's cousin, a Shíráz calligrapher — corpus passage on Mírzáy-i-Shírází's lineage) and from **Mírzá Maḥmúd-i-Zarqání** (’Abdu’l-Bahá's diarist, ids 625937/950083/1083645). These three Maḥmúds are unrelated namesakes.
- **FLAGS**: create entity; alias "Mullá Maḥmúd Khú'í". Bahaipedia oddly says "from Qazvín" while nisba is Khu'í — minor source noise, nisba (Khu'í) governs.

## 2. Mullá Jalíl-i-Urúmí — VERDICT: keeper ← [id 628249] — confidence HIGH
- graph: **id 628249** "Mullá Jalíl-i-Urúmí" (person; 2–5 mentions). In roster [3.37].
- **LotL 11th**. Teacher in Ádhirbáyján/Qazvín; marched under the Black Standard with Mullá Ḥusayn (~July 1848); endured the whole Ṭabarsí siege; **martyred at Shaykh Ṭabarsí, 2 Feb 1849** (same day as Mullá Ḥusayn).
- **FIREWALL**: distinct from id 1220986 "Jalíl-i-Tabrízí" and id 636510 "Mír Jalíl" (17 mentions) — different nisbas; do NOT merge. "Urúmí" = of Urúmíyyih (id 628551, place) — geographic, not the person.
- **FLAGS**: none material.

## 3. Mullá Aḥmad-i-Abdál-i-Marághi'í — VERDICT: keeper (no graph entity; needs creation) — confidence HIGH
- **LotL 12th**. Corpus spelling "Mullá Aḥmad-i-Ibdál-i-Marág̱hi’í" (Ibdál/Abdál variant). Present at **Conference of Badasht**; **martyred at Shaykh Ṭabarsí, 1849**.
- **Graph status**: NO dedicated entity. id 628618 "Marághih" (14, place/person) is the town nisba, not him.
- **FIREWALL**: keep "Abdál/Ibdál" middle element — it disambiguates from other Aḥmads. Marághih = town in Ádhirbáyján.
- **FLAGS**: create entity; record alias "Mullá Aḥmad-i-Ibdál-i-Marághi'í".

## 4. Mullá Báqir-i-Tabrízí — VERDICT: keeper ← [id 620166] — confidence HIGH
- graph: **id 620166** "Mullá Báqir-i-Tabrízí" (person; ~12 mentions, alias recorded). In roster [3.37].
- **LotL** (13th in standard ordering). Corpus is rich: *"Mullá Báqir-i-Tabrízí, who survived all the other Letters of the Living, was the only one who embraced the Cause of Bahá'u'lláh and remained loyal and devoted to Him."* Studied under Siyyid Káẓim; at **Badasht**; carried the Báb's correspondence to Bahá'u'lláh (intermediary/**custodian** role — matches task); accompanied Bahá'u'lláh toward Shaykh Ṭabarsí (Dec 1848); **lived into the 1870s** (Nabíl brought him gifts) — the long-surviving LotL.
- **side**: born Bábí, **later Bahá'í** — the lone LotL to accept Bahá'u'lláh. Tag side=Bábí with note "became Bahá'í".
- **FIREWALL (critical)**: many other Báqirs in graph — id 628263 "Mullá Báqir" (101), 872491 "Muḥammad-Báqir" (80), 620156 "Báqir" (51), 633381 "Tabrízí" (25), 638692/901817 (Khán), 983839 "Ustád Báqir", 1134518 "Shaykh Báqir", 1060307 "al-Báqir", 614669 "Muḥammad Báqir Majlisí". NONE merge — only the full nisba "Báqir-i-Tabrízí" is this man. Also distinct from "Muḥammad-Báqir, his nephew" (Mullá Ḥusayn's nephew) in the roster.
- **FLAGS**: none; strongest-attested figure in the group.

## 5. Mullá Yúsuf-i-Ardibílí — VERDICT: keeper ← [id 1064435] — confidence HIGH
- graph: **id 1064435** "Mullá Yúsuf-i-Ardibílí" (person; 4 mentions). In roster [3.37]; also in a Bayán-era disciple list and a Balyuzi/Samandar travel note (journeyed Yazd→Kirmán with Muqaddas-i-Khurásání).
- **LotL 14th**. Noted for learning and eloquence; active/prominent; **martyred at Shaykh Ṭabarsí, 2 Feb 1849**.
- **FIREWALL**: distinct from id 625391 "Mírzá Yúsuf" (12), 633262/657172 "Yúsuf" (place/person), 1219839/631472 "Ardibíl/Ardibíl" (the town). Keep full nisba.
- **FLAGS**: none.

## 6. Mírzá Hádíy-i-Qazvíní (Mírzá Hádí, son of Mullá ’Abdu'l-Vahháb-i-Qazvíní) — VERDICT: keeper (no clean graph entity) — confidence HIGH (identity) / MEDIUM (fate)
- **LotL 15th**. In roster [3.37]. Son of Mullá ’Abdu'l-Vahháb-i-Qazvíní; Shaykhí under Siyyid Káẓim; declared at Shíráz.
- **Relationship to Ṭáhirih**: BOTH cousin (blood) AND brother-in-law (via his brother's marriage) — see FLAGS. Task's "brothers-in-law" is correct.
- **Fate (conflicting — FLAG)**: (a) one web source: died of injuries sustained after Badasht; (b) another (Wikipedia "Mullá Hádí-i-Qazvini"): a survivor who practiced taqiyya 1848–52, then after Ṭáhirih's 1852 martyrdom tried to lead the Qazvín Bábís. The "survivor who recanted/dissimulated" account is the more detailed/sourced one. **NEEDS-SOURCE to settle fate.**
- **FIREWALL (critical)**: distinct from his brother Mírzá Muḥammad-‘Alíy-i-Qazvíní (#7) and from other Hádís — id 628208 "Mírzá Hádí" (102, concept), 633419/633381 "Hádí", 633383 "Shaykh Hádí", 619186 "Muḥammad-Hádí", 630710/653624 "Siyyid Mihdí" (a Mihdí, not Hádí). The generic "Mírzá Hádí" graph node is too noisy to adopt as-is.
- **FLAGS**: NEEDS-SOURCE on fate (recanted-survivor vs died-of-Badasht-injuries). Create clean entity keyed to "son of Mullá ’Abdu'l-Vahháb-i-Qazvíní".

## 7. Mírzá Muḥammad-‘Alíy-i-Qazvíní — VERDICT: keeper (graph node ambiguous) — confidence HIGH
- **LotL 16th**. In roster [3.37]. Brother of #6; son of Mullá ’Abdu'l-Vahháb-i-Qazvíní. Corpus [16.9]: set out with Quddús for Mázindarán; close companion of Quddús.
- **Role/fate**: at **Badasht**; **martyred at Shaykh Ṭabarsí, 2 Feb 1849**.
- **Relationship**: Ṭáhirih's **brother-in-law** — married her sister **Marḍíyyih** (Momen, "Family and early life of Ṭáhirih"); also blood cousin. Confirms task's "brothers-in-law."
- **FIREWALL (critical)**: distinct from brother Hádí (#6); from id 628255 "Qazvíní" (36), 631341 "Muhammad Qazvíní" (10), 619458 "Muḥammad al-Báqir", and from "Mírzá Muḥammad-‘Alíy-i-Nahrí" (a different man — separate Bahaipedia article). Keep the "-i-Qazvíní" + "son of ’Abdu'l-Vahháb" key.
- **FLAGS**: graph entity not cleanly isolated; create/attach to a clean node.

## 8. Sa‘íd-i-Hindí — VERDICT: keeper (no graph entity) — confidence HIGH (identity) / fate UNKNOWN by record
- **LotL 9th** (precedes this group's tail in roster but explicitly in scope). In roster [3.37]. From **Multán** (India / present-day Pakistan); student of Siyyid Káẓim; deduced the Báb's identity through prayer; sent back to India to teach.
- **Fate**: returned to India, converted one or two (incl. reportedly Sayyid Basír-i-Hindí), then **lost contact with the Bábí community — later life unknown** (no martyrdom recorded).
- **Graph status**: NO dedicated entity. The "Hind*" graph nodes (id 614545 "Hindu" 1310, etc.) are the religion/ethnonym — all CONCEPT collisions, none is the person.
- **FIREWALL (critical)**: do NOT attach to any "Hindu/Hindi/Hindús/Hindustan" concept node. Distinct from **Sayyid Basír-i-Hindí** (his convert, a different person sometimes confused with him).
- **FLAGS**: create entity; fate = unknown/lost-contact (not martyred). NEEDS-SOURCE only if a death record is desired (none expected to exist).

## 9. Mírzá Muḥammad Rawḍih-Khán-i-Yazdí — VERDICT: keeper (graph node is a FALSE namesake) — confidence HIGH
- **LotL 8th** (in scope per task). In roster [3.37] as "Mírzá Muḥammad Rawḍih-Ḵhán-i-Yazdí." From Yazd.
- **Graph status / FIREWALL (critical)**: id 630651 "Rawdih-Khán" and id 638947/638930-type "Rawdih-Khani" are NOT the person — corpus shows they tag **rawḍih-khání**, the Shí‘ah ritual lamentation for Imám Ḥusayn (e.g., "clung to the practice of Rawḍih-khání"). This is a homograph trap: the disciple's family epithet "Rawḍih-Khán" collides with the ritual term. Do NOT adopt id 630651 as the person.
- **Role/fate**: thinly attested in web sources; corpus gives only the roster line. **NEEDS-SOURCE** for role/fate.
- **FLAGS**: create a clean PERSON entity ("Mírzá Muḥammad Rawḍih-Khán-i-Yazdí"); explicitly mark the existing ritual node as concept, not merge. NEEDS-SOURCE on fate.

---

## Summary table
| # | Figure | LotL # | Graph id | Verdict | Fate | Conf |
|---|--------|--------|----------|---------|------|------|
| 1 | Mullá Maḥmúd-i-Khu'í | 10 | none | keeper (create) | martyred Ṭabarsí 1849 | HIGH |
| 2 | Mullá Jalíl-i-Urúmí | 11 | 628249 | keeper | martyred Ṭabarsí 1849 | HIGH |
| 3 | Mullá Aḥmad-i-Abdál-i-Marághi'í | 12 | none | keeper (create) | martyred Ṭabarsí 1849 | HIGH |
| 4 | Mullá Báqir-i-Tabrízí | 13 | 620166 | keeper | survived all; →Bahá'í; d. 1870s | HIGH |
| 5 | Mullá Yúsuf-i-Ardibílí | 14 | 1064435 | keeper | martyred Ṭabarsí 1849 | HIGH |
| 6 | Mírzá Hádíy-i-Qazvíní | 15 | (noisy) | keeper (create) | NEEDS-SOURCE (survivor vs Badasht-injuries) | MED |
| 7 | Mírzá Muḥammad-‘Alíy-i-Qazvíní | 16 | (noisy) | keeper (create) | martyred Ṭabarsí 1849 | HIGH |
| 8 | Sa‘íd-i-Hindí | 9 | none | keeper (create) | returned India, lost contact (unknown) | HIGH |
| 9 | Mírzá Muḥammad Rawḍih-Khán-i-Yazdí | 8 | 630651=FALSE | keeper (create) | NEEDS-SOURCE | HIGH(id)/—(fate) |

## Open / NEEDS-SOURCE
- **Mírzá Hádíy-i-Qazvíní fate** — conflicting accounts (taqiyya-survivor who later sought Qazvín leadership vs died of post-Badasht injuries). Unresolved.
- **Mírzá Muḥammad Rawḍih-Khán-i-Yazdí** — role/fate thinly documented; only roster line in corpus.
- **Sa‘íd-i-Hindí** later life — genuinely unrecorded (lost contact); not a data gap to chase.

## Namesake firewalls established (do-not-merge)
- Maḥmúd-i-Khu'í ≠ Mihdí-i-Khu'í ≠ Maḥmúd-i-Khushnivis (Báb's relative) ≠ Maḥmúd-i-Zarqání (’Abdu'l-Bahá's diarist).
- Báqir-i-Tabrízí ≠ the ~10 other graph "Báqir" nodes; ≠ Muḥammad-Báqir (Mullá Ḥusayn's nephew).
- Jalíl-i-Urúmí ≠ Jalíl-i-Tabrízí ≠ Mír Jalíl.
- Rawḍih-Khán-i-Yazdí (person) ≠ rawḍih-khání (ritual node id 630651) — homograph trap.
- Sa‘íd-i-Hindí ≠ any Hindu/Hindi/Hindustan concept node; ≠ Sayyid Basír-i-Hindí (his convert).
- The two Qazvíní brothers ≠ each other; ≠ generic "Qazvíní"/"Muhammad Qazvíní"; ≠ Mírzá Muḥammad-‘Alíy-i-Nahrí.
