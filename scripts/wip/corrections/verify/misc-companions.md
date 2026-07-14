# Verify: Misc Early Companions Consolidation

Source DBs: `data/sifter.db` (content), `data/graph.db` (entity_mentions). Read-only.
Mention counts below are live `COUNT(*)` over `entity_mentions` (the stored count column is STALE — not used).
Corpus basis: God Passes By (Tabríz-martyrdom ch.) + Dawn-Breakers + Nabíl; web cross-check (Balyuzi-equivalent martyrdom accounts).

---

## 1. Mullá Ṣádiq-i-Khurásání "Muqaddas" / Ismu'lláhu'l-Aṣdaq

**VERDICT:** KEEPER **1219371** (Mullá Ṣádiq-i-Khurásání) ← merge **628384** (Muqaddas).
**Confidence:** HIGH.

Mentions (live): 1219371 = 44; 628384 (Muqaddas) = 3. Consolidated ≈ 47.

Evidence of identity (single person, three appellations):
- c.7502963: "Mullá Muḥammad-Sadiq-i-Khurasání, **known as Muqaddas**."
- c.7529301: "Mullá Sadiq-Khurasání, **formerly known as Muqaddas**."
- c.21054064: "Ismu'lláhu'l-Aṣdaq, **Mullá Ṣádiq-i-Ḵhurásání**, to whom [Quddús] entrusted the copy of the Ḵhaṣá'il-i-Sab'ih…"
- c.21655606: "the **Muqaddas**" disputing with Karím Khán (Shaykhí chief) — same controversialist figure.

**ROLE / FATE:** Early Letter-of-the-Living-era believer; received the Khaṣá'il-i-Sab'ih from Quddús and proclaimed the amended adhán from the pulpit at Shíráz; **flogged at Shíráz alongside Quddús** for that proclamation (the first to suffer persecution on Persian soil). Long-lived; later titled **Ismu'lláhu'l-Aṣdaq** ("Name of God, the Most Truthful") by Bahá'u'lláh; became an Apostle of Bahá'u'lláh.
**side:** Bábí → Bahá'í (final allegiance Bahá'í).

**FLAGS:**
- 628384 has empty `description` (stale col) and entity_type=person — clean merge into keeper.
- After merge, repoint 628384's 3 mentions (c.21655606 other, c.7502963 appositive, c.7529301 object) to 1219371.

**FIREWALL (do NOT merge):**
- **Ṣádiq-i-Tabrízí (1219731, 6 mentions)** — DIFFERENT person. A Ṭihrán confectioner's-shop assistant who, with an accomplice, attempted to assassinate the Sháh on 15 Aug 1852 (c.21055572). NOT the Khurásání mullá.
- **Mírzá Ṣádiq (1221515, 2 mentions)** — DIFFERENT; appears in Taft/Manshád persecution contexts (c.21056035). Keep separate.
- **Siyyid Ṣádiq-i-Ṭabáṭabá'í (1220514, 1)** — DIFFERENT (siyyid lineage, Ṭabáṭabá'í nisba). Keep separate.

---

## 2. Anís = Mírzá Muḥammad-'Alíy-i-Zunúzí (martyred with the Báb)

