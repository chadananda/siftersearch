# Verify: GPB "Bahá'u'lláh" fragments → cross-corpus unification

**VERDICT: UNIFY — keeper = 1227553 ← merge [613759, 1219519] — confidence: VERY HIGH (0.99)**

All three entities are the SAME person: **Bahá'u'lláh** (Mírzá Ḥusayn-'Alí-i-Núrí, 1817–1892), Founder/Prophet of the Bahá'í Faith. No fragment is a distinct referent. No image-caption artifact. The three buckets are auto-NER fragmentation of one identity across (and within) corpora — split chiefly by apostrophe glyph (straight `'` vs curly `'`/`’`) and by per-document NER runs.

Keeper chosen = **1227553** because it is the dominant cross-corpus identity: ~5,800+ true mentions spanning Dawn-Breakers (doc 21308=220), the Revelation-of-Bahá'u'lláh trilogy (docs 429/430/431 = 875/1019/387), Logos & Civilization (doc 7165=755), The Child of the Covenant (doc 426=692), Messages (doc 26=204), and GPB (doc 21310=36). It already carries the richest, most authoritative alias set (Blessed Beauty, Ancient Beauty, Jamál-i-Mubárak, Him Whom God shall make manifest, etc.). The two GPB-centric fragments fold into it.

---

## Note on the task's mention numbers vs. DB

`graph_entities.mention_count` is STALE/unreliable here (shows 613759=20631, 1219519=1, 1227553=1). The task's figures (341 / 174 / 36) are the **per-document counts inside GPB (doc 21310)** confirmed via `entity_mentions ⋈ content`:
- 613759 in doc 21310 = **341** ✓
- 1219519 in doc 21310 = **174** ✓
- 1227553 in doc 21310 = **36** ✓

So the "three GPB Bahá'u'lláh entities" = three entity IDs that each fire inside GPB; only one (1227553) is primarily a non-GPB entity that also leaks 36 GPB mentions.

---

## Per-ID referent confirmation

### 613759 — "Bahá'u'lláh" (straight-apostrophe glyph) — KEEPER of GPB, MERGE
- Total true mentions ~1,300+; top docs: 26 (Messages, 375), 21310 (GPB, 341), 11445 (Writings of B., 72), 4346 (Ocean of His Word, 56).
- Sample (GPB / doc 21310): *"…the centennial anniversary of the founding of the Faith of Bahá'u'lláh."* and *"…communicating the joyful tidings of his interview with Bahá'u'lláh…"* — referent = the Founder. CONFIRMED.
- Distinctive linking aliases: **"Mirza Husayn 'Aliy-i-Nuri"** (His birth name), **"the Pen of Bahá'u'lláh"**, "this wronged One", "the Author". All point to Bahá'u'lláh.

### 1219519 — "Bahá'u'lláh" (second GPB bucket, 174) — MERGE
- Why a second large GPB bucket: it captured the **title/epithet-heavy** mentions and the curly-apostrophe variants that the first run missed — NOT a different person.
- Aliases are a slam-dunk identity match: **"The Blessed Beauty"**, **"His Holiness the Abhá Beauty"**, "the Blessed Perfection Bahá'u'lláh", "the Manifestation Bahá'u'lláh", "the Founder of the Bahá'í Faith", "the Author of the Bahá'í Revelation", "the One Whose advent the Báb had prophesied", "Him (Bahá'u'lláh)", "Mirza Husayn 'Aliy-i-Nuri" (shared with 613759 — hard link), "the Prophet Bahá'u'lláh".
- Samples (docs 11445/21310): *"The mightiest proof of the greatness of Bahá'u'lláh… lies in His Writings which streamed from His Pen…"* CONFIRMED.

### 1227553 — "Bahá'u'lláh" (curly-apostrophe glyph) — **KEEPER**
- Largest, cross-corpus. Dawn-Breakers (doc 21308) keeper as predicted by the task. Top docs: 430 (1019), 429 (875), 7165 (755), 426 (692), 431 (387), 21308 (220), 26 (204).
- Samples (Dawn-Breakers-adjacent doc 431): *"Bahá'u'lláh entered the Most Great Prison"*, *"Bahá'u'lláh's cherished son whose death in the barracks"*, *"…where Bahá'u'lláh was kept in…"* — biographical, referent = the Founder. CONFIRMED.
- Richest alias set incl. **"Jamál-i-Mubarak"**, **"Ancient Beauty"/"the Ancient Beauty"**, **"the Blessed Beauty"**, "Him Whom God shall make manifest", "the Supreme Manifestation of God", "Day-Star of the World", "Countenance of Glory", "our revered and beloved Bahá'u'lláh".

**Cross-link proof (same person):** all three share the literal surface "Bahá'u'lláh"; 613759 ↔ 1219519 share the birth-name alias **"Mirza Husayn 'Aliy-i-Nuri"**; 1219519 ↔ 1227553 share **"the Blessed Beauty"** and the title-stack "the Blessed Perfection Bahá'u'lláh". Distinctive shared aliases across all buckets = one identity.

---

## Consolidated alias set (deduped, keep on keeper 1227553)

Core name / variants: Bahá'u'lláh; Bahá'u'lláh's; Bahá'u'lláh Himself; the name Bahá'u'lláh.
Birth name: **Mírzá Ḥusayn-'Alí-i-Núrí** (DB surfaces: "Mirza Husayn 'Aliy-i-Nuri").
Titles/epithets (Bahá'í): the Blessed Beauty; the Ancient Beauty; the Abhá Beauty; the Blessed Perfection; Jamál-i-Mubárak; the Day-Star of the World; the Countenance of Glory; the Supreme Manifestation of God; the Ancient Root; Him Whom God shall make manifest (the Báb's prophesied One); the Promised One; the One Whose advent the Báb had prophesied.
Role descriptors: the Founder of the Bahá'í Faith; the Prophet of the Bahá'í Religion; the Author of the Bahá'í Revelation; the Manifestation; the Author of this Revelation.
Self-reference (kept low-confidence): this Wronged One; the Author; this Prisoner; the Captive.

---

## Aliases to STRIP (mis-bound — do NOT carry to keeper)

- **'Alí-Akbar** (1227553, conf 0.7) — a separate person (a believer/attendant), captured by co-reference error. STRIP.
- **the blessed body of the Master** (1219519, 0.95) — "the Master" = 'Abdu'l-Bahá, not Bahá'u'lláh. Likely a co-reference slip. STRIP / reassign to 'Abdu'l-Bahá.
- **his Brother** (1227553, 0.7) — relational, ambiguous; not an identity alias. STRIP.
- **the leader of the group / their Leader / the Occupant / Guest / the Accused / the Trust / great Bahá'í Big** — generic/OCR-garbage relational surfaces; low value, recommend prune (not identity-bearing).
- OCR-garble surfaces (`~aha'lu'll&`, `~aha"u'llk`, `Baha'u'll&`, `Bahá'u'11ah`, `Bahá'u'11ah`) — correctly bound to Bahá'u'lláh but cosmetic; keep only if retrieval needs OCR robustness, else prune.

(Note: "Faith of Bahá'u'lláh", "Cause of Bahá'u'lláh", "World Order of Bahá'u'lláh", "Shrine of Bahá'u'lláh", "Tablets of Bahá'u'lláh", "Jamál Effendi", "Jamál Páshá" are SEPARATE entities and were correctly NOT in these three buckets — no action.)

---

## DESCRIBE (beat-general-knowledge)

Bahá'u'lláh (1817–1892), born Mírzá Ḥusayn-'Alí-i-Núrí in Tehran to a noble family of Núr, Mázindarán, is the Founder and Prophet-Manmanifestation of the Bahá'í Faith. An early follower of the Báb (a Bábí), He declared in the Garden of Riḍván, Baghdád (April–May 1863), that He was "Him Whom God shall make manifest," the Promised One foretold by the Báb. He endured four successive banishments by the Ottoman and Persian authorities — Baghdád, Constantinople, Adrianople (Edirne), and finally the prison-city of 'Akká — where He was the "Most Great Prison"'s most famous captive and where He passed in 1892 (Shrine at Bahjí). His vast corpus (revealed over ~40 years) includes the Kitáb-i-Aqdas, the Kitáb-i-Íqán, the Hidden Words, the Seven Valleys, and Gleanings. Known to Bahá'ís by epithets such as the Blessed Beauty (Jamál-i-Mubárak), the Ancient Beauty, and the Blessed Perfection, He is the central figure of the Heroic Age chronicled in Nabíl's *The Dawn-Breakers* and Shoghi Effendi's *God Passes By*. His eldest son 'Abdu'l-Bahá was appointed Centre of His Covenant and authorized interpreter of His Writings.

---

## FLAGS

1. `graph_entities.mention_count` is desynced from `entity_mentions` (1219519/1227553 show "1" but have hundreds/thousands of real mentions). General data-quality flag — relates to open Task #2 "removal-on-delete for entity_mentions". Recount recommended after merge.
2. After merge into 1227553, re-point all `entity_mentions.entity_id` and `entity_aliases.entity_id` from 613759 and 1219519 → 1227553, then recompute mention_count.
3. Strip the mis-bound aliases listed above BEFORE merge to avoid polluting the keeper.
4. The straight-vs-curly apostrophe glyph split is the structural root cause of fragmentation — likely recurs for other high-frequency entities (the Báb, 'Abdu'l-Bahá). Worth a normalization pass on alias surfaces.
