# Anís writer A/B — format (2026-11-03, pipeline)

Role `assistant-answer` (baseline `gemini:gemini-3.5-flash-lite`), mode current, judge `claude-opus-5-5` (blind, pairwise, order randomised), seed ab1.
60 questions: 51 judged, 9 not applicable, 0 errors. Spend: Anís $0.351, judge $1.431.

## Contender vs reference

| contender | reference | n | win | tie | loss | accuracy (c / r) | completeness (c / r) | brevity (c / r) | format_fit (c / r) |
|---|---|---|---|---|---|---|---|---|---|
| none | tmpl | 51 | 20 | 0 | 31 | 3.18 / 3.29 | 3.22 / 3.22 | 2.65 / 3.12 | 2.73 / 3.06 |

## Writing step per variant

| variant | writer | n | median ms | p90 ms | mean $ | mean words | mean links |
|---|---|---|---|---|---|---|---|
| tmpl | gemini:gemini-3.5-flash-lite | 51 | 4048 | 5485 | 0.00282 | 204 | 5.1 |
| none | gemini:gemini-3.5-flash-lite | 51 | 4472 | 5836 | 0.0029 | 246 | 5.2 |

## Per question type

| class | n | none vs tmpl W/T/L | tmpl ms / $ / words | none ms / $ / words |
|---|---|---|---|---|
| A1 · A fact | 2 | 0/0/2 | 5185 / 0.00276 / 222 | 5804 / 0.00347 / 367 |
| A2 · Find a book or text by its name | 2 | 2/0/0 | 4016 / 0.00206 / 119 | 2660 / 0.00183 / 85 |
| A3 · Find passages on a topic | 2 | 2/0/0 | 5104 / 0.00226 / 171 | 5160 / 0.00227 / 192 |
| A4 · A quotation | 1 | 0/0/1 | 4722 / 0.00301 / 221 | 5040 / 0.00282 / 169 |
| A5 · Look up a reference | 1 | 0/0/1 | 2316 / 0.00211 / 91 | 2901 / 0.00239 / 109 |
| A6 · What a word or term means | 1 | 1/0/0 | 6058 / 0.00321 / 357 | 6357 / 0.00345 / 157 |
| B1 · What a tradition or figure teach | 2 | 0/0/2 | 4572 / 0.00341 / 267 | 5006 / 0.00308 / 362 |
| B2 · Explain a specific passage the r | 2 | 1/0/1 | 3610 / 0.00279 / 222 | 4472 / 0.00354 / 220 |
| B3 · Why or how | 2 | 1/0/1 | 4430 / 0.00278 / 178 | 5892 / 0.00367 / 322 |
| B4 · Tell a story or historical event | 2 | 1/0/1 | 4805 / 0.00286 / 250 | 4850 / 0.00284 / 337 |
| B5 · Who a person was | 1 | 0/0/1 | 4784 / 0.00225 / 81 | 4885 / 0.00228 / 142 |
| C1 · Two or more named traditions com | 1 | 1/0/0 | 3024 / 0.0025 / 231 | 3655 / 0.00279 / 291 |
| C2 · X vs Y head to head | 2 | 1/0/1 | 3972 / 0.00291 / 234 | 4338 / 0.00305 / 439 |
| C3 · What all or most religions say a | 2 | 0/0/2 | 18708 / 0.00382 / 312 | 5352 / 0.00333 / 318 |
| C4 · Two accounts | 1 | 0/0/1 | 3504 / 0.00273 / 133 | 4472 / 0.00321 / 322 |
| D1 · Personal grief | 2 | 1/0/1 | 4320 / 0.00279 / 287 | 4450 / 0.00278 / 306 |
| D2 · A prayer for an occasion or need | 2 | 0/0/2 | 7332 / 0.00274 / 173 | 6646 / 0.00331 / 271 |
| D3 · Religious law | 2 | 1/0/1 | 4487 / 0.00249 / 95 | 4330 / 0.00272 / 149 |
| D4 · Community life and service | 1 | 0/0/1 | 3913 / 0.00259 / 70 | 4378 / 0.00269 / 88 |
| D5 · Joining or leaving | 2 | 2/0/0 | 4853 / 0.00344 / 71 | 5548 / 0.00293 / 231 |
| E1 · Pushback | 1 | 1/0/0 | 4184 / 0.00221 / 196 | 4739 / 0.00278 / 315 |
| E2 · Asks for something that may not  | 1 | 1/0/0 | 4135 / 0.00219 / 89 | 4771 / 0.00275 / 154 |
| E3 · A controversial or sensitive top | 1 | 0/0/1 | 6062 / 0.00346 / 242 | 6786 / 0.00344 / 435 |
| F1 · Compile quotations or passages o | 2 | 0/0/2 | 3290 / 0.00264 / 249 | 5186 / 0.00248 / 191 |
| F2 · Prepare a devotional program or  | 2 | 1/0/1 | 4792 / 0.00218 / 80 | 5100 / 0.00245 / 124 |
| F3 · Prepare a study session | 1 | 1/0/0 | 4778 / 0.00346 / 286 | 4722 / 0.00357 / 169 |
| F4 · Make a timeline | 2 | 0/0/2 | 3490 / 0.00264 / 191 | 3321 / 0.00238 / 181 |
| F5 · A research brief or long written | 1 | 0/0/1 | 6474 / 0.00406 / 384 | 6692 / 0.00376 / 434 |
| F6 · Teach me over time | 1 | 0/0/1 | 3886 / 0.00272 / 264 | 3269 / 0.00229 / 133 |
| G2 · Follow-up | 1 | 1/0/0 | 3242 / 0.00237 / 257 | 5247 / 0.00249 / 258 |
| G3 · Follow-up | 1 | 0/0/1 | 3848 / 0.00349 / 366 | 3651 / 0.00249 / 138 |
| G4 · Follow-up | 1 | 1/0/0 | 2596 / 0.00379 / 337 | 1836 / 0.00281 / 143 |
| G5 · Follow-up | 1 | 0/0/1 | 4226 / 0.00232 / 143 | 5215 / 0.00311 / 243 |
| G6 · Follow-up | 1 | 0/0/1 | 4766 / 0.00275 / 170 | 5836 / 0.00374 / 370 |
| H2 · Vague opener or bare word where  | 1 | 0/0/1 | 3907 / 0.00354 / 251 | 3049 / 0.00272 / 305 |

