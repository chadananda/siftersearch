# Question survey for an interfaith library (2026-11-02)

The questions people type about religion: grouped into families, with real wordings and where each was seen.
It is the basis for HyPE extraction (`api/lib/rag/enrich/retrieval.js`, now `hype-v15-seeker`) and for the search test battery,
which until now was the 32 Keyword Planner queries in `tests/quality/seeker-battery.json`.

Data: `planning/question-survey-interfaith-20261102.json` (125 families, 7,130 wordings).
Build scripts (gitignored): `.work/survey/autocomplete.py`, `.work/survey/build.py`, `.work/survey/gen-md.py`.

## Summary

* **125 families, 7,130 wordings.** 5,920 were seen somewhere:
  4,793 from Google autocomplete and 1,127 from web pages.
  The other 1,210 were written by us; they have `source_url: null` and `via: "invented"`.
* **Every tradition in the corpus has its own families.** There are 11 traditions, and each has at least 367 seen wordings
  (table below). The corpus's 12th "religion" value, `collection-08`, is a collection label, not a tradition.
* **Comparative questions:** 27 families (`scope: "cross"`) with 999 wordings,
  683 of them seen. Each wording lists every tradition it names, so each side can be scored separately.
* **The evidence gives rank, never volume.** Autocomplete shows that people type a phrase, and in what order Google ranks it,
  but not how many people type it. No source we could reach gave query counts, so no counts appear here.
  The `relative_frequency` (high/medium/low) on each family is a judgment. It is supported by the evidence string next to it
  and by the type mix from our own logs.

## Method

1. **Corpus first.** `node scripts/corpus-status.mjs` (production, 11-02) reports 205,170 documents and 9.67 M paragraphs.
   Labelled by religion: Bahá'í 67,765, Judaism 1,352, Buddhist 859, Islam 489, Christian 243, Hindu 126,
   Zoroastrian 123, Tao 96, Confucian 65, Sikh 34, Jain 28. The Bahá'í count dominates, so the survey sets an equal floor
   for every tradition instead of following corpus size.
2. **Web research.** Seven parallel research agents worked in two rounds, one per area: universal, Bahá'í + Zoroastrian,
   Islam + Judaism, Christianity + Hinduism, Buddhism + Jain + Sikh, Taoism + Confucianism, and cross/meta.
   They collected wordings from FAQ pages, "top questions" lists, Q&A and fatwa sites, quote-checking sites,
   search-result titles and snippets, and Pew/RELEVANT survey items. Each wording keeps the URL where it was seen.
