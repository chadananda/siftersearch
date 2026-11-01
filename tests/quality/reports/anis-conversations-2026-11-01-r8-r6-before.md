# Anís conversations 2026-11-01 (r8-r6-before)

10 conversations, 50 turns, 0 errors. Overall 2.85/10. Cost $7.3618 ($0.7362/conversation: Anís $0.1494, reader $0, judge $3.1118, Perplexity $0.2849, source-compare judge $3.8157).
Latency p50 8.5 s, p90 15.4 s, max 24.0 s, 5 turns over 15 s.

Judged 2× per conversation: overall per judge 2.8 / 2.9; per-conversation spread mean 0.3, max 1; defects per judge 114 / 109 (defects below are judge 1's).

| dimension | mean (1–5) |
|---|---|
| grounding | 2.1 |
| citation_links | 2.5 |
| follow_up_resolution | 2.05 |
| coherence | 1.8 |
| depth | 1.7 |
| honesty_absence | 1.75 |
| authority_ordering | 2.55 |
| tone | 2.95 |
| latency | 3.9 |

Defects: 114 — by stage strategy 7, follow_up_context 5, retrieval 13, selection 13, answer 70, latency 6; by severity critical 18, major 55, minor 41.

## soul-after-death — seeker (conv_b4abbfa2-d448-4526-ae16-d4d8e7f437ef)

Theme: what happens to the soul after death and whether we will know our loved ones

**2.5/10 (judges 2 / 3, spread 1; defects 12 / 10)** — Anís never gives the grieving reader the passages the library holds on recognizing loved ones after death. In turn 1 he quotes only the question line from Gleanings LXXXVI. He then drifts into an irrelevant Bayán quote and a misused "quote" search, and he ends by wrongly saying the library has no Gathas, even though they surfaced two turns earlier.

- T1 *opening* (11.3 s, topic, history 0): Hello Anís. My grandmother passed away a few months ago, and I keep wondering where she is now, and whether I'll actually recognize her someday. Do these texts 
  - **answer** [major] Anís quoted only the question line of Gleanings LXXXVI, not the answer, and then claimed the texts affirm recognition.
  - **answer** [minor] The Quran verse is used as comfort without its context: it is about the gathering on the Day of Judgment, and deniers perish. The links also have broken markdown.
  - **retrieval** [minor] The core 'Abdu'l-Bahá passage on recognition was not surfaced, although it exists in the library (it appears in turn 5).
- T2 *reference* (6.6 s, fact, history 2): That's a little disappointing, but when you say traditions approach it through their primary scriptures and commentaries, does that mean there are some in the l
  - **strategy** [major] The reader asked where in the library to look. The planner chose fact / yes_no_with_proof and returned an irrelevant Bayán quote.
  - **selection** [major] A surfaced source was squarely on topic, a Bahá'u'lláh tablet titled 'On the Recognition of Souls After Death', and it was ignored.
- T3 *deepen* (7.6 s, define, history 4): You said the texts "point to primary scriptures and their commentaries as places to search" — what does "primary scriptures" actually mean here, and which ones 
  - **answer** [major] Anís sends the reader to the Kitáb-i-Íqán for the soul's afterlife journey. That is not the Íqán's focus, and no quote supports the claim.
  - **answer** [minor] The works mentioned have no links, and the relevant Gathas source on the soul was surfaced but not used.
- T4 *absent* (4.8 s, quote, history 6): Let's start with the Bahá'í writings, since you mentioned "various tablets concerning the soul and the afterlife" — is there a specific passage in them where it
  - **strategy** [critical] The quote strategy searched the reader's quoted phrase, not the actual request for a recognition passage, and returned a passage that is not about recognition.
  - **answer** [major] Overclaim: Anís says the passage confirms things about the soul after death that it does not state.
- T5 *compare* (8.5 s, topic, history 8): That's more comforting than I expected, especially "the Kingdom is the world of vision where all the concealed realities will become disclosed." How does that c
  - **retrieval** [major] The comparison query brought back only Bahá'í sources and no Zoroastrian texts, although the Gathas are in the library.
  - **answer** [critical] False statement that the library lacks Zoroastrian primary sources.
  - **answer** [minor] The 'Abdu'l-Bahá line the reader quoted was neither attributed nor linked, though it was in the sources, and Anís did not say he hadn't quoted it this time.

Top fixes:
- Fix the quote strategy: when a reader quotes a phrase but asks for a passage on a topic (here, recognizing loved ones), search the topic, not the quoted phrase. Also reuse strong sources from earlier turns, such as Gleanings para_511.
- Before the reply says 'the library does not contain X', run a collection-level check against the catalogue and the sources already surfaced in the conversation (the Gathas appeared in turn 3).
- Make the answer quote the passage that answers the question, not just its framing sentence. Add a check that each claim (e.g. 'directly confirms…') is actually stated in the quoted text.

## detachment-buddhism — skeptic (conv_1ae30ee0-6a22-44ef-b35e-1032990b3ca1)

Theme: detachment in the Bahá'í Writings, compared with non-attachment in Buddhism

**3.5/10 (judges 3 / 4, spread 1; defects 11 / 10)** — The opening is reasonably well sourced, but the conversation falls apart on the Buddhist side: turn 4 searched the wrong thing and then claimed the library has no such passage, and turn 5 ignored the reader's pushback and answered with an unrelated study of an Arabic word.

- T1 *opening* (11.0 s, topic, history 0): Hello. I've read that the Bahá'í Writings put a lot of weight on "detachment," and I'm trying to work out whether it's really the same thing as Buddhist non-att
  - **retrieval** [major] No Buddhist sources were retrieved even though the question is a comparison. The reply then declines the comparison because the Bahá'í sources don't discuss Buddhism.
  - **retrieval** [minor] The reader asked for 'Abdu'l-Bahá's own words, but none of his written works were retrieved, only a pilgrim's note. The reply doesn't say this.
  - **answer** [minor] The Four Tablets to Maryam link doesn't go to a paragraph, and the attribution line for the second quotation is garbled.
- T2 *reference* (6.8 s, quote, history 2): That third one, "not meant giving away and depleting all one's wealth", is interesting, but what does it say detachment *is* if not that? Does the passage give 
  - **answer** [minor] The answer is thin: one short fragment, no surrounding text, a link to the whole page, and the same citation printed twice. It also never mentions that 'the third one' in this conversation was the Íqán.
- T3 *exact_quote* (9.0 s, quote, history 4): The Sutra Collection line about "the absence of attributes indicates negation" reads like a fragment of an argument, and I can't tell whether it's about virāga 
  - **answer** [major] The reader asked whether this passage is about virāga at all; Anís says it is without evidence. He also doesn't give the 'fuller' context (the neighbouring para_104) or identify the text it comes from.
  - **answer** [minor] Anís doesn't say clearly that he never used the phrase 'deconstruction of clinging' in this conversation.
- T4 *absent* (7.2 s, quote, history 6): So you can't give me the fuller passage or a location, and your own earlier claim about Buddhist texts "deconstructing clinging itself" rests on a fragment you 
  - **follow_up_context** [major] The search re-ran the old fragment instead of the new request (the Buddha's own definition of virāga, with sutra name or number).
  - **answer** [major] Says no such passage exists on the strength of the faulty search, then offers modern commentary without labelling it as commentary, as a substitute for the Buddha's own words.
  - **answer** [minor] Apologises for a claim he didn't make in this conversation, which blurs the record.
- T5 *pushback* (4.4 s, define, history 8): You say this passage shows "the systematic release of specific supports... whose cessation brings an end to becoming," but the text itself only poses a rhetoric
  - **strategy** [critical] The turn was routed to a term study of the Arabic tajarrud, which has nothing to do with the reader's challenge about a Buddhist sutra and Anís's 'systematic release' gloss.
  - **answer** [minor] The table's header and its quoted rendering don't match.

Top fixes:
- For pushback and reference turns, build search_query from the reader's new request plus the referent (e.g. 'virāga definition sutta'), not from the earlier quoted fragment. Keep pushback out of the 'define' term-study route.
- When a comparison with another tradition is asked for, retrieve from that tradition's scripture too. Label commentary as commentary, and don't call something absent unless a search that matches the request has come back empty.
- When a replayed reference points to something not said in this conversation, say so plainly. Then answer the evident request with full passages and paragraph links.

## equality-sexes — scholar (conv_23ab9f3f-2cf5-4056-8fa4-adba72e9f33e)

Theme: the equality of women and men, and how it squares with the membership of the Universal House of Justice

**4/10 (judges 4 / 4, spread 0; defects 16 / 14)** — Anís twice said the library lacked something it had surfaced: the 1936 letter's date and recipient (turn 2) and 'Abdu'l-Bahá's Arabic Tablet giving the reason (turn 5). He also filed an editorial note as revealed scripture and repeated one quotation across three turns.

- T1 *opening* (11.5 s, topic, history 0): Hello Anís. I'm trying to understand how the Bahá'í principle of the equality of women and men is reconciled with the restriction of Universal House of Justice 
  - **answer** [major] Authority error: the Kitáb-i-Aqdas editorial note is presented as revealed scripture.
  - **answer** [major] Exact titles and dates were requested, but no dates were given and several citations have no links.
  - **answer** [minor] *Dawn of a New Day* and *Uncompiled Published Letters* are treated as Shoghi Effendi's own words, without noting they are letters written on his behalf.
- T2 *reference* (17.7 s, quote, history 2): That second passage worries me: you attribute the "wisdom of it will be fully revealed in the future" line to Shoghi Effendi explaining a Tablet, yet cite *Unco
  - **selection** [critical] He said the date and recipient are not available when the surfaced source gives them.
  - **selection** [major] A relevant pilgrim note was ignored, and the two different letters were not distinguished.
  - **latency** [minor] The turn took 17.7 s, mostly a 14.3 s source-hunt.
- T3 *compare* (10.4 s, topic, history 4): Your two replies now attribute that "wisdom" line differently: first to 'Abdu'l-Bahá via Shoghi Effendi, then to Bahá'u'lláh. Setting that aside, how does the p
  - **answer** [major] Sycophantic false concession to an error he did not make in this conversation.
  - **selection** [major] Directly relevant pilgrim sources were ignored, and pilgrims' notes were filed under scholarship.
  - **retrieval** [minor] The Aqdas text itself, with the 'O ye Men of Justice' passage, was not surfaced. Only the *Women* compilation's paraphrase was.
- T4 *deepen* (15.4 s, quote, history 6): You quote Bahá'u'lláh's phrase «O ye men of the House of Justice!» from *Abdu'l-Bahá in Egypt* by Sohrab, but what is the original term behind "men" there, and 
  - **selection** [major] Bahá'u'lláh's own uses of 'men of the House of Justice' were surfaced but not used to answer 'used elsewhere'.
  - **answer** [minor] A wrong link: *Women* paragraph 47 does not contain the phrase.
  - **answer** [minor] *ʿAbdu'l-Bahá in Egypt* was not flagged as Sohrab's diary record, which is pilgrim-note level.
  - **latency** [minor] The turn took 15.4 s.
- T5 *absent* (16.2 s, quote, history 8): Since Momen's study gives *rijál-i bayt-i 'adl-i iláhí*, is there a passage where 'Abdu'l-Bahá or Shoghi Effendi explicitly states the reason for confining memb
  - **selection** [critical] 'Abdu'l-Bahá's own Tablet stating the restriction and its wisdom was surfaced but ignored. He then said no such passage exists.
  - **answer** [major] The same *Women* passage was repeated for the third time, with a duplicate link. Momen's term rijál and the 1947 Indian letter went unused.
  - **latency** [minor] The turn took 16.2 s, including a 6.1 s output check.

Top fixes:
- Selection and answer: before saying a date, recipient or text is not available, check every surfaced source, including URLs, metadata and non-English texts, for it. Turns 2 and 5 contradicted their own sources.
- Authority labelling: mark Aqdas notes as editorial, mark letters 'written on behalf of Shoghi Effendi' as such, and rank pilgrims' notes above scholarship. Prefer the Central Figures' own text (the Arabic Tablet, Bishárát, Aqdas) over compilations that report it.
- Coherence guard: do not re-quote a passage already given in earlier turns, and do not concede errors that are not in the transcript. Check the reader's claim against the conversation history first.

## return-iqan — study_leader (conv_a82ce79e-f16f-4da1-9d82-bab93530b56e)

Theme: what the Kitáb-i-Íqán means by the "return" of the Prophets

**2/10 (judges 2 / 2, spread 0; defects 7 / 9)** — After a thin opening, Anís handled every follow-up as a failed exact-quote search. He declined to resend his own passages, falsely took the blame for words he never said, and never explained what "return" means in the Íqán, even though Íqán ¶174 and Some Answered Questions ch. 33 were already in his sources.

- T1 *opening* (7.7 s, topic, history 0): Hello Anís, I'm preparing a study session on the Kitáb-i-Íqán and want to focus on what it means by the "return" of the Prophets, like how John the Baptist is E
  - **selection** [major] No passage addresses return or John/Elijah. The SAQ line chosen is a meta-sentence, and the Íqán ¶29 context was left unused.
  - **answer** [minor] SAQ is misattributed as 'quoted in a work by bayat' and linked to the book root with no paragraph.
  - **answer** [minor] Locations are not stated in the text, and the explanation of how the passages connect is a one-line truism.
- T2 *reference* (6.4 s, quote, history 2): The four lines you mentioned didn't come through on my end, only the summary after them. Could you send them again with where each one is found? I'd like to ope
  - **strategy** [critical] A request to resend earlier passages was routed as an exact-quote search on the whole message, and he wrongly reported absence.
- T3 *exact_quote* (7.0 s, quote, history 4): I can narrow it down: I want the Íqán passage where it says the Prophets are all one reality, the "single, enduring divine light" you mentioned in your summary.
  - **follow_up_context** [major] He did not say that he never used the phrase 'single, enduring divine light', and did not offer the ¶174 passage that matches the reader's actual need.
- T4 *pushback* (5.4 s, quote, history 6): Two things in that last reply don't sit right with me: you said the quote is "drawn from the Kitáb-i-Íqán" yet placed it at Gleanings paragraph 148, and earlier
  - **answer** [major] He made a false confession to a paraphrase and to a Gleanings 148 attribution that do not appear in this conversation. He then makes an unquoted doctrinal claim and declines to locate ¶174.
- T5 *deepen* (4.8 s, original, history 8): You quoted 'Abdu'l-Bahá saying Bahá'u'lláh gave a "lengthy and detailed explanation" of the return of the Prophets, so what does "return" actually mean in that 
  - **answer** [major] He does not explain what 'return' means. He asserts the term without a quote or link, and includes a garbled form 'رجعتم'.

Top fixes:
- Classify 'resend / didn't come through / the one you mentioned' as a history-replay request and answer from the prior turn's cited passages, not as a quote search.
- When a reader attributes wording to Anís, check prior replies and state plainly whether he said it before searching. Never confess to text that is not in the history.
- For 'what does X mean' follow-ups, run a topic retrieval (SAQ ch. 33, Íqán return paragraphs) alongside the original-term lookup, and require quoted, linked support.

## golden-rule — non_native (conv_7928e463-3b81-40fa-a53e-1b8474d510fa)

Theme: the Golden Rule across the world's scriptures, and where the Bahá'í Writings state it

**3/10 (judges 3 / 3, spread 0; defects 13 / 14)** — Turn 1 was solid, but in turn 2 Anís said the Summons counsel also appears in the Hidden Words and backed it with an unrelated prayer from Prayers and Meditations; the corrections that followed added new factual errors, and the Bible was represented by a Wesley sermon rather than the Gospel text.

- T1 *opening* (6.7 s, quote, history 0): Hello Anís. I am looking for the Golden Rule in many religions, like "do to others what you want for yourself". Where Bahá'u'lláh say this in the Bahá'í Writing
  - **answer** [minor] A Bahá'u'lláh passage is credited to the compilation instead of its author or tablet.
- T2 *reference* (5.0 s, fact, history 2): This passage you just quoted is very clear, thank you. Is it also in the Hidden Words, or only in this Summons?
  - **follow_up_context** [major] The search used the reader's raw text without the referent passage, so the Summons counsel was never searched.
  - **answer** [critical] False 'yes', supported by an unrelated prayer cited from Prayers and Meditations.
  - **answer** [major] Describes Quran and Hadith texts that were never retrieved or quoted.
- T3 *source* (8.5 s, quote, history 4): Wait, you say this is in the Hidden Words, but under the quote I see *Prayers and Meditations*. Which book is it really from, and what is the number or page of 
  - **answer** [major] The 'correction' is wrong. The turn-2 quotation really was from Prayers and Meditations, and it was unrelated. The reader's wrong address ('O Son of Spirit') was also not pointed out.
  - **answer** [minor] Gives no number, even though Arabic HW 68 is a standard reference. Hedges about whether the English is a translation.
  - **answer** [minor] An unprompted lecture on the hierarchy of authority.
- T4 *compare* (6.8 s, topic, history 6): OK, now I understand it is Hidden Words, but the number is still not clear for me. You said the passage is quoted in *The Earth Is But One Country*. How does th
  - **answer** [major] Says something false about where the passage sits in the Hidden Words.
  - **retrieval** [major] The Bible's Golden Rule (Matt 7:12 / Luke 6:31) was not surfaced. Only commentary and noise came back.
  - **answer** [major] The Christian teaching rests on a commentator rather than scripture, and the link goes to a whole ebook.
- T5 *deepen* (14.8 s, original, history 8): You say the Bahá'í text is "ontological" and talks about "same substance". What is the original word in Arabic or Persian for this, and where else in the Writin
  - **retrieval** [major] Retrieval found no Arabic original of HW 68 and no other uses by Bahá'u'lláh.
  - **answer** [major] Answers about Bahá'u'lláh with 'Abdu'l-Bahá, and the quoted sentence is not in the surfaced snippet. It is one sentence long and does not admit the gap.
  - **latency** [minor] Near the slow threshold.

Top fixes:
- Rewrite follow-up search queries to include the referent passage instead of the raw reader message, using the existing history_turns context.
- Add a check before output: when the answer says 'yes, it is in work X', at least one quoted source must actually come from X; otherwise answer no and say what was found instead.
- For comparisons across traditions, retrieve the other tradition's scripture first (e.g., Luke 6:31 / Matt 7:12), and do not describe Quran, Hadith or other texts that were not retrieved.

## 004-soul-reincarnation — skeptic (conv_d407f47b-ab49-4bd0-897b-32e049d5ce85)

Theme: The Bahá'í Soul, Buddhist Anatta, and the Limits of Both/And

**2.5/10 (judges 3 / 2, spread 1; defects 14 / 11)** — Turn 4 is strong, but asked for the exact Gleanings passage with its link in turn 5, Anís gave an unlinked passage he made up and falsely conceded a missing link. He also kept attributing a Shoghi Effendi letter to the Universal House of Justice and calling it "authorized interpretation".

- T1 *opening* (7.7 s, topic, history 0): How does the Bahá'í concept of the soul differ from the Hindu and Buddhist concepts of reincarnation? I want a sharp answer — not 'all religions teach about the
  - **answer** [major] No quotations and no links, even though the sources included Shoghi Effendi's reincarnation letter and 'Abdu'l-Bahá's remarks via Getsinger.
  - **retrieval** [major] No Buddhist or Hindu primary texts were retrieved for an explicitly comparative ontological question.
- T2 *reference* (11.7 s, topic, history 2): That passage says the Bahá'ís accept a "return of the attributes and qualities" but not of "the essence or the reality of things" — but what does that distincti
  - **answer** [major] Misattribution and authority error: a Shoghi Effendi letter (Dawn of a New Day) is attributed to the Universal House of Justice.
  - **answer** [minor] A quotation inside a block quote is credited to a secondary book instead of its original author.
  - **answer** [major] Does not explain what the qualities-versus-essence distinction means, and the closing sentence asserts more than the texts say.
- T3 *pushback* (8.6 s, quote, history 4): You say the distinction is that individual identity and "the essence or the reality of things" "remain distinct and do not return" — but the Shoghi Effendi pass
  - **strategy** [major] The reader's pushback was routed as a quote lookup for the reader's paraphrase of Anís's own words, and the search surfaced irrelevant texts.
  - **answer** [major] The 'scripture' section is an unquoted gesture. The House is called 'authorized interpretation' while quoting a Shoghi Effendi letter. The reply never concedes the interpretive step or answers the question about pilgrims' notes.
  - **answer** [minor] Repeats the same Lights of Guidance passage for the third turn running, without a link, and adds an irrelevant Sufi scholarship quote.
- T4 *compare* (6.3 s, topic, history 6): You cite Shoghi Effendi's line that the soul keeps "developing and unfolding and returning towards its Creator" while rejecting return to new bodies. How does t
  - **answer** [major] Uses Rāmānuja (Viśiṣṭādvaita, who keeps the soul distinct) as if he represented the Advaita dissolution the reader asked about. The citation is a paraphrase with no quotation, and the link goes to the wrong work.
  - **answer** [minor] The drop-and-ocean and mirror images are given as the texts' own images without any source.
- T5 *exact_quote* (9.8 s, quote, history 8): You quote Bahá'u'lláh that the soul "will continue to progress until it attaineth the presence of God," but that's one sentence, and you cited Gleanings twice w
  - **answer** [critical] Gave a made-up 'full passage' from Gleanings: it splices invented sentences onto the real line from Gleanings LXXXI, and it has no link.
  - **retrieval** [major] The Gleanings passage the reader explicitly asked for was not among the sources retrieved this turn.
  - **answer** [major] Falsely concedes a missing link, then deflects the reader's core question back to him.
  - **answer** [minor] The Rāmānuja link points to the wrong work.

Top fixes:
- Output check: confirm that every block quote matches a passage in the retrieved sources word for word, and refuse to show a 'full passage' that is not among them. Make sure exact-quote requests retrieve every passage the reader named.
- Fix the source metadata and attribution: the Lights of Guidance entries quoting Shoghi Effendi's letters must be attributed to Shoghi Effendi, never labelled as the Universal House of Justice or as 'authorized interpretation'. Also fix the Vedanta-Sutras URLs that point to /hymns-of-atharva-veda.
- Route pushback that challenges Anís's own claim to evaluation and concession rather than to a quote search of the reader's paraphrase. For comparative questions, retrieve the other tradition's own scripture (Buddhist texts on anattā, Śaṅkara for Advaita).

## seed-21 — scholar (conv_ab8ecf0d-26a2-474f-98c5-2846a613b4ba)

Theme: Evil — Privation, Active Force, or Necessary Shadow?

**3/10 (judges 3 / 3, spread 0; defects 10 / 11)** — Turn 1 was a good, well-sourced start, but the conversation then fell apart: Anís invented a Persian term and the wrong chapter, put a Star of the West quote under Some Answered Questions, and in turn 5 agreed that a passage he had quoted, which plainly says "there is no evil", "does not mention evil at all", then padded the reply with unrelated texts on "opposites".

- T1 *opening* (6.0 s, topic, history 0): Do the Bahá'í writings handle evil as the mere privation of good (Augustinian), as an active force, or as a necessary shadow that makes good visible?
  - **selection** [minor] The 'active force' and 'necessary shadow' options were left unanswered, though sources for them were surfaced.
  - **answer** [minor] A letter written on Shoghi Effendi's behalf is credited to him directly.
- T2 *reference* (10.6 s, original, history 2): Regarding the first one you quoted: is that actually from Some Answered Questions, and which chapter and whose translation? I'd also like to know whether 'mere 
  - **retrieval** [major] The Persian original of SAQ's chapter 'The Non-Existence of Evil' was not retrieved; only a question heading on pre-existence and an unrelated fragment came back.
  - **answer** [critical] The Persian term and the chapter are invented, and the translation history is wrong.
- T3 *compare* (7.5 s, topic, history 4): You said evil is "much as cold is the absence of heat or darkness the absence of light." How does that compare with Augustine's formulation in the Enchiridion (
  - **answer** [major] A Star of the West sentence is attributed and linked to Some Answered Questions.
  - **answer** [major] The question about Augustine and Plotinus is answered without their texts, and Anís doesn't say whether the library has them. He also doesn't point out that he never used the cold/heat wording.
- T4 *source* (6.5 s, quote, history 6): That last quotation about change and transformation, "if change and transformation does not exist, then there can be no composition and growth", you attribute t
  - **answer** [minor] Anís misses that turn 3 misattributed the same quote to SAQ, and offers none of the information that was available.
- T5 *pushback* (24.0 s, quote, history 8): The Persian you quoted reads «ترکیب و تربیت اشیا» (*tarkīb va tarbiyat*, "composition and training/nurture"), not "growth", and its subject is *aḍdād* (opposite
  - **answer** [critical] Anís gives in to the pushback and states something false: the quoted passage explicitly mentions evil.
  - **answer** [major] Off-topic padding about 'opposites' from Philo, Aquinas and a press compilation, none of it relevant to the question.
  - **latency** [major] The turn took 24 s, mainly because of source-hunt.

Top fixes:
- Add an output check that each quoted string actually occurs in the source it links to and names; this would have caught the turn-3 Star of the West quote filed under SAQ.
- When the reader pushes back, check the claim against the passage already quoted in history before conceding. Never say a text 'does not mention X' when the quoted text contains X. If the reader cites wording Anís never used, say so.
- For original-language and translator questions, retrieve the Persian or Arabic original or say plainly that it wasn't found. Never supply a term or chapter number that the sources don't contain.

## seed-39 — study_leader (conv_f7a61a82-6717-40a8-958a-ffbababf1015)

Theme: What Did the Báb's Bayán Actually Teach?

**3/10 (judges 3 / 3, spread 0; defects 11 / 11)** — One scholar's line ("accept, reject or modify as He chose") was credited to Bahá'u'lláh in turn 2 and to the Aqdas's notes in turn 4. Anís only conceded in turn 5 that it comes from scholarship, and even then he did not name the author (Walbridge). He also never found the Báb's own words the reader asked for.

- T1 *opening* (8.3 s, topic, history 0): The Báb's Bayán contains laws and teachings that Bahá'u'lláh subsequently abrogated or fulfilled. What was the Bayán actually teaching, and how should a Bahá'í 
  - **answer** [minor] Reply is cut off mid-sentence.
  - **selection** [minor] The question 'what was the Bayán actually teaching' was not engaged with the sources at hand. The God Passes By passage in which the Báb extols Him Whom God shall make manifest was surfaced but not used.
- T2 *reference* (11.9 s, source, history 2): That second quote about the Báb's laws being a gift that Bahá'u'lláh could "accept, reject or modify as He chose" is something I could read aloud to the group, 
  - **answer** [critical] Misattribution and authority error: a scholar's paraphrase in Sacred Acts, Sacred Space, Sacred Time is called the words of Bahá'u'lláh.
  - **retrieval** [major] The second half of the question (a passage in the Báb's own words) was never searched. The source hunt returned only the scholarly paper.
- T3 *absent* (9.7 s, quote, history 4): That Spanish line, "Él hace lo que desea y ordena lo que Le place", isn't the "accept, reject or modify" wording I asked about, so I still don't have a source f
  - **strategy** [major] The turn was planned as a quote lookup keyed on the Spanish line the reader was rejecting, not as a search for the Persian Bayán passage the reader actually asked for.
  - **answer** [minor] Accepted a false premise: he apologised for offering a Spanish fragment he never offered in this conversation.
- T4 *exact_quote* (5.4 s, quote, history 6): Anís, you've now given me that same Spanish line twice and it still doesn't answer what I asked. Back in your first reply you quoted the Aqdas as saying the Báb
  - **answer** [major] Wrong provenance again: the phrase is placed in the Aqdas's own 'introductory materials and notes' and linked to the Aqdas landing page. The source is Walbridge's notes, not the authoritative volume.
  - **answer** [minor] Repeated the false-premise apology about the Spanish line.
  - **selection** [minor] Ignored the Kitáb-i-Badí' passage, in which Bahá'u'lláh relays the Point of the Bayán's statement that everything depends on the will of Him Whom God shall make manifest, who may confirm or abrogate earlier laws. That is the closest answer to the reader's turn 2 and 3 request.
- T5 *pushback* (9.3 s, topic, history 8): In your first reply you put "accept, reject or modify as He chose" in quotation marks and attributed it to the Kitáb-i-Aqdas, but the passage you just gave me s
  - **answer** [major] Did not answer 'whose?' even though the author was identifiable. He also did not acknowledge his own contradictory earlier attributions.
  - **answer** [minor] Repeated the turn 4 block quote word for word, with broken inline blockquote formatting, and the reply is again cut off.

Top fixes:
- Provenance guard at the answer stage: never attribute text from a secondary source (bahai-library scholarly papers, or ids like 'resources-...-walbridge') to Bahá'u'lláh or to the Aqdas volume. Name the scholar and the work when the source metadata allows it.
- When a follow-up asks for 'the Báb's own words' or a Váḥid/Gate, plan a topic or source search over the Báb's writings (and Bahá'u'lláh's citations of them, e.g. the Kitáb-i-Badí'). Do not key the search on a phrase the reader is rejecting (turn 3 used the Spanish line as the quote).
- Replay and false-premise handling: when the reader cites something Anís did not say in this conversation, say so gently instead of apologising for it, and keep earlier attributions consistent, correcting them explicitly if they were wrong.

## seed-66 — non_native (conv_c196a355-7c57-4c50-80c7-81bd3cd2a96d)

Theme: What Did Bahá'u'lláh Do in the Síyáh-Chál?

**3/10 (judges 3 / 3, spread 0; defects 10 / 9)** — Anís said in turn 2 that the library had no passage about the Maid of Heaven in the Síyáh-Chál, though the Summons passage had already come up in turn 1. In turn 3 he quoted that same passage but split Bahá'u'lláh's words across scholars and a wrong link, and he never addressed the comparison question.

- T1 *opening* (7.1 s, fact, history 0): Bahá'u'lláh was imprisoned in the Síyáh-Chál (Black Pit) of Tehran in 1852 — the moment of his revelation. What happened in that pit, and why does it matter tha
  - **selection** [minor] The Summons 'Maiden' passage (source 6) was surfaced but not used, and the question of why the conditions matter got only a short paraphrase.
- T2 *reference* (9.2 s, topic, history 2): You said "the striking contrast" between the outside and the inside. Can you show me the passage where He Himself describes it, I mean the Maid of Heaven, not o
  - **retrieval** [critical] The Summons Maiden passage was not retrieved. The query was the raw message, and the quote shape was overridden to topic. He then claimed no such passage exists.
  - **answer** [minor] An irrelevant Maid of Heaven quote was used as filler, and a section header was left empty.
- T3 *compare* (9.3 s, quote, history 4): You said the Maiden came "suspended in the air" with a "call which captivated the hearts." Is this like Muhammad and the angel Gabriel in the cave of Hira, or M
  - **answer** [critical] One passage of Bahá'u'lláh was split into fragments credited to scholars and to The Bahá'í World, and then described as those authors' shared views.
  - **answer** [major] The link points to the wrong work.
  - **retrieval** [major] The comparison question was searched only on the quoted phrase. Shoghi Effendi's God Passes By passage, which sets the Síyáh-Chál beside Moses and the Burning Bush and Muhammad and Gabriel, was never surfaced, so the reply refused to compare.
  - **answer** [minor] No acknowledgment that this contradicts turn 2's 'not found'.
- T4 *absent* (6.9 s, fact, history 6): You said Shoghi Effendi links these experiences, and that Bahá'u'lláh was in "heavy chains." Can you give me the exact date when the Maid of Heaven first appear
  - **answer** [major] A God Passes By sentence about Bahá'u'lláh's later seclusion in Kurdistan is presented as describing His time in the pit.
  - **selection** [minor] Bahá'u'lláh's words were cited through a secondary book instead of the Epistle.
- T5 *exact_quote* (8.5 s, quote, history 8): You said He recalls "the galling weight of the chains and the stench-filled air allowed Me but little sleep." Can you give me the full passage with the link, wh
  - **selection** [major] He said nothing was available about what happened after the Maiden spoke, though the Messages to America 'One night in a dream… We shall render Thee victorious' passage (source 4) and the continuation of Summons para 14 were in reach.

Top fixes:
- When a follow-up names a passage (for example 'Maid of Heaven … His own words'), rewrite the search query into its subject plus key phrases. Pass along sources already surfaced in earlier turns, so the reply never says a passage is missing when the library has it.
- When the same words come from several sources, merge them and credit them to the original author (Bahá'u'lláh), linking the primary work. Never credit revealed text to scholars or to Bahá'í World volumes. Validate that each link's slug matches the work named.
- For compare questions, plan a second search for interpretive comparisons (for example Shoghi Effendi on the Burning Bush, Gabriel and the Maid of Heaven) instead of only searching the quoted phrase.

## seed-93 — seeker (conv_ba6e1c17-79ec-4a0b-921b-d613d1c7e652)

Theme: What Did 'Abdu'l-Bahá Mean by 'The Most Great Justice'?

**2/10 (judges 2 / 2, spread 0; defects 10 / 10)** — Anís had the Tablet to the Hague passage, which plainly says "justice and right. Until these are realized…", in his sources, yet he never quoted it. When challenged he falsely conceded the point, later claimed the library didn't have it, and in turn 5 credited a Some Answered Questions line to the introduction of Mahmud's Diary, contradicting what he had just established.

- T1 *opening* (9.1 s, topic, history 0): 'Abdu'l-Bahá speaks of 'the Most Great Justice' as a foundation of the new world order. Is this distributive justice, retributive justice, or something more lik
  - **answer** [major] No quotation and no link, although strong sources were surfaced. He refers to 'these diverse authorities' without naming any, and never addresses 'Most Great Justice' or the three options the reader offered.
- T2 *reference* (6.7 s, quote, history 2): The second one you quoted, about things being "in disorder and remain imperfect" until these are realized, makes me wonder what "these" actually refers to there
  - **answer** [critical] He doesn't quote the passage the reader asked about, even though it appeared 8 times in the sources. He never states plainly that 'these' refers to 'justice and right'.
  - **answer** [major] An unasked-for House of Justice layer, and an invented scholarship claim: the Tablet to the Hague is a written tablet, not a public address.
- T3 *pushback* (10.1 s, quote, history 4): You said "these" refers directly to "justice and right," but is that actually what the Tablet to the Hague says, or are you reading it in? And the line about ju
  - **strategy** [major] He ran a quote hunt for Anís's own phrase instead of rechecking the Hague text, and retrieval came back with an unrelated letter on Covenant-breaking.
  - **answer** [critical] A false concession: the text does name justice and right as what 'these' refers to.
- T4 *exact_quote* (6.8 s, quote, history 6): That quote about the "pole of justice, and not of forgiveness" is striking, but you cited *The Pattern of Baha'i Life*, which doesn't sound like 'Abdu'l-Bahá's 
  - **follow_up_context** [critical] The search keyed on 'pole of justice' when the reader asked for the Hague passage containing 'these', so the Hague text wasn't retrieved and he wrongly reported it absent.
  - **answer** [minor] Sycophantic opening. He also never explains that The Pattern of Bahá'í Life and The Advent of Divine Justice are compilations quoting the same line in an older translation ('resteth').
- T5 *source* (19.5 s, quote, history 8): You called that line "the original words of 'Abdu'l-Bahá" but still credited it to *The Pattern of Baha'i Life*, so who actually said it, and in which book, tab
  - **follow_up_context** [critical] The search used the phrase 'the original words of ‘Abdu’l-Bahá' instead of the line itself, and retrieved only the introduction to Mahmud's Diary.
  - **answer** [critical] A misattribution that contradicts turn 4. He also wrongly denies that Pattern of Bahá'í Life contains the line, when it does quote it.
  - **latency** [major] 19.5 s, with the original step taking 12.3 s.

Top fixes:
- For follow-ups, build the search from the referent resolved out of history (for example, the Hague para 31 passage or the SAQ line) instead of the reader's raw message or whatever phrase the reader quoted. Never quote-hunt Anís's own earlier words.
- Before conceding or reporting something absent, re-check sources surfaced in earlier turns. Pushback should be met with the quotation itself, not automatic capitulation ('You are entirely right').
- Require at least one linked primary quotation in every research reply, and leave out authority layers (House of Justice, scholarship) that the sources don't actually support.

## Perplexity comparison (sources)

50 turns compared (50 Perplexity answers, 0 Perplexity failures, 0 judge failures). Winner: Anís 7 · Perplexity 39 · tie 2 · neither 1.
Cost: Perplexity $0.2849 ($0.0057/turn, p50 5678 ms), comparison judge $3.8157 ($0.07631/turn).

### Missed but in the library (90) — Anís retrieval/selection defects

- soul-after-death T1: **The Bible: Gospel of Luke** [book] → The Gospel of Luke (doc 20990, by title)
  - checked: find-document "The Bible: Gospel of Luke" → The Gospel of Luke (20990); The Acts of the Apostles (20988)
- soul-after-death T1: **The Bible: Gospel of Matthew** [book] → The Gospel of Matthew (doc 20992, by title)
  - checked: find-document "The Bible: Gospel of Matthew" → The Gospel of Matthew (20992)
- soul-after-death T1: **The Bible: Revelation** [book] → Revelation (doc 20986, by title)
  - checked: find-document "The Bible: Revelation" → Tag: Book of Revelation (Bible) (288114); Progressive Revelation: The Bible and Baha'u'llah (355302); Tag: Book of Revelation (Bible) (643699)
- soul-after-death T2: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [compilation] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- soul-after-death T2: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946)
- soul-after-death T2: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title)
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307)
- soul-after-death T2: **Additional Prayers Revealed by Bahá'u'lláh** (Bahá'u'lláh) [compilation] → Additional Prayers Revealed by Bahá’u’lláh (doc 20760, by title)
  - checked: find-document "Additional Prayers Revealed by Bahá'u'lláh" → Additional Prayers Revealed by Bahá’u’lláh (20760)
- soul-after-death T2: **Paris Talks** ('Abdu'l-Bahá) [compilation] → Paris Talks (doc 20908, by title)
  - checked: find-document "Paris Talks" → Paris Talks (20908); Paris Talks: Study Guide (23579); Paris Talks: Study Guide (28930)
- soul-after-death T2: **Heaven and Hell** (Emanuel Swedenborg) [book] → Heaven and Hell (doc 21320, by title)
  - checked: find-document "Heaven and Hell" → Heaven and Hell (21320); Heaven (13996); The Marriage of Heaven and Hell (19785)
- soul-after-death T3: **Bhagavad Gītā** [book] → The Bhagavad-Gita (doc 21038, by title)
  - checked: find-document "Bhagavad Gītā" → Bhagavad Gītā (in The Bhagavad Gita (Song Celestial, tr. Edwin Arnold), paragraphs 12-undefined) (17365); The Bhagavad-Gita (21038); Bhagavad-Gita and the Baha'i Faith (282917)
- soul-after-death T3: **Gleanings from the Writings of Bahá'u'lláh** [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- soul-after-death T4: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title) — was in Anís's sources
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Bahá’í Sacred Writings (20777) ¶339 coverage 1.00
- soul-after-death T4: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title) — was in Anís's sources
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Bahá’í Sacred Writings (20777) ¶335 coverage 1.00
- detachment-buddhism T1: **The Hidden Words of Bahá'u'lláh** (Bahá'u'lláh) [book] → The Hidden Words of Bahá’u’lláh (doc 20809, by title) — was in Anís's sources
  - checked: find-document "The Hidden Words of Bahá'u'lláh" → The Hidden Words of Bahá’u’lláh (20809); 隐言经 (Hidden Words of Baha'u'llah) (28629); 隐言经 (Hidden Words of Baha'u'llah) (22143) | phrase search → This wondrous Day, with the Most Exalted Call, summoneth the people of creation and… (provisional translation) (965147) ¶1 coverage 0.08
