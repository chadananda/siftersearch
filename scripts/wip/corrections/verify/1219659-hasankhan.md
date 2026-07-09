# Mírzá Ḥasan Khán (entity_id 1219659)
VERDICT: SPLIT(4-way) + 3 misattributions to reassign — confidence H — NEEDS-VERIFY? N (clusters firm; only keeper-id assignment for new entities is mechanical)

## Summary of the problem
Entity 1219659 is a **garbage-magnet/over-merge**. Its stored `mention_count=1` is stale; it actually carries **16 entity_mentions** spanning at least four historically distinct men plus three outright misattributions. Its aliases ("Mírzá Ḥasan", "Mírzá Ḥasan-i-Vazír", "Mírzá Ḥasan Khán") are generic enough that the linker swept every "Mírzá Ḥasan*" surface into one node. The sibling namesake entities (615570, 638462, 921691[mistyped as place], 1055714[mistyped as place], 615826, 618711, 1058938 …) all have **0 real entity_mentions** — orphaned stubs. NO LINKING CLAUSE ties any of the four clusters below to one another; each is independently sourced. SPLIT's burden of proof is met.

## Clusters (SPLIT)

### Cluster A — Mírzá Ḥasan Khán, the Vazír-Niẓám (Qájár official) — FIREWALL
- keeper: NEW (or reuse a clean stub, e.g. 638462) — canonical: **Mírzá Ḥasan Khán, the Vazír-Niẓám**
- relation/lineage: **brother of the Amír-Niẓám / Grand Vazír Mírzá Taqí Khán** (Amír Kabír). Qájár state official — NOT a Bábí.
- role-arc: Bearer of the farmán to Prince Ḥamzih Mírzá; when the Prince refused, the Amír-Niẓám commissioned this brother to carry out the **execution of the Báb** at Tabríz (July 1850); secured the death-warrant from the mujtahids; directed the farrásh-báshí.
- dates: fl. 1850; died within ~2 years of the Báb's martyrdom (per web sources). side: Qájár/anti-Bábí. fate: implicated in regicide-class crime.
- content_ids: 21054695 (para_1555), 21054698 (para_1560) [Dawn-Breakers]; 21055557 (para_122) [God Passes By]; 5098297 (doc 426 bio); 7521118 (doc 430, "Mírzá Ḥasan" fragment, contextually this man).
- DISCRIMINATOR: explicit title "Vazír-Niẓám and brother of the Grand Vazír / the Amír-Niẓám"; two corpus books + Wikipedia (Hasan-Ali Khan Amir Nezam; Báb's trial in Tabriz). NO linking clause to any Bábí Ḥasan. **This is the FIREWALL the task warned about — keep walled off from every Bábí namesake.**

### Cluster B — Mírzá Ḥasan, half-brother of Bahá'u'lláh (Núr / Tákur)
- keeper: NEW — canonical: **Mírzá Ḥasan-i-Núrí (half-brother of Bahá'u'lláh)**, son of Mírzá Buzurg.
- relation: half-brother of Bahá'u'lláh; brother-in-law of **Mírzá Abú-Ṭálib Khán** (Mírzá Áqá Khán-i-Núrí's nephew, the Tákur raid commander, who spared women sheltering in Mírzá Ḥasan's house "for his sister's sake").
- role-arc: during the 1852 Tákur (Núr) reprisal he appealed to / censured Abú-Ṭálib Khán, sheltered the village women, denounced the Sháh.
- dates: fl. 1852. side: family of Bahá'u'lláh (sympathetic, non-combatant). fate: home became a refuge during the raid.
- content_ids: 21054945 (para_1896), 21054946 (para_1897), 21054949 (para_1900), 21054950 (para_1901 ×2 roles) [Dawn-Breakers]; 21055834 (para_460) [God Passes By].
- DISCRIMINATOR: text explicitly "brother-in-law of Mírzá Ḥasan, who was Bahá'u'lláh's half-brother"; Bahaipedia "Family of Bahá'u'lláh" / Mírzá Buzurg confirm a half-brother Mírzá Ḥasan. Distinct generation, lineage, geography (Núr) from Cluster A.

### Cluster C — Mírzá Ḥasan-i-Vazír (Bábí believer, Tihrán)
- keeper: NEW — canonical: **Mírzá Ḥasan-i-Vazír**
- relation: **a believer; son-in-law of Ḥájí Mírzá Siyyid ‘Alíy-i-Tafrís̱hí, the Majdu'l-Ashráf.**
- role-arc: his Tihrán house received the **concealed remains of the Báb** after the Masjid-i-Máshá'u'lláh hiding-place was discovered.
- dates: fl. later 19th c. (transfer-of-remains episode). side: Bahá'í. fate: trusted custodian of the Báb's remains.
- content_ids: 21055993 (para_659) [God Passes By].
- DISCRIMINATOR: full descriptor "a believer and son-in-law of … the Majdu'l-Ashráf" — religion, role, in-law lineage all differ from A and B. The alias "Mírzá Ḥasan-i-Vazír" on 1219659 belongs to THIS man and must travel with him. NO linking clause to the Qájár Vazír-Niẓám (coincidental "Vazír" element only — one is a title-of-office, one an in-law descriptor).

### Cluster D — Mírzá Ḥasan-i-Núrí, the Platonist (Iṣfahán disputation)
- keeper: NEW — canonical: **Mírzá Ḥasan-i-Núrí (the Platonist / ḥakím)**
- relation/role: "a noted Platonist" who, at the Mu‘tamid's gathering, asked the Báb to expound the ‘Arshíyyih of Mullá Ṣadrá; could not grasp the answers; conceded his own inferiority.
- dates: fl. 1846–47 (Iṣfahán). side: learned questioner (not stated Bábí). fate: humbled in the disputation.
- content_ids: 21054176 (para_602) [Dawn-Breakers].
- DISCRIMINATOR: a philosopher in Iṣfahán; role (Platonist disputant) and setting differ from A/B/C. CAUTION: shares the "Núrí" nisba label with Cluster B but is a different individual (philosopher vs. Bahá'u'lláh's half-brother) — keep separate; flag M-confidence link only if a future source equates them (none does).

## Misattributions to STRIP from 1219659 (reassign or detach)
- **21054633 / para_1469 (Dawn-Breakers):** "Ḥasan" = a servant/companion of Vaḥíd lost en route. Not "Ḥasan Khán." DETACH.
- **21055601 / para_181 (God Passes By):** subject is **Ḥusayn Khán, governor of Shíráz** ("wine-bibber"). Name-collision (Ḥusayn≠Ḥasan). DETACH / reassign to the Ḥusayn-Khán-i-Ájúdán-Báshí entity.
- **21656497 / h1428 (doc 40108):** Nayríz passage about Áqá Siyyid Abú-Tálib / Mírzá Zaynu'l-‘Ábidín Khán; "appositive" hook is spurious. DETACH.

## DESCRIBE (per keeper)
- A: The Qájár Vazír-Niẓám, brother of Grand Vazír Mírzá Taqí Khán (Amír Kabír); on his brother's order he superintended the Báb's 1850 execution at Tabríz after Prince Ḥamzih Mírzá refused. [Qájár; anti-Bábí]
- B: A half-brother of Bahá'u'lláh from Núr; during the 1852 Tákur reprisal he sheltered the village women and rebuked the commander Mírzá Abú-Tálib Khán (his brother-in-law). [Bahá'í-family]
- C: A Bábí believer of Tihrán, son-in-law of the Majdu'l-Ashráf (Ḥájí Mírzá Siyyid ‘Alíy-i-Tafrís̱hí), whose house safeguarded the concealed remains of the Báb. [Bábí/Bahá'í]
- D: A noted Platonist who challenged the Báb in Iṣfahán on Mullá Ṣadrá's ‘Arshíyyih and conceded his own incapacity before the Báb's replies. [philosopher/ḥakím]

## EVIDENCE
- A: cid 21054695 (para_1555 "the Vazír-Niẓám and brother of the Grand Vazír"); cid 21054698 (para_1560); cid 21055557 (para_122 "the Amír-Niẓám commissioned his own brother, Mírzá Ḥasan Ḵhán"); cid 5098297 (doc 426); cid 7521118 (doc 430).
- B: cid 21054945 (para_1896 "brother-in-law of Mírzá Ḥasan, who was Bahá'u'lláh's half-brother"); 21054946; 21054949; 21054950; cid 21055834 (para_460).
- C: cid 21055993 (para_659 "house of Mírzá Ḥasan-i-Vazír, a believer and son-in-law of Ḥájí Mírzá Siyyid ‘Alíy-i-Tafrís̱hí, the Majdu'l-Ashráf").
- D: cid 21054176 (para_602 "Mírzá Ḥasan, a noted Platonist … ‘Arshíyyih of Mullá Ṣadrá").
- Misattrib: cid 21054633 (para_1469); cid 21055601 (para_181, Ḥusayn Khán); cid 21656497 (h1428).

## FLAGS
- **FIREWALL (critical):** Cluster A (Vazír-Niẓám, the Amír-Niẓám's brother — a Qájár official) must NEVER be merged with Clusters B/C/D (Bábí/Bahá'í figures) nor with any other Bábí "Mírzá Ḥasan." The shared "Vazír" string between A (Vazír-Niẓám, office) and C (Mírzá Ḥasan-i-Vazír, in-law descriptor) is coincidental — do not let it re-merge them.
- **Alias custody:** move alias "Mírzá Ḥasan-i-Vazír" → Cluster C; "Mírzá Ḥasan Khán" → Cluster A; generic "Mírzá Ḥasan" should NOT remain a high-confidence alias on any single node (it is the collision vector).
- **Data-quality:** stored `mention_count=1` on 1219659 is wrong (16 real). Namesake entities 921691 and 1055714 are mistyped `entity_type='place'` though they are persons; 615570/638462/615826/618711/1058938 are 0-mention orphan stubs — candidates for reuse as keepers or cleanup.
- **B vs D namesake caution:** both can be labelled "Mírzá Ḥasan-i-Núrí." Kept separate (different role/era/identity); no source equates them. Re-merge only on positive evidence.
- After re-assignment, recompute mention_count for all touched entities (ties to pending task: "Add removal-on-delete for entity_mentions" / snapshot miscount).
