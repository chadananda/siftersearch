# Entity Merge Plan — for review (NOT executed) — 2026-06-18

**Why these duplicates exist:** two extraction passes created the same entities twice —
the older pass set `religion='Baha'i'`, the recent pass left `religion=''`. The
`UNIQUE(canonical_name, entity_type, religion)` constraint then allowed both rows. A few
others are case/quote variants ("the Báb"/"The Báb", "First Bahá'í century/Century").

**Keeper rule:** keep the row with the MORE mentions (preserves the most links); merge the
other into it (repoints its mentions/aliases/relations, then deletes the merged row).
`graph-db.js mergeEntities(keeper, [merged])` does this.

Format: `keep #KEEPER (mentions) ← merge #MERGED (mentions)`

---

## A. SAFE same-name merges — clearly ONE entity (recommend: merge all)

### Persons (central figures, prophets, named individuals — unambiguously singular)
- 'Abdu'l-Bahá: keep #614731 (163) ← #1221619 (1)
- Bahá'u'lláh: keep #613759 (341) ← #1219519 (174)
- Báb: keep #613854 (135) ← #1219478 (12)   [+ cross-name → "the Báb", see §C]
- the Báb: keep #1219258 (777) ← #1238146 (1)
- Quddús: keep #1219859 (147) ← #613760 (38)
- Vaḥíd: keep #1219861 (67) ← #651297 (21)   [+ cross-name → Siyyid Yaḥyáy-i-Dárábí, §C]
- Nabíl: keep #620138 (41) ← #1220249 (13)
- Siyyid Káẓim: keep #619152 (93) ← #1238188 (6)
- Muḥammad (the Prophet): keep #614456 (87) ← #1239531 (1)
- Fáṭimih: keep #638207 (17) ← #1238980 (1)
- Qá'im: keep #1227649 (26) ← #1141936 (17)
- Mírzá Abu'l-Faḍl: keep #631348 (6) ← #1220505 (1)
- Siyyid Yaḥyáy-i-Dárábí: keep #638223 (4) ← #1219608 (4)
- Jesus: keep #614482 (15) ← #1225385 (7)    [Christ may also fold in — §C]
- Christ: keep #614485 (7) ← #1226156 (2)
- Gabriel: keep #619481 (6) ← #1220194 (2)
- Isaiah: keep #616430 (5) ← #1220607 (1)
- Elijah: keep #623965 (1) ← #1221230 (1)
- Virgin Mary: keep #1219804 (2) ← #619311 (1)
- Martha Root: keep #615483 (14) ← #1221596 (2)
- Thomas Breakwell: keep #617362 (1) ← #1221103 (1)
- Rabindranath Tagore: keep #623264 (1) ← #1222530 (1)
- William II: keep #623798 (1) ← #1220773 (1)

### Places (all singular geographic entities)
- Baghdád #619164(131)←#1220236(4); Karbilá #1219867(83)←#619154(50); Iṣfahán #614495(81)←#1237930(3);
  Mázindarán #1219771(68)←#613799(37); Constantinople #615326(50)←#1220219(5); Qazvín #619144(49)←#1238256(3);
  Chihríq #628021(45)←#1219433(6); Máh-Kú #628574(24)←#1219409(31)→KEEP #1219409 (31>24); Síyáh-Chál #627683(31)←#1219982(8);
  Najaf #615952(23)←#1227749(8); Mecca #613770(23)←#1219889(19); Káẓimayn #619871(12)←#1220182(4);
  Persia #614707(213)←#1232380(3); America #615620(17)←#1223321(1); Australia #614626(17)←#1222681(1);
  United States of America #618455(16)←#1219276(15); Asia #615592(7)←#1221021(4); Iran #1221696(7)←#614736(2)→KEEP #1221696;
  British Isles #618423(6)←#1221108(3); Caucasus #619844(6)←#1221557(3); Bábíyyih #631457(7)←#1238330(1);
  Kulayn #1219770(4)←#628411(2); Gílán #1219855(4)←#1056168(3); Hawaiian Islands #619316(4)←#1221111(2);
  Maine #617438(4)←#1221115(2); Most Great Prison #620283(6)←#1220432(3); Mother Temple of the West #629566(4)←#1219311(1);
  Near East #617780(3)←#1222563(1); Rome #1220789(3)←#618783(2); Black Sea #617754(2)←#1222506(1);
  African Continent #656246(2)←#1223890(1); American continent #1222610(8)←#655511(5); Western world #1220951(4)←#657752(4);
  Shrine of the Báb #1220471(9)←#620676(2); Tomb of the Báb #1221633(2)←#936859(1); Holy Tomb #1222223(2)←#623049(1);
  Philippine Islands #1221816(1)←#630057(1)

