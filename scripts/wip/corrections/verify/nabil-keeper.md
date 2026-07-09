# Nabíl — Keeper Resolution & Firewall

## VERDICT

**KEEPER = 1220249** for **Nabíl-i-A'ẓam = Mullá Muḥammad-i-Zarandí** (author of the Dawn-Breakers / Nabíl's Narrative).

**MERGE INTO 1220249:** `620138`, `620216`
- 620138 "Nabíl" (49 mentions) — GPB + related, "Nabíl affirms/testifies in his narrative" → the author/historian Zarandí.
- 620216 "Nabíl-i-Zarandí" (2 mentions) — GPB narrative refs → same author.

**FIREWALL — DO NOT MERGE:** `1220146` **Nabíl-i-Akbar = Mullá Muḥammad-i-Qá'iní** (d. 1892 Bukhárá), one of the Apostles of Bahá'u'lláh — a DIFFERENT eminent Bahá'í. Keep entirely apart from the keeper.

## CONFIDENCE
**High (≈0.97)** for keeper resolution and for the firewall. Cross-corpus unification (GPB 620138 + DB keeper 1220249) is corpus-evidenced and web-confirmed.

## CRITICAL DATA NOTE — mention_count column is STALE/WRONG
`graph_entities.mention_count` does NOT match the real `entity_mentions` table. Use COUNT(*) on entity_mentions:

| id | canonical_name (col) | mention_count col (stale) | REAL entity_mentions count |
|----|----------------------|---------------------------|----------------------------|
| 620138  | Nabíl                | 1616 | **49**  |
| 620216  | Nabíl-i-Zarandí      | 14   | **2**   |
| 1220146 | Nabíl-i-Akbar        | 1    | **20**  |
| 1220249 | Nabíl                | 1    | **142** |

The real counts confirm the brief's mass figures (~40 / ~141 / ~2 / ~20). The keeper is the mention-mass id **1220249**, NOT 620216 — exactly as the earlier note predicted.

## EVIDENCE

### Keeper = 1220249 is the Dawn-Breakers author (Zarandí)
- Mentions live in doc **21308 "The Dawn-Breakers"** incl. Preface para_16: *"…the time has come when Nabíl's unique narrative of its beginnings…"*
- First-person voice mentions ("I", "me", "this poor youth", "himself", "a participant", "his chronicler Nabíl") — the narrator/author signature pattern.
- Alias cluster on 1220249 is decisive: `Nabíl-i-A'zam`, `Nabíl-i-A‘ẓam`, `Mullá Muḥammad-i-Zarandí`, `Muḥammad-i-Zarandi`, `Nabíl-i-Zarandí`, `Nabíl-A'zam`.

### 620138 (GPB, 49) = same author
- Doc 21310 "God Passes By", e.g. para_248: *"Nabíl, traveling at that time through the province of Ḵhurásán… he testifies in his narrative…"*; para_258 *"as reported by Nabíl in his narrative."*
- Doc 16275 (another Dawn-Breakers copy), doc 2531 (letter re typing "the lengthy manuscript of Nabíl"). All = the historian Zarandí. → cross-corpus unify into keeper.

### 620216 (GPB, 2) = same author
- Doc 21310 GPB; canonical_name already "Nabíl-i-Zarandí". → merge into keeper.

### FIREWALL — 1220146 = Nabíl-i-Akbar (Mullá Muḥammad-i-Qá'iní), DIFFERENT person
- Doc 430 "The Revelation of Bahá'u'lláh vol. 2": *"Another story… is that of **Mullá Muḥammad-i-Qá'iní, surnamed Nabíl-i-Akbar**. It is extracted from his spoken chronicle as recorded by his illustrious nephew Shaykh Muḥammad-‘Alíy-i-Qá'iní."* — explicitly Qá'iní, with a nephew, a separate biography.
- Doc 432 "Revelation of Bahá'u'lláh vol. 4", doc 4369 ("Nabil-i-Akbar in the Tablet of Wisdom / Lawḥ-i-Ḥikmat"), doc 21308 para_942 (DB lists Nabíl-i-Akbar present *alongside* the narrator) — Akbar appears as a third party, never as narrator.
- Aliases on 1220146: `Nabíl-i-Akbar`, `Mullá Muḥammad-i-Qá'iní`, `Nabíl-i-Akbar himself`. Clean, no Zarandí/A'ẓam contamination.

### Web confirmation
- Mullá Muḥammad-i-Zarandí (1831–1892), known as Nabíl-i-A'ẓam / Nabíl-i-Zarandí, eminent Bahá'í historian, Apostle of Bahá'u'lláh, author of The Dawn-Breakers (written Persian 1887–88, "year 1305 A.H."), living in Akka. Distinct from Nabíl-i-Akbar (Mullá Muḥammad-i-Qá'iní). [Wikipedia: Nabíl-i-A'ẓam; bahai-library.com/nabil_dawnbreakers; abebooks 1932 first ed. lists "Muhammad-I-Zarandi (Preface)"]

## ALIASES (for keeper 1220249 after merge)
Canonical: **Nabíl-i-A'ẓam** (preferred) / Mullá Muḥammad-i-Zarandí.
Surfaces to attach: Nabíl, Nabíl-i-A'zam, Nabíl-i-A‘ẓam, Nabíl-A'zam, Nabíl-i-Azam, Nabíl-i-Zarandí, Mullá Muḥammad-i-Zarandí, Muḥammad-i-Zarandi.
**EXCLUDE (firewall):** Nabíl-i-Akbar, Mullá Muḥammad-i-Qá'iní. Also reject noisy stray-alias on 1220249: `Nabíl-i- Akbar`, `the Valley of Nabíl`, `Ṭihrán` (mis-attached generic/firewall tokens — do NOT carry over).

## DESCRIBE
Nabíl-i-A'ẓam (Mullá Muḥammad-i-Zarandí, 1831–1892): eminent early Bahá'í poet-historian, one of the Apostles of Bahá'u'lláh; author of *The Dawn-Breakers (Nabíl's Narrative)*, the foundational chronicle of the Báb's ministry, written in Persian 1887–88 at Akka and translated/edited by Shoghi Effendi. Not to be confused with Nabíl-i-Akbar.

## FLAGS
- ⚠️ **mention_count column is unreliable** across these entities — any keeper-selection logic that reads `graph_entities.mention_count` will pick the WRONG keeper (620138). Always recount from `entity_mentions`. Likely systemic; affects other dictionary verifications.
- ⚠️ 1220249 carries a stray `Nabíl-i- Akbar` alias + `the Valley of Nabíl`/`Ṭihrán` — firewall-leak / NER noise. Strip on merge.
- Note the wider Nabíl namespace has many other low-count fragments (625400 Nabíl-i-A'zam=243-stale, 632246 "Nabil Zarandi", 1055370 "Mullá Muḥammad-i-Zarandi", etc.) NOT in scope of this task but likely additional author-fragments to consolidate, and several true firewall siblings (628266/1080164 Nabíl-i-Akbar, 831332/831333 Nabílí Qazvíní namesakes). Out of scope here — flagged for a follow-up sweep.
