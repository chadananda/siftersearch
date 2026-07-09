# Qájár Princes vs. Shaykh Ṭabarsí — Two-Prince Consolidation (Firewalled)

Two distinct royalist (`side=other`) Qájár princes named in the Bábí–State conflict. Verified READ-ONLY against `sifter.db` + `graph.db` `entity_mentions`, corpus paragraph text, and WebSearch. The ledger's stale keeper note (Mihdí-Qulí = 1064471, 1 mention) is **superseded**: the live high-count keeper is **1219598 (19 mentions)**.

---

## VERDICT

### Prince Mihdí-Qulí Mírzá — KEEPER **1219598** ("Prince Mihdí-Qulí Mírzá", 19 mentions)
MERGE INTO 1219598:
- **1064471** "Mihdí-Qulí Mírzá" (7 mentions) — same prince; corpus shows him receiving Quddús's envoys and fleeing his burning home in the snow (the Ṭabarsí rout).
- **615734** "Mihdi-Quli Mirza" (0 mentions) — spelling variant orphan
- **1005439** "Mahdi-Quli Mirza" (0) — spelling variant orphan
- **1005440** "Mahdi-Quli Mirza's" (0) — possessive variant orphan
- **1066060** "Mahdi-Quli Mīrzā" (0) — diacritic variant orphan
- *(1064474 "Mihdí-Qulí Mírzá" is entity_type=`document`, NOT a person — leave as-is, do not merge into the person keeper.)*

### Prince Ḥamzih Mírzá — KEEPER **1219657** ("Prince Ḥamzih Mírzá", 52 mentions)
MERGE INTO 1219657:
- **615569** "Hamzih Mirza" (2 mentions) — same prince; corpus shows "the people of Hamzih Mirza" handling the Báb's imprisonment.
- **1227623** "Navvab Hamzih Mirza" (1 mention) — same prince; corpus "Navváb Ḥamzih Mírzá … conducted the Báb to Tabríz" (the Hishmatu'd-Dawlih episode). Honorific (Navváb) + same identity.
- **613804** "Hamzih Mírzá" (0) — spelling variant orphan
- **1060809** "Ḥamzih Mírzá" (0) — diacritic variant orphan

**CONFIDENCE: HIGH** for both keepers and all merges. Each prince is independently confirmed by distinct corpus episodes and corroborating WebSearch (Encyclopaedia Iranica / Wikipedia). The two are functionally and biographically separable.

---

## FIREWALL (must remain SEPARATE)

- **Mihdí-Qulí Mírzá (1219598) ≠ Ḥamzih Mírzá (1219657).** Different princes, different lineage, different campaign roles:
  - Mihdí-Qulí: son of **Fatḥ-'Alí Sháh**, brother of **Muḥammad Sháh**, governor of **Mázandarán**; field commander at **Shaykh Ṭabarsí (1848–49)**, defeated/routed by the Bábís (home burned, fled alone in snow).
  - Ḥamzih (Hishmatu'd-Dawlih): son of **'Abbás Mírzá**, uncle of **Náṣiri'd-Dín Sháh**; Governor-General of **Ádharbáyján**; ordered to bring the **Báb to Tabríz** but refused association with the execution. Later Khurásán/Mashhad command. NOT the Ṭabarsí field commander.
- **≠ Mírzá Mihdí (the Purest Branch)** — Bahá'u'lláh's son (entities 625443 / 1220467 etc.); a Bahá'í holy figure, not a Qájár royalist. Different name order (Mírzá Mihdí ≠ Mihdí-Qulí Mírzá) and `side` differs entirely.
- **≠ Mullá Mihdí** (632382 / 633200) — clerical, not royal.
- **≠ the Twelfth Imám / the Mihdí** — eschatological figure, not a historical prince.
- **≠ Mírzá Mihdíy-i-Káshání / -Rashtí** and the various Ḥamzih clerics (Mullá Muḥammad-i-Ḥamzih 1238385/1238404; place "Hamzih" 615565; "Imam-Zadih Hamzih" 1239134) — unrelated; do NOT pull into either keeper.

## DESCRIBE (suggested keeper descriptions)

- **1219598 Prince Mihdí-Qulí Mírzá** — Qájár prince, son of Fatḥ-'Alí Sháh and brother of Muḥammad Sháh; governor of Mázandarán. Commanded the royalist army besieging the Bábís at the fort of Shaykh Ṭabarsí (1848–49); routed, his house burned, fled alone through the snow. side=other.
- **1219657 Prince Ḥamzih Mírzá** (Hishmatu'd-Dawlih) — Qájár prince, son of 'Abbás Mírzá, uncle of Náṣiri'd-Dín Sháh; Governor-General of Ádharbáyján (later Khurásán/Mashhad). Received orders to bring the Báb to Tabríz; refused to be associated with His execution. side=other.

## FLAGS
- Ledger keeper note for Mihdí-Qulí (1064471 / 1 mention) is STALE — corrected to 1219598 / 19 mentions. 1064471 (7) becomes a merge source, not the keeper.
- 1064474 "Mihdí-Qulí Mírzá" is a `document` row, not a person — exclude from the person merge.
- All six zero-mention orphans are pure spelling/diacritic variants; merging is safe (no mention reassignment risk for them, but they prevent future fragmentation).
- Báb-to-Tabríz episode belongs to Ḥamzih, NOT Mihdí-Qulí — do not let the shared "Mírzá"/prince framing cross-contaminate the two during merge.

Sources: [Battle of Fort Tabarsi (Wikipedia)](https://en.wikipedia.org/wiki/Battle_of_Fort_Tabarsi), [Hamzeh Mirza Heshmat od-Dowleh (Wikipedia)](https://en.wikipedia.org/wiki/Hamzeh_Mirza_Heshmat_od-Dowleh), [Mehdi-Qoli Mirza Qajar (Wikipedia)](https://en.wikipedia.org/wiki/Mehdi-Qoli_Mirza_Qajar), [MOḤAMMAD SHAH QĀJĀR — Encyclopaedia Iranica](https://www.iranicaonline.org/articles/mohammad-shah/).
