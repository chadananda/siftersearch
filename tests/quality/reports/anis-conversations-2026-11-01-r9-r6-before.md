# Anís conversations 2026-11-01 (r9-r6-before)

10 conversations, 50 turns, 0 errors. Overall 2.95/10. Cost $7.462 ($0.7462/conversation: Anís $0.1483, reader $0, judge $3.139, Perplexity $0.2842, source-compare judge $3.8905).
Latency p50 7.4 s, p90 11.6 s, max 15.7 s, 2 turns over 15 s.

Judged 2× per conversation: overall per judge 2.8 / 3.1; per-conversation spread mean 0.5, max 1; defects per judge 103 / 104 (defects below are judge 1's).

| dimension | mean (1–5) |
|---|---|
| grounding | 2.35 |
| citation_links | 2.95 |
| follow_up_resolution | 1.95 |
| coherence | 1.95 |
| depth | 1.85 |
| honesty_absence | 2.05 |
| authority_ordering | 3 |
| tone | 2.9 |
| latency | 4.3 |

Defects: 103 — by stage gate 1, strategy 9, follow_up_context 10, retrieval 15, selection 8, answer 58, latency 2; by severity critical 14, major 55, minor 34.

## soul-after-death — seeker (conv_6cfa7e32-16b1-4573-b41c-59df096d1a17)

Theme: what happens to the soul after death and whether we will know our loved ones

**3/10 (judges 3 / 3, spread 0; defects 8 / 11)** — A grieving seeker asked whether she will recognise her grandmother. Turns 2–4 drifted into what "primary scripture" means and an irrelevant Íqán line, and the explicit request for exact words got a passage on stages of the soul. The decisive 'Abdu'l-Bahá text ("This fact is certain") only appeared in turn 5, after the reader had supplied it herself.

- T1 *opening* (7.3 s, topic, history 0): Hello Anís. My grandmother passed away a few months ago, and I keep wondering where she is now, and whether I'll actually recognize her someday. Do these texts 
  - **answer** [major] A boilerplate disclaimer opens the reply to a grieving reader. There is no acknowledgement of her loss and no invitation to go further.
  - **retrieval** [minor] The most direct Bahá'í text on recognition, 'Abdu'l-Bahá's tablet, was not retrieved, and 'where she is now' was not addressed.
- T2 *reference* (5.5 s, fact, history 2): That's a little disappointing, but when you say traditions approach it through their primary scriptures and commentaries, does that mean there are some in the l
  - **follow_up_context** [major] The search used the raw meta-question with no topic. It retrieved generic hits on 'tradition' and 'commentary', and the reply quoted the Íqán on Muhammad's 'twin weighty testimonies', which has nothing to do with the afterlife.
- T3 *deepen* (6.7 s, define, history 4): You said the texts "point to primary scriptures and their commentaries as places to search" — what does "primary scriptures" actually mean here, and which ones 
  - **retrieval** [major] Asked which primary scriptures speak to where her grandmother's soul goes, Anís names the Kitáb-i-Íqán and a vague Gathas line. He never names the Bahá'í Writings that actually deal with the afterlife.
  - **answer** [minor] The Mahabharata and Ramanuja's commentary are named with no link, and they don't bear on the question.
- T4 *absent* (4.8 s, quote, history 6): Let's start with the Bahá'í writings, since you mentioned "various tablets concerning the soul and the afterlife" — is there a specific passage in them where it
  - **strategy** [critical] The reader asked for a passage saying we will recognise loved ones. The planner ran a quote search on Anís's own paraphrase ('various tablets concerning the soul and the afterlife') and returned one passage about stages of the soul that doesn't mention recognition.
  - **answer** [major] A bare blockquote with broken markdown, no explanation, and no admission that it doesn't speak of recognition. It also ignores the relevant passage he himself gave in turn 1.
- T5 *compare* (5.6 s, topic, history 8): That's more comforting than I expected, especially "the Kingdom is the world of vision where all the concealed realities will become disclosed." How does that c
  - **answer** [major] The Gathas line is misapplied: Zarathustra wishes to be a 'mighty help and joy' to the righteous in this life, which says nothing of the soul after death. Anís never says the Gathas don't address mutual recognition.

Top fixes:
- When a follow-up quotes Anís's own earlier wording, don't treat it as a quote search. Rewrite the search around the conversation's topic (recognising loved ones after death) using the earlier turns, so the search_query carries the real subject rather than the raw message.
- Add a pastoral layer to the triage step: on grief disclosures, drop the boilerplate disclaimer, open with a brief condolence, and end with an inviting question.
- In the answer-writing step, check that each quoted passage actually addresses the question asked. If it doesn't, say so plainly (e.g. 'the Gathas don't speak of recognition explicitly') instead of presenting a tangential line as the answer.

## detachment-buddhism — skeptic (conv_e10c4f57-1e8c-4aa0-bf02-56fef226e8e2)

Theme: detachment in the Bahá'í Writings, compared with non-attachment in Buddhism

**3.5/10 (judges 3 / 4, spread 1; defects 10 / 9)** — Turns 1–2 give a well-sourced Bahá'í account of detachment, but the Buddhist half of the question never gets answered. The pipeline never searches for Buddhist scripture on virāga, keeps recycling one unplaced fragment, concedes a claim Anís never made, and answers the final pushback with an unrelated Arabic word study.

- T1 *opening* (10.1 s, topic, history 0): Hello. I've read that the Bahá'í Writings put a lot of weight on "detachment," and I'm trying to work out whether it's really the same thing as Buddhist non-att
  - **retrieval** [major] No Buddhist texts were retrieved for a question that is explicitly comparative, so Anís says the sources 'do not mention Buddhism at all'.
  - **answer** [minor] Bahá'u'lláh's own commentary is filed under 'history or scholarship'; the Gleanings point is paraphrased with no link.
  - **answer** [minor] Says the library has no authorized interpretation without having searched for Shoghi Effendi.
- T2 *reference* (5.3 s, define, history 2): That third one, "not meant giving away and depleting all one's wealth", is interesting, but what does it say detachment *is* if not that? Does the passage give 
  - **follow_up_context** [minor] The search query was polluted with unrelated earlier-turn terms ('Buddhist', 'Abdu'l-Bahá'), which pulled in an unused Sutra fragment.
- T3 *exact_quote* (6.7 s, quote, history 4): The Sutra Collection line about "the absence of attributes indicates negation" reads like a fragment of an argument, and I can't tell whether it's about virāga 
  - **answer** [major] Gives the same short fragment and calls it the 'full passage', with no work or sutra identification. He also doesn't say that he never wrote 'deconstruction of… clinging itself' in this conversation.
  - **retrieval** [major] Only one paragraph was retrieved; nothing came back for the second question (where Buddhist texts address clinging), and adjacent context was not fetched.
- T4 *absent* (5.1 s, quote, history 6): So you can't give me the fuller passage or a location, and your own earlier claim about Buddhist texts "deconstructing clinging itself" rests on a fragment you 
  - **strategy** [critical] The reader asked to find the Buddha's own definition of virāga; this was planned as a quote search for the old fragment.
  - **answer** [major] Falsely concedes a claim not made in this run, and treats a failed search as proof the library lacks the text. The same fragment is repeated for the third time.
- T5 *pushback* (3.1 s, define, history 8): You say this passage shows "the systematic release of specific supports... whose cessation brings an end to becoming," but the text itself only poses a rhetoric
  - **gate** [critical] A pushback about a Buddhist passage was misrouted to a define/term_study of the Arabic tajarrud, which answers nothing the reader asked.
  - **answer** [minor] The term table contradicts itself: Shoghi Effendi's rendering is given as 'having stripped itself', but the table shows 'transcended the limitations'.

Top fixes:
- For comparative questions, always run a tradition-specific search in the other tradition's scripture (here the Pali Nikāyas for virāga/upādāna) and don't conclude 'the library lacks it' from a single empty search.
- When a follow-up cites words Anís did not say, check the conversation history and say so plainly rather than conceding or ignoring it. Never route a pushback turn to the term_study/define strategy.
- For a 'fuller passage' request, fetch the neighbouring paragraphs and the work's identification, and stop re-serving the same snippet across turns.

## equality-sexes — scholar (conv_12dc150d-e21a-4623-a6e1-f8d430a4c1ec)

Theme: the equality of women and men, and how it squares with the membership of the Universal House of Justice

**3/10 (judges 3 / 3, spread 0; defects 10 / 10)** — Retrieval often found the primary texts, including the 'Abdu'l-Bahá Tablet text, the Corinne True letter and Shoghi Effendi's letters, but Anís's replies kept ignoring them: turn 1 credits a House of Justice statement to 'Abdu'l-Bahá, turn 3 gives no answer at all, and the reader never gets the dated, attributed texts he asked for.

- T1 *opening* (6.0 s, topic, history 0): Hello Anís. I'm trying to understand how the Bahá'í principle of the equality of women and men is reconciled with the restriction of Universal House of Justice 
  - **selection** [major] The 'Abdu'l-Bahá and Shoghi Effendi texts were in the sources but went unused. The reply leans on a House of Justice compilation note instead.
  - **answer** [major] Misattribution and authority error: a House of Justice statement is credited to 'Abdu'l-Bahá and placed first as doctrine.
  - **answer** [minor] The Corinne True letter is cited but not quoted, and no date is given.
- T2 *reference* (8.7 s, quote, history 2): That second passage worries me: you attribute the "wisdom of it will be fully revealed in the future" line to Shoghi Effendi explaining a Tablet, yet cite *Unco
  - **answer** [minor] The reply contradicts itself on authorship and offers a reflexive apology.
  - **selection** [minor] The Women compilation version, which usually carries a date and attribution, was surfaced but not used.
- T3 *compare* (11.6 s, topic, history 4): Your two replies now attribute that "wisdom" line differently: first to 'Abdu'l-Bahá via Shoghi Effendi, then to Bahá'u'lláh. Setting that aside, how does the p
  - **follow_up_context** [major] The search was the whole message plus appended names, with no Corinne True or Aqdas fn_80 referent. It pulled up unrelated texts, including an Islamic rijál biographical dictionary.
  - **answer** [major] No answer to the comparison, no admission that the texts are absent, and a mislinked citation.
- T4 *deepen* (15.7 s, quote, history 6): You quote Bahá'u'lláh's phrase «O ye men of the House of Justice!» from *Abdu'l-Bahá in Egypt* by Sohrab, but what is the original term behind "men" there, and 
  - **retrieval** [minor] No search for the original Arabic or for generic uses of rijál. The Momen study (surfaced in turn 5) was not found.
  - **latency** [minor] Over 15 s.
- T5 *absent* (6.8 s, fact, history 8): Since Momen's study gives *rijál-i bayt-i 'adl-i iláhí*, is there a passage where 'Abdu'l-Bahá or Shoghi Effendi explicitly states the reason for confining memb
  - **selection** [major] The 'Abdu'l-Bahá Tablet text and the Momen passage were surfaced but ignored. The reply recycles the turn 2 letter.

Top fixes:
- When drafting the reply, put surfaced Writings and Guardian passages ahead of House of Justice or compilation notes, and check that each passage's speaker (e.g. 'The House of Justice suggests') matches the attribution.
- For follow-ups, build the search query from the referent (named passage, term, work) rather than the raw message; for terminology questions (rijál), search for the transliterated term and the Aqdas notes.
- Add an output check that rejects replies that leave the question unanswered (as in turn 3), mislinked citations (fn_91), and apologies for mistakes not present in the shown history.

## return-iqan — study_leader (conv_258c0408-ab13-4b96-82f9-0de79cc6c6fb)

Theme: what the Kitáb-i-Íqán means by the "return" of the Prophets

**2.5/10 (judges 3 / 2, spread 1; defects 9 / 10)** — Turn 1 did find the key Íqán passage on the Prophets as "Temples of the Cause of God" (para 174), but after that Anís lost track of his own replies: he never resent it, said "nothing found" four times, admitted to a Gleanings citation he never gave, and never explained what "return" means.

- T1 *opening* (7.1 s, topic, history 0): Hello Anís, I'm preparing a study session on the Kitáb-i-Íqán and want to focus on what it means by the "return" of the Prophets, like how John the Baptist is E
  - **retrieval** [major] The passages that actually explain 'return' were not surfaced: SAQ ch. 33 on John the Baptist as Elijah, and the Íqán's long section on 'return' (e.g., Muḥammad's 'I am all the Prophets', and the passages on return and 'oneness' around ¶¶ 161–179).
  - **answer** [minor] Garbled attribution and missing paragraph link for the SAQ quotation. The quoted line is only a pointer to another text, not a passage the group can read aloud.
  - **selection** [minor] Para 29 ('I go away, and come again unto you') was among the sources, is directly about return, and was not used. The quotes given are fragments of one or two lines, and the 'how they connect' explanation is a single sentence.
- T2 *reference* (6.2 s, quote, history 2): The four lines you mentioned didn't come through on my end, only the summary after them. Could you send them again with where each one is found? I'd like to ope
  - **follow_up_context** [major] The request to resend was treated as a search for an exact quotation. The search query was the reader's message repeated plus leaked refers_to metadata, so nothing was retrieved.
  - **answer** [major] He accepted the false premise that there were four lines and that they failed to arrive, and claimed nothing could be found.
- T3 *exact_quote* (5.3 s, quote, history 4): I can narrow it down: I want the Íqán passage where it says the Prophets are all one reality, the "single, enduring divine light" you mentioned in your summary.
  - **strategy** [major] The reader's paraphrase was searched as an exact phrase. The reader wanted the Íqán passage saying the Prophets are one reality, which is ¶174, already found.
- T4 *pushback* (5.7 s, quote, history 6): Two things in that last reply don't sit right with me: you said the quote is "drawn from the Kitáb-i-Íqán" yet placed it at Gleanings paragraph 148, and earlier
  - **answer** [critical] He made up an admission of an error he never made (the Gleanings ¶148 citation) and failed to confirm the Íqán wording he had in fact quoted.
  - **follow_up_context** [major] The pushback was searched as the quote 'drawn from the Kitáb-i-Íqán', which ignored the Íqán passage already established in turn 1.
