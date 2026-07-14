# Shaykhí Rivals — Karím Khán-i-Kirmání & Mírzá Muḥíṭ-i-Kirmání

Two Kirmání Shaykhís who came AFTER the Shaykhí founders and both rejected/turned away from the Báb.
Manually verified for the Bahá'í who's-who dictionary. READ-ONLY DB pass (no writes performed).

---

## VERDICT

### Figure A — Ḥájí Mírzá Karím Khán-i-Kirmání  (keeper = 1219857)
The ambitious Shaykhí sect-leader claimant who openly rejected and wrote against the Báb;
condemned by Shoghi Effendi. Full name Ḥájí Mírzá Muḥammad Karím Khán Kirmání (b. ~1809/10,
d. ~1870/71). Studied under Siyyid Káẓim at Karbalá; after Siyyid Káẓim's death seized leadership
of one Shaykhí branch; >270 works, several attacking the Báb's Qá'im claim.

**Merged INTO keeper 1219857 (`Ḥájí Mírzá Karím Khán`):**
- `1219857` Ḥájí Mírzá Karím Khán — 25 mentions (keeper; Dawn-Breakers / God Passes By Shaykhí material)
- `641418`  Karim Khan — 6 mentions — ASCII variant; contexts: "chief of the Shaykhi sect after the
  death of Kazim", contrasted with Bahá'u'lláh's knowledge, debate over the Báb's Qá'im claim. SAME MAN.
- `1219354` Ḥájí Muḥammad Karím Khán — 1 mention — his FULL name (web-confirmed "Muḥammad-Karim Khan").
  Alias "Haji Muhammad-Karim Khan". SAME MAN.

Post-merge keeper aliases should be: Ḥájí Mírzá Karím Khán, Karim Khan, Ḥájí Muḥammad Karím Khán,
Haji Muhammad-Karim Khan. (~32 mentions consolidated.)

### Figure B — Mírzá Muḥíṭ-i-Kirmání  (keeper = 1060781)
A prominent Shaykhí (poet, "S̱há‘ir") who met the Báb at the Kaaba on the last day of the Mecca
pilgrimage, was openly challenged by Him, expressed loyalty to Siyyid Káẓim's wishes, yet turned
away and never accepted the Cause. The Báb's reply to his questions = the Ṣaḥífiy-i-Baynu'l-Ḥaramayn.

**No genuine fragments to merge** — keeper stands alone, BUT MUST BE PRUNED.

**PRONOUN-ALIAS POLLUTION (CRITICAL — strip these aliases):**
`He`, `I`, `him`, `his`, `me`, `myself` on entity_id 1060781.
These bare pronouns swept ~363 of the 401 total mentions into the wrong century:
- Polluted docs: The Revelation of Bahá'u'lláh vols 1–3 (146), The Circle of Faith, Remembering
  Bernard Leach, Lua Getsinger, Martha Root, Kahlil Gibran in New York, 1995 Four Year Plan, A.Q.
  Faizí talks, Stanwood Cobb, etc. — all 20th-c. material with NO connection to the Báb-era Shaykhí.
- Legitimate footprint (~38 mentions, KEEP): The Dawn-Breakers (12), God Passes By (5), Dawn-Breakers
  study guide / French foot-notes (5), Gate of the Heart (2), Khadíjih Bagum, Pilgrimage to the Shrine
  of the Báb, etc.

**Required cleanup:** delete the 6 pronoun aliases (He/I/him/his/me/myself); keep only the proper-name
aliases (Muḥíṭ, Mírzá Muḥíṭ, Mírzá Muḥíṭ-i-Kirmání, Mírzá Muḥíṭ-i-S̱há‘ir-i-Kirmání). Then prune the
~363 mentions that came from the pronoun sweep (everything outside Báb/Shaykhí-era docs).

---

## CONFIDENCE
**High** for both. Corpus (Dawn-Breakers, God Passes By, Revelation of Bahá'u'lláh) + web (Hurqalya
UC-Merced Shaykhí studies, Wikipedia "Karim Khan Kermani", bahai-library Dawn-Breakers ch. VII) agree:
two distinct men, distinct roles. The pronoun pollution on 1060781 is unambiguous (bare He/I/him in the
alias table; mention distribution dominated by unrelated 20th-c. biographies).

## FIREWALL
- **Karím Khán-i-Kirmání (1219857) ≠ Muḥíṭ-i-Kirmání (1060781)** — both Kirmání Shaykhís, DIFFERENT men.
  Confirmed by a Dawn-Breakers passage where they appear as separate figures, and by distinct biographies
  (Karím Khán = sect-leader claimant & author of anti-Báb polemics; Muḥíṭ = the poet who met the Báb at
  the Kaaba and turned away).
- **Both ≠ the Shaykhí FOUNDERS:** Shaykh Aḥmad (1056602) and Siyyid Káẓim (619152). These two rivals
  were Siyyid Káẓim's *students* and emerged as claimants/dissenters AFTER his death — they are the next
  generation, not the founders.
- **≠ other Kirmánís** kept apart: Haji Siyyid Javad-i-Kirmani (1227581 — a Bábí/Bahá'í, different man),
  Salisa Kirmání (1228084), bare "Kirmání" (619958). None merged.

## DESCRIBE (suggested keeper descriptions)
- **1219857:** "Ḥájí Mírzá Muḥammad Karím Khán-i-Kirmání (c.1809–1871). Shaykhí leader and claimant who,
  after Siyyid Káẓim's death, headed a Shaykhí branch and became a foremost opponent of the Báb, writing
  polemics against His claim to be the Qá'im. Condemned by Shoghi Effendi for his learning, pride, and
  hostility to the Cause."
- **1060781:** "Mírzá Muḥíṭ-i-Kirmání (Muḥíṭ the poet). A leading Shaykhí exponent who met the Báb at the
  Kaaba on the final day of the Mecca pilgrimage and was openly challenged by Him; though loyal to Siyyid
  Káẓim's memory he turned away and never accepted the Cause. The Báb's written reply to his questions
  became the Ṣaḥífiy-i-Baynu'l-Ḥaramayn."

## FLAGS
- entity_mentions has NO surface/context column; surfaces live only in graph.db entity_aliases. Pollution
  was quantified by joining mentions → content → docs and grouping by title.
- Both keeper descriptions were EMPTY in graph_entities before this pass — populate on write.
- After stripping pronoun aliases on 1060781, re-run mention pruning; do not trust the stale 401 count.
- Karím Khán's mentions also begin with "I have heard..." narrative quotes (Dawn-Breakers) — those are
  legitimate (Nabíl's first-person narration), not pronoun pollution; do not strip by content_id blindly.