**VERDICT:** KEEPER **1219654** (Anís) ← merge **1219652** (Mírzá Muḥammad-'Alíy-i-Zunúzí).
NOTE: 1219654 is currently mistyped **entity_type=`work`** — must be reset to **person** as part of consolidation. (1219652 is correctly typed person but has only 1 mention; merge the canonical-name/aliases into 1219654 and fix the type, OR keep 1219652 as keeper and fold Anís in — either direction is defensible; recommend keeping 1219654 as the higher-mention node and correcting its type.)
**Confidence:** HIGH (explicit textual apposition).

Mentions (live): 1219654 (Anís) = 8; 1219652 (Mírzá Muḥammad-'Alíy-i-Zunúzí) = 1. Consolidated = 9.

Evidence of identity:
- c.21055559 (the **execution volley** paragraph, shared by BOTH 1219654 + 1219652, and also by Sám Khán 1013108): "…one of his disciples, the youthful and devout **Mírzá Muḥammad-'Alíy-i-Zunúzí, surnamed Anís**, who had previously flung himself at the feet of his Master… were separately suspended."
- c.21054336: "**Muḥammad-'Alíy-i-Zunúzí, surnamed Anís**… fired with the desire to hasten to Chihríq… Siyyid 'Alíy-i-Zunúzí, his stepfather, a notable of Tabríz, … confined him."
- c.21304761: "Story of Anís" (Dawn-Breakers ch. 17, pp.303–308).

**ROLE / FATE:** The youthful disciple who begged never to be sent from the Báb and was **suspended on the same spike and martyred in the SAME volley as the Báb at Tabríz, 9 July 1850**. Stepson of Siyyid 'Alíy-i-Zunúzí.
**side:** Bábí (died in the Báb's dispensation, before Bahá'u'lláh's declaration).

**FIREWALL (CRITICAL — do NOT merge):**
- **Anís (Mírzá Muḥammad-'Alíy-i-Zunúzí, 1219654/1219652) ≠ Shaykh Ḥasan-i-Zunúzí (1219469, 28 mentions).** BOTH carry the Zunúzí nisba; they are DIFFERENT people. Shaykh Ḥasan-i-Zunúzí is the long-lived **informant/narrator** (one of Nabíl's chief sources for the Chihríq/Tabríz period) who survived — NOT the youth martyred with the Báb. Keep entirely separate; never collapse on the shared nisba.
- **Tree of Anísá (1220892, concept)** and **Sadratu'l-Muntahá / "Anísá"-type symbolic refs** — NOT this person. Keep as concept.

**FLAGS:**
- entity_type correction required (work → person) on the keeper.
- Confirm the 8 "Anís" mentions are all the martyr and none are the symbolic "Tree of Anísá" before repointing.

---

## 3. Sám Khán (Armenian Christian colonel)

**VERDICT:** KEEPER **1013108** (Sám Khán). No person-merge needed.
**Confidence:** HIGH.

Mentions (live): 1013108 = 21.

Evidence / role:
- c.21055559: "**Sám Ḵhán** accordingly set out to discharge his duty… [first volley]."
- c.21055561: "**Sám Ḵhán**, … remembering the reassuring words addressed to him by the Báb, ordered his men to leave the barracks immediately, and swore… never again… to repeat that act."
- c.21054727: "the unaccountable **failure of Sám Ḵhán and his men** to destroy the life of the Báb."
- Web cross-check: Sám Khán = **Christian colonel commanding an Armenian regiment**; first 750-man volley failed to kill the Báb; he withdrew his regiment and swore off the deed; Áqá Ján-i-Khamsih's regiment carried out the second, fatal volley.

**ROLE / FATE:** Commander of the Armenian (Christian) firing regiment whose first volley miraculously failed to kill the Báb (severed only the ropes); the Báb gave him reassurance; Sám Khán, awe-struck, refused to continue and marched his regiment away. **Sympathetic non-believer** — instrument of, then conscientious objector to, the martyrdom.
**side:** **other** (Christian/Armenian; NOT Bábí) — sympathetic role.

**FIREWALL (do NOT merge):**
- **Sám Khán's regiment (1219668, organization, 1 mention)** — keep as a SEPARATE organization entity, not folded into the person.

---

## Consolidation Summary Table

| Keeper | Merge in | Type fix | side | Mentions (live, post-merge) |
|---|---|---|---|---|
| 1219371 Mullá Ṣádiq-i-Khurásání | 628384 Muqaddas | — | Bábí→Bahá'í | ~47 |
| 1219654 Anís | 1219652 Mírzá Muḥammad-'Alíy-i-Zunúzí | work→person | Bábí | 9 |
| 1013108 Sám Khán | — | — | other (sympathetic) | 21 |

## Do-NOT-touch firewall list
- 1219469 Shaykh Ḥasan-i-Zunúzí (informant; ≠ Anís)
- 1219731 Ṣádiq-i-Tabrízí (Sháh-assassination attempt; ≠ Mullá Ṣádiq)
- 1221515 Mírzá Ṣádiq; 1220514 Siyyid Ṣádiq-i-Ṭabáṭabá'í (distinct Ṣádiqs)
- 1220892 Tree of Anísá (concept; ≠ the martyr)
- 1219668 Sám Khán's regiment (org; ≠ the person)
