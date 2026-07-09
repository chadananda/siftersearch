# Cross-Tradition Manifestations / Founders — Verification

Scope: consolidate the cross-tradition Manifestations referenced in the corpus (mainly GPB).
Source: `graph_entities` + `g.entity_mentions` (mention counts STALE — relative weight only).
READ-ONLY pass; no writes performed. Religion set to each figure's OWN tradition (the seed
614675 was wrongly tagged `Baha'i`; cross-tradition figures belong to their dispensation, with
`cross_tradition_candidate=true` marking their recognition across the Bahá'í lens).

---

## 1. Jesus Christ
**VERDICT — keeper: 614675 "Jesus Christ"** (person)
Merge → 614485 "Christ" (118m), 614482 "Jesus" (83m), 1225385 "Jesus" (92m, religion NULL),
1226156 "Christ" (92m, religion NULL), 1229156 "Jesus Christ" (10m, religion NULL),
643149 "His Holiness Christ" (8m), 831190 "His Holiness Jesus", 1058536 "His Holiness, Christ".
- religion: **Christianity**
- cross_tradition_candidate: **true**
- **confidence: HIGH**
- FIREWALL: keep CONCEPT/ORG/PLACE nodes SEPARATE — these are NOT the person and must not merge:
  Christianity (614567), Christians (614579), Christian (614621), Christendom (624846),
  Christhood (950254), Christ-like (1221063), Anti-Christ (641414/1233421), Christian Church,
  ecclesiastical institutions, Christian Dispensation (event), return of Christ/Jesus (concept),
  Teachings of Christ, Kingdom of Christ, Reality of Christ, ministry of Jesus.
  Person-namesakes to EXCLUDE: **Christopher Buck** (627368, scholar), **Christopher Alexander**
  (1225002) — coincidental "Christ-" prefix, different people.
- DESCRIBE: The Christ; Manifestation of God for the Christian dispensation; the "Son" / the Word.
- FLAGS: bare "Jesus" and bare "Christ" exist in BOTH a Baha'i-tagged copy and a NULL-religion copy
  — clear duplication from two ingest passes; all fold into 614675.