## Lost by ≥2 on a dimension (34)

- **q1** A1 — tmpl beat none on completeness: B gives a clear list of every person the evidence names, including Mírzá Hádí, which A leaves out; both waste space on an unrelated breakdown of source categories, and B wrongly says Hádí travelled with the twenty-five men, when it was Munírih Khánum's father.  
  _I am student and I need to know, who is participate in the Badasht Conference? In my list it is event, relation is participated-in. Please tell me all the names_
- **q6** C2 — none beat tmpl on completeness: B actually compares the two relationships and frames the Dublin passage more carefully. A attributes Harmon's words directly to 'Abdu'l-Bahá, adds the off-topic Abraham–Krishna quote and has broken nested links.  
  _Krishna and Arjuna vs Jesus and his disciples_
- **q7** F4 — tmpl beat none on accuracy: Both answers misread the question as being about God "drawing near". B at least quotes a relevant Zohar passage on God's incomparability with a correct link. A links to siftersearch URLs that are not in the evidence, and it uses neither the Zohar nor the Likutei Moharan passage on depicting God.  
  _judaism god drawing_
- **q10** A6 — none beat tmpl on accuracy, brevity, format_fit: A is short, says plainly that the evidence never uses the word "taqwah", and quotes both sources accurately. B pads its answer with scholarship claims the evidence doesn't support, wrongly lists taqiyyah as a piety term, adds Arabic text that isn't in the evidence, and wraps it in a bloated structure.  
  _What is taqwah? I want to know about this virtue in Islam._
- **q13** A4 — tmpl beat none on accuracy: A invents an Arabic text and a "provisional translation," and claims an Edirne origin that the evidence doesn't support. B is correctly attributed, though it is wordy and has some made-up page numbers.  
  _And let the angelic spirits enter, in the Name of_
- **q14** A2 — none beat tmpl on accuracy, brevity: A is brief and links straight to the book. B uses a siftersearch link that is not in the evidence and quotes the same description it had just paraphrased.  
  _Find the Dhammapada for me, please._
- **q15** F1 — tmpl beat none on completeness, format_fit: B quotes Moses's words from the evidence and links each passage correctly, though it adds siftersearch links that aren't in the evidence. A only paraphrases, attaches the Sura XX link to Sura XXVI, and adds an off-topic paragraph about levels of authority.  
  _moses quotes from the bible_
