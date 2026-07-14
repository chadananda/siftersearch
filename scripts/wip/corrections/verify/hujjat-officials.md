# Verification: Ḥujjat + Two Officials (Áqásí, Amír-Niẓám)

Cross-corpus entity consolidation for the manually-verified Bahá'í who's-who dictionary.
READ-ONLY pass. Mention counts recomputed live from `g.entity_mentions` (stored count column is STALE).

---

## VERDICT

**(1) Ḥujjat — keeper `1219480` (person, "Ḥujjat", 85 mentions)**
Merge in:
- `1219377` "Ḥujjat" (type=concept, 39) — Dawn-Breakers references to Ḥujjat of Zanjan (his message from the Báb, his companions, the masjid built for him, his daughters captured at Zanján). Same person; mistyped as concept.
- `1227591` "Hujjat-i-Zanjani" (3) — given in brief; ASCII variant.
- `1219376` "Mullá Muḥammad-‘Alíy-i-Zanjání" (2) — Dawn-Breakers states verbatim: *"Mullá Muḥammad-‘Alíy-i-Zanjání, surnamed Ḥujjat."* Definitive same-person identity.

**(2) Ḥájí Mírzá Áqásí — keeper `1219336` (person, 103 mentions)**
No person-variants found in corpus to merge. Single dominant node. (Stands alone.)
- NOTE: `1219517` "denunciatory tablet to haji mirza aqasi" is a WORK (the Báb's tablet addressed *to* Áqásí), not the person — correctly NOT merged.

**(3) Amír-Niẓám = Mírzá Taqí Khán — keeper `1219327` (person, "Amír-Niẓám", 89 mentions)**
Merge in:
- `619606` "Mírzá Taqí Khán" (21) — corpus states verbatim: *"the Amír-Niẓám, Mírzá Taqí Ḵhán, the Grand Vazír of Náṣiri'd-Dín Sháh"* and *"MÍRZÁ TAQÍ KHÁN, THE AMÍR-NIẒÁM."* Same person.

**Confidence: HIGH** for all three — each merge is backed by an explicit appositive equating the two names in the same sentence/caption within Dawn-Breakers (a corpus source), not by inference.

---

## FIREWALLS (verified separate — NOT merged)

- **Quddús / Mullá Muḥammad-‘Alí Bárfurúshí** (613760, 628241, etc.) — a DIFFERENT Mullá Muḥammad-‘Alí. Distinct entities, untouched.
- **Najaf-‘Alíy-i-Zanjání** (1220392) — a different Zanjání (later Bábí/Bahá'í), not Ḥujjat. Context is a generic persecution passage; no identity overlap. Left separate.
- **Mírzá Ḥasan Khán (Vazír-Niẓám)** — Amír-Niẓám's brother. Multiple separate nodes exist (615570, 638462, 618714 "Vazir-Nizam", 1060864/1220142 "Vazír-Niẓám", 1219659). NONE merged into Amír-Niẓám. The keeper is *Amír*-Niẓám (Taqí Khán); the brother is *Vazír*-Niẓám (Ḥasan Khán) — firewall held.

---

## ATTRIBUTE NOTE — Áqásí epithet sourcing (IMPORTANT)

The brief's claim is **confirmed by corpus evidence**:

- **GPB (Shoghi Effendi, _God Passes By_)** diction = **"The overbearing and crafty Ḥájí Mírzá Áqásí"** (corpus content #1219336-source). This is the correct GPB attribution.
- **"Antichrist of the Bábí Revelation/Dispensation"** — every corpus instance (content 5583951, 5583959, 5584032, 5587556) traces to **H.M. Balyuzi, _Bahá'u'lláh — The King of Glory_** (verified via docs.author join), using Balyuzi's narrative diction ("The wily Ḥájí Mírzá Áqási, the Antichrist of the Bábí Revelation"). This is Balyuzi's epithet.
- A WebSearch result asserted Shoghi Effendi coined "Antichrist of the Bábí Revelation." That attribution is **NOT corroborated in our corpus** — no GPB passage in the corpus uses it; all occurrences are Balyuzi. Attribute the "Antichrist" epithet to **Balyuzi**, and the GPB epithet as **"overbearing and crafty."**

---

## DESCRIBE (suggested keeper descriptions)

- **Ḥujjat (1219480)** — Mullá Muḥammad-‘Alíy-i-Zanjání, surnamed Ḥujjat. Leading divine of Zanján, formerly an Akhbárí controversialist; embraced the Báb and led the Zanján upheaval, martyred 1851. (Distinct from Quddús, the other Mullá Muḥammad-‘Alí.)
- **Ḥájí Mírzá Áqásí (1219336)** — Grand Vizier under Muḥammad Sháh; chief antagonist who exiled the Báb to Mákú/Chihríq and blocked His audience with the Sháh. GPB: "overbearing and crafty"; Balyuzi: "Antichrist of the Bábí Revelation." Fell from power on Muḥammad Sháh's death (1848); died Karbilá ~1849.
- **Amír-Niẓám = Mírzá Taqí Khán (1219327)** — Grand Vizier under Náṣiri'd-Dín Sháh; ordered the Báb's execution (Tabríz, 1850) and the nation-wide persecutions of the Bábís. Met his own death shortly after (1852).

---

## FLAGS

- `1219377` is typed **concept** but is a person (Ḥujjat) — type corrected by the merge into the person keeper.
- Stored mention-count column is STALE across the board; counts above are recomputed live from `entity_mentions`.
- WebSearch attribution of the "Antichrist" epithet to Shoghi Effendi conflicts with corpus evidence — corpus says Balyuzi. Defer to corpus / brief.
- `1219517` (tablet-to-Áqásí) is a WORK node sharing Áqásí's name — keep as-is; do not fold the person into it or vice-versa.
