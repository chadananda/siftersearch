# Qájár Monarchs + bare "Sháh" — Cross-Corpus Verification

Scope: GPB **1219335** "Náṣiri'd-Dín Sháh", **619695** "Sháh" (bare), DB **619573** "Muḥammad Sháh", DB **1227689** "Náṣiri'd-Dín S̱háh".
Read-only verification against `data/sifter.db` + ATTACH `data/graph.db` (entity_mentions). Date 2026-06-16.

Note on counts: prompt cited mention_count 28/24; live `entity_mentions` rows are higher and authoritative — used below.
- 619573 Muḥammad Sháh: 90 mention rows
- 619695 Sháh (bare): 105 mention rows, ~103 distinct content_ids across MANY docs/books
- 1219335 Náṣiri'd-Dín Sháh (GPB): 42 mention rows
- 1227689 Náṣiri'd-Dín S̱háh (DB): 124 mention rows

---

## VERDICT

- **Muḥammad Sháh keeper = 619573** (DB). Stand-alone, distinct person. NO merge with any Náṣiri'd-Dín entity.
- **Náṣiri'd-Dín Sháh keeper = 1227689** (DB, 124 mentions — larger, cleaner DB extraction) ← **merge in GPB 1219335** (42). One person across both corpora.
- **Bare "Sháh" 619695 → DO NOT keep as a single entity; DISTRIBUTE, with explicit flags.** It is a polluted cross-document anaphora bucket spanning at least THREE distinct monarchs plus generic/institutional uses. Keeping it as one "Sháh" entity is wrong (it conflates Muḥammad Sháh, Náṣiri'd-Dín Sháh, and 20th-c. Pahlavi). Recommended: redistribute resolvable mentions to the correct monarch; route the genuinely-generic ones to no specific person (institution-of-the-monarchy) or leave unresolved. This is the USER POLICY anaphora call — recommendation below, not auto-applied.

**Confidence: HIGH (0.93)** on the two monarch keepers + the GPB↔DB Náṣiri'd-Dín unify. **MEDIUM (0.7)** on the exact per-mention split of 619695 (some mentions are irreducibly generic).

---

## FIREWALL NOTE (non-negotiable)

**Muḥammad Sháh (619573) and Náṣiri'd-Dín Sháh (1227689) are DIFFERENT PEOPLE — never merge.**
Burden-of-proof for the split is met by reign-dates + distinct viziers + distinct events, all attested in-corpus:

| Axis | Muḥammad Sháh (619573) | Náṣiri'd-Dín Sháh (1227689 ← 1219335) |
|---|---|---|
| Reign | 1834/35–1848 | 1848–1896 |
| Vizier | **Ḥájí Mírzá Áqásí** (Grand Vazír) | **Amír-Niẓám, Mírzá Taqí Khán** |
| Báb-era event | Sent Siyyid Yaḥyáy-i-Dárábí to interview the Báb; received the Báb's Tablet from Máh-Kú | 1852 attempt on his life → Bahá'u'lláh arrested at Níyávarán, Síyáh-Chál |
| Bahá'u'lláh's tablet | (Báb wrote to Muḥammad Sháh) | **Lawh-i-Sulṭán / Epistle to Náṣiri'd-Dín Sháh** ("O King! … His royal adversary") |
| Corpus quote | DB 21054025: "Ḥájí Mírzá Áqásí, the Grand Vazír of Muḥammad S̱háh" | DB 21054580: "the Amír-Niẓám, Mírzá Taqí Ḵhán, the Grand Vazír of Náṣiri'd-Dín S̱háh" |

Their own dynastic list is in-corpus (DB 21054025/21053844): Fatḥ-'Alí (1798–1834) → **Muḥammad (1835–48)** → **Náṣiri'd-Dín (1848–96)** → Muẓaffari'd-Dín → Muḥammad-'Alí → Aḥmad. The relationship is grandfather/grandson (Náṣiri'd-Dín was Muḥammad Sháh's son).

---

## DESCRIBE — keepers

**619573 — Muḥammad Sháh** (Qájár). Third Qájár king of Persia, r. 1834/35–1848. Grandson of Fatḥ-'Alí Sháh; father of Náṣiri'd-Dín Sháh. His Grand Vizier was Ḥájí Mírzá Áqásí, who treated the young Bahá'u'lláh with marked favour. Reigned during the Báb's early ministry (1844–48): received the Báb's detailed Tablet from Máh-Kú and delegated Siyyid Yaḥyáy-i-Dárábí (Vaḥíd) to investigate the Báb. Died 1848, his death precipitating the transition that opened the Ṭabarsí upheaval. *(suggested era: "Qájár, 1834–1848")*

**1227689 — Náṣiri'd-Dín Sháh** (Qájár; canonical keeper, ← 1219335 merged). Fourth Qájár king, r. 1848–1896, son of Muḥammad Sháh; ascended as a youth ("as yet inexperienced in the affairs of State"). Grand Vizier Amír-Niẓám (Mírzá Taqí Khán, Amír-Kabír) ordered the Báb's execution (1850) and prosecuted the Bábí upheavals (Ṭabarsí, Nayríz, Zanján). Survived the 1852 Bábí attempt on his life (28 Shavvál 1268 AH / 15 Aug 1852), triggering the great persecution and Bahá'u'lláh's imprisonment in the Síyáh-Chál. Addressee of Bahá'u'lláh's **Lawh-i-Sulṭán** ("His royal adversary"). Assassinated 1896; buried at a sepulchre near Ṭihrán (GPB 10047861: Maryam buried in its precincts). *(suggested era: "Qájár, 1848–1896")*

---

## DISPOSITION of 619695 "Sháh" — DISTRIBUTE (recommended split)

619695's ~103 distinct mentions resolve by context/date into four classes:

**A. → Náṣiri'd-Dín Sháh (1227689)** — dominant referent. Examples:
- 5098487 "attempt made on the life of Náṣiri'd-Dín Sháh … 1852"
- 6011870 / 6013132 "Lawh-i-Sulṭán … Tablet to the Sháh" (Bahá'u'lláh's epistle = to Náṣiri'd-Dín)
- 5708815 "tablet to Náṣiri'd-Dín Sháh and the Súratu'l-Haykal"
- 6955239 "Bahá'u'lláh's properties were confiscated by the Sháh" (post-1852)
- DB 21054788/21054790/21054807 (Zanján campaign, Amír-Niẓám era, 1850); 21054886/21054928/21054935/21054941 ("the Sháh's mother", attempt-on-life, 1852)

**B. → Muḥammad Sháh (619573)** — Báb-era / pre-1848. Examples:
- DB 21054116/21054142/21054162 (Ḥusayn Khán dismissal at Shiraz, ~1845, Áqásí era)
- DB 21054276/21054277/21054284 (Mullá Taqí heirs appeal — context paragraph names "Muḥammad S̱háh himself")
- DB 21054749 ("Muḥammad Sháh and I," spoken by Ḥájí Mírzá Áqásí re Ḥujjat) — pre-1848

**C. → 20th-c. Pahlavi monarch — NOT a Qájár, NOT either keeper.** FLAG: these are mis-bucketed entirely.
- 6311628 "in face of demands of the Sháh — to join the single Rastakhiz party … SAVAK" = **Muḥammad Riḍá Sháh Pahlavi** (1970s)
- 6312026 / 2981178 (constitutional-reform / modern-Iran context) likely Pahlavi or Constitutional-era, not Qájár
- Route to the appropriate Pahlavi entity (e.g. existing 647247 "Reza Shah" / a Mohammad-Reza entity), NOT to 619573/1227689.

**D. → Generic / institutional "the Sháh" (the monarchy as office) — no specific-person resolution safe.**
- Curzon quotes 21053809/21053810/21053815/21053817/21053825 ("the language in which the Sháh addresses his subjects," "divinity that doth hedge a throne in Persia") = the institution, era-spanning.
- 5097971 "ministerial position in the court of the Sháh" (Mírzá Buzurg's post under Fatḥ-'Alí/Muḥammad era) — borderline, lean Muḥammad/Fatḥ-'Alí but generic.
- 21053777/21053794 (Translator/Curzon prefatory, "a Sháh wished to make a just decision," "Muḥammadans from the Sháh downwards") = generic.

---

## FLAGS (genuinely ambiguous — do NOT force)

1. **Ṭabarsí-transition mentions** straddling 1848 (Muḥammad Sháh died mid-upheaval): e.g. DB 21054434 "The Sháh gave his consent, and issued his farmán to … ‘Abdu'lláh Ḵhán" (Ṭabarsí recruitment). Could be late-Muḥammad or early-Náṣiri'd-Dín. Leave for human date-anchoring.
2. **Pahlavi-era contamination (Class C)** — 6311628 / 6312026 / possibly 2981168/2981178 — bucketed under a name that reads "Qájár" by default. Must be re-routed, not merged into either Qájár keeper. Highest-priority cleanup.
3. **Pure-institution Curzon block (Class D)** — 21053809–21053825 — no single person; safest is "unresolved / monarchy-as-office," not a forced person link.
4. **"court of the Sháh" / Mírzá Buzurg (5097971, 6955229-area)** — ministerial-service context predates the Báb; lean Fatḥ-'Alí/Muḥammad era but generic.

### Why not keep 619695 as a single bucket
It conflates ≥3 distinct sovereigns across ~90 years (Muḥammad, Náṣiri'd-Dín, a Pahlavi) plus the abstract institution. A "Sháh" disambiguation **stub/landing entity** could be retained ONLY as a non-canonical anaphora pointer if the pipeline needs an anchor for un-resolvable generics (Class D) — but its resolvable mentions (A, B, C) should be moved to the correct people. Default recommendation: distribute A→1227689, B→619573, C→Pahlavi entity, D→unresolved/institution; retire 619695 as a person-entity.