- detachment-buddhism T1: **The Seven Valleys** (Bahá'u'lláh) [book] → The Seven Valleys (doc 925289, by title)
  - checked: find-document "The Seven Valleys" → The Seven Valleys (925289); Seven Valleys (984296); Seven Valleys (984305) | phrase search → The Call of the Divine Beloved (20808) ¶39 coverage 0.13
- detachment-buddhism T2: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → Selections from the Writings of 'Abdu'l-Baha: Study Guide (doc 919099, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Selections from the Writings of 'Abdu'l-Baha: Study Guide (919099) ¶1697 coverage 1.00
- detachment-buddhism T2: **Divine Philosophy** ('Abdu'l-Bahá) [book] → Divine Philosophy (doc 20904, by title)
  - checked: find-document "Divine Philosophy" → Divine Philosophy (20904); Divine Philosophy (8308); Divine Philosophy (7189) | phrase search → Divine Philosophy (20904) ¶453 coverage 1.00
- detachment-buddhism T2: **Living the Life** (Compilation (Universal House of Justice Research Department)) [compilation] → Living the Life (doc 983370, by title)
  - checked: find-document "Living the Life" → Living the Life (983370); Living the Life (983895); Living the Life (945915)
- detachment-buddhism T3: **Śūraṅgama Sūtra** (Buddhist Text Translation Society (tr.)) [book] → Sutra Collection (S) (doc 20937, by quote) — was in Anís's sources
  - checked: find-document "Śūraṅgama Sūtra" → none | documents?q → none | phrase search → Sutra Collection (S) (20937) ¶99 coverage 1.00
- detachment-buddhism T5: **Saṃyutta Nikāya: Upādāna Sutta (SN 12.52)** (Buddha, tr. Thanissaro Bhikkhu) [book] → Sutra Collection (N,O,P) (doc 20935, by quote)
  - checked: find-document "Saṃyutta Nikāya: Upādāna Sutta" → Samyutta Nikaya 12.52 - Upadana Sutta: Clinging (19325); Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (19374) | documents?q → Samyutta Nikaya 12.52 - Upadana Sutta: Clinging (19325); Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (19374) | phrase search → Sutra Collection (N,O,P) (20935) ¶540 coverage 1.00
- equality-sexes T1: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → Selections from the Writings of ‘Abdu’l-Bahá (doc 20910, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Selections from the Writings of ‘Abdu’l-Bahá (20910) ¶265 coverage 1.00
- equality-sexes T2: **Women (compilation) — Tablet of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [tablet] → The Universal House of Justice (doc 20870, by quote)
  - checked: find-document "Women (compilation) — Tablet of 'Abdu'l-Bahá" → Star of the West, v11, i17 Sultan, January 19 1921 (15479) | documents?q → Star of the West, v11, i17 Sultan, January 19 1921 (15479) | phrase search → The Universal House of Justice (20870) ¶32 coverage 1.00
- equality-sexes T2: **The Universal House of Justice (compilation)** (Research Department of the Universal House of Justice) [compilation] → The Universal House of Justice (doc 20870, by title)
  - checked: find-document "The Universal House of Justice" → The Universal House of Justice (20870); Universal House of Justice and the Principles of Jurisprudence (1546); The Universal House of Justice Letter Dated 28 November 2023: A Study Guide (919100)
- equality-sexes T3: **Tablet of 'Abdu'l-Bahá to Corinne True (women on the House of Justice)** ('Abdu'l-Bahá) [tablet] → Letter to Corinne True re Women on the House of Justice (doc 16858, by quote)
  - checked: find-document "Tablet of 'Abdu'l-Bahá to Corinne True" → Words to Corinne True spoken in 1907 (provisional translation) (982152); Words to Corinne True spoken around 1912-Jun-17 (provisional translation) (982386); Words to Corinne and Arna True spoken in Feb. 1907 (provisional translation) (981162) | documents?q → Words to Corinne True spoken in 1907 (provisional translation) (982152); Words to Corinne True spoken around 1912-Jun-17 (provisional translation) (982386); Words to Corinne and Arna True spoken in Feb. 1907 (provisional translation) (981162) | phrase search → Letter to Corinne True re Women on the House of Justice (16858) ¶10 coverage 1.00
- equality-sexes T3: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title)
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → The Universal House of Justice (20870) ¶2 coverage 0.17
- equality-sexes T4: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307)
- equality-sexes T4: **Questions and Answers (in The Kitáb-i-Aqdas)** (Bahá'u'lláh) [book] → Questions and Answers 1950-51 (doc 168632, by title)
  - checked: find-document "Questions and Answers" → Questions and Answers 1950-51 (168632); Questions and Answers 1950-51 (853574); Questions and Answers on War and Related Issues (22707)
