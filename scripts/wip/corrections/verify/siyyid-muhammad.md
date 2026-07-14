# Verification: "Siyyid Muḥammad" (1220072) + "Imám-Jum‘ih" (1228029)

Cross-corpus entity disambiguation. READ-ONLY (sqlite SELECT + WebSearch).
Date: 2026-06-16. Corpora: God Passes By, Dawn-Breakers (+ French footnotes + study guide),
The Revelation of Bahá'u'lláh v1–3, The Writings of Bahá'u'lláh, Logos and Civilization, Gate of the Heart.

NOTE: `entity_mentions` counts are STALE (deletion does not remove mention rows). Counts below are
directional only, used to rank where to read — not as authority.

---

## PART A — "Siyyid Muḥammad" → MULTIPLE DISTINCT PERSONS (firewall)

`name LIKE '%Siyyid Muḥammad%'` returns 7 keepers. "Siyyid Muḥammad" is an extremely common
Persian/Arabic name (siyyid = descendant of the Prophet; Muḥammad = the commonest given name).
The bare-name keeper **1220072** is a COLLISION BUCKET, not a person. Verdict per keeper:

### 1220072 "Siyyid Muḥammad" — UNDISAMBIGUABLE COLLISION BUCKET (134 stale mentions)
All 14 read samples come from a single doc (21308, The Dawn-Breakers) and refer to *different* men
whose name merely contains the string "Siyyid Muḥammad":
- "His father, **Siyyid Muḥammad-Riḍá**" (the Báb's father) — a distinct person.
- "Siyyid ‘Alí-Muḥammad" = **the Báb Himself** — caught by substring; NOT a "Siyyid Muḥammad."
- "**Siyyid Káẓim**" passages (the Báb's teacher) — name does not even contain Muḥammad; spurious bleed.
- "Ḥájí **Siyyid Javád**", "widow of Siyyid Káẓim", generic "the siyyid" — all spurious.
- **VERDICT:** This keeper does not denote one referent. It is a generic-name catch-all produced by
  loose substring matching. Recommend: do NOT treat as a verified person. Either retire it as a
  non-entity / disambiguation stub, or re-scope to a single referent and re-extract. CONFIDENCE: HIGH.

### 619821 "Siyyid Muḥammad" — = SIYYID MUḤAMMAD-i-IṢFAHÁNÍ, the ANTICHRIST (27 stale mentions; MIXED — see flag)
- Doc 21310 (God Passes By) mentions are unambiguous: "Irremediably corrupted through his constant
  association with **Siyyid Muḥammad, that living embodiment of wickedness, cupidity and deceit**";
  Mírzá Yaḥyá's manipulator in Baghdád/Constantinople; calumnies disseminated in Persia and 'Iráq.
  This is the Antichrist of the Bahá'í Revelation (1806–1872; murdered in 'Akká 1872-01-22).
- BUT doc 11445 (The Writings of Bahá'u'lláh) mentions under this same keeper describe a COMPLETELY
  DIFFERENT man: a Mujtahid trained at Sámarrá' who sought out Bahá'u'lláh, was converted, "remained
  firm and steadfast in the new Faith," renounced title and position, settled in Najaf. That is a
  BELIEVER, the opposite of the Antichrist — and is in fact the same person as 1239713 (Ḥájí Siyyid
  Muḥammad, disciple of Shaykh Murtidá Ansárí; doc 11445).
- **VERDICT:** 619821 is the Antichrist (Iṣfahání) PLUS a contaminating believer. Must be split.

### 1239979 "Siyyid Muḥammad-i-Iṣfahání" — = the ANTICHRIST, canonical form (4 mentions)
- Doc 431 (Revelation of Bahá'u'lláh v3): "Mírzá Yaḥyá, in spite of losing the support of **his master,
  Siyyid Muḥammad-i-Iṣfahání**, remained unrepentant." Doc 7165 (Logos/Kitáb-i-Badí'/Edirne context).
- **VERDICT:** This is the correct canonical keeper for the Antichrist. CONFIDENCE: HIGH.

### 1239713 "Ḥájí Siyyid Muḥammad" — = the BELIEVER mujtahid (1 mention, doc 11445)
- "Hájí Siyyid Muḥammad was one of the distinguished disciples of … Shaykh Murtidá Ansárí." Same man as
  the doc-11445 bleed inside 619821. A converted mujtahid who settled in Najaf. NOT the Antichrist.
- **VERDICT:** Distinct believer. CONFIDENCE: MEDIUM-HIGH.

### 1220144 "Ḥájí Mírzá Siyyid Muḥammad" — distinct (41 mentions; not deeply sampled)
- Honorific-laden compound name; flag for separate verification, but firewalled from 1220072 / Antichrist.

### 1060768 "Mírzá Siyyid Muḥammad" — distinct (2 mentions)
- Doc 21310/8632 contexts (Báb's journey to Iṣfahán; "Mystery of Mysteries" gloss). Distinct; thin data.

### FIREWALL (Siyyid Muḥammad)
```
ANTICHRIST (Siyyid-i-Iṣfahání, Yaḥyá's evil genius)  →  merge 619821 (GPB portion) + 1239979 → canonical 1239979
BELIEVER mujtahid (Ansárí's disciple, Najaf)          →  merge 1239713 + 619821(doc-11445 portion) → new/own keeper
Báb's father (Siyyid Muḥammad-Riḍá)                   →  NOT this entity; own keeper
the Báb (Siyyid ‘Alí-Muḥammad)                        →  own keeper; remove substring bleed
Siyyid Káẓim (teacher)                                →  own keeper; spurious bleed into 1220072
Ḥájí Mírzá Siyyid Muḥammad (1220144)                  →  distinct; verify separately
Mírzá Siyyid Muḥammad (1060768)                       →  distinct; thin
COLLISION BUCKET (1220072)                            →  retire/re-scope; not a person
```

### DESCRIBE — Siyyid Muḥammad-i-Iṣfahání (the Antichrist) [canonical keeper 1239979]
Siyyid Muḥammad-i-Iṣfahání (c.1806 – 22 Jan 1872). Bábí of corrupt character and great ambition;
designated by Shoghi Effendi the **"Antichrist of the Bahá'í Revelation"** (the Báb's "Great Idol"/
Quddús being the prior antitype). In Baghdád and later Edirne he became the manipulator and "evil
genius" of **Mírzá Yaḥyá (Ṣubḥ-i-Azal)**, inciting him to oppose Bahá'u'lláh and claim authority for
himself; he authored and disseminated calumnies throughout Persia and 'Iráq. Exiled with Bahá'u'lláh's
party to 'Akká, where he continued plotting; murdered there in 1872 by seven Bahá'ís acting against
Bahá'u'lláh's explicit prohibition — an act Bahá'u'lláh deplored. Key corpus locus: God Passes By
(doc 21310) and The Revelation of Bahá'u'lláh v3 (doc 431).

---

## PART B — "Imám-Jum‘ih" (1228029) → TITLE, not a person (split by city / retype)

`name LIKE '%Imám-Jum%' OR '%Imam-Jum%'` returns 6 keepers (3 bare-title variants + 2 city-qualified +
1 place). **Imám-Jum‘ih = "leader of the Friday congregational prayer"** — the chief prayer-cleric of a
city. It is a civic-religious OFFICE held by different men in different cities. The corpus proves this
explicitly: doc 40108 (French footnotes to Dawn-Breakers) states *"the name of the Imam-Jum'ih of Isfahan
was **Mir Siyyid Muhammad**, and his title **'Sultanu'l-'Ulama'** … the Imam-Jum'ih of Isfahan is now the
principal ecclesiastic"* — and adds *"A Traveller's Narrative mentions in addition the name **Mirza Ahmad**,
the Imam-Jum'ih."* Multiple named men, one title.

Distinct referents found across the corpus:
- **Imám-Jum‘ih of Iṣfahán = Mír Siyyid Muḥammad, titled Sulṭánu'l-‘Ulamá** — the cleric at whose house
  the crowds of Iṣfahán flocked to the Báb (doc 21310/1219392), and who, with Manúchihr Khán
  (the Mu‘tamid), **sheltered and protected the Báb** in Iṣfahán (1846). The PROTECTOR. (A Traveller's
  Narrative gives an alternate name, Mírzá Aḥmad — possibly a successor/confusion in the sources.)
- **Imám-Jum‘ih of Zanján/region (doc 430, Revelation of Bahá'u'lláh v2)** — the cleric who took the
  martyr **Siyyid Ashraf** in his arms and then falsely proclaimed Ashraf had recanted. A DIFFERENT,
  treacherous man. Opposite moral valence from the Iṣfahán protector.
- **Imám-Jum‘ih of Ṭihrán (keeper 1228027)** — separate city office; own keeper already exists.
- **House of the Imám-Jum‘ih (1219396)** — correctly typed `place` (the Iṣfahán residence where the Báb
  stayed); keep as place, link to the Iṣfahán office-holder.

### VERDICT — Imám-Jum‘ih
**RETYPE the bare-title keepers (1228029, 1219453, 1219392) as a TITLE/OFFICE concept, and SPLIT the
person-referents by city + named holder.** Do NOT keep "Imám-Jum‘ih" as a single person. Recommended graph:
- TITLE node: "Imám-Jum‘ih" (office; entity_type = title/role).
- PERSON: **Mír Siyyid Muḥammad, Sulṭánu'l-‘Ulamá, Imám-Jum‘ih of Iṣfahán** (the Báb's protector) —
  fold city-qualified keeper 1220707 ("Imám-Jum‘ih of Iṣfahán") here; this is the canonical person keeper.
- PERSON: **Imám-Jum‘ih of Ṭihrán** (1228027) — keep distinct.
- PERSON: **Imám-Jum‘ih (Zanján/Ashraf episode)** — distinct holder; create if pursuing that thread.
- PLACE: "House of the Imám-Jum‘ih" (1219396) — keep, link to Iṣfahán holder.
CONFIDENCE: HIGH that it is a title; HIGH on the Iṣfahán = Sulṭánu'l-‘Ulamá identification (stated in-corpus).

### DESCRIBE — Imám-Jum‘ih of Iṣfahán (Mír Siyyid Muḥammad, Sulṭánu'l-‘Ulamá)
The chief ecclesiastic (leader of Friday prayer) of Iṣfahán, titled Sulṭánu'l-‘Ulamá. Associated with
**Manúchihr Khán, the Mu‘tamidu'd-Dawlih**, governor of Iṣfahán. He received the Báb with deference,
hosted the multitudes who flocked to His presence, and — together with the Mu‘tamid — **sheltered and
protected the Báb** during His stay in Iṣfahán (September 1846), a comparative lull in the persecution.
A distinct and morally opposite figure from other holders of the same title (e.g. the Imám-Jum‘ih who
betrayed Siyyid Ashraf). Loci: God Passes By (21310), Dawn-Breakers + French footnotes (40108).

---

## FLAGS
1. **619821 is contaminated/mixed**: it conflates the Antichrist (doc 21310) with a believer mujtahid
   (doc 11445). MUST split before treating as verified. The believer half = same man as 1239713.
2. **1220072 is a collision bucket**, not a person — substring matching swept in the Báb's father
   (Siyyid Muḥammad-Riḍá), the Báb (Siyyid ‘Alí-Muḥammad), and Siyyid Káẓim. Retire or re-scope.
3. **entity_mentions counts are STALE** (no removal-on-delete); used only for read-prioritization here.
4. **Iṣfahán Imám-Jum‘ih name ambiguity in sources**: corpus gives both "Mír Siyyid Muḥammad
   (Sulṭánu'l-‘Ulamá)" and "Mírzá Aḥmad" (A Traveller's Narrative) — possibly successor/source variance;
   flag for a human ruling on whether one or two holders are meant.
5. **1220144 / 1060768** (other "Siyyid Muḥammad" compounds) firewalled but NOT deeply verified —
   separate passes recommended.