- T5 *deepen* (6.9 s, original, history 8): You quoted 'Abdu'l-Bahá saying Bahá'u'lláh gave a "lengthy and detailed explanation" of the return of the Prophets, so what does "return" actually mean in that 
  - **answer** [major] He did not answer what 'return' means, even though SAQ ch. 33 (surfaced) and Íqán ¶¶29/174 explain it. He also did not mine the Persian original he had surfaced for the term.

Top fixes:
- Before searching, resolve follow-ups against earlier replies and their sources: a resend or verification request should reuse the passages already given, not run an exact-quote search on the reader's sentence (and refers_to metadata must never leak into search_query).
- Stop the quote-rule override from treating whole messages or paraphrases as exact quotes. When an exact-phrase search finds nothing, fall back to a topic search and the conversation's existing sources.
- Before writing an answer, check what Anís actually said earlier. Never admit to, or accept, citations or counts he never gave, and when the sources contain the explanation, answer the meaning question with them.

## golden-rule — non_native (conv_16f5652a-fdfc-48f3-a98c-b3c1b075ae2d)

Theme: the Golden Rule across the world's scriptures, and where the Bahá'í Writings state it

**3/10 (judges 3 / 3, spread 0; defects 13 / 11)** — Anís told the reader he could not find the Golden Rule in Bahá'u'lláh's writings, but it is there: "Lay not on any soul a load…" (Gleanings LXVI) and Arabic Hidden Word 29. After that he admitted to a mistake he never made, gave an empty comparison, and answered the Arabic-word question from an unrelated text.

- T1 *opening* (10.9 s, quote, history 0): Hello Anís. I am looking for the Golden Rule in many religions, like "do to others what you want for yourself". Where Bahá'u'lláh say this in the Bahá'í Writing
  - **retrieval** [critical] No Bahá'í text stating the Golden Rule was surfaced. All eight sources are from other traditions, plus Townshend and Thompson.
  - **answer** [major] Makes an unquoted claim about Bahá'u'lláh's teaching.
  - **selection** [minor] Names hadith and Tao works without quoting them. The clear Majlisi quotation in the sources goes unused, and the Tao Te Ching link is at book level.
- T2 *reference* (9.0 s, quote, history 2): This passage you just quoted is very clear, thank you. Is it also in the Hidden Words, or only in this Summons?
  - **follow_up_context** [major] The reader refers to a Summons passage. The planner searched the Luke verse instead and never said that no Summons passage had been quoted in this conversation.
  - **retrieval** [major] Arabic Hidden Word 29 (the Golden Rule formulation) was not surfaced, so Anís gave a dubious fragment instead.
  - **answer** [major] An untranslated Arabic fragment of uncertain source is presented as The Hidden Words to a non-native reader and then interpreted ('ontological shift').
- T3 *source* (6.3 s, quote, history 4): Wait, you say this is in the Hidden Words, but under the quote I see *Prayers and Meditations*. Which book is it really from, and what is the number or page of 
  - **answer** [major] Falsely concedes a mistake he never made. No Prayers and Meditations citation appeared in this conversation.
  - **answer** [major] Claims the number cannot be determined, although the Arabic Hidden Words are numbered and this is no. 68. Also answers questions the reader never asked.
- T4 *compare* (8.6 s, topic, history 6): OK, now I understand it is Hidden Words, but the number is still not clear for me. You said the passage is quoted in *The Earth Is But One Country*. How does th
  - **answer** [critical] The comparison promises passages and quotes none. There is no Bible text, no Hidden Word, and no actual comparison.
  - **follow_up_context** [major] Planned as a topic search on the raw message. It ignored the established Hidden Word and did not address the Earth Is But One Country premise, which Anís had not stated.
  - **answer** [minor] Repeats the incorrect 'number not settled' deflection.
- T5 *deepen* (7.5 s, original, history 8): You say the Bahá'í text is "ontological" and talks about "same substance". What is the original word in Arabic or Persian for this, and where else in the Writin
  - **retrieval** [major] The Arabic original of Hidden Word 68 was not retrieved, so the 'original word' question was answered from unrelated metaphysical texts.
  - **answer** [major] Presents jawhar/vujúd from 'Abdu'l-Bahá's discussion of the unity of existence as the original of the Hidden Word's 'substance', and attributes the Persian words to an English Some Answered Questions link.

Top fixes:
- Retrieval: for Golden Rule or reciprocity queries that name Bahá'u'lláh, expand to known Bahá'í formulations (Gleanings LXVI 'Lay not on any soul a load…', Arabic Hidden Word 29, 'choose thou for thy neighbour…') and restrict at least half the results to Bahá'í primary texts before concluding 'not found'.
- Follow-up context: rewrite follow-up search queries to name the referent (e.g. 'Hidden Words Arabic 68 same dust Arabic original', 'Summons Lay not on any soul a load') instead of searching the raw message. In replay situations, add a guard that says 'I did not cite X here' rather than conceding errors that never happened.
- Answer/craft: block outputs that promise passages and quote none (T4), and stop the template 'numbers not settled' / 'secretary's letter' boilerplate. Hidden Words numbering (Arabic 1–71, Persian 1–82) should be stated.

## 004-soul-reincarnation — skeptic (conv_68aa4cfc-4a73-4791-8743-9eb0fbd4e924)

Theme: The Bahá'í Soul, Buddhist Anatta, and the Limits of Both/And

**2.5/10 (judges 2 / 3, spread 1; defects 11 / 15)** — The conversation ends with a fabricated "Gleanings" passage. Asked for the exact text and its link, Anís gave an altered, partly invented passage that isn't the one he had quoted, with no link and no Rāmānuja text. Before that, he twice claimed the library had nothing on Buddhist anatta and dropped a defensible reading the moment the reader pushed.

- T1 *opening* (5.7 s, topic, history 0): How does the Bahá'í concept of the soul differ from the Hindu and Buddhist concepts of reincarnation? I want a sharp answer — not 'all religions teach about the
  - **retrieval** [major] No Buddhist or Hindu primary texts were retrieved for an explicitly comparative ontological question. Anís then says the library cannot address anatta.
  - **answer** [minor] The link is spliced into the middle of the quotation text, and the reply is thin: it uses one quote and ignores the Uncompiled letter in the sources ('one individual soul… developing and unfolding').
- T2 *reference* (7.5 s, topic, history 2): That passage says the Bahá'ís accept a "return of the attributes and qualities" but not of "the essence or the reality of things" — but what does that distincti
  - **answer** [major] 'Abdu'l-Bahá's words are quoted from a secondary compilation and credited to 'Shoghi Effendi and ‘Abdu’l-Bahá'. The primary Tablet was among the sources.
  - **retrieval** [major] For the second time, no Buddhist texts were retrieved for a question directly about the anatta parallel, and Anís again claims the library lacks them.
  - **answer** [minor] The closing claim that the Writings 'insist' on an enduring individual reality has no quotation behind it.
- T3 *pushback* (5.5 s, quote, history 4): You say the distinction is that individual identity and "the essence or the reality of things" "remain distinct and do not return" — but the Shoghi Effendi pass
  - **strategy** [major] A pushback was planned as a quote lookup for a phrase Anís had not said this time. Nothing relevant came back.
  - **answer** [major] Anís accepts that the lamp analogy came from a pilgrim's note, when it came from a Tablet of 'Abdu'l-Bahá. He also gives up the individuality reading although the letters support it, and calls pilgrim notes 'simply a personal report' on the strength of unnamed scholars.
- T4 *compare* (7.1 s, topic, history 6): You cite Shoghi Effendi's line that the soul keeps "developing and unfolding and returning towards its Creator" while rejecting return to new bodies. How does t
  - **selection** [major] The reader asked whether the Bahá'í text gives a reason individuality survives. The SAQ passage on the rational soul was in the sources and went unused.
  - **answer** [major] Advaita is described through Rāmānuja's commentary, and Rāmānuja rejects Advaita. Anís also overstates the Bahá'í text as 'explicitly' preserving individual distinction. The Rāmānuja citation has no usable link.
- T5 *exact_quote* (10.2 s, quote, history 8): You quote Bahá'u'lláh that the soul "will continue to progress until it attaineth the presence of God," but that's one sentence, and you cited Gleanings twice w
  - **retrieval** [major] The Gleanings paragraph surfaced in T4 (para_474) was not retrieved, even though the search query carried the exact phrase.
  - **answer** [critical] An invented, altered passage is presented as Gleanings. It is not the passage requested, it has no link, and Anís apologizes for a missing link in the same breath. The question about individuality and the Rāmānuja words are never given.

Top fixes:
- Add a verbatim guard: any block quotation must match the text of a retrieved source paragraph and carry its link. If the requested paragraph is not in the sources, say so instead of writing one.
- For comparative turns, plan a search for each named tradition (Buddhist anatta texts, Hindu Gita and Upanishads) before claiming the library lacks them.
- Route pushback turns to re-read the earlier-cited passages, not to a quote lookup. Check each source's type (Tablet vs pilgrim note vs scholarship) before conceding authority points, and cite primary texts over secondary compilations.

## seed-21 — scholar (conv_b82aa0ea-cfb1-41ce-94b1-2ae33d6c8c60)

Theme: Evil — Privation, Active Force, or Necessary Shadow?

**3.5/10 (judges 3 / 4, spread 1; defects 10 / 8)** — Turn 1 was solid, but the conversation falls apart under scholarly scrutiny. Anís credits the wording of the 2014 revised translation of Some Answered Questions to Barney and offers an unrelated Persian line as the original. Worst of all, in turn 5 he wrongly concedes that a passage never mentions evil, when the Star of the West text he quoted one turn earlier opens with "there is no evil… evil is the absence of good."

- T1 *opening* (6.0 s, topic, history 0): Do the Bahá'í writings handle evil as the mere privation of good (Augustinian), as an active force, or as a necessary shadow that makes good visible?
  - **selection** [minor] Ignored the Arabic tablet in which 'Abdu'l-Bahá explicitly calls evil امر عدمی, and gave little treatment to the 'necessary shadow' alternative.
- T2 *reference* (11.9 s, original, history 2): Regarding the first one you quoted: is that actually from Some Answered Questions, and which chapter and whose translation? I'd also like to know whether 'mere 
  - **answer** [major] Misattributed the translation. The quoted wording comes from the 2014 revised SAQ translation, not Laura Clifford Barney's 1908 version, which reads 'all evil returns to nonexistence.'
  - **retrieval** [major] Did not retrieve the Persian of SAQ ch. 74. Instead it surfaced an unrelated qadím/ḥádith question, mislabelled 'Reincarnation', and presented it as if relevant.
  - **answer** [minor] A garbled disclaimer about a 'secretary's letter' that has nothing to do with SAQ.
- T3 *compare* (8.4 s, topic, history 4): You said evil is "much as cold is the absence of heat or darkness the absence of light." How does that compare with Augustine's formulation in the Enchiridion (
  - **answer** [major] Ignored the Enchiridion ch. 11 and Plotinus Ennead I.8 without saying the library lacks them. Substituted City of God and Maimonides instead.
  - **answer** [minor] Malformed nested link with a corrupted URL.
  - **answer** [minor] Repeated the turn 1 quotes, and did not note that he had not said the cold/heat phrase this time.
- T4 *source* (8.6 s, quote, history 6): That last quotation about change and transformation, "if change and transformation does not exist, then there can be no composition and growth", you attribute t
  - **answer** [minor] Did not explain the 'US Bahá'í News Service' credit as a cataloguing artifact, and did not use the evidence to hand (URL volume 8; the 'To another who inquired' framing suggests a diary/pilgrim report). Added speculative filler instead.
