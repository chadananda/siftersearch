# Dawn-Breakers Disambiguation — WORKS / TABLETS OF THE BÁB · DEEP PASS

> Deep-research + correct SORT of the tablets/works of the Báb. Builds on `dawnbreakers-bab-works.md` (first pass) and the work-entities in `dawnbreakers-dump.txt`.
> Each record is now locked with: **Identity** · **Timeline anchor** · **Full title/alias set incl. VERIFIED SCRIPT** · **Links** · **Characterization** · **Corpus-text link** (`text_in_corpus` + `source_doc_ids`).
>
> **Authority order:** GPB (doc 21310) VERBATIM where it exists (supreme/canonical) → Saiedi *Gate of the Heart* (8632) + *Logos and Civilization* (7165) for precise dates → Balyuzi *The Báb* (466) → Nabíl/DB main (21308) → **Phelps "Partial Inventory of the Works of the Central Figures"** (in corpus, doc **8746**; per-work rows are their own docs titled `BB00###`) for VERIFIED original-language SCRIPT + word-count + stage → OoL best-known-works `/en/` + `/fa/` tables (script cross-check).
>
> **side context:** the Báb's dispensation (Bábí, 1844–1850). Saiedi's three-stage frame (8632 ¶7770444/446; Phelps "time period" field confirms it): **(1) First/interpretive** (to Jan 1846) · **(2) Second/philosophical** (Jan 1846 – Apr 1847) · **(3) Third/legislative** (Apr 1847 – Jul 1850, Máh-Kú/Chihríq, the Bayán onward).
>
> **⭐ NEW IN THIS PASS — the corpus holds the ACTUAL FULL TEXTS.** Nearly every work below exists as a full-text document authored by **"The Báb"** in `sifter.db` (`docs` table, `deleted_at IS NULL`). Each record now carries `text_in_corpus: yes` + `source_doc_ids:` (the real searchable text), or `mentioned-only` where only the histories reference it. This ties each WORK entity to its searchable scripture.
>
> **⭐ NEW IN THIS PASS — VERIFIED SCRIPT, not "likely".** Script titles are now pulled from the in-corpus **Phelps inventory** (`original title` / `opening,original` fields, which carry real Arabic/Persian glyphs in-corpus) and cross-checked against the OoL `/fa/` table. Confidence is upgraded from "likely" (first pass) to **verified** where both agree. The Phelps `BB00###` source-row is cited per work.

---

## ⚠ THE "BAYÁN" FIVE-WAY POLYSEMY — LOCKED (do not merge)

Shoghi Effendi's translation is the interpretive key. The dump's single bucket **"[13] (work) the Bayán" (line 1469)** silently conflates FIVE senses — SPLIT on read:

