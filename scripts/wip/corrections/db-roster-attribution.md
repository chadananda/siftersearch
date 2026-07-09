# Dawn-Breakers (doc_id 21308) — Live-Roster Cleanup + Section-Attribution Correction Set

> READ-ONLY analysis. NO DB writes performed. Every op below is a PROPOSAL for human approval.
> Cohort 5 of the entity-review consolidation (see scripts/wip/entity-review-state.md).
> Verified 2026-06-16 against tower-nas sifter.db + graph.db sidecar (read-only) + Meili/SQLite mention contexts.
> Citation key: `https://oceanlibrary.com/dawn-breakers_nabil?paraId=<external_para_id>` (flat `para_NNNN` form).
> Op schema: `TYPE | targets (entity_ids/canonical) | result | EVIDENCE (cid/citation + reasoning) | confidence | NEEDS-USER?`

---

## Author / canonical entities (resolved for TASK B; all EXIST in graph_entities)

| Role | Keeper entity_id | canonical_name | Fragments seen | Notes |
|---|---|---|---|---|
| George Townshend (Introduction author) | **621842** | George Townshend | 638824 (GEORGE TOWNSHEND), 1053444 (Canon George Townshend), 1245231 (George Townshend dup) | EXISTS. Currently has **0** mention/narrator links in 21308 — entirely absent from this doc's layer. |
| Shoghi Effendi (dedication, Acknowledgment, reference notes, Epilogue) | **614423** | Shoghi Effendi | 619233, 626521, 1223010 | EXISTS; already used as a narrator id in 21308. |
| Nabíl-i-A‘ẓam = Muḥammad-i-Zarandí (Preface + body author) | **620216** (proposed) | Nabíl-i-Zarandí | 620138 (Nabíl), 620163 (Nabíl-i-A'ẓam), 631726 (Nabíl-i-A‘ẓam), 632246 (Nabil Zarandi), 1220249 (Nabíl), 1220138/1220139 (Mullá Muḥammad-i-Zarandí) | EXISTS but **massively fragmented** (≥7 ids). Keeper choice flagged NEEDS-USER. ⚠ Do NOT merge in **Nabíl-i-Akbar (1220146)** = Mullá Muḥammad-i-Qá'iní, a DIFFERENT person (Apostle of Bahá'u'lláh). |

⚠ FIREWALL: **Nabíl-i-A‘ẓam (author, 620216 et al.) ≠ Nabíl-i-Akbar (1220146)**. Same first name, different men. Never merge.

---

## TASK A — Live-roster cleanup

### A1. MERGE — duplicate fragments of the Báb (keeper 1219258 "the Báb", 506 mentions)

```
MERGE | keeper 1219258 <- [1219478] | fold "Báb"(9) into "the Báb"
  EVIDENCE: pi 19 (para ~), 22, 28, 33, 41 — all Townshend-Introduction prose plainly about the Báb
            ("the Báb's mission", "the Báb was from the beginning opposed by the vested interests").
            Identical referent, mere bare-name fragment.
  confidence: verified | NEEDS-USER: N

MERGE | keeper 1219258 <- [1219665] | fold "Siyyid-i-Báb"(29) into "the Báb"
  EVIDENCE: aliases on 1219665 = {"The Siyyid-i-Báb","Siyyid-i-Báb","the Siyyid","this Youth"};
            pi 304/305 (citation para context, Shíráz, Ḥusayn Khán arrests Quddús & Mullá Ṣádiq) —
            "Siyyid-i-Báb" = the Báb (Siyyid ‘Alí-Muḥammad) literally. NOT the Bábu'l-Báb title-trap
            (that one = Mullá Ḥusayn); "Siyyid-i-Báb" denotes the Báb Himself.
  confidence: verified | NEEDS-USER: N
```

### A2. DROP — image-caption / alt-text artifacts mis-extracted as persons

```
DROP | 613854 "Báb"(person,4) | image alt-text artifact, remove from person layer (do NOT merge into 1219258)
  EVIDENCE: pi 166 "![STEPS LEADING TO THE DECLARATION CHAMBER]…", pi 237 "![The Dawn-Breakers]…",
            pi 968 "![VIEW OF ZANJÁN]…" — all three mentions are markdown image embeds, not prose. No real referent.
  confidence: verified | NEEDS-USER: N

DROP | 613760 "Quddús"(person,2) | image alt-text artifact (do NOT merge into 1219859 Quddús)
  EVIDENCE: pi 545 "![HAMLET OF BADASHT]…", pi 765 "![The Dawn-Breakers]…" — both image embeds. No referent.
  confidence: verified | NEEDS-USER: N
```

### A3. RETYPE — bare/occupational/clerical titles wrongly typed `person`

(Per SKILL "Generic title ≠ person entity": retype to `title`; the definite-anaphoric "the X" uses should be
re-attached to the contextual named person noted below. The standalone generic entity must not remain a `person`.)

```
RETYPE | 617083 "Mujtahid"(person,21) -> title | EVIDENCE: pi 79 generic legal definition ("the law in Persia… two
  branches"), pi 246/247 anaphoric "the mujtahid" in a dream-recollection (a specific contextual mujtahid). Mixed
  generic + anaphoric; not a single person. Re-attach anaphoric uses to the contextual mujtahid per paragraph.
  confidence: verified | NEEDS-USER: N

RETYPE | 1220865 "Mujtahid"(person,6) -> title | EVIDENCE: pi 659 "Sárí's most eminent mujtahid" = Mírzá
  Muḥammad-Taqí (1060801); pi 990/1005 Zanján clerics. Title, not a person. Re-attach anaphoric uses to contextual person.
  confidence: verified | NEEDS-USER: N

RETYPE | 1228029 "Imám-Jum‘ih"(person,19) -> title | EVIDENCE: pi 404/407 (Shíráz, the Báb's return from the bath) —
  "the Imám-Jum‘ih" = the office-holder of Shíráz; clerical title. (Cf. 1228027 "Imám-Jum‘ih of Ṭihrán"(1) which is
  a named office instance.) confidence: verified | NEEDS-USER: N

RETYPE | 1220750 "Muftí"(person,2) -> title | EVIDENCE: pi 221 (Ḥájí Háshim 'Aṭṭár's recollection) — generic "the muftí".
  confidence: verified | NEEDS-USER: N

RETYPE | 1219651 "farrash-bashi"(person,5) -> title | EVIDENCE: pi 937 "ordered his farrásh-báshí to conduct the Báb…" —
  head-farrash office (civil title). confidence: verified | NEEDS-USER: N

RETYPE | 636732 "King"(person,1) -> title | EVIDENCE: pi 47 "In theory the king may do what he pleases; his word is law"
  (Curzon-style generic survey, Townshend Introduction). confidence: verified | NEEDS-USER: N

RETYPE | 1182996 "Leader"(person,1) -> title | EVIDENCE: pi 1177 "responsible leader of the group" — common noun, not a
  person. confidence: verified | NEEDS-USER: N

RETYPE | 628450 "Amír"(person,2; only alias "Amír") -> title | EVIDENCE: pi 821, 1037 anaphoric "the Amír" = the
  Amír-Niẓám / Mírzá Taqí Khán (entity 1219327) in context. Bare title; re-attach anaphoric mentions to 1219327.
  confidence: verified | NEEDS-USER: N

RETYPE | 1220747 "the Prophet"(person,20) -> title | EVIDENCE: pi 60 "descendants of the Prophet", pi 73/79 Shí‘ah
  doctrine — anaphoric "the Prophet" = Muḥammad (entity 614456). Re-attach anaphoric uses to Muḥammad 614456.
  confidence: verified | NEEDS-USER: N

RETYPE | 1222317 "Governor of Fars"(person,1) -> title | anaphoric, = Ḥusayn Khán-i-Íraváni
  (the governor of Fárs in the Báb's Shíráz period). Re-attach to the named governor where present.
  confidence: likely | NEEDS-USER: N
```

(Additional bare-title `person` rows present in the long tail that follow the same rule and should likewise RETYPE→title:
**1222054 "Vazir"**, **1220142 "Vazír-Niẓám"**, **2052/«Vazir» concept 1219777**, **633192 "Sardár"**, **638395 "Farmán-Farmá"**,
**617929 "Prince"**, **625576 "Prisoner"**, **620270/1220270 "qáḍís"**, **632632? n/a**. Flagged as a batch — verify each
context before applying; pattern identical to the verified rows above.)

### A4. DROP — collectives / plurals (remove from person layer)

```
DROP | 619710 "Mullás"(person,4) | EVIDENCE: pi 33 "The mullás encountered here no cause for delay…" — plural class.
  confidence: verified | NEEDS-USER: N
DROP | 617778 "Mujtahids"(person,3) | EVIDENCE: pi 210/795 plural clerics. confidence: verified | NEEDS-USER: N
DROP | 636586 "Imáms"(person,6) | EVIDENCE: pi 95/144 the Twelve Imáms / plural. confidence: verified | NEEDS-USER: N
DROP | 1219432 "Kurds"(person,2) | EVIDENCE: pi 462/565 ethnic plural. confidence: verified | NEEDS-USER: N
DROP | 1227890 "‘ulamás"(person,52) | EVIDENCE: pi 353/359 "all the leading ‘ulamás of the city" — clerical collective.
  confidence: verified | NEEDS-USER: N
DROP | 1223983 "Apostles of Old"(person,1) | EVIDENCE: pi 222 — collective epithet (the early apostles). 
  confidence: verified | NEEDS-USER: N
DROP | 1219732 "Bábí"(person,6) | EVIDENCE: pi 33/42/316 "early adherents…", generic believer class, not a named person.
  confidence: verified | NEEDS-USER: N
```

(Same-pattern collective `person` rows in the long tail to DROP after a context check: **1060013 "Siyyids"**,
**1178821 "Philosophers"**, **614609 "Messenger"**(generic), **1171522 "Whosoever"**, **1227561/1219479 "Bábís"/"Bahá'ís"**
are already `organization` — leave those; only the `person`-typed plurals get dropped.)

### A5. DROP — pronoun / reference artifacts (not real persons)

```
DROP | 1165379 "Himself"(person,3) | EVIDENCE: pi 12 (‘Abdu'l-Bahá), pi 23 ("Putting Himself thus in line…", = the Báb)
  — reflexive pronoun; resolves to the contextual subject, never a standalone person. confidence: verified | NEEDS-USER: N
DROP | 660394 "His Name"(person,1) | EVIDENCE: pi 155 "the year that witnessed the birth of the promised Revelation" —
  possessive-pronoun phrase. confidence: verified | NEEDS-USER: N
DROP | 656387 "Brother"(person,2) | EVIDENCE: pi 235 image caption "ÁQÁY-I-KALÍM, BROTHER OF BAHÁ'U'LLÁH"; pi 814 "my
  brother" generic. Artifact. confidence: verified | NEEDS-USER: N
DROP | 637801 "Family"(person,1) | EVIDENCE: pi 47 generic ("…family"). confidence: verified | NEEDS-USER: N
DROP | 644527 "My Family"(person,1) | EVIDENCE: pi 990 first-person possessive phrase. confidence: verified | NEEDS-USER: N
DROP | 1061758 "Master"(person,7) | EVIDENCE: pi 384/421 — context is the Báb's journey & Shaykh Sulṭán, NOT the definite
  "the Master" (‘Abdu'l-Bahá). Generic honorific use here; no specific ‘Abdu'l-Bahá referent in these mentions.
  confidence: likely | NEEDS-USER: N
```

(Long-tail pronoun/abstraction `person` rows following the same rule — DROP after context check:
**1179359 "Thy Manifestation"**, **1153816? n/a**, **653763 "My Lord"**, **983418 "My Son"**, **620384 "Thou"**,
**650508 "God's"**, **1171522 "Whosoever"**, **2439 n/a**, **632439 "Nephew"**, **2317 n/a**. Same artifact class.)

### A6. ALIAS-REMOVE — bad aliases on Mullá Ḥusayn-i-Bushrú'í (1219326)

```
ALIAS-REMOVE | 1219326 -/- "Mullá Ḥusayn-i-Zanjání" (alias row id 22583)
  EVIDENCE: Mullá Ḥusayn-i-Bushrú'í is of Bushrúyih/Khurásán (correct aliases on the entity: "Mullá Ḥusayn of
  Bushrúyih", "Mullá Ḥusayn-i-Bushrú'í"). "Zanjání" is the wrong nisba (Zanján is Ḥujjat's locus). Mis-attached.
  confidence: verified | NEEDS-USER: N
ALIAS-REMOVE | 1219326 -/- "the Beloved Siyyid, the exalted Ḥusayn" (alias row id 45589)
  EVIDENCE: Mullá Ḥusayn was a *mullá*, NOT a Siyyid; "the Beloved Siyyid… Ḥusayn" denotes a Siyyid named Ḥusayn
  (the Báb's amanuensis Siyyid Ḥusayn-i-Yazdí, entity 1219427, or Siyyid Ḥusayn). Wrong entity. Also review alias
  row id 45594 "the gate to the Báb" / 45588 "the first believer" (those ARE correct for Mullá Ḥusayn — keep).
  confidence: verified | NEEDS-USER: N
```

---

## TASK B — Section attribution (LOCKED map; signatures confirmed)

Section signatures verified in-text:
- pi 5 dedication "To The Greatest Holy Leaf… I Dedicate This Work" → Shoghi Effendi.
- pi 85 Acknowledgment thanks "an English correspondent for his help in the preparation of **the Introduction**" (confirms Introduction is a distinct hand).
- pi 87 image caption "MUḤAMMAD-I-ZARANDÍ, SURNAMED NABÍL-I-A‘ẒAM"; pi 91 signature "MUḤAMMAD-I-ZARANDÍ."; pi 92 dateline "‘Akká, Palestine, 1305 A.H." → Nabíl signs the Preface.
- pi 89 (para_121) Preface names the five informants verbatim.
- pi 1208–1223 Epilogue = 3rd-person retrospective on Nabíl → Shoghi Effendi.

**Current misattribution (measured on Introduction pi 6–65 narrator_entity_id):**
Nabil Zarandi (632246) = 40 paras · Shoghi Effendi (614423) = 7 · Lord Curzon (1170388) = 3 · Nabíl (620138) = 3 · NULL = 7.
**George Townshend = 0.** The true author of the Introduction is entirely absent from the layer.

```
ATTRIBUTE | pi 6–65 (Introduction + Persia survey A–D + Conclusion) -> narrator = George Townshend (621842)
  EVIDENCE: SKILL locked map; pi 85 acknowledges outside help on "the Introduction"; current layer wrongly splits it
  across Nabil/Shoghi/Curzon/null (see counts). Quoted matter inside (e.g. Curzon survey extracts pi 47/60/73/79, and
  ‘Abdu'l-Bahá quotes) keeps its SPEAKER on the quoted figure (Lord Curzon 1170388 stays as SPEAKER on his block
  quotes, NOT narrator). confidence: verified | NEEDS-USER: N

ATTRIBUTE | pi 5 (dedication) -> narrator = Shoghi Effendi (614423)
  EVIDENCE: pi 5 "I Dedicate This Work" — the translator's dedication. confidence: verified | NEEDS-USER: N

ATTRIBUTE | pi 85–87 (Acknowledgment, signed "— The Translator") -> narrator = Shoghi Effendi (614423)
  EVIDENCE: pi 85 text + signature convention. Currently 4 paras Nabil Zarandi (632246) + 1 NULL — WRONG.
  confidence: verified | NEEDS-USER: N

ATTRIBUTE | pi 88–92 (Preface, signed "MUḤAMMAD-I-ZARANDÍ, ‘Akká 1305 A.H.") -> narrator = Nabíl (620216 keeper)
  EVIDENCE: pi 91/92 signature+dateline. Currently 4 paras Nabil Zarandi (632246) + 1 NULL — author is correct PERSON
  but the entity id must be consolidated to the single Nabíl keeper. confidence: verified | NEEDS-USER: Y (keeper id)

ATTRIBUTE | pi 93–1207 (body narrative) -> narrator = Nabíl (620216 keeper)
  EVIDENCE: SKILL locked map; body sample pi 500–510 currently splits Nabíl across 620138 / 620216 — consolidate to
  one keeper. confidence: verified | NEEDS-USER: Y (keeper id)

ATTRIBUTE | pi 1208–1223 (Epilogue) -> narrator = Shoghi Effendi (614423)
  EVIDENCE: pi 1208/1223 3rd-person retrospective ("we stand too near the colossal edifice His hand has reared").
  Currently mis-attributed to Nabíl (620138 = 5 paras, 632246 = 1) + 9 NULL — WRONG; Epilogue is the Guardian's.
  confidence: verified | NEEDS-USER: N
```

### B-prereq. Consolidate Nabíl author fragments (blocks the body/Preface attribute)

```
MERGE | keeper 620216 (Nabíl-i-Zarandí) <- [620138, 620163, 631726, 632246, 1220249, 1220138, 1220139]
  EVIDENCE: all are the author Muḥammad-i-Zarandí / Nabíl-i-A‘ẓam (Preface signature pi 91). Used interchangeably as
  narrator across the doc. ⚠ EXCLUDE 1220146 "Nabíl-i-Akbar" (= Mullá Muḥammad-i-Qá'iní, a different man — FIREWALL).
  confidence: likely | NEEDS-USER: Y  (confirm keeper id + the full fragment set before merging — high blast radius)
```

### B-RELATE. Nabíl's named informants (Preface pi 89 / citation para_121) — `informed-by`

All five entities EXIST in graph_entities and are present in the 21308 roster.

```
RELATE | 620216 (Nabíl) -informed-by-> 1219638 (Mírzá Aḥmad = Mírzá Aḥmad-i-Qazvíní, "the Báb's amanuensis")
  EVIDENCE: pi 89 para_121 "Mírzá Aḥmad-i-Qazvíní, the Báb's amanuensis". 1219638 has 41 mentions in 21308.
  confidence: verified | NEEDS-USER: N
RELATE | 620216 (Nabíl) -informed-by-> Siyyid Ismá‘íl-i-Ḏhabíḥ  [entity 1227745 "Siyyid Ismá‘íl-i-Ḏhabíḥ"]
  EVIDENCE: pi 89 "Siyyid Ismá‘íl-i-Ḏhabíḥ". NB this name is fragmented in graph_entities (656709 "Sayyid Isma'il
  Dhabih", 1239029 "Haji Muhammad-Isma'il-i-Dhabih", 1227745) — pick/confirm canonical.
  confidence: verified | NEEDS-USER: Y (which Ismá‘íl-i-Dhabíḥ id is canonical)
RELATE | 620216 (Nabíl) -informed-by-> 1219469 (Shaykh Ḥasan-i-Zunúzí)
  EVIDENCE: pi 89 "S̱hayḵh Ḥasan-i-Zunúzí". 1219469 has 12 mentions in 21308. (Fragments 620172/628566/etc. exist.)
  confidence: verified | NEEDS-USER: N
RELATE | 620216 (Nabíl) -informed-by-> 625336 (Shaykh Abu-Turab = Shaykh Abú-Turáb-i-Qazvíní)
  EVIDENCE: pi 89 "S̱hayḵh Abú-Turáb-i-Qazvíní". 625336 has 11 mentions in 21308.
  confidence: verified | NEEDS-USER: N
RELATE | 620216 (Nabíl) -informed-by-> 1220020 (Áqáy-i-Kalím = Mírzá Músá, brother of Bahá'u'lláh)
  EVIDENCE: pi 89 "Mírzá Músá, Áqáy-i-Kalím, brother of Bahá'u'lláh". NB 1220020 (Áqáy-i-Kalím, 24) and 613792
  (Mírzá Músá, 10) are the SAME person — MERGE pair (see below); RELATE targets the merged entity.
  confidence: verified | NEEDS-USER: N
```

### B-MERGE (supporting the RELATE above)

```
MERGE | keeper 1220020 (Áqáy-i-Kalím) <- [613792 (Mírzá Músá)]
  EVIDENCE: pi 89 explicitly equates them: "Mírzá Músá, Áqáy-i-Kalím, brother of Bahá'u'lláh". Same person.
  confidence: verified | NEEDS-USER: N
```

---

## OPEN / write-path note
All ops above are PROPOSALS. No graph.db / graph_entities writes were made. The sidecar write-path (how to apply
MERGE/RETYPE/DROP/ALIAS-REMOVE/ATTRIBUTE/RELATE via the single-writer API) remains an OPEN question for the user
(see entity-review-state.md NEXT STEPS #3). Do not resolve by writing directly.