- T5 *pushback* (9.5 s, quote, history 8): The Persian you quoted reads «ترکیب و تربیت اشیا» (*tarkīb va tarbiyat*, "composition and training/nurture"), not "growth", and its subject is *aḍdād* (opposite
  - **answer** [critical] Falsely conceded that the passage does not mention evil, contradicting the Star of the West text quoted in turn 4.
  - **follow_up_context** [minor] The search query was a scrambled version of the message, without the turn 4 Star of the West referent.

Top fixes:
- Before conceding pushback, check the claim against passages already quoted in the conversation. Hold the position when the earlier source contradicts the reader's premise.
- For translation and chapter questions, attach edition metadata (SAQ 2014 revised vs Barney 1908, chapter titles) and the original-language parallels (Mufávaḍát) so the answer can name the translator and the term correctly.
- When named works (Enchiridion, Enneads) are absent from the library, say so explicitly instead of quietly substituting other works. Flag diary and periodical reports as pilgrims' notes.

## seed-39 — study_leader (conv_74c1d962-cb05-419c-bb88-0b7fb053c948)

Theme: What Did the Báb's Bayán Actually Teach?

**2.5/10 (judges 2 / 3, spread 1; defects 12 / 10)** — Anís put a scholar's paraphrase ("accept, reject or modify as He chose") in quotation marks and attributed it to the Kitáb-i-Aqdas, then to Bahá'u'lláh. It took three turns of the reader pushing back before he admitted it came from scholarship, and he never gave the Báb's own words, even though the Kitáb-i-Badí' surfaced a passage where Bahá'u'lláh quotes the Báb on exactly this point.

- T1 *opening* (8.5 s, topic, history 0): The Báb's Bayán contains laws and teachings that Bahá'u'lláh subsequently abrogated or fulfilled. What was the Bayán actually teaching, and how should a Bahá'í 
  - **answer** [major] A scholar's paraphrase was presented as scripture and attributed to the Kitáb-i-Aqdas.
  - **retrieval** [major] No primary Bayán text and no Guardian's description of the Bayán were surfaced. The God Passes By hit was about Ḥájí Mírzá Áqásí and unrelated.
  - **answer** [minor] The 'one entity' quotation is not in the surfaced excerpt, and the excerpt's key line on abrogation was ignored.
- T2 *reference* (7.6 s, source, history 2): That second quote about the Báb's laws being a gift that Bahá'u'lláh could "accept, reject or modify as He chose" is something I could read aloud to the group, 
  - **answer** [critical] Walbridge's scholarly sentence was attributed to Bahá'u'lląh, with a truncated fragment and a stray footnote marker.
  - **strategy** [major] The plan only hunted for the source of the phrase and ignored the second question, the Báb's own words.
- T3 *absent* (10.4 s, quote, history 4): That Spanish line, "Él hace lo que desea y ordena lo que Le place", isn't the "accept, reject or modify" wording I asked about, so I still don't have a source f
  - **strategy** [major] The search used the Spanish line from the complaint as its quote target instead of the actual request: the Báb's Váḥid and Gate statement.
  - **answer** [major] Anís apologised for something he did not say in this run, then gave the reader the irrelevant Spanish passage anyway. He also sent the reader to Selections, a book the library has.
- T4 *exact_quote* (7.4 s, quote, history 6): Anís, you've now given me that same Spanish line twice and it still doesn't answer what I asked. Back in your first reply you quoted the Aqdas as saying the Báb
  - **answer** [major] He presented the Ishráqát passage as 'the passage you are thinking of' without saying it does not contain 'accept, reject or modify', so the misattribution stood uncorrected.
  - **selection** [major] The Kitáb-i-Badí' passage in the sources, where Bahá'u'lláh quotes the Báb ('the Point of the Bayán') saying everything depends on the will of Him Whom God shall make manifest, was ignored.
  - **answer** [minor] The inline citation has no link, and the reply says 'paragraph' is unsettled even though the link carries a paragraph ID.
- T5 *pushback* (12.5 s, topic, history 8): In your first reply you put "accept, reject or modify as He chose" in quotation marks and attributed it to the Kitáb-i-Aqdas, but the passage you just gave me s
  - **answer** [minor] The correction is right, but it does not name the author (Walbridge), does not admit that turns 1 and 2 misattributed the phrase, and repeats the same Ishráqát passage.
  - **answer** [minor] The formatting is broken: a literal blockquote marker appears inside a bullet.

Top fixes:
- Attribution guard: when a passage comes from notes, a commentary or a secondary book (e.g. Walbridge's notes indexed under the Aqdas URL, or Sacred Acts), the reply must name the actual author and place it under scholarship. Never present it as scripture or as Bahá'u'lláh's words.
- Follow-up planning: when the reader asks for 'the Báb's own words' or a 'Váḥid and Gate', the search must target the Persian Bayán and Selections from the Writings of the Báb. It must not extract a phrase the reader quoted only to complain about it.
- Selection: put primary passages in the sources that answer the question directly (e.g. the Kitáb-i-Badí' passage quoting the Point of the Bayán) ahead of saying 'the passages do not settle it'.

## seed-66 — non_native (conv_18bfa17b-3ecf-40f0-8d79-c22b1ae8275f)

Theme: What Did Bahá'u'lláh Do in the Síyáh-Chál?

**4/10 (judges 4 / 4, spread 0; defects 10 / 8)** — Anís quoted Bahá'u'lláh accurately and linked the passages, but he twice said the library lacked things it actually holds: Shoghi Effendi's comparison to Moses, Gabriel and the Dove in turn 3, and what the Maiden did next in turn 5. He also attributed the Maid of Heaven passage to the Báb and gave the same Black Pit passage three times.

- T1 *opening* (6.1 s, fact, history 0): Bahá'u'lláh was imprisoned in the Síyáh-Chál (Black Pit) of Tehran in 1852 — the moment of his revelation. What happened in that pit, and why does it matter tha
  - **answer** [minor] The 'why does it matter' half of the question gets one general sentence. The Maiden passage and the Rashḥ-i-'Amá note were both among the sources and went unused.
- T2 *reference* (6.4 s, topic, history 2): You said "the striking contrast" between the outside and the inside. Can you show me the passage where He Himself describes it, I mean the Maid of Heaven, not o
  - **answer** [major] He credits the Báb with a Maid of Heaven proclamation that Bahá'u'lláh wrote. The 'scholarship' layer quotes nothing and links nothing.
  - **answer** [minor] The Summons quotation stops before the part the reader actually wants: the Maiden's call and her words.
- T3 *compare* (6.9 s, quote, history 4): You said the Maiden came "suspended in the air" with a "call which captivated the hearts." Is this like Muhammad and the angel Gabriel in the cave of Hira, or M
  - **strategy** [major] The quote-rule changed a comparison question into a search for a quoted phrase. As a result, Shoghi Effendi's comparison to Moses, Gabriel and the Dove was never retrieved.
  - **answer** [major] He says the library has no such comparison when it does.
- T4 *absent* (7.8 s, fact, history 6): You said Shoghi Effendi links these experiences, and that Bahá'u'lláh was in "heavy chains." Can you give me the exact date when the Maid of Heaven first appear
  - **answer** [major] He mentions Shoghi Effendi's comparison without quoting or linking it, though it was surfaced (source 3). This contradicts his turn 3 answer and leaves the contradiction unacknowledged.
  - **answer** [minor] He repeats the same Black Pit passage for the second time and cites it under a compilation instead of the Epistle. He also leaves out the date information that does exist: 'Year Nine' (1269 AH), which began 15 October 1852, the midpoint of the four-month imprisonment.
- T5 *exact_quote* (8.3 s, quote, history 8): You said He recalls "the galling weight of the chains and the stench-filled air allowed Me but little sleep." Can you give me the full passage with the link, wh
  - **strategy** [major] The plan searched only the chains phrase. The second question, about what happened after the Maiden spoke, was never searched.
  - **answer** [major] He wrongly says the texts don't answer what followed the Maiden's words. Summons para 14 continues with her pointing to His head and proclaiming 'This is the Best-Beloved of the worlds'. Messages to America para 599 (surfaced this turn) gives 'Verily, We shall render Thee victorious'.
  - **answer** [minor] He gives the same passage for the third time, with a typo in the work's title.

Top fixes:
- Don't let the quote-rule switch a comparison question to a quoted-phrase search. When a turn contains both quoted phrases and a question, search for each.
- Before saying the library lacks something, check the conversation's earlier sources and run a targeted second search. Turn 3 and turn 5 both had the answer available.
- Check attributions before writing: don't take author labels on personal compilations (e.g. 'The Báb') at face value, and don't let a 'scholarship' layer appear without a linked quotation.

## seed-93 — seeker (conv_d5cf0b0f-7012-4b69-a909-d2a14e7bf01d)

Theme: What Did 'Abdu'l-Bahá Mean by 'The Most Great Justice'?

**2/10 (judges 2 / 2, spread 0; defects 10 / 12)** — Anís got "these" right in turn 2, then dropped that answer under pushback for a wrong one he gave no text for. He emptied out his quote blocks three times, and in turn 5 told the reader the library didn't have a passage he had quoted and linked one turn earlier.

- T1 *opening* (7.5 s, topic, history 0): 'Abdu'l-Bahá speaks of 'the Most Great Justice' as a foundation of the new world order. Is this distributive justice, retributive justice, or something more lik
  - **answer** [critical] The reply promises quotations and gives none. It has no links and never deals with 'Most Great Justice' or the distributive/retributive distinction.
  - **retrieval** [minor] None of the surfaced texts uses the actual phrase 'Most Great Justice', and a scholarly study is labelled as Bahá'u'lláh's work.
- T2 *reference* (8.3 s, quote, history 2): The second one you quoted, about things being "in disorder and remain imperfect" until these are realized, makes me wonder what "these" actually refers to there
  - **answer** [minor] An unsourced 'Official Exposition & Scholarship' layer, plus a claim about 'authorized letters and talks' with nothing quoted.
- T3 *pushback* (6.5 s, quote, history 4): You said "these" refers directly to "justice and right," but is that actually what the Tablet to the Hague says, or are you reading it in? And the line about ju
  - **strategy** [critical] The plan searched Anís's own phrase as a quotation instead of re-checking the Hague passage, and surfaced one irrelevant letter about Covenant-breaking.
  - **answer** [critical] Gave in to pushback by contradicting the correct turn 2 reading, with an empty quote block in place of evidence. Also admitted to a phrase never said in this conversation.
- T4 *exact_quote* (7.8 s, quote, history 6): That quote about the "pole of justice, and not of forgiveness" is striking, but you cited *The Pattern of Baha'i Life*, which doesn't sound like 'Abdu'l-Bahá's 
  - **follow_up_context** [major] The reader explicitly asked for the Hague passage, but the search went after the 'pole of justice' phrase, so the Hague text was not among the sources. It had been surfaced in turn 2 and could have been reused.
  - **answer** [major] Announced the Hague words, then left the quote block empty. The SAQ link is broken, and he apologized for a mix-up he did not make.
- T5 *source* (15.5 s, quote, history 8): You called that line "the original words of 'Abdu'l-Bahá" but still credited it to *The Pattern of Baha'i Life*, so who actually said it, and in which book, tab
  - **follow_up_context** [critical] The phrase extraction picked up the reader's framing words instead of the referent, the canopy / pole-of-justice line.
  - **answer** [critical] Told the reader the passage couldn't be found, contradicting his own linked citation from the turn before.
  - **latency** [minor] The turn took over 15 s.

Top fixes:
- Add an output check that rejects any reply announcing a quote ('as follows:', 'states:') that has no blockquote or link after it, and regenerates using the selected sources.
- For follow-ups and pushback, don't extract quoted phrases from the reader's framing or from Anís's own past wording. Resolve the referent from history and reuse passages already cited.
- Before a pushback reply concedes or retracts anything, require the conceded claim to appear in this conversation's earlier turns and the counter-claim to be backed by a retrieved text. Otherwise hold the position with the evidence.

## Perplexity comparison (sources)

50 turns compared (50 Perplexity answers, 0 Perplexity failures, 0 judge failures). Winner: Anís 7 · Perplexity 38 · tie 0 · neither 0.
Cost: Perplexity $0.2842 ($0.00568/turn, p50 5692 ms), comparison judge $3.8905 ($0.07781/turn).

### Missed but in the library (82) — Anís retrieval/selection defects

- soul-after-death T1: **The Bible: Gospel of Luke** (Luke) [book] → The Gospel of Luke (doc 20990, by title)
  - checked: find-document "The Bible: Gospel of Luke" → The Gospel of Luke (20990); The Acts of the Apostles (20988)
- soul-after-death T1: **The Bible: Gospel of Matthew** (Matthew) [book] → The Gospel of Matthew (doc 20992, by title)
  - checked: find-document "The Bible: Gospel of Matthew" → The Gospel of Matthew (20992)
- soul-after-death T1: **The Bible: Revelation** (John) [book] → Revelation (doc 20986, by title)
  - checked: find-document "The Bible: Revelation" → Tag: Book of Revelation (Bible) (288114); Progressive Revelation: The Bible and Baha'u'llah (355302); Tag: Book of Revelation (Bible) (643699)
- soul-after-death T1: **The Bible: Gospel of John** (John) [book] → The Gospel of John (doc 20989, by title)
  - checked: find-document "The Bible: Gospel of John" → The Gospel of John (20989); 3 John (20977); 2 John (20973)
- soul-after-death T2: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Bahá’í Sacred Writings (20777) ¶339 coverage 1.00
- soul-after-death T2: **The Bible (2 Samuel)** [book] → The Bible (KJV), 2 Samuel (doc 21353, by quote)
  - checked: find-document "The Bible" → The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); Bible Prophecies (984297); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | documents?q → Bible Prophecies (984297); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | phrase search → The Bible (KJV), 2 Samuel (21353) ¶227 coverage 1.00
- soul-after-death T3: **Tablets of 'Abdu'l-Bahá Abbas, vol. 1** ('Abdu'l-Bahá) [compilation] → Tablets of ‘Abdu’l-Bahá ‘Abbás vol. 1 (doc 624661, by title)
  - checked: find-document "Tablets of 'Abdu'l-Bahá Abbas, vol. 1" → Tablets of ‘Abdu’l-Bahá ‘Abbás vol. 1 (624661); Tablets of ‘Abdu’l-Bahá ‘Abbás vol. 1 (624666); Tablets of ‘Abdu’l-Bahá ‘Abbás vol. 1-3 (20915)
- soul-after-death T3: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [compilation] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- soul-after-death T3: **Babylonian Talmud, Sanhedrin** [book] → The Babylonian Talmud (doc 21354, by title)
  - checked: find-document "Babylonian Talmud, Sanhedrin" → The Babylonian Talmud (21354)
- soul-after-death T3: **Bhagavad Gita** (Vyasa) [book] → The Bhagavad-Gita (doc 21038, by title)
  - checked: find-document "Bhagavad Gita" → Bhagavad Gita (in The Bhagavad Gita (Song Celestial, tr. Edwin Arnold), paragraphs 12-undefined) (17365); The Bhagavad-Gita (21038); Bhagavad-Gita and the Baha'i Faith (282917)
- soul-after-death T4: **Tablets of Abdul-Baha Abbas** (‘Abdu’l‑Bahá) [compilation] → Tablets of `Abdu'l-Bahá Abbas (doc 334708, by title)
  - checked: find-document "Tablets of Abdul-Baha Abbas" → Tablets of `Abdu'l-Bahá Abbas (334708); Tablets of ‘Abdu’l-Bahá ‘Abbás vol. 1-3 (20915); Tablets of ‘Abdu’l-Bahá ‘Abbás vol. 1 (624661) | phrase search → Bahá’í World Faith (‘Abdu’l-Bahá section) (20902) ¶424 coverage 1.00
- soul-after-death T4: **Bahá'u'lláh and the New Era** (J. E. Esslemont) [book] → Bahá’u’lláh and the New Era (doc 20813, by title)
  - checked: find-document "Bahá'u'lláh and the New Era" → Bahá’u’lláh and the New Era (20813); Bahá’u’lláh and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (125); Baha'u'llah and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (27740)
- soul-after-death T4: **‘Abdu’l‑Bahá in London** (‘Abdu’l‑Bahá (reported talks)) [book] → ‘Abdu’l-Bahá in London (doc 20921, by title)
  - checked: find-document "‘Abdu’l‑Bahá in London" → ‘Abdu’l-Bahá in London (20921); Words spoken on 1913-Jan-19 in London (935304); Words spoken on 1911-Sep-13 in London (935397)
- detachment-buddhism T1: **The Hidden Words of Bahá'u'lláh** (Bahá'u'lláh) [book] → The Hidden Words of Bahá’u’lláh (doc 20809, by title) — was in Anís's sources
  - checked: find-document "The Hidden Words of Bahá'u'lláh" → The Hidden Words of Bahá’u’lláh (20809); 隐言经 (Hidden Words of Baha'u'llah) (28629); 隐言经 (Hidden Words of Baha'u'llah) (22143) | phrase search → Bahá’í Sacred Writings (20777) ¶562 coverage 1.00
- detachment-buddhism T1: **The Seven Valleys** (Bahá'u'lláh) [book] → The Seven Valleys (doc 925289, by title)
  - checked: find-document "The Seven Valleys" → The Seven Valleys (925289); Seven Valleys (984296); Seven Valleys (984305) | phrase search → The Seven Valleys and the Four Valleys (20811) ¶47 coverage 0.60
- detachment-buddhism T1: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [compilation] → Bahá’í Sacred Writings (doc 20777, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Bahá’í Sacred Writings (20777) ¶1449 coverage 1.00
- detachment-buddhism T2: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827) | phrase search → Bahá’í Sacred Writings (20777) ¶525 coverage 1.00
- detachment-buddhism T2: **Living the Life** (Compilation (Universal House of Justice Research Department); letter written on behalf of Shoghi Effendi) [compilation] → Living the Life (doc 983370, by title)
  - checked: find-document "Living the Life" → Living the Life (983370); Living the Life (983895); Living the Life (945915) | phrase search → Lights of Guidance: A Bahá’í Reference File (8680) ¶7565 coverage 1.00
- detachment-buddhism T3: **Saṃyutta Nikāya** (Pali Canon (tr. Maurice Walshe)) [book] → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (doc 19396, by quote)
  - checked: find-document "Saṃyutta Nikāya" → Samyutta Nikaya 1.18 - Hiri Sutta: Conscience (19293); Samyutta Nikaya 1.69 - Iccha Sutta: Desire (19300); Samyutta Nikaya 12.11 - Ahara Sutta: Nutriment (19309) | documents?q → Samyutta Nikaya 27.1 - Upakkilesa Samyutta: Defilements (19423); Samyutta Nikaya 44 - Introduction to the Avyakata Samyutta ((Undeclared-connected)) (19516); Samyutta Nikaya 1.18 - Hiri Sutta: Conscience (19293) | phrase search → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (19396) ¶1 coverage 0.75
- detachment-buddhism T3: **Saṃyutta Nikāya** (Pali Canon (tr. Thanissaro Bhikkhu)) [book] → Samyutta Nikaya 22.85 - Yamaka Sutta: To Yamaka (doc 19403, by quote)
  - checked: find-document "Saṃyutta Nikāya" → Samyutta Nikaya 1.18 - Hiri Sutta: Conscience (19293); Samyutta Nikaya 1.69 - Iccha Sutta: Desire (19300); Samyutta Nikaya 12.11 - Ahara Sutta: Nutriment (19309) | documents?q → Samyutta Nikaya 27.1 - Upakkilesa Samyutta: Defilements (19423); Samyutta Nikaya 44 - Introduction to the Avyakata Samyutta ((Undeclared-connected)) (19516); Samyutta Nikaya 1.18 - Hiri Sutta: Conscience (19293) | phrase search → Samyutta Nikaya 22.85 - Yamaka Sutta: To Yamaka (19403) ¶31 coverage 1.00
- detachment-buddhism T5: **Mahānidāna Sutta: The Great Causes Discourse (Dīgha Nikāya 15)** (Buddha (Pali Canon), tr. Thanissaro Bhikkhu) [book] → Digha Nikaya 15 - Mahanidana Sutta (The Great Causes Discourse) (doc 17248, by title)
  - checked: find-document "Mahānidāna Sutta: The Great Causes Discourse" → Digha Nikaya 15 - Mahanidana Sutta (The Great Causes Discourse) (17248) | phrase search → Digha Nikaya 15 - Mahanidana Sutta (The Great Causes Discourse) (17248) ¶66 coverage 1.00
- equality-sexes T1: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → The Universal House of Justice (doc 20870, by quote) — was in Anís's sources
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → The Universal House of Justice (20870) ¶32 coverage 1.00
- equality-sexes T1: **The Promulgation of Universal Peace** ('Abdu'l-Bahá) [book] → The Promulgation of Universal Peace (doc 20917, by title)
  - checked: find-document "The Promulgation of Universal Peace" → The Promulgation of Universal Peace (20917); The Promulgation of Universal Peace: Study Guide (23577); The Promulgation of Universal Peace: Study Guide (28932)
- equality-sexes T1: **Women (compilation)** (Shoghi Effendi (on his behalf)) [letter] → Messages of Shoghi Effendi to the Indian Subcontinent: 1923-1957 (doc 22168, by quote)
  - checked: find-document "Women" → Women in Religion (984427); Women of Consequence in the Life of the Báb (984064); Women and Development (967297) | documents?q → Women and Peace (983761); Women and the Broadcast Media: Legal Strategies for Enhancing the Portrayal of Women (967389); Women and Development (967297) | phrase search → Messages of Shoghi Effendi to the Indian Subcontinent: 1923-1957 (22168) ¶2029 coverage 1.00
- equality-sexes T1: **Letter of the Universal House of Justice to an individual, 22 December 2013** (Universal House of Justice) [letter] → Messages from the Universal House of Justice: 1986-2001 (doc 366, by quote)
  - checked: find-document "Letter of the Universal House of Justice to an individual, 2…" → none | documents?q → none | phrase search → Messages from the Universal House of Justice: 1986-2001 (366) ¶1168 coverage 0.50
- equality-sexes T2: **Women** (Compiled by the Research Department of the Universal House of Justice (letter written on behalf of Shoghi Effendi)) [compilation] → Women (doc 20874, by quote) — was in Anís's sources
  - checked: find-document "Women" → Women in Religion (984427); Women of Consequence in the Life of the Báb (984064); Women and Development (967297) | documents?q → Women and Peace (983761); Women and the Broadcast Media: Legal Strategies for Enhancing the Portrayal of Women (967389); Women and Development (967297) | phrase search → Women (20874) ¶76 coverage 1.00
- equality-sexes T2: **The Universal House of Justice (compilation)** (Compiled by the Research Department of the Universal House of Justice) [compilation] → The Universal House of Justice (doc 20870, by title)
  - checked: find-document "The Universal House of Justice" → The Universal House of Justice (20870); Universal House of Justice and the Principles of Jurisprudence (1546); The Universal House of Justice Letter Dated 28 November 2023: A Study Guide (919100) | phrase search → The Universal House of Justice (20870) ¶32 coverage 1.00
- equality-sexes T4: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title)
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → The Universal House of Justice (20870) ¶2 coverage 1.00
- equality-sexes T5: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → Selections from the Writings of ‘Abdu’l-Bahá (doc 20910, by quote) — was in Anís's sources
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Selections from the Writings of ‘Abdu’l-Bahá (20910) ¶265 coverage 1.00
- equality-sexes T5: **Letter written on behalf of Shoghi Effendi, 28 July 1936** (Shoghi Effendi (on his behalf)) [letter] → Women (doc 20874, by quote) — was in Anís's sources
  - checked: find-document "Letter written on behalf of Shoghi Effendi, 28 July 1936" → none | documents?q → none | phrase search → Women (20874) ¶76 coverage 1.00
- return-iqan T3: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶99 coverage 1.00
- return-iqan T4: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → The Kitáb-i-Íqán (20810) ¶161 coverage 1.00
- return-iqan T5: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶99 coverage 1.00
- golden-rule T1: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Gleanings from the Writings of Baha'u'llah: Study Guide (919098) ¶157 coverage 1.00
- golden-rule T1: **Epistle to the Son of the Wolf** (Bahá'u'lláh) [book] → Epistle to the Son of the Wolf (doc 20780, by title)
  - checked: find-document "Epistle to the Son of the Wolf" → Epistle to the Son of the Wolf (20780); Epistle to the Son of the Wolf (926338); Epistle to the Son of the Wolf (984437) | phrase search → Star of the West (15205) ¶138 coverage 1.00
- golden-rule T1: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title)
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679) | phrase search → Bahá’u’lláh and the New Era (20813) ¶349 coverage 1.00
- golden-rule T1: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827) | phrase search → The Desire of the World (8277) ¶126 coverage 1.00
- golden-rule T2: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title) — was in Anís's sources
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679) | phrase search → Bahá’u’lláh and the New Era (20813) ¶349 coverage 1.00
- golden-rule T2: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title) — was in Anís's sources
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679) | phrase search → Parallel Hidden Words in English (Early and Authorised) (15171) ¶584 coverage 1.00
- golden-rule T2: **The Summons of the Lord of Hosts** (Bahá'u'lláh) [book] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711)
- golden-rule T4: **The Bible, Gospel of Matthew** [book] → The Gospel of Matthew (doc 20992, by title)
  - checked: find-document "The Bible, Gospel of Matthew" → The Gospel of Matthew (20992)
