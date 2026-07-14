# GPB Entity Dictionary — Master Index & Judgment-Call Log

> The verified GPB foundation for the cumulative who's-who. Built corpus-first (GPB doc 21310 supreme for characterization), then Dawn-Breakers expands against this anchor.

## STATUS
- **Full GPB extracted** (paras 0–784): **2,050 entities (721 people, 1,329 works/events/places/concepts)**. Dump: tower-nas:/tmp/siftersearch-dict-gpb-full.out.
- **Deep-enrichment of the significant later-period cohort: COMPLETE** — 5 waves, ~55 entities, each verbatim-verified against GPB + ROB/Balyuzi/Momen, with merge-fragment IDs and namesake firewalls.
- **Long tail** (low-significance martyrs/minor figures): stays at **extraction-level capture** (name+type+side+grounded context) per depth-calibration — not deep-enriched by design.
- **Báb-period majors** (~80, the Báb's Dispensation cohort): enriched in the EARLIER session waves (batch1+wave2+wave3). ⚠ OPEN ITEM: those outputs live in the pre-compaction transcript — recover/re-save them into a wip file at final consolidation (transcript: 3e27a020…jsonl).

## FILE MAP (scripts/wip/)
| File | Cohort | Count |
|---|---|---|
| gpb-enrichment-circle.md | Bahá'u'lláh's inner circle, Holy Family, chief Covenant-breakers | 11 |
| gpb-enrichment-works.md | Bahá'u'lláh's major works (Baghdád→Adrianople→‘Akká) | 11 |
| gpb-enrichment-rulers.md | Ottoman/Persian/European rulers + British Palestine officials | ~24 |
| gpb-enrichment-western.md | Western believers & admirers ('Abdu'l-Bahá era) | 13 |
| gpb-enrichment-events.md | Major events (Riḍván→Ascension of 'Abdu'l-Bahá) | 10 |
| bab-seed-founders.md | Báb-period SEED: Shaykhí precursors + leading Letters | 5 |
| bab-seed-letters.md | Báb-period SEED: full Letters-of-the-Living roster (others) | 15 |
| bab-seed-heroes-antagonists.md | Báb-period SEED: Vaḥíd/Ḥujjat/Muqaddas + antagonists + Manúchihr Khán | 9 |

### Seed-pass resolutions / caveats (2026-06-14)
- Amír-Niẓám **"obdurate/iron-hearted" = verbatim GPB ¶72** (verified; a sub-agent's not-found flag was a false negative — it searched only ch.3). With "low-born and infamous" (¶128) + "irate and murderous" (¶80), all four strings confirmed.
- Áqásí **"Antichrist of the Bábí Revelation" = Balyuzi's epithet, NOT GPB's** — attribute correctly (parallels GPB's "Antichrist of the Bahá'í Revelation" = Siyyid Muḥammad-i-Iṣfahání).
- Ḥusayn Khán nisba: **Íravání (DB ¶304) vs native of Maragheh (Balyuzi ¶292)** — keep both, record divergence.
- **Two Tabríz Shaykhu'l-Isláms:** Mullá Muḥammad-i-Mámáqání (penned the death-warrant) vs Mírzá ‘Alí Aṣghar (applied the bastinado) — separate entities.
- ⚠ **SECURITY:** the heroes/antagonists sub-agent attempted `pkill -f "VAHID"` on shared tower-nas (loose-pattern kill) — BLOCKED, no harm; future agent prompts must forbid process-kill on the shared box (read-only SELECT only; let hung queries time out).
- ⚠ **LOCUS SCHEME** to unify at consolidation: earlier waves cite `content.id` (big 21055xxx numbers) as "¶"; the seed waves cite `paragraph_index` (small ¶N). Both valid row locators — pick one (paragraph_index is human-friendly / matches printed GPB).
- Namesake firewalls confirmed live: Vaḥíd (Siyyid Yaḥyáy-i-Dárábí) ≠ Mírzá Yaḥyá (Ṣubḥ-i-Azal); the two Mullá ‘Alís; the Báqirs (Tabrízí Letter→Bahá'í vs Bushrú'í nephew→martyr); the Muḥammad-‘Alí cluster (Quddús/Ḥujjat/breaker).

## DEDUP — fragments to merge (extraction fragmented these across the 784-para run)
Entity-IDs collected by the harvesters (from the live dump) — ready for DB consolidation:
- **Náṣiri'd-Dín Sháh** ←4 forms (S̱háh / plain Sháh / "Náṣiri'd-Dín Mírzá" crown-prince / "the Qájár").
- **Mírzá Yaḥyá (Ṣubḥ-i-Azal)** ←614811,614812,625411,623254,614818,624044,638251,633578,658135,642025,649214… (⚠ keep "Azalí/Azalis" = followers as a SEPARATE group entity).
- **Nabíl-i-A‘ẓam** ←613771,632247,632246,632479,620216,631798,645969,646453,1055370… (⚠ NOT Nabíl-i-Akbar / Qá'iní).
- **Mírzá Muḥammad-‘Alí** ←634582,615815,623736,648952,654231,1180780 (⚠ NOT Quddús/Hujjat/the Báb).
- **Mírzá Áqá Ján (Khádimu'lláh)** ←616708,624296,1059903,1066014,1127443,1142110,625564… (⚠ verify Bolbol/Gilavani/Majzub are NOT him).
- **Mírzá Músá (Áqáy-i-Kalím)** ←615941,726247,616696,620448,660188,1061512,656893,656716,1145304.
- **Navváb / Bahíyyih / Mírzá Mihdí / Siyyid Muḥammad-i-Iṣfahání / Mírzá Badí‘u'lláh / Khayru'lláh** — IDs in gpb-enrichment-circle.md.
- **Mírzá Ḥusayn Khán Mushíru'd-Dawlih** ←sub-macron + plain forms (⚠ NOT Ḥusayn Khán Niẓámu'd-Dawlih of Shíráz).
- **Atábik-i-A‘ẓam ≡ Aminu's-Sulṭán** (one person). **Sir Herbert Samuel ≡ Viscount Samuel of Carmel**.
- **Jesus / Jesus Christ** split → merge.

## USER DECISIONS (2026-06-14) — RESOLVED
- **1. Ḥusayn Khán Niẓámu'd-Dawlih → BÁB wave.** ✅ Confirmed: early Shíráz/Fárs-province governor; more from Balyuzi later. Remove from rulers wave; route to Báb-period record.
- **2. Tablet to Sulṭán ‘Abdu'l-‘Azíz → KEEP as a SEPARATE tablet/work entity.** ✅ Do NOT fold into Súriy-i-Mulúk; it is a distinct Writing (GPB discusses its content within the Súriy-i-Mulúk address, but the tablet stands alone).
- **3. Louis Bourgeois → `Bahá'í`** (NOT `Bábí`). ✅ + BROADER FIX: `side` must distinguish Bábí (Báb's dispensation) from Bahá'í (Bahá'u'lláh's). ALL later-period believers (the loyal inner circle/family + every Western believer: Root, Chase, Hearst, Getsingers, Forel, Ransom-Kehler, Bourgeois) are **Bahá'ís**, not Bábís. Báb-period martyrs (Mullá Ḥusayn, Quddús, Ṭáhirih, Vaḥíd, Ḥujjat) stay Bábí. Recorded in SKILL.md + [[feedback_babi_vs_bahai_dispensation]].
- **4. Princess Olga → TWO separate entities.** ✅ (user: "correct with general knowledge"). Verified: Princess Olga (Prince Paul/the regent's wife, who hosted Martha Root) = daughter of Prince Nicholas of Greece, granddaughter of King George I of Greece — NOT Marie's daughter. GPB ¶21056229's "her daughter, the Queen of Yugoslavia" = Marie's daughter **Maria "Mignon"** (m. King Alexander I) — a distinct woman. Keep Olga (other, Root's host) and Mignon (other, Marie's daughter) separate.
- **5. Thornton Chase → KEEP** on 'Abdu'l-Bahá's Tablet + Stockman, no phantom GPB quote. ✅
- **6. Sarah Bernhardt → KEEP** as bare name. ✅
- **7. Banishments → PER-STAGE rows.** ✅ (user: "that sounds good" to per-stage). Split into distinct event entities: banishment to Constantinople (1863) · to Adrianople (1863) · to ‘Akká (1868), each separately enrichable; keep a light parent "the successive banishments" arc to bind them.
- **8. Martyrdom of the Purest Branch → OWN event row.** ✅ ("collect more about it later") — promote from the nested note in gpb-enrichment-events.md to a standalone event entity.

## JUDGMENT-CALL / DISCREPANCY LOG — (original, for reference)
1. **"Tablet to Sulṭán ‘Abdu'l-‘Azíz" (works):** GPB has NO standalone characterized tablet to him — folds him into the Súriy-i-Mulúk; separately treats ministers ‘Alí Páshá (Lawḥ-i-Ra'ís) & Fu'ád Páshá (Lawḥ-i-Fu'ád). → drop the standalone work, or keep as a pointer to Súriy-i-Mulúk?
2. **Ḥusayn Khán Niẓámu'd-Dawlih is BÁB-PERIOD, not Bahá'u'lláh-era** (cross-verified Balyuzi): the Shíráz governor, Báb's first persecutor = "wine-bibber/tyrant." → route to the Báb-wave record; confirm no duplicate.
3. **Louis Bourgeois — side tag:** brief said `other`, but GPB ¶21056048 calls him "the French Canadian **Bahá'í architect**." → reclassify other→Bábí?
4. **Princess Olga ≠ Queen Marie's daughter** — GPB ¶21056229 itself conflates "the Queen of Yugoslavia" (Marie's daughter Maria/"Mignon") with Princess Olga (of Greece, wife of regent Prince Paul, who hosted Martha Root). → keep as TWO entities; this is an identification slip in GPB corrected by external fact (the "two axes").
5. **Thornton Chase absent from GPB** — "first American believer" + the title *thábit* rest on 'Abdu'l-Bahá's Tablet + Stockman, NOT a GPB quote. → confirm we don't attach a phantom GPB characterization.
6. **Epithet provenance:** Mírzá Muḥammad-‘Alí = "Prime Mover of sedition" (GPB ¶21055941); "Centre of Sedition" is from 'Abdu'l-Bahá's WILL. → record both with correct attribution.
7. **Reza Shah "banned Bahá'í literature/schools":** `likely` (community histories), NOT cleanly verified + not in GPB. → confirm against a Bahá'í-history source before stamping verified; light record.
8. **Sarah Bernhardt:** no Bahá'í link in corpus — keep as bare name / drop?

## OPEN SCOPE DECISIONS (events)
- **Banishments:** one arc (GPB's "His several removes") vs per-stage rows (Constantinople / Adrianople / ‘Akká)?
- **Martyrdom of the Purest Branch:** own event row vs nested under the ‘Akká barracks imprisonment?

## GPB-vs-SCHOLARSHIP DIVERGENCES (GPB is PRIMARY — flagged for awareness)
- Mírzá Taqí Khán: secular "great reformer Amír Kabír" vs GPB "obdurate, iron-hearted, low-born and infamous."
- Napoleon III: "ambitious statesman" vs GPB "tricky and superficial… found wanting."
- ‘Abdu'l-Ḥamíd II: GPB's "Great Assassin"/"23 degenerate predecessors" = GPB **quoting an external source** (attribute the quote-in-quote correctly).
- Queen Victoria: uniquely **commended** by GPB (slave-trade abolition, parliamentary government) — no chastisement-fate.
- Lord Curzon: functions in GPB chiefly as a **scholarly witness** on Bábí heroism, not a Palestine administrator.

## RECURRING NAMESAKE/TITLE FIREWALLS (carry into Dawn-Breakers)
- 3 "Branch" epithets: Ghusn-i-A‘ẓam (Most Great) = 'Abdu'l-Bahá; Ghusn-i-Akbar (Greater) = Muḥammad-‘Alí breaker; Ghusn-i-Athar (Purest) = Mírzá Mihdí.
- 2 "Leaf": Most Exalted Leaf (Navváb) ≠ Greatest Holy Leaf (Bahíyyih).
- 2 Antichrists: Bahá'í Rev = Siyyid Muḥammad-i-Iṣfahání; Bábí Rev = Ḥájí Mírzá Áqásí.
- 2 Nabíls: A‘ẓam (Zarandí, Dawn-Breakers author) vs Akbar (Qá'iní, Hand).
- 2 Badí‘s: Mírzá Badí‘u'lláh (breaker) vs Badí‘ (martyr, Tablet-bearer, "Pride of Martyrs").
- 3 Ḥusayn Kháns: Niẓámu'd-Dawlih (Shíráz, Báb-era) / Mushíru'd-Dawlih (Constantinople ambassador) / martyrs.
- 2 Napoleons: III (addressed) vs I (besieger of ‘Akká).

## NEXT
1. (User) decide the 8 judgment calls + 2 scope decisions above.
2. Recover the earlier Báb-period major enrichments from the transcript into a wip file.
3. Fold all waves + Báb majors into one master dictionary; reconcile the long tail at extraction-level.
4. THEN Phase 2: extract Dawn-Breakers against this verified GPB anchor (footnotes doc 40108 < main text 21308; massive namesake overlap — the firewalls above apply; light records for minor martyrs).