- equality-sexes T5: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → Selections from the Writings of ‘Abdu’l-Bahá (doc 20910, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Selections from the Writings of ‘Abdu’l-Bahá (20910) ¶265 coverage 1.00
- equality-sexes T5: **Letter written on behalf of Shoghi Effendi, 27 May 1940** (Shoghi Effendi (on his behalf)) [letter] → The Universal House of Justice (doc 20870, by quote)
  - checked: find-document "Letter written on behalf of Shoghi Effendi, 27 May 1940" → none | documents?q → none | phrase search → The Universal House of Justice (20870) ¶117 coverage 1.00
- return-iqan T1: **The Holy Bible (Gospel of Matthew)** [book] → The Bible (KJV), The Gospel of Matthew (doc 20992, by quote)
  - checked: find-document "The Holy Bible" → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521) | documents?q → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521) | phrase search → The Bible (KJV), The Gospel of Matthew (20992) ¶237 coverage 0.50
- return-iqan T2: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶99 coverage 1.00
- return-iqan T2: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶98 coverage 1.00
- return-iqan T2: **Bible (Gospel of Luke)** [book] → Every Eye Shall See: Bible Evidence for the Return of Christ (doc 967517, by quote)
  - checked: find-document "Bible" → The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); Bible Prophecies (984297); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | documents?q → Bible Prophecies (984297); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | phrase search → Every Eye Shall See: Bible Evidence for the Return of Christ (967517) ¶168 coverage 1.00