- golden-rule T5: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title)
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679) | phrase search → The Qur’ân (Palmer) (21344) ¶2846 coverage 0.00
- 004-soul-reincarnation T1: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- 004-soul-reincarnation T1: **Reincarnation, Rebirth and the Progress of the Soul** (Research Department of the Universal House of Justice (compilation)) [compilation] → Reincarnation, Rebirth and the Progress of the Soul (doc 4669, by title) — was in Anís's sources
  - checked: find-document "Reincarnation, Rebirth and the Progress of the Soul" → Reincarnation, Rebirth and the Progress of the Soul (4669); Reincarnation, Rebirth and the Progress of the Soul (22219); Reincarnation, Rebirth and the Progress of the Soul (326594)
- 004-soul-reincarnation T1: **Bhagavad Gītā** [book] → The Bhagavad-Gita (doc 21038, by title)
  - checked: find-document "Bhagavad Gītā" → Bhagavad Gītā (in The Bhagavad Gita (Song Celestial, tr. Edwin Arnold), paragraphs 12-undefined) (17365); The Bhagavad-Gita (21038); Bhagavad-Gita and the Baha'i Faith (282917)
- 004-soul-reincarnation T2: **Paris Talks** ('Abdu'l-Bahá) [talk] → Paris Talks (doc 20908, by title)
  - checked: find-document "Paris Talks" → Paris Talks (20908); Paris Talks: Study Guide (23579); Paris Talks: Study Guide (28930) | phrase search → Paris Talks (20908) ¶374 coverage 1.00
- 004-soul-reincarnation T2: **On Reincarnation and the Nature and Progress of the Soul** (compilation ('Abdu'l-Bahá et al.)) [compilation] → Reincarnation and the Nature and Progress of the Soul (doc 22427, by title) — was in Anís's sources
  - checked: find-document "On Reincarnation and the Nature and Progress of the Soul" → Reincarnation and the Nature and Progress of the Soul (22427); Reincarnation and the Nature and Progress of the Soul (39558)
- 004-soul-reincarnation T4: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title) — was in Anís's sources
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- 004-soul-reincarnation T5: **The Vedānta-Sūtras with the Commentary by Rāmānuja (Śrībhāṣya), tr. George Thibaut, SBE 48** (Rāmānuja) [book] → The Vedanta-Sutras with Ramanuja Commentary (SBE Vol. 48) (doc 17384, by quote) — was in Anís's sources
  - checked: find-document "The Vedānta-Sūtras with the Commentary by Rāmānuja (Śrībhāṣy…" → none | documents?q → none | phrase search → The Vedanta-Sutras with Ramanuja Commentary (SBE Vol. 48) (17384) ¶358 coverage 1.00
- seed-21 T1: **Lights of Guidance** (Helen Hornby (comp.)) [compilation] → Lights of Guidance (doc 20804, by title)
  - checked: find-document "Lights of Guidance" → Lights of Guidance (20804); Lights of Guidance: A Bahá’í Reference File (8680); lights-of-guidance-000_en (609524)
- seed-21 T4: **Star of the West, vol. 7, no. 13** ('Abdu'l-Bahá (reported talk)) [article] → The Promulgation of Universal Peace (doc 20917, by quote)
  - checked: find-document "Star of the West, vol. 7, no. 13" → none | documents?q → none | phrase search → The Promulgation of Universal Peace (20917) ¶658 coverage 1.00
- seed-21 T5: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- seed-39 T1: **Selections from the Writings of the Báb** (The Báb) [compilation] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607)
- seed-39 T1: **Gate of the Heart: Understanding the Writings of the Báb** (Nader Saiedi) [book] → Gate of the Heart: Understanding the Writings of the Báb (doc 8632, by title)
  - checked: find-document "Gate of the Heart: Understanding the Writings of the Báb" → Gate of the Heart: Understanding the Writings of the Báb (8632); Gate of the Heart: Understanding the Writings of the Bab, by Nader Saiedi: Review (153157); Gate of the Heart: Understanding the Writings of the Bab, by Nader Saiedi: Review (163882)
- seed-39 T1: **Laws Abrogated by Bahá'u'lláh (compilation)** [compilation] → Laws Abrogated by Baha'u'llah (doc 919143, by title)
  - checked: find-document "Laws Abrogated by Bahá'u'lláh" → Laws Abrogated by Baha'u'llah (919143); Bahá’u’lláh, Abrogated Laws: Prohibition of Charging Interest (357319); Bahá’u’lláh, Abrogated Laws: Prohibition of Charging Interest (357321)
- seed-39 T2: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title)
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → The Most Holy Book (Kitáb-i-Aqdas) (16712) ¶295 coverage 1.00
- seed-39 T2: **The Kitáb-i-Aqdas** (Universal House of Justice) [book] → Kitáb-i-Aqdas (doc 924862, by title)
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → A Thematic Analysis and Summary of the Persian Bayán (15101) ¶207 coverage 0.08
- seed-39 T2: **Selections from the Writings of the Báb** (The Báb) [compilation] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607)
- seed-39 T3: **Selections from the Writings of the Báb** (The Báb) [book] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607) | phrase search → Selections from the Writings of the Báb (20898) ¶313 coverage 1.00
- seed-39 T3: **The Persian Bayán** (The Báb) [book] → A Traveller's Narrative Written to Illustrate the Episode of the Bab (doc 210400, by quote)
  - checked: find-document "The Persian Bayán" → The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726); The Persian Bayán: From A.L.M. Nicolas' French translation (15140) | documents?q → Persian Bayán: Summary and Thematic Analysis (14653); The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726) | phrase search → A Traveller's Narrative Written to Illustrate the Episode of the Bab (210400) ¶2572 coverage 0.67
- seed-39 T3: **A Thematic Analysis and Summary of the Persian Bayán** (Terry) [article] → A Thematic Analysis and Summary of the Persian Bayán (doc 15101, by title)
  - checked: find-document "A Thematic Analysis and Summary of the Persian Bayán" → A Thematic Analysis and Summary of the Persian Bayán (15101); Persian Bayan: Thematic Analysis and Summary (323196); Persian Bayán: Summary and Thematic Analysis (14653)