## 2. Moses
**VERDICT — keeper: 614448 "Moses"** (person)
Merge → 636721 "His Holiness Moses", 881238 "Manifestation of Moses" (if treated as person-ref),
1174402 "Sun of Moses" (epithet), 1219949 "Him who conversed with Moses from the Burning Bush".
- religion: **Judaism**
- cross_tradition_candidate: **true**
- **confidence: HIGH**
- FIREWALL (CRITICAL — Moses ≠ Mírzá Músá): the following "Músá/Musa" entities are DIFFERENT people:
  **Mírzá Músá** (613792, 41m) = Áqáy-i-Kalím, Bahá'u'lláh's loyal brother — DO NOT MERGE.
  **Musá Banání** (638834, Hand of the Cause), **Musa al-Kadhim / Musa-Kazim** (1239135, 1055990,
  the 7th Shí'í Imám), **Imam Musa** (619713), **Abu Musa al-Ash'ari** (1224751, hadith narrator).
  Also keep separate: Revelation/Revelations of Moses (event/concept nodes).
- DESCRIBE: Moses (Heb. Mosheh); Manifestation of God for the Mosaic dispensation; gave the Law,
  spoke with God at the Burning Bush on Sinai.
- FLAGS: none — the Mírzá Músá firewall is the only real trap and the corpus distinguishes them.

## 3. Zoroaster
**VERDICT — keeper: 622667 "Zoroaster"** (person, 8m)
Merge → 1224670 "Zoroaster" (7m, religion NULL — duplicate of same person),
1219928 "followers of Zoroaster" only as a pointer (it is org, keep node but link).
- religion: **Zoroastrianism**
- cross_tradition_candidate: **true**
- **confidence: HIGH**
- FIREWALL: keep CONCEPT/ORG nodes separate: Zoroastrian (1224459 / 617652), Zoroastrians (614634),
  Zoroastrianism (622668), Zoroastrian faith/Faiths (1220593/992639), Zoroastrian Dispensation
  (event), Zoroastrian Holy Writ (work), Faith of Zoroaster (concept). No person-namesakes found.
- DESCRIBE: Zoroaster (Zarathustra / Zardusht); Manifestation of God for the Zoroastrian
  dispensation of ancient Persia.
- FLAGS: no separate "Zarathustra"-spelled node exists in the corpus; only "Zoroaster" surface form.

## 4. Buddha
**VERDICT — keeper: 622511 "the Gautama Buddha"** (person, 1m)
Merge → 1224671 "Buddha" (6m, religion NULL — same referent, higher count but generic surface form).
(If a single canonical-name keeper is preferred, rename keeper to "Gautama Buddha"; 622511 already
carries the full name and a religion tag, so it is the better anchor than the bare 1224671.)
- religion: **Buddhism**
- cross_tradition_candidate: **true**
- **confidence: HIGH**
- FIREWALL: 1219930 "Buddha of Universal Fellowship" is a concept/epithet node — keep separate.
  No person-namesakes.
- DESCRIBE: Gautama Buddha (Siddhārtha Gautama / Shākyamuni); founder of Buddhism, recognized in
  Bahá'í teaching as a Manifestation of God.
- FLAGS: keeper has lower mention count (1) than the bare-"Buddha" duplicate (6) — counts are STALE
  and the full-name node is the correct anchor regardless.

## 5. Krishna
**VERDICT — keeper: 622445 "Krishna"** (person, 6m)
Merge → (none; sole person node).
- religion: **Hinduism**
- cross_tradition_candidate: **true**
- **confidence: HIGH**
- FIREWALL: 1219933 "the Immaculate Manifestation of Krishna" is a work/title node — keep separate.
- DESCRIBE: Krishna (Kṛṣṇa); central figure of Hinduism (Bhagavad Gītā), recognized in Bahá'í
  teaching as a Manifestation of God.
- FLAGS: none.

## 6. Abraham
**VERDICT — keeper: 614481 "Abraham"** (person, 41m)
Merge → 1224580 "His Holiness Abraham" (religion NULL — honorific variant, same person).
- religion: **Judaism** (Patriarch / Friend of God — common to Abrahamic faiths; tag Judaism as the
  originating dispensation, cross_tradition_candidate captures the rest)
- cross_tradition_candidate: **true**
- **confidence: HIGH**
- FIREWALL (CRITICAL — Abraham ≠ the Karbilá'í / Mír / Mullá Ibráhíms): every "Ibráhím/Ibrahim" below
  is a DIFFERENT person (mostly 19th-c. Bábí/Bahá'í figures & martyrs) — DO NOT MERGE:
  Mirza Ibrahim (615202), Siyyid Ibráhím (630639), Ibrahim (616467, bare namesake),
  Mullá Ibráhím-i-Maḥallatí (1064454), **Ibrahim Kheiralla / Ibráhím Khayru'lláh /
  Ibráhím-i-Khayru'lláh** (626044, 1221058, 1221739 — the early American teacher who later broke
  away; all the SAME person as each other but NOT Abraham), Haji Muhammad-Ibrahim (1047006),
  Ḥájí Muḥammad Ibráhím-i-Khalíl (1220936), Ibrahim Páshá (614686, Ottoman general),
  Mullá Ibráhím (619176), Muḥammad-Ibrahim (1145316).
  Concept/event nodes to keep separate: exile of Abraham, Abraham's intended sacrifice, Station of
  Abraham.
- DESCRIBE: Abraham (Ibráhím); the Patriarch, Friend of God (Khalílu'lláh); progenitor through whom
  the Abrahamic Manifestations descend; recognized in Bahá'í teaching as a Manifestation of God.
- FLAGS: "Ibrahim Kheiralla" cluster (3 spellings) is itself a separate dedup target — flag for the
  person-namesake pass, but firewalled hard from Abraham here.

---

## Cross-cutting notes
- All six keepers are `entity_type=person` already — no type correction needed.
- Religion correction is the main edit: the seed and most copies carry `Baha'i`; these should reflect
  each figure's OWN tradition + `cross_tradition_candidate=true`.
- NULL-religion duplicate nodes (1225385, 1226156, 1229156, 1224670, 1224671, 1224580) are artifacts
  of a second ingest pass with no religion tag — safe merge targets into their keepers.
- Mention counts are STALE (per task); used only for relative weighting / keeper selection.
