# Research patterns — how people actually study scripture (catalog, 2026-10-01)

Each pattern = what the reader is doing → strategy + re-ranker + format (planning/search-strategy-layer.md).
Status: **S** serve now · **P** partly · **L** lacks a data layer (named). Tool features cited; uncited = "commonly".

## A. Study
| # | Pattern | Doing | Example queries | Needs | Rank | Format | Status |
|---|---|---|---|---|---|---|---|
| 1 | Passage guide (Logos) | everything about one passage | "help me study Gleanings CXXV" | original, translations, who quotes it, commentary, people, terms | by resource kind, authority | study sheet | P — commentary→passage links, citation scheme |
| 2 | Exegetical / word-by-word (Logos) | read through the original words | "the Arabic words in this verse" | phrase alignment, lexicon, concepts | document order | original+translation with term gloss | P — root/lemma index |
| 3 | Study-circle sequence (Ruhi) | ordered passages + questions | "a study guide on prayer" | concept kernel passages, HyPE questions | simple→hard, authority | passage, comprehension q, reflection q | P — sequencing rule |
| 4 | Topical compilation (Lights of Guidance, RD compilations) | every authoritative passage on a topic, grouped | "compile the writings on consultation" | concepts, HyPE, authority, exhaustive | authority → subtopic → chronology | compilation with subheads | S/P — subtopic clustering |
| 5 | Word study (Strong's, BLB) | how one word is used and translated | "how is ḥikmat translated" | original term → aligned renderings, counts | frequency, authority | term with renderings + examples | P — root/lemma index |
| 6 | Concordance (al-Muʿjam al-Mufahras) | every occurrence of a word/root | "every verse with root ʿ-l-m" | exhaustive, root-aware | canonical order | keyword in context | P — root index, canonical order |
| 7 | Topical index / Factbook (Logos) | start from a thing | "tell me about Ṭáhirih" | entity graph, doc_meta, concept card | salience | entity/people record | S |
| 8 | Outline of a work | structure of a book | "outline the Íqán" | headings, argument threads | document order | outline | P — argument threads (enrichment P6) |
| 9 | Talk / fireside prep (Logos Sermon Builder) | theme + passages + stories | "quotes for a talk on unity" | concepts + narrative passages | expressiveness + variety | claim → passage → story | S/P — genre tags |

## B. Interpretive
| # | Pattern | Doing | Example | Needs | Rank | Format | Status |
|---|---|---|---|---|---|---|---|
| 10 | Commentary lookup (Sefaria connections; tafsir by ayah) | what interpreters say about this verse | "how did ʿAbdu'l-Bahá explain this verse" | commentary→verse links (explains, not only quotes) | interpretive authority | verse + layered commentary | L — commentary→passage table |
| 11 | Authority layers | binding text vs interpretation vs opinion | "is this authoritative" | authority tiers + #10 | strict tier | authority_layers | S (format) / P |
| 12 | Thematic tafsir (tafsīr mawḍūʿī) | a scripture's own verses on a theme | "what does the Qur'an say about patience, all verses" | concepts within one work/author, exhaustive | canonical, subtheme | synthesis citing every verse | P — canonical verse ids |
| 13 | Occasion of revelation (asbāb al-nuzūl) | why and to whom it was revealed | "who was the Tablet of Aḥmad written for" | tablet_meta (recipient, date, place), entities | authority | context card | S (Bahá'í tablets) / L (Qur'an: no asbāb table) |
| 14 | Scripture interprets scripture (TSK; Qur'an-by-Qur'an) | other passages on the same thought | "where else does Bahá'u'lláh say this" | concept co-membership, phrase neighbours, quote links | same author, authority | cross-reference list | P — stored cross-reference table |
| 15 | Abrogation / supersession (naskh) | which ruling is current | "did later guidance change this" | chronology + same-concept link | latest first | timeline, governing passage marked | L — dates + "supersedes" |
| 16 | Law from proof-text (fiqh; halakhic chain) | trace a practice to its text | "what's the basis for the 19-day fast" | Aqdas/notes, quote links | authority, chronology | chain of derivation | P — typed derives-from relation |
| 17 | Q&A guidance (Questions and Answers; Lights of Guidance) | a practical question already asked | "can Bahá'ís drink alcohol for medicine" | HyPE ↔ letters of guidance | answerhood + authority | yes/no with proof | S |

## C. Scholarly
| # | Pattern | Doing | Example | Needs | Rank | Format | Status |
|---|---|---|---|---|---|---|---|
| 18 | Reception history (Blackwell commentaries) | who quoted/commented over time | "who quotes the Tablet of Wisdom" | reverse source links + author + date | chronological | chain of quotation / timeline | P — dates on works |
| 19 | Citation tracing | where a quoted line comes from | "where is 'the earth is but one country' from" | quote → source → original | source first | published rendering + source | S |
| 20 | Intertextuality / allusion | echoes without quotation | "what Qur'anic verse does this allude to" | cross-lingual sub-quote matching vs Qur'an/Bible | similarity, canonicity | allusion list, both texts | P — Qur'an verse ids + allusion matcher |
| 21 | Development of a concept | how an idea develops over periods | "earliest mention of the Lesser Peace" | concept spans + dates | chronological | timeline of passages | L — chronology |
| 22 | Term / translation history | how a rendering changed | "early vs Shoghi Effendi renderings of X" | multi-translation alignment + translator/date | chronology, translator authority | rendering table | P — translator/edition metadata |
| 23 | Prosopography | people networks | "people who met both the Báb and Bahá'u'lláh" | entity graph, encounters, recipients | graph distance | people record | S |
| 24 | Parallel accounts / harmony (Accordance parallels) | one event in several sources | "compare the accounts of the Báb's martyrdom" | event → every account passage | column per source | comparison table | P — event→account table |
| 25 | Source criticism | what an account depends on | "where did Shoghi Effendi get this detail" | quote links + event accounts | dependency | chain of quotation | P (as #24) |
| 26 | Timeline (Accordance Timeline) | events in order | "timeline of the Adrianople period" | dated entity events | chronological | timeline | P — dated-event coverage |

## D. Textual
| # | Pattern | Doing | Example | Needs | Rank | Format | Status |
|---|---|---|---|---|---|---|---|
| 27 | Find the original | Arabic/Persian behind English | "the Persian of this Hidden Word" | alignment, phrase index | original first | original + translation | S (planned strategy) |
| 28 | Translation comparison | several renderings of one passage | "Shoghi Effendi vs a provisional translation" | alignment 1:N | translation authority | comparison table | P — translation-authority re-ranker |
| 29 | Textual variants / editions (qirāʾāt) | differences between witnesses | "variants of this passage in the INBA volumes" | aligned witnesses | edition authority | variant apparatus | L — witness/variant table |
| 30 | Transmission grading (isnād) | reliability of an attributed saying | "is this hadith authentic" | isnād graph + grades | grade | chain + grade | L — isnād graph (also pilgrim notes) |
| 31 | Exact quotation | recalls wording | — | phrase index | none | passage list | S |

## E. Comparative
| # | Pattern | Doing | Example | Needs | Rank | Format | Status |
|---|---|---|---|---|---|---|---|
| 32 | Same theme across traditions | how religions treat a theme | "the Golden Rule in every religion" | tradition sub-queries, concepts | diversity | comparison / range of voices | S |
| 33 | Prophecy and fulfilment | earlier prophecy ↔ later claim | "biblical prophecies the Bahá'í writings say are fulfilled" | quote links into Bible/Qur'an, allusion | interpreter authority | prophecy → interpretation pairs | P — canonical refs + #10 |

## F. Devotional
| # | Pattern | Doing | Example | Needs | Rank | Format | Status |
|---|---|---|---|---|---|---|---|
| 34 | Prayer by occasion | a prayer for a need | "prayer for the departed" | prayer genre + occasion tag | popularity, authority | the prayer whole | P — genre/occasion tags (from prayer-book structure) |
| 35 | Daily reading plan (Logos, Quran.com, Sefaria calendars) | sequential portions | "a 19-day reading plan for the Íqán" | document order, segments | sequence | reading + reflection question | S/P — user state |
| 36 | Reflection / memorisation (Quran.com) | dwell on one short passage | "a short passage to memorise on hope" | concept + length + expressiveness | brevity × expressiveness | one passage + study question | S |

## First ten (value × feasibility)
1 passage guide · 2 who quotes this (reception, authority-ordered until dates exist) · 3 topical compilation ·
4 occasion of revelation (tablets) · 5 study-circle sequence · 6 translation comparison · 7 cross-references
(precomputed offline) · 8 word study · 9 prayer by occasion · 10 parallel accounts.

## Missing data layers, ranked by patterns unlocked
1. **Chronology** — revelation/writing date per work and passage (seed: tablet_meta Phelps dates, doc_meta, author
   lifespans) → #15 #18 #21 #22 #26 #33 + chronological ranking.
2. **Commentary→passage links** (explains / applies / mentions; seed: quote links + Jev classification) → #1 #10 #11
   #16 #25 #33.
3. **Canonical citation scheme** (sura:ayah, book:chapter:verse, Phelps PIN + ¶, Gleanings section) → #6 #12 #14
   #20 #33.
4. **Arabic/Persian root–lemma index** (small new index) → #2 #5 #6 #20.
5. **Typed passage↔passage relations** (cross-reference, parallel account, allusion, supersedes, derives-from;
   generalises content_source_links) → #14 #15 #16 #20 #24 #25.
6. **Genre / occasion tags** (prayer, law, story, exhortation, prophecy) → #9 #34 #36 #3.
7. **Translator / edition metadata** → #22 #28.
8. **Witness / variant alignment** → #29.
9. **Isnād graph** → #30.

## Sources
Logos Passage/Exegetical Guides: wiki.logos.com/Passage_Guide, wiki.logos.com/Guides, community.logos.com/kb/articles/897 ·
TSK: blueletterbible.org/help/tsk.cfm · STEP Bible: stepweb.atlassian.net (Quick overview, Language Tools) ·
Accordance: ligonier.org/blog/accordance-8-a-review · Sefaria: developers.sefaria.org/reference (related, topics graph) ·
Quran.com: quran.com/about-us · asbāb al-nuzūl: iis.ac.uk (Rippin) · al-Muʿjam al-Mufahras · tafsīr mawḍūʿī: seekersguidance.org ·
Blackwell Bible Commentaries (reception history) · Ruhi study circles: bahaipedia.org/Study_circle · Lights of Guidance: bahai.works.
