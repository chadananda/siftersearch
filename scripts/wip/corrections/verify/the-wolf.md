# The Wolf & the Son of the Wolf — Iṣfahán clerical persecutors (father & son)

VERDICT:
- WOLF (father) keeper ← EXISTING 1220515 "Shaykh Muḥammad-Báqir"
    merge in: 1233375 "The Wolf", 1220708 "Raqshá'"
- SON OF THE WOLF (son) keeper ← EXISTING 1220539 "Shaykh Muḥammad Taqíy-i-Najafí"
    merge in: 1220540 "Son of the Wolf", 1239244 "The Son of the Wolf" (person-sense mentions only)
- confidence: H (canonical, web-corroborated, distinct father/son lineage)
- side: other (both — Muslim clerical antagonists; NOT Bábí/Bahá'í)

These are two DIFFERENT persons (father and son), each its own keeper. Do NOT
merge father into son. `graph_entities.mention_count` is STALE (reads 1 on the
keepers); live `entity_mentions` counts are used below.

## Cluster 1 — THE WOLF (Raqshá') = Shaykh Muḥammad-Báqir-i-Iṣfahání (the father)
- keeper: EXISTING 1220515 "Shaykh Muḥammad-Báqir" (live entity_mentions ≈ 14 — highest of the cluster)
- merge in:
  - 1233375 "The Wolf" (1 mention) — epithet form, same man
  - 1220708 "Raqshá'" (1 mention) — Arabic for "she-wolf / wolf"; Bahá'u'lláh's name for him
- canonical: Shaykh Muḥammad-Báqir-i-Iṣfahání ("the Wolf" / Raqshá')
- nisba/lineage: Iṣfahání; leading mujtahid & prayer-leader of the Royal Mosque, Iṣfahán
- role-arc: chief instigator of the 1879 execution of the King of Martyrs
  (Mírzá Muḥammad-Ḥasan) and the Beloved of Martyrs (Mírzá Muḥammad-Ḥusayn);
  ordered the beheading of Mullá Káẓim at Iṣfahán (Maydán-i-Sháh) and the
  galloping of a horse over the corpse; pressed for the execution of Aba Badí'
  at Mashhad. Addressee of Bahá'u'lláh's **Lawḥ-i-Burhán (Tablet of Proof)**,
  in which he is named "the Wolf" and "the last trace of sunlight upon the
  mountain-top".
- dates: 19th c.; died with prestige in decline (per God Passes By)
- side: other (Muslim clerical persecutor)
- DISCRIMINATOR: "Shaykh Muḥammad-Báqir of Iṣfahán, stigmatized by Bahá'u'lláh
  as 'Wolf'" (Taherzadeh, RoB vol.2); "surnamed the 'Wolf'… Lawḥ-i-Burhán
  addressed to him" (GPB). Father of Áqá Najafí. ≥2 sources (GPB + RoB +
  bahai-library + web).

## Cluster 2 — THE SON OF THE WOLF = Shaykh Muḥammad-Taqí, Áqá Najafí (the son)
- keeper: EXISTING 1220539 "Shaykh Muḥammad Taqíy-i-Najafí" (live entity_mentions ≈ 4)
- merge in (PERSON-SENSE mentions only):
  - 1220540 "Son of the Wolf" (7 mentions — but see WORK contamination below)
  - 1239244 "The Son of the Wolf" (2 mentions — same caveat)
- canonical: Shaykh Muḥammad-Taqí, Áqá Najafí ("the Son of the Wolf")
- nisba/lineage: Najafí / Iṣfahání; son of Shaykh Muḥammad-Báqir (Cluster 1)
- role-arc: prominent and violently anti-Bahá'í mujtahid of Iṣfahán; addressee
  of Bahá'u'lláh's last major work, the **Epistle to the Son of the Wolf
  (Lawḥ-i-Ibn-i-Dhi'b, 1891)**; identified by the corpus work-title
  "Epistle to Shaykh Muḥammad-Taqí" (1220714).
- dates: 1846–1914 (web: Agha Najafi Esfahani)
- side: other (Muslim clerical persecutor)
- DISCRIMINATOR: "written… to Shaykh Muhammad Taqi, known as Áqa Najafi…, son
  of Shaykh Muhammad-Baqir Isfahani" (bahai-library / Wikipedia). Son, not the
  father. ≥2 sources (corpus work-titles + web).

## WORK vs PERSON contamination (must resolve at merge time)
1220540 / 1239244 are typed `entity_type='work'` and 1220708 is also `work`,
but they name PERSONS by epithet. Worse, the bulk of 1220540's 7 mentions and
some of 1239244's are actually references to the BOOK *Epistle to the Son of
the Wolf* (bibliography rows, page-citations: "Epistle to the Son of the Wolf,
p. 22", "Trans. by Shoghi Effendi", RoB vol.1 reference list). Those belong to
the WORK entity 1219787 "Epistle to the Son of the Wolf" (83 mentions), NOT to
the person.
- ACTION: at merge, route only genuine PERSON-sense mentions of 1220540/1239244
  to person-keeper 1220539; route book/citation mentions to WORK 1219787.
- Likewise the lone 1220708 "Raqshá'" mention and one 1220515 mention both sit
  in a Lawḥ-i-Ḥikmat/tablet-listing context — verify it is the person (the
  Wolf, addressee of Lawḥ-i-Burhán), which it is.

## Cross-contaminated father/son mentions to check
Mention 1220539 (son) includes a paragraph that is actually about the FATHER
("Shaykh Muḥammad-Báqir of Iṣfahán… 'Wolf'… arrived in Mashhad" — RoB vol.2).
That row should be re-pointed to father-keeper 1220515. The Mashhad/Aba Badí'
narrative is the father's act, not the son's.

## FIREWALL — the Báqirs (father is Báqir; keep him OFF these)
- 628263 "Mullá Báqir" (≈101 mentions) = **Mullá Báqir-i-Tabrízí, a LETTER OF
  THE LIVING** — a faithful Bábí then devoted follower of Bahá'u'lláh; the
  OPPOSITE side. Corpus: "Mullá Báqir, one of the Letters of the Living…"
  / "survived all the other Letters of the Living… embraced the Cause of
  Bahá'u'lláh". NEVER merge with the Wolf.
- 620166 "Mullá Báqir-i-Tabrízí" (≈12) = same Letter of the Living; firewall out.
- 1061678 "Mullá Báqir Majlisí" = the 17th-c. Safavid theologian (Majlisí);
  different person, different era. Firewall.
- 638692 "Mírzá Muḥammad-Báqir", 872491 "Muḥammad-Báqir", 1145907
  "Muḥammad-Báqir-i-Qahvih-chi", 1056112 "Haji Siyyid Muhammad-Baqir" — other
  Báqirs; none is the Iṣfahán mujtahid "the Wolf". Firewall pending their own
  verification. The Wolf is specifically **Shaykh** Muḥammad-Báqir of Iṣfahán.

## FIREWALL — the Taqís (son is Taqí; keep him OFF the four already firewalled)
The Son of the Wolf (Shaykh Muḥammad-Taqí Najafí, 1220539) is NOT:
- Amír-Niẓám (Mírzá Taqí Khán, Amír Kabír) — the Grand Vizier
- Baraghání-uncle (Mullá Muḥammad-Taqí-i-Baraghání, the Shahíd-i-Thálith,
  Ṭáhirih's uncle/father-in-law)
- Sárí-mujtahid (Mullá Muḥammad-Taqí of Sárí)
- Ibn-i-Abhar (Mírzá Muḥammad-Taqí, the Hand of the Cause)
Also distinct from corpus near-collisions seen in pulls: 1060801 "Mírzá
Muḥammad-Taqíy-i-Juvayní", 1220159 "Ḥájí Muḥammad-Taqí", 1221166 "Ḥájí Mírzá
Muḥammad-Taqí", 620148 "Muḥammad-Taqí", 1060780 "Mullá Muḥammad-Taqíy-i-Harátí",
1227577 "Mírzá Muḥammad-Taqíy-i-Núrí". The discriminator is **Shaykh… Najafí /
Áqá Najafí of Iṣfahán, son of the Wolf, addressee of the Epistle**.

## DESCRIBE (per keeper)
- WOLF 1220515 (corpus-verified GPB + Taherzadeh RoB + web): Shaykh
  Muḥammad-Báqir-i-Iṣfahání, leading mujtahid of Iṣfahán whom Bahá'u'lláh named
  "the Wolf" (Raqshá') in the Lawḥ-i-Burhán; he procured the 1879 martyrdom of
  the King and Beloved of Martyrs and ordered other executions before his
  prestige collapsed.
- SON OF THE WOLF 1220539 (corpus + web): Shaykh Muḥammad-Taqí, Áqá Najafí
  (1846–1914), his son and fellow Iṣfahán cleric, an implacable opponent of the
  Bahá'ís and the addressee of Bahá'u'lláh's final major work, the Epistle to
  the Son of the Wolf (1891).

## RELATIONSHIP
1220539 (son) — son_of → 1220515 (father). Both side=other.

## FLAGS
- ENTITY-TYPE BUG: 1220708, 1220540, 1239244 are typed `work` but are person
  epithets; reclassify to `person` (or split work/person) before/at merge.
- WORK/PERSON SPLIT: 1220540's mentions are mostly book-citations → route to
  WORK 1219787, not to the person. Audit each of the 7+2 mentions individually.
- FATHER/SON MIS-LINK: at least one 1220539 (son) mention narrates the father's
  Mashhad/Aba Badí' acts → re-point to 1220515.
- STALE COUNTS: keeper mention_count=1 on both; do not rank by mention_count.
- NEEDS-VERIFY: exact death year of the father (the Wolf) not pinned from pulls;
  web gives son's dates (1846–1914) but father's death year unconfirmed here.
- CORPUS NOTE: Epistle to the Son of the Wolf present as a WORK (1219787, 83
  mentions) but the source-text body itself was not directly queried; GPB +
  RoB (Taherzadeh) carried the biographical evidence.
