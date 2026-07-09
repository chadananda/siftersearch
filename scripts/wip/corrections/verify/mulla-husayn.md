# Verify: Mullá Ḥusayn-i-Bushrú'í — Bábu'l-Báb

## VERDICT

**KEEPER = 1219326** (`Mullá Ḥusayn`, person) ← merge fragments:

| Merge id | name | type | mention_count col | real mentions | rationale |
|---|---|---|---|---|---|
| **1219632** | `Bábu'l-Báb` | person | 1 (stale) | 1 | "Gate of the Gate" = title given to Mullá Ḥusayn by the Báb for being the first believer. Same person. |
| **1227594** | `Mullá Ḥusayn-i-Bushrú'í` | person | 1 (stale) | 2 | Full nisba form (of Bushrúyih). Same person. |

Optional roll-ups (epithet/possessive fragments, same referent, low value — merge or leave as you prefer):
- **1222052** `the sword of Mullá Ḥusayn` (concept, 2) — his sword/relic; an object, not the person. LEAVE separate (it is a thing, not him).
- **1220111** `Companions of Mullá Ḥusayn` (organization, 6) — his band of followers; a group. LEAVE separate.

**STALE COLUMN CONFIRMED:** `graph_entities.mention_count` for keeper = **1**, but live `COUNT(*)` over `g.entity_mentions` = **342**. Reporting must count `entity_mentions`, never the column. (Matches open task #1 / #2 on the orphan-mention miscount.)

## ALIASES — STRIP vs KEEP

### STRIP — 1 alias (mis-bound, verified)
- **"Mullá Ḥusayn-i-Zanjání"** (conf 0.7) — **WRONG PERSON.**
  - Corpus (Dawn-Breakers [24.111], content 11684714 / 21054846 / 21556806):
    "…based upon the manuscript which **a certain Mullá Ḥusayn-i-Zanjání wrote and sent to the presence of Bahá'u'lláh**, in which he recorded… [the happenings of Zanján]."
  - Web: this is **Mírzá Ḥusayn Zanjání**, author of *Tārīkh-i vaqāyiᶜ-i Zanján*, a manuscript **Bahá'u'lláh commissioned c. 1880** to chronicle the Zanján upheaval.
  - Impossibility proof: Bábu'l-Báb was **martyred at Shaykh Ṭabarsí in 1849** — he could not author a manuscript sent to Bahá'u'lláh ~30 years after his death. The "-i-Zanjání" nisba (of Zanján) also contradicts "-i-Bushrú'í" (of Bushrúyih). Distinct chronicler. **STRIP.**

### KEEP — flagged-but-correct (do NOT strip)
- **"the Beloved Siyyid, the exalted Ḥusayn"** (conf 0.7) — ledger marked "suspect"; **EVIDENCE CLEARS IT.**
  - Corpus (*Gate of the Heart*, content 7771020 / 7771394): "**Mullá Ḥusayn, the first believer, is particularly addressed as 'the Beloved Siyyid, the exalted Ḥusayn,'** and is designated the *báb*, or gate, to the Báb."
  - This is the Báb's form of address to Mullá Ḥusayn in the **Qayyúmu'l-Asmá'**. Correctly bound to keeper. **KEEP.** (Caveat: the surface contains "Siyyid," which could later collide with the many Siyyid-Ḥusayns below; retain but watch.)

### Other aliases on keeper — all correct, retain
`Mullá Ḥusayn`, `lion-hearted Mullá Ḥusayn`, `Mullá Ḥusayn of Bushrúyih`, `Mullá Ḥusayn-i-Bus̱hrú'í`, `Ḥusayn of Bus̱hrúyih`, `the gate to the Báb`, `the first believer`, `first Letter of the Living`, `the first Letter of the Living`, `Mullá Husaym` (OCR var). Generic/pronominal surfaces (`Ḥusayn`, `his guest`, `he himself`, `Muḥammad Ḥusayn`) are low-confidence context-bound — harmless but watch for over-matching.

## CONFIDENCE
**HIGH (0.95)** on keeper consolidation (1219326 ← 1219632, 1227594) and on stripping "Mullá Ḥusayn-i-Zanjání" (corpus + web both decisive; chronology makes identity impossible).
**HIGH (0.9)** on KEEPING "the Beloved Siyyid, the exalted Ḥusayn" — direct corpus attestation; ledger's suspicion overturned.

## FIREWALL (distinct entities — do NOT merge)
- **Quddús** (613760 person, 1376 mentions; 613765 concept, 784) — co-leader at Ṭabarsí, but a **different** Letter of the Living (Muḥammad-'Alíy-i-Bárfurúshí). Separate.
- **Siyyid Ḥusayn-i-Yazdí** the Báb's amanuensis — candidates 628260 `Siyyid Husayn Yazdí`, 654671, 1013095. Separate.
- **Siyyid Ḥusayn** (619955 person 167; 615040 person 109; 625590; 1055713) — generic Siyyid-Ḥusayns; do not let the kept "Beloved Siyyid…" alias pull these in. Separate.
- **Ḥusayn Khán** (1060764 place 50; 652379 / 1055072 Mírzá Ḥusayn Khán) — the persecuting governor of Fárs. Separate.
- **Imám Ḥusayn** (620204 person 45; 620311; 620198; 983882) — 3rd Shí'í Imám. Separate.
- **Mírzá Ḥusayn Zanjání** — the *Tārīkh-i vaqáyiᶜ-i Zanján* chronicler behind the stripped alias (no clean dedicated entity id observed; the surface was simply mis-attached). Separate.
- **Suheil Bushrui** (646848, 29) — 20th-c. scholar; shares "Bushrui" by coincidence only. Separate.

## DESCRIBE (proposed for keeper 1219326)
Mullá Ḥusayn-i-Bushrú'í (of Bushrúyih, Khurásán; d. 1849), titled **Bábu'l-Báb** ("Gate of the Gate") by the Báb — the **first to believe** in the Báb (night of 22–23 May 1844, Shíráz) and the **first Letter of the Living**. Addressed in the Qayyúmu'l-Asmá' as "the Beloved Siyyid, the exalted Ḥusayn." Hero and commander of the defenders at the fort of **Shaykh Ṭabarsí**, where he was mortally wounded and martyred (Feb 1849).

## FLAGS
- `mention_count` column is **stale across the board** (keeper shows 1 vs 342 real). Snapshot/reporting code must aggregate `entity_mentions`, not read the column. Aligns with open tasks #1/#2.
- READ-ONLY pass: no writes performed. Merge + alias-strip are recommendations for the writer pipeline.
- Watch the kept alias "the Beloved Siyyid, the exalted Ḥusayn" — its "Siyyid" token risks future collision with the Siyyid-Ḥusayn cluster; keep context-gated.
