# Verification: Siyyid Ḥusayn-i-Yazdí "‘Azíz" — the Báb's amanuensis

## VERDICT
**Amanuensis keeper = 1219427** ("Siyyid Ḥusayn") — the only live entity anchored to amanuensis-defining mentions.
**Resolves the 1219427-vs-628260 conflict:** 628260 ("Siyyid Husayn Yazdí") is an **empty orphan** — 0 live `entity_mentions` (its stored `mention_count=8` is STALE and never appears in the live graph join). The sibling agent referenced a name-correct but evidence-empty stub. Keeper is **1219427**, not 628260.

Confidence: **HIGH** on keeper identity and on 628260-is-empty; **MEDIUM** on 1219427's cleanliness (it is the correct anchor but still absorbs non-amanuensis "Siyyid Ḥusayn" mentions — see FLAGS).

### Why 1219427 is the amanuensis anchor (live evidence)
- doc 21310 (God Passes By), para_169: *"the fate of the Báb's distinguished amanuensis, **Siyyid Ḥusayn-i-Yazdí, surnamed ‘Azíz**"* — canonical name+epithet+role+martyrdom, attributed to 1219427.
- doc 21308 (Dawn-Breakers): *"Siyyid Ḥusayn-i-Yazdí, who was the Báb's amanuensis both in Máh-Kú and Chihríq"*; also the Báb summoning "Siyyid Ḥusayn-i-Yazdí and Mullá ‘Abdu’l-Karím" and accompanying the Báb to Tabríz.
- WebSearch (Bahai Chronicles, Bahaipedia, Balyuzi *The Báb*): Siyyid Ḥusayn-i-Yazdí = 7th Letter of the Living, the Báb's secretary (Kátib) in Mákú/Chihríq, titled ‘Azíz, executed Ṭihrán 1852 after the attempt on the Sháh. Fully corroborates.

### STALE-column caveat (method note)
`graph_entities.mention_count` is unreliable (1219427 stored=1 but live=64; 628260 stored=8 but live=0). All counts here are from the live `g.entity_mentions` join, per the recipe.

## MERGES
- **628260 "Siyyid Husayn Yazdí" → 1219427** (empty orphan; name is the amanuensis, no competing evidence). Safe.
- **628048 "Husayn Yazdí" → 1219427** (empty orphan, 0 live mentions; bare name-variant). Safe.
- **1013095 "Siyyid Husayn‑i‑Yazdí" (concept) → 1219427** (empty orphan, 0 live mentions; exact name as concept-typed dup). Safe.
- The epithet entity **1227914 "‘Azíz"** is NOT merged — it is itself a polluted catch-all (‘Azíz Khán-i-Mukrí, Sulṭán ‘Abdu’l-‘Azíz, ‘Azízu’lláh Misbah + a few amanuensis paras). Only its amanuensis-specific paras should be re-pointed to 1219427; the rest must split out. Flagged, not merged wholesale.

## FIREWALLS (distinct people — DO NOT merge)
- **Mírzá Ḥusayn-i-Mutavallíy-i-Qumí (1238660)** + variant **Siyyid Mírzá Ḥusayn-i-Mutavallí (1238371)** — the **Ṭabarsí BETRAYER**. Firewall HARD. (Live mentions sparse but distinct; both currently stub-thin.)
- **Siyyid Ḥusayn-i-Azghandí** — the mujtahid *uncle* in Yazd (Dawn-Breakers: "his maternal uncle, Siyyid Ḥusayn-i-Azghandí, the foremost mujtahid"). NOTE: no dedicated entity exists for the uncle; his mentions are currently mis-pooled inside 1219427's bare-name "Siyyid Ḥusayn" set. Distinct from the *nephew* **Mírzá Aḥmad-i-Azghandí (1219387, live=4; dup 1145286)** which IS correctly separate. Firewall.
- **Turshízí** — **901814** ("Turshízí") and **1220003** ("Mullá Shaykh ‘Alíy-i-Turshízí", live=1). Distinct martyr/mujtahid. Firewall.
- **Ḥusayn Khán (Áṣafu’d-Dawlih, governor of Fárs)** — not surfaced as a colliding entity in this cluster; also distinct **Sardár ‘Azíz Khán** (gov. of Tabríz) and **‘Azíz Khán-i-Mukrí** appear under 1227914. Firewall.
- **Imám Ḥusayn / Mullá Ḥusayn / Sulṭán ‘Abdu’l-‘Azíz (1219414)** — separate, do not merge.
- **Mr ‘Azíz Yazdí (1242257)** + doc-typed **638145** — 20th-century Bahá'í (Balyuzi's source/son). Modern-namesake trap; NOT the amanuensis. Firewall.

## DESCRIBE (for 1219427 keeper)
Siyyid Ḥusayn-i-Yazdí, surnamed ‘Azíz; the 7th Letter of the Living and the Báb's amanuensis/secretary (Kátib), who shared the Báb's imprisonment in the fortresses of Máh-Kú and Chihríq, recorded His revealed verses, was entrusted with the Báb's final messages, and was martyred in Ṭihrán in 1852 amid the persecutions following the attempt on Náṣiri'd-Dín Sháh.
- canonical_name: Siyyid Ḥusayn-i-Yazdí
- aliases: ‘Azíz; Kátib; Siyyid Ḥusayn (bare, context-only)
- era: Bábí dispensation (martyred 1852); side: Bábí
- entity_type: person

## FLAGS
1. **1219427 not fully cleansed.** Despite the prior split, its 64 live mentions still mix: the amanuensis (anchor) + the Azghandí *uncle* mujtahid (Yazd masjid / "maternal uncle" paras in doc 21308) + Sulṭán ‘Abdu’l-‘Azíz edict paras + bare-"Siyyid Ḥusayn" generic. Needs a follow-up split: extract uncle-Azghandí mentions to a NEW "Siyyid Ḥusayn-i-Azghandí" entity; re-point ‘Abdu’l-‘Azíz paras to 1219414.
2. **1227914 "‘Azíz" is a polluted epithet catch-all** (41 live mentions across ‘Azíz Khán-i-Mukrí, Sulṭán ‘Abdu’l-‘Azíz, ‘Azízu’lláh Misbah, amanuensis). Re-point only amanuensis paras to 1219427; split the rest. Do NOT bulk-merge.
3. **Mutavallí betrayer entities (1238660/1238371) are stub-thin** — verify they retain their own betrayal mentions and were not collapsed; keep firewalled.
4. **Empty-orphan family** (628260/628048/1013095) all have stored mention_count > 0 but 0 live mentions — symptomatic of the known stale-count / orphan-mention issue (Task #1/#2). Their names all denote the amanuensis, so merging into 1219427 is safe and reduces namesake noise.
5. READ-ONLY run: no merges executed; this file records the adjudication for a writer pass.
