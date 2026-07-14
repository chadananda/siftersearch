# Mullá Muḥammad (entity_id 619151)

VERDICT: SPLIT(5-way, all MERGE-OUT to existing namesake entities) — confidence H — NEEDS-VERIFY? Y (para_907 Tabríz examiner unresolved)

Entity 619151 is NOT a person. It is a generic "Mullá Muḥammad" catch-all bucket: bare name, single low-confidence alias ("Mullá Muḥammad" / 0.7), 117 mention_count but only 30 mentions resolve to content. The bare epithet "Mullá Muḥammad" (= "the cleric Muḥammad", the single most common name in the corpus) was clustered together across multiple books although each occurrence belongs to a clearly DISTINCT man, distinguished by nisba, lineage, role-arc, side, and fate, with NO linking clause anywhere connecting them. There are already 40+ disambiguated `Mullá Muḥammad-*` namesake entities in the graph (Mámáqání 1060778, Manshádí 1240389, Furúghí 1220379, Qá'iní 1153963, Barfurúshí 1164218, Baraghání 641802, etc.), confirming 619151 is the un-nisba'd residue that should be drained into them. No new entities should be created — every cluster maps to an existing major-figure or disambiguated keeper.

## Clusters (SPLIT)

### Cluster A — Mullá Muḥammad, mujtahid of Núr (successor to Bahá'u'lláh's deceased relative)
- MERGE-OUT to: NEW or to a Núr-mujtahid keeper if one exists (none found among namesakes — currently no nisba'd entity; lowest-priority candidate for a NEW "Mullá Muḥammad-i-Núrí" keeper, cf. existing 1227576 "Mullá Muḥammad-i-Núrí"? — that entity (mc 1) likely IS this man).
- Likely keeper: **1227576 "Mullá Muḥammad-i-Núrí"** (verify) — else NEW.
- Nisba/role: the living mujtahid of Núr who succeeded the celebrated (deceased) mujtahid; Bahá'u'lláh visits him in year '60; his envoys/disciples convert; he is approached by Bahá'u'lláh's uncle ‘Azíz.
- Side: Muslim cleric, partially sympathetic; not stated to convert. Fate: not given.
- content_ids: 21054010 (para_356), 21054011 (para_358), 21054012 (para_359), 21054017 (para_364), 21054018 (para_365), 21054019 (para_367). All doc 21308 (Dawn-Breakers).
- DISCRIMINATOR: explicitly "his successor, Mullá Muḥammad" and "the mujtahid of Núr, Mullá Muḥammad". Geographic + role lock to Núr. No linking clause to any other cluster.

### Cluster B — Mullá Muḥammad, son of Mullá Taqí Baraghání (cousin & husband of Ṭáhirih, chief enemy of the Bábís in Qazvín)
- MERGE-OUT to: **641802 "Mulla Muhammad Baraghani"** (existing keeper; also reconcile with 1076857 "Muhammad Taqi Baraghani"/1005404 "Haji Mulla Taqi Baraghani" — DO NOT merge into the FATHER Mullá Taqí; this is the SON).
- Nisba/lineage: Baraghání; son of Mullá Taqí Baraghání, nephew/son-in-law arc — married his cousin Ṭáhirih (Fáṭimih Baraghání). High-ranking mujtahid of Qazvín.
- Role-arc: implacable enemy of the Báb/Bábís; persecutor of Ṭáhirih after their estrangement; "haughty and false-hearted... son of Mullá Taqí, who esteemed himself... most accomplished of all the mujtahids".
- Side: anti-Bábí Muslim cleric. Fate: not martyred here (lived on; involved in the persecution following his father's assassination).
- content_ids: doc 430 — 6007076, 6007079 (Taherzadeh RB vol.2). doc 21308 — 21054264 (para_769), 21054267 (para_772), 21054284 (para_797). Possibly 21053971 (para_291, names "Mullá Taqí... mujtahids" — context about Ṭáhirih's father Ḥájí Mullá Ṣáliḥ and uncle Mullá Taqí; the "Mullá Muḥammad" tag here is the husband by family context).
- DISCRIMINATOR: "cousin and husband of Ṭáhirih... son of Mullá Taqí" (doc 430 6007076; Dawn-Breakers para_769). Web-confirmed (Bahaipedia Ṭáhirih; Walbridge). No linking clause to any other cluster.

### Cluster C — Mullá Muḥammad, mujtahid of Manshad → Bahá'í martyr of the 1903 Yazd massacre
- MERGE-OUT to: **1240389 "Mullá Muḥammad-i-Manshádí"** (existing keeper).
- Nisba: Manshádí (of Manshad, Yazd region). Role-arc: "the great mujtahid of Manshad", converted to Bahá'u'lláh, renounced clerical leadership, worked as a building labourer, served humbly.
- Side: convert to the Bahá'í Faith. Fate: MARTYRED in the 1903 Yazd/Manshad massacre; body dragged through villages and burned. Distinct, datable fate (1903 — decades after Cluster A/B events of the 1840s–50s).
- content_ids: doc 430 — 6006047, 6006048 (Taherzadeh RB vol.2 martyr account), plus the Manshad detail chain 7515335, 7515339, 7515342, 7515351, 7515356, 7515359, 7515364, 7515373, 7515386, 7515425 (all the "Mullá Bábá'í informed me... come to Manshad and converted Mullá Muḥammad" narrative — same man).
- DISCRIMINATOR: nisba "of Manshad" + 1903 martyrdom fate (Taherzadeh RB2 6006047/6006048). Web-corroborated (bahai-library "Martyrs of Manshád"). No linking clause to any other cluster.

### Cluster D — Mullá/Mírzá Muḥammad-i-Furúghí (Mullá Ḥusayn's classmate & fellow-defender at Ṭabarsí)
- MERGE-OUT to: **1220379 "Mullá Muḥammad-i-Furúghí"** (existing keeper).
- Identity: the narrator/eyewitness explicitly named in the same sentence — "I ventured to ask Mírzá Muḥammad-i-Furúg̱hí... 'This is sheer fabrication,' affirmed Mullá Muḥammad." The bare "Mullá Muḥammad" tag IS Furúghí (the sentence supplies the full nisba).
- Role-arc: lifelong classmate/friend of Mullá Ḥusayn; eyewitness to Mullá Ḥusayn's transformation at Shaykh Ṭabarsí. Side: Bábí.
- content_ids: doc 21308 — 21054384 (para_946).
- DISCRIMINATOR: full nisba supplied in the same content_id (intra-sentence apposition = name-resolution, not a separate person). No linking clause needed — it is literally the same named speaker.

### Cluster E — "Mullá Muḥammad" objector at the Báb's Tabríz examination (before the Niẓámu'l-‘Ulamá')
- MERGE-OUT to: UNRESOLVED — candidate **1060778 "Mullá Muḥammad-i-Mámáqání"** (the Shaykhí cleric of Tabríz; FIREWALL-protected death-warrant figure) OR a distinct Tabríz examiner. NEEDS-SOURCE.
- Context: the Báb's interrogation at Tabríz (para_904–907); "Mullá Muḥammad raised again the same objection" about Arabic grammar (the word *Is̱htartanna*). One of the assembled Tabríz ulamá.
- content_ids: doc 21308 — 21054356 (para_907).
- DISCRIMINATOR: insufficient. Tabríz setting weakly suggests Mámáqání but the text never names him; could be any examiner-cleric named Muḥammad. FLAG NEEDS-SOURCE; do NOT auto-merge into the firewalled Mámáqání without explicit naming.

### Residual / unresolved index & ToC fragments
- 16491116 (doc 16275, Dawn-Breakers ToC): a navigation/ToC link fragment, not a substantive mention — DROP (data-quality noise).
- 21053971 (para_291): context-by-family for Cluster B (or arguably about Ṭáhirih's father/uncle line) — assign to Cluster B (Baraghání family) or FLAG if ambiguous.

## DESCRIBE (not a person; bucket disposition)
Entity 619151 is a non-entity: an un-nisba'd "Mullá Muḥammad" catch-all that conflates at least five distinct clerics across the Dawn-Breakers and Taherzadeh's Revelation of Bahá'u'lláh vol. 2. The corpus itself already maintains nisba-disambiguated keepers for each (Manshádí, Furúghí, Baraghání, a Núrí mujtahid, and the Tabríz examiner), so the correct action is to drain 619151's mentions into those keepers and retire the bucket — never to "keep as one," since no linking clause ("better known as", "that same", "surnamed") joins any pair of these men; they differ in nisba (Núr vs Qazvín-Baraghání vs Manshad vs Furúghí vs Tabríz), in side (anti-Bábí persecutor vs Bahá'í martyr vs Bábí Ṭabarsí defender), and in fate separated by half a century (1848 Qazvín events vs 1903 Yazd martyrdom). The cautionary ‘Abdu'l-Karím precedent does not apply here precisely because there is NO linking clause to honor — the burden of proof for SPLIT is met by independent corpus passages plus external biography (Bahaipedia/Walbridge for the Baraghání husband; bahai-library "Martyrs of Manshád" for the 1903 martyr).

## EVIDENCE (cid + external_para_id per claim)
- Cluster A Núr mujtahid: 21054010/para_356 ("his successor, Mullá Muḥammad"); 21054011/para_358 ("the mujtahid of Núr, Mullá Muḥammad"); 21054017/para_364; 21054019/para_367.
- Cluster B Baraghání husband: 6007076 (doc430, "chief enemy of the Bábís in Qazvín... cousin and husband of Ṭáhirih"); 21054264/para_769 ("Mullá Muḥammad, son of Mullá Taqí"); 21054267/para_772.
- Cluster C Manshad martyr: 6006047 (doc430, "the great mujtahid of Manshad... conversion to the Faith of Bahá'u'lláh"); 6006048 ("During the Bahá'í massacre of 1903 in the city of Yazd... Mullá Muḥammad was martyred").
- Cluster D Furúghí: 21054384/para_946 ("I ventured to ask Mírzá Muḥammad-i-Furúg̱hí... affirmed Mullá Muḥammad").
- Cluster E Tabríz examiner: 21054356/para_907 (Báb's examination; grammar objection).
- Web: Bahaipedia Ṭáhirih + Walbridge ch.2 (Baraghání husband); bahai-library.com/pdf/r/rabbani_martyrs_manshad.pdf (Manshad 1903 martyrs).

## FLAGS
- NEEDS-SOURCE: 21054356/para_907 (Tabríz examiner) — confirm whether this is Mámáqání (1060778, FIREWALLED) before assigning; do not absorb the firewalled entity.
- FIREWALL: 1060778 Mullá Muḥammad-i-Mámáqání (death-warrant Shaykhí cleric) — keep separate; only para_907 might touch it, unconfirmed.
- DO-NOT-ABSORB majors with own keepers: Ḥujjat (Zanjání), Quddús (Barfurúshí 1164218), Nabíl-i-Akbar (Qá'iní 1153963) — none of 619151's resolved mentions belong to these three, but the bucket's name-space overlaps them; verify no stray mentions get routed there.
- Lineage hazard (Cluster B): merge into the SON (641802 Mulla Muhammad Baraghani), NOT the FATHER Mullá Taqí (1005404 / 1076857 / 1081165). The father is the assassinated mujtahid; the son is Ṭáhirih's husband.
- Data quality: 117 mention_count vs only 30 resolvable mentions — ~87 orphaned/unresolved mentions on this bucket; entity is a clustering artifact. 16491116 is a ToC nav fragment (DROP).
- Verify existence/scope of keeper 1227576 (Mullá Muḥammad-i-Núrí) for Cluster A before merge; create NEW only if absent.
