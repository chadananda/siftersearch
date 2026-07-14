# Letters of the Living — Group 1 (Khurásán / early believers)

Manually-verified who's-who consolidation. Scope: the Báb's first 18 disciples (Ḥurúf-i-Ḥayy, Shíráz 1844), EXCLUDING Mullá Ḥusayn / Quddús / Ṭáhirih / amanuensis (already done). `side=Bábí` for all (Báb's dispensation; none lived into / transferred to the Bahá'í dispensation as active believers, except Bajistání who met Bahá'u'lláh but never re-engaged).

Sources: DB graph.db `entity_mentions` (counts STALE — see caveat) + content paragraphs (Dawn-Breakers ch.3-4, Balyuzi, Momen-style chronicles); Bahaipedia / Bahá'í Chronicles / Bahá'í Encyclopedia Project; Nabíl roster. Cross-corpus confirmed.

---

## 1. Mullá ‘Alíy-i-Basṭámí — VERDICT: KEEPER ← [1227818 ⊕ 1219368 ⊕ 1056106]
- **Confidence: HIGH.** Three DB fragments are unambiguously one person; merge into canonical `Mullá ‘Alíy-i-Basṭámí`.
  - `1227818` "Mullá ‘Alíy-i-Basṭámí" (8 mentions) — primary; Dawn-Breakers narrative, "first affliction to befall a disciple," 1844 return.
  - `1219368` "Mullá 'Alíy-i-Basṭámí" (6) — Shoghi Effendi "the first to leave the House of God… to suffer"; roster + transliteration tables.
  - `1056106` "Mulla Aliy-i-Bastami" (4) — un-diacritic variant; Kashfu'l-Ghiṭá' passages; taught Ṭáhirih in Karbilá 1260 AH.