- **q16** C3 — tmpl beat none on completeness, format_fit: A quotes and attributes most of the relevant passages correctly, though it repeats itself. B has broken formatting and an orphaned footnote, and spends a paragraph on Bahá'í layers of authority that has nothing to do with the question.  
  _What do end times prophecies say about universal liberation?_
- **q19** B4 — tmpl beat none on brevity, format_fit: B covers the same history in a short paragraph. A adds an irrelevant bullet list about kinds of sources, repeats the same link over and over, and leaves its [3, 4] citations unlinked.  
  _bahai history in iran_
- **q20** B1 — tmpl beat none on accuracy, brevity, format_fit: B's quotes are clean and properly linked, and it adds the Romans passage. A's quotes are broken, with stray marks and a link dropped mid-quote, and it ends with a vague filler paragraph.  
  _Can non-Jews go to Heaven?_
- **q22** B3 — none beat tmpl on completeness: A has an irrelevant paragraph on layers of authority, but it uses more of the evidence (Bahá'u'lláh, the Mathnavi, the Jain treatise, Laozi) and explains the connection to purpose better. B is concise but thin. Neither quotes the Gita, the most relevant passage.  
  _How does achieving self-realization of the eternal soul connect to one's existential purpose?_
- **q23** D3 — none beat tmpl on accuracy, completeness, format_fit: Answer A gives the three-times-daily practice and the requirement of inner intention, and both points are properly cited. Answer B mentions a "fixed schedule" without saying what it is, links to siftersearch.com, which is not in the evidence, and repeats its citations.  
  _how do jews pray_
- **q25** G5 — tmpl beat none on accuracy, brevity: A gives the correct number, Arabic No. 68, and makes a short, sound comparison. B mislabels the passage as Persian No. 68, then contradicts itself, and pads the answer, though its comparison uses more of the evidence.  
  _OK, now I understand it is Hidden Words, but the number is still not clear for me. You said the passage is quoted in *The Earth Is But One Country*. How does th_
- **q26** C1 — none beat tmpl on format_fit: B compares Islam and Christianity clearly, with quotes that are cited correctly, though it adds unsourced claims about grace. A duplicates its links, includes links that aren't in the evidence, and adds an irrelevant Sikh passage.  
  _heaven and hell in the islam vs christianity_
- **q28** B5 — tmpl beat none on brevity: A is shorter and closer to the evidence. B credits Pārśva to the Treatise, which never mentions him, uses a Dasgupta link that is not in the evidence, contradicts itself and adds filler. Neither answer uses the four-vows detail or the 250-years detail.  
  _Tell me about the twenty-third ford-maker in the narratives of the Jain tradition._
- **q29** E2 — none beat tmpl on format_fit: Both answers correctly say the evidence has nothing from the Torah on this. B points to the relevant sources with clean links, while A has messy duplicated links that are not in the evidence.  
  _what does the torah say about jesus' death_
- **q30** G6 — tmpl beat none on brevity, format_fit: A is short and quotes the relevant sutra passages with links, though it wrongly says "the Buddha" is speaking and adds an off-topic Tao Te Ching line. B pads its answer with a greeting, a sign-off and an irrelevant paragraph about layers of religious authority.  
  _So you can't give me the fuller passage or a location, and your own earlier claim about Buddhist texts "deconstructing clinging itself" rests on a fragment you _
- **q31** C4 — tmpl beat none on brevity, format_fit: B gives a short, linked list of the translations the evidence actually names (Rodwell, Pickthall, Yusuf Ali). A pads its answer with an off-topic list of levels of authority and credits the footnote to Ibn 'Arabi himself, when it is an editor's note.  
  _what are the best English translations of the Quran_
- **q32** F3 — none beat tmpl on accuracy: A sticks to the evidence, even though it leaves out the Yusuf Ali verse (2:153). B adds Arabic text, translator names and an 'authorized translation' label that the evidence doesn't contain, and it pairs the Arabic of 32:24 with al-Ghazzali's paraphrase.  
  _Great, let's start there. What does the Quran say about patience?_
- **q37** E3 — tmpl beat none on brevity: A answers both parts directly and briefly, despite one broken nested link. B pads its answer with an irrelevant list of "layers of authority" and dodges the prayer question.  
  _Is Allah the Same as the God of Christianity, and Is It OK for Christians to Pray to Allah?_