1. **The Persian Bayán** — a WORK (§1). The pre-eminent doctrinal book; nine Váḥids. Phelps **BB00001**.
2. **The Arabic Bayán** — a DISTINCT WORK (§2). "smaller and less weighty" (GPB). Phelps **BB00020**.
3. **The whole Revelation of the Báb** — a CONCEPT, "the Bayán" = His entire Dispensation. GPB ¶21055527: *"'The Bayán,' the Báb… affirms, 'is, from beginning to end, the repository of all of His attributes…'"*; *"Suffer not the Bayán… to withhold you from that Essence of Being…"*
4. **The people / community of the Bayán** — the Bábís (`concept`/community sense). GPB ¶21055527: *"'O people of the Bayán!'… 'act not as the people of the Qur'án have acted…'"*; *"Váḥid of the Bayán (eighteen Letters of the Living and the Báb)."*
5. **Generic "bayán" = utterance / elucidation / exposition** — NOT an entity (titles like *"Bayán dar Jabr wa Tafwíd,"* the Íqán's generic usage). Discard from the work cohort. ⚠ Note: corpus doc **3855** *"Khiṭáb bi-Ahli'l-Bayán"* (Address to the People of the Bayán) and **3934** *"Compilation from Point of Bayán"* / **3881** *"On descent of the Bayán"* are genuine Báb texts using the WORK/Revelation sense — not the generic one.

GPB ¶21055519 renders the book title as **"Bayán (Exposition)"**.

---

## §1. The Persian Bayán  ★ flagship ★
- **canonical:** The Persian Bayán · **type: work** · author: the Báb
- **identity:** CONFIRMED distinct. The pre-eminent doctrinal/legislative book. ≠ Arabic Bayán (§2), ≠ the four non-book "Bayán" senses.
- **TIMELINE:** **Máh-Kú, 1847–48** (Third/legislative stage). Phelps **BB00001** "time period: 3. Third Stage (April 1847 – July 1850)" — 106,000 words, Persian. Nine-month confinement in the fortress of Máh-Kú (Jabal-i-Básiṭ, "the Open Mountain") under Ḥájí Mírzá Áqásí. Saiedi 8632 ¶7770433: *"During the Máh-Kú period the Báb wrote some of His most important works, including the Persian Bayán and the Arabic Bayán."*
- **GPB VERBATIM (¶21055519):** *"…the **Bayán (Exposition)** — that monumental repository of the laws and precepts of the new Dispensation and the treasury enshrining most of the Báb's references and tributes to… 'Him Whom God will make manifest' — was revealed. **Peerless among the doctrinal works of the Founder of the Bábí Dispensation**; consisting of **nine Váḥids (Unities) of nineteen chapters each, except the last Váḥid comprising only ten chapters; not to be confounded with the smaller and less weighty Arabic Bayán**… this Book, **of about eight thousand verses, occupying a pivotal position in Bábí literature**…"*
- **significance:** GPB superlative — **the peerless doctrinal work of the Bábí Dispensation**; chief legislative book; principal vessel of the Báb's tributes to "Him Whom God shall make manifest" (Bahá'u'lláh). 8 Váḥids of 19 + a 10-chapter 9th = 152 chapters; left unfinished. Saiedi ¶7770444: inaugurates the legislative stage.
- **aliases / SCRIPT:** Bayán-i-Fársí · the Persian Bayán · "the Bayán (Exposition)" (GPB gloss) · **بیان فارسی** (VERIFIED — Phelps BB00001 `original title`; matches OoL /fa/ #1 بيان فارسى). Opening (Phelps, verified script): *تسبیح و تقدیس بساط قدس عز مجد سلطانی را لایق…*
- **links:** part→whole: contains the nine Váḥids; the genitive "Váḥid of the Bayán" (GPB ¶21055527) = the 19-member Primal Unity (Letters of the Living + the Báb), a DIFFERENT referent from the book's structural Váḥids. Tribute-target → **Bahá'u'lláh** ("Him Whom God shall make manifest"). Phelps stage links it to the Máh-Kú captivity arc (→ place: Máh-Kú; antagonist: Ḥájí Mírzá Áqásí).
- **text_in_corpus: yes** — `source_doc_ids: [20173 "Bayán-i-Fársí" (the Báb), 16724 / 1356 / 16726 "The Persian Bayán: Partial translation", 12396 "…From A.L.M. Nicolas' French translation"]`. Study/analysis (not the text itself): **15101** "A Thematic Analysis and Summary of the Persian Bayán" (the Báb/compiler), **214786** "Laws of the Bayan reflected in The Kitab-i-Aqdas".
- **traps:** ⚠ ≠ Arabic Bayán (GPB: "not to be confounded"). ⚠ ≠ the Revelation/community/generic senses. ⚠ "Váḥid of the Bayán" ≠ the book's chapters.

## §2. The Arabic Bayán
- **canonical:** The Arabic Bayán · **type: work** · author: the Báb
- **identity:** CONFIRMED distinct work — a compressed Arabic recension. GPB pre-empts the merge.
- **TIMELINE:** **Máh-Kú, 1847–48** — "revealed during the same period" (GPB ¶21055519). Phelps **BB00020** "time period: 3. Third Stage" — 12,400 words, Arabic.
- **GPB VERBATIM (¶21055519):** *"…the **smaller and less weighty Arabic Bayán**, revealed during the same period."*
- **significance:** Compressed Arabic recension of the Bayán's structure/laws; companion but secondary in weight per GPB.
- **aliases / SCRIPT:** al-Bayán al-‘Arabí · Bayán-i-‘Arabí · the Arabic Bayán · **البيان العربي** (VERIFIED — Phelps BB00020 `original title`; matches OoL /fa/ #2 بيان عربى). Opening (Phelps, verified script): *بسم الله الامنع الاقدس. اننی انا الله لا اله الا انا…*
- **links:** sibling-of → Persian Bayán (§1); same Máh-Kú captivity arc.
- **text_in_corpus: yes** — `source_doc_ids: [15349 "The Arabic Bayán" (the Báb), 16725 "The Arabic Bayán: From A.L.M. Nicolas' French translation", 3855 "Khiṭáb bi-Ahli'l-Bayán"(related)]`.
- **traps:** ⚠ DISTINCT from §1 — never merge. ⚠ Both books distinct from the Revelation/community/generic senses.

## §3. Qayyúmu'l-Asmá'  ★ His FIRST revealed work ★
- **canonical:** Qayyúmu'l-Asmá' (Commentary on the Súrih of Joseph) · **type: work** · author: the Báb
- **identity:** CONFIRMED — His first revealed work; one entity under three titles (see DUMP MERGE).
- **TIMELINE — THE ANCHOR:** **the night of the Báb's Declaration, 22–23 May 1844, Shíráz** (the upper room of the House of the Báb, to Mullá Ḥusayn). First revealed work; its first chapter "proceeded, in its entirety, in the course of that night of nights."
- **GPB VERBATIM (¶21055515):** *"…the celebrated commentary on the súrih of Joseph, **entitled the Qayyúmu'l-Asmá', whose fundamental purpose was to forecast what the true Joseph (Bahá'u'lláh) would, in a succeeding Dispensation, endure at the hands of one who was at once His arch-enemy and blood brother. This work, comprising above nine thousand three hundred verses, and divided into one hundred and eleven chapters, each chapter a commentary on one verse of the above-mentioned súrih**…"* (¶21055488: *"that 'first, greatest and mightiest' of all books in the Bábí Dispensation."*)
- **significance:** GPB/Bahá'u'lláh superlative — **"the first, the greatest, and mightiest of all books in the Bábí Dispensation"**; "the Qur'án of the Bábís." 111 chapters, >9,300 verses; "true Joseph" = Bahá'u'lláh (arch-enemy + blood brother = Mírzá Yaḥyá foreshadowed). The Báb uses **dhikr** ("the Remembrance") as His own title throughout (Saiedi 7165).
- **aliases / SCRIPT:** Commentary on the Súrih of Joseph · Tafsír Súrih Yúsuf · **Aḥsanu'l-Qiṣaṣ / Aḥsanu'l-Qaṣaṣ** ("the Best of Stories," Qur'án 12:3; = Qayyúmu'l-Asmá' per Saiedi 7165) · "the Qur'án of the Bábís" · **تفسير سوره يوسف (قيوم الأسماء)** (VERIFIED — OoL /fa/ #3; Phelps inventory carries it as a best-known row, Arabic).
- **DUMP MERGE:** unify dump **"[2] Commentary on the Súrih of Joseph" (line 1598)** + **"[7] Qayyúmu'l-Asmá'" (line 1494)** + **"[1] Aḥsanu'l-Qiṣaṣ" (line 1710)** → ONE entity.
- **links:** recipient/occasion → **Mullá Ḥusayn** (first to whom it was revealed, Declaration night). Prophecy-target → **Bahá'u'lláh** ("true Joseph"); foreshadows **Mírzá Yaḥyá** (arch-enemy + blood brother). Place → House of the Báb, Shíráz.
- **text_in_corpus: yes** — `source_doc_ids: [20170 "Qayyúmu'l-Asmá'" (the Báb — the text), 335081 "Excerpts From The Qayyúmu'l-Asmá", 16718 "Qayyum al-Asmá' Sura 93: Chapter of the Bees" (the Báb)]`. Scholarly: 14213/153651 Lawson "Coincidentia Oppositorum in the Qayyum al-Asmá'", 22790 Lawson "Joycean Modernism in a Nineteenth-Century Qur'an Commentary".
- **traps:** ⚠ "true Joseph" = Bahá'u'lláh (interpretive), not the patriarch. ⚠ Aḥsanu'l-Qiṣaṣ NOT a separate work. ⚠ Distinct from the lost **nine commentaries on the whole Qur'án** (GPB ¶21055518) revealed at Máh-Kú.

## §4. Dalá'il-i-Sab‘ih (the Seven PROOFS)
- **canonical:** Dalá'il-i-Sab‘ih (the Seven Proofs) · **type: work** · author: the Báb
- **identity:** CONFIRMED — the great apologetic. ⚠ NOT Khaṣá'il-i-Sab‘ih (§9, Seven *Directives*). Both "Sab‘ih" (sevenfold); utterly different works and stages — the single most likely merge-error in this cohort.
- **TIMELINE:** **Máh-Kú / Chihríq, ~1847–48 (Third/legislative stage, last period).** GPB ¶21055522 "during that same period"; ¶21055602 "during the last days of His ministry." Phelps **BB00015** (Persian version) "time period: 3. Third Stage" — 13,900 words, Persian; a separate Arabic version exists (OoL /en/ #5 "Persian version and Arabic version").
- **GPB VERBATIM (¶21055522):** *"The **Dalá'il-i-Sab‘ih (Seven Proofs), the most important of the polemical works of the Báb**, was revealed during that same period. Remarkably lucid, admirable in its precision, original in conception, unanswerable in its argument… noteworthy for the blame it assigns to the 'seven powerful sovereigns ruling the world' in His day, as well as for… the responsibilities… of the Christian divines of a former age…"*
- **significance:** GPB superlative — **the most important of the Báb's polemical works**; adduces proofs of His mission, indicts the seven sovereigns + Christian clergy.
- **aliases / SCRIPT:** the Seven Proofs · Kitáb-i-Dalá'il-i-Sab‘ih · **كتاب دلائل سبعه** (VERIFIED — OoL /fa/ #5; Phelps BB00015 title "Dala'il-i-Sab'ih (The Seven Proofs - Persian)"). Opening (Phelps, verified script): *بسم الله الافرد الافرد…*
- **links:** addressee/target → the "seven sovereigns" + Christian divines; same Máh-Kú/Chihríq captivity arc.
- **text_in_corpus: yes** — `source_doc_ids: [11432 "The Seven Proofs (Dalá'il-i-Sab'ih)" (the Báb)]`.
- **traps:** ⚠ ≠ Khaṣá'il-i-Sab‘ih (§9). Do not merge on shared "Sab‘ih."

## §5. Ṣaḥífih bayna'l-Ḥaramayn (Epistle Between the Two Shrines)
- **canonical:** Ṣaḥífih bayna'l-Ḥaramayn · **type: work** · author: the Báb
- **identity:** CONFIRMED — a pilgrimage-period epistle. Distinct from the other "Ṣaḥífih" works (§6, §long-tail).
- **TIMELINE:** **the pilgrimage, late 1844 / early 1845 — literally written on the road between Mecca and Medina.** Phelps **BB00019** "time period: 1. First Stage (To January 1846)" — 13,100 words, Arabic; title "Sahifa Baynu'l-Haramayn (Epistle Revealed between the Twin Shrines)." Inventory: listed in "Kitáb al-fihrist" (dated 21 June 1845). Composed in reply to questions from Mírzá Muḥíṭ-i-Kirmání.
- **CHARACTERIZATION (Saiedi 8632 ¶7770648):** the Báb opens it inviting questions about "the truth of the twin Sacred Shrines"; Saiedi: *"the Báb is the Gate that unites the twin Sacred Shrines, just as He was at that moment literally situated between Mecca and Medina."* (GPB does not separately characterize.)
- **significance:** The Báb, physically between the two shrines, presents Himself as the Gate (báb) uniting them; treats the symbolic triangle and square. Among the works stolen on the Ḥajj journey (per the Khuṭbiy-i-Jiddah).
- **aliases / SCRIPT:** Ṣaḥífiy-i-Bayni'l-Ḥaramayn · Ṣaḥífa bayna'l-Ḥaramayn · "Kitáb bayn al-Ḥaramayn" (inventory variant) · Epistle Between the Two Shrines / Two Holy Places · **صحيفه بين الحرمين** (VERIFIED — OoL /fa/ #4; Phelps BB00019). Opening (Phelps, verified script): *بسم الله…*
- **links:** recipient → **Mírzá Muḥíṭ-i-Kirmání** (questions answered); place-pair → Mecca + Medina; related → Khuṭbiy-i-Jiddih (lists it among stolen works).
- **text_in_corpus: yes** — `source_doc_ids: [20356 "Ṣaḥífiy‑i‑Bayni'l‑Ḥaramayn" (the Báb)]`.
- **traps:** ⚠ "the two shrines/Ḥaramayn" = Mecca + Medina, not a building. ⚠ Distinct from Ṣaḥífih-i-‘Adlíyyih / Ja‘faríyyih / Raḍavíyyih / Makhzúmíyyih — disambiguate by qualifier.

## §6. Ṣaḥífih-i-‘Adlíyyih (Epistle of Justice — ROOT Principles)
- **canonical:** Ṣaḥífih-i-‘Adlíyyih · **type: work** · author: the Báb
- **identity:** CONFIRMED ≡ **Risáliy-i-‘Adlíyyih** — the SAME work (root principles), risálih/ṣaḥífih (treatise/epistle) title variants. **RESOLVED by the Phelps inventory itself: BB00017 title = "Sahifiy-i-'Adliyya = Risaliy-i-'Adliyyih (Epistle of Justice: Root Principles)"** — the inventory literally equates them. ⚠ Keep **Risáliy-i-Furú‘-i-‘Adlíyyih** (branches, §long-tail / BB00039) SEPARATE.
- **TIMELINE:** **late January 1846, Shíráz** (2nd half of 1st month, A.H. 1262). Phelps **BB00017** "time period: 2. Second Stage (January 1846 – April 1847)." Saiedi 8632 ¶7770461: announces the inception of the SECOND (philosophical) stage; **His first major work written in Persian**.
- **CHARACTERIZATION (Saiedi ¶7770461):** *"…sometimes also called **Ṣaḥífiy-i-Uṣúl-i-‘Adlíyyih**, on the fundamental or root principles of religion… the first major work that the Báb wrote in Persian."* (GPB does not separately characterize.)
- **significance:** Doctrinal treatise on the uṣúl (root principles); landmark as His first major Persian-language revelation — opening His teaching to a wider Persian audience.
- **aliases / SCRIPT:** Ṣaḥífiy-i-‘Adlíyyih · Ṣaḥífiy-i-Uṣúl-i-‘Adlíyyih · Risáliy-i-‘Adlíyyih · Epistle of Justice · **صحیفه عدلیه** (VERIFIED — OoL /fa/ #14 "صحیفه عدلیه" = Risáliy-i-‘Adlíyyih; Phelps BB00017). Opening (Phelps, verified Persian script): *بسم الله الرحمن الرحیم. حمد و سپاس وصف جمال ذاتی است که لم یزل بوده…*
- **DUMP:** dump **"[2] Risáliy-i-‘Adlíyyih" (line 1641)** → THIS entity. (Hard Case C now RESOLVED via BB00017.)
- **links:** opens stage 2; sibling/contrast → Furú‘-i-‘Adlíyyih (branches).
- **text_in_corpus: yes** — `source_doc_ids: [20169 "Risáliy-i-'Adlíyyih" (the Báb)]`.
- **traps:** ⚠ ROOT principles only; ≠ Furú‘-i-‘Adlíyyih (branches). ⚠ "‘Adlíyyih"/"‘Adlíyya"/"‘Adliyyih" spelling variants all = this work.

## §7. Commentary on the Súrih of Kawthar  ★ won Vaḥíd ★
- **canonical:** Commentary on the Súrih of Kawthar (Tafsír-i-Súriy-i-Kawthar) · **type: work** · author: the Báb
- **identity:** CONFIRMED distinct commentary; occasion = the conversion of Vaḥíd.
- **TIMELINE — clean anchor:** **~May 1846, Shíráz** (final months of the Shíráz period, after the return from Mecca). Phelps **BB00007** "time period: 2. Second Stage (January 1846 – April 1847)" — 49,500 words, Arabic. Saiedi 8632 ¶7770463: written when Vaḥíd met the Báb (Jumádi'l-Avval 1262 = Apr 27 – May 27, 1846).
- **CHARACTERIZATION (Saiedi ¶7770463):** *"This long work interprets the Qur'ánic Súrah of Abundance through various levels of meaning."* (GPB does not separately characterize.)
- **significance:** The work that **won over Vaḥíd** (Siyyid Yaḥyáy-i-Dárábí) — the most eminent of the Báb's learned converts. The Sháh's envoy sent to investigate requested it; its power converted the investigator into the disciple. (Kawthar = "Abundance," Qur'án 108.)
- **aliases / SCRIPT:** Tafsír-i-Súriy-i-Kawthar · Tafsir-i-Suratu'l-Kawthar · Commentary on the Súrah of Abundance · **تفسير سوره كوثر** (VERIFIED — OoL /fa/ #6; Phelps BB00007 title "Tafsir-i-Suratu'l-Kawthar").
- **DUMP:** dump **"[3] Commentary on the Súrih of Kawṯhar" (line 1551).**
- **links:** recipient/occasion → **Vaḥíd (Siyyid Yaḥyáy-i-Dárábí)** — the RECIPIENT, not the subject; the Sháh's investigative mission. Place → Shíráz.
- **text_in_corpus: yes** — `source_doc_ids: [20171 "Tafsír-i-Súriy-i-Kawthar" (the Báb), 15102 "Tafsir Surat al-Kawthar (Commentary on the Sura of Kawthar)" (the Báb)]`.
- **traps:** ⚠ Vaḥíd is the recipient/occasion. ⚠ Kawthar = súrih title, not generic metaphor.

## §8. Commentary on the Súrih of Va'l-‘Aṣr
- **canonical:** Commentary on the Súrih of Va'l-‘Aṣr (Tafsír-i-Súriy-i-Va'l-‘Aṣr) · **type: work** · author: the Báb
- **identity:** CONFIRMED distinct single-night commentary; occasion = the Imám-Jum‘ih of Iṣfahán.
- **TIMELINE:** **October–November 1846, Iṣfahán — written in a single night**, in honour of the **Imám-Jum‘ih of Iṣfahán** (Mír Siyyid Muḥammad, the Báb's host). Saiedi 8632 ¶7770466; OoL "Stage 2 (Jan 1846 – Apr 1847)," ~22,000 words.
- **CHARACTERIZATION (Saiedi ¶7770466):** discusses *"how to recognize spiritual truth, the nature of the human being, the meaning of faith, the nature of good deeds, and the preconditions of spiritual journey."* (GPB does not separately characterize.)
- **significance:** A celebrated single-night revelation that astonished the Iṣfahán divines and helped win the Imám-Jum‘ih's protection during the Báb's sojourn under Manúchihr Khán. (Va'l-‘Aṣr = "By the Afternoon/Time," Qur'án 103.)
- **aliases / SCRIPT:** Tafsír-i-Súriy-i-Va'l-‘Aṣr · Tafsír-i-Súriy-i-‘Aṣr · Commentary on the Súrah of the Afternoon · **تفسير سوره و العصر** (VERIFIED — OoL /fa/ #7).
- **DUMP:** dump **"[2] Commentary on the Súrih of Va'l-‘Aṣr" (line 1615).**
- **links:** recipient → **Imám-Jum‘ih of Iṣfahán (Mír Siyyid Muḥammad)**; protector-context → Manúchihr Khán the Mu‘tamidu'd-Dawlih. Place → Iṣfahán (House of the Imám-Jum‘ih).
- **text_in_corpus: yes** — `source_doc_ids: [20375 "Tafsír-i-Súriy-i-'Aṣr" (the Báb)]`.

## §9. Khaṣá'il-i-Sab‘ih (the Seven QUALIFICATIONS / Directives)
- **canonical:** Khaṣá'il-i-Sab‘ih · **type: work** · author: the Báb
- **identity:** CONFIRMED distinct directive epistle. ⚠ NOT Dalá'il-i-Sab‘ih (§4). The firewall: Seven *Directives/Qualifications* (ordinances, FIRST stage) vs. Seven *Proofs* (apologetic, THIRD/legislative stage).
- **TIMELINE:** **First Stage (to January 1846)** — Phelps **BB00562** "time period: 1. First Stage (To January 1846)" — 140 words, Arabic. Written before/around the pilgrimage.
- **CHARACTERIZATION (Phelps BB00562, in corpus — VERIFIED):** title *"Khasa'il-i Sab'ih (Treatise of the Seven Directives)"*; opening (verified Arabic): *الامر الاول من الشعائر السبعة هو حمل الدائرة المنیعة المبارکة و الثانی منها ترک الغلیان* — English: *"The first command of the seven religious practices is to carry the blessed, protective circle. The second of them is [to abstain from the water-pipe]…"*
- **significance:** A short directive epistle laying down **seven ordinances/observances** for the believers — among the Báb's earliest legislative gestures.
- **aliases / SCRIPT:** Khaṣá'il-i-Sab‘ih · Sha‘á'ir-i-Sab‘ih · Treatise of the Seven Directives · the Seven Qualifications · **خصائل سبعه (شعائر سبعه)** (VERIFIED — OoL /fa/ #22 + Phelps BB00562 opening which uses الشعائر السبعة).
- **DUMP:** dump **"[2] Ḵhaṣá'il-i-Sab‘ih" (line 1610).**
- **text_in_corpus: yes** — `source_doc_ids: [5783 "Khaṣá'il-i-Sab'ih" (the Báb), 16142 "Laws Preceding the Bayán, The Seven Qualifications (al-Khaṣá'il al-Sab'ih)" (the Báb)]`.
- **traps:** ⚠ ≠ Dalá'il-i-Sab‘ih (§4). The single most likely merge-error in this cohort.
- **flag (Hard Case F):** the widely-cited detail that one ordinance modified the call to prayer (adhán) is NOT verbatim in the in-corpus loci (GPB/DB/Saiedi/Balyuzi/Phelps opening) — the verified opening lists "carry the blessed circle" + "abstain from the water-pipe" as #1–2. Capture the seven-directives core as VERIFIED; the adhán specific remains "likely" pending a primary citation.

## §10. Kitáb-i-Panj-Sha'n (the Book of Five Modes) ★ His LAST major work ★
- **canonical:** Kitáb-i-Panj-Sha'n · **type: work** · author: the Báb
- **identity:** CONFIRMED — one of His last works; encloses Lawḥ-i-Hurúfát as a chapter (§part-of).
- **TIMELINE — anchor:** **first days of spring (Naw-Rúz) 1850, Chihríq — His final year, 3–4 months before His martyrdom** (9 July 1850). Phelps **BB00005** "time period: 3. Third Stage" — 98,000 words, Arabic and Persian (mixed). GPB ¶21055555: *"In the Kitáb-i-Panj-Sha'n, **one of His last works**, He had alluded to the fact that the sixth Naw-Rúz after the declaration of His mission would be the last He was destined to celebrate on earth."* Saiedi ¶7770475 confirms spring 1850.
- **CHARACTERIZATION (Saiedi ¶7770475):** nineteen chapters, each on a name of God / one of the first nineteen days of the year / one of the nineteen figures of the Bábí Primal Unity; each chapter written in honour of a Bábí and independently nameable. *"The Tablet of Hurúfát, or Tablet of Nineteen Temples, is one of these chapters."*
- **significance:** GPB-attested **one of His last works**, containing His veiled prophecy of His imminent martyrdom. Title = "Five Modes (Sha'n) of Revelation" — each name of God expounded through five modes (verses, prayers, sermons/commentaries, rational discourse, Persian).
- **aliases / SCRIPT:** Panj Sha'n · the Book of the Five Modes (of Revelation) · **كتاب پنچ شان** (VERIFIED — OoL /fa/ #12; Phelps BB00005 title "Panj Sha'n (Book of the Five Modes)"). Opening (Phelps, verified script): *بسم الله الائ…*
- **DUMP:** dump **"[1] Kitáb-i-Panj-Sha'n" (line 1832).** ⚠ The **Lawḥ-i-Hurúfát** (dump line 1792) is a CHAPTER of Panj-Sha'n — relate as sub-work (part-of), do not silently absorb.
- **links:** part-of (contains) → **Lawḥ-i-Hurúfát** (§long-tail); each chapter honours a Bábí (→ nineteen figures of the Primal Unity); sibling-in-structure → **Kitábu'l-Asmá'** (modes-of-revelation scheme). Place → Chihríq.
- **text_in_corpus: yes** — `source_doc_ids: [16719 "Kitáb-i-Panj Sha'n" (the Báb)]`. Study: 1775/254590 Walbridge "Kitab-i-Panj Sha'n", 215002 Rabbani notes.
- **traps:** ⚠ "one of His last works" (GPB), not necessarily the single last.

---

## SUPPORTING / LONG-TAIL WORKS OF THE BÁB (light records, with corpus-text links)

- **Kitábu'l-Asmá' (the Book of Divine Names / Kitáb-i-Asmá')** · work · Chihríq, 1848–50 (Third stage; Saiedi ¶7770433/7770502). OoL /fa/ #8 **کتاب الاسماء (چهار شان)**. Vast; each name of God treated through the modes; sibling-in-structure to Panj-Sha'n. **text_in_corpus: partial/related** — `source_doc_ids: [6341 "Al-'Alíyyu'l-Aẓhar'il-A'lá", 5908 "Al-Váḥid al-Avval"]` are Names-book material; a single full "Kitábu'l-Asmá'" doc not cleanly isolated — flag light.

- **Tafsír-i-Nubuvvat-i-Kháṣṣih (Commentary on Muḥammad's Specific Mission)** · **work** (re-typed from dump's `concept`) · **Iṣfahán, late 1846** — written for **Manúchihr Khán the Mu‘tamidu'd-Dawlih** at his request (Balyuzi 466: *"He now asked the Báb for a treatise on 'Nubuvvat-i-Kháṣṣih'… the Báb wrote instantly…"*). OoL /en/ #20, /fa/ #20 **تفسير نبوت خاصه**. dump line 1761 ("Nubuvvat-i-Kháṣṣih" as concept). **text_in_corpus: yes** — `source_doc_ids: [20172 "Risálih fí Ithbát-i-Nubuvvat-i-Kháṣṣih" (the Báb)]`. (Hard Case E resolved: the WORK exists as doc 20172; "the specific prophethood of Muḥammad" is the separate concept.)

- **Risáliy-i-Furú‘-i-‘Adlíyyih (Epistle of Justice: BRANCHES)** · work · early 1846, Second stage (Saiedi ¶7770462; Phelps **BB00039** "time period: 2. Second Stage," 5,500 words, Arabic; title "Risala Furu' al-'Adliyya (Epistle of Justice: Branches)"). OoL /fa/ #21 **رساله فروع عدليه**. dump line 1765. **DISTINCT** from §6's root-principles ‘Adlíyyih. **text_in_corpus: mentioned-only** in the BB inventory; no isolated full-text doc found under "Furú‘" — flag.

- **Lawḥ-i-Hurúfát (Tablet of the Letters / Nineteen Temples)** · work · spring 1850 — **a chapter of Panj-Sha'n** (Saiedi ¶7770475; MacEoin "Tablet of Nineteen Temples"). OoL /fa/ #19 **لوح حروفات**. dump line 1792. Model as **part-of → Kitáb-i-Panj-Sha'n** (§10). **text_in_corpus: yes** — `source_doc_ids: [20168 "Lawḥ-i-Ḥurúfát" (the Báb)]`.

- **Kitábu'r-Rúḥ (Book of the Spirit)** · work · **at sea on the return from Mecca, early 1845** (Saiedi ¶7770454) — ~700 short súrihs; the Báb identifies Himself with Jesus/the Holy Spirit. OoL /fa/ #17 **كتاب روح**. **text_in_corpus: yes** — `source_doc_ids: [6344 "Kitábu'r-Rúḥ" (the Báb)]`.

- **Ṣaḥífih-i-Ja‘faríyyih** (= Sharḥ-i-Du‘á'-i-Ghaybat) · work · early-mid Jan 1846, last work of First stage (Saiedi ¶7770460). OoL /fa/ #10 **شرح دعای غیبت (صحيفه جعفريه)**. **text_in_corpus: yes** — `source_doc_ids: [20368 "Ṣaḥífiy-i-Ja'faríyyih" (the Báb)]`.

- **Ṣaḥífih-i-Raḍavíyyih** · work · 14 sermons, many written on the Mecca journey (Saiedi ¶7770459); its first chapter = the **Khuṭbiy-i-Dhikríyyih** (the Báb's own catalog of His works). OoL /fa/ #13 **خطبه رضويه (خطبه ذكريه)**. **text_in_corpus: yes** — `source_doc_ids: [20362 "Ṣaḥífiy-i-Raḍavíyyih" (the Báb)]`.

- **Ṣaḥífiy-i-Makhzúmíyyih** · work · early period. OoL /fa/ #9 **صحیفه مخزومیه**. **text_in_corpus: yes** — `source_doc_ids: [20389 "Ṣaḥífiy-i-Makhzúmíyyih" (the Báb)]`.

- **Zíyárat-i-Sháh-‘Abdu'l-‘Aẓím** · work (visitation tablet) · OoL /fa/ #11 **زيارت شاه عبدالعظيم**. **text_in_corpus: yes** — `source_doc_ids: [6345 "Zíyárat-i-Sháh-'Abdu'l-'Aẓím" (the Báb)]`.

- **Risáliy-i-Dhahabíyyih (Golden Epistle)** · work · OoL /fa/ #16 **رساله ذهبیه**. **text_in_corpus: yes** — `source_doc_ids: [20376 "Risáliy-i-Dhahabíyyih" (the Báb), 16720 "Excerpts from the Risáliy-i-Dhahabiyyih"]`.

- **Súriy-i-Tawḥíd (Commentary on the Súrih of Monotheism)** · work · OoL /fa/ #18 **تفسير سوره توحيد**. ⚠ DIFFERENT author from Quddús's Ṣád-of-Ṣamad commentary (same súrih, Qur'án 112). **text_in_corpus: yes** — `source_doc_ids: [20363 "Tafsír-i-Súriy-i-Tawḥíd" (the Báb)]`.

- **Risáliy-i-Fiqhíyyih (Epistle of Jurisprudence)** · work · OoL /fa/ #15 **رساله فقهيه (قبل از بعثت)** (note "qabl az bi‘that" — pre-Declaration). **text_in_corpus: mentioned-only** (no isolated doc cleanly matched — flag).

- **Súratu'l-Mulk / Súrih of Mulk** · work · dump line 1715. **text_in_corpus: yes** — `source_doc_ids: [16306 "Súratu'l-Mulk" (the Báb)]`.

- **Tafsír-i-Súriy-i-Baqarah (Commentary on the Súrih of the Cow) = Kitáb al-Aḥmadiyya** · work · First-stage commentary on Qur'án 2 (al-Baqarah) — Phelps **BB00008**, 43,700 words, Arabic; verified opening *بسم الله الرحمن الرحیم. الم ذلک الکتاب لا ریب فیه هدی للمتقین…*. A substantial early Qur'án commentary (NOT in the dump's list — surfaced from the Phelps inventory). **text_in_corpus: yes** — `source_doc_ids: [5831 "Introduction to the Tafsír-i-Suratu'l-Baqara" (the Báb)]` (introduction present; full commentary likely partial — flag light).

- **Summary of the Kitáb-i-Asmá'** · work · Phelps **BB00016**, 13,700 words, Arabic; verified opening *بسم الله الامنع الاقدس. فاشهد ان فی ذلک الکتاب فی معرفة اسماء الله…* — a condensed recension of the Book of Names (see Kitábu'l-Asmá' above). **text_in_corpus: mentioned-only** (Phelps row; no isolated full-text doc cleanly matched).

- **Kitábu'z-Zíyárat / Visiting Tablets** (dump lines 1824–1825, 1834, 1844) · work · **text_in_corpus: yes** — `source_doc_ids: [16304 "Kitábu'l-Ziyárat" (the Báb); 1789/16722 "Tablet of Visitation for… Quddús"; 16165 "Tablet to the Báb's mother"]`.

- **Will and Testament (Lawḥ-i-Vaṣáyá)** · work · the Báb's testament naming Mírzá Yaḥyá nominally. **text_in_corpus: yes** — `source_doc_ids: [15357 / 16925 "Will and Testament", 12301 "Tablet of the Báb Lawh-i-Vasaya"]`.

- **Selections from the Writings of the Báb** (the authoritative English compilation, Shoghi Effendi tr.) · **text_in_corpus: yes** — `source_doc_ids: [8297, 20898]`. Best entry point to the Báb's corpus in English.

- OoL roster items #23–25: **Epistles to Muḥammad Sháh & Ḥájí Mírzá Áqásí** (توقيعات محمد شاه وحاجى ميرزا آغاسى) · **text_in_corpus: yes** — `source_doc_ids: [5793 "Epistle to Muḥammad Shah (from Chihriq)", 5806 "Letter to Muḥammad Shah"]`.

---

## CROSS-CUTTING NOTES
1. **GPB characterizes only the top tier** with authoritative weight: Qayyúmu'l-Asmá' ("first, greatest, mightiest"), Persian Bayán ("peerless"), Arabic Bayán ("smaller and less weighty"), Dalá'il-i-Sab‘ih ("most important of the polemical works"), Kitáb-i-Panj-Sha'n ("one of His last works"). For the rest, **Saiedi *Gate of the Heart* (8632)** is the academic authority and supplies the precise dates; the **Phelps inventory (doc 8746 / BB### rows)** supplies word-count, stage, and VERIFIED script.
2. **TIMELINE arc (single chronology, now stage-confirmed by Phelps):**
   - Qayyúmu'l-Asmá' (Declaration night, 22–23 May 1844, Shíráz) — Stage 1
   - Kitábu'r-Rúḥ + Ṣaḥífih bayna'l-Ḥaramayn (pilgrimage, 1844–45) — Stage 1 [BB00019 = Stage 1]
   - Ṣaḥífih-i-Ja‘faríyyih (Jan 1846, last of Stage 1) → **Ṣaḥífih-i-‘Adlíyyih** (late Jan 1846, opens Stage 2; BB00017 = Stage 2) → Furú‘-i-‘Adlíyyih (early 1846, BB00039 = Stage 2)
   - Kawthar commentary (~May 1846, Shíráz, won Vaḥíd; BB00007 = Stage 2) → Va'l-‘Aṣr commentary (Oct–Nov 1846, Iṣfahán, one night)
   - Persian & Arabic Bayán + Dalá'il-i-Sab‘ih (Máh-Kú/Chihríq, 1847–48; BB00001/BB00020/BB00015 = Stage 3)
   - Kitábu'l-Asmá' + Kitáb-i-Panj-Sha'n (Chihríq, 1849–50, His last works; BB00005 = Stage 3)
   - ⚠ Khaṣá'il-i-Sab‘ih = Stage 1 (BB00562), NOT late — opposite end of the timeline from the similarly-named Dalá'il-i-Sab‘ih (Stage 3).
3. **Persian↔Arabic genitive equivalence:** Tafsír-i-Súriy-i-Kawthar = Tafsir-i-Suratu'l-Kawthar; Ṣaḥífiy-i-‘Adlíyyih = Ṣaḥífih-i-‘Adlíyyih = Risáliy-i-‘Adlíyyih; "Kitáb bayn al-Ḥaramayn" = Ṣaḥífih bayna'l-Ḥaramayn; Tafsír-i-Súriy-i-‘Aṣr = Tafsír-i-Súriy-i-Va'l-‘Aṣr.
4. **Two "Sab‘ih" works — the firewall:** Dalá'il-i-Sab‘ih (Seven PROOFS, apologetic, Stage 3, BB00015) ≠ Khaṣá'il-i-Sab‘ih (Seven QUALIFICATIONS/Directives, ordinances, Stage 1, BB00562).
5. **Script forms = VERIFIED (upgraded from "likely").** This pass pulled real glyphs from the in-corpus Phelps `original title` / `opening,original` fields (Arabic/Persian script IS present in those inventory rows) and cross-checked the OoL /fa/ table. Both agree for every major work → confidence **verified**. (The general corpus content rows remain English/translit only; the inventory rows are the exception that carries script.)
6. **⭐ Work→document link (NEW):** the corpus is not merely a set of histories *about* the Báb — it holds His **actual full texts** as documents authored by "The Báb" (≈200 docs). Every major work above is now tied to its real searchable text via `source_doc_ids`. The master English compilation is **Selections from the Writings of the Báb** (8297 / 20898).

---

## ⚠ HARD CASES / FLAGS LIST

- **A. "the Bayán" (dump line 1469) is a FIVE-WAY polysemy bucket** — split into: (1) Persian Bayán [work, BB00001], (2) Arabic Bayán [work, BB00020], (3) Revelation of the Báb [concept], (4) people/community of the Bayán = the Bábís [concept/community], (5) generic "utterance/exposition" [not an entity]. Recommend: keep "the Bayán" WORK = Persian Bayán by default; create separate concept entities for senses 3–4. **Needs human ruling** on work/concept modeling.

- **B. "Commentary on the Ṣád of Ṣamad" (dump line 1524) is NOT the Báb's — it is QUDDÚS's** (composed during the siege of Shaykh Ṭabarsí; commentary on the letter "Ṣád" of "Ṣamad," Súrih Tawḥíd / Qur'án 112). File under WORKS-BY-OTHER-BÁBÍS, NOT the Báb. ⚠ Distinct from the Báb's own **Súriy-i-Tawḥíd / Tafsír-i-Súriy-i-Tawḥíd** (corpus doc 20363) — same súrih, different author. **Flag for authorship confirmation.**

- **C. Ṣaḥífih-i-‘Adlíyyih ≡ Risáliy-i-‘Adlíyyih — RESOLVED (merge).** The Phelps inventory itself equates them: BB00017 title = *"Sahifiy-i-'Adliyya = Risaliy-i-'Adliyyih (Epistle of Justice: Root Principles)."* Merge into ONE entity (§6). Keep **Risáliy-i-Furú‘-i-‘Adlíyyih** (branches, BB00039) SEPARATE. No longer open — verified in-corpus.

- **D. Lawḥ-i-Hurúfát (dump line 1792) — RESOLVED (part-of).** Saiedi ¶7770475: "one of these chapters" of Panj-Sha'n, also nameable as "Tablet of Nineteen Temples." Model as **part-of → Kitáb-i-Panj-Sha'n** (§10), not fully independent nor merged. Its full text is corpus doc **20168**.

- **E. Tafsír-i-Nubuvvat-i-Kháṣṣih (dump line 1761) is MIS-TYPED — RESOLVED (re-type to work).** Balyuzi 466 + OoL #20 + corpus doc **20172** ("Risálih fí Ithbát-i-Nubuvvat-i-Kháṣṣih," the Báb) confirm it is a **treatise/work** written for Manúchihr Khán in Iṣfahán. Re-type from `concept` → `work`. The doctrine "the specific prophethood of Muḥammad" remains a separate `concept` entity (→ possibly two linked entities).

- **F. Khaṣá'il-i-Sab‘ih and the adhán claim — PARTIALLY RESOLVED.** Seven directives core VERIFIED via Phelps BB00562 (verified Arabic opening: #1 "carry the blessed protective circle," #2 "abstain from the water-pipe"). The widely-cited claim that one ordinance modified the call to prayer (adhán) is NOT in any in-corpus locus scanned — capture as **"likely," pending a primary citation.**

- **G. "Kitáb-i-Aqdas" (dump line 1759) under the Báb is a MIS-ATTRIBUTION.** The Kitáb-i-Aqdas is Bahá'u'lláh's (~1873, ‘Akká). Do NOT file under the Báb. The Báb's analogous "most holy book" is the **Persian Bayán.** If the dump grouped it here, it is a passing reference / NER error.

- **H. NEW — Súriy-i-Tawḥíd vs. Ṣád-of-Ṣamad collision** (see B). Both are on Súrih of Unity (Qur'án 112). The Báb's = corpus doc 20363; Quddús's "Ṣád of Ṣamad" is a different author's work. Keep apart; do not let a `%Tawḥíd%` / `%Ṣamad%` match merge them.

- **I. NEW — long-tail texts with NO clean isolated full-text doc:** **Kitábu'l-Asmá'** (only Names-book fragments 6341/5908 found, not a single consolidated doc), **Risáliy-i-Furú‘-i-‘Adlíyyih** (inventory BB00039 only, no isolated text doc), **Risáliy-i-Fiqhíyyih** (no clean match). Flagged `mentioned-only`/`partial` — re-search with consonant-skeleton if a full-text link is required.

- **J. NEW — Phelps BB00003 (Qayyúmu'l-Asmá' expected slot) returned empty in-corpus.** Qayyúmu'l-Asmá' is NOT cleanly carried as a `BB00###` best-known inventory row in the current corpus (BB00001/2 = the two Bayáns; the Qayyúm row may be a higher/other number or absent). Its VERIFIED script comes from the OoL /fa/ #3 (تفسير سوره يوسف / قيوم الأسماء); its full text is corpus doc **20170**. Script confidence: verified-OoL (not yet Phelps-cross-checked) — minor flag.