- **Role-arc / fate:** 2nd to believe; sent by the Báb to ‘Iráq; first to carry the Qayyúmu'l-Asmá' to Najaf/Karbilá and proclaim the Cause; first Bábí to suffer persecution. Tried before a joint Sunní–Shí‘í tribunal in Baghdád (Jan 1845) over the Qayyúmu'l-Asmá'; condemned, sent to hard labour in Istanbul; **died ~1846 — the first martyr of the Bábí Dispensation.**
- **FIREWALL:** ‘Alíy-i-**Basṭámí** ≠ Mullá ‘Alí (the renamed Khudá-Bakhsh, #4 below) ≠ any other ‘Alí. Distinct nisba (Basṭám) and the unique "first martyr / Najaf tribunal" arc isolate him cleanly.
- **FLAGS:** Mention count STALE. Recommend merging the 2 variant fragments into 1227818.

## 2. Muḥammad-Ḥasan-i-Bushrú'í (brother of Mullá Ḥusayn) — VERDICT: PARTIAL / NEEDS-CLEAN-ENTITY
- **Confidence: MEDIUM** for identity; **LOW** for a clean graph node.
- **Graph status:** NO dedicated clean entity. He appears only INSIDE conflated bucket `1220547 "Muḥammad-Ḥasan"` (17 mentions) — which mixes him with multiple namesakes (see firewall). Confirmed-correct mentions in 1220547: the Najaf-departure line ("With him were Muḥammad-Ḥasan, his brother…") and the LotL roster block.
- **Role-arc / fate:** 2nd Letter of the Living (per chronicles); younger brother of Mullá Ḥusayn-i-Bushrú'í; accompanied him to Shíráz in the quest for the Qá'im. Fought at Shaykh Ṭabarsí; badly wounded in the battle in which Mullá Ḥusayn was killed; by some accounts briefly led the Bábí forces; **killed at Shaykh Ṭabarsí (1849).**
- **FIREWALL — critical:** bucket `1220547` ALSO contains, and these must NOT be attributed to the LotL brother:
  - Mírzá Muḥammad-Ḥasan, **brother of Bahá'u'lláh** (loyal follower).
  - Mírzá Muḥammad-Ḥasan = the **King of the Martyrs** (Iṣfahán; with brother = Beloved of Martyrs).
  - Shaykh Muḥammad-Ḥasan-i-Sabzivárí (persecuting mujtahid of Yazd).
  - Muḥammad-Ḥasan-i-Qazvíní (surnamed Fatá; Badasht).
  - Muḥammad-Ḥasan the Pilgrim-House caretaker.
  - Also distinct: entity `1220150 "Mírzá Muḥammad-Ḥasan"` (11) is DOMINANTLY the King-of-Martyrs / Bahá'u'lláh's-brother cluster — NOT this LotL figure.
- **FLAGS:** Needs a new clean entity `Muḥammad-Ḥasan-i-Bushrú'í` carved out of 1220547; only the two confirmed mentions above are safely his. Mention counts STALE.

## 3. Muḥammad-Báqir-i-Bushrú'í (nephew of Mullá Ḥusayn) — VERDICT: PARTIAL / NEEDS-CLEAN-ENTITY
- **Confidence: MEDIUM** for identity; **LOW** for a clean graph node.
- **Graph status:** NO dedicated clean entity. Appears inside conflated bucket `872491 "Muḥammad-Báqir"` (5 mentions) — which carries the Najaf-departure line ("…and Muḥammad-Báqir, his nephew") and the LotL roster block. Son of Muḥammad-Ḥasan-i-Bushrú'í (#2), hence Mullá Ḥusayn's nephew.
- **Role-arc / fate:** 3rd Letter of the Living; travelled with father and uncle to Shíráz; fought at Shaykh Ṭabarsí; by several accounts assumed command of the Bábí defenders after Mullá Ḥusayn was killed and Muḥammad-Ḥasan wounded; **killed at Shaykh Ṭabarsí, 2 Feb 1849.** Birth date unknown.
- **FIREWALL — critical:** do NOT merge with either of these high-count namesakes:
  - `638692 "Mírzá Muḥammad-Báqir"` (16) = the Ṭabarsí figure "who had built the Bábíyyih" and repeatedly led mounted sorties from the fort — corpus narrative tracks the **Bábíyyih-builder / sortie commander** (Nabíl's Mírzá Muḥammad-Báqir-i-Qá'iní, the carpenter). The "led the forces at Ṭabarsí" detail is ascribed in some chronicles to the LotL nephew, so the two narratives bleed together, but 638692's dominant identity is the builder, NOT the LotL nephew. Keep separate; flag the overlap.
  - `1220515 "Shaykh Muḥammad-Báqir"` (14) = "the Wolf" of Iṣfahán, the persecuting mujtahid. NOT a believer.
  - `1145907 "Muḥammad-Báqir-i-Qahvih-chi"` (1) = Ottoman-era, unrelated.
  - Also a Ḥájí Siyyid Muḥammad-Báqir (`1056112`, 6) — separate.
- **FLAGS:** Needs a new clean entity `Mírzá Muḥammad-Báqir-i-Bushrú'í` carved from 872491 (roster line + "his nephew" only). Resolve/annotate the 638692 builder-vs-nephew "led the forces at Ṭabarsí" ambiguity — UNRESOLVED at corpus level. Counts STALE.

## 4. Mullá Khudá-Bakhsh-i-Qúchání (later named Mullá ‘Alí) — VERDICT: NEEDS-SOURCE (no graph entity)
- **Confidence: HIGH** on identity/fate from web + Nabíl roster; **but NOT present as a graph entity.**
- **Graph status:** NO entity. Searches for Qúchání / Khudá-Bakhsh return ONLY `1221527 "Shaykh 'Alí-Akbar-i-Qúchání"` — a DIFFERENT later figure (Sírján/persecution context), NOT him. He IS named in the LotL roster paragraphs (inside 872491 / 1220547 content) as "Mullá Ḵhudá-Baḵhsh-i-Qúchání, later named Mullá ‘Alí," but no mention was ever resolved to a dedicated entity.
- **Role-arc / fate:** 5th Letter of the Living; renamed by the Báb **Mullá ‘Alí (Razí)**; accompanied Basṭámí toward ‘Iráq, then returned to Karbilá; became inactive and fell into obscurity; **died a natural death.** His son Mashiyyatu'lláh was later martyred young.
- **FIREWALL:** the renamed "Mullá ‘Alí" must NOT be merged with Mullá ‘Alíy-i-Basṭámí (#1) — same given name post-rename, totally different person (quiet/obscure death vs first-martyr). And ≠ Shaykh 'Alí-Akbar-i-Qúchání (1221527), despite the shared Qúchání nisba.
- **FLAGS:** Create entity from external sources; tag the roster mention(s). NEEDS-SOURCE for any corpus-internal biography beyond the roster line.

## 5. Mullá Ḥasan-i-Bajistání — VERDICT: KEEPER [1227863]
- **Confidence: HIGH.** Single clean DB entity `1227863 "Mullá Ḥasan-i-Bajistání"` (1 mention) — corpus text explicitly: "among the Letters of the Living who succumbed to the tests of God… one such was Mullá Ḥasan-i-Bajistání who attained the presence of Bahá'u'lláh in Baghdád… expressed his doubts."
- **Role-arc / fate:** 6th Letter of the Living; active at first in propagating the Cause, then retired to Karbilá, considering himself unworthy of the station the Báb conferred. Did not play a significant Bábí role. Visited Bahá'u'lláh in Baghdád (1853–1863) and voiced his doubts; never returned as an active believer. Ultimate fate undocumented (died in relative obscurity).
- **FIREWALL:** ≠ Mullá Ḥasan-i-Khurásání / other Mullá Ḥasans; the **Bajistán** nisba + the unique "doubts before Bahá'u'lláh in Baghdád" arc isolate him. No competing high-count namesake in the graph.
- **FLAGS:** Low mention count (1) but unambiguous — keeper as-is. Count STALE.

---

### Cross-cutting notes
- **STALE counts:** all `entity_mentions` counts above are stale per task; treat as relative, not absolute. `entity_mentions` has no `context` column — disambiguation done by joining `content_id` → `content.text`.
- **Two figures lack any graph node carved out:** #2 and #3 live only inside conflated namesake buckets (1220547, 872491); #4 has no node at all (only roster-line text). Recommended follow-up: carve clean Bushrú'í-kin entities and create the Qúchání/Mullá-‘Alí entity, each linked to the LotL roster paragraph.
- **Roster confirmation:** corpus roster block (Dawn-Breakers) independently lists, in order: Mullá Ḥusayn-i-Bushrú'í, Muḥammad-Ḥasan (brother), Muḥammad-Báqir (nephew), Mullá ‘Alíy-i-Basṭámí, Mullá Khudá-Bakhsh-i-Qúchání (later Mullá ‘Alí), Mullá Ḥasan-i-Bajistání, Siyyid Ḥusayn-i-Yazdí… — matches all five targets here.