- return-iqan T3: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶99 coverage 1.00
- return-iqan T5: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title) — was in Anís's sources
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- return-iqan T5: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title) — was in Anís's sources
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097) | phrase search → Some Answered Questions (20911) ¶746 coverage 1.00
- golden-rule T1: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title) — was in Anís's sources
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Summons of the Lord of Hosts (20806) ¶417 coverage 1.00
- golden-rule T1: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → The Kitáb-i-Íqán (20810) ¶214 coverage 1.00
- golden-rule T1: **Epistle to the Son of the Wolf** (Bahá'u'lláh) [book] → Epistle to the Son of the Wolf (doc 20780, by title)
  - checked: find-document "Epistle to the Son of the Wolf" → Epistle to the Son of the Wolf (20780); Epistle to the Son of the Wolf (926338); Epistle to the Son of the Wolf (984437) | phrase search → Star of the West (15205) ¶138 coverage 1.00
- golden-rule T2: **The Summons of the Lord of Hosts** (Bahá'u'lláh) [book] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶248 coverage 1.00
- golden-rule T5: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title)
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679)
- golden-rule T5: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827) | phrase search → The Baha'i World: A Biennial International Record, Volume VI (91 and 92 of the Baha'i Era, April 1934 to 1936 A.D.) (967538) ¶7283 coverage 0.30
- golden-rule T5: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [compilation] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Tablet to Mánikchí Sáhib (16692) ¶18 coverage 1.00
- 004-soul-reincarnation T1: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- 004-soul-reincarnation T1: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- 004-soul-reincarnation T1: **Reincarnation, Rebirth and the Progress of the Soul** (Universal House of Justice Research Department (compilation)) [compilation] → Reincarnation, Rebirth and the Progress of the Soul (doc 4669, by title) — was in Anís's sources
  - checked: find-document "Reincarnation, Rebirth and the Progress of the Soul" → Reincarnation, Rebirth and the Progress of the Soul (4669); Reincarnation, Rebirth and the Progress of the Soul (22219); Reincarnation, Rebirth and the Progress of the Soul (326594)
- 004-soul-reincarnation T1: **Lights of Guidance** (Helen Hornby (comp.)) [compilation] → Lights of Guidance (doc 20804, by title) — was in Anís's sources
  - checked: find-document "Lights of Guidance" → Lights of Guidance (20804); Lights of Guidance: A Bahá’í Reference File (8680); lights-of-guidance-000_en (609524)
- 004-soul-reincarnation T2: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- 004-soul-reincarnation T3: **Dawn of a New Day** (Shoghi Effendi) [compilation] → Dawn of a New Day (doc 20883, by title)
  - checked: find-document "Dawn of a New Day" → Dawn of a New Day (20883); dawn-of-a-new-day-000_en (608352); dawn-of-a-new-day-001_en (608358) | phrase search → Lights of Guidance (20804) ¶6868 coverage 1.00
- 004-soul-reincarnation T3: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- 004-soul-reincarnation T3: **Pilgrims' Notes (compilation)** (Universal House of Justice Research Department) [compilation] → Pilgrim's Notes (doc 969033, by title)
  - checked: find-document "Pilgrims' Notes" → Pilgrim's Notes (969033); pilgrims_notes_us-archives_1900 (921108); pilgrims_notes_us-archives_1901 (921110)
- 004-soul-reincarnation T4: **Paris Talks** ('Abdu'l-Bahá) [book] → Paris Talks (doc 20908, by title)
  - checked: find-document "Paris Talks" → Paris Talks (20908); Paris Talks: Study Guide (23579); Paris Talks: Study Guide (28930) | phrase search → Divine Philosophy (7189) ¶3702 coverage 1.00
- seed-21 T1: **Lights of Guidance** (Helen Hornby (comp.)) [compilation] → Lights of Guidance (doc 20804, by title)
  - checked: find-document "Lights of Guidance" → Lights of Guidance (20804); Lights of Guidance: A Bahá’í Reference File (8680); lights-of-guidance-000_en (609524)
- seed-21 T1: **Gleanings from the Writings of Bahá'u'lláh** (Bahá’u’lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- seed-21 T4: **Star of the West, vol. 19, no. 12** ('Abdu'l-Bahá (attributed)) [article] → Star of the West (doc 15205, by quote) — was in Anís's sources
  - checked: find-document "Star of the West, vol. 19, no. 12" → Star of the West, v12, i19 'Ala, March 2 1922 (15450) | documents?q → Star of the West, v12, i19 'Ala, March 2 1922 (15450) | phrase search → Star of the West (15205) ¶1455 coverage 1.00
- seed-21 T4: **Bahá'í Scriptures** (Horace Holley (ed.)) [compilation] → BAHÁ’Í SCRIPTURES (doc 39614, by title)
  - checked: find-document "Bahá'í Scriptures" → BAHÁ’Í SCRIPTURES (39614); BAHÁ’Í SCRIPTURES (39613); Baha'i Scriptures; chapter 1 (39615)
- seed-21 T5: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- seed-39 T1: **Selections from the Writings of the Báb** (The Báb) [compilation] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607)
- seed-39 T1: **The Báb's Bayán: An Analytical Survey** (Muhammad Afnan) [article] → The Bab's Bayan: An Analytical Survey (doc 24587, by title)
  - checked: find-document "The Báb's Bayán: An Analytical Survey" → The Bab's Bayan: An Analytical Survey (24587); The Báb's Bayán: An Analytical Survey (13962)
- seed-39 T1: **Gate of the Heart: Understanding the Writings of the Báb** (Nader Saiedi) [book] → Gate of the Heart: Understanding the Writings of the Báb (doc 8632, by title)
  - checked: find-document "Gate of the Heart: Understanding the Writings of the Báb" → Gate of the Heart: Understanding the Writings of the Báb (8632); Gate of the Heart: Understanding the Writings of the Bab, by Nader Saiedi: Review (153157); Gate of the Heart: Understanding the Writings of the Bab, by Nader Saiedi: Review (163882)
- seed-39 T1: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas (Tablet of Ishráqát)** (Bahá'u'lláh) [tablet] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827)
- seed-39 T2: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title)
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → Fountain of Wisdom : Tablets of Bahá’u’lláh (20781) ¶298 coverage 1.00
- seed-39 T2: **Selections from the Writings of the Báb** (The Báb) [compilation] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607)
- seed-39 T3: **Selections from the Writings of the Báb** (The Báb) [compilation] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607)
- seed-39 T3: **The Writings of the Báb** (Robert Stockman) [article] → Overview of the Writings of the Báb (doc 983043, by title)
  - checked: find-document "The Writings of the Báb" → Autobibliography in the Writings of the Báb: Translation of the Khutba Dhikriyya (15358); Selections from the Writings of the Báb (20898); On the Enumeration of the Báb's Early Writings (926983)
- seed-39 T4: **Sacred Acts, Sacred Space, Sacred Time** (John Walbridge) [book] → Sacred Acts, Sacred Space, Sacred Time (doc 23832, by title) — was in Anís's sources
  - checked: find-document "Sacred Acts, Sacred Space, Sacred Time" → Sacred Acts, Sacred Space, Sacred Time (23832); Sacred Acts, Sacred Space, Sacred Time (328596); Sacred Acts, Sacred Space, Sacred Time, by John Walbridge: Review (59574) | phrase search → Kitáb-i-Aqdas: Excerpts from John Walbridge, "Sacred Acts..." (216888) ¶14 coverage 1.00
- seed-39 T5: **The Kitáb-i-Aqdas (Introduction)** (Universal House of Justice (Introduction)) [book] → Kitáb-i-Aqdas (doc 924862, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → The Kitáb-i-Aqdas: Introduction (335469) ¶18 coverage 1.00
- seed-39 T5: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas (Tablet of Ishráqát)** (Bahá'u'lláh) [tablet] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title) — was in Anís's sources
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827) | phrase search → Fountain of Wisdom : Tablets of Bahá’u’lláh (20781) ¶298 coverage 1.00
- seed-66 T1: **Rashḥ-i-'Amá** (Bahá'u'lláh) [tablet] → Rashh-i-'Ama (doc 927201, by title) — was in Anís's sources
  - checked: find-document "Rashḥ-i-'Amá" → Rashh-i-'Ama (927201); Rashh-i-'Ama: Les Nuages des Royaumes d'en-haut (919090); Rashh-i-'Ama: Les nuees du plus haut des cieux (919089)
- seed-66 T1: **Súriy-i-Haykal (in The Summons of the Lord of Hosts)** (Bahá'u'lláh) [tablet] → Súriy-i-Haykal (doc 339666, by title) — was in Anís's sources
  - checked: find-document "Súriy-i-Haykal" → Súriy-i-Haykal (339666); Súriy-i-Haykal (Tablet of the Temple) (925310); Súriy-i-Haykal (Surih of the Temple) (924993)
- seed-66 T1: **Bahá'u'lláh (Bahá'í International Community statement)** (Bahá'í International Community) [article] → Bahá'u'lláh (doc 983065, by title)
  - checked: find-document "Bahá'u'lláh" → Bahá'u'lláh (983065); Bahá’u’lláh (445720); Bahá’u’lláh (445742)
- seed-66 T2: **The Summons of the Lord of Hosts (Súratu'l-Haykal)** (Bahá'u'lláh) [tablet] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711) | phrase search → Summons of the Lord of Hosts (20806) ¶6 coverage 1.00
- seed-66 T2: **Epistle to the Son of the Wolf** (Bahá'u'lláh) [book] → Epistle to the Son of the Wolf (doc 20780, by title)
  - checked: find-document "Epistle to the Son of the Wolf" → Epistle to the Son of the Wolf (20780); Epistle to the Son of the Wolf (926338); Epistle to the Son of the Wolf (984437) | phrase search → Epistle to the Son of the Wolf (20780) ¶36 coverage 1.00
- seed-66 T3: **God Passes By** (Shoghi Effendi) [book] → God Passes By (doc 21310, by title)
  - checked: find-document "God Passes By" → God Passes By (21310); God Passes By -- Study Guide (3782); God Passes By -- Study Guide (3788)
- seed-66 T4: **Epistle to the Son of the Wolf** (Bahá'u'lláh) [tablet] → Epistle to the Son of the Wolf (doc 20780, by title)
  - checked: find-document "Epistle to the Son of the Wolf" → Epistle to the Son of the Wolf (20780); Epistle to the Son of the Wolf (926338); Epistle to the Son of the Wolf (984437) | phrase search → Bahá’u’lláh and the New Era (20813) ¶109 coverage 1.00
- seed-66 T4: **The Summons of the Lord of Hosts (Súriy-i-Haykal)** (Bahá'u'lláh) [tablet] → Summons of the Lord of Hosts (doc 20806, by title) — was in Anís's sources
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711)
- seed-66 T5: **The Summons of the Lord of Hosts (Súratu'l-Haykal)** (Bahá'u'lláh) [tablet] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711) | phrase search → Summons of the Lord of Hosts (20806) ¶6 coverage 1.00
- seed-93 T1: **The Advent of Divine Justice** (Shoghi Effendi) [letter] → The Advent of Divine Justice (doc 20890, by title)
  - checked: find-document "The Advent of Divine Justice" → The Advent of Divine Justice (20890); Advent of Divine Justice (912371); Advent of Divine Justice (913762)
- seed-93 T1: **The Summons of the Lord of Hosts** (Bahá'u'lláh) [book] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711)
- seed-93 T1: **The Promulgation of Universal Peace** ('Abdu'l-Bahá) [talk] → The Promulgation of Universal Peace (doc 20917, by title)
  - checked: find-document "The Promulgation of Universal Peace" → The Promulgation of Universal Peace (20917); The Promulgation of Universal Peace: Study Guide (23577); The Promulgation of Universal Peace: Study Guide (28932) | phrase search → Justice: A Compilation (121000) ¶40 coverage 1.00
