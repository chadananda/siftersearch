# Báb's Family & Letters of the Living — Cross-Corpus Entity Verification

Read-only verification. `entity_mentions` counts are the live measure (the `graph_entities.mention_count` column is STALE). All consolidation/typing/linking below is RECOMMENDED — no writes were performed.

---

## 1. Letters of the Living — SET / organization

### VERDICT: keeper **1219345** `Letters of the Living` / type=**organization** (already correct) ← merge concept/variant duplicates
**Confidence: HIGH**

The SET entity exists and is already typed `organization`. There are duplicate/variant graph nodes that fragment the set; they should be consolidated into the keeper (the SET), while the genuinely distinct *individual* "nth Letter of the Living" WORK/position nodes are left alone or linked, not merged.

| id | name | type | mentions | disposition |
|----|------|------|---------:|-------------|
| **1219345** | Letters of the Living | organization | 123 | **KEEPER (the set of 18)** |
| 1219329 | Letters of the Living | concept | 58 | MERGE → 1219345 (same set, wrong type) |
| 1219636 | Letter of the Living | concept | 18 | MERGE → 1219345 (singular generic = the title/role) |
| 1219631 | the first Letter of the Living | work | 8 | KEEP separate — refers to Mullá Ḥusayn (first LotL); link `member-of` → 1219345 |
| 1227632 | Twentieth Letter of the Living | work | 5 | KEEP separate — NOTE: there is no "20th"; this is the Báb counted as completing Váḥid (His Báb-as-19th symbolism). Do NOT fold into the set of 18. FLAG for review. |
| 1227634 | Nineteenth Letter of the Living: the Bab Himself | concept | 3 | KEEP separate — the Báb completing the First Váḥid (18 + Báb = 19). NOT a member. Link to the Báb (1070538), not the set. |
| 1219545 / 1238266 | (The) Last Letter of the Living | work | 1 / 1 | MERGE the two together; refers to last surviving LotL. Link to set, do not merge into it. |
| 1222048 | Tablets to the Letters of the Living | work | 1 | KEEP — a WORK addressed to the set; link `about` → 1219345. |

