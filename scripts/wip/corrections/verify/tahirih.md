# Ṭáhirih — Entity Verification & Consolidation

## VERDICT
**KEEPER = 1219340 (Ṭáhirih, person)** ← merge the following clean name-variant fragments:

| ID | canonical_name | mentions* | Why it belongs |
|----|----------------|-----------|----------------|
| **1219340** | Ṭáhirih | 171 | KEEPER. The title bestowed at Badasht ("the Pure One"). |
| 1219341 | Qurratu'l-'Ayn | 29 | "Solace of the Eyes" — her Shaykhí title; appears in same Badasht/Declaration narrative (doc 21310). |
| 1219793 | Zarrín-Táj | 6 | "Golden Crown" — her given childhood name; DB ch.26 glossary lists "Zarrín-Táj = golden crown" and the Baraghání-family bio passage (doc 21310). |
| 1219794 | Zakíyyih | 2 | DB ch.26: "her name was Fáṭimih… also designated her as Zakíyyih… born 1233 A.H.… 36 at martyrdom in Ṭihrán" — direct identity statement (doc 21308). |
| 1219795 | Qurrat-i-'Ayní | 2 | Spelling variant of Qurratu'l-'Ayn, same Baraghání-family passage + DB study-questions (doc 22221). |
| 1227859 | Qurratu'l-'Ayn (curly quotes) | 1 | Unicode-quote duplicate of 1219341; Badasht garden passage (doc 21308). |

\*entity_mentions counts re-derived live; stored counts are STALE.

**Aliases already on keeper:** Ṭáhirih, the valiant/impetuous/incomparable Ṭáhirih, that heroine, Ṭáhirih's. After merge, add surface variants: Qurratu'l-'Ayn, Zarrín-Táj, Zakíyyih, Qurrat-i-'Ayní, Fáṭimih (Baraghání), Janáb-i-Ṭáhirih, Umm-i-Salmih, the Pure One.

## CONFIDENCE
**High (≈0.97)** for the six fragments above. The Dawn-Breakers ch.26 passages give an explicit chain (Fáṭimih → Zakíyyih → Zarrín-Táj → Qurratu'l-'Ayn → Ṭáhirih) tied to the Baraghání family, corroborated by Momen's family study (doc 11361) and web sources (Bahaipedia, Hurqalya, Journal of Bahá'í Studies).

**Caveat — do NOT merge 638207 wholesale (see FIREWALL).**

## FIREWALL — these are NOT Ṭáhirih
| ID | name | Actual identity — EXCLUDE |
|----|------|---------------------------|
| **1238980** | Fáṭimih | Fáṭimih the daughter of the Prophet (theological/symbolic: "the sun," "the Chaste One," mother of Ḥusayn, wife of ‘Alí). Qur'án/Bayán exegesis docs 7165, 8632. NEVER Ṭáhirih. |
| **1060989** | Fáṭimih-Bagum | Mother of the Báb (doc 430: the 27-yr-old maiden who led prisoners barefoot to Iṣfahán). Distinct person. |
| **638225** | Fáṭimih Khánum | Mahd-i-‘Ulyá, 2nd wife of Bahá'u'lláh, married Ṭihrán 1849 (doc 426). Distinct person. |
| **1220193** | Hidden Book of Fáṭimih | A WORK, not a person. Exclude. |

### ⚠ 638207 "Fáṭimih" — CONTAMINATED BUCKET, do NOT bulk-merge
This entity conflates THREE distinct referents and must be split, not absorbed:
- **Ṭáhirih mentions** (Badasht unveiling, Zakíyyih bio, Zarrín-Táj family passage, martyrdom — docs 21308/21310) → reassign to keeper 1219340.
- **Fáṭimih daughter of the Prophet** (doc 429 "daughter of Muḥammad… married to ‘Alí"; doc 40108 "Fatimih, Muhammad's daughter… bridge Sirat"; Hidden Words attribution) → belongs to 1238980's referent.
- **Munírih Khánum** (doc 430: "named Fáṭimih… Bahá'u'lláh conferred… the name of Munírih" — wife of ‘Abdu'l-Bahá) → a fourth person entirely.
**Action: split 638207 per-mention; only its Baraghání/Badasht/martyrdom mentions go to keeper. Flag for manual per-mention review.**

## DESCRIBE
Ṭáhirih ("the Pure One"), b. Fáṭimih Baraghání, Qazvín, 1233 A.H. (c.1814–17) — d. martyred Ṭihrán, Aug 1852, age ~36. Poet and theologian; the sole woman among the Letters of the Living (first eighteen disciples of the Báb). Titled Qurratu'l-‘Ayn ("Solace of the Eyes") by Siyyid Káẓim; childhood name Zarrín-Táj ("Golden Crown"); family-given Zakíyyih / Umm-i-Salmih. Daughter of the eminent mujtahid Ḥájí Mullá Muḥammad-Ṣáliḥ Baraghání; niece (and daughter-in-law) of Mullá Muḥammad-Taqí Baraghání, whose assassination by a Bábí she was implicated in. At the conference of Badasht (1848) she appeared unveiled, dramatizing the break of the Bábí dispensation from Islamic law. Last words: "You can kill me as soon as you like, but you cannot stop the emancipation of women."

## FLAGS
1. **638207 contaminated** — requires per-mention split (Ṭáhirih / Fáṭimih-of-the-Prophet / Munírih). Highest-priority follow-up.
2. **Munírih Khánum** (referenced inside 638207, doc 430) has no clean keeper here — wife of ‘Abdu'l-Bahá; verify she has her own entity before splitting.
3. **Kinship to verify in graph:** father Ḥájí Mullá Ṣáliḥ Baraghání; uncle/father-in-law Mullá Taqí Baraghání (killed by a Bábí) — ensure these are distinct male entities, not collapsed into any Fáṭimih bucket.
4. stored mention counts STALE — counts above re-derived from entity_mentions live.

## SOURCES
- Corpus: Dawn-Breakers ch.26 (docs 21308/21310/22221); Momen, "Family and Early Life of Ṭáhirih" (doc 11361); Báb exegesis (docs 7165/8632); family history (docs 426/429/430/40108).
- Web: [Bahaipedia: Ṭáhirih](https://bahaipedia.org/%E1%B9%AC%C3%A1hirih) · [Hurqalya: Fāṭima Baraghānī / Qurrat al-‘Ayn](https://hurqalya.ucmerced.edu/node/87) · [Journal of Bahá'í Studies 2:2 (1989)](https://journal.bahaistudies.ca/online/article/download/36/28/54)