- seed-93 T1: **The World Order of Bahá'u'lláh** (Shoghi Effendi) [book] → The World Order of Bahá’u’lláh (doc 20894, by title)
  - checked: find-document "The World Order of Bahá'u'lláh" → The World Order of Bahá’u’lláh (20894); World Order of Bahá'u'lláh (984028); The World Order of Bahá'u'lláh (2209605)
- seed-93 T2: **Tablet to the Central Organization for a Durable Peace, The Hague** ('Abdu'l-Bahá) [tablet] → Tablet to the Central Organization for a Durable Peace, The Hague (doc 11434, by title) — was in Anís's sources
  - checked: find-document "Tablet to the Central Organization for a Durable Peace, The …" → Tablet to the Central Organization for a Durable Peace, The Hague (11434); Tablet to the Central Organization for a Durable Peace, The Hague (15710); Tablet to the Central Organization for a Durable Peace, The Hague (6945) | phrase search → Bahá’í Sacred Writings (20777) ¶1027 coverage 1.00
- seed-93 T2: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- seed-93 T2: **Foundations of World Unity** ('Abdu'l-Bahá) [book] → Foundations of World Unity (doc 919047, by title)
  - checked: find-document "Foundations of World Unity" → Foundations of World Unity (919047); Foundations of World Unity (21664); Foundations of World Unity (330911) | phrase search → The Promulgation of Universal Peace (20917) ¶881 coverage 1.00
- seed-93 T3: **Tablets to The Hague** ('Abdu'l-Bahá) [tablet] → Tablets to the Hague (doc 20916, by title)
  - checked: find-document "Tablets to The Hague" → Tablets to the Hague (20916); Lawh-i-Lahih - Tablet to the Hague (921704); Tablet to the Central Organization for a Durable Peace, The Hague (6945) | phrase search → Bahá’í World Faith (‘Abdu’l-Bahá section) (20902) ¶183 coverage 1.00
- seed-93 T3: **Foundations of World Unity** ('Abdu'l-Bahá) [compilation] → Foundations of World Unity (doc 919047, by title)
  - checked: find-document "Foundations of World Unity" → Foundations of World Unity (919047); Foundations of World Unity (21664); Foundations of World Unity (330911)
- seed-93 T4: **'Abdu'l-Bahá's Tablets to The Hague** ('Abdu'l-Bahá) [tablet] → Tablets to the Hague (doc 20916, by quote)
  - checked: find-document "'Abdu'l-Bahá's Tablets to The Hague" → Star of the West, v11, i7 Kalimat, July 13 1920 (15427) | documents?q → Star of the West, v11, i7 Kalimat, July 13 1920 (15427) | phrase search → Tablets to the Hague (20916) ¶23 coverage 1.00
- seed-93 T5: **The Advent of Divine Justice** (Shoghi Effendi) [book] → The Advent of Divine Justice (doc 20890, by title)
  - checked: find-document "The Advent of Divine Justice" → The Advent of Divine Justice (20890); Advent of Divine Justice (912371); Advent of Divine Justice (913762) | phrase search → The Pattern of Baha'i Life (23002) ¶303 coverage 1.00
- seed-93 T5: **Tablets to The Hague** ('Abdu'l-Bahá) [tablet] → Tablets to the Hague (doc 20916, by title)
  - checked: find-document "Tablets to The Hague" → Tablets to the Hague (20916); Lawh-i-Lahih - Tablet to the Hague (921704); Tablet to the Central Organization for a Durable Peace, The Hague (6945) | phrase search → Additional Tablets, Extracts and Talks (20901) ¶159 coverage 1.00
- seed-93 T5: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)

### Collection gaps (27) — Perplexity named, library lacks

- soul-after-death T1: **The Bible: First Epistle to the Thessalonians** [book]
  - checked: find-document "The Bible: First Epistle to the Thessalonians" → 2 Thessalonians (20975); 1 Thessalonians (20970) | documents?q → 2 Thessalonians (20975); 1 Thessalonians (20970)
- soul-after-death T1: **The Bible: First Epistle to the Corinthians** [book]
  - checked: find-document "The Bible: First Epistle to the Corinthians" → 1 Corinthians (20967) | documents?q → 1 Corinthians (20967)
- soul-after-death T1: **The Bible: Daniel** [book]
  - checked: find-document "The Bible: Daniel" → Tag: Daniel (Bible) (288816); Tag: Daniel (Bible) (833133); Daniel (21223) | documents?q → Tag: Daniel (Bible) (288816); Tag: Daniel (Bible) (833133); Daniel (21223)
- soul-after-death T1: **The Qur'an** [book]
  - checked: find-document "The Qur'an" → The Qur'an and Its Exegesis (English translation of Koran und Koranexegese) (956266); The Qur'an (Arabic, Simple Text) (21381); The Qur'an (Arabic) (21380) | documents?q → Qur'anic Kerygma: Epic, Apocalypse, and Typological Figuration (919398); The Qur’anic Epic and the Creation of Humanity (984142); The Qur'an: The First Book in Arabic (Part 1 of 3) (984127)
- soul-after-death T3: **The Holy Bible** [book]
  - checked: find-document "The Holy Bible" → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521) | documents?q → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521)
- soul-after-death T3: **The Qur'an** [book]
  - checked: find-document "The Qur'an" → The Qur'an and Its Exegesis (English translation of Koran und Koranexegese) (956266); The Qur'an (Arabic, Simple Text) (21381); The Qur'an (Arabic) (21380) | documents?q → Qur'anic Kerygma: Epic, Apocalypse, and Typological Figuration (919398); The Qur’anic Epic and the Creation of Humanity (984142); The Qur'an: The First Book in Arabic (Part 1 of 3) (984127)
- detachment-buddhism T1: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book]
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Guidelines for Teaching (945913) ¶31 coverage 0.27
- detachment-buddhism T3: **Alagaddūpama Sutta (Majjhima Nikāya 22)** (Pali Canon) [book]
  - checked: find-document "Alagaddūpama Sutta" → Majjhima Nikaya 22 - Alagaddupama Sutta (Water-Snake Simile) (17262) | documents?q → Majjhima Nikaya 22 - Alagaddupama Sutta (Water-Snake Simile) (17262)
- detachment-buddhism T3: **Clinging & the End of Clinging** (Ṭhānissaro Bhikkhu) [article]
  - checked: find-document "Clinging & the End of Clinging" → O Lord, Praise Be To Thee For Making Me Hear Thy Call (924347) | documents?q → O Lord, Praise Be To Thee For Making Me Hear Thy Call (924347)
- detachment-buddhism T4: **Saṃyutta Nikāya 22.58 (Sammāsambuddha Sutta)** (The Buddha (Pāli Canon)) [other]
  - checked: find-document "Saṃyutta Nikāya 22.58" → Samyutta Nikaya 22.58 - Buddha Sutta: Awakened (19394) | documents?q → Samyutta Nikaya 22.58 - Buddha Sutta: Awakened (19394) | phrase search → Sutra Collection (M, Part-1) (21317) ¶1302 coverage 0.00
- detachment-buddhism T5: **Majjhima Nikāya: Cūḷasīhanāda Sutta (MN 11)** (Buddha, tr. Thanissaro Bhikkhu) [book]
  - checked: find-document "Majjhima Nikāya: Cūḷasīhanāda Sutta" → none | documents?q → none | phrase search → Sutra Collection (TU) (20938) ¶1117 coverage 0.22
- equality-sexes T2: **Letter of the Universal House of Justice, 24 July 1975, to an individual** (Universal House of Justice) [letter]
  - checked: find-document "Letter of the Universal House of Justice, 24 July 1975, to a…" → none | documents?q → none | phrase search → Lawh-i-Maryam (Tablet to Maryam) (15153) ¶35 coverage 0.00
- equality-sexes T3: **Bahá'í Hermeneutics** (Peter Terry) [article]
  - checked: find-document "Bahá'í Hermeneutics" → Baha'i Hermeneutics: An Academic and Primary Source Inquiry (22817); Baha'i Hermeneutics: An Academic and Primary Source Inquiry (323213); Bahá’í Hermeneutics: An Academic and Primary Source Inquiry (14765) | documents?q → Bahá’í Hermeneutics: An Academic and Primary Source Inquiry (14765); Baha'i Hermeneutics: An Academic and Primary Source Inquiry (22817); Baha'i Hermeneutics: An Academic and Primary Source Inquiry (323213)
- equality-sexes T5: **Letter of the Universal House of Justice to an individual, 22 December 2013** (Universal House of Justice) [letter]
  - checked: find-document "Letter of the Universal House of Justice to an individual, 2…" → none | documents?q → none | phrase search → Will and Testament (16925) ¶1860 coverage 0.00
- return-iqan T1: **The Holy Bible (Gospel of John)** [book]
  - checked: find-document "The Holy Bible" → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521) | documents?q → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521)
- golden-rule T4: **The Bible: Gospel according to Matthew** [book]
  - checked: find-document "The Bible: Gospel according to Matthew" → none | documents?q → none | phrase search → The Bible (KJV), The Gospel of Luke (20990) ¶195 coverage 0.00
- golden-rule T4: **The Bible: Gospel according to Luke** [book]
  - checked: find-document "The Bible: Gospel according to Luke" → none | documents?q → none | phrase search → The Bible (KJV), The Gospel of Luke (20990) ¶195 coverage 0.00
- 004-soul-reincarnation T1: **Comparison of God and Soul Concepts From a Bahá'í and Hindu Perspective** (Kerr) [article]
  - checked: find-document "Comparison of God and Soul Concepts From a Bahá'í and Hindu …" → none | documents?q → none
- 004-soul-reincarnation T2: **Buddha (Stanford Encyclopedia of Philosophy)** (Stanford Encyclopedia of Philosophy) [article]
  - checked: find-document "Buddha" → The Buddha's Path of Virtue (Dhammapada tr. Wagiswara and Saunders) (17277); buddha-krishna-zoroaster-and-related-subjects-bahaullah-abdulbaha_en (608130); Buddha, Krishna, Zoroaster and Related Subjects (945904) | documents?q → The Buddha's Path of Virtue (Dhammapada tr. Wagiswara and Saunders) (17277); Buddha, Krishna, Zoroaster and Related Subjects (945904); Buddhacarita (21314)
- 004-soul-reincarnation T4: **Chāndogya Upaniṣad** [book]
  - checked: find-document "Chāndogya Upaniṣad" → none | documents?q → none
- 004-soul-reincarnation T4: **Bṛhadāraṇyaka Upaniṣad** [book]
  - checked: find-document "Bṛhadāraṇyaka Upaniṣad" → none | documents?q → none
- seed-21 T3: **Enchiridion** (Augustine of Hippo) [book]
  - checked: find-document "Enchiridion" → none | documents?q → none
- seed-21 T3: **Enneads** (Plotinus) [book]
  - checked: find-document "Enneads" → Tag: Enneads (289652); Tag: Enneads (289649) | documents?q → Tag: Enneads (289652); Tag: Enneads (289649)
- seed-21 T4: **Star of the West, vol. 19, no. 3** ('Abdu'l-Bahá (attributed)) [article]
  - checked: find-document "Star of the West, vol. 19, no. 3" → Star of the West, v3, i19 'Ala, March 2 1913 (15428); Star of the West, v11, i19 'Ala, March 2 1921 (15424) | documents?q → Star of the West, v3, i19 'Ala, March 2 1913 (15428); Star of the West, v11, i19 'Ala, March 2 1921 (15424)
- seed-39 T2: **Persian Bayán** (The Báb) [book]
  - checked: find-document "Persian Bayán" → The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726); The Persian Bayán: From A.L.M. Nicolas' French translation (15140) | documents?q → Persian Bayán: Summary and Thematic Analysis (14653); The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726)
- seed-66 T3: **Qur'an** [book]
  - checked: find-document "Qur'an" → The Qur'an and Its Exegesis (English translation of Koran und Koranexegese) (956266); The Qur'an (Arabic, Simple Text) (21381); The Qur'an (Arabic) (21380) | documents?q → Qur'anic Kerygma: Epic, Apocalypse, and Typological Figuration (919398); The Qur’anic Epic and the Creation of Humanity (984142); The Qur'an: The First Book in Arabic (Part 1 of 3) (984127)
- seed-66 T3: **Bible (Exodus)** [book]
  - checked: find-document "Bible" → The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); Bible Prophecies (984297); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | documents?q → Bible Prophecies (984297); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214)

### Not determinable (5)

- detachment-buddhism T4: **Virāga Sutta (Saṃyutta Nikāya)** (The Buddha (Pāli Canon)) [other]
  - checked: find-document "Virāga Sutta" → none | documents?q → none
- equality-sexes T1: **Universal House of Justice, letter to an individual, 22 December 2013** (Universal House of Justice) [letter]
  - checked: find-document "Universal House of Justice, letter to an individual, 22 Dece…" → none | documents?q → none
