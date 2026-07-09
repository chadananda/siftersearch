# Flag-K Resolution — Untitled / Arabic-script-only Báb Tablets → corpus doc_id

Resolves the 10 OceanLibrary Core-Tablet files that `bab-works-catalog.md` (Part E,
flag-K) could NOT pin by **title** (their bodies are Arabic/Persian script; their
"titles" are AI summaries or bare archive codes like INBA-098 / JAPA-042 / MISC / PRIN / PRV).

Method: incipit (opening line) + archive-code agreement, NOT English title. Corpus-first.

**Result: 10 / 10 RESOLVED.** Triple agreement on every file:
1. **Incipit → first paragraph** — each OL file's opening line matched a Báb-authored
   corpus doc's `content` at `paragraph_index = 0` (the doc's first paragraph).
2. **Archive code → corpus `docs.file_path`** — the matched corpus doc's `file_path` is
   the *exact same* OL file (`…/The Báb/<OL#>-<CODE>.md`). The corpus ingested these very files.
3. **Transliterated Basmala title** — the corpus titled each doc by its (transliterated)
   opening Basmala, which independently corroborates several incipits (152, 156, 158 below).

> The corpus stores these docs under generic Basmala titles (`Bismi'lláhi'r-Raḥmáni'r-Raḥím`),
> which is exactly why a title-string match failed in the original catalog pass. The Arabic
> script IS searchable in `content.text` — script `LIKE` on a distinctive phrase works.

---

## Resolved matches

| OL file | resolved doc_id | match idx | clinched by | matched incipit (after Basmala) |
|---|---|---|---|---|
| 151-INBA-098 | **5852** | 0 | incipit + file_path | `الحمد لله الذي جعل طراز الاستنطاق في الواح كتاب الافتراق` |
| 152-INBA-098 | **4642** | 0 | incipit + file_path + title | `الحمد لله الذي تعالى بذاتية ذاتيته عن وصف المجردات وكنهها` |
| 156-INBA-098 | **5876** | 0 | incipit + file_path + title | `اسبح سبحان الذي لا يعلم جوهر وجود كيف هو ولا مجرد وجود اين هو` |
| 158-JAPA-042 | **8559** | 0 | incipit + file_path + title | `الحمد لله الذي لا اله الا هو الافرد الافرد` (Basmala `بسم الله الافرد الافرد`) |
| 164-MISC-002 | **5863** | 0 | incipit + file_path | `الحمد لله الذي قد تعالى بعلو كبريائيته عن علو اعلى جوهر المجردات` |
| 176-PRIN-14 | **5808** | 0 | incipit + file_path | `اللهم اني اشهدك بشهادتك لنفسك انك انت الله لا اله الا انت وحدك لا شريك لك` |
| 181-PRV-02 | **3923** | 0 | incipit + file_path | `الحمد لله الذي نزل الكتاب بالحق هدى وذكرى للخاشعين` |
| 188-PRV-10 | **5838** | 0 | incipit + file_path | `المرا ذلك الكتاب ذكر من الله في حكم عبد بديع` |
| 191-PRV-13 | **5911** | 0 | incipit + file_path | (fa) `و بتحقیق که فرض نموده است خداوند بر مردمان بیش از نماز بعضی از احکام را` |
| 192-PRV-6007 | **3914** | 0 | incipit + file_path | `سبحان الذي بيده ملكوت السموات والارض لا اله الا هو الواحد المتكبر الاحد` |

All 10 corpus docs: `author = "The Báb"`. Corpus titles are the transliterated Basmala
of each (e.g. 5876 = `Bismi'lláhi'l-'Alíyyi'l-'Aẓím`, matching its `بسم الله العلي العظيم`
opening; 4642 = `Bismi'r-Raḥmáni'r-Raḥím`, matching its `بسم الرحمن الرحيم` — no "Alláh";
8559 = `Bismi'lláhi'l-Afrad'il-Afrad`, matching `بسم الله الافرد الافرد`).

## unmatched
None.

## Method notes / gotchas
- **What clinched it:** the archive-code → `file_path` cross-check was decisive and made
  every match a 1:1 certainty — the corpus had ingested the identical OL files
  (`Baha'i/Core Tablets/The Báb/<OL#>-<CODE>.md`). The incipit→paragraph_index-0 hit was
  obtained FIRST (corpus-first, title-independent) and the file_path agreement confirmed it.
- **158-JAPA-042** needed a second phrase: the first-pass fragment failed (Arabic/Persian
  line-break/spacing variance around `علی`), but the distinctive doubled `الافرد الافرد`
  matched cleanly at index 0 → doc 8559.
- **192-PRV-6007** false positives: the phrase `بيده ملكوت السموات والارض` also appears
  mid-text in docs 3934 ("Compilation from Point of Bayán") and 20168 ("Lawḥ-i-Ḥurúfát")
  at non-zero paragraph indices — those are quotations, not the work. The real match is
  3914 at `paragraph_index = 0`.
- Phelps inventory (doc 8746) incipit field was NOT needed — the corpus first-paragraph
  match alone resolved all 10.

## catalog_ids fragments for the entity records
```
151-INBA-098: {phelps: —, inba: "INBA-098", oceanlibrary: "151-INBA-098", doc_id: 5852}
152-INBA-098: {phelps: —, inba: "INBA-098", oceanlibrary: "152-INBA-098", doc_id: 4642}
156-INBA-098: {phelps: —, inba: "INBA-098", oceanlibrary: "156-INBA-098", doc_id: 5876}
158-JAPA-042: {phelps: —, inba: "JAPA-042", oceanlibrary: "158-JAPA-042", doc_id: 8559}
164-MISC-002: {phelps: —, inba: "MISC-002", oceanlibrary: "164-MISC-002", doc_id: 5863}
176-PRIN-14:  {phelps: —, inba: "PRIN-14",  oceanlibrary: "176-PRIN-14",  doc_id: 5808}
181-PRV-02:   {phelps: —, inba: "PRV-02",   oceanlibrary: "181-PRV-02",   doc_id: 3923}
188-PRV-10:   {phelps: —, inba: "PRV-10",   oceanlibrary: "188-PRV-10",   doc_id: 5838}
191-PRV-13:   {phelps: —, inba: "PRV-13",   oceanlibrary: "191-PRV-13",   doc_id: 5911}
192-PRV-6007: {phelps: —, inba: "PRV-6007", oceanlibrary: "192-PRV-6007", doc_id: 3914}
```
