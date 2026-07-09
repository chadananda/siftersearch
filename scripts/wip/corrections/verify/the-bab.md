# Verify: the Báb — Siyyid ‘Alí-Muḥammad-i-Shírází

## VERDICT
**KEEPER = 1219258** ("the Báb", person) — the Forerunner/Founder of the Bábí Faith.

**MERGE INTO 1219258** (title/spelling fragments, all confirmed = the Báb):
- `1238146` "The Báb" (person, 250 mentions) — capitalization variant
- `1219478` "Báb" (person, 20)
- `613854` "Báb" (person, 79) — **see DROP note below; do NOT merge, DROP**
- `1219665` "Siyyid-i-Báb" (person, 43) — title; mentions are the Báb's Shíráz/declaration milieu
- `636714` "‘Alí-Muḥammad" (person, 11) — His given name; every mention explicitly equates it with the Báb
- `1227550` "The Primal Point" (person, 32) — His title Nuqṭiy-i-Úlá
- `1219347` "Primal Point" (concept, 88) — same title (concept-typed; merge as title)

**DROP (artifact) = 613854** "Báb" (person, 79 mentions). NOT a clean person node — its mentions are a contaminated grab-bag: a passage on "spiritual unity," a "World Order of Bahá'u'lláh / Universal House of Justice" paragraph, a Dawn-Breakers TOC link line, and literal image-artifact lines (`![STEPS LEADING TO THE DECLARATION CHAMBER]...`, `![The Dawn-Breakers]...image_hash_key`). It is a low-quality/image-artifact fragment, not the person. DROP rather than merge so its garbage mentions are not inherited.

**ALIASES TO STRIP from keeper 1219258** (mis-bound generic pronouns / over-broad surfaces that will cause false binds): `He`, `His`, `Him`, `him`, `his`, `Me`, `My`, `me`, `I`, `You`, `Your`, `Self`, `My Self`, `the Person`, `the Author`, `Master`, `his Master`, `the Father`, `Himself`, `He Himself`. Keep distinctive titles (Primal Point, the Point of the Bayán, the Exalted One, Forerunner of Bahá'u'lláh, the Gate, Most Great Remembrance, the Báb's cousin, son of an obscure merchant of Shíráz, etc.).

## CONFIDENCE
**High (0.95)** on keeper, merges, DROP, and firewall. Mention-mass is unambiguous (keeper 3350 vs. nearest fragment 250). Lower confidence (0.8) only on whether 613854's residue should be re-pointed vs. orphaned — recommend orphan/DROP.

## EVIDENCE
- **Mention mass (real counts, graph.db `entity_mentions` — column was stale):** keeper 1219258 = **3350**; 1238146=250; 1219347=88; 613854=79; 1219262=65 (Dispensation, not person); 1219665=43; 1227550=32; 1219478=20; 636714=11.
- **‘Alí-Muḥammad = the Báb (clean merge, NOT namesake):** "The Báb, whose name was ‘Alí-Muḥammad, was born in Shíráz…" (Dawn-Breakers 21308); "the name of the Báb (‘Alí-Muḥammad) is the unity of both forms…" / "His name, ‘Alí-Muḥammad, symbolizes that unity" (doc 8632). Every 636714 mention is explicitly the Báb.
- **Cross-corpus:** doc 21310 = *God Passes By*; within GPB the dominant Báb entity is keeper **1219258 (254 mentions)** — confirms GPB keeper is 1219258. (Note: 21310 is a doc_id, not a graph_entity id.) doc 21308 = *The Dawn-Breakers*.
- **Biography (web-confirmed):** Siyyid ‘Alí-Muḥammad-i-Shírází, b. 20 Oct 1819 Shíráz, declaration 23 May 1844, took title Báb ("Gate"), titles "Primal Point" / "Point of the Bayán", martyred by firing squad Tabríz 9 July 1850. (Bahaipedia; Encyclopaedia Iranica; bahai.org/the-bab/life-the-bab; Wikipedia.)

## FIREWALL (do NOT merge)
- **Mullá Ḥusayn = Bábu'l-Báb (the GATE to the Báb)** — a DIFFERENT person. Entities `1204160` & `1219632` ("Bábu'l-Báb", person), plus place/concept variants `632357`, `983776`, `1015961`, `1227780`. Mentions are his own activities (arrest of Quddús/Mullá Ṣádiq, Ḥusayn Khán). Keep separate from the Báb.
- **Derived/collective concepts, keep separate:** `1219479` Bábís, `1219739` Bábí community, `1219732`/`1220123` Bábí, `1219262` Bábí Dispensation, `1219684` Bábí Faith, `1220112` "the Promised One foretold by the Báb" (= Bahá'u'lláh, NOT the Báb), `1220333` Writings of the Báb, `1220471`/`620676` Shrine of the Báb, `1219667` Martyrdom of the Báb, `620154` Declaration of the Báb, `1220320` Covenant of the Báb. These are works/events/orgs/other-persons, not the person of the Báb.
- **Generic ‘Alí-Muḥammad namesakes:** none found in inspected mentions — all 11 of 636714 were the Báb. If future binds surface another ‘Alí-Muḥammad (common Persian name), firewall by context.

## DESCRIBE
The Báb (Siyyid ‘Alí-Muḥammad-i-Shírází, 1819 Shíráz – 1850 Tabríz). A Siyyid merchant of Shíráz who on 23 May 1844 declared Himself the Báb ("Gate"), Forerunner and Founder of the Bábí Faith and Herald of Bahá'u'lláh. Titled the Primal Point (Nuqṭiy-i-Úlá), the Point of the Bayán, and the Exalted One. Author of the Bayán; martyred by firing squad in Tabríz, 9 July 1850.

## FLAGS
- Descriptions for the Báb fragment nodes are EMPTY in graph_entities — keeper 1219258 should receive the DESCRIBE text above on merge.
- 613854 carries image-artifact and topic-drift mentions — confirm the dedupe/merge tool ORPHANS (not re-points) these so the keeper does not inherit garbage.
- `1219347` is concept-typed but is in fact a person-title (Primal Point); merge handling should reconcile entity_type to `person`.
- `1219262` Bábí Dispensation appeared in the `%Báb%` net but is an event/period, not the person — explicitly excluded.

## SOURCES
- [Bahaipedia — The Báb](https://bahaipedia.org/The_B%C3%A1b)
- [Encyclopaedia Iranica — BĀB, ʿAli Moḥammad Širāzi](https://www.iranicaonline.org/articles/bab-ali-mohammad-sirazi/)
- [bahai.org — The Life of the Báb](https://www.bahai.org/the-bab/life-the-bab)
- [Wikipedia — Báb](https://en.wikipedia.org/wiki/B%C3%A1b)
