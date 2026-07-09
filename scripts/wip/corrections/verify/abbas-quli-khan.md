# ‘Abbás-Qulí Khán-i-Láríjání — Entity Verification

## VERDICT
**KEEPER: 1219600 — ‘Abbás-Qulí Khán-i-Láríjání**
(properly-diacriticized canonical form; carries the decisive God-Passes-By mention)

**MERGE INTO KEEPER:**
- **1227614** — "Abbas-Quli Khan-i-Larijani" (3 live mentions, all doc 40108 = Momen/Gobineau; "Abbas-Quli Khan Sardar-i-Larija[ni]" at the Ṭabarsí caravansary siege). Same man, ASCII/Momen variant spelling. → CROSS-CORPUS CONFIRMATION.
- **1070838** — "Abbás Qulí" (EMPTY: 0 live entity_mentions; stale stored mention_count=12). Bare-name fragment, no live evidence; fold as alias.
- **615761** — "Khan Larijani" (EMPTY: 0 live entity_mentions; stale stored mention_count=9). Bare-surname fragment, no live evidence; fold as alias.

**DO NOT MERGE:**
- **1227795** — "‘Abbás" (14 live mentions) is a MIXED bare-name bucket. Inspection shows its mentions are the Síyáh-Chál youth ‘Abbás (doc 21308), the nine-year-old ‘Abbás = future ‘Abdu'l-Bahá (doc 429), Mírzá ‘Abbás = Mírzá Buzurg (Bahá'u'lláh's father), and Mírzá ‘Abbás "Qabil". NONE is the Láríjání general. Leave intact; do not absorb.

## CONFIDENCE
**HIGH (0.95).** Keeper + 1227614 merge are textually nailed: G.P.B. (doc 21310) names ‘Abbás-Qulí Ḵhán-i-Láríjání "whose bullet was responsible for the death of Mullá Ḥusayn"; Momen (doc 40108) names Abbas-Quli Khan Sardar-i-Larijani at the same Ṭabarsí siege. Two independent corpora, one man. WebSearch corroborates (governor of Ámul, captain of Láríján forces, killed Mullá Ḥusayn 2 Feb 1849). The two empty fragments (1070838, 615761) are lower-confidence as name-only stubs but have no competing referent in the corpus and match the partial name.

## FIREWALLS (all held — distinct entities, NOT merged)
- **‘Abbás Effendi / ‘Abdu'l-Bahá (614731)** — kept fully separate. (Note: the *bare* ‘Abbás bucket 1227795 even contains a child-‘Abdu'l-Bahá mention — another reason it must stay unmerged.)
- **‘Abbás Mírzá (Qájár crown prince)** — not present among keeper mentions; distinct royal.
- **Mihdí-Qulí Mírzá (Ṭabarsí prince / camp commander)** — distinct. WebSearch explicitly separates them: "Abbás-Qulí Khán of Laríján was captain of the forces AND Prince Mihdí-Qulí Mírzá commander in the camp." Mihdí-Qulí Mírzá appears in the bare-‘Abbás bucket (doc 21308) but is a separate person.
- **Nayríz commanders** — different campaign (Fárs), not Ṭabarsí; none in keeper mentions.

## DESCRIBE
Láríjání chieftain / governor of Ámul; captain (sardár) of the royalist Láríján forces besieging Fort Shaykh Ṭabarsí. **His bullet killed Mullá Ḥusayn (2 Feb 1849).** Later, ~two years after the battle, recounted the siege to Prince Aḥmad Mírzá, likening the Bábís' valor to Karbalá and himself to Shimr (the slayer of Imám Ḥusayn) — a self-incriminating, ultimately humiliating admission.

## SIDE
**other** (antagonist / royalist; Qájár state forces).

## FLAGS
- **STALE COUNTS:** stored `graph_entities.mention_count` is unreliable (1070838=12, 615761=9 stored vs 0 live; 1219600=1 stored vs 3 live). All decisions made on LIVE `entity_mentions` join.
- **DISCOVERY:** the original split flagged candidates 1070838 + 615761, but the real mention-bearing entities were the two fully-qualified ids (1219600, 1227614) surfaced by the name/Láríjání LIKE sweep. Keeper chosen from those.
- **NO MERGE BOOKKEEPING IN DB:** `graph_entities` has no `duplicate_of`/`side` columns; this verification is read-only and the merge is recorded for the external manual dictionary only.
- **1227795 is a multi-person bucket** that needs its own per-mention split (youth ‘Abbás vs Mírzá Buzurg vs Qabil vs child-‘Abdu'l-Bahá vs Mihdí-Qulí Mírzá) — out of scope here, but noted for follow-up.
