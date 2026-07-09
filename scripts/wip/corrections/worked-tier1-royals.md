# Worked Tier-1 — Royals + Key Merges/Firewalls (Dawn-Breakers, doc 21308)

> Beat-general-knowledge worked records for 8 figures, mined corpus-wide (Dawn-Breakers 21308 + footnotes 40108;
> GPB 21310; Balyuzi 462/466/467; Taherzadeh 429–432; Child of the Covenant 426; Covenant of Bahá'u'lláh 427).
> READ-ONLY. No DB writes performed. All entity_ids verified live this session (graph_entities + graph.db sidecar).
> Op schema per REVIEW-LEDGER: TYPE | targets | result | EVIDENCE (cid/?paraId + reasoning) | confidence | NEEDS-USER.
> Citation form (working): `https://oceanlibrary.com/dawn-breakers_nabil?paraId=para_NNNN`.

---

## 1. 619695 "Sháh" — anaphoric title → SPLIT by chapter (NEEDS-USER: the per-mention boundary)

- **Entity:** `619695` "Sháh" · person · 36 mentions in 21308 (one extracted node) · alias {"Sháh"@0.7}.
- **Finding:** This is an **anaphoric title**, not a person. Its 36 Dawn-Breakers mentions resolve to THREE distinct
  things across the narrative's chronology. It must be split, not kept as one "Sháh."

**Three referent-classes inside 619695 (read corpus-wide):**

1. **GENERIC / abstract monarchy (Townshend's Introduction)** — para_26, 43, 60, 61, 67, 70, 80 (all pi-range
   Introduction prose by George Townshend, with embedded Lord Curzon quotations). These are *"a Sháh"* / *"the
   character of the Persian monarchy"* in the abstract — **NOT a named person**. → RETYPE/DROP from the person layer
   (title-generic), per the bare-title rule. EVIDENCE: `?paraId=para_26` *"Even when a S̱háh wished to make a just…"*;
   `?paraId=para_61` (Curzon, *"the divinity that doth hedge a throne in Persia"*). NB para_61 is also a stray
   Naw-Rúz mention-link (mis-extraction) — see entity 6.