### CLOSED SET OF 18 (Hurúf-i-Ḥayy; web + corpus confirmed)
"Ḥayy" = 18 numerically; the 18 + the Báb = First Váḥid (19). One woman (Ṭáhirih), seventeen men. The canonical members:
Mullá Ḥusayn-i-Bushrú'í (Bábu'l-Báb, the first), Muḥammad-Ḥasan (his brother), Muḥammad-Báqir (his nephew), Mullá ʿAlí-i-Bastámí, Mullá Khudá-Bakhsh-i-Qúchání (later Mullá ʿAlí), Mullá Ḥasan-i-Bajistání, Siyyid Ḥusayn-i-Yazdí, Mírzá Muḥammad Rawḍih-Khán-i-Yazdí, Saʿíd-i-Hindí, Mullá Maḥmúd-i-Khúʼí, Mullá Jalíl-i-Urúmí, Mullá Aḥmad-i-Ibdál-i-Marághiʼí, Mullá Báqir-i-Tabrízí, Mullá Yúsuf-i-Ardibílí, Mírzá Hádí (son of Mullá ʿAbdu'l-Vahháb-i-Qazvíní), Mírzá Muḥammad-ʿAlíy-i-Qazvíní, Ṭáhirih (Fáṭimih Baraghání — **keeper 1219340**), and Quddús (Muḥammad-ʿAlíy-i-Bárfurúshí, the last to be enrolled).

### RECOMMENDED LINKS (member-of → 1219345)
Link the member person-entities already in the graph as `member-of`/`part-of` → 1219345. **Ṭáhirih (1219340)** is the highest-priority link (she is both a LotL and a top-roster figure). Quddús, Mullá Ḥusayn, Siyyid Ḥusayn-i-Yazdí etc. where present. The keeper currently has **0 outgoing relations** — members are entirely unlinked. This is the main remaining work for the set.

---

## 2. followers of the Báb — keeper **1219655**

### VERDICT: keep as type=**organization** (broad collective) — **USER POLICY DECISION REQUIRED**
**Confidence: MEDIUM (disposition is a policy call, not a fact)**

85 mentions. Sampled context = a genuine, recurring *collective* referent ("one of the followers of the Báb, named Mírzá Áqáy-i-Rikáb-Sáz…"; "the assembled followers of the Báb"). It behaves like a loose collective noun, not a defined organization with membership (unlike the closed 18 of LotL).

**FLAG — policy choice for the user:**
- **Option A (keep):** retain as `organization` (or better, a `group`/`collective` type if the vocabulary supports it). It is a real, frequently-referenced collective and is useful as a graph hub for the Bábí community.
- **Option B (drop):** delete as too-generic a common-noun collective with no fixed membership — it adds graph noise and overlaps with "Bábís"/"the Bábí community."
Recommendation: **keep but retype to a collective/group label** if available; it is distinct from the doctrinally-closed LotL set and should never be merged with 1219345.

---

## 3. Ḥájí Mírzá Siyyid ʿAlí — the Báb's maternal uncle / guardian

### VERDICT: keeper **1219383** `Ḥájí Mírzá Siyyid ʿAlí` / type=**person** (correct) — NO merges
**Confidence: HIGH**

41 mentions (the recipe's name-LIKE undercounted because the stored name uses a straight apostrophe). Corpus-confirmed: "Ḥájí Mírzá Siyyid ʿAlí, the maternal uncle of the Báb—who became His guardian when His father died"; he received Quddús in Shíráz and "conducted the Báb to His home." One of the **Seven Martyrs of Ṭihrán**. He was the **brother of the Báb's mother** (web-confirmed).

### FIREWALL (do NOT merge any of these into 1219383):
| id | name | mentions | who it actually is | verdict |
|----|------|---------:|--------------------|---------|
| **1070538** | Siyyid ʿAlí-Muḥammad | 11 | **the Báb HIMSELF** (+ a namesake son of Vaḥíd) | NEVER merge. (Ironically holds the cleanest uncle-description paragraph, but the entity is the Báb.) |
| 633550 | Siyyid ʿAlí | 9 | **MIXED/distinct**: Siyyid ʿAlíy-i-Zunúzí (father of the martyr-youth); the name conferred on Mullá Ḥusayn; **Ḥájí Siyyid ʿAlí Afnán** the Covenant-breaker | NEVER merge — this node is itself impure and unrelated to the uncle. Flag for its own cleanup. |
| — | "Ḥájí Mírzá Siyyid ʿAlí" the cleric (the mujtahid) | n/a | a different ʿAlí (cleric/judge) | not found as a competing node; remain alert if one surfaces. |

---

## 4. Khadíjih Bagum — the Báb's wife

### VERDICT: keeper **625311** `Khadíjih Bagum` / type=**person** (correct)
**Confidence: HIGH**

18 mentions; 69 relations (well-connected). Corpus-confirmed as the Báb's wife — her father Mírzá ʿAlí's house adjoined the uncle's; the marriage feast was held in her father's house. Daughter of Ḥájí Mírzá ʿAlí; her brothers' descendants form part of the Afnán.

### FIREWALL (do NOT merge):
- **1174501** `Khadíjih` (7 mentions) = a DIFFERENT Khadíjih — wife of **Ḥujjat** (Zanján), mother of baby Hádí. Unrelated. Do not merge.

---

## 5. Fáṭimih Bagum — the Báb's mother  ★ CRITICAL FIREWALL

### VERDICT: keeper **638676** `Fáṭimih Bagum` / type=**person** — near-empty STUB; needs description + linking, NO merges
**Confidence: HIGH on the firewall; LOW on the keeper's data quality**

Entity 638676 exists, correctly named/typed `person`, but has **0 entity_mentions** and only **1 relation** (a noise `co-occurs|Karbilá`). It is effectively an unpopulated stub. The mother is real and web-confirmed (sister of uncle 1219383; daughter of Mírzá Siyyid Muḥammad Ḥusayn; mother of ʿAlí-Muḥammad the Báb; d. 1881; her relatives = the Afnán). Recommend: add a description and link `mother-of` → Báb (1070538), `sibling-of` → uncle (1219383), `parent-of`/member-of → Afnán (1234047). Do NOT inflate by merging the lookalikes below.

### FIREWALL — three distinct "Fáṭimih" entities that must NEVER fold into the mother:
| id | name | mentions | who it actually is | verdict |
|----|------|---------:|--------------------|---------|
| **1060989** | Fáṭimih-Bagum | 5 | A DIFFERENT woman — a **27-year-old maiden martyr-heroine of Yazd** who, barefoot and veiled, led chained prisoners to Iṣfahán and pleaded their case to Prince Ẓillu's-Sulṭán (Balyuzi/Taherzadeh persecution narrative). Same name, ~1900s, unmarried — **cannot be the Báb's mother**. | NEVER merge. (Most dangerous lookalike — identical spelling.) |
| 638207 | Fáṭimih | 21 | Theological/religious context (Hidden Words, Siyyid Káẓim, Mecca) — Fáṭimih-of-the-Prophet register, not a Bábí-era person. | NEVER merge. |
| 1238980 | Fáṭimih | 26 | Bayán / Hidden-Book-of-Fáṭimih / Yaḥyá doctrinal context — again the Prophet's-daughter / scriptural Fáṭimih. | NEVER merge. |
| 638225 | Fáṭimih Khánum | 2 | **Mahd-i-ʿUlyá**, Bahá'u'lláh's second wife. | NEVER merge. |
| 1219340 | Ṭáhirih (= Fáṭimih Baraghání) | (roster keeper) | The poet-LotL; "Fáṭimih" is her given name. | NEVER merge into the mother. The task's central firewall: **Fáṭimih Bagum (mother) ≠ Ṭáhirih (Fáṭimih Baraghání)**. |

---

## 6. The Afnán — the Báb's relatives, as a family / organization

### VERDICT: keeper **1234047** `Afnán` / type=**organization** ← merge 1236939; do NOT merge 1170278
**Confidence: HIGH**

The Afnán = the maternal relatives of the Báb plus the descendants of Khadíjih's brothers and his maternal uncles (web-confirmed). Best keeper is **1234047** (14 mentions, true family context: Ḥájí Mírzá Habíbu'lláh-i-Afnán, Áqá Mírzá Áqá / Núru'd-Dín, "distinguished members of the Afnán family").

| id | name | type | mentions | disposition |
|----|------|------|---------:|-------------|
| **1234047** | Afnán | organization | 14 | **KEEPER (the family)** |
| 1236939 | Afnán family | organization | 3 | MERGE → 1234047 (exact same referent: "Afnán family" memoirs/Istanbul business) |
| 1170278 | Afnán | concept | 15 | DO NOT MERGE — impure: its mentions are about the **Aghṣán** / Hands of the Cause / Covenant "Heritage," not the Afnán family. Re-extract or drop; flag as mislabeled. |

### Individual Afnán PERSONS (keep as own person-entities; link `member-of` → 1234047, do NOT merge into the family):
1061474 Muḥammad Afnán (4), 1154734 Siyyid Aḥmad-i-Afnán (3), 1177212 Mehri Afnán (3), 659473 Rúḥí Afnán (2), 1138056 Jenab Afnan (2), 641009 Elham Afnan (1), 1223278 Ḥájí Mírzá Taqí Afnán (1), 1231409 Ḥájí Mírzá Buzurg-i-Afnan (1).
NOTE: **Ḥájí Siyyid ʿAlí Afnán** the Covenant-breaker appears folded inside the impure 633550 node — surface him as his own person and keep him OUT of both the uncle (1219383) and any positive Afnán framing if a Covenant-breaker distinction matters.

---

## SUMMARY OF KEEPERS
- LotL SET: **1219345** (org) ← merge 1219329, 1219636; link members (esp. Ṭáhirih 1219340). Keep "nth Letter" works separate.
- followers of the Báb: **1219655** (org) — USER POLICY: keep-as-collective vs drop.
- Uncle/guardian: **1219383** (person) — clean, no merges.
- Wife: **625311** (person) — clean.
- Mother: **638676** (person) — stub; populate + link; NEVER merge the lookalikes.
- Afnán family: **1234047** (org) ← merge 1236939; reject 1170278.

## SOURCES
- Bahaipedia: Fatimih Bagum; Khadíjih Bagum; The Báb; Letters of the Living
- Wikipedia: Afnán; Letters of the Living
- bahai-library.com Bahá'í Encyclopedia: Letters of the Living (Hurúf al-Ḥayy)
- Corpus (sifter.db + graph.db): Nabíl's Dawn-Breakers, Balyuzi *Khadíjih Bagum* (467) & *The Báb*, Taherzadeh, Adib Taherzadeh *Revelation* (Afnán genealogy)