- seed-39 T4: **Sacred Acts, Sacred Space, Sacred Time** (John Walbridge) [book] → Sacred Acts, Sacred Space, Sacred Time (doc 23832, by title) — was in Anís's sources
  - checked: find-document "Sacred Acts, Sacred Space, Sacred Time" → Sacred Acts, Sacred Space, Sacred Time (23832); Sacred Acts, Sacred Space, Sacred Time (328596); Sacred Acts, Sacred Space, Sacred Time, by John Walbridge: Review (59574) | phrase search → Kitáb-i-Aqdas: Excerpts from John Walbridge, "Sacred Acts..." (216888) ¶14 coverage 1.00
- seed-39 T4: **The Kitáb-i-Aqdas (Introduction)** (Universal House of Justice) [book] → Kitáb-i-Aqdas (doc 924862, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → A Thematic Analysis and Summary of the Persian Bayán (15101) ¶207 coverage 0.08
- seed-39 T5: **The Kitáb-i-Aqdas (Introduction)** (Universal House of Justice (quoting Shoghi Effendi)) [book] → Kitáb-i-Aqdas (doc 924862, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → A Thematic Analysis and Summary of the Persian Bayán (15101) ¶207 coverage 0.08
- seed-66 T1: **Summons of the Lord of Hosts (Súriy-i-Haykal)** (Bahá'u'lláh) [tablet] → Summons of the Lord of Hosts (doc 20806, by title) — was in Anís's sources
  - checked: find-document "Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711)
- seed-66 T1: **Rashḥ-i-'Amá** (Bahá'u'lláh) [tablet] → Rashh-i-'Ama (doc 927201, by title) — was in Anís's sources
  - checked: find-document "Rashḥ-i-'Amá" → Rashh-i-'Ama (927201); Rashh-i-'Ama: Les Nuages des Royaumes d'en-haut (919090); Rashh-i-'Ama: Les nuees du plus haut des cieux (919089)
- seed-66 T1: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946)
- seed-66 T1: **Bahá'u'lláh (Bahá'í International Community statement)** (Bahá'í International Community) [article] → Bahá'u'lláh (doc 983065, by title)
  - checked: find-document "Bahá'u'lláh" → Bahá'u'lláh (983065); Bahá’u’lláh (445720); Bahá’u’lláh (445742)
- seed-66 T2: **Epistle to the Son of the Wolf** (Bahá'u'lláh) [tablet] → Epistle to the Son of the Wolf (doc 20780, by title)
  - checked: find-document "Epistle to the Son of the Wolf" → Epistle to the Son of the Wolf (20780); Epistle to the Son of the Wolf (926338); Epistle to the Son of the Wolf (984437)
- seed-66 T3: **The Qur'an** [book] → The Bahá'í World, Volume VII (93 and 94 of the Bahá'í Era, April 1936–1938 A.D.) (doc 967542, by quote)
  - checked: find-document "The Qur'an" → The Qur'an and Its Exegesis (English translation of Koran und Koranexegese) (956266); The Qur'an (Arabic, Simple Text) (21381); The Qur'an (Arabic) (21380) | documents?q → Qur'anic Kerygma: Epic, Apocalypse, and Typological Figuration (919398); The Qur’anic Epic and the Creation of Humanity (984142); The Qur'an: The First Book in Arabic (Part 1 of 3) (984127) | phrase search → The Bahá'í World, Volume VII (93 and 94 of the Bahá'í Era, April 1936–1938 A.D.) (967542) ¶8661 coverage 1.00
- seed-66 T3: **The Bible (Exodus)** [book] → The Bible (KJV), Exodus (doc 21226, by quote)
  - checked: find-document "The Bible" → The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); Bible Prophecies (984297); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | documents?q → Bible Prophecies (984297); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | phrase search → The Bible (KJV), Exodus (21226) ¶40 coverage 1.00
- seed-66 T4: **Epistle to the Son of the Wolf** (Bahá'u'lláh) [tablet] → Epistle to the Son of the Wolf (doc 20780, by title)
  - checked: find-document "Epistle to the Son of the Wolf" → Epistle to the Son of the Wolf (20780); Epistle to the Son of the Wolf (926338); Epistle to the Son of the Wolf (984437) | phrase search → Epistle to the Son of the Wolf (20780) ¶111 coverage 1.00
- seed-66 T4: **The Summons of the Lord of Hosts (Súratu'l-Haykal)** (Bahá'u'lláh) [tablet] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711) | phrase search → Summons of the Lord of Hosts (20806) ¶6 coverage 1.00
- seed-66 T4: **God Passes By** (Shoghi Effendi) [book] → God Passes By (doc 21310, by title) — was in Anís's sources
  - checked: find-document "God Passes By" → God Passes By (21310); God Passes By -- Study Guide (3782); God Passes By -- Study Guide (3788)
- seed-66 T5: **The Summons of the Lord of Hosts** (Bahá'u'lláh) [tablet] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711) | phrase search → Summons of the Lord of Hosts (20806) ¶7 coverage 1.00
- seed-93 T2: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title)
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679) | phrase search → Parallel Hidden Words in English (Early and Authorised) (15171) ¶42 coverage 1.00
- seed-93 T2: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas** (Bahá'u'lláh) [tablet] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827) | phrase search → Epistle to the Son of the Wolf (20780) ¶54 coverage 1.00
- seed-93 T2: **Bahá'u'lláh and the New Era** (J. E. Esslemont) [book] → Bahá’u’lláh and the New Era (doc 20813, by title)
  - checked: find-document "Bahá'u'lláh and the New Era" → Bahá’u’lláh and the New Era (20813); Bahá’u’lláh and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (125); Baha'u'llah and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (27740)
- seed-93 T3: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [compilation] → Tablet to the Central Organization for a Durable Peace, The Hague (doc 11434, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Tablet to the Central Organization for a Durable Peace, The Hague (11434) ¶45 coverage 1.00
- seed-93 T4: **Tablets to The Hague** ('Abdu'l-Bahá) [tablet] → Tablets to the Hague (doc 20916, by title)
  - checked: find-document "Tablets to The Hague" → Tablets to the Hague (20916); Lawh-i-Lahih - Tablet to the Hague (921704); Tablet to the Central Organization for a Durable Peace, The Hague (6945) | phrase search → Tablets to the Hague (20916) ¶23 coverage 1.00
- seed-93 T5: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097) | phrase search → Some Answered Questions (20911) ¶702 coverage 1.00
- seed-93 T5: **The Advent of Divine Justice** (Shoghi Effendi) [letter] → The Advent of Divine Justice (doc 20890, by title)
  - checked: find-document "The Advent of Divine Justice" → The Advent of Divine Justice (20890); Advent of Divine Justice (912371); Advent of Divine Justice (913762) | phrase search → Justice, Fairness and the Meekness of God (159030) ¶4 coverage 1.00

### Collection gaps (21) — Perplexity named, library lacks

- soul-after-death T1: **The Bible: First Epistle to the Thessalonians** (Paul) [letter]
  - checked: find-document "The Bible: First Epistle to the Thessalonians" → 2 Thessalonians (20975); 1 Thessalonians (20970) | documents?q → 2 Thessalonians (20975); 1 Thessalonians (20970) | phrase search → Writings of the Apostolic Fathers (19720) ¶4082 coverage 0.33
- soul-after-death T2: **The Qur'an** ((revealed to Muhammad)) [book]
  - checked: find-document "The Qur'an" → The Qur'an and Its Exegesis (English translation of Koran und Koranexegese) (956266); The Qur'an (Arabic, Simple Text) (21381); The Qur'an (Arabic) (21380) | documents?q → Qur'anic Kerygma: Epic, Apocalypse, and Typological Figuration (919398); The Qur’anic Epic and the Creation of Humanity (984142); The Qur'an: The First Book in Arabic (Part 1 of 3) (984127)
- soul-after-death T2: **Ma'arif al-Qur'an** (Mufti Muhammad Shafi) [book]
  - checked: find-document "Ma'arif al-Qur'an" → none | documents?q → none
- soul-after-death T2: **The Bible (Gospel of John)** [book]
  - checked: find-document "The Bible" → The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); Bible Prophecies (984297); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | documents?q → Bible Prophecies (984297); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214)
- soul-after-death T3: **The Holy Bible** [book]
  - checked: find-document "The Holy Bible" → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521) | documents?q → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521)
- soul-after-death T3: **The Qur'an** [book]
  - checked: find-document "The Qur'an" → The Qur'an and Its Exegesis (English translation of Koran und Koranexegese) (956266); The Qur'an (Arabic, Simple Text) (21381); The Qur'an (Arabic) (21380) | documents?q → Qur'anic Kerygma: Epic, Apocalypse, and Typological Figuration (919398); The Qur’anic Epic and the Creation of Humanity (984142); The Qur'an: The First Book in Arabic (Part 1 of 3) (984127)
- soul-after-death T3: **Samyutta Nikaya** [book]
  - checked: find-document "Samyutta Nikaya" → Samyutta Nikaya 1.18 - Hiri Sutta: Conscience (19293); Samyutta Nikaya 1.69 - Iccha Sutta: Desire (19300); Samyutta Nikaya 12.11 - Ahara Sutta: Nutriment (19309) | documents?q → Samyutta Nikaya 27.1 - Upakkilesa Samyutta: Defilements (19423); Samyutta Nikaya 44 - Introduction to the Avyakata Samyutta ((Undeclared-connected)) (19516); Samyutta Nikaya 1.18 - Hiri Sutta: Conscience (19293)
- soul-after-death T3: **Majjhima Nikaya** [book]
  - checked: find-document "Majjhima Nikaya" → Majjhima Nikaya 101 - Devadaha Sutta: At Devadaha (19218); Majjhima Nikaya 105 - Sunakkhatta Sutta: To Sunakkhatta (19219); Majjhima Nikaya 126 - Bhumija Sutta: To Bhumija (19233) | documents?q → Majjhima Nikaya 101 - Devadaha Sutta: At Devadaha (19218); Majjhima Nikaya 105 - Sunakkhatta Sutta: To Sunakkhatta (19219); Majjhima Nikaya 126 - Bhumija Sutta: To Bhumija (19233)
- soul-after-death T5: **The Gathas: The Hymns of Zarathushtra (Jafarey translation, Zarathushtrian Assembly)** (Zarathushtra) [book]
  - checked: find-document "The Gathas: The Hymns of Zarathushtra" → none | documents?q → none | phrase search → The Gathas (21306) ¶258 coverage 0.00
- soul-after-death T5: **Encyclopaedia Iranica, "Gathas i. Texts"** (Encyclopaedia Iranica) [article]
  - checked: find-document "Encyclopaedia Iranica, "Gathas i. Texts"" → none | documents?q → none
- soul-after-death T5: **Zarathushti View of Death and the Afterlife** [article]
  - checked: find-document "Zarathushti View of Death and the Afterlife" → none | documents?q → none
- detachment-buddhism T3: **Saṃyutta Nikāya** (Pali Canon) [book]
  - checked: find-document "Saṃyutta Nikāya" → Samyutta Nikaya 1.18 - Hiri Sutta: Conscience (19293); Samyutta Nikaya 1.69 - Iccha Sutta: Desire (19300); Samyutta Nikaya 12.11 - Ahara Sutta: Nutriment (19309) | documents?q → Samyutta Nikaya 27.1 - Upakkilesa Samyutta: Defilements (19423); Samyutta Nikaya 44 - Introduction to the Avyakata Samyutta ((Undeclared-connected)) (19516); Samyutta Nikaya 1.18 - Hiri Sutta: Conscience (19293)
- golden-rule T4: **The Bible (ESV), Gospel of Luke** [book]
  - checked: find-document "The Bible (ESV), Gospel of Luke" → The Gospel of Luke (20990) | documents?q → none | phrase search → The Analects (20997) ¶152 coverage 0.00
- 004-soul-reincarnation T1: **Bṛhadāraṇyaka Upaniṣad** [book]
  - checked: find-document "Bṛhadāraṇyaka Upaniṣad" → none | documents?q → none
- 004-soul-reincarnation T1: **Anattalakkhaṇa Sutta (Saṃyutta Nikāya 22.59)** [book]
  - checked: find-document "Anattalakkhaṇa Sutta" → Samyutta Nikaya 22.59 - Anattalakkhana Sutta (Not-self Characteristic) (17268) | documents?q → Samyutta Nikaya 22.59 - Anattalakkhana Sutta (Not-self Characteristic) (17268)
- 004-soul-reincarnation T1: **Saṃyutta Nikāya 12.23** [book]
  - checked: find-document "Saṃyutta Nikāya 12.23" → Samyutta Nikaya 12.23 - Upanisa Sutta: Discourse on Supporting Conditions (19317) | documents?q → Samyutta Nikaya 12.23 - Upanisa Sutta: Discourse on Supporting Conditions (19317)
- 004-soul-reincarnation T2: **Milindapañha (The Questions of King Milinda)** (Nāgasena (traditional)) [book]
  - checked: find-document "Milindapañha" → none | documents?q → none | phrase search → Samyutta Nikaya 44.7 - Moggallana Sutta: With Moggallana (19525) ¶4 coverage 0.00
- seed-21 T3: **Enchiridion (Handbook on Faith, Hope and Love)** (Augustine of Hippo) [book]
  - checked: find-document "Enchiridion" → none | documents?q → none
- seed-21 T3: **The Enneads** (Plotinus) [book]
  - checked: find-document "The Enneads" → Tag: Enneads (289652); Tag: Enneads (289649) | documents?q → Tag: Enneads (289652); Tag: Enneads (289649)
- seed-39 T2: **Persian Bayán** (The Báb) [book]
  - checked: find-document "Persian Bayán" → The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726); The Persian Bayán: From A.L.M. Nicolas' French translation (15140) | documents?q → Persian Bayán: Summary and Thematic Analysis (14653); The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726)
- seed-93 T2: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [compilation]
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312)

### Not determinable (5)

- soul-after-death T1: **The Bible: First Epistle to the Corinthians** (Paul) [letter]
  - checked: find-document "The Bible: First Epistle to the Corinthians" → 1 Corinthians (20967) | documents?q → 1 Corinthians (20967)
