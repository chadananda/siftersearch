# Correction Set — Zanján Upheaval + Báb's-Life Arc + Consolidated Hard Cases

> READ-ONLY verification of cohort 3 (dawnbreakers-zanjan.md + dawnbreakers-bab-arc.md +
> dawnbreakers-HARD-CASES.md + dawnbreakers-hardcase-research.md) against the LIVE corpus on
> tower-nas. NO DB writes performed. All entity_ids are REAL live `graph_entities.id` values
> confirmed to have mentions in **doc_id 21308** (The Dawn-Breakers) via the graph.db sidecar
> `entity_mentions` roster. Citations use the working `?paraId=para_NNNN` scheme.
> source_url = https://oceanlibrary.com/dawn-breakers_nabil
>
> Authority order applied: GPB 21310 > Nabíl main 21308 > footnotes 40108; Balyuzi 466 / Ahdieh
> 11375 / Rabbani 16552 for facts the DB leaves bare.

---

## ⚠ CRITICAL TOPOLOGY FINDING — READ FIRST (affects the whole cohort)

**The MD source files' "dump NNN" numbers are NOT live `graph_entities.id` values.** They reference an
older/global extraction. Mapping every MD finding onto the CURRENT doc-21308 sidecar roster revealed that
**many MD merge-targets do not exist as separate entities in the live Dawn-Breakers sidecar at all.**
Verified zero-mention-in-21308 (so their proposed merges are MOOT here):

- **Majdu'd-Dawlih** (1219616 / 1237778) — 0 mentions in 21308.
- **Khadíjih Bagum** / "Wife of the Báb" (1220498, 625311, 935798, …) — 0 mentions in 21308.
- **"Mírzá Muḥammad-‘Alíy-i-Zunúzí"** person variants (1219652, 1238280, 1238735, 1240939) — 0 in 21308.
- **Muḥammad-Husayn-i-Maraghi'i** (1227616) — 0 in 21308.
- No standalone 21308 person-rows for Turshízí, Qumí, Kirmání (Seven-Martyrs roster) — confirms the
  "capture-from-Balyuzi" cases are genuinely absent (see Section B).

Consequence: most of the cohort's real, applicable operations are **RETYPE / MERGE-of-fragment / DROP**
on the entities that DO have 21308 mentions, **not** the cross-extraction merges the MD files describe.
Where an MD merge targets an entity absent from 21308, it is recorded as NEEDS-USER=Y (must be applied
against the global `graph_entities` set, not the 21308 sidecar — outside this read-only verification's
reach).

---

## ⚠⚠ TWO MD CLAIMS CONTRADICTED BY THE PRIMARY TEXT (highest-priority flags)

These reverse conclusions in the source MD files and the project state file. Both are grounded in
verbatim Nabíl text I read in full.

### FLAG 1 — "Siyyid Káẓim-i-Zanjání" is NOT an NER artifact. It is a REAL person named by Nabíl.
The state file (ERROR CATALOGUE) and dawnbreakers-bab-arc.md / HARD-CASES §C both assert
"Siyyid Káẓim-i-Zanjání = NER ARTIFACT, a back-formation from Siyyid Murtaḍá-y-i-Zanjání's nisba → DROP."
**This is wrong.** Verbatim, **21308 para_568** (the Shíráz arrest):

> "…found the Báb in the company of His maternal uncle and **a certain Siyyid Káẓim-i-Zanjání, who was
> later martyred in Mázindarán, and whose brother, Siyyid Murtaḍá, was one of the Seven Martyrs of Ṭihrán.**"

So Nabíl himself names Siyyid Káẓim-i-Zanjání as a distinct person (martyred in Mázindarán) AND as the
brother of Siyyid Murtaḍá. The "fate is unsupported / Mázindarán is garble" claim is false — it is in
the source. **DO NOT DROP.** This needs user adjudication because it overturns a prior "resolved" call.
EVIDENCE: ?paraId=para_568 (cid 21054157). confidence: verified (primary text). NEEDS-USER: Y.

### FLAG 2 — "Amír Arslán Khán, son of the Sálár" is NOT a hallucination. It is verbatim Nabíl.
dawnbreakers-zanjan.md (Hard Case 1) and HARD-CASES §A instruct: "DISCARD the NER hallucination gloss
'son of the Sálár, a rebel commander' (no corpus support)" and merge Amír Arslán Khán → Majdu'd-Dawlih
(Zanján governor). **Both halves are wrong for the live entity 1060805.** Verbatim, **21308 para_712**
(the Khurásán rebellion, NOT Zanján):

