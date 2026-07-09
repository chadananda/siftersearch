# Shaykhí Founders — Entity Verification

Deep cross-corpus verification of the two Shaykhí founders + the Siyyid Káẓim namesake firewall.
Read-only (SELECT against `data/sifter.db` + ATTACH `data/graph.db`); WebSearch corroboration.
Date: 2026-06-16.

---

## VERDICT

| Entity | Keeper id | Merge / Action | Confidence |
|---|---|---|---|
| **Shaykh Aḥmad-i-Aḥsá'í** (founder, d.1826) | **1056602** | ← merge fragments `1149145` (person "Aḥmad Aḥsá’í"), `1184080` (concept "Shaykh Aḥmad-i-Aḥsa'í"), `641560` (person "Shaykh Ahmad's"). Strip suspect aliases **"Khurasání"** and **"Baḥrayní"**. | **Very high (0.98)** |
| **Siyyid Káẓim-i-Rashtí** (successor, d.1843) | **619152** | ← merge fragments `1055345` ("Siyyid Káẓim-i-Rashtí"), `1238188` (untagged "Siyyid Káẓim"). | **Very high (0.97)** |
| **FIREWALL — Siyyid Káẓim-i-Zanjání** (companion of the Báb, martyred Mázindarán) | **id = NONE (no graph_entity exists)** | Keep SEPARATE. He appears in the corpus text but was never extracted as a distinct entity. Do NOT let any future merge fold him into 619152. | n/a |

---

## EVIDENCE

### Shaykh Aḥmad-i-Aḥsá'í — keeper 1056602
Mention contexts (Dawn-Breakers ch.1) are unambiguous: "CHAPTER I: THE MISSION OF SHAYKH AHMAD-I-AHSA'I", "His departure from **Bahrayn** to Iraq", sojourns in Yazd, Kirmánsháh (Prince Muḥammad-‘Alí Mírzá), Karbilá; "confided to Siyyid Káẓim, his chosen successor, the secret of his mission"; "S̱hayḵh Aḥmad died … in the year 1242 A.H., at the age of eighty-one, … laid to rest in the cemetery of Baqí‘" (Medina).
Birthplace fragment `1056080` "Ahsa" (PLACE, not the person): "Born Rajab, 1166 A.H. … 1753, in town of Ahsa in district of Ahsa, northeast of Arabian peninsula." — confirms identity but stays a PLACE entity; do not merge into the person.
WebSearch corroboration: b. May 1753, Al-Hasa (eastern Arabia); educated in Bahrain + Karbalá; d. 27 June 1826, Medina; founder of the Shaykhí school; succeeded by Sayyid Kāẓim Rashtī.

### Siyyid Káẓim-i-Rashtí — keeper 619152
Mention contexts confirm the Rashtí successor, NOT the Zanjání: "from his early boyhood … at age eleven committed the Qur'án to memory"; "In the year 1231 A.H., when only twenty-two years old, he … departed from **Gílán**"; "Siyyid Káẓim, his chosen successor"; "In Karbilá, Siyyid Káẓim devoted himself to the work initiated by [Shaykh Aḥmad]"; teacher of Mullá Ḥusayn.
Fragment `1238188` (untagged) is also Rashtí — its text names "Siyyid Káẓim-i-Rashtí" and "the death of Siyyid Káẓim" (Gate of the Heart / Logos & Civilization / RoB vol.3), incl. the note that Ḥájí Mírzá Karím Khán-i-Kirmání was "considered by some to be the successor of Siyyid Káẓim." → Rashtí.

### FIREWALL — Siyyid Káẓim-i-Zanjání (distinct person, NO entity)
Corpus text (God Passes By + Dawn-Breakers) describes him as a separate man:
- "His native city of S̱híráz, and proceeded to Iṣfahán. **Siyyid Káẓim-i-Zanjání accompanied Him** on that journey. As He approached the outskirts of the city, He wrote a letter to the governor of the province" (Sept 1846; the Manúchihr Khán letter episode).
- "a certain Siyyid Káẓim-i-Zanjání, who was later **martyred in Mázindarán**, and whose brother, **Siyyid Murtaḍá, was one of the Seven Martyrs of Ṭihrán**."
He is a companion of the Báb (fl. 1846), NOT the Shaykhí leader who died in 1843 — a clean chronological + biographical separation. Confirmed user-distinct.

---

## FLAGS (require write-side correction — NOT done here, read-only)

1. **FIREWALL BREACH (active):** keeper **619152 (Rashtí) has 2 misattributed mentions** that are actually about the *Zanjání*:
   - mention **id 60054** (content_id 21054165): "Siyyid Káẓim-i-Zanjání accompanied Him on that journey…" — the Báb's Shíráz→Iṣfahán departure. **Reassign off 619152.**
   - mention **id 38762** (content_id 21055554): about Zanján *the city* upheaval ("flames had already enveloped Zanján") — not the Rashtí person either. **Reassign/remove off 619152.**
   The extractor collapsed Zanjání-context paragraphs into the Rashtí entity. When/if a `Siyyid Káẓim-i-Zanjání` entity is created, these mentions belong to it (60054) or to the Zanján place / Ḥujjat episode (38762).

2. **No Zanjání entity exists.** Create one (person, Baha'i, era=Bábí, fl.1846, martyred Mázindarán, brother of Siyyid Murtaḍá of the Seven Martyrs of Ṭihrán) ONLY with explicit user approval — flagged here as the firewall target, not silently merged.

3. **Suspect aliases on Shaykh Aḥmad — STRIP "Khurasání" and "Baḥrayní":**
   - "Baḥrayní" = derived from "His departure from **Bahrayn** to Iraq" (he was *educated in* Bahrain). A place-of-passage, not a personal nisba. The corpus "Baḥrayní" entities (e.g. `1238880` Shaykh Músay-i-Baḥrayní) are OTHER people.
   - "Khurasání" = derived from "S̱hayḵh Aḥmad … left for **Khurásán** … vicinity of the shrine of the Imám Riḍá in Mashhad." Travel destination, not an identifier. "Khurasání" is a hugely overloaded nisba (35+ distinct entities: Akhúnd Khurasání, Mullá Sádiq-i-Muqaddas-i-Khurasání, Mullá Káẓim-i-Khurasání, etc.) — none is Shaykh Aḥmad.

4. **mention_count column is STALE** (confirms ledger warning): graph_entities says 619152=418 / 1056602=24, but live `entity_mentions` counts are 619152=110 and 1056602=150. Trust COUNT(*) over the column.

5. **Cross-corpus coverage** confirmed: Dawn-Breakers (mission/biography), God Passes By (Zanjání companion + Bahrayn), Gate of the Heart / Logos & Civilization / RoB vol.3 (Rashtí doctrine). Balyuzi "The Báb" (466) not separately surfaced in mentions but corpus + WebSearch agree on all dates/relationships.