- detachment-buddhism T1: **Upadana Sutta (Samyutta Nikaya XII.52)** (Pali Canon) [other]
  - checked: find-document "Upadana Sutta" → Samyutta Nikaya 12.52 - Upadana Sutta: Clinging (19325); Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (19374) | documents?q → Samyutta Nikaya 12.52 - Upadana Sutta: Clinging (19325); Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (19374)
- equality-sexes T1: **Women (compilation)** (Shoghi Effendi (on his behalf)) [letter]
  - checked: find-document "Women" → Women in Religion (984427); Women of Consequence in the Life of the Báb (984064); Women and Development (967297) | documents?q → Women and Peace (983761); Women and the Broadcast Media: Legal Strategies for Enhancing the Portrayal of Women (967389); Women and Development (967297)
- equality-sexes T1: **Messages of the Universal House of Justice: letter of 31 May 1988 to the National Spiritual Assembly of New Zealand** (Universal House of Justice) [letter]
  - checked: find-document "Messages of the Universal House of Justice: letter of 31 May…" → none | documents?q → none
- equality-sexes T5: **Letter of the Universal House of Justice, 31 May 1988, to the National Spiritual Assembly of New Zealand** (Universal House of Justice) [letter]
  - checked: find-document "Letter of the Universal House of Justice, 31 May 1988, to th…" → none | documents?q → none

### Perplexity errors (89)