> "…leagued themselves with the **Sálár**, son of the Áṣifu'd-Dawlih… Ja‘far-Qulí Ḵhán-i-Námdár and
> **Amír Arslán Ḵhán, son of the Sálár**, who conducted the operations against the forces of the S̱háh,
> displayed the utmost cruelty…"

The live entity **1060805 "Amír Arslán Khán"** (1 mention, para_712) is the **Khurásán rebel commander,
son of the Sálár** — a DIFFERENT man from the Zanján governor Majdu'd-Dawlih (who is the maternal uncle
of Náṣiri'd-Dín Sháh and has 0 mentions in 21308). The "son of the Sálár" gloss is correct, not a
hallucination; and 1060805 must be FIREWALLED from Majdu'd-Dawlih, not merged into it.
EVIDENCE: ?paraId=para_712 (cid 21054234). confidence: verified. NEEDS-USER: Y (reverses a Section-A
"apply-by-default" instruction).

---

## OPERATIONS

Schema: TYPE | targets (live entity_ids) | result | EVIDENCE (cid / ?paraId + reasoning) | confidence | NEEDS-USER

### Báb fragments (Section A "the Bab fragmented" in state file)

1. **MERGE** | keeper **1219258** "the Báb" ← [**1219478** "Báb" (8 paras), **613854** "Báb" (3 paras)] |
   one Báb entity |
   1219478's mentions are all in the **Introduction** (para_29–51, George Townshend's section): genuine
   "the Báb" references, just fragmented (?paraId=para_29, para_32, para_38, para_51). 613854's 3 mentions
   are **image-caption alt-text** ("STEPS LEADING TO THE DECLARATION CHAMBER" para_238, "The Dawn-Breakers"
   para_336, "VIEW OF ZANJÁN" para_1603) — caption artifacts that mention "Báb"; fold into the Báb. |
   confidence: verified | NEEDS-USER: N

### Ḥujjat (Zanján leader — Section A "4 rows → 1")

2. **MERGE** | keeper **1219480** "Ḥujjat" (≈55 paras) ← [**1227591** "Hujjat-i-Zanjani" (2 paras)] |
   one Ḥujjat entity |
   1227591 para_513 "Mullá Muḥammad-‘Alí… a native of Zanján, whom the Báb… [surnamed Ḥujjat]"
   (?paraId=para_513) = same man; para_1627 is an image caption. 1219480's own para_513/1610 ("its chief
   figure was Ḥujjat-i-Zanjání") + para_916 ("Mullá Muḥammad-‘Alíy-i-Zanjání") confirm all three name-forms
   are one person. The MD's other two rows ("Mullá Muḥammad-‘Alíy-i-Zanjání", stub) have no separate
   21308 sidecar entity — already absorbed. | confidence: verified | NEEDS-USER: N

3. **FIREWALL** | **1219480** Ḥujjat ≠ Quddús (1219859) ≠ Mírzá Yaḥyá (620167) ≠ the Báb (1219258) |
   keep distinct | standard; no cross-mentions conflate them. | confidence: verified | NEEDS-USER: N

4. **DESCRIBE** | **1219480** ← "Mullá Muḥammad-‘Alíy-i-Zanjání, surnamed Ḥujjat; ablest and most formidable
   champion of the Báb at Zanján; led ~1,800 disciples in the upheaval; lost wife Khadíjih and infant son
   Hádí; died of a wound; corpse exposed/dragged. side: Bábí. Father: Mullá Raḥím-i-Zanjání (mujtahid)." |
   GPB-verbatim + 21308 para_1610–1762. | confidence: verified | NEEDS-USER: N

### Three Zanján commanders

5. **MERGE** | keeper **1219618** "Amír-Túmán" (16 paras) ← [**983846** "Muḥammad Khán" (1 para)] |
   one Muḥammad Khán, the Amír-Túmán |
   983846 para_1690 = "**Muḥammad Ḵhán, the Amír-Túmán**, at the head of five regiments" — identical locus
   to 1219618's para_1690 (?paraId=para_1690). The bare "Amír-Túmán" entity and "Muḥammad Khán" entity
   are the same general. | confidence: verified | NEEDS-USER: N