- equality-sexes T1: **Universal House of Justice, letter to the National Spiritual Assembly of New Zealand, 31 May 1988** (Universal House of Justice) [letter]
  - checked: find-document "Universal House of Justice, letter to the National Spiritual…" → none | documents?q → none
- equality-sexes T2: **Letter of the Universal House of Justice, 31 May 1988, to the National Spiritual Assembly of New Zealand** (Universal House of Justice) [letter]
  - checked: find-document "Letter of the Universal House of Justice, 31 May 1988, to th…" → none | documents?q → none
- seed-39 T2: **Tablet of Ishráqát (Tablets of Bahá'u'lláh revealed after the Kitáb-i-Aqdas)** (Bahá'u'lláh) [tablet]
  - checked: find-document "Tablet of Ishráqát" → Ishraqát, Tablet of, Date of Revelation (208); Tablet of Splendors (Lawh-i-Ishraqat): Tablet study outline (24214); Tablet of Splendors (Lawh-i-Ishraqat): Tablet study outline (329930) | documents?q → Ishraqát, Tablet of, Date of Revelation (208); Tag: Lawh-i-Ishraqat (Tablet of Splendors) (299423); Ishraqat, Tablet of, Date of Revelation (21526)

### Perplexity errors (79)

- soul-after-death T1 [factual]: Lists 2 Maccabees under 'Jewish texts', but it is not in the Jewish canon; it is deuterocanonical in Christian Bibles.
- soul-after-death T1 [other] (Anís right): Leaves out the Bahá'í Writings, which address mutual recognition after death most directly (Gleanings LXXXVI).
- soul-after-death T2 [factual]: Perplexity says the Kitáb-i-Íqán has a section on the soul's spiritual journey after bereavement, with a 'Riḍván of everlasting reunion' passage about communing with heavenly spirits. The Íqán has no such section on bereavement or the afterlife.
- soul-after-death T2 [wrong_location]: It gives no section number for Gleanings, the most relevant source; the passage is LXXXVI.
- soul-after-death T3 [other]: Perplexity calls Gleanings 'primary or near-primary'. It is Bahá'u'lláh's own revealed Writing, translated by Shoghi Effendi, so it is fully primary. The hedge is minor.
- detachment-buddhism T2 [unofficial_translation]: It gives Cole's provisional translation without noting that it is unofficial.
- detachment-buddhism T2 [pilgrim_note_as_writings]: It cites Divine Philosophy (notes of 'Abdu'l-Bahá's talks) as "'Abdu'l-Bahá's" without saying it is an unauthenticated record of his talks.
- detachment-buddhism T2 [other] (Anís right): It calls a tablet whose authorship isn't disputed "traditionally attributed to Bahá'u'lláh".
- detachment-buddhism T3 [wrong_location]: 'Clinging & the End of Clinging' is footnoted [3], which points to an opensadhaka.com page. Its real URL is [10].
- detachment-buddhism T3 [other]: 'Khandha Sutta or related five-aggregate teachings' is vague, and the only support given is a Ṭhānissaro essay ([2]), not the sutta itself. The MN 22 §34 numbering is also unverified.
- detachment-buddhism T4 [other]: Perplexity declares the 'Sutra Collection' quotation inauthentic and unlocatable. It exists in the library and appears to come from a Chan/Bodhidharma sermon. The fault is its lack of a citation, not that it is fabricated.
- detachment-buddhism T5 [wrong_location]: Names SN 12.52 as the likely source of the passage. A rhetorical question about whether becoming would be discerned without clinging matches DN 15 (Mahānidāna Sutta) better. (I'm fairly confident of this, but not certain.)
- equality-sexes T1 [factual]: Perplexity dates the Will and Testament to c. 1906–1908. It is usually dated c. 1901–1908.
- equality-sexes T1 [wrong_location] (Anís right): Perplexity presents the World Order of Bahá'u'lláh essays as primary sources on this question. They don't address the restriction. Its claim that 'The Goal of a New World Order' discusses the equality of women and men within 'complementary institutional functions' looks unsupported.
- equality-sexes T1 [other] (Anís right): Perplexity gives no Shoghi Effendi letter that actually addresses the restriction, such as the 15 July 1947 letter written on his behalf or the one in Dawn of a New Day. Instead it points to later Universal House of Justice summaries.
- equality-sexes T2 [wrong_location]: Dated the 'fully revealed and appreciated in the future' letter to 14 December 1940. It is usually cited as 28 July 1936 (to Mrs Russell).
- equality-sexes T3 [invented_or_misquoted]: It quotes 'O ye Men of Justice in the House of Justice!' as the authorized Aqdas wording. That is not the actual text: the address is 'O ye Men of Justice!'
- equality-sexes T3 [wrong_location]: It places the 'Men of Justice' address in Aqdas ¶30. The address appears in ¶52, and ¶30 does not use it.
- equality-sexes T3 [authority_error]: It rests the claim that rijál may be generic, and the characterisation of 'later Bahá'í explanations', partly on uhj.net, a site whose title argues that women serve on the House.
- equality-sexes T4 [other]: Its Questions and Answers point and its linguistic claim rest on a Reddit thread, not on a primary edition. It also does not address the Aqdas introduction's statement that laws addressed to men apply to both sexes, which is directly relevant to the 'generic' question.
- equality-sexes T5 [factual]: Dates the 'Abdu'l-Bahá passage in Selections 38.4 to 1924. 'Abdu'l-Bahá died in November 1921.
- equality-sexes T5 [invented_or_misquoted]: Says the Tablet was addressed 'to the Bahá'ís of the East and West'. Selections gives no such recipient.
- return-iqan T1 [misattribution]: It presents the John/Elijah explanation (John denying personal identity while Christ affirms the return of Elijah's perfections and qualities) as Bahá'u'lláh's words in the Kitáb-i-Íqán, Part Two. The wording and argument come from 'Abdu'l-Bahá, Some Answered Questions ch. 33 (its source [2]), which it never names. As far as I know, the Íqán does not go through John 1:21 in this way, though I am not certain.
- return-iqan T1 [wrong_location]: The Íqán location for the John/Elijah discussion is given as 'Part Two, paragraphs nascently corresponding to the discussion…', which is a garbled, non-existent reference.
- return-iqan T2 [wrong_location]: Cites the 'Temples of the Cause of God' passage as ¶153. It is most likely in ¶161, the same paragraph as 'I am the return of all the Prophets'.
- return-iqan T2 [wrong_location]: Cites 'I am all the Prophets… I am the first Adam, Noah, Moses, and Jesus' as ¶152. It is most likely later in Part Two, around ¶178–179.
- return-iqan T3 [wrong_location]: It labels as paragraphs ¶152–153 what appear to be page numbers (pp. 152–153, US edition). In the Bahá'í Reference Library paragraph numbering these passages fall later, around ¶161–162 (not certain).
- return-iqan T4 [wrong_location]: Labels the Íqán passages as 'paragraphs 151–153 in the paragraph-numbered edition'. These look like page numbers in the standard English edition. The authorised paragraph numbers for the 'Temples of the Cause of God' and 'return of all the Prophets' passages appear to be around ¶161, though I'm not fully certain.
- return-iqan T5 [wrong_location]: Puts 'Reincarnation' at Question 80. In SAQ it is chapter 81, as best I recall (80 is on pre-existence and creation).
- return-iqan T5 [other]: Explains rajʿah from Bahaipedia and Shi'i usage, and never confirms that the Íqán uses the term
- golden-rule T1 [wrong_location] (Anís right): Cites 'Lay not on any soul a load...' as Gleanings section CXXVIII. It is Gleanings LXVI (¶8), from the Súriy-i-Mulúk.
- golden-rule T1 [other] (Anís right): Every quotation is footnoted to a single WordPress blog rather than to the authoritative texts.
- golden-rule T2 [wrong_location]: 'Speak no evil… wish not the abasement of anyone…' cited as Persian Hidden Words no. 40; it is Persian no. 44 ('O Companion of My Throne!').
- golden-rule T3 [other]: It did not point out that the reader's 'O Son of Spirit!' heading is a misquotation, though it quoted the correct heading, 'O Children of Men!'.
- golden-rule T5 [wrong_location]: Attributes 'The earth is but one country, and mankind its citizens' to the Tablet of the World (Lawḥ-i-Dunyá). As I recall, it is in the Lawḥ-i-Maqṣúd (Tablets, p. 167) and in Gleanings CXVII.
- golden-rule T5 [wrong_location]: The Gleanings section number CXXII for 'fruits of one tree, leaves of one branch' looks doubtful (I'm not certain). The phrase is in the Lawḥ-i-Maqṣúd.
- golden-rule T5 [wrong_location]: I'm not sure 'leaves of one tree and drops of one ocean' is in the Lawḥ-i-Maqṣúd. The passage Perplexity gives may be a different one from that tablet.
- 004-soul-reincarnation T1 [wrong_location]: Cites Some Answered Questions ch. 80 for 'Abdu'l-Bahá's rejection of metempsychosis. The chapter titled 'Reincarnation' is ch. 81; ch. 80 deals with pre-existence and origination.
- 004-soul-reincarnation T1 [other]: The Hindu and Buddhist positions are grounded only in Bahá'í-side secondary sources (the Kerr paper, Bahaipedia), not in those traditions' own scriptures, and the sources are not labelled as commentary.
- 004-soul-reincarnation T2 [wrong_location]: It gave the title of Some Answered Questions ch. 81 as 'The Return of the Prophets'. I believe the chapter is titled 'Reincarnation'.
- 004-soul-reincarnation T2 [other]: It did not name the source of the passage the reader quoted (a letter on behalf of Shoghi Effendi in Lights of Guidance), although Lights of Guidance appears in its URL list.
- 004-soul-reincarnation T3 [wrong_location]: Places the lamp-and-flower analogy in Some Answered Questions ch. 80, 'The Subsistence of the Soul'. As I recall, it is in the chapter on reincarnation (ch. 81 in the older edition).
- 004-soul-reincarnation T3 [other]: Hedges on whether the analogy is 'attributed to 'Abdu'l-Bahá depending on the version'. This blurs the fact that the analogy appears in an authoritative text, Some Answered Questions.
- 004-soul-reincarnation T4 [invented_or_misquoted]: I can't verify that 'Man's identity, or rather his individuality, is never lost...' is in Paris Talks. It is cited only second-hand through a compilation PDF, so its attribution to 'Abdu'l-Bahá is uncertain.
- 004-soul-reincarnation T4 [wrong_location]: 'As one soul' and 'return and be gathered to the glory of the Beloved' are all placed in Gleanings LXXXI. Some of this wording may belong to adjacent sections (I'm unsure).
- 004-soul-reincarnation T4 [other] (Anís right): It says the Bahá'í texts give no reason why individuality survives. That overlooks Some Answered Questions 66, where the soul is said to have individuality from the beginning rather than through the body. Anís cited that passage.
- 004-soul-reincarnation T5 [wrong_location]: The Rāmānuja quotation is footnoted [3], which links to the bahai.works Gleanings LXXXII page instead of SBE 48; no sūtra reference is given
- 004-soul-reincarnation T5 [other] (Anís right): Calls the commentary 'traditionally attributed to Rāmānuja', an unnecessary hedge for the Śrībhāṣya
- seed-21 T1 [misattribution] (Anís right): Perplexity credits Lights of Guidance #1734 ('Evil Exists', the 'darkness is a fact' passage) to ‘Abdu’l-Bahá. It is a letter written on behalf of Shoghi Effendi.
- seed-21 T1 [invented_or_misquoted]: Perplexity says Kitáb-i-Íqán ¶157 describes 'the Evil One' as whatever hinders spiritual progress. I don't think that paragraph says this.
- seed-21 T1 [invented_or_misquoted]: The Gleanings XLVIII wording ('darkness of the night of error' through which the 'Sun of Truth' becomes manifest) may be wrongly placed or paraphrased. I'm not certain.
- seed-21 T2 [unofficial_translation]: Perplexity attributes the quoted wording to Laura Clifford Barney's translation. It is actually the revised 2014 Bahá'í World Centre translation, and Barney's original wording differs.
- seed-21 T2 [invented_or_misquoted]: Perplexity says the Persian is 'عین عدم' (ʿayn-e ʿadam) and names 'عدمِ وجود' as recurring terms. Neither is verified against the original text, and the Persian likely uses 'راجع به عدم' / 'امر عدمی'.
- seed-21 T3 [wrong_location]: Gives the SAQ chapter as 'On Good and Evil' §§6–7. It is ch. 74, 'The Nonexistence of Evil'.
- seed-21 T3 [unofficial_translation]: Says the quotations are Laura Clifford Barney's translation but links to the 2014 revised bahai.org edition, mixing the two translations.
- seed-21 T3 [invented_or_misquoted]: Quoted wording such as 'Evil consists merely in non-existence' and 'whatsoever God has created, He has created good' doesn't appear verbatim in either standard SAQ translation (uncertain, but likely paraphrased).
- seed-21 T4 [factual] (Anís right): It suggests the reader's sentence cannot be shown to be a quotation of 'Abdu'l-Bahá, yet the sentence appears word for word in Star of the West vol. 8 as his reported words. It found only a different sentence from that volume.
- seed-21 T5 [wrong_location]: Gives 'The Nonexistence of Evil' as chapter 64 of Some Answered Questions; it is chapter 74 as far as I know.
- seed-39 T1 [misattribution] (Anís right): It says the Kitáb-i-Aqdas 'calls the Bayán the "Mother Book" of the Bábí dispensation and explains that Bahá'u'lláh incorporated some of its laws'. The phrase 'Mother Book' is Shoghi Effendi's (God Passes By), and the account of which laws were incorporated comes from the Aqdas introduction and notes by the Universal House of Justice, not from Bahá'u'lláh's text.
- seed-39 T1 [wrong_location]: Shoghi Effendi's description of the Persian Bayán as 'primarily a eulogy of the Promised One' comes from God Passes By, but it is cited to a faculty notes page and a provisional Aqdas notes page, and God Passes By is never named.
- seed-39 T1 [other] (Anís right): 'Abdu'l-Bahá's statement that the Bayán was superseded by the Aqdas is sourced to secondary web notes, not to the tablet itself.
- seed-39 T2 [wrong_location]: It attributes the 'by embodying them in the Kitáb-i-Aqdas in different words' statement to the Tablet of Ishráqát. I am not sure of that source; the wording appears in the Aqdas notes, and no note number is given.
- seed-39 T2 [other]: It relies on the scholarly summaries by Terry and Afnan for the Bayán chapter references, and its account of what those chapters say is a paraphrase, not a quotation.
- seed-39 T4 [unofficial_translation]: Its wording for Aqdas ¶139 ('Him Whom We shall manifest in truth') comes from the provisional multilinear translation on bahai-library.com, not the authorised English text, and it does not say so.
- seed-39 T4 [other] (Anís right): Leaves out the passage where Bahá'u'lláh says in His own words that the Báb's laws were made subject to His sanction (Tablets of Bahá'u'lláh), which is the most authoritative answer to the substance of the question.
- seed-39 T5 [authority_error]: Calls the Introduction's sentence 'editorial/introductory material'. As far as I recall, that wording quotes a letter written on behalf of Shoghi Effendi, so it carries the Guardian's authority.
- seed-39 T5 [other]: Cites a bahai-library.com 'provisionals' notes page (aqdas186.notes) as 'the official Aqdas notes'. I'm not sure the authorized notes contain that summary.
- seed-66 T1 [misattribution] (Anís right): Gives the 'During the days I lay in the prison of Ṭihrán… mighty torrent from the crown of My head' passage to the Súriy-i-Haykal. It is in the Epistle to the Son of the Wolf.
- seed-66 T1 [misattribution]: Says the Kitáb-i-Íqán describes four months in a foul, dark dungeon among thieves, assassins and highwaymen. That description is in the Epistle to the Son of the Wolf.
- seed-66 T2 [wrong_location]: Calls the Maiden passage the 'opening passage' of the Súratu'l-Haykal. It is actually at ¶6–7 of the Súrih in The Summons of the Lord of Hosts, after the opening verses.
- seed-66 T3 [wrong_location]: Citation numbers are swapped: [1] (Bible Gateway, Exodus 3) is cited for the Súratu'l-Haykal quotation and [3] (the Summons on bahai.org) for Exodus. The works are named correctly in the text.
- seed-66 T4 [invented_or_misquoted]: Quotes the Epistle as 'We were consigned for four months to a place devoid of light'. The authorised text reads, to my knowledge, 'We were consigned for four months to a place foul beyond comparison.'
- seed-93 T1 [wrong_location]: It places the 'two pillars, reward and punishment' passage in Summons of the Lord of Hosts, Tablet to the Kings. As far as I know, it comes from Bahá'u'lláh's later Tablets (the Ishráqát / Lawh-i-Maqsúd).
- seed-93 T1 [wrong_location]: It attributes the 'Most Great Justice' passage to the Tablet to the Kings in Summons. That location is unconfirmed and probably wrong.
- seed-93 T2 [wrong_location]: Gives Some Answered Questions ch. 59 the title 'The Difference Existing between Man and the Animal', the same title it gives ch. 48. The title is duplicated, and the location of the justice/bounty passage is doubtful.
- seed-93 T2 [wrong_location]: Says SAQ ch. 48 explicitly treats justice and injustice as matters of free will. Free will is the subject of ch. 70; this attribution is doubtful.
- seed-93 T3 [other] (Anís right): Perplexity says 'the very air your daily choices breathe' 'was my metaphor', claiming as its own a line from the earlier answer, which it did not write. This is a framing slip, not a source misattribution.
- seed-93 T4 [invented_or_misquoted]: A small wording difference: it has 'are justice and right', while the authorised text reads 'is justice and right', as I recall it (not fully certain).
- seed-93 T5 [wrong_location]: Says the line is at paragraph 16 of The Advent of Divine Justice. Page 28 is right, but the passage sits in the rectitude-of-conduct section, which comes later in the book than paragraph 16.

#### soul-after-death

- T1 *opening*: **anis** — Anís found and named the source that answers the reader's question most directly and with the highest authority: Bahá'u'lláh's Gleanings LXXXVI, which is about whether souls stay conscious of one another after death. The quotes are verbatim and the links go to the paragraph. Its weaknesses: it quotes only the question, not the answer; the Qur'an verse is weak support; and it credits 2 Samuel to Samuel by tradition. Perplexity's Bible and Qur'an citations are more numerous, more precise (to the verse) and all accurate. However, it leaves out the Bahá'í Writings altogether, and it calls 2 Maccabees a 'Jewish text' when it is not in the Jewish canon. (Perplexity 5.2 s, $0.00528)
- T2 *reference*: **px** — The reader asked where in the library to look. Perplexity named several works that do bear on the question, including Gleanings, which is the correct primary text, and it labelled their genres (scripture, prayers, talks, Swedenborg's theology) properly. It mostly gave only work-level locations, though, and its description of the Íqán is wrong. Anís gave one accurately cited quotation that does not touch the afterlife at all, and he left unused the relevant Bahá'u'lláh tablet his retrieval surfaced. (Perplexity 7.5 s, $0.0053)
- T3 *deepen*: **px** — Perplexity answered the question that was asked: for each tradition it named the primary scripture and gave accurate verse references on death and the afterlife, and it pointed to the correct Gleanings passage on recognising loved ones. Anís gave a fair general definition, but he backed it with irrelevant translators' footnotes, presented one of them as the Mahabharata's own words, and sent the reader to the Íqán for the soul's journey. The Íqán isn't the right text for that; Gleanings is. (Perplexity 5.7 s, $0.00542)
- T4 *absent*: **px** — Perplexity quoted the passage that actually answers the question, Gleanings LXXXVI ('conscious one of another', 'well aware of one another's state and condition'). It gave accurate wording, the section number and the passage's own qualification. Anís quoted an authentic but unrelated passage on the soul's stages, gave no section number, and missed the passage he had himself cited in T1. (Perplexity 5.4 s, $0.00555)
- T5 *compare*: **undefined** — undefined (Perplexity 6.4 s, $0.00592)

#### detachment-buddhism

- T1 *opening*: **anis** — Anís's main quotations from the Aqdas, the Íqán and the Gleanings passage are verbatim and correctly located. His faults are an unlabelled provisional translation and a vague compilation credit. Perplexity gives paragraph-level citations that look authoritative, but almost all of them are wrong. It gives the wrong Hidden Word numbers, invents wording, credits Íqán text to the Seven Valleys, and attributes to Selections lines that come from Paris Talks or appear to be made up. Anís's sourcing is far more reliable. (Perplexity 7.3 s, $0.00598)
- T2 *reference*: **tie** — Both name the same correct tablet as the source of the passage. Neither flags that it is Cole's provisional translation. Perplexity quotes the whole sentence and adds relevant supporting sources, but it hedges oddly on whether the tablet is Bahá'u'lláh's and doesn't flag Divine Philosophy as talk notes. Anís answers correctly but thinly. On identifying the source of the passage itself, they are equal. (Perplexity 4.8 s, $0.00511)
- T3 *exact_quote*: **px** — Both answers quote the same passage accurately. Only Perplexity names the actual scripture (Śūraṅgama Sūtra) and explains the argument the line sits in, which shows it is not a definition of virāga. That was exactly the reader's question. Perplexity also gives real canonical places where clinging is analysed (MN 22) and keeps commentary separate from scripture. Anís gave a precise link but left the source anonymous, and he dodged the second question. (Perplexity 6.0 s, $0.00602)
- T4 *absent*: **px** — The reader asked for the Buddha's own words on virāga with a sutra name or number. Perplexity gave SN 22.58 with an accurate formula and pointed to the Virāga Sutta references. Anís said honestly that he had no sutra reference, but then gave a modern commentator's paraphrase under a label that sounds like scripture, so the reader still did not get a canonical source. (Perplexity 6.5 s, $0.00568)
- T5 *pushback*: **px** — Perplexity answered the pushback directly. It admitted that 'systematic release' was a gloss and that the English translation doesn't use 'non-attachment'. It then cited real suttas, and its MN 11 quotation is accurate, though it probably picked the wrong sutta (SN 12.52 rather than DN 15) as the source of the passage. Anís didn't respond at all: he gave an unrelated Arabic root study of a Gleanings passage and never addressed the Buddhist text. (Perplexity 5.3 s, $0.0057)

#### equality-sexes

- T1 *opening*: **px** — Perplexity found the central 'Abdu'l-Bahá text in its authorised translation, with the paragraph (Selections #38), and gave dates as the reader asked. Anís used an unofficial translation of the Corinne True tablet and missed Selections #38. He also labelled a note in the Kitáb-i-Aqdas as revealed text and gave no dates. Anís did name a real Shoghi Effendi source (Dawn of a New Day), which Perplexity failed to do, since its World Order essays are filler. Even so, Perplexity's 'Abdu'l-Bahá citation is more correct and more precise, so it narrowly wins. (Perplexity 6.4 s, $0.00602)
- T2 *reference*: **px** — The reader asked two things: was the line Shoghi Effendi's own writing or a secretary's, and was it 'Abdu'l-Bahá's words? Perplexity answered both correctly. It said the letter was written on Shoghi Effendi's behalf, and it pointed to 'Abdu'l-Bahá's actual Tablet in the Women compilation. It also treated the 1975 House of Justice letter properly, as a later reference rather than as doctrine. Its date is probably wrong (1940 instead of 28 July 1936). Anís found the right passage but would not give the date, recipient or authorship, even though his own cited URL showed the date and recipient. (Perplexity 5.9 s, $0.00609)
- T3 *compare*: **px** — Perplexity answered the question the reader actually asked. It identified the Corinne True Tablet ('Abdu'l-Bahá, July 1909) as the source of 'according to the Text of the Book' and compared it with the Aqdas term 'Men of Justice' (rijál). It also correctly separated the scriptural text from 'Abdu'l-Bahá's reading of it. It made errors: a misquoted Aqdas line, the wrong paragraph number, and reliance on a partisan website for the linguistic point. Even so, its sourcing is much more on target. Anís never named the Corinne True Tablet or any Aqdas paragraph. He did not mention that the letter he cited was written on Shoghi Effendi's behalf, and he admitted his sources could not answer the question. (Perplexity 6.9 s, $0.00625)
- T4 *deepen*: **px** — Perplexity answered the question. It identified rijāl and pointed to the scriptural source, Kitáb-i-Aqdas ¶52, plus a related passage in Questions and Answers. Anís only listed secondary places where 'Abdu'l-Bahá's remark is reproduced and said he could not answer, even though Aqdas ¶52 was among the sources his retrieval surfaced. (Perplexity 6.4 s, $0.00601)
- T5 *absent*: **px** — Perplexity found the primary text the reader was really asking for: 'Abdu'l-Bahá's own statement in Selections 38.4, which gives the 'wisdom… as clear as the sun at high noon' formulation. It also gave a date for the Guardian's letter and correctly said it was written on his behalf. Its 1924 date and 'East and West' recipient for the Tablet are wrong, since 'Abdu'l-Bahá died in 1921. Anís gave only the second-hand Guardian letter, with no date. He also said no date or recipient was available and ignored the Arabic original of the Tablet that his own retrieval had surfaced. Perplexity is more complete and more precise overall, despite its factual error. (Perplexity 5.7 s, $0.00604)

#### return-iqan

- T1 *opening*: **px** — Perplexity is ahead, but only just. It names the two central Íqán passages on return ('Temples of the Cause of God' and 'I am the return of all the Prophets'), places them correctly in Part Two, and gives the Gospel verses for the Elijah example. However, it wrongly credits the John/Elijah explanation to the Íqán, and that explanation is really 'Abdu'l-Bahá's in Some Answered Questions ch. 33. Anís's quotations are accurate and correctly credited, and he does name Some Answered Questions, the real source for John and Elijah. But he gives no chapter, leans on a loosely related Part One passage, leaves out the key 'return of all the Prophets' passage, and never deals with Elijah or says where things are in his text. (Perplexity 7.0 s, $0.00605)
- T2 *reference*: **px** — Anís returned nothing: no passages and no locations, though the reader asked directly for the lines from his own earlier reply, including the Temples passage he had already quoted. Perplexity gave the real Íqán passages with the correct work and author and opened with the passage on the Messengers' identity, as the reader asked. Its paragraph numbers look partly wrong: the Temples passage and the return passage appear to share ¶161, and 'I am all the Prophets' is around ¶179. (Perplexity 5.1 s, $0.00578)
- T3 *exact_quote*: **px** — Perplexity correctly says the phrase was a summary, not the text. It then supplies the actual Íqán passages (one soul and the same person; Temples of the Cause of God; 'I am the return of all the Prophets'), quoted verbatim, in Part Two, which answers the study question. Its paragraph numbers are probably page numbers, but the reader can still find the passages. Anís gives nothing locatable and does not admit that the phrase was his own. (Perplexity 4.7 s, $0.00558)
- T4 *pushback*: **px** — Both answers correctly say the phrase was an interpretive summary, not a quotation. Only Perplexity does what the reader asked: it gives the actual Íqán wording on the unity and return of the Prophets in the authorised translation, with a location. Its paragraph numbers look like page numbers, so the reader should check them on bahai.org. Anís gives no passage or location at all, even though he had quoted the 'Temples of the Cause of God' sentence himself in T1. (Perplexity 4.8 s, $0.00587)
- T5 *deepen*: **px** — Perplexity rests the meaning of 'return' on 'Abdu'l-Bahá's Some Answered Questions, names the chapters, and quotes passages that closely match the published translation. Its only real slip is the chapter number for Reincarnation (80 rather than 81). Anís asserts only a term, with no location and a garbled Arabic form. He never explains what 'return' means, and he leaves out the SAQ chapter his own retrieval surfaced. (Perplexity 5.2 s, $0.00604)

#### golden-rule

- T1 *opening*: **anis** — Every source Anís gives is correct and linked to its exact paragraph. Perplexity covers more ground, and its Íqán, Epistle and Hidden Words Arabic 29 references are useful. But its main recommendation, Gleanings CXXVIII, is the wrong section (it should be LXVI:8), and all its quotations come from a blog. Anís missed some of the most direct passages, but he made no location errors, so he wins narrowly on correctness. (Perplexity 3.2 s, $0.00458)
- T2 *reference*: **px** — Perplexity correctly answered that the exact passage is in the Summons and not the Hidden Words, and quoted a related Hidden Word, though it numbered it Persian 40 instead of 44. Anís wrongly said the passage is in the Hidden Words and backed this with an unrelated Prayers and Meditations quotation. (Perplexity 3.9 s, $0.00462)
- T3 *source*: **px** — Perplexity gave the exact location (Hidden Words, Arabic no. 68, plus a page number) and named Shoghi Effendi as translator. It also correctly explained the earlier mistake: a Prayers and Meditations passage had been presented as being in the Hidden Words. Anís named only the work and the Arabic section, gave no number, and got his own correction backwards by saying the quoted text was from the Hidden Words. (Perplexity 3.8 s, $0.00506)
- T4 *compare*: **px** — Perplexity gave the number the reader asked for (Hidden Words, Arabic 68). It also cited the actual Bible verses (Matthew 7:12, Luke 6:31) with correct wording. Anís gave no number and wrongly called the passage the opening of the Arabic collection. For the Bible he cited John Wesley's Works instead of the Gospel text. (Perplexity 4.8 s, $0.0055)
- T5 *deepen*: **px** — Perplexity answers the question asked: it gives the exact location (Hidden Words, Arabic no. 68), the Arabic phrase, and the term jawhar, and it correctly warns that the other unity passages do not repeat that wording. Its secondary attributions have errors. Anís names the word but rests on an 'Abdu'l-Bahá philosophical chapter that doesn't bear on Bahá'u'lláh's usage, and he never ties the word to the Hidden Words passage. (Perplexity 6.1 s, $0.006)

#### 004-soul-reincarnation

- T1 *opening*: **px** — Perplexity names primary Bahá'í texts at the right level of authority: Bahá'u'lláh's Gleanings no. 81, which is correct, and 'Abdu'l-Bahá's Some Answered Questions, cited as ch. 80 when the reincarnation chapter is ch. 81. It also gives the comparative ontology the reader asked for. Its Hindu and Buddhist claims rest on secondary Bahá'í sources rather than those traditions' own scriptures, which is a weakness. Anís names no source at all and gives no Hindu or Buddhist comparison. (Perplexity 5.5 s, $0.00527)
- T2 *reference*: **px** — Perplexity is the winner. It rested the Bahá'í distinction on the primary authoritative text, Some Answered Questions ch. 81 by 'Abdu'l-Bahá, though it got the chapter title wrong. It also brought in a labelled scholarly source for Buddhist anattā and actually answered the ontological question. Anís used secondary books and a pilgrim note, and an unofficial early translation without flagging it. He credited the key quotation, which is a letter written on behalf of Shoghi Effendi, to the House of Justice, and he never named Some Answered Questions. (Perplexity 8.4 s, $0.00602)
- T3 *pushback*: **px** — Perplexity attributes the key passage correctly to Shoghi Effendi (Dawn of a New Day, p. 201), answers the interpretive challenge head-on, and finds the analogy in Some Answered Questions, though probably at the wrong chapter. Anís misattributes the passage to the Universal House of Justice, presents it as interpretation, ignores the question about the analogy, and cites a Sufi passage that does not bear on the question. (Perplexity 6.2 s, $0.00579)
- T4 *compare*: **tie** — On the Bahá'í side, Anís is more accurate. He gives paragraph-linked quotations from Gleanings and Some Answered Questions, and the SAQ passage is the text that actually answers the 'why' question. Perplexity wrongly says the texts give no reason, and leans on a Paris Talks quotation I can't verify. On the Hindu side, Perplexity is clearly better: it cites the correct Upanishad passages for Advaita. Anís relies on Ramanuja, whose school opposes Advaita, and links to the wrong URL. Each answer is strong where the other is weak. (Perplexity 7.4 s, $0.00644)
- T5 *exact_quote*: **px** — Perplexity names the correct Gleanings section (LXXXI), quotes it accurately with an authoritative link, and answers the question honestly: the passage states survival, progress and contingent existence, but not individuality explicitly. Anís presents a conflated, partly invented passage as Bahá'u'lláh's words, gives no link or section, and dodges the question. On Rāmānuja both are roughly equal: each gives a plausible SBE 48 passage with no exact location and a faulty link. (Perplexity 6.8 s, $0.00667)

#### seed-21

- T1 *opening*: **anis** — Both answers rest on SAQ ch. 74. Anís gives four real passages, each with a paragraph link, and credits the 'darkness is a fact' letter to Shoghi Effendi's level, where it belongs. Perplexity credits that same letter (via Lights of Guidance) to ‘Abdu’l-Bahá, which raises a Guardian-level letter to the level of the Master's Writings. Its Íqán ¶157 citation also seems invented or wrongly placed. Perplexity does add the SAQ chapter number, but its errors outweigh that. (Perplexity 5.5 s, $0.00555)
- T2 *reference*: **px** — Perplexity named the correct chapter ('The Non-Existence of Evil', ch. 74) at paragraph precision, but it blurred Barney's translation with the 2014 revision. Anís gave the wrong chapter and called the text a 'tablet' Barney recorded. He also offered a Persian phrase (ʿadam-i maḥḍ) with no support, and cited an irrelevant, mislabelled Persian fragment. Both claimed the quoted wording was Barney's, and neither verified the Persian term. Still, Perplexity's identification is far more accurate. (Perplexity 7.3 s, $0.00617)
- T3 *compare*: **px** — Perplexity actually finds and correctly describes the two texts the reader asked about, Enchiridion 11 and Ennead I.8, and it corrects the earlier 'cold/heat' wording. Its errors are the SAQ chapter title and paragraph numbers, mixing up the Barney and 2014 translations, and loosely quoted wording. Anís skips both requested texts in favour of Maimonides and a secondary source on Sohravardi. He also credits a Star of the West report to Some Answered Questions, which presents reported speech as authenticated text, and he leaves out the relevant Shoghi Effendi passage he already had. (Perplexity 7.1 s, $0.00629)
- T4 *source*: **anis** — Neither answer supplies the recorder, issue or page. Anís at least found the exact passage containing the reader's sentence and linked to its paragraph, which sits in volume 8. Perplexity never found the sentence and wrongly cast doubt on whether it exists as a quotation from 'Abdu'l-Bahá. Perplexity does give more volume and issue detail for related passages. Anís's answer is weakened because he repeats the periodical-as-author credit, leaves the volume out of the text, and never says this is reported talk material rather than a written text. (Perplexity 5.6 s, $0.0059)
- T5 *pushback*: **px** — Both gave in to the reader and neither located the disputed passage. Perplexity at least pointed to the authoritative chapter on evil in Some Answered Questions, though with what looks like the wrong number. Anís turned to off-topic sources and quoted a press account as 'Abdu'l-Bahá's own words. (Perplexity 5.3 s, $0.00559)

#### seed-39

- T1 *opening*: **anis** — Anís gives each quotation to its exact source and keeps the levels of authority separate (Bahá'u'lláh, then 'Abdu'l-Bahá, then a letter on behalf of Shoghi Effendi, then scholarship), though his answer is truncated and thin on content. Perplexity says more about what the Bayán teaches. However, it credits Shoghi Effendi's and the editors' framing to the Kitáb-i-Aqdas, and it gets Shoghi Effendi's and 'Abdu'l-Bahá's words from secondary web notes instead of naming God Passes By or the tablet. (Perplexity 6.5 s, $0.00608)
- T2 *reference*: **px** — Perplexity correctly says the phrase is not in the Aqdas and belongs to Walbridge. It points to the Aqdas notes and to passages of the Persian Bayán, though some of those locations are uncertain. Anís wrongly attributes Walbridge's paraphrase to Bahá'u'lláh. He also offers no Aqdas location and no text from the Báb. (Perplexity 5.8 s, $0.00598)
- T3 *absent*: **neither** — Neither answer gave the Váḥid and Gate or a quotable translation of the Báb's own words. Perplexity's caution was somewhat more useful: it said plainly that the earlier phrase is not a quotation from the Bayán. Anís apologised for the Spanish line but left his earlier attribution of the wording to Bahá'u'lláh in place. The obvious next step was the Persian Bayán extracts in Selections from the Writings of the Báb, which both answers missed. Neither named a source correctly, so neither wins on source identification. (Perplexity 4.4 s, $0.00492)
- T4 *exact_quote*: **px** — The reader asked where this exact wording appears in the Aqdas. Perplexity answered correctly: it doesn't. The line is Walbridge's paraphrase (Sacred Acts, Sacred Space, Sacred Time, note 1.9), and Perplexity warned against reading it aloud as scripture. Anís attributed the wording to the Aqdas's own notes and introduction, which is a misattribution, even though his retrieval had labelled the source as Walbridge. Anís does deserve credit for offering a genuine, relevant passage by Bahá'u'lláh from Tablets of Bahá'u'lláh, which Perplexity did not find. (Perplexity 4.7 s, $0.00524)
- T5 *pushback*: **px** — The reader asked directly whose paraphrase the phrase was. Perplexity answers: John Walbridge, in Sacred Acts, Sacred Space, Sacred Time. Anís names the book but not the author, and then claims the provenance is unsettled. Perplexity also gives the official Aqdas Introduction sentence that supports the paraphrase ('sanctions some… modifies others and sets aside many'), and it names the specific tablet (Ishráqát) where Anís gives only the collection. Perplexity has two smaller faults. It calls the Introduction sentence editorial material, when I believe it quotes a letter written on behalf of Shoghi Effendi. It also cites a bahai-library 'provisionals' notes page as the 'official Aqdas notes'. (Perplexity 5.6 s, $0.00586)

#### seed-66

- T1 *opening*: **anis** — Anís names the right work for the central passage and links to the paragraph. Perplexity puts that same passage in the wrong book, the Súriy-i-Haykal, and gives the Epistle's prison description to the Íqán. The Íqán does not contain it. That makes two misattributions of scripture. Perplexity's mention of the Rashḥ-i-'Amá is accurate, and Anís had that poem among his sources but did not use it. (Perplexity 6.3 s, $0.00581)
- T2 *reference*: **px** — The reader asked for Bahá'u'lláh's own description of the Maid of Heaven. Perplexity correctly named the Súratu'l-Haykal and quoted the authorised translation accurately. It also gave a correct reference to the Epistle to the Son of the Wolf. Anís couldn't find the passage and offered an unrelated 'Maid of Heaven hath wept' line instead. (Perplexity 6.1 s, $0.00553)
- T3 *compare*: **px** — Perplexity placed Bahá'u'lláh's passage correctly (Súratu'l-Haykal ¶6). It brought in Shoghi Effendi's interpretation from God Passes By and gave the Qur'an and Exodus references the comparison needs. Anís sourced only the first line correctly. He credited the rest of the same scriptural passage to Woodman, Taherzadeh and The Bahá'í World, gave a wrong link for Taherzadeh, and offered no sources for the comparison that was actually asked. (Perplexity 7.6 s, $0.00634)
- T4 *absent*: **px** — Both answers rightly say there is no dated testimony and no day count. Perplexity takes the question to the right primary texts: the Epistle to the Son of the Wolf for the imprisonment, and the Súriy-i-Haykal for the Maiden. It also clearly marks the dating as a reconstruction, although it misquotes one sentence. Anís cites God Passes By correctly but sources Bahá'u'lláh's own Síyáh-Chál words to a secondary memoir instead of the Epistle. (Perplexity 6.4 s, $0.00568)
- T5 *exact_quote*: **px** — Both name the Epistle to the Son of the Wolf correctly as the source of the chains passage, and both quote it properly. Only Perplexity answers the second question, what happened after the Maiden spoke. It correctly names the Súratu'l-Haykal and quotes the passage where the Maiden points to His head and proclaims Him. Anís says his texts don't cover this, even though he had quoted that same passage from Summons of the Lord of Hosts in T3. (Perplexity 5.4 s, $0.00582)

#### seed-93

- T1 *opening*: **px** — Anís named no source at all. Perplexity traces the concept back to Bahá'u'lláh and correctly notes that the phrase is His, not 'Abdu'l-Bahá's. It names authoritative works in the right order of authority: Bahá'u'lláh, then 'Abdu'l-Bahá's talks, then Shoghi Effendi. Some of its tablet-level attributions are probably wrong, but they still identify far more than Anís did. (Perplexity 4.9 s, $0.00563)
- T2 *reference*: **px** — Perplexity wins. It names the actual Tablet, quotes it accurately and correctly identifies 'these' as 'justice and right'. Its other support comes from 'Abdu'l-Bahá's own works, though some of its Some Answered Questions chapter labels are wrong. Anís did not name the Tablet even though his retrieval surfaced it. He cited a secondary Bahá'í World volume, wrongly placed the phrase in public addresses, and never answered the question about 'these'. (Perplexity 6.8 s, $0.00582)
- T3 *pushback*: **px** — The reader asked what the Tablet to the Hague actually says. Perplexity found the First Tablet to The Hague (17 December 1919) and quoted the sentence verbatim. It showed that 'these' does grammatically refer back to 'justice and right', and it labelled the 'air your choices breathe' line and the daily applications as interpretation, not text. Anís found no source at all and wrongly backed away from a reading the text actually supports. One oddity: Perplexity called the metaphor 'my metaphor', but it was Anís's. That is only a framing slip, not a sourcing error. (Perplexity 5.3 s, $0.00529)
- T4 *exact_quote*: **px** — The reader asked for the exact Tablet to the Hague wording with 'these' in it, plus a link. Perplexity gave that passage from the First Tablet to the Hague, with a link to the authorised text, and correctly reads 'these' as 'justice and right'. Anís correctly placed the 'pole of justice' line in Some Answered Questions, but he did not find the Hague passage, and he had wrongly taken back an interpretation that was in fact right. (Perplexity 4.2 s, $0.00505)
- T5 *source*: **px** — Perplexity answered all three questions. It quoted the line exactly, attributed it to 'Abdu'l-Bahá, traced the Pattern of Bahá'í Life entry back to The Advent of Divine Justice p. 28, connected it to Some Answered Questions, and checked the official text of the Hague tablets to rule them out. Anís gave a new and unsupported attribution to a pilgrim's diary, with no location, and could not say anything about the Hague tablet. Perplexity's only slip is the paragraph number, which I believe is wrong. (Perplexity 4.9 s, $0.00472)