- soul-after-death T1 [other] (Anís right): It answers only from Christian scripture. It leaves out Bahá'u'lláh's explicit statement (Gleanings LXXXVI) that souls will know and commune with one another after death, the most direct answer to the question.
- soul-after-death T2 [wrong_location]: Minor: the 'associate and commune intimately' quote comes from Gleanings LXXXVI, but the reference.bahai.org link points to section LXXXI. The text hedges this as 'passages on the soul and the Crimson Ark.'
- soul-after-death T3 [unofficial_translation]: Perplexity cites Tablets of 'Abdu'l-Bahá vol. 1 (an early, unauthorised translation) as the clearest statement without noting its translation status.
- soul-after-death T3 [wrong_location]: Perplexity points to the Gleanings 'section on the soul after death' without a section number, which is imprecise.
- soul-after-death T4 [wrong_location]: Perplexity cites the 'souls of the people of Bahá ... shall associate and commune intimately' passage as Gleanings section CXL. As I recall, it is in section LXXXVI (I'm not fully certain).
- soul-after-death T4 [invented_or_misquoted]: The closing clause 'and are united in the bonds of intimacy and fellowship' does not seem to match the authorised wording of that Gleanings passage. It looks like a paraphrase presented inside quotation marks.
- soul-after-death T5 [wrong_location]: Cites Bahá'u'lláh's passage on souls associating and communing as Gleanings section 79. It is section LXXXVI (86).
- detachment-buddhism T1 [wrong_location]: The 'one same substance… essence of detachment' passage is cited as Persian Hidden Words 56; it is Arabic no. 68.
- detachment-buddhism T1 [wrong_location]: 'O My Friend! In the garden of thine heart…' is cited as Persian no. 40; it is Persian no. 3.
- detachment-buddhism T1 [wrong_location]: The Íqán true-seeker passage is placed in 'part 1'; it is in Part Two (¶213).
- detachment-buddhism T1 [wrong_location]: The consultation passage is cited as Selections no. 55; I believe it is no. 43.
- detachment-buddhism T2 [unofficial_translation]: It presents Juan Cole's provisional translation of the Commentary on "He who knoweth his self" as Bahá'u'lláh's words without saying it is unofficial.
- detachment-buddhism T2 [misattribution]: It calls the "highest form of detachment… self-supporting" line "attributed to Bahá'u'lláh". To my knowledge it comes from a letter written on behalf of Shoghi Effendi that reports Bahá'u'lláh's teaching, and the answer does not say so.
- detachment-buddhism T3 [wrong_location]: It attributes the stock 'grows disenchanted with form... becomes dispassionate' formula to SN 22.63 while citing a dhammatalks essay. The formula recurs across many suttas (e.g. SN 22.59), so the location is uncertain.
- detachment-buddhism T3 [other] (Anís right): It says no reliable source exists for the 'Sutra Collection' quotation, when Anís actually supplied the verbatim text with a library link. The work's identity is still unclear, but the passage itself is not invented.
- detachment-buddhism T5 [other]: Perplexity said 'systematic release' was 'my gloss', taking ownership of a phrase from earlier turns in the conversation that it did not write. This is minor. The translator, Thanissaro Bhikkhu, is not named in the text.
- equality-sexes T1 [wrong_location]: The Selections from the Writings of 'Abdu'l-Bahá passage on the House of Justice being confined to men is probably no. 38, not no. 94.
- equality-sexes T1 [invented_or_misquoted]: The Tablets vol. 3 wording 'the equals of men in all rights save only that of membership' appears to be a paraphrase placed in quotation marks; the tablet reads 'equal in all rights save in the Universal House of Justice'.
- equality-sexes T1 [authority_error]: The 22 December 2013 House of Justice letter is called 'the authoritative synthesis' of a doctrinal reconciliation, which casts a House letter as interpretation.
- equality-sexes T2 [misattribution] (Anís right): Calls the Dawn of a New Day sentence 'the book's narrative/reporting'. It is in fact a letter written on behalf of Shoghi Effendi, collected in a book of his letters to India.
- equality-sexes T2 [wrong_location]: Places 'Abdu'l-Bahá's 'confined to men... as clearly as the sun at high noon' Tablet only vaguely, in 'compilations of Tablets', citing the Women and Universal House of Justice compilations. It does not give the standard source, Selections from the Writings of 'Abdu'l-Bahá no. 38.
- equality-sexes T4 [misattribution] (Anís right): Attributes 'As regards the constitution of the House of Justice, Bahá'u'lláh addresses the men...' to Paris Talks, Part Three. As far as I know it comes from Sohrab's 'Abdu'l-Bahá in Egypt (as the Women compilation and Lights of Guidance cite it).
- equality-sexes T4 [pilgrim_note_as_writings] (Anís right): Presents the Sohrab-recorded words as 'Abdu'l-Bahá's own text without flagging them as a pilgrim's note.
- equality-sexes T4 [authority_error]: Rests the meaning of rijál and the 'contested' claim on an anti-Bahá'í blog, a dissident site (uhj.net) and Reddit, and says the inclusive reading comes from 'subsequent interpretation', confusing scholarly or dissident opinion with authoritative interpretation.
- equality-sexes T5 [factual]: Says the 1988 House of Justice letter discusses 'Qur'anic/Arabic wording'. That letter deals with the Tablet's terminology and how 'Abdu'l-Bahá later clarified that the restriction applies to the Universal House of Justice, not with Qur'anic wording.
- return-iqan T1 [misattribution]: Places the John/Elijah discussion ('I am not Elias' set against Christ calling John Elijah) in Kitáb-i-Íqán Part One. That exposition belongs to 'Abdu'l-Bahá, Some Answered Questions ch. 33.
- return-iqan T1 [invented_or_misquoted] (Anís right): The passage openings 'Among the Prophets was John…' and 'If thou sayest that Muḥammad was the “return” of the Prophets of old…' don't match the Íqán text as far as I know.
- return-iqan T1 [wrong_location]: Gives ¶160 for 'Strive therefore to comprehend the meaning of return'. The number and the wording are both doubtful; the return discussion begins around ¶161.
- return-iqan T3 [wrong_location]: It gives ¶162 for both quotations and pp. 150–151 as an example page range. The paragraph may be ¶161 (I am unsure). The page is likely ~153–154 in the US edition, though Perplexity does hedge it as edition-dependent.
- return-iqan T4 [wrong_location]: The paragraph numbers 176–178 look doubtful. The 'Temples of the Cause of God' / 'same tabernacle' passage is usually placed around ¶161 in the bahai.org numbering, and it comes before the 'Birds of the Celestial Throne' passage, not after it. I am not fully certain of this.
- return-iqan T4 [invented_or_misquoted]: 'For they are all but one person, one soul, one spirit, one being, one revelation' could not be confirmed as exact Íqán wording. It may be a blend of phrasing from nearby passages.
- return-iqan T5 [wrong_location]: Places the 'Temples of the Cause of God' passage at Íqán ¶183. I believe it is ¶161.
- return-iqan T5 [invented_or_misquoted]: 'These Birds of heaven all have but one wing, and soar in the same heaven. Though each hath a different name, yet all are the same.' is given as Íqán ¶182. I can't verify this wording in the Íqán, so it may be misquoted or invented.
- return-iqan T5 [wrong_location] (Anís right): Calls SAQ 'The Return of the Prophets' 'question 18'. It is chapter 33.
- return-iqan T5 [other]: Says the Íqán uses rujūʿ (root r-j-ʿ) without citing any source. It is plausible but unverified.
- golden-rule T1 [wrong_location]: Puts 'Lay not on any soul a load...' in Gleanings section CXXVIII; it is in Gleanings LXVI.
- golden-rule T2 [wrong_location]: Cites 'Ascribe not to any soul that which thou wouldst not have ascribed to thee' as Persian Hidden Words no. 19; it is Arabic no. 29.
- golden-rule T2 [other]: Assumes the passage the reader meant is the Hidden Words one, so the answer to 'is it also in the Hidden Words' rests on that guess. It does not say which Summons passage was meant (likely Súriy-i-Mulúk, Gleanings LXVI).
- golden-rule T3 [factual]: It claims that some editions number this passage Arabic no. 67. The standard authorised numbering is 68, and I know of no edition numbered 67, so the claim looks unsupported.
- golden-rule T3 [other]: Its reference to a 'Bahá'í Sacred Writings' anthology with section 9.22 is unverified; I am not sure this anthology numbering exists.
- golden-rule T4 [wrong_location]: Gives the 'same dust' passage as Hidden Words Arabic no. 19. It is Arabic no. 68.
- golden-rule T5 [invented_or_misquoted]: Quotes Hidden Words Arabic no. 67 as "By My beauty! I have created all things from dust, and to dust will I return them again." That is not the text of Arabic 67 and does not appear to be in The Hidden Words at all. The cited source is a Gutenberg page, not the authoritative text.
- 004-soul-reincarnation T1 [wrong_location]: The passage saying the soul's reality cannot be grasped is cited as Gleanings LXXXI. It is in LXXXII.
- 004-soul-reincarnation T1 [other]: Footnote [1], a PDF of the reincarnation compilation, is labelled as bahai.org's 'The Rational Soul'. Bahaipedia is cited as [2] but labelled as the 'Abdu'l-Bahá compilation, so citations and sources do not line up.
- 004-soul-reincarnation T1 [other]: The flame simile for rebirth is presented without attribution. It comes from the Milindapañha, not from the suttas cited.
- 004-soul-reincarnation T2 [invented_or_misquoted]: The quoted wording "the return of qualities" vs "the return of entities" is attributed to 'Abdu'l-Bahá through a compilation. I could not verify that exact phrasing in his writings.
- 004-soul-reincarnation T2 [other]: Presents Paris Talks (a record of 'Abdu'l-Bahá's talks) as his statement without noting that it is a talk transcript rather than his own writing.
- 004-soul-reincarnation T4 [misattribution]: The question about keeping 'the self-same individuality, personality, consciousness, and understanding' after death, and its answer, are Bahá'u'lláh's (Gleanings LXXIX), not 'Abdu'l-Bahá's in Some Answered Questions ch. 62.
- 004-soul-reincarnation T4 [wrong_location]: 'The soul is a sign of God' is cited as Gleanings LXXX; it is in LXXXII.
- 004-soul-reincarnation T4 [invented_or_misquoted]: 'once it has come into being, it is everlasting' is presented as a quotation, but I couldn't find that wording in the cited Gleanings passages (not certain).
- 004-soul-reincarnation T4 [wrong_location]: 'essential identity' is attributed to SAQ ch. 48; it looks like the wording of a bahai.org summary page, not the chapter itself.
- 004-soul-reincarnation T5 [wrong_location]: Says the question about keeping 'the self-same individuality, personality, consciousness, and understanding' is in the same section (LXXXI); it opens a different Gleanings section, probably LXXXIII (number not certain).
- 004-soul-reincarnation T5 [other]: Footnote [2] for the Rāmānuja quotations points to a Gleanings URL rather than its Śrībhāṣya pages; no sutra number or translator given.
- seed-21 T1 [misattribution] (Anís right): Cites 'Bahá'u'lláh's Bahá'í Sacred Writings, section 3', which is not a recognisable work; the passage is paraphrased without a verifiable source.
- seed-21 T1 [wrong_location] (Anís right): The link given for SAQ ch. 74 points to bahai.org SAQ section 12, not chapter 74.
- seed-21 T1 [other] (Anís right): Cites the Shoghi Effendi letter only through the secondary compilation Lights of Guidance, not Unfolding Destiny where it was first published; the number 1769 could not be verified.
- seed-21 T2 [wrong_location]: Gives the chapter title as 'On Good and Evil'. In the authorized edition, chapter 74 is 'The Nonexistence of Evil'.
- seed-21 T2 [wrong_location]: Places the point that things are evil only 'in relation to another' in the same chapter. That relative-evil analysis belongs to chapter 75, 'Two Kinds of Evil'.
- seed-21 T3 [wrong_location]: It gives the SAQ ch. 74 title as 'On Good and Evil' (the title is 'The Nonexistence of Evil') and cites 'sections 6–7' of what is a short chapter.
- seed-21 T3 [factual]: It says SAQ is Barney's compilation 'rather than a translation' of a Persian text. In fact the Persian original was transcribed and reviewed by 'Abdu'l-Bahá. It also calls the authoritative edition Barney's, but the 2014 edition is a revised translation by the Bahá'í World Centre.
- seed-21 T3 [other]: The footnotes are mismatched: the Augustine and Plotinus claims are cited to [2] and [3], which are bahai.org pages. It also uses the odd phrase 'Bahá'u'lláh's later interpreters'.
- seed-21 T4 [wrong_location] (Anís right): Gave Star of the West vol. 7, no. 13 as the location of the reader's quotation, but that issue holds a different passage, about the spirit.
- seed-21 T4 [invented_or_misquoted] (Anís right): Said the reader's wording, "if change and transformation does not exist, then there can be no composition and growth", was an inaccurate paraphrase, when the wording appears verbatim in the Star of the West record.
- seed-21 T5 [other]: Star of the West vol. 5 no. 19 appears among its URLs, but it never checks whether that version of the talk mentions evil. Its hedge only partly covers this.
- seed-21 T5 [wrong_location]: It refers to the good-and-evil discussion in Some Answered Questions without giving the chapter number (74), and cites the Persian SAQ link for section 4, which has nothing to do with it.
- seed-39 T1 [factual]: Says the Bayán abolished capital punishment (Váḥid XI.16). That is doubtful: the Bayán has severe penalties, and I can't confirm this reading.
- seed-39 T1 [wrong_location]: Váḥid/chapter references for 'till the Day of Resurrection' (III.7) and for acts done for God (IV.10) are unverified and possibly misplaced.
- seed-39 T1 [other]: Calls one way of reading the Bayán 'Christologically'. Christ has no place in it; the word is inapt.
- seed-39 T2 [misattribution]: Says 'Bahá'u'lláh explains in the introduction to the Kitáb-i-Aqdas'. The Introduction was written by the Universal House of Justice, not Bahá'u'lláh.
- seed-39 T2 [wrong_location]: Attributes the passages about being trained in the Bayán and about its favourable and negative descriptions to the 'Tablet to Muhammad Sháh'. They come from the Persian Bayán excerpts in Selections.
- seed-39 T2 [other]: The Persian Bayán reference (Váḥid 3, chapter 7) for the 'gift' passage rests on secondary scholarship and is unverified.
- seed-39 T3 [misattribution]: It credits the Váḥid 5, Báb 3 rendering to E. G. Browne. Browne produced a summary or index of the Persian Bayán, not a translation, and the cited page is the bahai.org page of extracts, so the quotation and its location are unverified.
- seed-39 T3 [wrong_location]: The scholarly summary 'with which He can do whatever He wishes' is linked to Selections from the Writings of the Báb, which is not a scholarly summary. Separately, the authorised Váḥid 6, Báb 16 text is linked to MacEoin's translation on bahai-library rather than to Selections.
- seed-39 T4 [wrong_location]: It says Aqdas 'paragraph 186' states that the Báb made His laws subject to the sanction of Him Whom God would make manifest. The Aqdas does not say this at ¶186. The number comes from an unofficial bahai-library sentence-numbered notes page.
- seed-39 T4 [misattribution] (Anís right): It credits 'by embodying them in the Kitáb-i-Aqdas in different words' to the 'authorized note' to the Aqdas. These are Bahá'u'lláh's own words in a tablet ('Our Exalted Herald… hath revealed certain laws…'), as Anís correctly showed.
- seed-39 T4 [unofficial_translation]: It cites the bahai-library 'Notes to Aqdas, Sentence #186' (provisionals) page as if it were the authorised notes.
- seed-39 T4 [other] (Anís right): For reading aloud it recommends the House of Justice's Introduction summary and leaves out Bahá'u'lláh's own words on the same point.
- seed-39 T5 [authority_error]: Perplexity quotes the Aqdas Introduction only as 'the official introduction' without naming who is speaking (I believe it is Shoghi Effendi, not certain). It then lists that summary under 'Báb:' as if it were the Báb's own position, not a later summary.
- seed-66 T1 [misattribution] (Anís right): Attributes the 'During the days I lay in the prison of Tihrán… something flowed from the crown of My head' passage to Súriy-i-Haykal; it comes from Epistle to the Son of the Wolf.
- seed-66 T1 [other]: Muddled attribution of the Maiden passage ('The Four Valleys? No—…later summarized in the Epistle to the Son of the Wolf tradition').
- seed-66 T1 [factual]: Mistranslates Rashḥ-i-'Amá as 'The Sullen of the Unseen'; it is usually rendered 'Sprinkling from the Cloud of Unknowing' or 'Mist of the Unknown'.
- seed-66 T4 [wrong_location]: It quotes 'this Wronged One sojourned for a period of four months in that city' as Bahá'u'lláh's statement about Tehran. That wording seems to refer to Constantinople. The Tehran passage in the Epistle is 'consigned for four months to a place foul beyond comparison' (uncertain).
- seed-66 T4 [authority_error] (Anís right): The specific 16–27 October 1852 dating 'after about two months' comes from secondary tag pages and Wikipedia, not a primary text. It is hedged as 'commonly cited', so this is a minor issue.
- seed-66 T5 [wrong_location]: The footnote numbers are scrambled: the ESW quotation cites [1] (a Summons URL), the Summons quotations cite [3] (an ESW URL), and [4] (a 'From the Epistle to the Son of the Wolf' page) is cited for the Maiden phrases from the Súriy-i-Haykal.
- seed-66 T5 [other]: Perplexity presents an 'immediate sequence' (the torrent first, then the Maiden) built from two separate tablets, as if Bahá'u'lláh had set out that order himself. It does add a caveat against merging the two passages.
- seed-93 T2 [other]: It names the primary works for the Hidden Words and Words of Paradise quotations, but its web citation for them is Esslemont's Bahá'u'lláh and the New Era, a secondary book. This is a minor sourcing weakness, not a misattribution.
- seed-93 T3 [misattribution]: It attributes 'be ye the helpers of every victim of oppression', 'the patrons of the disadvantaged', 'think ye at all times of rendering some service…' and 'Pay ye no heed to aversion and rejection… act ye in the opposite way' to the Tablet to The Hague. I believe these lines are in Selections from the Writings of 'Abdu'l-Bahá, no. 1 (fairly confident, not certain).
- seed-93 T5 [wrong_location]: Gives the location as 'Miscellaneous Subjects, section 8'. The usual reference is chapter 77 (The Punishment of Criminals), so this is imprecise or possibly wrong.
- seed-93 T5 [other]: Calls the Advent of Divine Justice wording a 'Persian-influenced translation'. That's an odd way to put it: the difference is the older translation (Barney's), not Persian influence.

#### soul-after-death

- T1 *opening*: **anis** — Both identify their sources correctly. Perplexity gives more references, each with exact verse numbers, but stays entirely within Christian scripture. Anís names the text that answers the question most directly: Bahá'u'lláh's Gleanings LXXXVI, which says outright that souls will know and commune with one another. Under the authority order, that passage ranks first. His Qur'an and 2 Samuel quotations are also accurate, and his links go to the exact paragraphs. His only slips are minor: naming Samuel as author of 2 Samuel, and quoting the Qur'an verse loosely out of its context. (Perplexity 5.5 s, $0.00528)
- T2 *reference*: **px** — Perplexity actually answered the reference question. It pointed to specific, correctly located passages: Qur'an 10:45 with the Ma'arif al-Qur'an commentary, the Gleanings passages on the soul, 2 Samuel 12:23 and John 20. It kept scripture and commentary clearly apart. Anís gave one accurate Íqán quotation, but it is about the Qur'an's authority, not about life after death or recognising loved ones, so it doesn't help the reader find what they asked for. (Perplexity 6.2 s, $0.00519)
- T3 *deepen*: **px** — Perplexity names the right primary texts for each tradition, with accurate verse and page locations. Most importantly, it gives the Bahá'í source that directly answers 'will I recognise her' ('Abdu'l-Bahá, Tablets vol. 1, p. 205). Anís cites only two passages, and neither addresses the soul after death. He also leaves out the Bahá'í afterlife texts (such as Gleanings) that he had already quoted in T1. (Perplexity 6.9 s, $0.00599)
- T4 *absent*: **px** — Perplexity found the actual written passage that answers the question: 'Abdu'l-Bahá's tablet stating that recognition in the spiritual world is 'certain'. It attributed it correctly, with a usable location, and added Bahá'u'lláh's Gleanings passage on souls communing with one another. Its errors were a probably wrong section number and a loose final clause in that Gleanings quote. Anís quoted a real Gleanings passage that has nothing to say about recognition, gave no section, and missed the key tablet entirely. (Perplexity 5.1 s, $0.00544)
- T5 *compare*: **px** — On the question actually asked (the Gathas), Perplexity cites the right verses (Y 46.10–11, 51.13, 51.22), uses the correct Gathic terms and separates scripture from later explanation. Its only error is a wrong Gleanings section number (79 instead of LXXXVI). Anís gets the Bahá'í attributions right, but his Gathas quote is unlocated and doesn't concern the afterlife, and his 'Denkard' quote reads like the Dadestan-i Denig. (Perplexity 6.0 s, $0.00529)

#### detachment-buddhism

- T1 *opening*: **anis** — Anís quotes authentic Writings verbatim, links each one to the exact paragraph, and correctly ranks the Table Talks pilgrim note below the Writings. His one slip is citing Cole's provisional translation without saying it is provisional. Perplexity gives a wider and more useful range of passages, including 'Abdu'l-Bahá's own written words, which Anís lacks. But it misnumbers several of them (Hidden Words Persian 56 and 40, Íqán 'part 1', Selections 55), so its precision can't be trusted. (Perplexity 7.8 s, $0.00611)
- T2 *reference*: **px** — Both rest on the same two key texts. Perplexity names where the \"essence of detachment\" passage actually comes from (Tablets of Bahá'u'lláh, Words of Wisdom). Anís credits it to a generic compilation. Perplexity also quotes the Commentary's explicit positive definition, which answers the reader's question directly. Neither labels Cole's translation as provisional. Perplexity's \"self-supporting\" attribution is loose: it is a letter written on behalf of the Guardian, though I am not completely sure of that. Still, Perplexity is the more precise of the two. (Perplexity 4.7 s, $0.00591)
- T3 *exact_quote*: **px** — Perplexity wins on identifying sources. Anís quotes the passage exactly, with a paragraph link, but names only a 'Sutra Collection' by an unknown author. That never establishes what the text is or whether it concerns virāga, and he leaves the question about Buddhist sources on clinging unanswered. Perplexity names canonical suttas by number (SN 22.63, SN 12.52), quotes them accurately, and correctly calls 'deconstruction' a modern paraphrase rather than scripture. Its faults are minor: it is unsure where the stock disenchantment formula comes from, and it wrongly says the Sutra Collection quote has no source at all. (Perplexity 5.5 s, $0.00573)
- T4 *absent*: **undefined** — undefined (Perplexity 6.2 s, $0.00551)
- T5 *pushback*: **px** — Perplexity identified the sutta (DN 15, Mahānidāna Sutta) and quoted it accurately. It also answered the reader's actual questions: 'systematic release' was a gloss, and the passage uses neither 'non-attachment' nor virāga. Anís answered a different question with an Arabic word study and gave no Buddhist source. (Perplexity 4.5 s, $0.00516)

#### equality-sexes

- T1 *opening*: **px** — undefined (Perplexity 6.2 s, $0.00594)
- T2 *reference*: **px** — Perplexity is the more correct of the two. It separates the 'fully revealed' line, which comes from a letter written on behalf of Shoghi Effendi in Women, from the Dawn of a New Day wording, and it quotes 'Abdu'l-Bahá's actual Tablet. That answers the reader's question about authorship. Its errors: it calls the Dawn passage the book's narrative, and it never names Selections no. 38. Anís gets the Dawn passage right as a letter on behalf of Shoghi Effendi, but he contradicts himself. He also ignores the Women-compilation letter that was in his own retrieval, and he gives neither 'Abdu'l-Bahá's words nor any recipient or date. (Perplexity 6.0 s, $0.00584)
- T3 *compare*: **undefined** — undefined (Perplexity 6.3 s, $0.00616)
- T4 *deepen*: **px** — Perplexity found the primary text at stake (Aqdas ¶52) and the Arabic term rijál, which answers the question. Anís said nothing about the original term or the Aqdas verse. Perplexity's misattribution to Paris Talks and its reliance on polemical sites are real flaws, and Anís was more careful in labelling the pilgrim's note, but on finding the actual source Perplexity did better. (Perplexity 5.7 s, $0.00555)
- T5 *absent*: **px** — The reader asked for the Tablet, its date and its recipient. Perplexity named the Tablet to Corinne True (Selections no. 38) and the 1936 letter written on Shoghi Effendi's behalf, and kept 'Abdu'l-Bahá's words separate from the secretary's letter. Anís quoted only a later letter written on the Guardian's behalf, without saying so and without a date or recipient. He also said the Tablet couldn't be identified, although his own retrieval had surfaced its text. (Perplexity 5.5 s, $0.00569)

#### return-iqan

- T1 *opening*: **anis** — Anís's Íqán quotations are real, linked to the paragraph, and on topic, and he correctly brings in SAQ ch. 33, though the attribution line is garbled. Perplexity gives a better reading plan, but it misattributes the John/Elijah exposition, the heart of the reader's question, to the Íqán. That passage is 'Abdu'l-Bahá's, in Some Answered Questions ch. 33. Several of its 'passage beginning' quotations also appear to be made up. I'm not certain of every paragraph number on either side. (Perplexity 6.9 s, $0.00585)
- T2 *reference*: **undefined** — undefined (Perplexity 5.6 s, $0.00577)
- T3 *exact_quote*: **px** — Perplexity found the actual Íqán passage on the oneness and 'return' of the Prophets. It quoted it accurately with a paragraph reference and explained that the reader's phrase was a paraphrase, not the text's wording. Anís retrieved nothing and did not recognise that the phrase was his own summary, even though he had quoted the opening of this very passage in T1. He left the reader with no source. (Perplexity 6.9 s, $0.00566)
- T4 *pushback*: **px** — The reader asked whether the Íqán actually contains this wording and where the passage is. Perplexity answered directly: the phrase is a paraphrase. It then gave real Íqán passages attributed to Bahá'u'lláh in Part Two. Its paragraph numbers are probably off (the passage is more likely around ¶161), and its order puts the 'Temples' passage after the 'Birds' passage, which looks reversed. Even so, the reader could find and read the passages. Anís named no source and couldn't even confirm that the wording was his own summary. (Perplexity 5.2 s, $0.00573)
- T5 *deepen*: **px** — Both name the right SAQ chapter. Anís stops there: it gives no Íqán passage, no quotation, and no answer on what 'return' means, even though its retrieval contained the SAQ explanation. Perplexity rests the answer in the right order of authority: an Íqán passage from Bahá'u'lláh first, then 'Abdu'l-Bahá's explanation in SAQ, quoted accurately. It also correctly warns that 'single, enduring divine light' is not the Íqán's wording. Its weaknesses are location errors (¶183 and 'question 18') and one Íqán quotation that may not be genuine. Even so, it identifies more of the actual sources than Anís does. (Perplexity 6.3 s, $0.00611)

#### golden-rule

- T1 *opening*: **px** — The reader asked where Bahá'u'lláh states the Golden Rule. Anís wrongly said there was no direct parallel and offered only an uncited paraphrase. Perplexity gave four authentic passages from Bahá'u'lláh, with locations that are correct apart from the Gleanings section number (LXVI, not CXXVIII). It answers the actual question; Anís does not. (Perplexity 4.1 s, $0.00459)
- T2 *reference*: **px** — Perplexity found the real Golden Rule passage in the Hidden Words and quoted it in the authorised translation, though it gave the number as Persian 19 instead of Arabic 29. It also cited Persian 44 correctly. Anís wrongly said the wording is not in the Hidden Words, and backed this with an unnumbered, untranslated Arabic fragment that is doubtfully from the Hidden Words. (Perplexity 4.0 s, $0.00488)
- T3 *source*: **px** — Both correctly identify The Hidden Words and correct the Prayers and Meditations mix-up. Perplexity answers what the reader actually asked for, the exact location: Arabic no. 68 (correct), plus a page number. Anís says the location cannot be determined, even though the Hidden Words are numbered and this one is well known. (Perplexity 4.5 s, $0.00523)
- T4 *compare*: **px** — Perplexity gave verse-level Bible references that are correct, plus a real comparison, and it named the Hidden Words as the work. It did state the wrong number (Arabic 19 instead of 68). Anís gave no number, wrongly said the Hidden Words have no numbers, cited no Bible verse and gave no actual comparison. Perplexity wins on balance despite its numbering error. (Perplexity 4.5 s, $0.0055)
- T5 *deepen*: **px** — Perplexity correctly placed the passage at Hidden Words, Arabic no. 68 and gave the right Arabic terms (turāb, jawhar wāḥid). However, it added a 'no. 67' quote that appears to be invented. Anís answered from the wrong text, 'Abdu'l-Bahá's unity-of-existence discussion, and never addressed the Hidden Words term or where else Bahá'u'lláh uses it. (Perplexity 5.0 s, $0.00504)

#### 004-soul-reincarnation

- T1 *opening*: **px** — Anís's one citation is exact and authoritative, but it covers only the Bahá'í–Hindu contrast. He gives up on Buddhism, which was half of the question. Perplexity identifies each tradition's own scriptures with usable references (Gītā, Upaniṣad, Pali Canon) and labels the commentary as such. It also points to the Bahá'í compilation on reincarnation and to Gleanings. It has real flaws: the Gleanings section number is wrong, its 'Abdu'l-Bahá attribution is vague, it leans on websites, and some footnotes are mismatched. Even so, it identifies more of the sources the question needs. (Perplexity 6.0 s, $0.00579)
- T2 *reference*: **px** — Perplexity answers both halves of the question from primary sources. It quotes 'Abdu'l-Bahá's Paris Talks accurately and in the right place, and it cites the Milindapañha's "neither the same nor another" passage for the Buddhist view. Anís gives an accurate Dawn of a New Day citation, but he leans on a secondary compilation and an unofficial translation, and he admits he has nothing on anatta. (Perplexity 6.9 s, $0.00612)
- T3 *pushback*: **undefined** — undefined (Perplexity 5.6 s, $0.00572)
- T4 *compare*: **anis** — Both cite Gleanings LXXXI correctly, and Anís's Shoghi Effendi letter matches what his search found. Perplexity's main proof text, the 'self-same individuality, personality, consciousness, and understanding' passage, is Bahá'u'lláh's in Gleanings LXXIX, but Perplexity gives it to 'Abdu'l-Bahá in SAQ 62. It also gives the wrong section for 'sign of God' (LXXX instead of LXXXII) and offers one quote I can't trace. Anís's faults are on the Hindu side (Ramanuja used for an Advaita point, a broken link) and in answering only part of the question. His Bahá'í attributions are accurate and linked to the paragraph, though Perplexity answers the reader's question more fully. (Perplexity 6.5 s, $0.00603)
- T5 *exact_quote*: **px** — Perplexity gave the real, complete Gleanings LXXXI passage with its section and link, answered the individuality question carefully, and quoted Rāmānuja's actual words (Thibaut's translation, as they appear). Its faults are a wrong location for the 'self-same individuality' question and a mismatched footnote. Anís gave a largely made-up passage with no section or link, left out the requested sentence, and gave nothing at all for Rāmānuja. (Perplexity 6.4 s, $0.00648)