6. **FIREWALL** | **1219618** "the Amír-Túmán" (Muḥammad Khán, Zanján) ≠ **1219327** "Amír-Niẓám"
   (Mírzá Taqí Khán) ≠ bare **628450** "Amír" | keep distinct |
   the Amír-Niẓám only sent reinforcements (para_1690, para_1730); the bare alias "the Amír" must not
   collide. | confidence: verified | NEEDS-USER: N

7. **FIREWALL + flag** | **1060805** "Amír Arslán Khán" (Khurásán rebel, son of the Sálár) ≠
   Majdu'd-Dawlih (Zanján governor, 0 mentions in 21308) | keep distinct; DO NOT merge per MD |
   see FLAG 2. para_712 makes 1060805 the Khurásán rebel. The Zanján-governor merge (Amír Arslán Khán =
   Majdu'd-Dawlih = Governor of Zanján) targets entities absent from the 21308 sidecar and is therefore
   not applicable here; if applied at the global level it must NOT pull in 1060805. |
   confidence: verified | NEEDS-USER: **Y**

8. (Ṣadru'd-Dawliy-i-Iṣfahání) — **no distinct 21308 sidecar person-entity found.** Mentioned in narrative
   (para_1664 "the ambitious Ṣadru'd-Dawlih") under the Ḥujjat entity's paras. NEEDS-USER=Y to create as a
   light `opponent` entity if desired (imperial general, reprimanded by the Sháh). | confidence: likely |
   NEEDS-USER: Y

### Zaynab

9. **(VERIFIED, no-op)** | **900268** "Zaynab" (4 paras) | keep as single Bábí defender |
   para_1670–1674 = the village maiden who donned male attire under Ḥujjat (?paraId=para_1670). No
   fragmentation found in 21308. ALIAS-ADD candidate "Rustam-‘Alí" (disguise-name) is NOT present in the
   read paras — flag if the alias is wanted. | confidence: verified | NEEDS-USER: N

### Ḥujjat's family

10. **(VERIFIED firewall)** | **1174501** "Khadíjih" = **Ḥujjat's wife** (NOT Khadíjih-Bagum, the Báb's
    wife) | keep distinct |
    para_1744 "Ḥujjat… turned to his wife Ḵhadíjih, who was holding Hádí, their baby" (?paraId=para_1744).
    The Báb's-wife "Khadíjih Bagum" has 0 mentions in 21308, so no collision risk inside this doc. |
    confidence: verified | NEEDS-USER: N

11. **(NOTE)** Ḥujjat's son **Mihdí** and son **Ḥusayn** (the 7-yr-old who revealed the grave) and infant
    **Hádí** — no clean standalone 21308 person-rows surfaced under those bare names; captured inside the
    Ḥujjat narrative. The **Mihdí firewall** (Ḥujjat's son ≠ the other 7 Mihdís) holds — bare "Míhdí"
    (1219708) / "Mullá Mihdí" (632382) / "Imám Mihdí" (638935) / "Mihdí-Qulí Mírzá" (1064471) /
    "the Mihdí" (1227661) are distinct entities. confidence: verified | NEEDS-USER: N (firewall);
    Y (whether to mint Ḥujjat's-son Mihdí/Ḥusayn as light entities)

### Mullá Iskandar (Section A "one person, two theatres")

12. **(VERIFIED, no-op merge)** | **1013098** "Mullá Iskandar" (6 paras) already spans BOTH theatres |
    keep as one |
    para_514/515 = Ḥujjat's disciple sent to investigate at Zanján; para_669 = the same Mullá Iskandar
    commissioned by the Báb to deliver a message (Nayríz/Siyáh-Dihán theatre) (?paraId=para_669). One
    entity already covers both — no split needed, as the MD says. | confidence: verified | NEEDS-USER: N

13. **FIREWALL** | **1013098** "Mullá Iskandar" ≠ **630664** "Iskandar" (1 para) | keep distinct |
    630664 para_1491 is the Nayríz **Khájih sortie** martyr list (Táju'd-Dín etc.) — a bare "Iskandar"
    in a different context, NOT Ḥujjat's disciple. Low confidence on what 630664 actually is (possible
    fragment). | confidence: likely | NEEDS-USER: Y (resolve/identify 630664)

### Anís (youth-martyr) — Section A "3 rows → 1"

14. **RETYPE** | **1219654** "Anís" `work` → `person` | the youth-martyr, not a work |
    para_880 verbatim: "**Muḥammad-‘Alíy-i-Zunúzí, surnamed Anís**, was among those who heard of the
    message from the Báb in Tabríz" (?paraId=para_880) — unambiguously the person. The entity is
    mis-typed `work`. NOTE: the MD's "merge dump 164+691+1250" is moot — there is NO separate
    "Mírzá Muḥammad-‘Alíy-i-Zunúzí" person entity in the 21308 sidecar; 1219654 is the only Anís row. |
    confidence: verified | NEEDS-USER: N

15. **DESCRIBE / ALIAS-ADD** | **1219654** ← canonical "Muḥammad-‘Alíy-i-Zunúzí, surnamed Anís"; aliases
    {Anís, Mullá Muḥammad-‘Alíy-i-Zunúzí, Mírzá Muḥammad-‘Alíy-i-Zunúzí}; the youth martyred with the Báb
    at Tabríz, 1850. side: Bábí. | GPB styles him "Mírzá"; record both honorifics (see Hard Case 5). |
    confidence: verified | NEEDS-USER: N (canonical-form choice is the minor Hard Case 5)

16. **FIREWALL (ZUNÚZÍ)** | **1219654** "Anís" ≠ **1219469** "Shaykh Ḥasan-i-Zunúzí" | keep strictly distinct |
    Adjacent in text (Anís para_880; Shaykh Ḥasan para_881) yet different men — Shaykh Ḥasan is the Bábí of
    Zunúz who recorded the Máh-Kú revelations with Siyyid Ḥusayn (para_704, para_881; ?paraId=para_881).
    Also ≠ Siyyid ‘Alíy-i-Zunúzí (Anís's opposing stepfather) and ≠ the later "Anís" Ḥájí Muḥammad Ismá‘íl-i-
    Káshání of the Lawḥ-i-Ra'ís — neither of those has a 21308 sidecar row. | confidence: verified |
    NEEDS-USER: N

### The Báb's maternal uncle (Section D "dump 55 + 'Uncles of the Báb' → 1; side {other}→Bábí")

17. **MERGE** | keeper **1219383** "Ḥájí Mírzá Siyyid ‘Alí" (≈18 paras) ← [**1228024** "the Báb's maternal
    uncle" (2 paras)] | one entity, the Báb's maternal uncle |
    1228024 para_560 is the image caption "ḤÁJÍ MÍRZÁ SIYYID ‘ALÍ'S HOUSE IN SHÍRÁZ (THE BÁB'S MATERNAL
    UNCLE)"; para_1376 "Ḥájí Mírzá Siyyid ‘Alí, the Báb's maternal uncle" (?paraId=para_1376) — explicitly
    the same man as 1219383, whose paras describe him rearing the Báb, hosting Him, and his martyrdom
    (para_1389–1399). The MD's "Uncles of the Báb" (dump 902) row has no 21308 sidecar entity. |
    confidence: verified | NEEDS-USER: N

18. **ATTRIBUTE side** | **1219383** side `{other}` → **`Bábí`** | final-allegiance rule |
    He is one of the Seven Martyrs of Ṭihrán (1850), refused to recant before the Amír-Niẓám, beheaded
    (para_1389–1399). Died confessing the Cause → Bábí. | confidence: verified | NEEDS-USER: Y
    (Hard Case 1 — user asked whether to keep `{other}` because his primary identity is "kin/merchant-
    guardian"; I recommend `Bábí`.)

19. **FIREWALL** | **1219383** Ḥájí Mírzá Siyyid ‘Alí (uncle) ≠ **633550** "Siyyid ‘Alí" ≠ Siyyid ‘Alí Khán
    ≠ Siyyid ‘Alíy-i-Zunúzí ≠ Máh-Kú warden ‘Alí Khán | keep distinct | there is only ONE Ḥájí Mírzá
    Siyyid ‘Alí here, the uncle. | confidence: verified | NEEDS-USER: N

### Seven Martyrs of Ṭihrán (1850)

20. **RETYPE / consolidate** | **1219624** "Seven Martyrs of Ṭihrán" `person` (2 paras) — this is the real
    collective-event entity (para_1386, para_1428 = the tragedy) | retype to `event` OR keep as the canonical
    Seven-Martyrs node |
    vs **1219629** "Seven Martyrs of Ṭihrán" `event` (5 paras) which is **noisy/mis-attributed**: its
    mentions land on para_435 (Quddús at Shíráz), para_568 (arrest scene), para_1607 (Zanján conflagration),
    para_1787, para_1810 — paragraphs that are NOT about the Seven Martyrs. Recommend: keep ONE canonical
    Seven-Martyrs entity and strip the off-topic mentions from the other. | confidence: likely |
    NEEDS-USER: Y (which id to keep; mention-cleanup is a judgment call)

21. **(VERIFIED) Siyyid Murtaḍá** | **619820** "Siyyid Murtada" (1 para) = the Seven-Martyrs
    **Siyyid Murtaḍá-y-i-Zanjání** | keep, enrich |
    Its only 21308 mention is para_568, the exact sentence: "…his brother, **Siyyid Murtaḍá, was one of the
    Seven Martyrs of Ṭihrán**" (?paraId=para_568). So 619820 IS the Seven-Martyrs Murtaḍá. ALIAS-ADD
    "Siyyid Murtaḍá-y-i-Zanjání"; side Bábí. | confidence: verified | NEEDS-USER: N

22. **FIREWALL** | **619820** "Siyyid Murtaḍá" (Seven Martyrs) ≠ **1219662** "Mullá Murtaḍá-Qulí"
    (Tabríz mujtahid-opponent) | keep distinct |
    1219662 para_1567 "Mullá Murtaḍá-Qulí, following… the other two mujtahids… issued his own written
    testimony" against the Báb (?paraId=para_1567) — an opponent, not a martyr. | confidence: verified |
    NEEDS-USER: N

23. **(VERIFIED) Mírzá Qurbán-‘Alí** | **1064487** "Mírzá Qurbán-‘Alí" (4 paras) = the dervish,
    Seven Martyrs | keep, enrich |
    para_1394–1398: returned from pilgrimage, met Mullá Ḥusayn, arrested, brought before the Amír-Niẓám
    ("I am loth… to pronounce the sentence of death"), executed (?paraId=para_1395). GPB "pious and highly
    esteemed." side Bábí. FIREWALL ≠ ‘Abbás-Qulí Khán; ≠ Mullá Murtaḍá-Qulí. | confidence: verified |
    NEEDS-USER: N

24. **NEEDS-USER (capture-from-Balyuzi)** | three Seven-Martyrs names with **no clean 21308 sidecar
    person-row**: Ḥájí Mullá Ismá‘íl-i-Qumí · Siyyid Ḥusayn-i-Turshízí · Ḥájí Muḥammad-Taqíy-i-Kirmání |
    add as new LIGHT `Bábí`-martyr entities from Balyuzi 466 |
    Verified absent from the 21308 roster (Turshízí/Qumí/Kirmání person-entities have 0 mentions in 21308).
    These are NEW-entity creations, not merges → require a write the user must authorize. |
    confidence: likely (roster from Balyuzi 466) | NEEDS-USER: Y (Hard Case 3 / B-9)

25. **FLAG — "Siyyid Káẓim-i-Zanjání"** | do **NOT** drop; it is a real person per para_568 (FLAG 1) |
    re-evaluate the "NER artifact" call |
    No standalone 21308 person-entity named "Siyyid Káẓim-i-Zanjání" currently exists in the sidecar (the
    "Siyyid Káẓim" rows in 21308 are **619152 / 1055345 = Siyyid Káẓim-i-Rashtí**, the Shaykhí head — those
    remain firewalled). But because Nabíl explicitly names Siyyid Káẓim-i-Zanjání (brother of Siyyid Murtaḍá,
    martyred in Mázindarán), the prior decision to treat the name as a fabrication is unsafe. If anything,
    a light entity should be CREATED, not dropped. EVIDENCE: ?paraId=para_568. | confidence: verified
    (text) | NEEDS-USER: **Y**

### Iṣfahán / Máh-Kú / Tabríz cast (Báb's-life arc) — verified-present entities

26. **(VERIFIED) Gurgín Khán** | **1219406** "Gurgín Khán" `person` (6 paras) | keep; firewall ≠ place-row
    **1060769** "Gurgín Khán" `place` (mis-typed duplicate) |
    nephew of Manúchihr Khán; seized the estate and dispatched the Báb via Muḥammad Big. The `place`-typed
    1060769 is a RETYPE/merge candidate (a person mis-typed as place) — NEEDS-USER. | confidence: verified
    | NEEDS-USER: Y (1060769 retype/merge)

27. **(VERIFIED) Yaḥyá Khán** | **638495** "Yaḥyá Khán" (6 paras) = father of the martyr Ḥájí Sulaymán Khán |
    keep |
    para_1587 "Ḥájí Sulaymán Ḵhán, **son of Yaḥyá Ḵhán**" (?paraId=para_1587); para_862/864/914 = the
    Chihríq warden role. (Per Hard-Case Case-2, the corpus's Chihríq warden is Yaḥyá Khán-i-Kurd whose
    sister married Muḥammad Sháh — and ALSO the martyr's father is "Yaḥyá Khán of Tabríz"; the sidecar
    collapses both into 638495. Whether to split is a judgment call.) | confidence: verified | NEEDS-USER:
    Y (possible split of the two Yaḥyá Kháns)

### Two Sulaymán Kháns (Hard Case 2 / B-7) — VERIFIED SPLIT

28. **MERGE** | keeper **1219669** "Ḥájí Sulaymán Khán" (9 paras) ← [**651846** "Sulaymán" (2 paras)] |
    one entity = the famous 1852 martyr, **Sulaymán Khán-i-Tabrízí, son of Yaḥyá Khán** |
    1219669 paras 1587/1590 (recovered the Báb's remains), 1840/1844/1850–1852 (martyred by candles);
    651846 paras 1854/1857 are the SAME candle-martyrdom scene ("standing erect as an arrow… enveloped by
    the flames") (?paraId=para_1854). Same man. side Bábí. | confidence: verified | NEEDS-USER: N

29. **FIREWALL** | **1219669** Ḥájí Sulaymán Khán (Tabrízí martyr, Bábí) ≠ **983869** "Sulaymán Khán"
    (the Afshár opposing general at Ṭabarsí, opponent) | keep strictly distinct |
    983869 para_1118 is the Ṭabarsí siege, in the prince's/Quddús's presence (?paraId=para_1118) = the
    enemy commander Sulaymán Khán-i-Afshár. The hardcase-research confirms 3+ distinct Sulaymán Kháns split
    cleanly by nisba/role/fate; the "Bábí hero vs kin-opponent" pattern is the martyr (A) vs his brother
    Farrukh Khán (D), NOT two Sulaymáns. | confidence: verified | NEEDS-USER: N (split is decisive)
    — residual: hardcase Q "father = ‘Alí Khán vs Yaḥyá Khán?" → corpus says **Yaḥyá Khán**; flag the
    user's "‘Alí Khán" framing as a likely memory slip. NEEDS-USER: Y (that one residual only)

30. **FIREWALL** | **983869** Sulaymán Khán (Afshár general) ≠ Sulaymán Khán-i-Afshár of Zanjan (ignored
    the Báb's letter; father of Riḍá-Qulí Khán) | the two Afshárs may be one or two |
    hardcase Case-2 open question 2 — corpus does not explicitly merge/split the two Afshár "Sulaymán Khán"s.
    Neither maps to a clean separate 21308 sidecar row beyond 983869. | confidence: likely | NEEDS-USER: Y

31. **FIREWALL** | **1219669/983869** Sulaymán Khán(s) ≠ **1185598** "Mírzá Sulaymán" (Badasht chanter,
    Mírzá Sulaymán-i-Núrí) ≠ **620201** place "Sulaymáníyyih" | keep distinct | prune name collisions. |
    confidence: verified | NEEDS-USER: N

### Mullá Báqir / Mírzá Báqir (state-file Section A merge-candidate + Tabríz firewall)

32. **MERGE** | keeper **620166** "Mullá Báqir-i-Tabrízí" (the Letter of the Living, 2 paras)
    ← [**628263** "Mullá Báqir" (9 paras)] | one entity = Mullá Báqir-i-Tabrízí, Letter of the Living |
    628263 para_808 verbatim "Mullá Báqir, **one of the Letters of the Living**" (?paraId=para_808); its
    other paras (1045 bastinado as "groom of Bahá'u'lláh"; 1473/1497/1499/1526 Nayríz; 1549/1550 the Báb's
    documents courier) all cohere as the same Letter acting across theatres — bare-name salience resolves
    to the Letter, no contrary referent surfaced. This confirms the state-file "MERGE-by-default" call. |
    confidence: verified | NEEDS-USER: N

33. **FIREWALL** | **620166** Mullá Báqir-i-Tabrízí (the Letter) ≠ **620314** "Mírzá Báqir" (Tabríz
    mujtahid-opponent, son of Mírzá Aḥmad) ≠ **638692** "Mírzá Muḥammad-Báqir" ≠ **872491** "Muḥammad-Báqir"
    (Mullá Ḥusayn's nephew) ≠ **638227** "Mírzá Muḥammad-‘Alí" | keep distinct |
    620314 para_1566 "Mírzá Báqir, **the son of Mírzá Aḥmad**, to whom he had recently succeeded"
    (?paraId=para_1566) = the mujtahid who confirmed the death-sentence — an opponent, NOT the Letter. The
    three-Báqir firewall (Qá'iní ≠ Bushrú'í ≠ Tabrízí) holds. | confidence: verified | NEEDS-USER: N

### Consolidated Hard Cases C — verified firewalls (no user action)

34. **FIREWALL (verified)** | "Sardár"/"‘Abbás-Qulí Khán" title-namesakes | Mírzá ‘Alí-"Sardár"
    (633192 "Sardár") ≠ Riḍá Khán-i-Sardár ≠ ‘Azíz Khán-i-Sardár ("Sardár-i-Kull," named at para_1692);
    ‘Abbás-Qulí Khán-i-Láríjání (Ṭabarsí) ≠ Nayríz ‘Abbás-Qulí Khán | keep distinct |
    bare "Sardár" (633192) and the para_712 "Sálár" must not collide either. | confidence: verified |
    NEEDS-USER: N

35. **FIREWALL (verified)** | "Siyyid Káẓim" in 21308 = **Siyyid Káẓim-i-Rashtí** (619152, 1055345), the
    Shaykhí head | ≠ Siyyid Káẓim-i-Zanjání (the para_568 person) | keep distinct | confidence: verified |
    NEEDS-USER: N

---

## CONSOLIDATED HARD-CASE ADJUDICATIONS (Sections B/D of HARD-CASES + the research file)

Resolved against the corpus where decisive; else NEEDS-USER.

| # | Case | Resolution | NEEDS-USER |
|---|------|------------|------------|
| B-1 | Mírzá Na‘ím one or two | **ONE** man (b.1804–d.1875 Shíráz, Núrí, Lashkar-Báshí); 1909 = Shaykh Dhakariyya, not Na‘ím. Fársnámih dates rule out a 50-yr namesake. (Nayríz cohort, not this doc.) | N (resolved); confirm if user has independent 1909 Na‘ím |
| B-2 / Case 6 | Mullá ‘Abdu'l-Ḥusayn one or two | **ONE bridging figure**: 1850 first-blood/wounded (survived, "First Martyr of Nayríz" honorific) → 1853 captured, sons beheaded, died/beheaded en route to Shíráz. Textbook carry-forward arc. | N (resolved); confirm 1850-honorific+1853-martyrdom recorded as one arc |
| B-5 / Case 3 | Sang-Sar Abú-Ṭálib tangle | **6 people, 2 families** + 1 unrelated Nayríz namesake to wall off. Survivor-chronicler = Siyyid Abú-Ṭálib-i-Sang-Sárí (= "Mírzá Abú-Ṭálib" = "-i-Shahmírzádí"), ONE entity. ⚠ Internal Nabíl tension: BOTH DB passages (para 21054519, 21054542) **martyr Siyyid Aḥmad** and have **Abú-Ṭálib survive** — contradicts the brief's "Aḥmad survived." | **Y** — user to confirm survivor (Abú-Ṭálib per DB, not Aḥmad); 4th brother Siyyid Muḥammad-Riḍá?; source of "18 Sang-Sar martyrs" |
| B-6 / Case 4 | Mullá Muḥammad-i-Ḥamzih | **ONE man, mis-tagged**: should be `other` (sympathetic Muslim divine who buried Bábí dead, never a believer), NOT `Bábí`. Footnote "Muḥammad-‘Alíy-i-Ḥamzih" = spelling drift of the same man. | Y — confirm "-‘Alí" is drift not a 2nd man; apply side `Bábí`→`other` |
| B-7 / Case 2 | Two Sulaymán Kháns | **VERIFIED SPLIT** (ops 28–31): Tabrízí martyr (son of Yaḥyá Khán, Bábí) ≠ Afshár-i-Shahríyárí general (opponent) ≠ Zanjan Afshár. Kin-opponent pattern = martyr vs brother Farrukh Khán. | N for the core split; Y for (a) "father ‘Alí vs Yaḥyá" slip, (b) merge-or-not the two Afshárs |
| B-8 / Case 5 | "Mír Siyyid Muḥammad" of Iṣfahán | **DISTINCT, real figure** = the Imám-Jum‘ih / Sulṭánu'l-‘Ulamá, the Báb's Iṣfahán host (1846); side `other`. NOT the Covenant-breaker Siyyid Muḥammad-i-Iṣfahání (opponent) — firewall that `%Siyyid Muḥammad%Iṣfahán%` collision. | Y — confirm the "Mír" prefix form maps to the Imám-Jum‘ih |
| D-9 | Three Seven-Martyrs names (Qumí, Turshízí, Kirmání) | Confirmed **absent** from the 21308 sidecar; must be CREATED as new light Bábí-martyr entities from Balyuzi 466. | **Y** (op 24) |
| D-min | Anís honorific Mullá vs Mírzá | Keep ONE entity (op 14–15); GPB uses "Mírzá" → lean canonical "Mírzá," both as aliases. | Y (canonical-form pick only) |
| D-min | Áqá Ján(-Khán)-i-Khamsih | The replacement colonel who executed the Báb. No standalone 21308 sidecar row found (MD "dump 1248"); GPB form drops "Khán." FIREWALL ≠ Mírzá Áqá Ján (1220065, Bahá'u'lláh's amanuensis). | Y (create entity if wanted; firewall confirmed) |

---

## SUMMARY — OPERATION COUNTS BY TYPE

(REAL live entity_ids only; counts are this file's numbered operations.)

- **MERGE**: 5 — Báb fragments (op 1), Ḥujjat fragment (op 2), Amír-Túmán (op 5), maternal uncle (op 17),
  Sulaymán-Tabrízí martyr (op 28), Mullá Báqir→the Letter (op 32). [6 merges]
- **FIREWALL**: 11 — ops 3, 6, 7, 13, 16, 19, 22, 29, 30, 31, 33, 34, 35. [13 firewalls]
- **RETYPE**: 2 — Anís work→person (op 14), Seven-Martyrs node consolidation (op 20).
- **ATTRIBUTE (side)**: 1 — maternal uncle {other}→Bábí (op 18).
- **DESCRIBE / ALIAS-ADD**: 3 — Ḥujjat (op 4), Anís (op 15), Siyyid Murtaḍá/Qurbán-‘Alí enrich (ops 21, 23).
- **CREATE (new light entities) — NEEDS-USER**: 3 Seven-Martyrs (op 24) + possibly Ṣadru'd-Dawliy (op 8) +
  Siyyid Káẓim-i-Zanjání (op 25) + Áqá Ján-i-Khamsih (D-min).
- **DROP**: 0 applied. (The MD's proposed DROP of "Siyyid Káẓim-i-Zanjání" is REJECTED — see FLAG 1.)
- **VERIFIED no-op**: Zaynab (op 9), Khadíjih firewall (op 10), Mullá Iskandar two-theatres (op 12).

### Section-B judgment calls — how resolved
- **Resolved against corpus (no user needed for the core call):** B-1 Na‘ím (ONE), B-2/Case-6
  ‘Abdu'l-Ḥusayn (ONE bridging figure), B-7/Case-2 Sulaymán split (THREE+ distinct), B-8/Case-5 Mír Siyyid
  Muḥammad (DISTINCT = the Imám-Jum‘ih).
- **Resolved but flagged for user confirmation of a residual detail:** B-5/Case-3 Sang-Sar (6+1 people,
  but Nabíl MARTYRS Aḥmad — contradicts the brief; survivor is Abú-Ṭálib), B-6/Case-4 Ḥamzih (ONE, retag
  `Bábí`→`other`), Sulaymán "father ‘Alí vs Yaḥyá" slip + the two-Afshárs question.
- **Genuine NEEDS-USER (writes / reversals beyond read-only reach):** D-9 create three Seven-Martyrs
  entities; the maternal-uncle side change; **FLAG 1** (un-drop Siyyid Káẓim-i-Zanjání) and **FLAG 2**
  (un-merge / firewall Amír Arslán Khán 1060805) — both REVERSE prior "resolved/apply-by-default"
  instructions and are grounded in verbatim para_568 / para_712.

### Cross-extraction caveat
Roughly half the MD merges (Majdu'd-Dawlih, Khadíjih Bagum, the Zunúzí person-variants, the Marághi'í/
Turshízí/Qumí/Kirmání rows) target entities with **zero mentions in doc 21308's current sidecar**. They
are NOT applicable as in-doc operations; if pursued, they must run against the global `graph_entities`
table — outside this read-only doc-scoped verification. All flagged NEEDS-USER.