3. **Google autocomplete harvest.** We sent 618 seed stems to
   `https://suggestqueries.google.com/complete/search?client=firefox&hl=<lang>&q=<seed>` and got 4,970 suggestions back.
   Each seed is a question stem crossed with a tradition's name, its adherents, its scriptures and its central figures,
   for example "do jains believe in", "what does the tao te ching say about", "did guru nanak say". There are also
   cross and universal stems ("do all religions", "bible vs quran", "sanskrit word for") and native-script stems
   in fa, ar, he, zh, hi, pa and fr. These are typed queries, in Google's rank order.
   We removed noise in three steps: a subject-word check (the suggestion must still name the seed's subject),
   a religion-keyword check on universal stems, and a blacklist (films, ringtones, "bahia", pronunciation). 4,694 remained.
4. **Consolidation** (`build.py`). Every fragment family was mapped to one final family, wordings were deduplicated
   by normalised text, and each wording was tagged `via` = web | google_autocomplete | invented.
   Wordings outside a tradition family carry their own `traditions`, detected from the names they contain.
5. **Spot check.** We fetched 25 randomly chosen web source URLs. 19 returned 200. 3 returned 403, which are bot blocks
   (brainbound.blog, herenow4u.net, calendar-uk.co.uk). 1 Reddit mirror returned 502, and 1 returned 404
   (a chinesenotes.com word page).

### Evidence quality

* **Autocomplete** gives real typed queries and their rank (1 to 10), but no volume. The results are biased toward the
  US and English, because the default region is the US.
  Rank 1 to 3 is the best available stand-in for "most typed". The JSON keeps `rank` on every autocomplete wording.
* **Web wordings** are often page titles, FAQ headings or search snippets, not queries someone typed.
  A few are lightly paraphrased. Two lists come with numbers: the AboutIslam top-fatwa list, with view counts,
  and Pew's percentage findings. Neither measures search volume.
* **Sources we could not use.** Reddit was blocked, except through mirrors and snippets, and Quora was never reachable.
  The WebSearch `site:` operator was ignored. truthstory, the GotQuestions top-20 and the Pew SBNR page returned 404.
  Two agents ran out of their search budget (Bahá'í/Zoroastrian and Buddhism/Jain/Sikh), so autocomplete carried
  more of the load there.
* **Native scripts.** The non-English wordings are mostly autocomplete results or page titles. The research agents
  composed some Chinese and Hindi wordings; those are marked invented.

## Counts per tradition

"Seen" means the wording has a `source_url`, from either autocomplete or the web.
Each tradition column cell is seen/total for that tradition's own family. A `-` means that tradition has no society family.

| tradition | beliefs | practice | society | history | scripture/quotes | original terms | all wordings | seen | web | autocomplete | invented | comparative (seen) | non-English |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bahai | 134/152 | 119/128 | 26/30 | 37/45 | 35/46 | 75/95 | 755 | 573 | 141 | 432 | 182 | 185 (92) | 92 |
| judaism | 96/96 | 124/124 | 17/17 | 46/46 | 130/130 | 52/52 | 715 | 624 | 102 | 522 | 91 | 177 (108) | 31 |
| buddhism | 110/132 | 100/115 | - | 36/43 | 66/75 | 41/50 | 704 | 560 | 173 | 387 | 144 | 235 (168) | 9 |
| islam | 110/110 | 168/168 | 34/34 | 45/45 | 88/88 | 87/87 | 957 | 786 | 169 | 617 | 171 | 324 (186) | 76 |
| christianity | 132/157 | 123/156 | - | 59/83 | 125/133 | 28/40 | 1113 | 839 | 291 | 548 | 274 | 380 (231) | 0 |
| hinduism | 127/154 | 102/129 | 12/20 | 61/70 | 108/118 | 54/73 | 902 | 698 | 211 | 487 | 204 | 258 (171) | 32 |
| zoroastrianism | 96/101 | 84/92 | 14/21 | 39/47 | 35/44 | 54/68 | 489 | 417 | 73 | 344 | 72 | 68 (50) | 36 |
| taoism | 132/137 | 90/111 | - | 61/71 | 89/108 | 31/41 | 618 | 536 | 128 | 408 | 82 | 88 (78) | 42 |
| confucianism | 116/131 | 40/40 | - | 43/53 | 73/88 | 32/44 | 468 | 405 | 108 | 297 | 63 | 65 (56) | 46 |
| sikhism | 110/114 | 98/104 | - | 38/46 | 89/98 | 37/46 | 525 | 475 | 59 | 416 | 50 | 67 (56) | 14 |
| jainism | 87/94 | 103/112 | - | 39/45 | 29/29 | 23/31 | 410 | 367 | 59 | 308 | 43 | 66 (54) | 9 |

### Where the real evidence is thin

* **Jainism, Sikhism, Zoroastrianism.** Each has only 59 to 73 web wordings, so autocomplete supplies most of the depth.
  Jain scripture/quote questions (29) are few because few people search for Jain texts by name.
* **Confucianism practice** has only 40 wordings. Confucian questions are mostly "is it a religion", "what did Confucius say",
  and filial piety; very few are about practice.
* **Christianity has no native-script wordings.** Greek, Latin and Syriac seekers do not search like that.
  Its term questions take the form "greek word for X", which sits under `orig_word_meaning`.
  Hebrew has 31 wordings, Punjabi 14 and French 9, so all three are thin.
* **The universal, practical and social families are mostly invented.** These are the families the corpus answers best.
  The reason is that generic stems ("is it a sin to", "how to pray") return mainly Christian and secular suggestions,
  which the religion-keyword filter then drops. The weakest families are meditation, faith and doubt, divorce,
  war and poverty, and holidays.
* **Some comparative families have little or no seen evidence.**
  `compare_eschatology_messiah` has none seen, and `compare_soul` and `compare_gender_social` have 2 each.
  People do type "X vs Y" (272 pair wordings in `compare_tradition_pairs`, 266 seen), but they seldom type a topic comparison in full.
* **Some source and meta families have no seen wordings:** `quote_verse_reference`, `orig_arabic_persian`,
  `scholar_history_of` and `meta_enumerate_define`. Our logs show these question types are real (exact_phrase 8%, enumerate 5%),
  but the web gave no wordings for them.

## Taxonomy

`scope`: tradition (one tradition), universal / practical / social (asked of religion generally),
cross (comparative), source, original_language, scholarly, meta. Each family below shows its frequency judgment,
its evidence, the HyPE flag, and up to 6 wordings exactly as typed. Seen wordings come first; ¹ = autocomplete, ² = web page, ³ = invented.
The full evidence string and every wording are in the JSON.


### tradition (60 families, 4,957 wordings)

**`bahai_beliefs`** (bahai). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Bahá'í Faith.  
Frequency: high. Evidence: qualitative: official FAQ ordering at gy.bahai.org lists these first; no volume data. HyPE: yes. 134/152 seen.  
"Do Bahai's believe in God?"²; "Is the Bahá'í Faith a religion?"²; "Who started the Bahá'í Faith?"²; "what is bahai faith"¹; "what is bahai religion"¹; "is bahai faith a cult"¹

**`bahai_practice`** (bahai). Rules and lived practice of the Bahá'í Faith: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: qualitative: FAQ pages and bahaiteachings titles. HyPE: yes. 119/128 seen.  
"What are the teachings on eating and drinking?"²; "What about drugs?"²; "What does the Bahá'í Faith say about marriage?"²; "bahai fasting rules"¹; "bahai religion rules"¹; "bahai prayers"¹

**`bahai_society`** (bahai). Community, conversion, membership, controversy and critique, social teachings of the Bahá'í Faith.  
Frequency: medium. Evidence: qualitative: official FAQ. HyPE: yes. 26/30 seen.  
"How do people join the Bahá'í Faith?"²; "How can I become a Baha'i?"²; "Do Baha'is have churches and clergy?"²; "How is the Faith organized?"²; "What is the Bahá'í attitude to government?"²; "How did the Bahá'í Faith develop?"²

**`bahai_history`** (bahai). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Bahá'í Faith.  
Frequency: medium. Evidence: qualitative: typical queries. HyPE: yes. 37/45 seen.  
"who are the bahais and why are they so persecuted"²; "Persecution of Baha’is in Iran increases"²; "bahai history timeline"¹; "bahai history in iran"¹; "when did bahai faith start"¹; "bahai history uk"¹

**`bahai_scripture_quotes`** (bahai). Scripture lookups and quotations for the Bahá'í Faith: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: qualitative: source_says is top real-log intent. HyPE: yes. 35/46 seen.  
"bahai quotes on love"¹; "bahai quotes on service"¹; "bahai religion quotes"¹; "bahai quotes on unity"¹; "bahai quotes on death"¹; "bahai quotes on marriage"¹

**`bahai_original_terms`** (bahai). Original-language terms and native-script queries for the Bahá'í Faith (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: qualitative: define_term intent. HyPE: yes. 75/95 seen.  
"معرفی و دانلود کتاب بهائیت"²; "نوزده غلط مشهور درباره بهائیت (title, Persian book store)"²; "روشنگری ایمانیان در پاسخ به شبهات بهائیان (hostile/polemic series)"²; "bahai name for god"¹; "bahai names"¹; "what do bahai believe"¹

**`judaism_beliefs`** (judaism). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Judaism.  
Frequency: high. Evidence: Google autocomplete (suggestqueries endpoint, fetched 2026-11-02); suggestion order is rank but no volumes are published; mesora Top50 includes 'Do Jews believe in Heaven and Hell?', 'Why don't Jews believe in Jesus?'. HyPE: yes. 96/96 seen.  
"Why don't Jews believe in Jesus?"²; "Do Jews expect a Messiah?"²; "Can non-Jews go to Heaven?"²; "what is judaism religion"¹; "what is judaism belief"¹; "is judaism jewish"¹

**`judaism_practice`** (judaism). Rules and lived practice of the Judaism: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: Google autocomplete (suggestqueries endpoint, fetched 2026-11-02); suggestion order is rank but no volumes are published; mesora Top50 Googled list. HyPE: yes. 124/124 seen.  
"What does kosher mean?"²; "How do Jews keep kosher?"²; "What is Shabbat and how is it observed?"²; "judaism rules for women"¹; "judaism rules and practices"¹; "judaism prayer times"¹

**`judaism_society`** (judaism). Community, conversion, membership, controversy and critique, social teachings of the Judaism.  
Frequency: medium. Evidence: Google autocomplete (suggestqueries endpoint, fetched 2026-11-02); suggestion order is rank but no volumes are published. HyPE: yes. 17/17 seen.  
"What makes someone Jewish?"²; "What are the denominations of Judaism?"²; "Is Judaism a religion, a culture, or a race?"²; "Why are Jews called "the chosen people"?"²; "Can I convert to Judaism?"²; "Is Judaism racist for believing it is chosen?"²

**`judaism_history`** (judaism). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Judaism.  
Frequency: medium. Evidence: Google autocomplete: 46 distinct suggestions from 5 seed stems (rank order only; no volumes).. HyPE: yes. 46/46 seen.  
"judaism history timeline"¹; "judaism history and origin"¹; "when did judaism start"¹; "judaism history belief and practice"¹; "judaism history belief and practice pdf"¹; "judaism history of religion"¹

**`judaism_scripture_quotes`** (judaism). Scripture lookups and quotations for the Judaism: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: Google autocomplete (suggestqueries endpoint, fetched 2026-11-02); suggestion order is rank but no volumes are published; several Talmud completions are antisemitic-myth queries (Jesus boiling) and are real traffic, not . HyPE: yes. 130/130 seen.  
"What is the Torah?"²; "What is the Talmud?"²; "Did the Jews really receive the Torah at Sinai?"²; "judaism quotes from torah"¹; "judaism quotes about peace"¹; "torah quotes about love"¹

**`judaism_original_terms`** (judaism). Original-language terms and native-script queries for the Judaism (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: Google autocomplete (suggestqueries endpoint, fetched 2026-11-02); suggestion order is rank but no volumes are published; Hebrew-script autocomplete returned only generic completions (see gaps). HyPE: yes. 52/52 seen.  
"What is Halacha?"²; "What is "Tikkun Olam"?"²; "judaism word for god"¹; "torah meaning in hebrew"¹; "torah meaning in bible"¹; "tikkun olam meaning"¹

**`buddhism_beliefs`** (buddhism). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Buddhism.  
Frequency: high. Evidence: qualitative: seen in FAQ/article titles; no volume data obtained. HyPE: yes. 110/132 seen.  
"Is Buddhism a religion?"²; "Is Buddhism a religion, philosophy, way of life, or science of mind?"²; "Do Buddhists worship the Buddha as a deity?"²; "what is buddhism religion"¹; "what is buddhism beliefs"¹; "is buddhism a religion or philosophy"¹

**`buddhism_practice`** (buddhism). Rules and lived practice of the Buddhism: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: qualitative: seen in FAQ/article titles; no volume data obtained. HyPE: yes. 100/115 seen.  
"Why meditate?"²; "What are the best beginning books on Buddhism?"²; "How do I start a meditation practice?"²; "buddhism rules for women"¹; "buddhism rules and beliefs"¹; "buddhism prayers"¹

**`buddhism_history`** (buddhism). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Buddhism.  
Frequency: medium. Evidence: qualitative: seen in FAQ/article titles; no volume data obtained. HyPE: yes. 36/43 seen.  
"What is Theravada Buddhism?"²; "What's the difference between Zen and Tibetan Buddhism?"²; "Zen Buddhism vs Tibetan Buddhism"²; "buddhism history and development"¹; "buddhism history timeline"¹; "when did buddhism start"¹

**`buddhism_scripture_quotes`** (buddhism). Scripture lookups and quotations for the Buddhism: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: qualitative: whole sites/books exist (fakebuddhaquotes.com, Bodhipaksa's book, Lion's Roar, SuttaCentral thread). HyPE: yes. 66/75 seen.  
"Did the Buddha really say this?"²; "Life is suffering"²; "There is no self"²; "buddhism quotes about peace"¹; "buddhism quotes on suffering"¹; "dhammapada quotes in english"¹

**`buddhism_original_terms`** (buddhism). Original-language terms and native-script queries for the Buddhism (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: qualitative: seen in FAQ/article titles; no volume data obtained. HyPE: yes. 41/50 seen.  
"How do I write an English word in Pali script?"²; "What is the best translation for Dukkha?"²; "What is dukkha?"²; "buddhism word for suffering"¹; "buddhism word for peace"¹; "buddhism word for enlightenment"¹

**`islam_beliefs`** (islam). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Islam.  
Frequency: high. Evidence: Google autocomplete (suggestqueries endpoint, fetched 2026-11-02); suggestion order is rank but no volumes are published; Pew/other sources not used. HyPE: yes. 110/110 seen.  
"what is islam religion"¹; "what is islamophobia"¹; "is islam and muslim the same"¹; "what does islam say about jesus"¹; "what does islam say about abortion"¹; "what does islam say about women"¹

**`islam_practice`** (islam). Rules and lived practice of the Islam: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: Google autocomplete (suggestqueries endpoint, fetched 2026-11-02); suggestion order is rank but no volumes are published; AboutIslam top fatwas 2023 list is dominated by this form. HyPE: yes. 168/168 seen.  
"Is Neutering a Cat Haram?"²; "Can Men Wear Chains in Islam?"²; "Are Mortgages Haram?"²; "islam rules for women"¹; "islam rules for men"¹; "islam prayer times"¹

**`islam_society`** (islam). Community, conversion, membership, controversy and critique, social teachings of the Islam.  
Frequency: medium. Evidence: Google autocomplete (suggestqueries endpoint, fetched 2026-11-02); suggestion order is rank but no volumes are published; qsl.net list of questions asked by non-Muslims. HyPE: yes. 34/34 seen.  
"Can I Marry without the Permission of My Parents in Islam?"²; "Why does Islam degrade women by keeping them behind the veil?"²; "Why is a man allowed to have more than one wife in Islam? i.e. why is polygamy allowed in Islam?"²; "Why are two witnesses who are women, equivalent to only one witness who is a man ?"²; "Under Islamic law, why is a woman's share of the inherited wealth only half that of a man?"²; "Why are most of the Muslims fundamentalists and terrorists?"²

**`islam_history`** (islam). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Islam.  
Frequency: medium. Evidence: Google autocomplete: 45 distinct suggestions from 5 seed stems (rank order only; no volumes).. HyPE: yes. 45/45 seen.  
"islam history timeline"¹; "islam history of religion"¹; "when did islam begin"¹; "islam history book"¹; "islam history in america"¹; "islam history in spain"¹

**`islam_scripture_quotes`** (islam). Scripture lookups and quotations for the Islam: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: Google autocomplete (suggestqueries endpoint, fetched 2026-11-02); suggestion order is rank but no volumes are published. HyPE: yes. 88/88 seen.  
"islam quotes in arabic"¹; "islam quotes about death"¹; "quran quotes about love"¹; "which surah talks about hijab"¹; "which surah talks about marriage"¹; "which surah talks about punishment of the grave"¹

**`islam_original_terms`** (islam). Original-language terms and native-script queries for the Islam (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: Google autocomplete (suggestqueries endpoint, fetched 2026-11-02); suggestion order is rank but no volumes are published; suffixes 'in urdu/hindi/bengali/tamil' show diaspora readers. HyPE: yes. 87/87 seen.  
"الوعد بالصدقة إذا حصل على عمل هل يأخذ حكم النذر؟ وحكم الشك فيه"²; "جواز الجمع بين الصلاتين بسبب أعراض إجراء التحاليل الطبية"²; "واجب من حصل على مكافأة Cashback نظير استخدامه بطاقة ائتمانية ربوية"²; "islam word for sin"¹; "islam word for heaven"¹; "islam word for god"¹

**`christianity_beliefs`** (christianity). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Christianity.  
Frequency: high. Evidence: qualitative: GotQuestions-style 'Is Jesus God?', 'What is God like?' listed in common-questions pages. HyPE: yes. 132/157 seen.  
"Is Jesus God?"²; "What Is God Like?"²; "Does God Exist?"²; "what is christianity according to the bible"¹; "what is christianity religion"¹; "is christianity a religion"¹

**`christianity_practice`** (christianity). Rules and lived practice of the Christianity: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: qualitative: Top searched questions at La Vista Church of Christ site include these (lavista page). HyPE: yes. 123/156 seen.  
"Is suicide a sin?"²; "What is lust?"²; "What constitutes porneia?"²; "christianity rules for women"¹; "christianity rules to live by"¹; "christianity prayers"¹

**`christianity_history`** (christianity). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Christianity.  
Frequency: medium. Evidence: qualitative: La Vista list: accuracy, translation, Catholic extra books; christianityfaq: 7 extra books, Enoch, reading order. HyPE: yes. 59/83 seen.  
"Is the Bible historically accurate?"²; "What is the most accurate Bible translation?"²; "Why do the Catholics have extra books in their Bibles?"²; "christianity history timeline"¹; "christianity history of violence"¹; "when did christianity start"¹

**`christianity_scripture_quotes`** (christianity). Scripture lookups and quotations for the Christianity: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: Bible Gateway year-in-review shows top keywords love, fear, strength, peace and top verses John 3:16, Jeremiah 29:11, Isaiah 41:10 (biblegateway.com/year-in-review/2019/); also 2016 keyword ranks. HyPE: yes. 125/133 seen.  
"bible verse about love"²; "bible verse about fear"²; "bible verse about strength"²; "christianity quotes from the bible"¹; "christianity quotes gcse"¹; "bible quotes about love"¹

**`christianity_original_terms`** (christianity). Original-language terms and native-script queries for the Christianity (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: qualitative: standard word-study queries; no volume retrieved. HyPE: yes. 28/40 seen.  
"christian word for today"¹; "christian word for the day"¹; "christian word for non believers"¹; "christian word for karma"¹; "christian word for the year"¹; "christian word for god"¹

**`hinduism_beliefs`** (hinduism). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Hinduism.  
Frequency: high. Evidence: qualitative: Hinduism Today 14 Questions topics 'Many Gods', 'Idols' (himalayanacademy.com); annarbor FAQ question 1. HyPE: yes. 127/154 seen.  
"What is the Hindu concept of God? Do Hindus worship many gods?"²; "Many Gods"²; "Idols"²; "what is hinduism religion"¹; "what is hinduism beliefs"¹; "is hinduism monotheistic or polytheistic"¹

**`hinduism_practice`** (hinduism). Rules and lived practice of the Hinduism: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: qualitative: Hinduism Today 14 Questions: Cow Worship, Cremation; Four Questions article: 'Why do Hindus cremate the dead?'. HyPE: yes. 102/129 seen.  
"Why do Hindus cremate the dead?"²; "Cow Worship"²; "Cremation"²; "hinduism rules and beliefs"¹; "hinduism rules for women"¹; "hinduism prayer times"¹

**`hinduism_society`** (hinduism). Community, conversion, membership, controversy and critique, social teachings of the Hinduism.  
Frequency: medium. Evidence: qualitative: Hinduism Today says caste is the most relentless criticism Hinduism faces (via 14 Questions blurb, himalayanacademy.com); Hindu Way of Life user questions. HyPE: yes. 12/20 seen.  
"Caste"²; "If a son of a so-called or pure Brahmin deploys himself as a farmer with some land then is he called a Shudra? Why not?"²; "Why is there no unity among Hindus unlike people of Islam or Christianity?"²; "Why were Brahmins treated superior in ancient India? Do Brahmins of the present day really think they are superior to other classes of people?"²; "If Varnashrama system were ordained by God truly, why is not existing in other cultures or societies across the world?"²; "Why do Brahmins perform all the Hindu rituals?"²

**`hinduism_history`** (hinduism). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Hinduism.  
Frequency: medium. Evidence: qualitative: Hindu Way of Life user questions on Puranas/epics; Hinduism Today attitude to other religions. HyPE: yes. 61/70 seen.  
"With so many Puranas and stories of Ramayana, Mahabharata and so on, is not Hinduism just a religion of fairy tales?"²; "What is the Hindu attitude towards other religions?"²; "How do Hindus view other religions?"²; "hinduism history of religion"¹; "hinduism history timeline"¹; "when did hinduism start"¹

**`hinduism_scripture_quotes`** (hinduism). Scripture lookups and quotations for the Hinduism: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: Search results show Gita 2.47, 2.50, 3.35, 3.19 are the common duty/karma-yoga verses (holy-bhagavad-gita.org pages); qualitative. HyPE: yes. 108/118 seen.  
"gita verse on duty"²; "karmanye vadhikaraste meaning"²; "Bhagavad Gita 2.47"²; "hinduism quotes about life"¹; "hinduism quotes bhagavad gita"¹; "bhagavad gita quotes in english"¹

**`hinduism_original_terms`** (hinduism). Original-language terms and native-script queries for the Hinduism (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: qualitative: define_term pattern; no volume retrieved. HyPE: yes. 54/73 seen.  
"हिंदू धर्म का संछिप्त परिचय"²; "हिन्दू सनातन धर्म का सत्य"²; "गीता में कुल कितने अध्याय हैं"²; "hinduism word for god"¹; "hindu word for god"¹; "hindu word for okra"¹

**`zoroastrianism_beliefs`** (zoroastrianism). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Zoroastrianism.  
Frequency: high. Evidence: qualitative: Avesta FAQ first entries (https://www.avesta.org/zfaq.html). HyPE: yes. 96/101 seen.  
"WHAT IS ZOROASTRIANISM?"²; "What is "Asha"?"²; "What scriptures are sacred to Zoroastrianism?"²; "what is zoroastrianism religion"¹; "what is zoroastrianism beliefs"¹; "is zoroastrianism older than judaism"¹

**`zoroastrianism_practice`** (zoroastrianism). Rules and lived practice of the Zoroastrianism: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: qualitative: sources describe fire/tower questions (FEZANA, reonline). HyPE: yes. 84/92 seen.  
"Is it mandatory to wear kushti while praying? (r/Zoroastrianism, paraphrased)"²; "Kusti - The Sacred Cord"²; "The Sudreh and Kusti – What they symbolise"²; "zoroastrianism rules of living"¹; "zoroastrian rules for women"¹; "zoroastrianism prayer times"¹

**`zoroastrianism_society`** (zoroastrianism). Community, conversion, membership, controversy and critique, social teachings of the Zoroastrianism.  
Frequency: medium. Evidence: qualitative: contested question; RRT lists it. HyPE: yes. 14/21 seen.  
"What is the formal procedure to convert to Zoroastrianism?"²; "How many Zoroastrians are there currently?"²; "Converting"²; "Converting (Oct 2024)"²; "How to"²; "I need help"²

**`zoroastrianism_history`** (zoroastrianism). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Zoroastrianism.  
Frequency: medium. Evidence: qualitative. HyPE: yes. 39/47 seen.  
"When did Zarathushtra live?"²; "The impact of Zoroastrianism upon Judaism and Christianity"²; "How Zoroastrianism May Have Influenced Christianity"²; "zoroastrianism history in urdu"¹; "zoroastrianism history book"¹; "when did zoroastrianism start"¹

**`zoroastrianism_scripture_quotes`** (zoroastrianism). Scripture lookups and quotations for the Zoroastrianism: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: qualitative. HyPE: yes. 35/44 seen.  
"WHAT DOES ZOROASTRIAN SCRIPTURE SAY ABOUT ...?"²; "Gathas 101 course (N.A.M.C., r/Zoroastrianism)"²; "Zoroastrianism Q&A (podcast recommended on r/Zoroastrianism)"²; "zoroaster quotes"¹; "zoroastrian quotes about death"¹; "avestan quotes"¹

**`zoroastrianism_original_terms`** (zoroastrianism). Original-language terms and native-script queries for the Zoroastrianism (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: qualitative: Nowruz origin widely covered (e.g. Zoroastrian-origin explainers). HyPE: yes. 54/68 seen.  
"Sacred Armour: Ritual Garments of the Parsi Zoroastrians"²; "Zoroastrian Worldview Glossary"²; "dakhma (Britannica)"²; "zoroastrianism word for god"¹; "zoroastrian word for fire"¹; "zoroastrian word for earth"¹

**`taoism_beliefs`** (taoism). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Taoism.  
Frequency: high. Evidence: qualitative: seen as PAA-style/FAQ headings on cited pages; no volume data found. HyPE: yes. 132/137 seen.  
"what do Taoists believe"²; "is Taoism a religion"²; "is Taoism a philosophy or a religion"²; "what is taoism religion"¹; "what is taoism in simple terms"¹; "is taoism monotheistic or polytheistic"¹

**`taoism_practice`** (taoism). Rules and lived practice of the Taoism: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: qualitative: wu wei is the dominant practical-concept topic in search results (many explainer/self-help pages). HyPE: yes. 90/111 seen.  
"what is wu wei"²; "how to practice wu wei"²; "does wu wei mean doing nothing"²; "taoism rules to live by"¹; "taoism clothing rules"¹; "taoism prayer example"¹

**`taoism_history`** (taoism). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Taoism.  
Frequency: medium. Evidence: qualitative: standard topics in intro pages and r/taoism. HyPE: yes. 61/71 seen.  
"what is the difference between philosophical and religious Taoism"²; "did Lao Tzu really exist"²; "Who was Laozi?"²; "taoism history and origin"¹; "taoism history and development"¹; "when did taoism begin"¹

**`taoism_scripture_quotes`** (taoism). Scripture lookups and quotations for the Taoism: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: qualitative: recurring r/taoism and r/daoism beginner threads; reviews aggregated at gummysearch. HyPE: yes. 89/108 seen.  
"how do I read the Tao"²; "Hello friends, some information please"²; "Literature (r/daoism: start with Zhuangzi instead of Tao Te Ching?)"²; "taoism quotes on balance"¹; "taoism quotes on life"¹; "tao te ching quotes on love"¹

**`taoism_original_terms`** (taoism). Original-language terms and native-script queries for the Taoism (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: qualitative: term-definition pages. HyPE: yes. 31/41 seen.  
"what is wu 無 nothingness in Taoism"²; "Zìrán (自然) naturalness"²; "Wu Wei and Ziran"²; "tao te ching meaning in english"¹; "tao te ching meaning in hindi"¹; "zhuangzi meaning in hindi"¹

**`confucianism_beliefs`** (confucianism). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Confucianism.  
Frequency: high. Evidence: qualitative: PAA-style; whole scholarly literature on the religion question (Anna Sun, Yao). HyPE: yes. 116/131 seen.  
"is Confucianism a religion"²; "is Confucianism a religion or a philosophy"²; "is Confucianism a religion? If so, why do most Chinese think it isn't"²; "what is confucianism in simple terms"¹; "what is confucianism religion"¹; "is confucianism a religion or philosophy"¹

**`confucianism_practice`** (confucianism). Rules and lived practice of the Confucianism: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: Google autocomplete: 40 distinct suggestions from 8 seed stems (rank order only; no volumes).. HyPE: yes. 40/40 seen.  
"confucianism rules for women"¹; "confucius rules"¹; "confucianism prayer rituals"¹; "confucius rules for living"¹; "confucianism food rules"¹; "confucianism clothing rules"¹

**`confucianism_history`** (confucianism). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Confucianism.  
Frequency: medium. Evidence: qualitative: scholarly literature; philosophybreak and academic papers frame human nature debate. HyPE: yes. 43/53 seen.  
"Mencius vs Xunzi on human nature"²; "is human nature good or evil Mencius Xunzi"²; "what is xing e Xunzi human nature is bad"²; "confucianism history and development"¹; "confucianism history definition"¹; "when did confucianism start"¹

**`confucianism_scripture_quotes`** (confucianism). Scripture lookups and quotations for the Confucianism: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: qualitative: recurring beginner reading-order questions. HyPE: yes. 73/88 seen.  
"what is the best order to read the Confucian classics in?"²; "should I read the Analects or the Tao Te Ching first"²; "what are the Four Books"²; "confucianism quotes about life"¹; "confucianism quotes about family"¹; "quotes analects of confucius"¹

**`confucianism_original_terms`** (confucianism). Original-language terms and native-script queries for the Confucianism (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: qualitative: term-definition pages. HyPE: yes. 32/44 seen.  
"difference between ren and yi (r/Confucianism starter question)"²; "Zhu Xi's distinction between li (理) and qi (氣)"²; "Does a modern political figure fit the junzi ideal?"²; "what is the confucianism word for virtue"¹; "words related to confucianism"¹; "how to spell confucianism"¹

**`sikhism_beliefs`** (sikhism). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Sikhism.  
Frequency: high. Evidence: qualitative: SikhNet, CSMonitor, esamskriti, studycountry titles; no volume data obtained. HyPE: yes. 110/114 seen.  
"Are Sikhs Hindus or not?"²; "Can a Hindu follow Sikhism?"²; "How is Sikhism different from Hinduism?"²; "what is sikhism religion"¹; "what is sikhism god"¹; "is sikhism monotheistic"¹

**`sikhism_practice`** (sikhism). Rules and lived practice of the Sikhism: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: qualitative: SikhNet, CSMonitor, esamskriti, studycountry titles; no volume data obtained. HyPE: yes. 98/104 seen.  
"Why do Sikhs wear turbans?"²; "What are the Five Ks?"²; "Do all Sikhs wear turbans?"²; "sikhism rules for women"¹; "sikhism rules for men"¹; "sikhism prayer and meditation"¹

**`sikhism_history`** (sikhism). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Sikhism.  
Frequency: medium. Evidence: qualitative: SikhNet, CSMonitor, esamskriti, studycountry titles; no volume data obtained. HyPE: yes. 38/46 seen.  
"sikhism history in hindi"¹; "sikhism history book"¹; "when did sikhism start"¹; "sikhism history in urdu"¹; "sikhism history today"¹; "sikhism history in english"¹

**`sikhism_scripture_quotes`** (sikhism). Scripture lookups and quotations for the Sikhism: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: qualitative: invented, plausible; no source wordings seen. HyPE: yes. 89/98 seen.  
"sikhism quotes in punjabi"¹; "sikhism quotes in english"¹; "guru granth sahib quotes in english"¹; "sikhism quotes in hindi"¹; "sikhism quotes from guru granth sahib"¹; "sikhism quotes short"¹

**`sikhism_original_terms`** (sikhism). Original-language terms and native-script queries for the Sikhism (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: qualitative: invented, plausible; no source wordings seen. HyPE: yes. 37/46 seen.  
"sikh word for god"¹; "sikh word for turban"¹; "sikh word for brother"¹; "sikh word for thank you"¹; "sikh word for grandmother"¹; "sikh word for hello"¹

**`jainism_beliefs`** (jainism). Core beliefs, God, afterlife, identity (is it a religion / a cult / monotheistic) of the Jainism.  
Frequency: high. Evidence: qualitative: Wikipedia, jainworld, jainqq, herenow4u, Gulf News/NPR titles; no volume data obtained. HyPE: yes. 87/94 seen.  
"Is Jainism atheistic?"²; "Do Jains believe in God?"²; "Jaina atheism"²; "what is jainism religion"¹; "what is jainism philosophy"¹; "is jainism older than hinduism"¹

**`jainism_practice`** (jainism). Rules and lived practice of the Jainism: worship, prayer, fasting, diet, dress, marriage, death rites, festivals, 'can a X do Y'.  
Frequency: high. Evidence: qualitative: Wikipedia, jainworld, jainqq, herenow4u, Gulf News/NPR titles; no volume data obtained. HyPE: yes. 103/112 seen.  
"Why don't Jains eat root vegetables?"²; "Why is dinner after sunset prohibited?"²; "What is Jain food?"²; "jainism rules and regulations"¹; "jainism rules food"¹; "jainism prayer house"¹

**`jainism_history`** (jainism). Origins, founders, dates, schools/sects, demographics, authorship and canon of the Jainism.  
Frequency: medium. Evidence: qualitative: Wikipedia, jainworld, jainqq, herenow4u, Gulf News/NPR titles; no volume data obtained. HyPE: yes. 39/45 seen.  
"What is the difference between Digambara and Svetambara?"²; "Which are the different sects in Jainism?"²; "The Digambara and Svetambara sects"²; "jainism history in hindi"¹; "jainism history in tamil"¹; "when did jainism start"¹

**`jainism_scripture_quotes`** (jainism). Scripture lookups and quotations for the Jainism: 'verse about X', 'what does the [book] say about', '[founder] quotes on', 'did X say'.  
Frequency: high. Evidence: Google autocomplete: 29 distinct suggestions from 4 seed stems (rank order only; no volumes).. HyPE: yes. 29/29 seen.  
"jainism quotes in english"¹; "jainism quotes in hindi"¹; "agama quotes"¹; "jainism quotes in sanskrit"¹; "jainism quotes on life"¹; "jainism quotes in gujarati"¹

**`jainism_original_terms`** (jainism). Original-language terms and native-script queries for the Jainism (meaning of a term, word for X, queries typed in the tradition's language).  
Frequency: medium. Evidence: qualitative: invented, plausible; no source wordings seen. HyPE: yes. 23/31 seen.  
"tattvartha sutra meaning in hindi"¹; "what does sutra mean"¹; "agamas meaning in hindi"¹; "what is sutra in english"¹; "sutra meaning in chinese"¹; "sutra meaning in english"¹


### universal (14 families, 249 wordings)

**`god_exists`** (all). Does God exist / is God real / proof of God  
Frequency: high. Evidence: Ranked #1 in RELEVANT's 2025 most-googled faith questions list (no volumes given); 'Does God exist?' #3 in Reasonable Faith seven-most-googled list.. HyPE: yes. 5/12 seen.  
"Is There a God?"²; "Does God exist?"²; "If God is real, then why are there so many religions?"²; "is god real"¹; "why does god allow satan to exist"¹; "How do we know God exists?"³

**`who_made_god_nature_of_god`** (all, christianity). Nature and attributes of God: who made God, does God love/punish/forgive, gender of God  
Frequency: high. Evidence: 'Who created God?' #1 God question in every US state, 'Who is God' most-googled question of 2007 (Zeitgeist) per secondary reports; Denison/Humanist give ranks only; 25,000/month claim is secondary-source only.. HyPE: yes. 18/23 seen.  
"Who created God?"²; "Why does God hate me?"²; "Why does God need so much praise"²; "does god have a gender"¹; "is god is"¹; "is godzilla minus zero in english"¹

**`meaning_purpose`** (all, christianity). Meaning and purpose of life  
Frequency: high. Evidence: 'Does life have a purpose?' #2 in Reasonable Faith list and #8 in RELEVANT 2025 list.. HyPE: yes. 6/15 seen.  
"Does Life Have a Purpose?"²; "What is the meaning of life? (eBible)"²; "what is the point of life"²; "what is the purpose of daylight savings time"¹; "whats the point of life"²; "What is the meaning of life? (CareerVillage)"²

**`suffering_evil`** (all, christianity). Why does God allow suffering, evil, bad things to good people  
Frequency: high. Evidence: 'Why does God allow suffering and evil?' #1 in Reasonable Faith list; #2 in RELEVANT 2025 and Denison rank. Pew 2021 (n=6,485): 86% say 'sometimes bad things just happen' fits; 14% say suffering indicates no God.. HyPE: yes. 20/26 seen.  
"Why does God allow suffering?"²; "Why does God allow suffering and evil?"²; "Is suffering a punishment from God?"²; "why does god allow bad things to happen"¹; "why does god allow children to suffer"¹; "is it a sin to celebrate halloween"¹

**`afterlife_heaven_hell`** (all, christianity). What happens after death; heaven, hell, judgment  
Frequency: high. Evidence: Pew 2021: 73% believe in heaven, 62% hell, ~1/3 reincarnation, 17% no afterlife. Most-googled religious topic claim ('what happens when you die' ~74,000/yr) is from a low-quality secondary source.. HyPE: yes. 24/31 seen.  
"What do you legitimately believe happens after we die?"²; "What do you think happens to you after you die?"²; "Can people who don't believe in God enter heaven?"²; "what happens when we die according to the bible"¹; "what happens when we die where do we go"¹; "is there life after death"¹

**`soul_spirit`** (all, christianity). What the soul/spirit is; is it immortal  
Frequency: medium. Evidence: qualitative: recurring in seeker Q&A and afterlife surveys; no volume data found.. HyPE: yes. 9/19 seen.  
"what is the soul according to the bible"¹; "what is the soul stones power"¹; "what is the soul of man"¹; "what is the soul king in bleach"¹; "what is the soul made of"¹; "what is the soul in deltarune"¹

**`prayer_how_why`** (all, christianity). How and why to pray; does prayer work  
Frequency: high. Evidence: qualitative: Pew Religious Landscape Study tracks prayer frequency; no query volumes found.. HyPE: yes. 15/25 seen.  
"Why Doesn't God Answer My Prayers?"²; "Why Hasn't God Answered My Prayer?"²; "How Does Prayer Work?"²; "how to pray the rosary"¹; "how to pray the rosary step by step"¹; "Honest Questions: Why Didn't God Answer My Prayers?"²

**`meditation_contemplation`** (all). Meditation and contemplation: how, why, which kind  
Frequency: medium. Evidence: qualitative: Google Year in Search 2020 noted worldwide 'meditation' interest (secondary); no religion-specific volume.. HyPE: yes. 0/9 seen.  
"What is meditation in religion?"³; "How do I meditate spiritually?"³; "Is meditation compatible with my faith?"³; "What is the purpose of meditation?"³; "Is meditation a form of prayer?"³; "How do you meditate on scripture?"³

**`faith_doubt`** (all). Faith, doubt, losing faith, how to believe  
Frequency: medium. Evidence: qualitative: Pew spiritual-but-not-religious and 'nones' research; no query data.. HyPE: yes. 0/10 seen.  
"How do I overcome doubt in my faith?"³; "What is faith?"³; "Is it ok to doubt?"³; "How can I find faith?"³; "What is the difference between faith and belief?"³; "Why do I feel disconnected from God?"³

**`morality_sin_forgiveness`** (all, christianity). What is sin, is X a sin, forgiveness  
Frequency: high. Evidence: Lavista Church of Christ most-asked list includes 'Is suicide a sin?', 'Do sins have consequences?'; Denison: 'Will God forgive me?' (secondary).. HyPE: yes. 16/23 seen.  
"Is suicide a sin?"²; "Do sins have consequences?"²; "What is lust?"²; "is it a sin to get a tattoo"¹; "is it a sin to be cremated"¹; "does god forgive all sins"¹

**`salvation_exclusivity`** (all, christianity). Who is saved; is my religion the only way  
Frequency: medium. Evidence: 'Is Christianity too narrow?' #4 Reasonable Faith, #6 RELEVANT 2025; Pew 2021: 39% say non-believers can enter heaven vs 32% only believers.. HyPE: yes. 3/10 seen.  
"Is Christianity Too Narrow?"²; "Can people who don't believe in God enter heaven?"²; "Do all religions lead to God?"²; "Is salvation only through one religion?"³; "Will people of other religions go to hell?"³; "What must I do to be saved?"³

**`why_many_religions`** (all, christianity). Why so many religions; which is true; do all worship the same God  
Frequency: high. Evidence: qualitative: apologetic and Q&A sites carry exact titles (Billy Graham UK, eBible, Bible Hub); no volume.. HyPE: yes. 18/24 seen.  
"If God is real, then why are there so many religions in the world? They can't all be right, can they?"²; "Why are there so many religions?"²; "Do all religions lead to God?"²; "If God exists, why many religions?"²; "How Do I Know Which Religion Is True?"²; "How do you know which religion is true?"²

**`love_happiness_peace`** (all). Love, happiness, inner peace, contentment  
Frequency: medium. Evidence: qualitative; no query data located.. HyPE: yes. 2/12 seen.  
"does god love everyone"¹; "does god love me"¹; "What does religion say about love?"³; "How do I find true happiness?"³; "How to find inner peace spiritually"³; "What is divine love?"³

**`scripture_reliability`** (all, judaism, islam, christianity). Are scriptures true/reliable/corrupted  
Frequency: medium. Evidence: 'Is the Bible reliable?' #6 Reasonable Faith, #3 RELEVANT 2025; Lavista list: 'Is the Bible historically accurate?', 'What is the most accurate Bible translation?'.. HyPE: yes. 3/10 seen.  
"Is the Bible Reliable?"²; "Is the Bible historically accurate?"²; "What is the most accurate Bible translation?"²; "Is the Quran authentic?"³; "Has the Torah been changed?"³; "Are the scriptures divinely revealed?"³


### practical (7 families, 122 wordings)

**`marriage_interfaith`** (all, judaism, islam). Marriage, weddings, interfaith marriage  
Frequency: high. Evidence: qualitative: interfaith marriage sources (psychcentral, counseling.org) show interest; no query data.. HyPE: yes. 16/27 seen.  
"What if My Partner and I Have Different Religious Beliefs? Can Interfaith Marriage Work?"²; "Unequally-yoked Relationship: Does it work?"²; "15 Common Interfaith Marriage Problems and How to Fix Them"²; "interfaith marriage israel"¹; "interfaith marriage meaning"¹; "10 Signs That Undoubtedly Say Your Interfaith Marriage Will Not Work"²

**`divorce`** (all, judaism). Divorce and remarriage  
Frequency: medium. Evidence: Reader question 'Does God allow divorce?' found only in a book TOC; Fordham interfaith panel on divorce (qualitative).. HyPE: yes. 2/12 seen.  
"what are the special considerations associated with an interfaith divorce"²; "Faith communities should support, not penalize, couples who divorce"²; "Does God allow divorce?"³; "Is divorce a sin?"³; "Can I remarry after divorce?"³; "What is the waiting period before divorce?"³

**`death_funeral_grief_burial`** (all, christianity). Death, funerals, burial/cremation, grief and comfort  
Frequency: high. Evidence: 'Is cremation a sin?' appears as a title and as a recurring question (Kainos Project, funeral sites); 'Is cremation a sin' no volume; interfaith funeral planning guides (agoodgoodbye).. HyPE: yes. 12/23 seen.  
"Is cremation a sin?"²; "What Does the Bible Say About Cremation?"²; "Is Cremation a Sin? Understanding Christian Views + Beliefs"²; "Is Cremation Wrong for Christians?"²; "Do Christians disagree with cremation?"²; "what's wrong with cremation, does the Bible forbid it"²

**`diet_alcohol_fasting`** (all, buddhism, christianity). Diet, alcohol, fasting rules  
Frequency: high. Evidence: qualitative: Lavista list 'Did Jesus eat meat?'; alcohol and cremation lines unverified as top searches.. HyPE: yes. 4/14 seen.  
"Did Jesus eat meat?"²; "Which religions don't drink alcohol?"²; "Can Buddhists drink alcohol?"²; "Alcohol and Religion: Is It All Right to Drink?"²; "Is alcohol forbidden in my religion?"³; "Why do religions fast?"³

**`occasion_prayers`** (all). Prayers for occasions (healing, the dead, protection, exams, comfort)  
Frequency: high. Evidence: qualitative; prayer-request phrasing is high-frequency in devotional sites; no volume gathered.. HyPE: yes. 10/20 seen.  
"prayer for healing"¹; "prayer for today"¹; "prayer for strength"¹; "prayer for anxiety"¹; "prayer for protection"¹; "prayer for all saints day"¹

**`children_family_sex`** (all, christianity). Children, family life, sexuality, chastity  
Frequency: medium. Evidence: Lavista list includes sex-related Qs ('What constitutes porneia?', 'Is anal sex a sin?'); no volumes.. HyPE: yes. 7/14 seen.  
"What constitutes porneia?"²; "Is anal sex a sin?"²; "What does it mean to honor your father and mother?"²; "The December Dilemma For Interfaith Families"²; "Tips for Interfaith Families on How to Talk About Christmas"²; "Children of two faiths"²

**`holidays_calendar_conversion`** (all, judaism). Holy days, calendars, how to convert  
Frequency: medium. Evidence: qualitative; no volume data located.. HyPE: yes. 2/12 seen.  
"Why I'm Not Converting to Judaism, Even Though My Kids Did"²; "Dual religion, conversion of faith"²; "What are the holy days?"³; "When is the religious new year?"³; "What holidays do believers observe?"³; "How do I convert to this religion?"³


### social (4 families, 79 wordings)

**`gender_race_equality`** (all, islam, hinduism, sikhism). Equality of women and men; race and racism  
Frequency: medium. Evidence: qualitative: 'Why did God make me ___?' completions ('ugly','gay','black') ranked top 3 in Denison/Humanist reporting.. HyPE: yes. 11/20 seen.  
"Why did God make me black?"²; "Why did God make me gay?"²; "religion and women's rights"¹; "religion and women in india"¹; "religion and women in india tanika sarkar"¹; "religion and women book"¹

**`sexuality_abortion_euthanasia`** (all, judaism, islam, christianity). Homosexuality, abortion, euthanasia, suicide  
Frequency: high. Evidence: 'What does the Bible say about homosexuality?' #7 RELEVANT 2025; 'Is suicide a sin?' on Lavista list.. HyPE: yes. 13/22 seen.  
"What Does the Bible Say About Homosexuality?"²; "Is suicide a sin?"²; "Perspectives of Major World Religions regarding Euthanasia and Assisted Suicide: A Comparative Analysis"²; "what does jesus say about homosexuality"¹; "what does christianity say about homosexuality"¹; "What the Bible says about abortion"²

**`poverty_war_justice`** (all). Wealth/poverty, war/peace, justice, world unity  
Frequency: medium. Evidence: qualitative; no query data.. HyPE: yes. 1/12 seen.  
"Religions for Peace statement on International Women's Day (poverty, war, patriarchy)"²; "What does religion say about poverty?"³; "Is it ok to be rich?"³; "What does the scripture say about war?"³; "Is war ever justified?"³; "How can we achieve world peace?"³

**`science_education_environment`** (all). Science and religion, evolution, education, environment  
Frequency: medium. Evidence: qualitative; Lavista list 'How old is the world?'.. HyPE: yes. 16/25 seen.  
"How old is the world?"²; "Does science disprove religion?"²; "Has Science Disproved Religion?"²; "religion and science go hand in hand"¹; "religion and science book"¹; "Can science ever disprove religion?"²


### cross (27 families, 999 wordings)

**`compare_afterlife_rebirth`** (bahai, judaism, buddhism, islam, christianity, hinduism, sikhism, jainism). Afterlife, reincarnation/rebirth, resurrection, nirvana/moksha across traditions  
Frequency: medium. Evidence: qualitative: comparison articles and Q&A titles are abundant in search results; no volume data obtained. HyPE: yes. 33/59 seen.  
"Moksha vs nirvana"²; "Moksha, nirvana, mukti, salvation and jannah: liberation compared across religions"²; "What is moksha in Buddhism?"²; "religions that believe in reincarnation"¹; "what religion talks about reincarnation"¹; "Moksha, nirvana, mukti compared"²

**`compare_prayer_worship`** (bahai, judaism, buddhism, islam, christianity, hinduism). Prayer and worship compared  
Frequency: medium. Evidence: qualitative: comparison-style page titles/questions seen in search results (see source_url); invented wordings (url null) follow the same 'X vs Y' patterns; no volume data.. HyPE: yes. 6/14 seen.  
"Do Baháʼí pray like Muslims?"²; "prayer and meditation (Baha'i, RE Online)"²; "Interreligious prayer"²; "Do Muslims and Christians worship the same God?"²; "Is Allah the Same as the God of Christianity, and Is It OK for Christians to Pray to Allah?"²; "Why Doesn't God Answer My Prayers? (seekersguidance)"²

**`compare_diet_fasting_alcohol`** (bahai, judaism, buddhism, islam, christianity, hinduism, sikhism, jainism). Diet laws, fasting, alcohol compared  
Frequency: medium. Evidence: qualitative: 'which religions don't eat pork' shape; no volume. HyPE: yes. 46/78 seen.  
"fasting in different religions"²; "Fasting in different religion"²; "Fasting Across Religions"²; "religions that don't eat pork"¹; "religions that fast regularly"¹; "religions that fast for 30 days"¹

**`compare_god_nature`** (bahai, judaism, buddhism, islam, christianity, hinduism, taoism, sikhism). God / ultimate reality compared (Allah vs God, Brahman, Tao, no-God Buddhism, Trinity vs Trimurti)  
Frequency: medium. Evidence: qualitative: several titled pieces. HyPE: yes. 35/57 seen.  
"The Christian Trinity and the Hindu Trimurti"²; "Pagan Trinities"²; "Trinity in Hinduism and Christianity"²; "In what way is an average Muslim's perception of Allah different from an average Hindu's idea of God?"²; "Can a Muslim attain moksha in the Hindu way?"²; "Is Allah the same as Krishna?"²

**`compare_suffering`** (bahai, judaism, buddhism, islam, christianity, hinduism). Suffering and evil compared  
Frequency: medium. Evidence: qualitative: comparison-style page titles/questions seen in search results (see source_url); invented wordings (url null) follow the same 'X vs Y' patterns; no volume data.. HyPE: yes. 7/15 seen.  
"A comparative study of the concept of suffering in Buddhism and Christianity"²; "why do we suffer buddhism vs christianity"²; "what differentiates buddhism christianity"²; "buddhism and christianity"²; "Suffering in the mystical traditions of Buddhism and Christianity"²; "Will and Desire: Suffering in Buddhism and Augustinian Christianity"²

**`compare_marriage_family`** (bahai, judaism, islam, christianity, hinduism). Marriage and family compared  
Frequency: medium. Evidence: qualitative: comparison-style page titles/questions seen in search results (see source_url); invented wordings (url null) follow the same 'X vs Y' patterns; no volume data.. HyPE: yes. 10/18 seen.  
"marriage christianity vs islam"²; "Sex and Marriage in Islam Compared to Christianity: What do the Foundational Documents Say?"²; "The Image Of God Reflected In Marriage In Christianity And Islam"²; "A Comparative Study of Marriage from Islamic and Christian Viewpoints"²; "marriage in islam and christianity"²; "Marrying Someone from a Different Religion"²

**`compare_death_funeral`** (judaism, buddhism, islam, christianity, hinduism, zoroastrianism). Funerals, burial, cremation compared  
Frequency: medium. Evidence: qualitative: comparison-style page titles/questions seen in search results (see source_url); invented wordings (url null) follow the same 'X vs Y' patterns; no volume data.. HyPE: yes. 27/35 seen.  
"what do religions have to say about cremation"²; "what do most religions say about cremation"²; "Religions and Cremation: Who Objects, Who Permits It, and What Can't Be Cremated"²; "what do religions say about cremation"¹; "burial customs of jews"¹; "funeral rites of dashrath"¹

**`compare_salvation_karma_grace`** (bahai, judaism, buddhism, islam, christianity, hinduism). Salvation, grace vs karma compared  
Frequency: medium. Evidence: qualitative: multiple titled essays. HyPE: yes. 9/20 seen.  
"Grace versus Karma"²; "Why Do Christians Reject Karma?"²; "grace vs karma"²; "Grace or Karma"²; "Karma and grace"²; "Do all religions lead to God?"²

**`compare_soul`** (bahai, judaism, buddhism, islam, christianity, hinduism). The soul compared  
Frequency: medium. Evidence: qualitative: comparison-style page titles/questions seen in search results (see source_url); invented wordings (url null) follow the same 'X vs Y' patterns; no volume data.. HyPE: yes. 2/10 seen.  
"Pew: 86% believe humans have a soul or spirit (Christians 95%, Buddhists 90%, Muslims 88%, Hindus 84%, Jews 74%)"²; "Buddhism teaches humans do not have souls; Hinduism teaches eternal souls"²; "what do hinduism and buddhism say about the soul?"³; "how does the hinduism view of the soul differ from the buddhism?"³; "the soul in the hinduism vs buddhism"³; "do all religions teach the soul?"³

**`compare_ethics_sin_golden_rule`** (bahai, judaism, buddhism, islam, christianity, hinduism, confucianism). Sin, ethics, the golden rule across traditions  
Frequency: medium. Evidence: qualitative: page/title seen via web search; no volume data obtained (straightdope thread, ing.org, newworldencyclopedia, Scarboro-style compilations all rank for the query). HyPE: yes. 13/40 seen.  
"Why do so many religions have a Golden Rule?"²; "golden rule in all religions"²; "Treat others as you would like to be treated: the Golden Rule in every religion"²; "is karma reincarnation compatible with christianity"²; "Why Do Christians Reject Karma?"²; "The Incompatibility of the Resurrection and Reincarnation"²

**`compare_meaning_of_life`** (buddhism, islam, christianity, hinduism, taoism, confucianism). Meaning of life compared  
Frequency: medium. Evidence: qualitative: comparison-style page titles/questions seen in search results (see source_url); invented wordings (url null) follow the same 'X vs Y' patterns; no volume data.. HyPE: yes. 5/13 seen.  
"Huston Smith: The Meaning of Life in the World's Religions"²; "what is the meaning of life (eBible 2412)"²; "Could God's purpose be the source of life's meaning?"²; "whats the point of life"²; "Religion and the Meaning of Life: The Problem"²; "what do buddhism and hinduism say about the meaning of life?"³

**`compare_prophets_founders`** (bahai, judaism, buddhism, islam, christianity, hinduism, zoroastrianism). Prophets and founders across traditions (Jesus in the Quran, Abraham in three faiths, Krishna vs Jesus)  
Frequency: medium. Evidence: qualitative: several titles on apologetics and ISKCON forums. HyPE: yes. 22/40 seen.  
"How could the similarities between Krishna and Jesus be a coincidence?"²; "Is Jesus An Avatar?"²; "Who is Krishna to Jesus?"²; "is jesus in the quran"¹; "is jesus in the old testament"¹; "is jesus in the torah"¹

**`compare_scriptures`** (judaism, buddhism, islam, christianity, hinduism, taoism). Scriptures compared (Bible vs Quran, Gita vs Bible, is X in both)  
Frequency: medium. Evidence: qualitative: question on hinduismwayoflife.com plus comparison titles. HyPE: yes. 7/26 seen.  
"I read somewhere that Bible already contains almost similar teachings of Bhagavad Gita. Then what is so great about Gita?"²; "bhagavad gita vs bible"²; "The desire to see God: A comparison between the Bhagavadgita and the book of Exodus"²; "Gita and Gospel (Farquhar)"²; "Bible vs Quran"²; "Quran vs Bible"²

**`compare_eschatology_messiah`** (bahai, judaism, buddhism, islam, christianity, hinduism, zoroastrianism). Messiah, return, end times, prophecy fulfilment compared  
Frequency: medium. Evidence: qualitative: Bahá'í/Christian/Jewish/Islamic apologetics query shape; no data. HyPE: yes. 0/18 seen.  
"prophecies of the return of Christ in other religions"³; "does the Bible predict Muhammad"³; "Maitreya Buddha prophecy and the promised one"³; "what do religions say about the promised one"³; "Kalki avatar and the end times"³; "Mahdi and the Messiah same person"³

**`compare_gender_social`** (bahai, judaism, buddhism, islam, christianity, hinduism). Gender and social teachings compared  
Frequency: medium. Evidence: qualitative: comparison-style page titles/questions seen in search results (see source_url); invented wordings (url null) follow the same 'X vs Y' patterns; no volume data.. HyPE: yes. 2/10 seen.  
"Statement of the Religions for Peace World Council on International Women's Day"²; "We Can't Wait: We Must Mobilize Religion and Belief to Advance Women's Rights"²; "what do islam and christianity say about women and men?"³; "how does the islam view of gender equality differ from the christianity?"³; "gender equality in the islam vs christianity"³; "do all religions teach women and men?"³

**`compare_science_religion`** (bahai, buddhism, islam, christianity, hinduism). Science and religion compared across traditions  
Frequency: medium. Evidence: qualitative: comparison-style page titles/questions seen in search results (see source_url); invented wordings (url null) follow the same 'X vs Y' patterns; no volume data.. HyPE: yes. 6/14 seen.  
"Does science disprove religion?"²; "How can scientists believe evolution is compatible with religion?"²; "Science and Religion"²; "Is Evolution Compatible with Christianity?"²; "Can the theory of evolution and religion coexist?"²; "Are science and religion opposed"²

**`compare_mysticism`** (bahai, judaism, buddhism, islam, christianity, hinduism, taoism). Mysticism compared (Sufism, Kabbalah, Vedanta, Christian mysticism)  
Frequency: medium. Evidence: qualitative: wording/titles seen in web search; no volume data (Kabbalah vs Sufism pages: mysticryst, sufis.substack, MyJewishLearning). HyPE: yes. 3/10 seen.  
"Kabbalah vs Sufism"²; "Should you study Sufism or Kabbalah?"²; "Sufism and Kabbalah: mysticism in Islam and Judaism"²; "Sufism vs Vedanta"³; "Sufism vs Kabbalah vs Vedanta"³; "Christian mysticism vs Sufism"³

**`compare_bahai_vs_others`** (bahai, buddhism, islam, christianity, hinduism, zoroastrianism). The Bahá'í Faith compared with Islam, Christianity, Zoroastrianism and others  
Frequency: medium. Evidence: qualitative: Islamic and Baha'i sources both address it. HyPE: yes. 8/29 seen.  
"Bahá'í vs. Islam"²; "Baha'i Faith vs. Islam"²; "Wat is diffrence between bahai and muslims?????"²; "Is the Bahai Faith Islam Lite?"²; "Do Baháʼí pray like Muslims?"²; "Can I be a Baha'i and not support Islam or believe in Mohammed?"²

**`compare_zoroastrian_abrahamic`** (judaism, islam, christianity, zoroastrianism). Zoroastrianism and its relation to / influence on Judaism, Christianity, Islam  
Frequency: medium. Evidence: qualitative: scholarly pages cited. HyPE: yes. 12/18 seen.  
"Zoroastrian Influences on Judaism, Christianity and Islam"²; "The impact of Zoroastrianism upon Judaism and Christianity"²; "How Zoroastrianism May Have Influenced Christianity"²; "Zoroastrianism (part 1 of 2): Fire worshippers or monotheists?"²; "Did Zoroastrianism Truly Preach the First Monotheism?"²; "Monotheism the Zoroastrian Way"²

**`compare_dharmic_pairs`** (buddhism, hinduism, jainism). Hinduism, Buddhism, Jainism compared with each other  
Frequency: medium. Evidence: qualitative: comparison articles and Q&A titles are abundant in search results; no volume data obtained. HyPE: yes. 32/37 seen.  
"Karma: Hindu and Buddhist perspectives compared"²; "Is karma Buddhist or Hindu?"²; "Buddhism vs. Hinduism: key differences"²; "Differences and similarities between Buddhism and Hinduism"²; "Buddhism vs Hinduism: a comprehensive comparison"²; "Is Buddhism an offshoot of Hinduism?"²

**`compare_sikhism_pairs`** (islam, hinduism, sikhism). Sikhism compared with Hinduism and Islam  
Frequency: medium. Evidence: qualitative: comparison articles and Q&A titles are abundant in search results; no volume data obtained. HyPE: yes. 18/21 seen.  
"Are Sikhs Hindus or not?"²; "Can a Hindu follow Sikhism?"²; "How is Sikhism different from Hinduism?"²; "What is the difference between Sikh and Hindu?"²; "Are Hinduism and Sikhism different religions?"²; "Hum Hindu Nahin"²

**`compare_abrahamic_dharmic`** (judaism, buddhism, islam, christianity, hinduism). Abrahamic vs Dharmic traditions (Christianity/Islam vs Hinduism/Buddhism)  
Frequency: medium. Evidence: qualitative: many comparison titles found (hinduwebsite.com, biblehub, forthegospel.org, himalayanacademy counterpoint, ebible); no volume. HyPE: yes. 12/16 seen.  
"Hinduism and Christianity: A Comparison"²; "How do Hinduism and Christianity differ?"²; "Christianity vs. Hinduism"²; "Hinduism / Christianity Counterpoint"²; "Comparing Christianity & Hinduism"²; "Why should I, a Hindu, consider becoming a Christian?"²

**`compare_chinese_traditions`** (buddhism, christianity, taoism, confucianism). Taoism, Confucianism, Buddhism compared; with Christianity  
Frequency: medium. Evidence: Question-form wording seen as result title; no volume data.. HyPE: yes. 29/36 seen.  
"Is Taoism a religion or a philosophy"²; "What is Taoism and how does it differ from Christianity?"²; "Confucianism, a Religion or Philosiphy?"²; "Is Confucianism a religion? Modern Confucian theories on the ethical nature of classical discourses"²; "Confucianism: religion or philophy debate"²; "Confucianism and the definition of religion"²

**`compare_intra_tradition_branches`** (judaism, islam, christianity). Branches within a tradition (Sunni/Shia, Jewish movements, Catholic/Protestant/Orthodox, Theravada/Mahayana)  
Frequency: medium. Evidence: Question-form wording seen as result title; no volume data.. HyPE: yes. 5/7 seen.  
"What's the difference between Sunni and Shia Muslims"²; "Differences Between Sunni And Shia Muslims"²; "sunni shia differences relationships"²; "What are Jewish denominations? Difference Reform, Conservative, Orthodox"²; "difference between shia and sunni"²; "Orthodox vs Conservative vs Reform Judaism"³

**`compare_tradition_pairs`** (all 11). Generic "X vs Y" / "difference between X and Y" head-to-head (Google autocomplete pairs)  
Frequency: high. Evidence: qualitative: compare ~5% of known real log; 'difference between X and Y' is a standard People-also-ask shape. HyPE: yes. 266/272 seen.  
"bahai vs islam"¹; "bahai vs christianity"¹; "bahai vs unitarian universalist"¹; "bahai vs unitarian"¹; "bahai vs sikh"¹; "bahai vs muslim"¹

**`cross_what_do_religions_say`** (christianity). "What do religions say about X", "which religion believes X", "religions that don't X"  
Frequency: high. Evidence: qualitative: standard 'what do religions say about ...' query shape; Pluralism Project / interfaith curricula organise by topic; no volume seen. HyPE: yes. 59/69 seen.  
"what do religions say about dinosaurs"¹; "what do religions say about aliens"¹; "religions that believe in god"¹; "what do religions say about jesus"¹; "what do religions say about tattoos"¹; "what do religions say about homosexuality"¹

**`cross_unity_common_ground`** (bahai, christianity). Unity of religions, common ground, are all religions the same  
Frequency: medium. Evidence: qualitative: 'Oneness: Great Principles Shared by All Religions' and Golden-rule pages surface; interfaith framing. HyPE: yes. 9/17 seen.  
"do all religions believe in god"¹; "do all religions believe in the same god"¹; "do all religions believe in jesus"¹; "do all religions have a god"¹; "do all religions baptize"¹; "do all religions lead to the same god"¹


### source (4 families, 117 wordings)

**`quote_who_said`** (all). Who said "<quote>" — attribute a quotation  
Frequency: high. Evidence: qualitative: Bodhipaksa Fake Buddha Quotes (since 2003), Tricycle, Lion's Roar feature the genre; no search volume. HyPE: no. 11/18 seen.  
"who said thousands of candles can be lighted from a single candle"²; "who said if we could see the miracle of a single flower clearly"²; "من قال لا اله الا الله وحده لا شريك له له الملك وله الحمد وهو على كل شيء قدير"¹; "من قال سبحان الله وبحمده"¹; "من قال سبحان الله وبحمده مائة مرة"¹; "من قال لا إله إلا الله وحده لا شريك له له الملك وله الحمد يحيي ويميت وهو على كل شيء قدير"¹

**`quote_is_it_real`** (buddhism, islam, christianity, hinduism, confucianism). Is this quote real / misattributed (fake Buddha, Confucius, Lao Tzu, Rumi quotes)  
Frequency: medium. Evidence: qualitative: fake-buddha-quote sites; BibleGateway blog and others on 'not in the Bible'. HyPE: no. 15/21 seen.  
"7 things the Buddha never said"²; "fake Buddha quotes"²; "Is 'Cleanliness is next to godliness' in the Bible?"²; "God helps those who help themselves – is it in the Bible?"²; "Did you know 'God helps those who help themselves' isn't in the Bible?"²; "5 things you won't believe are not in the Bible"²

**`quote_find_passage`** (bahai, buddhism, islam, christianity, hinduism). Find the passage that says X (topic or paraphrase, no exact words): "verse about patience", "where does it say"  
Frequency: high. Evidence: qualitative: source_says 30% + exact_phrase 8% of real log (brief). HyPE: yes. 58/68 seen.  
"where in the bible does it say not to celebrate halloween"¹; "where in the bible does it say not to eat pork"¹; "where in the quran does it say to read the bible"¹; "where in the bible does it say jesus is god"¹; "where in the bible does it say come as you are"¹; "where in the bible does it say abortion is wrong"¹

**`quote_verse_reference`** (bahai, judaism, buddhism, islam, christianity, hinduism, taoism). Look up a reference: "John 3:16", "surah 2 ayah 255", "Gita 2.47", "Hidden Words Arabic 5"  
Frequency: medium. Evidence: qualitative: Bible Gateway / Quran.com style reference lookups; no stats seen. HyPE: no. 0/10 seen.  
"John 3:16"³; "Quran 2:255 ayat al kursi"³; "Psalm 23 full text"³; "Genesis 1:1"³; "Surah Al-Fatiha text"³; "Bhagavad Gita 2:47"³


### original_language (3 families, 79 wordings)

**`orig_word_meaning`** (judaism, buddhism, islam, christianity, hinduism, taoism). "What does X mean", "Hebrew/Arabic/Sanskrit/Greek word for Y"  
Frequency: medium. Evidence: qualitative: Bible Hub/Blue Letter Bible lexicon pages and firmisrael/Logos explainers rank for 'Hebrew word for love', 'agape'. HyPE: yes. 44/54 seen.  
"Hebrew word for love in the Bible"²; "what does agape love really mean"²; "what does hesed mean"²; "hebrew word for god"¹; "hebrew word for love"¹; "arabic word for god"¹

**`orig_arabic_persian`** (bahai, islam). Request for the original Arabic/Persian of a translated passage  
Frequency: low. Evidence: qualitative: Quranic Arabic Corpus and Bahá'í text portals; shape typical. HyPE: no. 0/9 seen.  
"what is the original Arabic of this verse"³; "what does Allah-u-Abha mean in Arabic"³; "Arabic text of the Long Healing Prayer"³; "original Persian of the Hidden Words"³; "transliteration of Bismillah"³; "what does the word Baha mean in Arabic"³

**`orig_translation_compare`** (judaism, buddhism, islam, christianity, hinduism, taoism). Which translation is best/accurate; original language of a scripture  
Frequency: medium. Evidence: qualitative: crosswalk, biblehub 'Most accurate Bible translation', r/islam 'Quran translations', gummysearch aggregation of Reddit reviews (Saheeh International, Clear Quran, Haleem named). HyPE: no. 11/16 seen.  
"Most accurate Bible translation"²; "Which Bible translations are the most accurate?"²; "what are the best English translations of the Quran"²; "what is the original language of the bible"¹; "Quran translations"²; "best Quran translation reddit"²


### scholarly (3 families, 29 wordings)

**`scholar_authorship_dating`** (judaism, islam, christianity, hinduism, taoism). Who wrote X, when was X written, how old is X  
Frequency: medium. Evidence: qualitative: 'who wrote the Bhagavad Gita' pages abound; Gita dating given as 500 BC-100 AD vs 400 BC-200 CE across pages (search summary, unverified). HyPE: yes. 1/10 seen.  
"who wrote the Bhagavad Gita"²; "who wrote the Torah"³; "when was the Quran written"³; "who wrote the Gospel of John"³; "who wrote the Tao Te Ching"³; "when was the Book of Mormon written"³

**`scholar_history_of`** (bahai, buddhism, islam, christianity, zoroastrianism, confucianism, sikhism, jainism). History of a tradition, event, place or practice  
Frequency: medium. Evidence: qualitative: Crash Course Religions, Pluralism Project; known real-log find_person 10%. HyPE: yes. 0/10 seen.  
"history of Buddhism"³; "history of the Bahá'í Faith in Iran"³; "persecution of Bahá'ís"³; "who founded Sikhism"³; "history of Zoroastrianism in Persia"³; "who was Mahavira"³

**`scholar_world_religion_facts`** (bahai, judaism, sikhism). Oldest religion, how many followers, largest religion  
Frequency: medium. Evidence: qualitative: 'oldest religion' and 'how many religions' pages appear repeatedly (christianity.com, howstuffworks, Crash Course ep 2). HyPE: no. 4/9 seen.  
"what is the oldest religion"²; "how many religions are there"²; "How many religions are there? Crash Course"²; "what about other religions"²; "how many followers does Sikhism have"³; "how many Bahá'ís are there in the world"³


### meta (3 families, 499 wordings)

**`meta_find_work`** (all 11). Find a specific work: "<book> pdf", "read <tablet> online", "full text of"  
Frequency: high. Evidence: qualitative: religion LibGuides (Oakland CC, Princeton sacred texts guide) repeatedly list Sacred-texts, Discovering Sacred Texts, Bible Gateway; find_work 10% in real log. HyPE: no. 312/320 seen.  
"where can I read the Kitab-i-Iqan online"²; "free online sacred texts"²; "bahai holy book name"¹; "bahai holy book pdf"¹; "bahai faith sacred book"¹; "baha'i religious book"¹

**`meta_find_person`** (all 11). Who was X (founders, figures, saints, early believers)  
Frequency: medium. Evidence: qualitative: find_person 10% in real log. HyPE: yes. 159/168 seen.  
"who was bahaullah's wife"¹; "who are the bahais"¹; "abdu'l baha"¹; "who started the baha'i faith"¹; "who was abdu l baha"¹; "who is abdul bahai"¹

**`meta_enumerate_define`** (bahai, judaism, islam, christianity, taoism). List/enumerate ("list of prophets", "how many X are there", "names of God")  
Frequency: low. Evidence: qualitative: enumerate 5%, define_term 11% in real log. HyPE: no. 0/11 seen.  
"list of prophets in Islam"³; "how many prophets are in the Quran"³; "what are the five pillars of Islam"³; "what are the 10 commandments"³; "what are the Noble Eightfold Path steps"³; "how many books of the Bible are there"³

## What this means for HyPE

Our logs say about 34% of queries need no passage search at all (find_work, find_person, library_meta, followup_meta).
The survey supports that split. Families flagged `hype_relevant: false` should not drive per-paragraph questions.

**The per-paragraph questions must cover these:**

1. **Belief questions in seeker words** (`*_beliefs`, the universal families). People type "do jains believe in god",
   "is buddhism a religion", "what happens when you die in hinduism". A doctrinal paragraph needs a question in this
   form, naming the tradition, not only one in the text's own vocabulary. v15's seeker phrasing is right.
   It must also name the tradition: the seeds name one, and so do most real wordings.
2. **Permission and practice questions** (`*_practice`, the practical families). For Islam, Judaism and Jainism, the practice family is
   larger than the beliefs family: "can muslims eat…", "is it haram to…", "why do sikhs wear…",
   "can jains eat potatoes". A paragraph that gives a law should carry a "can/may/is it allowed" question and a
   "why do they" question. The second fits v15's rule of rooting social teachings in their spiritual reason.
3. **"What does X say about Y" and "verse about Y"** (`*_scripture_quotes`, `quote_find_passage`). This is the
   source_says 30% of our logs. Questions should name the scripture or figure ("what does the gita say about duty",
   "guru nanak quotes on equality"), not only the topic.
4. **Term questions** (`*_original_terms`, `orig_word_meaning`). These are the define_term 11%: "what is wu wei",
   "meaning of ahimsa", "arabic word for patience", plus native-script forms (معنی, 什么是道). A paragraph that defines
   or explains a term should have a question that names the transliterated term. The bilingual originals need questions
   in English, with the term in roman letters.
5. **Who was X** (`meta_find_person`) for biographical paragraphs, though entity cards should answer first.
   **Who wrote / when was it written** (`scholar_authorship_dating`) for prefaces, introductions and historical notes.
6. **Comparative questions** (`scope: cross`). A paragraph can only ever speak for one tradition, so HyPE should not
   invent comparisons. What is needed instead is that both halves of "what do Islam and Christianity say about the afterlife" can be
   found separately: each tradition's afterlife paragraphs must carry a question that names the tradition and the topic.
   Comparison is the retrieval layer's job, splitting the query, plus Anís's job of putting the halves together.
   The battery should score each side (the `traditions` field on every cross wording).

**These should not be HyPE work:**

* `meta_find_work` (the "X pdf", "where can I read the kitab-i-aqdas", "hidden words" queries) and holy-book queries
  belong in the catalog and title lookup. As Chad put it: "If a person is looking for a specific tablet, we should not bother with content at all."
* `quote_who_said` and `quote_is_it_real` belong in the phrase index and attribution check.
* `quote_verse_reference` ("john 3:16", "surah 2 255") belongs in reference parsing.
* `orig_arabic_persian` and `orig_translation_compare` belong in originals-to-translation alignment.
* `scholar_world_religion_facts` ("how many sikhs are there") and `meta_enumerate_define` belong in metadata
  and statistics, which Anís should answer as such or decline.

**For the test battery:**

* Sample evenly by tradition, for example 10 per tradition × kind, and use autocomplete rank 1 to 3 when a family has them.
* Add the cross wordings, scored per side.
* Keep the `via` tag on each item, so results on typed queries can be read apart from results on invented ones.
* The 32 Keyword Planner queries remain the only queries with volume figures. Keep them as the head of the battery.

## Sources

All 124 sources are in `sources[]` in the JSON, each with what it gave and a quality rating. These carried the most weight:

* [Bahá'í FAQ (gy.bahai.org)](https://gy.bahai.org/faq.html) — 19 FAQ question wordings (high)
* [Access to Insight FAQ](https://www.accesstoinsight.org/faq.html) — real FAQ question wordings (high)
* [Lion's Roar 7 Things the Buddha Never Said](https://www.lionsroar.com/what-the-buddha-never-said/) — 7 fake quotes (high)
* [fakebuddhaquotes.com](https://fakebuddhaquotes.com/) — titles of fake quote pages (high)
* [Hinduism Way of Life Q&A](https://hinduismwayoflife.com/?p=2555) — 24 real user-submitted Hindu questions (high)
* [Hinduism Way of Life question archive (pages 1-4)](https://hinduismwayoflife.com/page/2/) — ~50 distinct real user-submitted Hindu questions (karma, guru, caste, Gita, Muslim/Hindu, free will, epics); a few Tamil (high)
* [Google autocomplete endpoint (many prefixes, en/ar/iw)](https://suggestqueries.google.com/complete/search?client=firefox&q=) — Real autocomplete suggestions for Islam and Judaism queries; ranked order only, no volumes (high)
* [r/taoism thread](https://lr.ggtyler.dev/r/taoism/comments/1fhyk2h/taoism_and_buddhism_whats_the_difference/) — real thread title (high)
* [Pew 2021: Few Americans blame God](https://www.pewresearch.org/religion/2021/11/23/few-americans-blame-god-or-say-faith-has-been-shaken-amid-pandemic-other-tragedies/) — Suffering-belief statements and percentages; afterlife 73% heaven, 62% hell (high)
* [Pew Religious Landscape Study 2023-24 beliefs](https://www.pewresearch.org/religion/2025/02/26/religious-and-spiritual-beliefs/) — Soul 86% (Christians 95, Buddhists 90, Muslims 88, Hindus 84, Jews 74); heaven Christians 85, Muslims 83, Buddhists 52, Hindus 48, Jews 39 (via search snippet) (high)
* [BahaiTeachings.org asking questions series](https://bahaiteachings.org/series/asking-questions) — 6 article-title questions (medium)
* [Slavin: What do Bahá'ís believe?](https://bahai-library.com/slavin_answers_common_questions) — 3 question headings (medium)
* [Avesta Zoroastrian FAQ](https://www.avesta.org/zfaq.html) — 6 FAQ headings (medium)
* [r/Zoroastrianism mirror results](https://reddit.birdcat.cafe/r/Zoroastrianism) — thread titles (converting, where to start, how to) (medium)
* [r/bahai mirrors](https://redlib.ssps.io/r/bahai) — thread titles (medium)
* [chan.hr Questions about Buddhism](https://chan.hr/en/questions-about-buddhism/) — 5 FAQ wordings (medium)
* [SuttaCentral thread](https://discourse.suttacentral.net/t/did-the-buddha-really-say-this/36939) — "Did the Buddha really say this?" (medium)
* [Lion's Roar Is Buddhism a Religion](https://www.lionsroar.com/is-buddhism-a-religion/) — title wording (medium)
* [NPR santhara](https://www.npr.org/sections/goatsandsoda/2015/09/02/436820789/fasting-to-the-death-is-it-a-religious-rite-or-suicide) — title (medium)
* [esamskriti Why do Sikhs wear TURBANS](https://esamskriti.com/e/History/Indian-History/Why-do-Sikhs-wear-TURBANS-1.aspx) — title + search summary of PAA-style questions (medium)
* [SikhNet answers Is it okay to eat meat](https://answers.sikhnet.com/question/7485/is-it-okay-to-eat-meat) — title (medium)
* [Hinduism Today Are Sikhs Hindus or Not?](https://hinduismtoday.com/magazine/september-october-2000/2000-09-are-sikhs-hindus-or-not-rajeev-and-rajeevan-take-opposite-sides-on-a-contentious-issue-now-in-the-fore-in-india/) — title (medium)
* [Kadampa](https://kadampa.org/podcast/why-do-buddhists-gather) — title (medium)
* [r/Buddha mirror](https://lr.in.psf.lt/r/Buddha/comments/1ea6thu/why_dont_buddhists_eat_meat) — Reddit thread title (medium)
* [r/Sikh mirror](https://pol1.lr.ggtyler.dev/r/Sikh/comments/1kc23lx/amrit_singh_vs_non) — Reddit thread title (medium)
* [Tricycle beginners](https://tricycle.org/beginners/?p=158) — FAQ titles (medium)
* [fakebuddhaquotes post](https://fakebuddhaquotes.com/holding-on-to-anger-is-like-grasping-a-hot-coal-with-the-intent-of-harming-another-you-end-up-getting-burned/) — post title (medium)
* [comparison article titles (several)](https://hinduwebsite.com/buddhism/karma-hinduism-buddhism.asp) — comparison titles (medium)
* [La Vista Church of Christ: most asked questions](https://www.lavistachurchofchrist.org/cms/what-are-the-most-asked-questions-by-people/) — 20 real top-searched Christian question wordings (medium)
* [Catholic Answers Q&A](https://www.catholic.com/qa) — Real Catholic question titles (medium)
* [christianityfaq.com](https://christianityfaq.com/) — Denomination/canon question titles (medium)
* [Going Farther Common Questions](https://goingfarther.net/common-questions/) — 8 core Christian seeker questions (medium)
* [Ann Arbor Hinduism FAQ](http://www.annarbor.com/faith/hinduism-frequently-asked-questions) — 4 FAQ wordings (medium)
* [Hinduism Today: Four Questions](https://www.hinduismtoday.com/2011-10-educational-insight-four-questions-people-ask-about-hinduism/) — 4 headings (medium)
* [Himalayan Academy 14 Questions](https://himalayanacademy.com/blog/taka/?p=10544) — Topic list only (cow worship, cremation, caste, many gods, karma, reincarnation, idols, yoga); individual questions not fetchable (medium)
* [Bible Gateway year in review](https://www.biblegateway.com/year-in-review/2019/) — Top keywords/verses (love, fear, strength, peace; John 3:16 etc.); no counts quoted (medium)
* [Why Do Catholics...? Honest Answers (22 headings)](https://equippinggodlywomen.com/faith/why-do-catholics-honest-answers-to-your-burning-questions/) — 22 real 'why do Catholics' question headings (medium)
* [ebible.com questions page](https://ebible.com/questions/6178) — Real Bible/Christian Q titles incl. salvation, trinity, assurance (medium)
* [christianity.net.au questions](https://christianity.net.au/questions/can_you_explain_the_trinity_please) — 12 real seeker question titles (medium)
* [r/hinduism thread 'Hinduism isn't polytheistic' (mirror)](https://nyc1.lr.ggtyler.dev/r/hinduism/comments/r9kwq2/hinduism_isnt_polytheistic) — One real Reddit r/hinduism thread title (site: search for reddit/quora does not return reddit/quora pages; mirrors rare) (medium)