2. **Muḥammad Sháh (619573)** — the Báb-era body, 1844 → Sept 1848 (his reign). para_356 (*"year '60"* = 1260 A.H. /
   1844), 510, 546 (*"the S̱háh… passing on horseback"* — Ṭihrán, Ḥájí Siyyid Javád), 576, 784, 786, 797 (the
   Baraghání heirs avenging Mullá Taqí, ~1847), 1014, 1441, 1623 (the royal summons to Ḥujjat while *"the Báb had
   meanwhile arrived in the neighbourhood of Ṭihrán on His way to Tabríz"* — 1848), 1633 (Ḥujjat before **Ḥájí Mírzá
   Áqásí**, Muḥammad Sháh's Grand Vizier — a decisive Muḥammad-Sháh-era marker). The presence of **Ḥájí Mírzá Áqásí**
   (1219336) as vizier is the firmest discriminator: Áqásí served Muḥammad Sháh and fell at his death.

3. **Náṣiri'd-Dín Sháh (keeper 1219335)** — post-accession (Sept 1848 →), the Amír-Niẓám period and the 1852–53
   reprisals. para_1663, 1683, 1686, 1715, 1719 (the **Amír-Niẓám** / Amír-Túmán orders against Zanján, 1850 — Mírzá
   Taqí Khán was *Náṣiri'd-Dín's* vizier), 1824, 1876 (*"the S̱háh had ordered to be distributed among the
   prisoners"* — Síyáh-Chál), 1884, 1891, 1893, 1895, 1896 (*"The alarming reports received by the S̱háh, who had
   scarcely recovered from his wounds"* — the **1852 attempt on Náṣiri'd-Dín's life**), 1901, 1907, 1920. The
   attempt-on-the-Sháh's-life and the Amír-Niẓám together pin these unambiguously to Náṣiri'd-Dín.

- **PROPOSED BOUNDARY:** the pivot is **Muḥammad Sháh's death, 4 Sept 1848**, which in the narrative coincides with
  the Báb's **Tabríz examination (1848)** and the rise of the **Amír-Niẓám**. Concretely: Introduction paras (≤ para_80)
  → DROP (generic); body paras up to and including the Ḥujjat-summons / Ḥájí-Mírzá-Áqásí thread (≈ **para_356–1633**)
  → **Muḥammad Sháh (619573)**; from the **Amír-Niẓám** orders onward (≈ **para_1663–1920**) → **Náṣiri'd-Dín Sháh
  (1219335)**. Transitional paras around the 1848 accession (e.g. para_1014 Ṭabarsí; para_1441 the 1850 Yazd date which
  is already Náṣiri'd-Dín) need the human eye — a few late-1848/1849 mentions could fall either side.
- **OP:** SPLIT(619695 → [DROP generic-Introduction uses; reassign body uses to 619573 Muḥammad Sháh OR 1219335
  Náṣiri'd-Dín Sháh by chapter/date]).
- confidence: likely (the two-monarch division is certain; exact per-mention cut at the 1848 seam is the soft part).
- **NEEDS-USER: Y** — the per-mention chapter boundary (especially the 1848-accession transitional paras 1014, 1441,
  and anything between the Tabríz exam and the Amír-Niẓám's first orders). Do NOT blind-merge into one Sháh.

---

## 2. 1227689 "Náṣiri'd-Dín S̱háh" → MERGE into the Náṣiri'd-Dín keeper

- **Entity:** `1227689` "Náṣiri'd-Dín S̱háh" (sub-macron form) · person · 2 mentions in 21308, 35 corpus-wide ·
  aliases {Náṣiri'd-Dín S̱háh, Náṣiri'd-Dín Mírzá, Náṣiri'd-Dín[pg 647] S̱háh, "his/my sovereign", "your Majesty", "the S̱háh"}.
- **OP: MERGE | keeper `1219335` "Náṣiri'd-Dín Sháh" ← [`1227689`]** — the sub-macron GPB orthography (`S̱háh`) is the
  same monarch as the plain-form keeper. This aligns with the GPB cohort's already-recorded merge
  (gpb.md A4: keeper 1219335 ← [1227689, 1219449 "Náṣiri'd-Dín Mírzá", 1220238]). **Keeper is 1219335, NOT 1227689.**
- **DESCRIBE (1219335):** Náṣiri'd-Dín Sháh (1831–1896), 4th Qájár monarch. **Crown-prince ("Náṣiri'd-Dín Mírzá")
  during the Báb's 1848 Tabríz examination**, before whom (as heir-apparent, presiding) the Báb was interrogated;
  **acceded to the throne Sept 1848** at age ~17 on Muḥammad Sháh's death, with **Mírzá Taqí Khán (the Amír-Niẓám)**
  as his first Grand Vizier — the vizier who decreed the Báb's martyrdom (July 1850, Tabríz) and crushed the Zanján
  upheaval. Survived the **1852 attempt on his life** by a few deranged Bábís, which he used as pretext for the
  general massacre and Bahá'u'lláh's Síyáh-Chál imprisonment. GPB fixes his character as the **"Prince of
  Oppressors."** Assassinated 1896. (GPB beats general knowledge here: the crown-prince-at-the-examination detail +
  the GPB epithet + the causal chain to the Síyáh-Chál.)
- **side:** opponent. **dates:** b. 1831 · crown-prince at 1848 Tabríz exam · Sháh 1848 · d. (assassinated) 1896.
- **EVIDENCE:** GPB 21310 (¶21055901 "Prince of Oppressors", per gpb-enrichment-rulers.md); DB body paras 1663–1920
  (the Amír-Niẓám/Síyáh-Chál arc, see entity 1). 1227689's own 2 DB mentions are this monarch.
- **FIREWALL:** ≠ Muḥammad Sháh (619573, his predecessor/grandfather's-line — actually his father). **RELATE:**
  son→ Muḥammad Sháh (619573); appointed→ Amír-Niẓám / Mírzá Taqí Khán (1219327).
- confidence: verified (merge); GPB-characterization verified. **NEEDS-USER: N.**

---

## 3. 1219657 "Prince Ḥamzih Mírzá" — FIREWALL ≠ Prince Mihdí-Qulí Mírzá

- **Entity:** `1219657` "Prince Ḥamzih Mírzá" · person · 33 mentions in 21308 · aliases {Prince Ḥamzih Mírzá@0.95, "the prince"@0.7}.
- **DESCRIBE:** Ḥamzih Mírzá (**Ḥis̱hmatu'd-Dawlih**), a Qájár prince, **Governor-General of Áẕarbáyján** in the
  Náṣiri'd-Dín period; the senior royal figure in the **second Nayríz upheaval / the Ṭihrán-directed reprisals**
  context of the later chapters (his forces and orders appear in the Nayríz/Zanján late narrative). Distinct prince,
  distinct theatre from the Ṭabarsí commander. (Capture the role; the corpus uses bare "the prince" for him in his own
  chapters — anaphora resolves to Ḥamzih within those.)
- **side:** opponent (govt commander against the Bábís). **dates:** active c. 1850–53.
- **OP: FIREWALL | `1219657` Prince Ḥamzih Mírzá ≠ `1219598` Prince Mihdí-Qulí Mírzá.** Two distinct Qájár princes,
  both heavily mentioned (33 vs 14). **Mihdí-Qulí Mírzá** = the **Ṭabarsí** commander (the Qur'án-oath truce-betrayal
  against Quddús & Mullá Ḥusayn, Mázindarán 1848–49). **Ḥamzih Mírzá** = a separate prince in a separate campaign.
  Also ≠ Fírúz Mírzá (1219612, Nayríz/Shíráz gov.) and ≠ Muḥammad-‘Alí Mírzá. (Confirms the db-nayriz-tabarsi F-MQ
  firewall.)
- **EVIDENCE:** db-nayriz-tabarsi.md F-MQ; 1219598's mentions are the Ṭabarsí truce/betrayal (para_988–1107 thread);
  1219657's 33 are its own chapter set. The shared "Prince … Mírzá" pattern + "the prince" anaphora is exactly the
  collision NER produced — keep DISTINCT.
- **⚠ ALSO firewall the reused name "Ḥamzih":** ≠ Mullá Muḥammad-i-Ḥamzih (the anti-violence Bárfurúsh moderate,
  db-nayriz #N6) ≠ any Ḥamzih event-node. "Ḥamzih" recurs; this entity is the *Prince* only.
- confidence: verified (firewall). **NEEDS-USER: N** (identity of Ḥamzih Mírzá's exact title/province = light, sourced).

---

## 4. 614456 "Muḥammad" — the Prophet Muḥammad — FIREWALL ≠ the many Mullá/Mírzá Muḥammads

- **Entity:** `614456` "Muḥammad" · person · 31 mentions in 21308 · aliases {"Muḥammad, the Apostle of God"@0.95,
  Muḥammad, "the Prophet", "the Apostle of God", "Muḥammad the Messenger of God", Sháh-Muḥammad, Ḥájí Muḥammad,
  "Muḥammad the Son of Ḥasan", [Muḥammad]}.
- **DESCRIBE:** **Muḥammad ibn ‘Abdu'lláh (570–632 CE), the Prophet-Founder of Islám**, the Apostle of God / Seal of
  the Prophets, Manifestation of God whose Dispensation the Báb's Revelation succeeds and fulfils. In Dawn-Breakers He
  is invoked as the Author of the Qur'án and the prior Manifestation in the prophetic chain — the standard against
  whom the Báb's station and the Qá'im prophecies are measured.
- **side:** other (a prior Manifestation; not a Bábí/Bahá'í/opponent actor in the narrative). **dates:** 570–632 CE.
- **OP: FIREWALL** — this entity must hold ONLY the Prophet. **CLEAN BAD ALIASES** that betray conflation with
  namesakes/titles:
  - **"Sháh-Muḥammad"** — NOT the Prophet; a separate man (a "Sháh-Muḥammad" / royal-name form). ALIAS-REMOVE.
  - **"Ḥájí Muḥammad"** — a generic mortal honorific+name; NOT the Prophet. ALIAS-REMOVE.
  - **"Muḥammad the Son of Ḥasan"** — this is the **Twelfth Imám (Muḥammad ibn al-Ḥasan, the Hidden Imám / Qá'im)**,
    a DISTINCT entity from the Prophet Muḥammad ibn ‘Abdu'lláh. ALIAS-REMOVE → belongs to the Qá'im/Hidden-Imám entity
    (cf. 1227649 Qá'im, 638935 "Imám Mihdí"). Do NOT collapse the Hidden Imám into the Prophet.
- **FIREWALL ≠** the dozens of mortal Muḥammads in the corpus, e.g.: Muḥammad Sháh (619573), Mullá Muḥammad (619151),
  Mírzá Muḥammad-‘Alí cluster (see entity 8), Muḥammad-‘Alíy-i-Bárfurúshí = Quddús (1219859), Mullá Muḥammad-i-Mámáqání
  (1060778, the mujtahid who signed the Báb's death-warrant), etc. A fuzzy `%muḥammad%` must never pull any of these
  into the Prophet entity.
- **EVIDENCE:** alias-list inspection (graph.db) shows the conflation directly; the "the Prophet"@0.7 + "Apostle of
  God"@0.7 aliases are correct for the Prophet. The three flagged aliases are the contamination.
- confidence: verified (identity); alias-cleanups verified by name-analysis. **NEEDS-USER: N.**

---

## 5. 1219665 "Siyyid-i-Báb" → MERGE into the Báb (1219258)

- **Entity:** `1219665` "Siyyid-i-Báb" · person · 29 mentions in 21308 · aliases {"The Siyyid-i-Báb"@0.95,
  "Siyyid-i-Báb"@0.95, "the Siyyid"@0.7, "this Youth"@0.7}.
- **OP: MERGE | keeper `1219258` "the Báb" ← [`1219665` "Siyyid-i-Báb"].** "Siyyid-i-Báb" = **the Báb Himself**
  (Siyyid ‘Alí-Muḥammad, the Siyyid who is the Báb) — His own title, literally "the Siyyid, the Báb." The aliases
  "the Siyyid" and "this Youth" are anaphoric references to Him.
- **⚠ TITLE-TRAP (do NOT confuse):** "Siyyid-i-Báb" (= the Báb) is **NOT** the **"Bábu'l-Báb"** title (= the Gate of
  the Gate = **Mullá Ḥusayn-i-Bushrú'í**, 1219326). The `%báb%` fuzzy match collapses both; they are opposite
  referents. "Siyyid-i-Báb" → the Báb; "Bábu'l-Báb" → Mullá Ḥusayn. Keep that wall.
- **EVIDENCE:** db-roster-attribution.md A1 (alias set {The Siyyid-i-Báb, Siyyid-i-Báb, the Siyyid, this Youth}; folds
  into keeper 1219258). Confirms the same merge target as the LEDGER (1219258 the Báb ← 1219478/1219665).
- **DESCRIBE (keeper context):** the Báb = Siyyid ‘Alí-Muḥammad of Shíráz (1819–1850), Founder of the Bábí
  Dispensation, the Qá'im, the Gate to "Him Whom God shall make manifest." side: **Bábí** (His own dispensation).
- confidence: verified (merge). **NEEDS-USER: N.**

---

## 6. 619760 "Naw-Rúz" — event (CONFIRM type; chronological-anchor)

- **Entity:** `619760` "Naw-Rúz" · **event** · 25 mentions in 21308 · alias {Naw-Rúz@0.7}.
- **DESCRIBE:** Naw-Rúz, the Persian/Bahá'í New Year (vernal equinox, ~21 March), 1st day of the month of Bahá. In
  Dawn-Breakers it is overwhelmingly a **recurring chronological anchor** — Nabíl dates events by *"the Nth Naw-Rúz
  after the Declaration of the Báb"*: 2nd (para_554, 1262 A.H., Báb still in Shíráz), 4th (para_719, 1264 A.H., eve of
  the Báb's arrival at Máh-Kú), 7th (para_1787, 1267 A.H., a month and a half after the Zanján struggle ended), plus
  "the day of Naw-Rúz" markers in the Ṭabarsí (para_1089, 1265 A.H., Quddús's written message) and Vaḥíd/Nayríz
  threads (para_1445). Also the Báb's own celebration of the festival in His Shíráz home (para_457/466).
- **OP:** CONFIRM type = `event` (correctly typed; no merge). It is genuinely an event/festival, not a person.
- **⚠ NOISE:** para_61 (Curzon's Persian-monarchy passage) carries a stray Naw-Rúz mention-link that is actually about
  the Sháh's banquet, not Naw-Rúz — a minor mis-extraction; low priority cleanup, not a merge issue.
- **EVIDENCE:** the dated "Nth Naw-Rúz after the Declaration" formula across para_554/719/1787 is the proof it functions
  as the narrative's calendar spine. confidence: verified. **NEEDS-USER: N.**

---

## 7. 1220020 "Áqáy-i-Kalím" → MERGE 613792 (Mírzá Músá); FIREWALL ≠ Mírzá Yaḥyá

- **Entity:** `1220020` "Áqáy-i-Kalím" · person · 24 mentions in 21308 · aliases {"the children of the noble… now
  deceased Áqáy-i-Kalím"@0.95, Áqáy-i-Kalím@0.9, "the brother of Bahá'u'lláh"@0.7, "Mírzá Musa"@0.7}.
- **OP: MERGE | keeper `1220020` "Áqáy-i-Kalím" ← [`613792` "Mírzá Músá"].** Nabíl equates them explicitly in the
  Preface (pi 89, para_121): *"Mírzá Músá, Áqáy-i-Kalím, brother of Bahá'u'lláh."* Same person. (613792's own aliases
  — "Ḥájí Mírzá Músáy-i-Qumí", "Mírzá Músá the Bábí", "the brother", "the brother-in-law", "Músá" — are all this man.)
- **DESCRIBE:** **Mírzá Músá, surnamed Áqáy-i-Kalím** — Bahá'u'lláh's **loyal full brother** (same father Mírzá
  Buzurg, same mother), His chief support and confidant from the earliest Bábí days through the Baghdád, Adrianople,
  and ‘Akká exiles; one of **Nabíl's named informants** for the Dawn-Breakers (Preface). The faithful brother who
  stood with Bahá'u'lláh throughout — the counter-figure to the treacherous half-brother. Taherzadeh (429–432) records
  his steadfast service across the whole Adrianople/‘Akká arc. (Beats general knowledge: the informant role + full- vs
  half-brother distinction + the Preface attribution.)
- **side:** Bahá'í (Bahá'u'lláh's dispensation; faithful to the end). **dates:** d. before 1881 (Nabíl's "now
  deceased Áqáy-i-Kalím" alias dates the writing).
- **OP: FIREWALL | `1220020`/`613792` Áqáy-i-Kalím (Mírzá Músá) ≠ `620167` Mírzá Yaḥyá** (the **half-brother**, Ṣubḥ-i-
  Azal — the Covenant-breaker, opponent by final allegiance). Same "brother of Bahá'u'lláh" relationship-label
  collides them; they are opposite figures. Músá = faithful FULL brother; Yaḥyá = treacherous HALF brother. Also ≠
  Mírzá Mihdí (the Purest Branch) and ≠ ‘Abdu'l-Bahá ("the Most Great Branch").
- **RELATE:** brother (full)→ Bahá'u'lláh (1227553); informed→ Nabíl (620216, per db-roster-attribution RELATE);
  ≠-firewalled-from half-brother Mírzá Yaḥyá.
- **EVIDENCE:** db-roster-attribution.md (MERGE keeper 1220020 ← 613792, pi 89 equation; RELATE Nabíl ←informed-by←
  Áqáy-i-Kalím). confidence: verified. **NEEDS-USER: N.**

---

## 8. 638227 "Mírzá Muḥammad-‘Alí" — CATASTROPHIC poly-referent node → SPLIT (NEEDS-USER: identity)

- **Entity:** `638227` "Mírzá Muḥammad-‘Alí" · person · **24 in 21308, 220 corpus-wide** (176 in *Child of the
  Covenant* 426, 33 across Taherzadeh 429–432, 11 in *Covenant of Bahá'u'lláh* 427). The highest-collision name in the
  task. Its alias list alone proves the conflation: it carries {Qazvíní@0.95, Nahrí@0.95, Zunúzí@0.7,
  Ṭabíb-i-Zanjání@0.7, "the companion of the Báb", **Ghusn-i-Akbar / the Greater Branch / "His unfaithful brother" /
  "son of Bahá'u'lláh"**}. These are **six-plus different men** fused into one node.
- **FINDING:** 638227 is NOT one person. Read corpus-wide, it splits cleanly:

  **A. The arch-breaker — Mírzá Muḥammad-‘Alí, son of Bahá'u'lláh** (the BULK: 176 in doc 426 + the Taherzadeh
  mentions). Ghusn-i-Akbar / "the Greater Branch" / arch-Covenant-breaker. *Child of the Covenant* para_5097997:
  *"The Arch-breaker of the Covenant of Bahá'u'lláh was Mírzá Muḥammad-‘Alí, the eldest son of Bahá'u'lláh's second
  wife, Mahd-i-'Ulya."* → side: **opponent**. **NB a CLEAN keeper for him already exists: `614534` "Muḥammad-‘Alí"**
  (11 mentions, ALL in doc 426, single-referent = the arch-breaker; verified by its contexts: *"established secret
  links with Jamál-i-Burujiridi", "claim to be the revealer of the verses of God", "rebuked… chastised him with His
  own hands"*). → The arch-breaker mentions in 638227 should route to **614534** (keeper), not stay on 638227.

  **B. The Dawn-Breakers figures (the 24 mentions in 21308) — at least 5 DISTINCT men, none of them the arch-breaker:**
  1. **Mírzá Muḥammad-‘Alí, Ṭáhirih's brother-in-law** — para_290/291: *"her sister's husband, Mírzá Muḥammad-‘Alí,
     from Qazvín"* who carried Ṭáhirih's sealed letter to the Báb. (Possibly = the Qazvíní below; verify.)
  2. **Mírzá Muḥammad-‘Alíy-i-Nahrí** — para_325/476/479/606: siyyid of Iṣfahán, *"whose daughter was subsequently
     joined in wedlock with the Most Great Branch"* (i.e. **Munírih Khánum's father — the father-in-law of
     ‘Abdu'l-Bahá**), brother of Mírzá Hádí, son of Mírzá Ibráhím (father of the Sulṭánu'sh-Shuhadá). A key
     Iṣfahán-family anchor. side: **Bábí/Bahá'í**.
  3. **Mírzá Muḥammad-‘Alíy-i-Qazvíní** — para_825/829: *"one of the Letters of the Living"*, Quddús's companion from
     Mashhad toward Ṭabarsí. A Letter of the Living. side: **Bábí** (martyr).
  4. **Mírzá Muḥammad-‘Alíy-i-Zunúzí, surnamed Anís** — para_1556/1563/1568/1572/1575: **the youth martyred together
     with the Báb** in Tabríz (suspended on the same rope), stepson of Siyyid ‘Alíy-i-Zunúzí. side: **Bábí** (martyr).
     **⚠ A dedicated entity already exists: `1219654` "Anís"** (8 mentions; per db-zanjan-babarc.md #15, canonical
     "Muḥammad-‘Alíy-i-Zunúzí, surnamed Anís"). → These Zunúzí mentions in 638227 route to **1219654**, not 638227.
  5. **Mírzá Muḥammad-‘Alíy-i-Ṭabíb-i-Zanjání** — para_1768/1803: physician of Zanján, **one of Nabíl's named
     informants** for the Zanján account, himself a martyr. side: **Bábí** (martyr).
  6. *(plus)* **Mírzá Muḥammad-‘Alí, physician of Hamadán** — para_1630: eldest son of Mírzá Ma‘ṣúm, *"the leading
     physician of Hamadán, who, though not a believer, was a true lover of the Báb."* side: **other** (sympathizer).

- **OP: SPLIT(638227 → by nisba/context)** — route the arch-breaker mass to keeper **614534**; route the DB-21308
  mentions to: Nahrí (new or existing Iṣfahán entity), Qazvíní-LotL (new), **1219654 Anís** (existing), Ṭabíb-i-Zanjání
  (new), Hamadán-physician (new), and Ṭáhirih's-brother-in-law (likely = Qazvíní; confirm). Plus the para_871 Dayyán
  thread and para_479 (Nahrí + brother) belong to #2.
- **FIREWALL:** the arch-breaker (614534/638227-mass) ≠ all five Dawn-Breakers Bábís above; ≠ 614534's namesakes; the
  five DB men are pairwise distinct (Nahrí ≠ Qazvíní-LotL ≠ Anís-Zunúzí ≠ Ṭabíb-i-Zanjání ≠ Hamadán-physician). ≠
  Mír Muḥammad-‘Alí (1064476, the Sang-Sar Shaykhí father). ≠ Mírzá Muḥammad-‘Alíy-i-Qazvíní the *informant* named in
  the Preface (1219638 is "Mírzá Aḥmad-i-Qazvíní" — different informant; do not cross-wire).
- **EVIDENCE:** all para_NNNN above read verbatim from 21308 this session; doc-distribution query (426=176, Taherzadeh
  =33) proves the arch-breaker bulk; alias list proves the fusion. db-zanjan-babarc.md #14/#15 confirms Anís=1219654.
- confidence: verified (that 638227 is a poly-referent fusion and must be split; arch-breaker keeper = 614534; Anís =
  1219654). **NEEDS-USER: Y** — (a) confirm the split partition and which DB mentions create new entities vs route to
  existing (1219654 Anís; a Nahrí entity; a Qazvíní-LotL entity); (b) confirm Ṭáhirih's-brother-in-law (para_290/291)
  = the Qazvíní LotL or a separate man; (c) decide keeper for the arch-breaker (614534 clean vs renaming 638227).

---

## CROSS-CUTTING NOTES
- **Keeper for Náṣiri'd-Dín = 1219335** (the LEDGER line 31 said "merge 1227689 into the keeper"; the keeper the GPB
  cohort established is 1219335, not 1227689). Reconciled here.
- **638227 is the single worst node in this batch** — it fuses the arch-breaker (220 corpus mentions) with 5+ minor
  Dawn-Breakers Bábís. Do not let any merge stamp the arch-breaker's `opponent` side onto the Bábí martyrs, nor
  vice-versa.
- All operations are PROPOSALS. No INSERT/UPDATE/DELETE issued. No files created on tower-nas. No pm2/kill.
