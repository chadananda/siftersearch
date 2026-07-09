# Per-Entity Review — worked records (implicit connections ferreted out)

> Running log of entities researched one-by-one (the manual verification pass). Each record reads the entity's
> full mention chain, surfaces the IMPLICIT connections NER missed, and records merge/split/firewall/relate/side/describe.
> READ-ONLY; proposals pending the write-path (D-G).

---

## Mullá Javád-i-Baraghání — believer → enemy (jealousy over Mullá Ḥusayn's station)
- **Entity:** `983896` "Mullá Javád" → canonical **"Mullá Javád-i-Baraghání"** · type person · **side: opponent** (early believer who apostatized — final-allegiance rule).
- **ALIAS-ADD:** **"Mullá Javád-i-Vilyání"** + "Vilyání" (the title/nisba he is "often called by" — user-supplied; well-attested in the wider literature but NOT surfaced under this entity in the indexed DB text → verify in source, e.g. Browne/Zarandí variants, before stamping verified). Current aliases on 983896: "Mullá Javád-i-Baraghání" (0.85), "Mullá Javád" (0.7). Adding Vilyání lets bare "Vilyání" references resolve to him.
- **DESCRIBE:** A **MATERNAL cousin** of Ṭáhirih (proper nisba **Vilyání**; the indexed DB abbreviates him "Mullá Javád-i-Baraghání" from her family orbit — a slab-abbreviation, not his true nisba). **It was through him — the maternal side — that Ṭáhirih came to the Shaykhí teachings** — sourced (user): she was *"introduced to the radical new Shaykhí teachings in the library of her cousin, Javád Valiyání."* ⚠ Her **PATERNAL** family (the Baraghání line of Mullá Taqí) was **strongly opposed to the Shaykhís** generally, because of Mullá Taqí — so her exposure to Shaykhism came via the *maternal* cousin, against the paternal family's stance. (This kinship split is the causal key to the whole episode.) Among the FIRST group to reach Shíráz and meet the Báb, shortly after Mullá Ḥusayn (an early believer). As the Báb showed increasing favour toward Mullá Ḥusayn, Javád grew envious; he made repeated disparaging remarks about Mullá Ḥusayn and gradually fell away, turning into an opponent. (The Shaykhí-introduction is an external biographical source, not the indexed DB text — confidence "sourced", distinct from corpus-verified.)
- **EVIDENCE:** cid 21054089 / ¶328 ("the first group… the last three… the Báb's increasing favour towards Mullá Ḥusayn aroused their anger"); cid 21054086 ("Mullá Javád often alluded… disparaging remarks… impelled me to cease my association"). Travelling companion from Qazvín = ‘Abdu'l-Karím (Mírzá Aḥmad-i-Kátib).
- **RELATE:** cousin→ **Ṭáhirih** (1219340); envious-of / turned-against→ **Mullá Ḥusayn** (1219326); travelling-companion→ **Mullá ‘Abdu'l-Karím-i-Qazvíní** (1228051; who left him over the disparagement).
- **FIREWALL:**
  - ≠ **Mullá Muḥammad** (Ṭáhirih's husband-cousin, son of Mullá Taqí Baraghání) — Ṭáhirih's **PATERNAL** (Baraghání) cousin, from the family branch strongly opposed to the Shaykhís because of Mullá Taqí; "haughty and false-hearted," opponent from the START (cid 21054264), never a believer. Javád is the **MATERNAL** cousin (Vilyání) — opposite family branch, opposite relationship to Shaykhism. (Same "cousin of Ṭáhirih" label, two different family lines — do not conflate.)
  - ≠ **Mullá Muḥammad-Taqí Baraghání** ("the Martyr"/Shahíd-i-Thálith, Ṭáhirih's paternal uncle, the fierce anti-Shaykhí mujtahid) — Javád's opposite in stance.
  - ≠ the other two of "the last three" who also fell away: **Mullá ‘Abdu'l-‘Alíy-i-Harátí** (1228050) + **Mírzá Ibráhím-i-Shírází** — distinct men, distinct entities.
  - ≠ any other "Javád" namesakes.
- **IMPLICIT-CONNECTION NOTES (why this needed reading, not NER):** the kinship is encoded only in the nisba "Baraghání"; membership in the apostate set is "the last three of the group" (positional, unnamed); the motive is phrased as the Báb's favour "aroused their anger." All three require cross-paragraph reading + the Baraghání-family firewall to resolve.
- confidence: verified (corpus) for the arc; the Shaykhí-introduction detail = NEEDS-USER/verify-in-source.

---

## Mírzá Aḥmad-i-Qazvíní — the Báb's amanuensis, close friend of Nabíl (a name-change, MERGE not split)
- **Entity:** keeper **1219638** "Mírzá Aḥmad" (41) ← **MERGE 1228051 "Mullá ‘Abdu'l-Karím" (17)** · type person · side **Bábí**. **USER-CONFIRMED merge** ("that seems like a correct merge").
- **Identity / aliases:** ONE man with a name-change — **‘Abdu'l-Karím** (earlier name) → **Mírzá Aḥmad-i-Kátib** ("the scribe") → **Mírzá Aḥmad-i-Qazvíní**, often called just **"Mírzá Aḥmad."** Aliases: {Mírzá Aḥmad · Mírzá Aḥmad-i-Qazvíní · Mírzá Aḥmad-i-Kátib · Mullá ‘Abdu'l-Karím · ‘Abdu'l-Karím-i-Qazvíní}. EVIDENCE cid 21054086 ("Mírzá Aḥmad-i-Kátib, better known in those days as Mullá ‘Abdu'l-Karím") + user.
- **DESCRIBE:** From Qazvín; one of the Báb's amanuenses; an early believer (the Báb gently awakened him — "‘Abdu'l-Karím, are you seeking the Manifestation?", cid 21054089-region); travelling companion of Mullá Javád-i-Vilyání, whom he left over Javád's disparagement of Mullá Ḥusayn. **A close friend of Nabíl** (the author) and one of his named Preface informants ("Mírzá Aḥmad-i-Qazvíní, the Báb's amanuensis", para_121). [mine Momen Qazvín 11558 + Zuhúru'l-Ḥaqq for fuller bio]
- **RELATE:** close-friend-of + informant-to→ **Nabíl** (620216); amanuensis-of→ **the Báb** (1219258); former-travelling-companion→ **Mullá Javád-i-Vilyání** (983896).
- **FIREWALL / split-out:** the *Yazd Azghandí-nephew* mentions wrongly on 1219638 (a different Aḥmad, nephew of the Yazd mujtahid Azghandí) → SPLIT out; ≠ the Nayríz fort-officer "Mírzá Aḥmad"; ≠ Mírzá Áqá Ján (Bahá'u'lláh's amanuensis). The ‘Abdu'l-Karím part is NOT a namesake — it's the same man.
- **LESSON logged:** a name-change (‘Abdu'l-Karím→Mírzá Aḥmad) reads exactly like two entities; only the literature/user distinguishes a name-change (merge) from a true namesake (split). confidence: verified + user-confirmed.

---

## Siyyid Ḥusayn-i-Yazdí ("‘Azíz") — the Báb's amanuensis (a GENUINE over-merge → SPLIT; the opposite of ‘Abdu'l-Karím)
- **Entity:** keeper **1219427** = **Siyyid Ḥusayn-i-Yazdí**, surnamed **‘Azíz**, the Báb's amanuensis · side **Bábí**. ⚠ 1219427 is a GENUINE OVER-MERGE — its 17-alias set fuses ≥6 distinct Siyyid Ḥusayns (different nisbas, different roles, NO name-change linking clause). UNLIKE ‘Abdu'l-Karím (one man), these are true namesakes → **SPLIT** (the agent was right here; I re-verified deeply).
- **Keeper identity (corpus + web cross-checked):** the Báb's amanuensis; accompanied Him at Máh-Kú & Chihríq, recorded the revealed verses; the morning of the martyrdom the Báb was "completing His interrupted conversation with His amanuensis" (*"I have finished My conversation with Siyyid Ḥusayn"*); martyred Ṭihrán **1852** (Síyáh-Chál, imprisoned with Bahá'u'lláh; refused offered release). Aliases: {Siyyid Ḥusayn-i-Yazdí · ‘Azíz · Siyyid Ḥusayn-i-‘Azíz · "His amanuensis Siyyid Ḥusayn"}. EVIDENCE: cid 21054185 (the Báb summons "Siyyid Ḥusayn-i-Yazdí and Mullá ‘Abdu'l-Karím"); web = Bahaipedia / Bahai Chronicles.
- ⚠ **FLAG (verify in corpus, not web alone):** web calls him a "Letter of the Living" — confirm against GPB's enumeration of the 18 before recording (corpus authoritative).
- **SPLIT OUT — each its own entity (verified distinct by nisba + role + context):**
  - **Siyyid Ḥusayn-i-Azghandí** — foremost mujtahid of Yazd, Mírzá Aḥmad-i-Qazvíní's **maternal uncle** (cid 21054130 "his maternal uncle, Siyyid Ḥusayn-i-Azghandí, the foremost mujtahid"); side other/opponent.
  - **Siyyid Ḥusayn-i-Turshízí** — a Seven Martyr of Ṭihrán (coordinate with db-zanjan-babarc CREATE op 24).
  - **Siyyid/Mírzá Ḥusayn-i-Mutavallí** — ⚠ almost certainly the Ṭabarsí **BETRAYER** (Mírzá Ḥusayn-i-Mutavallíy-i-Qumí, db-nayriz-tabarsi M4). **CRITICAL FIREWALL: the traitor must NOT remain aliased onto the loyal amanuensis.**
  - **Siyyid Ḥusayn-i-Káshání** / Áqá Siyyid Ḥusayn-i-Káshání · **Siyyid Ḥusayn-i-Zavárí'í** · **"Siyyid Ḥusayn of Milan"** — verify each (different nisbas → likely separate light entities).
- **METHOD NOTE:** discriminator confirmed both ways — ‘Abdu'l-Karím had a "better known as" *linking clause* (name-change → MERGE); Siyyid Ḥusayn's variants have different nisbas + different roles + NO linking clause (namesakes → SPLIT). Deep corpus+web synthesis distinguished them; shallow string comparison could not have.
- confidence: SPLIT verdict verified (corpus + web); the per-mention assignment of 1219427's rows to keeper-vs-each-namesake is the next pass.

---

## Mírzá Muḥammad-‘Alí (638227) — GENUINE 6-way over-merge → SPLIT confirmed (the corpus's most-conflated name)
- **Entity 638227** fuses ≥6 distinct men named "Mírzá Muḥammad-‘Alí" — confirmed by the alias set + the doc-spread (doc 426 *Child of the Covenant* = 176 mentions = the arch-breaker; 21308 DB = 24 = the early Bábís; Taherzadeh 429–432 = the breaker). SPLIT (agent was right here — re-verified, not trusted). Partition:
  1. **Mírzá Muḥammad-‘Alí — Ghusn-i-Akbar / the Greater Branch**, son of Bahá'u'lláh, arch-**Covenant-breaker** → **keeper 614534** (existing; the bulk: doc 426 + 429–432). side **opponent**. (aliases on 638227: Ghusn-i-Akbar, the Greater Branch, son of Bahá'u'lláh, His unfaithful brother, Mírzá Muḥammad-‘Alí of Rasht.)
  2. **Mírzá Muḥammad-‘Alíy-i-Nahrí** (Iṣfahán; daughter **Munírih Khánum** wed ‘Abdu'l-Bahá the Most Great Branch) — cid 21053991. → own entity, side Bahá'í.
  3. **Mírzá Muḥammad-‘Alíy-i-Qazvíní** — a **Letter of the Living**; **Ṭáhirih's brother-in-law** who carried her sealed letter to the Báb (cid 21053970/71); left Mashhad with Quddús → Ṭabarsí (cid 21054304). → own entity (likely = an existing Qazvíní-Letter node — verify), side Bábí.
  4. **Mírzá Muḥammad-‘Alíy-i-Zunúzí = Anís** — the youth martyred WITH the Báb → **existing entity 1219654** (stepfather Siyyid ‘Alíy-i-Zunúzí, cid 21054700). side Bábí.
  5. **Mírzá Muḥammad-‘Alíy-i-Ṭabíb-i-Zanjání** — the Zanján physician → own entity, side Bábí.
  6. verify: a Hamadán physician (cid 21054263 region); and whether the brother-in-law (#3) is one-and-the-same Qazvíní Letter (likely yes).
- **FIREWALL:** all six kept distinct; the arch-breaker (opponent) must never fuse with the Bábí martyrs (Anís, the Qazvíní Letter) or ‘Abdu'l-Bahá's father-in-law (Nahrí).
- **METHOD:** genuine over-merge — different nisbas + different fates + doc-spread (breaker's bulk in Child-of-Covenant/Taherzadeh, not DB). Same verdict-type as Siyyid Ḥusayn; OPPOSITE of ‘Abdu'l-Karím. Of the 3 re-verified suspect splits: ‘Abdu'l-Karím = wrongful split (→merge), Siyyid Ḥusayn = genuine split, 638227 = genuine split. The agent over-split once (missed a linking clause); deep verification is what tells them apart.
- confidence: SPLIT verified; per-mention partition of the 24 DB rows + the 614534 reconciliation is the next pass.

---

## CROSS-CORPUS PILLAR UNIFICATIONS (per-doc duplicate keepers → one entity each; verified by DB/GPB mention spread)
> The auto-NER made per-document entity rows; the same person therefore has different ids in the DB vs GPB sidecars. Unifying them IS the work. Verified via per-doc mention counts (DB 21308 / GPB 21310 / corpus total).
- **Bahá'u'lláh — MERGE 613759 → keeper 1227553.** 1227553 = DB 220 + GPB 36, **5278 corpus-wide** (the dominant cross-corpus node); 613759 = GPB 341, **0 in DB** → a per-doc duplicate. confidence: verified.
- **the Báb — keeper 1219258 (no separate id).** Already cross-corpus: DB 506 + GPB 253 (total 2946). Just absorb small fragments 1219478 + DROP image-caption 613854. confidence: verified.
- **Quddús — MERGE 613760 → keeper 1219859.** 1219859 = DB 137 (total 190); 613760 = **GPB 23** + 3 DB image-captions (total 60). ⚠ RESOLVES the cohort "merge-vs-drop" conflict: 613760 is the GPB-side Quddús (real), NOT an image artifact — MERGE it (drop only its 3 DB caption-mentions). confidence: verified.
- **Vaḥíd — MERGE 1219861 (DB 66) + 651297 (GPB 18) → one** (keeper either; 651297 total 81 vs 1219861 67 — minor). confidence: verified.
- **Ṭáhirih — MERGE 638207 "Fáṭimih" (DB5/GPB7) + 1227859 "Qurratu'l-‘Ayn" → keeper 1219340** (DB57/GPB19, total 170). ⚠ prune 638207's 2 "Book of Fáṭimih" work-sense mentions before folding (GPB-agent flag). confidence: verified.
- **Siyyid Káẓim-i-Rashtí — MERGE 1055345 (total 31) → keeper 619152** (DB67/GPB7, total 110); the Shaykhí School head. FIREWALL ≠ the new **Siyyid Káẓim-i-Zanjání** (companion of the Báb); ALIAS-REMOVE any "…-i-Zanjání" alias mis-sitting here. confidence: verified.
- **Mullá Ḥusayn — keeper 1219326** (DB196/GPB24, total 323; cross-corpus, one id); strip bad aliases ("Mullá Ḥusayn-i-Zanjání", "the Beloved Siyyid… Ḥusayn"→ Siyyid Ḥusayn-i-Yazdí). confidence: verified.
- NOTE: same cross-corpus dedup must run for every multi-book figure (the general rule), not just these pillars.