#### seed-21

- T1 *opening*: **anis** — Both answers rest on SAQ ch. 74 and on the 'darkness is a fact' letter. Anís quotes all three passages word for word, with paragraph-level links to the primary sources, including Unfolding Destiny, where the letter was first published. Perplexity names the chapter, but it cites the letter only through the compilation Lights of Guidance, adds a number I cannot verify (1769), and adds a dubious 'Bahá'í Sacred Writings, section 3' attribution to Bahá'u'lláh with no verbatim text. Anís's minor fault: he presents the Paris Talks talk transcript alongside the written texts without labelling its lower status. (Perplexity 4.1 s, $0.00517)
- T2 *reference*: **px** — Perplexity gives the chapter and paragraph, handles the translation history carefully, and answers the question about the term with a plausible one ('adam). Anís gives no chapter, credits only Barney without mentioning the revised authorized translation, and cites an irrelevant passage on pre-existence instead of answering the question about the term. (Perplexity 6.1 s, $0.00596)
- T3 *compare*: **px** — Perplexity engaged with the texts the reader actually named: SAQ ch. 74, Enchiridion ch. 11 and Ennead I.8. It located and summarised each of them reasonably accurately, though its SAQ chapter title and section numbers are wrong, its claim about the translation is off, and its footnotes don't match. Anís swapped in City of God and Maimonides, left out Plotinus, still gave no SAQ chapter, and may have credited the 'Evil is imperfection' line to the wrong book. (Perplexity 8.4 s, $0.00632)
- T4 *source*: **anis** — Anís found the exact passage the reader quoted and was candid that he could not give the volume, issue, page, recorder or translator. Perplexity replaced it with a different Star of the West passage, gave a precise-looking but wrong location, and wrongly claimed the quotation was a misparaphrase. Neither answer clearly labelled the passage as a reported account of 'Abdu'l-Bahá's words rather than his written text. Neither could be checked here for the exact volume and issue. (Perplexity 5.3 s, $0.00573)
- T5 *pushback*: **px** — Both identify the same correct source, Mahmúd's Diary chapter 3, and Anís's link goes down to the paragraph. Perplexity wins narrowly because it does three things Anís does not: it labels the Diary as a pilgrim's record and not 'Abdu'l-Bahá's own writing; it points to Some Answered Questions as the real written source of the privation statement; and it hedges ('in the cited version'). Anís asserts flatly that the passage never mentions evil, which contradicts his own Star of the West quotation from the previous turn. (Perplexity 6.7 s, $0.00607)

#### seed-39

- T1 *opening*: **px** — Both cite the Ishráqát passage in the Aqdas correctly and both use Afnan. Anís's citations are precise to the paragraph, but he cites no Bayán text and files Walbridge's paraphrase under scripture. Perplexity points to the Báb's own text (the Persian Bayán via Selections), the abrogation of the law on destroying books, and Saiedi. That bears much more on the question, though some of its Váḥid locations are unverified and the capital-punishment claim is doubtful. Perplexity wins, but narrowly. (Perplexity 5.8 s, $0.00608)
- T2 *reference*: **px** — Anís's one real mistake is the main one: he passes off a scholar's paraphrase as Bahá'u'lláh's words, and he skips both of the reader's questions. Perplexity correctly identifies the phrase as Walbridge's paraphrase and points to the real Aqdas passages (¶77, ¶65) and the Introduction. It also attempts the Báb's own words. It still has errors: it credits the Introduction to Bahá'u'lláh, it attributes the Selections passages to the wrong source, and its Bayán reference is uncertain. (Perplexity 6.9 s, $0.00621)
- T3 *absent*: **px** — Perplexity is the better answer, though it has errors. It addressed the reader's real problem: it said the 'accept, reject or modify' wording is a paraphrase, not the Báb's words. It also gave read-aloud passages with Váḥid and Gate numbers, and the Váḥid 6, Báb 16 passage is in the authorised Selections. Its Váḥid 5, Báb 3 quotation credited to Browne is uncertain. It also misattributed some citations: the 'do whatever He wishes' summary is linked to Selections, and the authorised Váḥid 6, Báb 16 text is linked to MacEoin's translation. Anís gave no location and repeated a Spanish passage that has nothing to do with the question. (Perplexity 6.1 s, $0.00615)
- T4 *exact_quote*: **px** — The reader asked for the exact words and location of 'accept, reject or modify as He chose'. Perplexity correctly identified this as Walbridge's paraphrase (Sacred Acts §1.9) and said it is not in the Aqdas. Anís had that source in his own retrieval and still let the misattribution stand, offering a different (genuine) Bahá'u'lláh passage with no location. Perplexity's mistakes are real: it invents 'paragraph 186' and credits Bahá'u'lláh's tablet words to an 'authorized note'. Even so, it answered the core source question correctly and Anís did not. (Perplexity 4.8 s, $0.00547)
- T5 *pushback*: **px** — Both answers say correctly that 'accept, reject or modify as He chose' is a scholar's paraphrase and not Aqdas text. Perplexity answers the reader's question 'whose?' by naming John Walbridge, and it places Bahá'u'lláh's passage in the Tablet of Ishráqát. Anís gives only the book titles and no author for the paraphrase. Perplexity's one weak point is the Aqdas Introduction quote: it doesn't say who is speaking there (I believe it is Shoghi Effendi, but I'm not certain), and it uses that quote as the Báb's position. (Perplexity 5.0 s, $0.00572)

#### seed-66

- T1 *opening*: **anis** — Anís names the right work for the key revelation passage and links to the paragraph. Perplexity gets the prison conditions (ESW) and the Maiden (Súriy-i-Haykal) right. But it attributes the central 'crown of My head' quotation to the wrong work. It also hedges openly in the text ('The Four Valleys? No…') and mistranslates Rashḥ-i-'Amá. Perplexity does cover more ground, but Anís is more accurate on the passage that matters most. (Perplexity 7.1 s, $0.00607)
- T2 *reference*: **px** — Both found the right passage. Perplexity named the actual tablet (Súriy-i-Haykal) and quoted the fuller description the reader asked for, all accurately. It also pointed to the Epistle to the Son of the Wolf as a related first-person account. Anís linked to the exact paragraph in Summons of the Lord of Hosts but quoted only one sentence. He also wrongly placed the Maid's self-proclamation in 'writings of the Báb'. (Perplexity 5.4 s, $0.00575)
- T3 *compare*: **px** — Both answers place the Maiden passage correctly. Perplexity also gives the scripture each tradition rests on, with exact verses (Qur'an 96:1–5, Exodus 3:2–6), and it keeps scripture apart from tradition. Anís gave up on the comparison the reader asked for and named no source for the other two traditions. (Perplexity 5.7 s, $0.00567)
- T4 *absent*: **px** — Both answers correctly say there is no exact date or day count in Bahá'u'lláh's words. Perplexity names the actual works: Súratu'l-Haykal, the Epistle to the Son of the Wolf and God Passes By. It also addresses the duration question. Anís cites a container collection rather than the Epistle and never names God Passes By. Perplexity's 'four months' quotation probably comes from the Constantinople context, and its October dating is a secondary reconstruction. Even so, it identifies the sources more precisely overall. (Perplexity 5.3 s, $0.00563)
- T5 *exact_quote*: **px** — Both answers identify the Epistle to the Son of the Wolf passage correctly, and Anís's link is precise. Only Perplexity answers the second half of the question: it gives what the Maiden did and said next, citing the Súriy-i-Haykal in The Summons of the Lord of Hosts at paragraph level. Anís says his texts cannot settle this, even though he quoted the same tablet two turns earlier. Perplexity's footnotes are mismatched, but the works and locations it names in its text are right. (Perplexity 5.4 s, $0.00562)

#### seed-93

- T1 *opening*: **undefined** — undefined (Perplexity 5.7 s, $0.00551)
- T2 *reference*: **px** — Both answers correctly trace 'these' to 'justice and right' in 'Abdu'l-Bahá's Tablet to the Hague. Anís gives a direct paragraph link, which is good. Perplexity cites the same passage precisely in its authorised publication, Selections no. 227. It also answers the daily-life question from correctly identified scripture: the Hidden Words Arabic 2 and the Words of Paradise. Anís's daily-life part rests on vague, unnamed 'letters', 'talks' and 'scholarship' and on his own synthesis. Perplexity's footnote to Esslemont is a small weakness, but its sources are more complete, correct and to the point. (Perplexity 6.1 s, $0.0054)
- T3 *pushback*: **px** — Perplexity names the actual Tablet with its date and quotes the disputed sentence exactly. It gives the correct grammatical answer to the reader's challenge and clearly separates text from interpretation. Its one flaw is misattributing the daily-ethic lines, which probably come from Selections no. 1, to the Hague Tablet. Anís quotes nothing and had no relevant retrieval. He also replaces a correct reading with an unsupported one (that 'these' covers a whole group of principles), which is the very reading-in the reader objected to. (Perplexity 5.7 s, $0.00606)
- T4 *exact_quote*: **px** — The reader asked for the exact words of the Tablet to the Hague passage containing 'these', with a link. Perplexity gave exactly that from the authorised Bahá'í Reference Library text, correctly dated and with a link. It also clarified the antecedent of 'these', which quietly corrects Anís's T3 broadening of it. Anís repeated the Some Answered Questions quote, which was correctly sourced but was not what the reader asked for. He promised the Hague text and never delivered it, and he misdescribed the reader's objection. (Perplexity 4.4 s, $0.00495)
- T5 *source*: **px** — Perplexity traced the full chain of sources correctly: the author is 'Abdu'l-Bahá, the original is Some Answered Questions, Shoghi Effendi quotes it in The Advent of Divine Justice, and The Pattern of Bahá'í Life reproduces it. It also answered the Hague question directly. Anís named no source at all and even dropped the correct Some Answered Questions link he had given in T4. (Perplexity 4.7 s, $0.00541)
