# Verify: Ḥájí Sulaymán Khán (the candles martyr of 1852)

## VERDICT
**Keeper = 1219669** (`Ḥájí Sulaymán Khán`, person) ← merge **651846** (`Sulaymán`).
- Merge **651846** → keeper. Confirmed identity: its only mentions (content 21054909, 21054912) ARE the candles martyrdom passage — "stepped forward to lead the concourse... to the place that was to witness the consummation of his martyrdom... Enveloped by the flames, he walked as a conqueror... a blaze of light amidst the gloom." Unambiguously this martyr.
- **DO NOT wholesale-merge 983869** (`Sulaymán Khán`). It is a **polluted/conflated** entity, NOT a clean fragment. Its aliases are `Sulaymán Khán`, `Sulaymán Khán-i-Tanakábuní`, AND `Sulaymán the Magnificent` (the Ottoman sultan). Its 9 mentions split across at least 4 distinct referents:
  - the martyr (21656814 "Sulayman Khan bore these frightful tortures... sang and recited verses"; 21656799 attained Báb's presence at Mecca/Medina; 21055563 the Báb's remains rescue) → these belong to keeper
  - **Sulaymán Khán-i-Afshár** the official (21054510 "in the presence of Sulaymán Ḵhán-i-Afs̱hár"; 21656509 "the prime minister, having summoned Sulayman Khan, the Afshar... carry to Tabriz... take the Bab out of Chihriq") → FIREWALL, different man
  - **Sulaymán Khán-i-Tunukábaní** "Jamálu'd-Dín" (6436492, sent by Bahá'u'lláh to teach in India) → different man
  - noise (21055826 Beirut agency; 21055990 Young Turks; 21304868 a chapter Q&A reference)
  - **Recommendation:** route 983869 to per-mention re-adjudication (split), NOT to a blanket merge into the keeper. Wholesale merge would drag the Afshár + Tunukábaní + Ottoman-sultan pollution into the martyr.

## CONFIDENCE
**High** on keeper=1219669 and the 651846 merge (direct passage match to the candles martyrdom).
**High** on the firewalls (Afshár and Tunukábaní each verified by their own corpus passages + web).
**Medium** on 983869 disposition — it needs a split, not a simple action; flagged below.

## FIREWALL (kept separate — NOT merged)
- **≠ Sulaymán Khán-i-Afshár** — a DIFFERENT Sulaymán Khán: a state official / antagonist in the Báb narrative. Corpus: the prime minister summoned "Sulayman Khan, the Afshar" to carry to Tabríz the order to remove the Báb from Chihríq (21656509); appears "in the presence of Sulaymán Ḵhán-i-Afs̱hár" before the prince (21054510, Ṭabarsí/persecution narrative). Web (Iranica) corroborates the Afshár as a distinct figure. No standalone Afshár entity exists in graph_entities; the Afshár currently lives ONLY as polluting mentions inside 983869 — they must be peeled off, not absorbed into the martyr.
- **≠ Sulaymán Khán-i-Tunukábaní ("Jamálu'd-Dín")** — another different man, sent by Bahá'u'lláh to teach in India (6436492). Also wrongly inside 983869.
- **‘Abdu'l-Vahháb-i-Shírází (keeper 1227760, currently `‘Abdu'l-Vahháb`)** — RELATED, **NOT merged**. The youth martyred alongside Ḥájí Sulaymán Khán in the 1852 Ṭihrán persecution (their breasts lacerated, lighted candles placed in the wounds, walked to execution together). Firewall held: keep as its own entity; link as a co-martyr relation only.

## DESCRIBE (the candles martyrdom)
Ḥájí Sulaymán Khán-i-Tabrízí: a courtier under Muḥammad Sháh and a devoted Bábí. After the Báb's execution (9 July 1850) he organized — through Hájí Alláh-Yár — the rescue and concealment of the Báb's remains, moving them to a silk factory at Mílán (corpus 21055563; web). Following the attempt on Náṣiri'd-Dín Sháh's life in 1852 he was among the martyrs of Ṭihrán: wounds were cut into his flesh and lighted candles set burning in them; he walked to the gallows singing and reciting verses, dancing, "a blaze of light amidst the gloom" (corpus 21054909/21054912, 21656814; GPB; Balyuzi *The Báb* 466). One of the most celebrated of all Bábí martyrdoms.

## FLAGS
- 983869 is a **dirty merge** (martyr + Afshár + Tunukábaní + "Sulaymán the Magnificent"). Needs per-mention SPLIT, not a blanket merge. After splitting, the martyr-mentions (21656814, 21656799, 21055563) go to keeper 1219669; create/keep a separate Afshár entity for 21054510 + 21656509; route the Tunukábaní mention (6436492) to its own entity; drop the noise mentions.
- All entity descriptions are empty in graph_entities — keeper 1219669 should get the DESCRIBE text above.
- Mention counts are STALE (entity_mentions not GC'd on delete) — counts are indicative only.
- ‘Abdu'l-Vahháb keeper 1227760 is stored as bare `‘Abdu'l-Vahháb`; canonical should be `‘Abdu'l-Vahháb-i-Shírází` to disambiguate from other ‘Abdu'l-Vahhábs.