### Concepts / events (singular)
- Bahá'í #1221789(79)←#630215(12); Bábí #613856(26)←#1220123(12); Muḥarram #620220(16)←#1238666(2);
  Most Great Peace #1219878(8)←#621843(2); Manifestation of God #1220946(6)←#612954(2); Bahá'í Revelation #646088(9)←#1219319(6);
  Bahá'í Faith #1221586(7)←#614773(6); Day of God #1178521(6)←#1223649(1); Day of Resurrection #1219828(5)←#1169361(1);
  Divine Revelation #624766(5)←#1227971(4); Bábí Revelation: #1219468(4)/#1055669(4) (tie, keep either); Sun of Truth #619198(3)←#1219969(1);
  Resurrection #1219695(2)/#614599(2) (tie); Holy Family #1220021(2)←#620356(1); Zoroastrian #617652(9)←#1224459(1);
  Servant of God #1221366(1)←#1226229(1); Arch-Breaker of B's Covenant #1221730(3)←#1221128(2);
  Declaration of the Báb #620154(17)←#1219283(3); First Bahá'í Century #1228097(4)←#1228217(2); March 1909 #627607(1)←#1222107(1)

---

## C. CROSS-NAME merges — same entity under a title/epithet (recommend, but your call — name-based)
- **the Báb ≡ Báb**: after §A, fold "Báb" #613854 → "the Báb" #1219258. (Same person.)
- **Vaḥíd ≡ Siyyid Yaḥyáy-i-Dárábí**: fold Siyyid Yaḥyáy-i-Dárábí → Vaḥíd #1219861. (Vaḥíd is his title; confirmed.)
- **'Abdu'l-Bahá ≡ "Center of the Covenant"** (#1219728): fold into #614731. (His station/title.)
- **Jesus ≡ Christ**: fold "Christ" → "Jesus" #614482, keep "Christ" as an alias. (Christ = title.)
- **Shrine of the Báb ≡ Tomb of the Báb ≡ Holy Tomb**: likely one place on Mt. Carmel — fold Tomb/Holy Tomb → Shrine of the Báb #1220471. (VERIFY — "Holy Tomb" sometimes means Bahá'u'lláh's shrine.)

## D. HOLD — do NOT merge without your call
- **Aḥmad** (#619150 [4] / #1240419 [2]) — extremely common name; likely DIFFERENT people. KEEP SEPARATE / resolve by context.
- **Mírzá Mihdí** (#625443 [1] / #1220467 [1]) — could be Bahá'u'lláh's son vs others. KEEP SEPARATE pending context.
- **Siyyid Muḥammad** (#1220072 [20] / #619821 [19]) — likely the antagonist Siyyid Muḥammad-i-Iṣfahání, but two 20-mention rows could be distinct. REVIEW (lean merge if both = the Iṣfahání).
- **Muftí** (#625529 [4] / #1220750 [5]) and **Mujtahid** (#617083 [23] / #1220865 [7]) — these are TITLES/roles, mis-typed as persons. Recommend RETYPE to title/role (or a collective), not merge-as-person.

## NOT to cross-merge (distinct despite similar names)
- America ≠ American continent ≠ United States of America (country vs continent) — same-name merges only.
- Bahá'í ≠ Bahá'í Faith ≠ Bahá'í Revelation (distinct concepts) — same-name merges only.