- **q38** A1 — tmpl beat none on accuracy, brevity, format_fit: A answers the simple factual question in one sentence that the evidence supports. B is padded with off-topic scripture quotes and duplicate links, and it invents a citation and translation credit.  
  _which religion is the largest in the world_
- **q39** F2 — tmpl beat none on brevity: B says plainly that the evidence holds no hadith and points to the Ghazali heading. A offers a Qur'an passage in place of hadith without saying none were found, and adds filler.  
  _hadith quotes of the day_
- **q40** A3 — none beat tmpl on accuracy, completeness: B draws on the relevant evidence: the Mahabharata note on āgama and the Uttaradhyayana passage on Sūtras and Aṅgas. A quotes an unrelated Bahá'í passage and adds a Persian text that isn't in the evidence.  
  _I've been reading about various scriptural traditions and their different literary forms, and I'm particularly curious about how the Agamas address or reference_
- **q41** D2 — tmpl beat none on accuracy, brevity, format_fit: A quotes and links the Báb's prayer and keeps it short. B quotes the same passage twice, adds an Arabic "original" that the evidence does not contain, and pads the answer with a greeting and an unrelated paragraph on sources of authority.  
  _دعاء الرزق_
- **q42** D5 — none beat tmpl on completeness: A gives a definition and links the key passage where Shoghi Effendi rejects the "Asiatic cult" label, though its unsupported list of authority categories is filler; B says nothing and cites nothing.  
  _what is a cult (r/bahai)_
- **q43** C2 — tmpl beat none on brevity, format_fit: A states the main differences accurately and concisely, with quotes linked to their sources. B adds Dhammapada and ‘Abdu’l-Bahá passages that don't address the difference, repeats its links and embellishes some claims.  
  _what is the difference between Jainism and Buddhism_
- **q49** G4 — none beat tmpl on accuracy, brevity: B makes up an ending for the cut-off Days of Remembrance quote that the evidence doesn't contain, and it has a broken link and extra padding. A is accurate and concise, though it leaves out the passage about work.  
  _That Days of Remembrance quote cuts off mid-word at "al[l]", so is there a passage where Bahá'u'lláh or 'Abdu'l-Bahá explicitly says that detachment does not me_
- **q51** A2 — none beat tmpl on brevity: A is shorter and correctly points to Saunders' English translation. B wrongly lumps that translation in with "indexes and comparative notes" and closes with filler.  
  _dhammapada quotes in english_
- **q53** C3 — tmpl beat none on brevity, format_fit: A covers the same traditions more briefly with clean links. B adds siftersearch links that aren't in the evidence and repeats its attributions clumsily. Both wrongly present Brown's paraphrase in the Tablet source as Bahá'u'lláh's own words.  
  _do all religions teach the soul?_
- **q54** D1 — tmpl beat none on accuracy, format_fit: B calls an existing translation a "provisional translation by Anís", which isn't true. It also has a stray Hindi word and broken link formatting. A gets its quotes right and is formatted more cleanly, with only small attribution slips in the Sikh section.  
  _How do I let go of my anxiety about death and about the meaning of life?_
- **q56** B4 — none beat tmpl on format_fit: A covers the same ground with cleaner citations. B credits Adib Taherzadeh, who isn't in the evidence, and clutters the text with doubled links. A's weaknesses are smaller: it drops the "generally believed" hedge on the earliest-revelation claim and pins the "Year Nine" point on the wrong source.  
  _Bahá'u'lláh was imprisoned in the Síyáh-Chál (Black Pit) of Tehran in 1852 — the moment of his revelation. What happened in that pit, and why does it matter tha_
- **q57** B1 — tmpl beat none on accuracy, format_fit: Answer A sticks to the evidence and links each source correctly. Answer B uses siftersearch links that aren't in the evidence and adds Arabic text that isn't there either. It also gives Sura XXIX the wrong link and ends with a Bahá'í paragraph that has nothing to do with the question.  
  _What do Islamic teachings emphasize about showing honor and deference to one's mother and father?_
- **q58** B2 — none beat tmpl on accuracy, completeness, format_fit: B explains Mendelssohn's link with accurate, linked quotes; A adds made-up German translations with false credits and little explanation.  
  _How does this passage connect the development of human society to our reason for being?_
- **q60** D3 — tmpl beat none on accuracy: B is more concise and doesn't misuse its sources, though it ends with filler. A adds links that aren't in the evidence, quotes "permissible" with no context, and treats an editorial note as Al-Kulayni's own advice.  
  _are muslims allowed to celebrate halloween_
