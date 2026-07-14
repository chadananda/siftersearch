# Nayríz & Zanján Antagonists — Cross-Corpus Verification

> Chief antagonists (`side = other`) of the First Nayríz upheaval (1850) and the Zanján upheaval (1850–51).
> READ-ONLY pass. Mention counts are STALE (entity_mentions not GC'd on delete). Graph descriptions are all empty.
> Corpus: DB Nayríz/Zanján chapters (Shoghi Effendi, *God Passes By*-style narration) + Gobineau/Nicolas quotes embedded in the Momen corpus. WebSearch corroboration.

---

## NAYRÍZ

### 1. Zaynu'l-‘Ábidín Khán — Governor of Nayríz  ✅ KEEPER
- **VERDICT:** KEEPER → `1219609` Zaynu'l-'Ábidín Khán (person, 10 mentions). No duplicates found; canonical single entity.
- **Confidence:** HIGH.
- **Role / fate:** Governor of Nayríz. Alarmed by Vaḥíd's reception and mass conversions, ordered the army to wipe out the community and kill its leader. When force failed he "resorted to deception and treachery," raised a false cry of peace, lured Vaḥíd and the leaders to the army camp under written pledge of safety — the betrayal that led directly to Vaḥíd's capture and murder. The chief conspirator of the First Nayríz upheaval.
- **side:** other.
- **Corpus proof:** content 21055548 ("Zaynu'l-'Abidin Khán, the Governor of Nayríz, was alarmed…"); 21055687 ("resorted to deception and treachery… raised the cry of peace…").
- **FIREWALL:** ≠ any other "Khán." Distinct from the Nayríz *army* commander (Mihr-'Alí Khán, below) — the governor ordered/conspired, the field commander executed the siege.
- **FLAGS:** Mentions 6956604/6956605/7503331 attached to this entity are Baghdád/Sulaymáníyyih (Bahá'u'lláh) paragraphs — almost certainly mis-linked content_ids (extractor noise), NOT a second referent. Core 5–6 Nayríz mentions are solid. Spelling variant in text: "Zaynu'l-'Abidin" (no accent on first í) vs canonical "Zaynu'l-'Ábidín".

### 2. Nayríz army commander who had Vaḥíd killed  ✅ KEEPER
- **VERDICT:** KEEPER → `1219848` Mihr-'Alí Khán (person, 2 mentions), titled **Shujá'u'l-Mulk** (`1219611`, 2 mentions, appositive).
- **Recommendation:** treat `1219611` Shujá'u'l-Mulk as the *title/alias* of `1219848` Mihr-'Alí Khán → MERGE 1219611 into 1219848 (keeper), retaining Shujá'u'l-Mulk as an alias. They co-occur as subject+appositive in the same paragraph (21055601).
- **Confidence:** MEDIUM-HIGH on the merge (co-appositive); HIGH that Mihr-'Alí Khán is the Nayríz field commander tied to Vaḥíd's death.
- **Role / fate:** Mihr-'Alí Khán, the Shujá'u'l-Mulk, appointed by the Nuṣratu'd-Dawlih (governor of Fárs) as commander of the cavalry/soldiers sent against Nayríz; led the siege and the army that returned to Shiraz after Vaḥíd (Siyyid Yaḥyá) was strangled.
- **side:** other.
- **Corpus proof:** content 21656488 ("Siyyid Yahya was strangled… the victorious army returned to Shiraz") linked to 1219848; 21055601 ties Mihr-'Alí Khán + Shujá'u'l-Mulk to the fate-of-persecutors narration. WebSearch (h-net Siyyid Ibrahim narrative): "the Nusratu'd-Dawlih… appointed Mihr-'Alí Khán, the Shuja'u'l-Mulk… as commanders."
- **🔥 FIREWALL (user-flagged, critical):** This Nayríz commander is **NOT** the Shaykh-Ṭabarsí general **'Abbás-Qulí Khán-i-Láríjání** (who killed Mullá Ḥusayn). Different campaign, different province, different man — same role ("the general who killed the Bábí leader") is a coincidence the user explicitly called out. 'Abbás-Qulí Khán-i-Láríjání exists as TWO graph entities: `1219600` ('Abbás-Qulí Khán-i-Láríjání, 3 mentions) and `1227614` (Abbas-Quli Khan-i-Larijani, 5 mentions) — these two are duplicates of EACH OTHER (Ṭabarsí general) and BOTH are firewalled out of Nayríz/Zanján. (Flagged here for the Ṭabarsí pass, not consolidated in this pass.)
- **FLAGS:** Only 2 mentions each; low signal. Confirm the merge by reading 21055601 fully before committing.

---

## ZANJÁN

### 3. Chief royal commander of the final assault  ✅ KEEPER
- **VERDICT:** KEEPER → `983846` Muḥammad Khán (person, 5 mentions) = **Muḥammad Khán, the Amír-Túmán** (formerly Biglarbigi / Mír-panj).
- **Confidence:** HIGH.
- **Role / fate:** The general finally commissioned, at the Amír-Niẓám's urging, with five regiments and heavy munitions "to demolish the fort and wipe out its occupants" — the commander of the decisive royal assault that crushed Ḥujjat's defenders. Present at the post-siege massacre of Bábí prisoners (broke the honor-pledge of safety, with prisoners bayoneted / blown from mortars).
- **side:** other.
- **Corpus proof:** content 21054792 ("Muḥammad Ḵhán, the Amír-Túmán, at the head of five regiments… commissioned to demolish the fort"); 21656676 (Gobineau: "Muhammad Khan, then Bigliyirbigi and Mir-panj… today become Amir-Tuman, joined the troops…"); 21055550 (Zanján upheaval intro).
- **FIREWALL:** ≠ place-entity 620105 "Muḥammad Khán" (mistyped as place) and ≠ other Muḥammad Kháns (625351 etc.) — those are zero-mention orphans / wrong-type. ≠ Zaynu'l-'Ábidín (Nayríz).
- **FLAGS:** Title evolves across sources (Biglarbigi → Mír-panj → Amír-Túmán) — all one man; do not split on title. Variant spelling "Muhammad Khan Bigliyirbigi" in Gobineau quotes.

### 4. Secondary Zanján besiegers (Gobineau roster) — NO CLEAN KEEPER
- **VERDICT:** NOT consolidatable in this pass. The Gobineau/Nicolas passages (content 21656709, 21656676) name a roster of subordinate commanders — **"major Arslan Khan" (cavalry from Khirghan), Qásim Khán (from Karabagh), 'Alí-Akbar (captain of Khúy)** — but the matching graph entities are all stale orphans with **0 live mentions** (`1239206` Arslan Khan, `632405`/`618565` Qásim Khán, `1062000` Muhammad-Qásim Khán). No reliable entity to keep/merge.
- **Confidence:** LOW (insufficient live graph signal).
- **side:** other (if ever consolidated).
- **🔥🔥 FIREWALL (critical conflation found):** Entity `1060805` **"Amír Arslán Khán"** (3 mentions) is the **Khurásán rebel — "the son of Ásifu'd-Dawlih, the Sálár," guardian of the Mashhad mosque** (allied with Ja'far-Qulí Khán; rebellion crushed Oct 1847, victory of Shah-rud). Per the prior ledger note this is the **Khurásán** Amír Arslán Khán and must be FIREWALLED from any Zanján namesake. **BUG:** 1060805 is CONFLATED — one of its mentions (content 21656709) is the **Zanján** prisoner-massacre passage where Gobineau names a *different* "Amir Arslan Khan" (the Zanján cavalry major). The Khurásán-rebel mentions (21054234, 21055550) and the Zanján-major mention (21656709) are TWO DIFFERENT MEN wrongly merged into 1060805. Recommend SPLIT in a future write pass: keep 1060805 as the Khurásán Sálár's-son rebel (`side` = other, but Khurásán/Mashhad rebellion — arguably a separate campaign entity, not a Zanján besieger), and create/relink a distinct Zanján "Arslán Khán" entity.
- **`1062135` Sálár** (3 mentions) = the Khurásán rebel leader himself (son of Ásifu'd-Dawlih, guardian of Mashhad mosque) — FIREWALLED, Khurásán not Zanján. Father of the Khurásán Amír Arslán Khán in 1060805.

---

## SUMMARY OF ACTIONS (for the write pass — NOT executed here)
| # | Keeper | Merge in | Side | Note |
|---|--------|----------|------|------|
| 1 | 1219609 Zaynu'l-'Ábidín Khán | — | other | Nayríz governor; strip 3 mis-linked Baghdád mentions |
| 2 | 1219848 Mihr-'Alí Khán | 1219611 Shujá'u'l-Mulk (alias) | other | Nayríz army cmdr who had Vaḥíd killed |
| 3 | 983846 Muḥammad Khán (Amír-Túmán) | — | other | Zanján final-assault general |
| 4 | (none) | — | other | Zanján subordinates are 0-mention orphans; SPLIT 1060805 (Khurásán≠Zanján) |

## FIREWALLS (must hold)
- Nayríz Vaḥíd-killer **Mihr-'Alí Khán (1219848)** ≠ Ṭabarsí Mullá-Ḥusayn-killer **'Abbás-Qulí Khán-i-Láríjání (1219600 / 1227614)**. [user-flagged same-role-different-man]
- **1060805 Amír Arslán Khán = Khurásán rebel (Sálár's son)** ≠ any Zanján "Arslán Khán"; 1060805 is internally conflated and needs a SPLIT.
- **1062135 Sálár = Khurásán rebel** ≠ Nayríz/Zanján; ≠ Majdu'd-Dawlih namesake.
- Zaynu'l-'Ábidín Khán (Nayríz governor) ≠ all other Kháns; ≠ Muḥammad Khán (Zanján).
- 1219600 & 1227614 are duplicates of EACH OTHER (both Ṭabarsí 'Abbás-Qulí Khán-i-Láríjání) — flagged for the Ṭabarsí pass, not this one.
