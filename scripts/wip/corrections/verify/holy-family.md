# Holy Family — ‘Akká period (verification)

Consolidation of Bahá'u'lláh's immediate family: the Purest Branch, Navváb (Ásíyih Khánum),
and Munírih Khánum (‘Abdu'l-Bahá's wife). Mention counts from `graph.db entity_mentions`
(STALE — counts are directional, not authoritative). READ-ONLY; no DB writes performed.

---

## VERDICT

### 1. Mírzá Mihdí — the Purest Branch (Ghusn-i-Aṭhar)
**KEEPER: 1220467 `Mírzá Mihdí` (person, 52 mentions)**
Merge into keeper:
- 625443 `Mírzá Mihdí` (person, 7) — "the Purest Branch, ‘Abdu'l-Bahá's twenty-two year old brother"
- 1222079 `Purest Branch` (mistyped **work**, 21) — every context is the sacrifice/ascension of the
  Purest Branch (the *person*); type must be corrected person→ before/at merge.

Confirmed: keeper context reads "Mírzá Mihdí (the Purest Branch)", aliases include
"martyred son of Bahá'u'lláh" and "the noble, the pious Mírzá Mihdí". Total ~80 mentions post-merge.
**Confidence: HIGH.**

### 2. Navváb = Ásíyih Khánum
**KEEPER: 620193 `Ásíyih Khánum` (person, 0 mentions — prior canonical merge target)**
Merge into keeper:
- 1219442 `Navváb` (person, 30) — Holy-Family contexts, alias "the saintly Navváb"
- 638164 `Asiyih Khánum` (person, 12) — "Asiyih Khánum, later surnamed Navváb by Bahá'u'lláh,
  daughter of … Mírzá Ismá'íl-i-Vazir"; alias "Ásíyih"

Keeper 620193 carries 0 live mentions (canonical shell from earlier Navváb verification, per task);
the mention mass lives on 1219442 + 638164. Web cross-check: Ásíyih Khánum = wife of Bahá'u'lláh,
mother of ‘Abdu'l-Bahá AND of Mírzá Mihdí (the Purest Branch) — ties the family together.
**Confidence: HIGH.**

### 3. Munírih Khánum — ‘Abdu'l-Bahá's wife
**KEEPER: 620369 `Munirih Khanum` (person, 14 mentions)**
Merge into keeper:
- 638433 `Munírih` (person, 2) — "named Fáṭimih … Bahá'u'lláh conferred the name Munírih (Illumined)";
  father + uncle Mírzá Hádí (the Nahrí family of Iṣfahán) at Badasht.

Confirmed: Nahrí of Iṣfahán; born Fáṭimih, renamed Munírih; memoirs cited. **Confidence: HIGH.**

---

## FIREWALL (kept SEPARATE — do NOT merge)

- **Purest Branch (1220467) ≠ Prince Mihdí-Qulí Mírzá (1219598)** — the Ṭabarsí/Dawn-Breakers prince.
- **Purest Branch ≠ Mihdí-Qulí Mírzá (1064471)**, **≠ Mullá Mihdí (632382)**, **≠ Siyyid Mihdí (630710)**,
  **≠ Imám Mihdí / the Twelfth Imám (638935, 1227661)**, **≠ Mírzá Mihdíy-i-Rashtí (1119854)**.
- **Navváb/Ásíyih (620193) ≠ Mahd-i-‘Ulyá = Fáṭimih Khánum (638225)** — Bahá'u'lláh's SECOND wife,
  his cousin, mother of the Covenant-breaker Muḥammad-‘Alí. Verified: "second wife … usually referred to
  as Mahd-i-'Ulya … a cousin of Bahá'u'lláh." Distinct identity.
- **Navváb/Ásíyih ≠ Ṭáhirih** (see FLAG below re: context bleed).
- **Munírih Khánum ≠ Mahd-i-‘Ulyá.**
- Excluded as unrelated namesakes: 1227619 `Navvab-i-Radavi`, 1227623 `Navvab Hamzih Mirza`
  (the "Navváb" honorific applied to other persons, NOT Ásíyih).

---

## DESCRIBE (proposed keeper descriptions)

- **1220467 Mírzá Mihdí — the Purest Branch (Ghusn-i-Aṭhar)** (1848–23 Jun 1870): youngest son of
  Bahá'u'lláh and Ásíyih Khánum (Navváb); brother of ‘Abdu'l-Bahá. Served as amanuensis. Died at ~22 in
  the ‘Akká barracks, falling through an unguarded skylight; offered his life as a ransom. entity_type=person.
- **620193 Ásíyih Khánum (Navváb)**: first/principal wife of Bahá'u'lláh (m. Ṭihrán ~1835), daughter of the
  nobleman Mírzá Ismá'íl-i-Vazir; titled Navváb. Mother of ‘Abdu'l-Bahá, Bahíyyih Khánum, and the Purest Branch.
- **620369 Munírih Khánum**: wife of ‘Abdu'l-Bahá; of the Nahrí family of Iṣfahán (uncle Mírzá Hádí); born
  Fáṭimih, renamed Munírih ("Illumined") by Bahá'u'lláh.

---

## FLAGS

1. **1222079 mistyped as `work`** — it is the Purest Branch (person). Correct entity_type to person on merge,
   else a person-mention mass is hidden under a "work".
2. **1220467 bad alias `martyred youth of Shíráz` (conf 0.95)** — geographically wrong (the Purest Branch died
   in ‘Akká). Likely promoter mis-attribution; recommend dropping this alias. Does not affect identity.
3. **638164 context bleed** — one of its 12 mentions is the Ṭáhirih martyrdom paragraph ("first woman suffrage
   martyr"). Paragraph-level attribution noise, not an identity error; the entity itself is correctly
   "Asiyih Khánum, surnamed Navváb." Verify no Ṭáhirih cross-link survives the merge.
4. **Keeper 620193 has 0 live mentions** — confirm it is still the intended canonical Navváb shell before merging
   30+12 mentions onto it (consistent with prior Navváb verification keeper 620193).
5. Mention counts are STALE (entity_mentions not pruned on delete — see open task #2); treat as directional.
