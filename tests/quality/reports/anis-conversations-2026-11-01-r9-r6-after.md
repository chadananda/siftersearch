# Anís conversations 2026-11-01 (r9-r6-after)

10 conversations, 50 turns, 0 errors. Overall 3.35/10. Cost $7.4533 ($0.7453/conversation: Anís $0.1444, reader $0, judge $3.0734, Perplexity $0.2752, source-compare judge $3.9603).
Latency p50 9.0 s, p90 14.7 s, max 20.5 s, 3 turns over 15 s.

Judged 2× per conversation: overall per judge 3.4 / 3.3; per-conversation spread mean 0.3, max 1; defects per judge 104 / 108 (defects below are judge 1's).

| dimension | mean (1–5) |
|---|---|
| grounding | 2.55 |
| citation_links | 2.7 |
| follow_up_resolution | 2.15 |
| coherence | 2.2 |
| depth | 1.9 |
| honesty_absence | 2.15 |
| authority_ordering | 3.05 |
| tone | 3 |
| latency | 3.8 |

Defects: 104 — by stage strategy 13, follow_up_context 7, retrieval 14, selection 11, answer 56, latency 3; by severity critical 11, major 57, minor 36.

## soul-after-death — seeker (conv_05305ca3-6d28-4e59-b33a-f6bd90fe1cd2)

Theme: what happens to the soul after death and whether we will know our loved ones

**3/10 (judges 3 / 3, spread 0; defects 12 / 10)** — The library had the passage this grieving reader needed, 'Abdu'l-Bahá's "This fact is certain" on souls recognising each other, but Anís only reached it in the last turn: twice he wrongly said the texts don't address recognition, and one turn sent her to an unrelated passage.

- T1 *opening* (11.7 s, topic, history 0): Hello Anís. My grandmother passed away a few months ago, and I keep wondering where she is now, and whether I'll actually recognize her someday. Do these texts 
  - **retrieval** [critical] Retrieval missed the canonical recognition passage, and most of the sources surfaced are irrelevant (Avesta farm-servant story, Bava Batra, an Afghan newspaper tale).
  - **answer** [major] The reply tells a grieving reader there is no answer on recognition, when the library has one.
  - **answer** [minor] Quotations are cut off mid-word, and a vision story from Star of the West is set beside scripture as one of three answers.
- T2 *reference* (8.0 s, fact, history 2): That's a little disappointing, but when you say traditions approach it through their primary scriptures and commentaries, does that mean there are some in the l
  - **strategy** [major] The turn was planned as a 'fact' search on the literal wording, so it found passages on 'tradition/commentary' instead of texts about the soul.
  - **answer** [major] An irrelevant quotation is offered as the place to look, and it is Muhammad's words quoted in the Íqán, not Bahá'u'lláh's own.
- T3 *deepen* (8.5 s, define, history 4): You said the texts "point to primary scriptures and their commentaries as places to search" — what does "primary scriptures" actually mean here, and which ones 
  - **retrieval** [major] Nothing usable was retrieved, so the reply is generic and has no links. It never names the Bahá'í primary texts on the soul.
  - **answer** [minor] The reply mischaracterises the previous turn while correcting the reader.
- T4 *absent* (8.6 s, quote, history 6): Let's start with the Bahá'í writings, since you mentioned "various tablets concerning the soul and the afterlife" — is there a specific passage in them where it
  - **strategy** [critical] The reader's paraphrase was treated as a literal quotation to search for, so retrieval missed the actual recognition passage.
  - **answer** [major] Broken markdown, and the reply again implies there is no recognition passage.
- T5 *compare* (7.8 s, topic, history 8): That's more comforting than I expected, especially "the Kingdom is the world of vision where all the concealed realities will become disclosed." How does that c
  - **answer** [major] The links are nested and contradict each other: the quotation points to Tablets of 'Abdu'l-Bahá while the inner link names Bahá'í World Faith.
  - **answer** [minor] The reply contradicts turns 1 and 4 without acknowledging it, and the Gatha verse used is not about the afterlife.
  - **answer** [minor] The Shoghi Effendi passage, from Dawn of a New Day, isn't labelled as a letter written on his behalf.

Top fixes:
- For grief and afterlife topics, rewrite the search to concept terms ('souls recognize each other after death') instead of embedding the raw emotional message. That would have surfaced the 'Abdu'l-Bahá tablet in turn 1.
- Don't treat a reader's paraphrase of Anís's earlier words as a literal quote to search for (turn 4). Treat it as a topic search instead.
- Check reply markdown for nested or broken links and cut-off quotations before sending, and never claim the texts are silent when the retrieval was simply weak.

## detachment-buddhism — skeptic (conv_b992e681-b2bd-4811-952e-91a2c2cb64ff)

Theme: detachment in the Bahá'í Writings, compared with non-attachment in Buddhism

**4/10 (judges 4 / 4, spread 0; defects 11 / 10)** — The first two turns give real, linked Bahá'í texts on detachment, but the Buddhist half falls apart: Turn 3 shows one fragment twice as if it were two passages, Turn 4 never names the sutra, and Turn 5 answers a question about a Pali sutta with an Arabic word study of tajarrud.

- T1 *opening* (12.1 s, topic, history 0): Hello. I've read that the Bahá'í Writings put a lot of weight on "detachment," and I'm trying to work out whether it's really the same thing as Buddhist non-att
  - **answer** [minor] The quotation from 'He who knoweth' is linked to the work page, not to its paragraph, and the quoted wording does not appear in the surfaced snippet.
  - **retrieval** [minor] No writing by 'Abdu'l-Bahá himself was surfaced, only a pilgrim note, even though the reader asked for 'Abdu'l-Bahá's own words. No Shoghi Effendi letters were searched before Anís declared there was no authorized interpretation.
- T2 *reference* (8.0 s, define, history 2): That third one, "not meant giving away and depleting all one's wealth", is interesting, but what does it say detachment *is* if not that? Does the passage give 
  - **answer** [minor] Anís presents the 'positive definition' as something the passage 'goes on' to give, but it is the same phrase he already quoted in Turn 1. He adds no fuller context from the commentary.
- T3 *exact_quote* (13.9 s, quote, history 4): The Sutra Collection line about "the absence of attributes indicates negation" reads like a fragment of an argument, and I can't tell whether it's about virāga 
  - **answer** [major] The same fragment is shown twice as 'two matching passages'. No fuller passage is given, and the sutra or section is never identified.
  - **answer** [major] Anís asserts without evidence that the fragment is part of a dialectical inquiry into virāga. He also never says that he did not make the 'deconstruction of clinging' claim in this conversation.
  - **retrieval** [minor] The Buddhist source is mislabelled with the tradition [Baha'i].
- T4 *absent* (9.0 s, quote, history 6): So you can't give me the fuller passage or a location, and your own earlier claim about Buddhist texts "deconstructing clinging itself" rests on a fragment you 
  - **follow_up_context** [minor] The search query reused the old Turn 3 phrase instead of the new request for the Buddha's own definition of virāga.
  - **answer** [major] No sutra name or number is given, though the reader asked for one. Anís also does not address the reader's challenge to the earlier claim, and does not say whether the passage uses the word virāga.
- T5 *pushback* (4.3 s, define, history 8): You say this passage shows "the systematic release of specific supports... whose cessation brings an end to becoming," but the text itself only poses a rhetoric
  - **strategy** [critical] A pushback about a Buddhist passage was routed to a 'define' term study of the Arabic word tajarrud in Gleanings, which has nothing to do with the question.
  - **answer** [major] Anís concedes a gloss he never made in this conversation. He then bluffs about whether the word appears instead of checking.
  - **answer** [minor] The term study contradicts itself: the summary rendering does not match the table.

Top fixes:
- When a follow-up pushes back on a passage from another tradition, never route it to the Arabic term-study (define/term_study) strategy. Re-open the passage that was cited and check its exact words.
- Remove duplicate quotations (same paragraph ID) before writing the reply. When asked for a 'fuller passage', fetch the neighbouring paragraphs and name the sutta/section, or say plainly that the library cannot.
- In replays and pushback turns, check whether Anís actually said the claim the reader is challenging before conceding or defending it.

## equality-sexes — scholar (conv_c1a4d6ce-0d79-41c9-81c3-1c586ac209ff)

Theme: the equality of women and men, and how it squares with the membership of the Universal House of Justice

**4/10 (judges 4 / 4, spread 0; defects 9 / 11)** — Turn 1 starts from the right primary texts, but the conversation then falls apart. Turn 2 takes back the 1947 date Anís had just given. Turn 3 wrongly says the Aqdas has nothing relevant, ignoring its own "O ye Men of Justice!" passage. Later turns never correct either error.

- T1 *opening* (5.5 s, topic, history 0): Hello Anís. I'm trying to understand how the Bahá'í principle of the equality of women and men is reconciled with the restriction of Universal House of Justice 
  - **answer** [major] Authority error: a Universal House of Justice letter is presented under 'Authorized Interpretation'.
  - **answer** [minor] Some citations have no links, and an editorial footnote is presented as Bahá'u'lláh's own text.
- T2 *reference* (12.2 s, quote, history 2): That second passage worries me: you attribute the "wisdom of it will be fully revealed in the future" line to Shoghi Effendi explaining a Tablet, yet cite *Unco
  - **follow_up_context** [major] The search ran on a phrase the reader misattributed, not on the passage he was asking about.
  - **answer** [major] The reply takes back the date it gave in turn 1, and fails to say the words are a secretary's although the source shows that.
- T3 *compare* (11.3 s, topic, history 4): Your two replies now attribute that "wisdom" line differently: first to 'Abdu'l-Bahá via Shoghi Effendi, then to Bahá'u'lláh. Setting that aside, how does the p
  - **retrieval** [major] The relevant Aqdas passages were not retrieved; irrelevant ones came back, including an Islamic rijál dictionary.
  - **answer** [critical] Bluff: says the Aqdas contains nothing explicit that bears on the membership.
- T4 *deepen* (20.5 s, quote, history 6): You quote Bahá'u'lláh's phrase «O ye men of the House of Justice!» from *Abdu'l-Bahá in Egypt* by Sohrab, but what is the original term behind "men" there, and 
  - **selection** [major] Ignored the surfaced Aqdas passage 'O ye Men of Justice!' and the Egypt source naming 'the Book of Aqdas'. Did not correct the turn-3 claim.
  - **latency** [minor] 20.5 s, over the 15 s limit.
- T5 *absent* (6.0 s, fact, history 8): Since Momen's study gives *rijál-i bayt-i 'adl-i iláhí*, is there a passage where 'Abdu'l-Bahá or Shoghi Effendi explicitly states the reason for confining memb
  - **selection** [minor] Left out the Shoghi Effendi letter, the Momen passage on rijál-i bayt-i 'adl-i iláhí, and the Corinne True Tablet as a Tablet with a known recipient. Did not note that it had not cited Momen earlier.

Top fixes:
- When a reader quotes a phrase Anís never said, don't search on it. Plan the follow-up around the passages from the earlier turn, using history_turns to recover the referent.
- Add a consistency check against earlier replies, so a date or claim from one turn isn't contradicted later without acknowledgement. When later sources refute an earlier claim, correct it explicitly (e.g. the Aqdas ¶52 'Men of Justice').
- Block claims that a text 'does not contain' something when retrieval returned 0 relevant passages. Retrieve the Aqdas paragraphs directly when the Aqdas is asked about, and label UHJ letters as guidance, never as interpretation.

## return-iqan — study_leader (conv_c701036a-07b2-4063-a7d7-a0cda0600783)

Theme: what the Kitáb-i-Íqán means by the "return" of the Prophets

**2/10 (judges 2 / 2, spread 0; defects 10 / 12)** — Across five turns, Anís never surfaced one Kitáb-i-Íqán passage on the return of the Prophets. He credited a scholar's words to Bahá'u'lláh and pointed a study leader to irrelevant tablets.

- T1 *opening* (12.5 s, topic, history 0): Hello Anís, I'm preparing a study session on the Kitáb-i-Íqán and want to focus on what it means by the "return" of the Prophets, like how John the Baptist is E
  - **retrieval** [critical] No Íqán passages on return were retrieved for a request explicitly about the Íqán. Sources were the Epistle to the Son of the Wolf (the Point's supplication), Isolated Letters commentaries, and Four Valleys.
  - **answer** [major] Authority/attribution error: Michael Sours's explanatory sentence is presented as Bahá'u'lláh's.
  - **answer** [minor] The Epistle passage about the Point's supplication has nothing to do with return. The 'how they connect' request got only a generic sentence.
- T2 *reference* (11.4 s, quote, history 2): The four lines you mentioned didn't come through on my end, only the summary after them. Could you send them again with where each one is found? I'd like to ope
  - **strategy** [major] A request to resend the earlier lines was planned as an exact-quote search on the reader's own sentence. The search query is the message repeated three times.
  - **answer** [major] The reply falsely says the turn-1 lines were not displayed, contradicting turn 1. It then asks the reader to supply wording.
- T3 *exact_quote* (10.3 s, quote, history 4): I can narrow it down: I want the Íqán passage where it says the Prophets are all one reality, the "single, enduring divine light" you mentioned in your summary.
  - **follow_up_context** [major] The phrase 'single, enduring divine light' was never said in this run. Anís didn't say so, and the planner searched that paraphrase as an exact quote instead of searching the topic in the Íqán.
  - **retrieval** [major] The only result was an irrelevant opening line of the Tablet of All Food, which the reply then quoted anyway.
- T4 *pushback* (5.3 s, quote, history 6): Two things in that last reply don't sit right with me: you said the quote is "drawn from the Kitáb-i-Íqán" yet placed it at Gleanings paragraph 148, and earlier
  - **answer** [major] The reply did not address the pushback directly: it never said that Anís had not cited Gleanings 148, or that 'single, enduring divine light' is a paraphrase, not Íqán wording. The 'drawn from the Kitáb-i-Íqán' phrase was again searched as a literal quote.
- T5 *deepen* (4.3 s, original, history 8): You quoted 'Abdu'l-Bahá saying Bahá'u'lláh gave a "lengthy and detailed explanation" of the return of the Prophets, so what does "return" actually mean in that 
  - **selection** [major] SAQ 'The Return of the Prophets' was retrieved, but its explanation of what return means was not used. The reply only restates that the Íqán explains it.
  - **retrieval** [minor] The Persian original surfaced only its 'سؤال' heading, not the passage containing the term.

Top fixes:
- When a request names a work (Kitáb-i-Íqán), restrict retrieval to that work and search the topic within it. Treat failing to retrieve a core Writing as an error, not a reason to say the library lacks it.
- Stop running exact-quote searches on reader prose or Anís's own paraphrases. A follow-up asking to re-send earlier lines or to verify them should resolve against the earlier turn's sources and say plainly whether the phrase was ever Anís's.
- Take attribution from the author of the passage, not the book-level metadata, so a scholar's text (Sours) is never labelled as Bahá'u'lláh. When an answer chapter is retrieved (SAQ chapter 33), use its explanatory paragraphs.

## golden-rule — non_native (conv_6078945b-5a41-4da9-9dda-f14e682a79cc)

Theme: the Golden Rule across the world's scriptures, and where the Bahá'í Writings state it

**3/10 (judges 3 / 3, spread 0; defects 10 / 10)** — Anís never shows the reader where Bahá'u'lláh states the Golden Rule. Turn 1 names the Tablet of Aḥmad and the Hidden Words without a quotation, then leans on a Townshend passage linked to the Gospel of Luke. Turn 2 confirms a "Summons" passage he never quoted, and turn 4 refuses a comparison while the Luke text was already retrieved.

- T1 *opening* (7.3 s, quote, history 0): Hello Anís. I am looking for the Golden Rule in many religions, like "do to others what you want for yourself". Where Bahá'u'lláh say this in the Bahá'í Writing
  - **retrieval** [critical] No passage by Bahá'u'lláh stating the Golden Rule was retrieved, even though the question asked for exactly that.
  - **answer** [major] He claims, without a quotation, that the Tablet of Aḥmad and the Hidden Words are where Bahá'u'lláh 'most famously' states the principle.
  - **answer** [major] Authority error and wrong link: a scholar's line (Townshend) stands in for the Bahá'í Writings, and its link points to the Gospel of Luke.
  - **answer** [minor] The Golden Rule texts of the other traditions are named but never quoted. One citation is an unlinked bracket reference, and the Tao Te Ching link has no paragraph.
- T2 *reference* (4.8 s, fact, history 2): This passage you just quoted is very clear, thank you. Is it also in the Hidden Words, or only in this Summons?
  - **follow_up_context** [major] The search ran on the raw reader message with no referent. He never says he had not quoted the Summons passage in this conversation.
  - **answer** [major] The citation is a bahai-library Qur'an index page, not the Summons text, and no quotation is given.
- T3 *source* (5.8 s, quote, history 4): Wait, you say this is in the Hidden Words, but under the quote I see *Prayers and Meditations*. Which book is it really from, and what is the number or page of 
  - **answer** [minor] He denies naming the Hidden Words, though turn 1 named it for the Golden Rule. The same quotation is repeated as 'the passage that settles it'. He does not point out that the reader's 'O Son of Spirit' heading is actually 'O Children of Men'.
- T4 *compare* (14.7 s, topic, history 6): OK, now I understand it is Hidden Words, but the number is still not clear for me. You said the passage is quoted in *The Earth Is But One Country*. How does th
  - **selection** [major] He refuses the comparison even though Luke 6:31 was retrieved in turn 1. He then fills the reply with irrelevant 'voices' (Mámáqání in God Passes By, 'seeming fair yet inwardly foul').
  - **follow_up_context** [minor] Planned as a topic search over the raw message, without carrying forward the Luke text or HW 68.
- T5 *deepen* (3.5 s, original, history 8): You say the Bahá'í text is "ontological" and talks about "same substance". What is the original word in Arabic or Persian for this, and where else in the Writin
  - **retrieval** [minor] No search for other uses of the term, so 'where else' gets nothing.

Top fixes:
- For a 'where does Bahá'u'lláh say X' quote request, put Bahá'u'lláh's Writings first in retrieval (Gleanings/Summons passages on 'lay not on any soul a load'). Block naming works as sources unless a retrieved passage supports the claim.
- Rewrite follow-up search queries with the referent from history, and have the answer step check whether a referenced passage was actually said in this conversation before confirming it.
- Check every link against the work it names (Townshend linked to Luke, an index page standing in for the Summons). For compare requests, reuse texts retrieved in earlier turns instead of answering 'sources do not settle'.

## 004-soul-reincarnation — skeptic (conv_dfa39106-0af4-43e0-a413-b48d318aff0a)

Theme: The Bahá'í Soul, Buddhist Anatta, and the Limits of Both/And

**4/10 (judges 4 / 4, spread 0; defects 12 / 14)** — Anís quotes real texts in places, but the conversation keeps failing the skeptic on exactly what he asks for: the opening reply is a broken fragment, he gives in on a claim he never made in turn 3, and in turn 5 he leaves out the full Gleanings passage he was asked for while linking Rāmānuja to the wrong work.

- T1 *opening* (11.9 s, topic, history 0): How does the Bahá'í concept of the soul differ from the Hindu and Buddhist concepts of reincarnation? I want a sharp answer — not 'all religions teach about the
  - **answer** [critical] The reply is a garbled fragment: a broken markdown link with no opening quotation and no real comparison.
  - **selection** [major] Shoghi Effendi's letter was the top source but went unused; the reply relied on Getsinger's secondhand report instead.
  - **strategy** [major] A three-way comparison was run as one topic search. No Hindu or Buddhist scripture was searched, and the reply then claimed the library has none.
- T2 *reference* (9.2 s, topic, history 2): That passage says the Bahá'ís accept a "return of the attributes and qualities" but not of "the essence or the reality of things" — but what does that distincti
  - **answer** [major] 'Abdu'l-Bahá's words are credited to a secondary book. They are also applied to epistemology when the question was about ontology.
  - **retrieval** [major] SAQ ch. 81 on reincarnation, where 'Abdu'l-Bahá explains the return of qualities (last year's flower, last night's lamp), was not surfaced. No Buddhist texts were searched either.
- T3 *pushback* (14.4 s, quote, history 4): You say the distinction is that individual identity and "the essence or the reality of things" "remain distinct and do not return" — but the Shoghi Effendi pass
  - **strategy** [major] The quote strategy searched for Anís's supposed phrase 'remain distinct and do not return'. That is not a text in the library, so it retrieved nothing and surfaced only a Tao Te Ching line.
  - **answer** [major] He concedes a claim he never made this run, and gives no quote at all.
- T4 *compare* (8.2 s, topic, history 6): You cite Shoghi Effendi's line that the soul keeps "developing and unfolding and returning towards its Creator" while rejecting return to new bodies. How does t
  - **selection** [minor] The Advaita position is stated without quoting any Hindu scripture, though Vedānta sources were surfaced.
  - **answer** [minor] An unsourced claim is added as if it were textual.
- T5 *exact_quote* (8.1 s, quote, history 8): You quote Bahá'u'lláh that the soul "will continue to progress until it attaineth the presence of God," but that's one sentence, and you cited Gleanings twice w
  - **strategy** [major] The turn asked for two passages, but the plan extracted only the Rāmānuja phrase. Gleanings was never retrieved, though it was a turn-4 source.
  - **answer** [critical] The full Gleanings passage and its link, the reader's main request, are missing. The reply also claims Arabic wording it has not shown.
  - **answer** [major] The Rāmānuja quotation links to the wrong work, with no paragraph anchor.

Top fixes:
- For comparative questions, search each named tradition's own scripture before saying the library lacks it (Buddhist texts on anattā, Upanishads/Gita on ātman), and fix the output check so broken markdown fragments like turn 1 cannot ship.
- When a turn asks for several exact passages, extract every requested quote as its own phrase and reuse earlier-turn sources. Never put Anís's own (or claimed) words into a quote search; check them against the history and say plainly what he did not say.
- Validate links against the work named (no Rāmānuja link pointing to hymns-of-atharva-veda), and credit quotations to their original author, not the secondary book that cites them.

## seed-21 — scholar (conv_1cf14b8d-8f98-44a2-a40d-7b5af938ff2c)

Theme: Evil — Privation, Active Force, or Necessary Shadow?

**4/10 (judges 4 / 4, spread 0; defects 8 / 10)** — Turn 1 is a solid, well-linked answer, but every precise question the scholar asked afterwards (the SAQ chapter and translator, the Persian term, Enchiridion 11 and Ennead I.8, the Persian pushback) got a non-answer, an off-target substitute or a repeat of an earlier passage.

- T1 *opening* (10.7 s, topic, history 0): Do the Bahá'í writings handle evil as the mere privation of good (Augustinian), as an active force, or as a necessary shadow that makes good visible?
  - **selection** [minor] Ignored the surfaced Arabic Tablet that names the original term, and did not address the 'necessary shadow' option.
- T2 *reference* (14.5 s, original, history 2): Regarding the first one you quoted: is that actually from Some Answered Questions, and which chapter and whose translation? I'd also like to know whether 'mere 
  - **strategy** [major] An 'original' hunt was launched on the raw question and returned only texts by the Báb. Nothing about SAQ was retrieved.
  - **answer** [major] Confused, inaccurate account of the gap: it talks about Tablets of 'Abdu'l-Bahá when the reader asked about SAQ. It also ignores the Arabic امر عدمی already surfaced in turn 1.
- T3 *compare* (8.8 s, topic, history 4): You said evil is "much as cold is the absence of heat or darkness the absence of light." How does that compare with Augustine's formulation in the Enchiridion (
  - **retrieval** [major] The Enchiridion and Ennead I.8 were not retrieved, and the reply did not say whether the library holds them. City of God was substituted.
  - **answer** [minor] Augustine links point to the whole ebook, and the comparison drops the Bahá'í side the reader asked about.
- T4 *source* (5.4 s, quote, history 6): That last quotation about change and transformation, "if change and transformation does not exist, then there can be no composition and growth", you attribute t
  - **answer** [minor] Kept the odd 'US Bahá’í News Service' author credit without comment. Did not note that the URL indicates volume 8, or that this is a reported saying.
- T5 *pushback* (12.9 s, quote, history 8): The Persian you quoted reads «ترکیب و تربیت اشیا» (*tarkīb va tarbiyat*, "composition and training/nurture"), not "growth", and its subject is *aḍdād* (opposite
  - **follow_up_context** [minor] Search query was a garbled splice of the reader's sentences; nothing new was retrieved.
  - **answer** [major] Answered the pushback by repeating the same English quotation, without a link. It neither conceded nor checked the Persian, and it asserted an unsupported 'published together under that heading'.

Top fixes:
- For citation-detail questions (chapter, translator, original term), route to source metadata and the original-language text of the work already cited (SAQ ch. 74 → Mufávaḍát), not a generic 'original' hunt that lands on the Báb.
- When the reader pushes back, retrieve the original-language text and concede or hold with evidence. Block any answer that only repeats the previous turn's quotation.
- When a named work is asked for (Enchiridion, Ennead I.8), say whether the library holds it before offering substitutes, and enforce paragraph-level links (no whole-ebook Gutenberg URLs).

## seed-39 — study_leader (conv_a32c2624-71ba-4a36-8ce1-5eef2afc7bfa)

Theme: What Did the Báb's Bayán Actually Teach?

**2.5/10 (judges 2 / 3, spread 1; defects 9 / 9)** — Asked over four turns where the phrase "accept, reject or modify as He chose" comes from, Anís never named John Walbridge's commentary, even though it was in his sources every time. Instead he gave the reader a Spanish line she had rejected, credited the phrase to Bahá'u'lláh, made up a "Váḥid 2, Gate 19" reference, and skipped both the Kitáb-i-Aqdas passage and the Báb's own words, which retrieval had found.

- T1 *opening* (10.0 s, topic, history 0): The Báb's Bayán contains laws and teachings that Bahá'u'lláh subsequently abrogated or fulfilled. What was the Bayán actually teaching, and how should a Bahá'í 
  - **answer** [minor] The Bahá'u'lláh quotation has no link.
  - **retrieval** [major] No text by the Báb was surfaced. Only two provisional minor tablets came up, so the reply cannot say what the Bayán taught.
- T2 *reference* (7.7 s, source, history 2): That second quote about the Báb's laws being a gift that Bahá'u'lláh could "accept, reject or modify as He chose" is something I could read aloud to the group, 
  - **answer** [major] Wrong author label, a truncated fragment offered as the quotation, and no statement that the phrase is a commentator's paraphrase rather than Aqdas text.
  - **strategy** [major] The 'source' plan answered only the first half of the question. The Báb's own words were never searched.
- T3 *absent* (13.2 s, quote, history 4): That Spanish line, "Él hace lo que desea y ordena lo que Le place", isn't the "accept, reject or modify" wording I asked about, so I still don't have a source f
  - **strategy** [major] The reader's rejected Spanish line was treated as the quotation to find, so he gave her back what she had just said was not her question.
- T4 *exact_quote* (11.0 s, quote, history 6): Anís, you've now given me that same Spanish line twice and it still doesn't answer what I asked. Back in your first reply you quoted the Aqdas as saying the Báb
  - **answer** [critical] Invented location for the passage, and the phrase credited to Bahá'u'lláh when it is Walbridge's.
  - **selection** [major] Ignored the Kitáb-i-Badí' source in which Bahá'u'lláh quotes the Báb ('Point of the Bayán') as making everything depend on the will of Him Whom God shall make manifest, who may confirm or abrogate the earlier laws. This is the 'Báb's own words' the reader asked for.
- T5 *pushback* (14.7 s, topic, history 8): In your first reply you put "accept, reject or modify as He chose" in quotation marks and attributed it to the Kitáb-i-Aqdas, but the passage you just gave me s
  - **answer** [major] Did not answer 'whose?' and did not own his earlier misattribution. Repeated the Fountain of Wisdom passage for the third time.
  - **selection** [major] Ignored the actual Kitáb-i-Aqdas passage on the Báb's laws, which was in the sources.

Top fixes:
- When the reader asks where a quotation comes from, answer from the source record's real author: map the '6986' id to Walbridge, and say 'commentary, not scripture'. Block made-up location claims such as 'noted by scholars' unless a source supports them.
- If the reader quotes a line in order to reject it, take it out of the search phrases and search for what she actually asked for (here, the Bayán's abrogation passage).
- Rank actual Aqdas paragraphs and the Báb's own words (including when Bahá'u'lláh quotes them) above repeating an earlier passage. Do not repeat a passage already given.

## seed-66 — non_native (conv_e8e03657-c5b0-4eba-875c-9f8873fe84f7)

Theme: What Did Bahá'u'lláh Do in the Síyáh-Chál?

**4.5/10 (judges 5 / 4, spread 1; defects 12 / 12)** — Anís found the key texts on the Síyáh-Chál (the Epistle "torrent" passage, the Maiden passage in Summons, Shoghi Effendi's Moses/Gabriel comparison), but he linked them to the wrong works, wrongly told the reader his library had no Moses/Hira comparison, and missed what the Maiden and the dream-voice said, even though those texts were among the sources.

- T1 *opening* (7.2 s, fact, history 0): Bahá'u'lláh was imprisoned in the Síyáh-Chál (Black Pit) of Tehran in 1852 — the moment of his revelation. What happened in that pit, and why does it matter tha
  - **answer** [major] Torrent passage attributed and linked to the wrong work
  - **answer** [major] An editorial footnote is attributed to 'Abdu'l-Bahá
  - **answer** [minor] Typo in the place name and an unlinked Aqdas footnote
  - **answer** [minor] The 'why does it matter' question is answered in one sentence
- T2 *reference* (15.3 s, topic, history 2): You said "the striking contrast" between the outside and the inside. Can you show me the passage where He Himself describes it, I mean the Maid of Heaven, not o
  - **answer** [minor] Denies a statement he had in substance made
  - **latency** [minor] Slightly over 15 s
- T3 *compare* (8.3 s, quote, history 4): You said the Maiden came "suspended in the air" with a "call which captivated the hearts." Is this like Muhammad and the angel Gabriel in the cave of Hira, or M
  - **strategy** [major] A comparison question was planned as a quote lookup on an earlier phrase, so the Moses/Gabriel text was never searched for
  - **answer** [major] False claim that the library lacks the comparison
  - **answer** [major] Bahá'u'lláh's words attributed to Taherzadeh; scholars cited without links
- T4 *absent* (7.8 s, fact, history 6): You said Shoghi Effendi links these experiences, and that Bahá'u'lláh was in "heavy chains." Can you give me the exact date when the Maid of Heaven first appear
  - **answer** [minor] Contradicts turn 3 silently and has link formatting errors
  - **selection** [minor] Missed the approximate dating that was available
- T5 *exact_quote* (10.4 s, quote, history 8): You said He recalls "the galling weight of the chains and the stench-filled air allowed Me but little sleep." Can you give me the full passage with the link, wh
  - **selection** [major] Says the texts don't say what followed, though sources had it

Top fixes:
- Rewrite follow-up queries with the referent and the reader's actual intent. A comparison question ('like Moses/Hira?') must not be planned as a quote lookup on an earlier phrase.
- Validate source metadata and links before writing. Do not use a KJV Apocalypse URL for a Bahá'u'lláh passage, do not attribute an editorial footnote to 'Abdu'l-Bahá, do not give a scholar Bahá'u'lláh's words, and block unlinked or broken-markdown citations.
- Before saying a text is absent, check every surfaced source for it (e.g. Messages to America para_599, Buck), and when a later turn contradicts an earlier one, say so plainly.

## seed-93 — seeker (conv_1f2a75c6-7145-4817-aa7a-febe91ed862c)

Theme: What Did 'Abdu'l-Bahá Mean by 'The Most Great Justice'?

**2.5/10 (judges 3 / 2, spread 1; defects 11 / 10)** — After two fair opening turns, Anís falls apart under pushback. He makes up where a phrase came from, says he can't find the Tablet to the Hague passage he had already linked twice, and ends by contradicting himself and crediting the line to a secondary book's abbreviation page.

- T1 *opening* (8.9 s, topic, history 0): 'Abdu'l-Bahá speaks of 'the Most Great Justice' as a foundation of the new world order. Is this distributive justice, retributive justice, or something more lik
  - **retrieval** [major] The central 'Abdu'l-Bahá text on justice as the foundation of existence was not surfaced, so the distributive/retributive question goes unanswered.
  - **answer** [minor] Fragmentary and out-of-context quotations, and whole-document links.
- T2 *reference* (6.4 s, define, history 2): The second one you quoted, about things being "in disorder and remain imperfect" until these are realized, makes me wonder what "these" actually refers to there
  - **answer** [minor] Original Arabic terms are asserted without any source, and a line about one individual is generalised.
  - **answer** [minor] Daily-life counsel is credited to scholarship when the quoted words are Bahá'u'lláh's.
- T3 *pushback* (8.7 s, quote, history 4): You said "these" refers directly to "justice and right," but is that actually what the Tablet to the Hague says, or are you reading it in? And the line about ju
  - **strategy** [major] The pushback was planned as a quote search for a phrase Anís did not use this time, and the first half of the question was dropped.
  - **answer** [critical] Anís made up where the phrase came from, tying it to a Covenant-breaking letter.
- T4 *exact_quote* (10.7 s, quote, history 6): That quote about the "pole of justice, and not of forgiveness" is striking, but you cited *The Pattern of Baha'i Life*, which doesn't sound like 'Abdu'l-Bahá's 
  - **follow_up_context** [major] The search followed the incidental quoted phrase, not the actual request (the exact Hague words with a link).
  - **answer** [major] Says nothing was found for a passage already cited in turns 1–2.
- T5 *source* (16.4 s, quote, history 8): You called that line "the original words of 'Abdu'l-Bahá" but still credited it to *The Pattern of Baha'i Life*, so who actually said it, and in which book, tab
  - **strategy** [major] Searched the meta-phrase 'the original words of 'Abdu'l-Bahá' and got 1 irrelevant source, the abbreviation list.
  - **answer** [critical] Answers about the wrong line, contradicts earlier turns, and credits a secondary book.
  - **latency** [minor] Slow turn.

Top fixes:
- Before searching a follow-up, resolve it against passages already cited in the conversation (e.g. reuse Hague para_31). Never say 'not found' for a text already linked in an earlier turn.
- For pushback about something Anís supposedly said, check the transcript. If he didn't say it, say so plainly; never invent where a phrase came from.
- Stop treating meta-phrases from the reader's message ('the original words of…', 'the very air…') as quote searches. Pull out the actual passage in question and look up where it comes from.

## Perplexity comparison (sources)

50 turns compared (50 Perplexity answers, 0 Perplexity failures, 0 judge failures). Winner: Anís 7 · Perplexity 40 · tie 1 · neither 1.
Cost: Perplexity $0.2752 ($0.0055/turn, p50 5351 ms), comparison judge $3.9603 ($0.07921/turn).

### Missed but in the library (106) — Anís retrieval/selection defects

- soul-after-death T1: **The Bible — 1 Thessalonians** (Paul) [book] → 1 Thessalonians (doc 20970, by title)
  - checked: find-document "The Bible — 1 Thessalonians" → 2 Thessalonians (20975); 1 Thessalonians (20970)
- soul-after-death T1: **The Bible — 1 Corinthians** (Paul) [book] → 1 Corinthians (doc 20967, by title)
  - checked: find-document "The Bible — 1 Corinthians" → 1 Corinthians (20967)
- soul-after-death T1: **The Bible — Revelation** (John) [book] → Revelation (doc 20986, by title)
  - checked: find-document "The Bible — Revelation" → Tag: Book of Revelation (Bible) (288114); Progressive Revelation: The Bible and Baha'u'llah (355302); Tag: Book of Revelation (Bible) (643699)
- soul-after-death T2: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶334 coverage 1.00
- soul-after-death T2: **Bahá'u'lláh and the New Era** (J.E. Esslemont) [book] → Bahá’u’lláh and the New Era (doc 20813, by title)
  - checked: find-document "Bahá'u'lláh and the New Era" → Bahá’u’lláh and the New Era (20813); Bahá’u’lláh and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (125); Baha'u'llah and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (27740) | phrase search → Bahá’u’lláh and the New Era (20813) ¶891 coverage 1.00
- soul-after-death T2: **Family Life** (Compilation of the Research Department) [compilation] → Family Life (doc 945911, by title)
  - checked: find-document "Family Life" → Family Life (945911); Family Life (22250); Family Life (22688)
- soul-after-death T2: **Memorials of the Faithful** ('Abdu'l-Bahá) [book] → Memorials of the Faithful (doc 20907, by title)
  - checked: find-document "Memorials of the Faithful" → Memorials of the Faithful (20907); Memorials of the Faithful: Ḥájí Muḥammad-Riḍá-yi-Shírází (921842); Memorials of the Faithful: Ḥájí Faraju'lláh Tafríshí (921828)
- soul-after-death T3: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- soul-after-death T3: **Bahá'u'lláh and the New Era** (J. E. Esslemont (quoting 'Abdu'l-Bahá)) [book] → Bahá’u’lláh and the New Era (doc 20813, by title)
  - checked: find-document "Bahá'u'lláh and the New Era" → Bahá’u’lláh and the New Era (20813); Bahá’u’lláh and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (125); Baha'u'llah and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (27740) | phrase search → Bahá’u’lláh and the New Era (20813) ¶891 coverage 1.00
- soul-after-death T3: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title)
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679)
- soul-after-death T3: **The Seven Valleys** (Bahá'u'lláh) [book] → The Seven Valleys (doc 925289, by title)
  - checked: find-document "The Seven Valleys" → The Seven Valleys (925289); Seven Valleys (984296); Seven Valleys (984305)
- soul-after-death T3: **The Bhagavad Gita** (attributed to Vyasa) [book] → The Bhagavad-Gita (doc 21038, by title)
  - checked: find-document "The Bhagavad Gita" → The Bhagavad Gita (in The Bhagavad Gita (Song Celestial, tr. Edwin Arnold), paragraphs 12-undefined) (17365); The Bhagavad-Gita (21038); Bhagavad-Gita and the Baha'i Faith (282917)
- soul-after-death T4: **Tablets of 'Abdu'l-Bahá Abbas** ('Abdu'l-Bahá) [tablet] → Tablets of `Abdu'l-Bahá Abbas (doc 334708, by title)
  - checked: find-document "Tablets of 'Abdu'l-Bahá Abbas" → Tablets of `Abdu'l-Bahá Abbas (334708); Tablets of ‘Abdu’l-Bahá ‘Abbás vol. 1-3 (20915); Tablets of ‘Abdu’l-Bahá ‘Abbás vol. 1 (624661) | phrase search → Bahá’í World Faith (‘Abdu’l-Bahá section) (20902) ¶424 coverage 1.00
- soul-after-death T4: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title) — was in Anís's sources
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Bahá’í Sacred Writings (20777) ¶339 coverage 0.64
- soul-after-death T4: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title) — was in Anís's sources
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- detachment-buddhism T1: **The Hidden Words of Bahá'u'lláh** (Bahá'u'lláh) [book] → The Hidden Words of Bahá’u’lláh (doc 20809, by title) — was in Anís's sources
  - checked: find-document "The Hidden Words of Bahá'u'lláh" → The Hidden Words of Bahá’u’lláh (20809); 隐言经 (Hidden Words of Baha'u'llah) (28629); 隐言经 (Hidden Words of Baha'u'llah) (22143) | phrase search → Bahá’í Sacred Writings (20777) ¶576 coverage 1.00
- detachment-buddhism T1: **The Seven Valleys** (Bahá'u'lláh) [book] → The Seven Valleys (doc 925289, by title)
  - checked: find-document "The Seven Valleys" → The Seven Valleys (925289); Seven Valleys (984296); Seven Valleys (984305) | phrase search → The Call of the Divine Beloved (20808) ¶124 coverage 0.63
- detachment-buddhism T1: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [compilation] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title) — was in Anís's sources
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Bahá’í Sacred Writings (20777) ¶530 coverage 1.00
- detachment-buddhism T1: **Paris Talks** ('Abdu'l-Bahá) [book] → Paris Talks (doc 20908, by title)
  - checked: find-document "Paris Talks" → Paris Talks (20908); Paris Talks: Study Guide (23579); Paris Talks: Study Guide (28930)
- detachment-buddhism T2: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827) | phrase search → Bahá’í Sacred Writings (20777) ¶525 coverage 1.00
- detachment-buddhism T2: **Compilation on Detachment** (Bayat (compiler)) [compilation] → Compilation on Detachment (doc 40131, by title)
  - checked: find-document "Compilation on Detachment" → Compilation on Detachment (40131); Compilation on Detachment (22485); On the Misdeeds of Professed Believers as the Cause of Sorrow (926189)
- detachment-buddhism T3: **Upādāna Sutta: Clinging (Saṃyutta Nikāya 22.121)** (Buddha, tr. Ṭhānissaro Bhikkhu) [talk] → Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (doc 19374, by quote)
  - checked: find-document "Upādāna Sutta: Clinging" → Samyutta Nikaya 12.52 - Upadana Sutta: Clinging (19325); Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (19374) | documents?q → Samyutta Nikaya 12.52 - Upadana Sutta: Clinging (19325); Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (19374) | phrase search → Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (19374) ¶3 coverage 1.00
- detachment-buddhism T4: **Sutta Nipāta** (the Buddha (tr. John D. Ireland)) [book] → The Sutta Nipata (doc 20926, by title)
  - checked: find-document "Sutta Nipāta" → The Sutta Nipata (20926); Sutta Nipata 2.4 - Mangala Sutta (Protection with Blessing) (17273); Sutta Nipata 2.1 - Ratana Sutta (The Jewel Discourse) (17272) | phrase search → Sutra Collection (A, Part-2) (20929) ¶233 coverage 1.00
- detachment-buddhism T5: **Mahānidāna Sutta (Dīgha Nikāya 15)** (Pali Canon, tr. Ṭhānissaro Bhikkhu) [book] → Sutra Collection (M, Part-2) (doc 20934, by quote)
  - checked: find-document "Mahānidāna Sutta" → Digha Nikaya 15 - Mahanidana Sutta (The Great Causes Discourse) (17248) | documents?q → Digha Nikaya 15 - Mahanidana Sutta (The Great Causes Discourse) (17248) | phrase search → Sutra Collection (M, Part-2) (20934) ¶452 coverage 0.83
- detachment-buddhism T5: **Upādiyamāna Sutta (Saṃyutta Nikāya 22.63)** (Pali Canon, tr. Maurice Walshe) [book] → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (doc 19396, by quote)
  - checked: find-document "Upādiyamāna Sutta" → none | documents?q → none | phrase search → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (19396) ¶5 coverage 1.00
- equality-sexes T1: **Letter of the Universal House of Justice to the National Spiritual Assembly of New Zealand, 31 May 1988** (Universal House of Justice) [letter] → The Universal House of Justice (doc 20870, by quote) — was in Anís's sources
  - checked: find-document "Letter of the Universal House of Justice to the National Spi…" → none | documents?q → none | phrase search → The Universal House of Justice (20870) ¶32 coverage 1.00
- equality-sexes T1: **Women (compilation)** (Research Department of the Universal House of Justice) [compilation] → Messages of Shoghi Effendi to the Indian Subcontinent: 1923-1957 (doc 22168, by quote)
  - checked: find-document "Women" → Women in Religion (984427); Women of Consequence in the Life of the Báb (984064); Women and Development (967297) | documents?q → Women and Peace (983761); Women and the Broadcast Media: Legal Strategies for Enhancing the Portrayal of Women (967389); Women and Development (967297) | phrase search → Messages of Shoghi Effendi to the Indian Subcontinent: 1923-1957 (22168) ¶2029 coverage 1.00
- equality-sexes T1: **Letter of the Universal House of Justice to an individual, 22 December 2013** (Universal House of Justice) [letter] → The Universal House of Justice (doc 20870, by quote) — was in Anís's sources
  - checked: find-document "Letter of the Universal House of Justice to an individual, 2…" → none | documents?q → none | phrase search → The Universal House of Justice (20870) ¶351 coverage 1.00
- equality-sexes T2: **Women: Extracts from the Writings of Bahá'u'lláh, 'Abdu'l-Bahá, Shoghi Effendi and the Universal House of Justice** (Letter written on behalf of Shoghi Effendi) [compilation] → Women (doc 20874, by quote)
  - checked: find-document "Women: Extracts from the Writings of Bahá'u'lláh, 'Abdu'l-Ba…" → Women (20874) | documents?q → Women (20874) | phrase search → Women (20874) ¶76 coverage 1.00
- equality-sexes T2: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → Selections from the Writings of ‘Abdu’l-Bahá (doc 20910, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Selections from the Writings of ‘Abdu’l-Bahá (20910) ¶265 coverage 1.00
- equality-sexes T3: **Tablet of 'Abdu'l-Bahá to Corinne True (quoted in The Kitáb-i-Aqdas, Notes)** ('Abdu'l-Bahá) [tablet] → Women in the Bahá’í Faith (doc 14283, by quote)
  - checked: find-document "Tablet of 'Abdu'l-Bahá to Corinne True" → Words to Corinne True spoken in 1907 (provisional translation) (982152); Words to Corinne True spoken around 1912-Jun-17 (provisional translation) (982386); Words to Corinne and Arna True spoken in Feb. 1907 (provisional translation) (981162) | documents?q → Words to Corinne True spoken in 1907 (provisional translation) (982152); Words to Corinne True spoken around 1912-Jun-17 (provisional translation) (982386); Words to Corinne and Arna True spoken in Feb. 1907 (provisional translation) (981162) | phrase search → Women in the Bahá’í Faith (14283) ¶18 coverage 1.00
- equality-sexes T3: **The Kitáb-i-Aqdas: Notes** (Universal House of Justice (explanatory notes)) [book] → The Kitáb-i-Aqdas: Notes (doc 335503, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas: Notes" → The Most Holy Book (Kitáb-i-Aqdas) (16712); The Kitáb-i-Aqdas: Notes (335503); Kitáb-i-Aqdas: notes by Brent Poirier (217888)
- equality-sexes T3: **Women in the Bahá'í Faith** (Susan Stiles Maneck) [article] → Women in the Baha'i Faith (doc 21565, by title)
  - checked: find-document "Women in the Bahá'í Faith" → Women in the Baha'i Faith (21565); Women in the Baha'i Faith (159202); Women in the Bahá’í Faith (14283)
- equality-sexes T3: **Messages from the Universal House of Justice 1963-1986** (Universal House of Justice) [compilation] → Messages from the Universal House of Justice 1963-1986: Third Epoch of the Formative Age (doc 205, by title)
  - checked: find-document "Messages from the Universal House of Justice 1963-1986" → Messages from the Universal House of Justice 1963-1986: Third Epoch of the Formative Age (205); Messages from the Universal House of Justice 1963-1986: Third Epoch of the Formative Age (912406); Messages from the Universal House of Justice 1963-1986: Third Epoch of the Formative Age (913916)
- equality-sexes T4: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307)
- equality-sexes T4: **Questions and Answers (The Kitáb-i-Aqdas)** (Bahá'u'lláh) [book] → Questions and Answers 1950-51 (doc 168632, by title)
  - checked: find-document "Questions and Answers" → Questions and Answers 1950-51 (168632); Questions and Answers 1950-51 (853574); Questions and Answers on War and Related Issues (22707)
- equality-sexes T4: **Paris Talks** ('Abdu'l-Bahá) [book] → Paris Talks (doc 20908, by title)
  - checked: find-document "Paris Talks" → Paris Talks (20908); Paris Talks: Study Guide (23579); Paris Talks: Study Guide (28930)
- equality-sexes T5: **Women (compilation) — letter written on behalf of Shoghi Effendi, 28 July 1936** (Shoghi Effendi (secretary)) [letter] → Women (doc 20874, by quote) — was in Anís's sources
  - checked: find-document "Women (compilation) — letter written on behalf of Shoghi Eff…" → none | documents?q → none | phrase search → Women (20874) ¶76 coverage 1.00
- equality-sexes T5: **Letter written on behalf of Shoghi Effendi, 17 September 1952** (Shoghi Effendi (secretary)) [letter] → Directives from the Guardian (doc 20884, by quote)
  - checked: find-document "Letter written on behalf of Shoghi Effendi, 17 September 195…" → none | documents?q → none | phrase search → Directives from the Guardian (20884) ¶291 coverage 1.00
- return-iqan T1: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Bahá’í Sacred Writings (20777) ¶31 coverage 1.00
- return-iqan T1: **The Bible (Luke)** [book] → Every Eye Shall See: Bible Evidence for the Return of Christ (doc 967517, by quote)
  - checked: find-document "The Bible" → The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); Bible Prophecies (984297); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | documents?q → Bible Prophecies (984297); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | phrase search → Every Eye Shall See: Bible Evidence for the Return of Christ (967517) ¶168 coverage 1.00
- return-iqan T3: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → The Kitáb-i-Íqán (20810) ¶196 coverage 1.00
- return-iqan T4: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Divine Philosophy (7189) ¶1475 coverage 1.00
- return-iqan T4: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶99 coverage 1.00
- return-iqan T4: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [compilation] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶141 coverage 1.00
- return-iqan T5: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶98 coverage 1.00
- return-iqan T5: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → The Kitáb-i-Íqán (20810) ¶162 coverage 1.00
- golden-rule T1: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Summons of the Lord of Hosts (20806) ¶417 coverage 1.00
- golden-rule T1: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → The Bahá'í World: A Biennial International Record, Volume XI (103, 104, 105 and 106 B.E., 1946–1950 A.D.) (967539) ¶701 coverage 1.00
- golden-rule T1: **Epistle to the Son of the Wolf** (Bahá'u'lláh) [book] → Epistle to the Son of the Wolf (doc 20780, by title)
  - checked: find-document "Epistle to the Son of the Wolf" → Epistle to the Son of the Wolf (20780); Epistle to the Son of the Wolf (926338); Epistle to the Son of the Wolf (984437) | phrase search → The Revelation of Bahá’u’lláh vol. 4 (432) ¶1019 coverage 0.69
- golden-rule T1: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827) | phrase search → The Desire of the World (8277) ¶126 coverage 1.00
- golden-rule T2: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title) — was in Anís's sources
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679) | phrase search → The Hidden Words of Bahá’u’lláh (20809) ¶4 coverage 1.00
- golden-rule T2: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title) — was in Anís's sources
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679) | phrase search → Parallel Hidden Words in English (Early and Authorised) (15171) ¶42 coverage 1.00
- golden-rule T2: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title) — was in Anís's sources
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679)
- golden-rule T2: **The Heart of the Gospel** (George Townshend) [book] → The Heart of the Gospel (doc 7123, by title)
  - checked: find-document "The Heart of the Gospel" → The Heart of the Gospel (7123); Heart of the Gospel -- First edition (421); Heart of the Gospel: The Bible and the Baha'i Faith (324060)
- golden-rule T4: **The Holy Bible (King James Version), Gospel of Luke** [book] → The Bible (KJV), The Gospel of Luke (doc 20990, by quote)
  - checked: find-document "The Holy Bible (King James Version), Gospel of Luke" → The Gospel of Luke (20990) | documents?q → none | phrase search → The Bible (KJV), The Gospel of Luke (20990) ¶195 coverage 1.00
- golden-rule T5: **The Summons of the Lord of Hosts** (Bahá'u'lláh) [tablet] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711) | phrase search → Summons of the Lord of Hosts (20806) ¶450 coverage 1.00
- 004-soul-reincarnation T1: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- 004-soul-reincarnation T1: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- 004-soul-reincarnation T1: **Lights of Guidance** (Helen Hornby (comp.)) [compilation] → Lights of Guidance (doc 20804, by title)
  - checked: find-document "Lights of Guidance" → Lights of Guidance (20804); Lights of Guidance: A Bahá’í Reference File (8680); lights-of-guidance-000_en (609524)
- 004-soul-reincarnation T1: **Reincarnation, Rebirth and the Progress of the Soul** (Universal House of Justice Research Department) [compilation] → Reincarnation, Rebirth and the Progress of the Soul (doc 4669, by title) — was in Anís's sources
  - checked: find-document "Reincarnation, Rebirth and the Progress of the Soul" → Reincarnation, Rebirth and the Progress of the Soul (4669); Reincarnation, Rebirth and the Progress of the Soul (22219); Reincarnation, Rebirth and the Progress of the Soul (326594)
- 004-soul-reincarnation T1: **Bhagavad Gītā** [book] → The Bhagavad-Gita (doc 21038, by title)
  - checked: find-document "Bhagavad Gītā" → Bhagavad Gītā (in The Bhagavad Gita (Song Celestial, tr. Edwin Arnold), paragraphs 12-undefined) (17365); The Bhagavad-Gita (21038); Bhagavad-Gita and the Baha'i Faith (282917)
- 004-soul-reincarnation T1: **Dhammapada** [book] → The Dhammapada (doc 20925, by title)
  - checked: find-document "Dhammapada" → The Dhammapada (20925); Dhammapada (tr. Buddharakkhita) (17281); Dhammapada (tr. F. Max Mueller) (17245)
- 004-soul-reincarnation T1: **A Bahá'í Understanding of Reincarnation in Relation to the World's Faiths** (Bayat) [article] → A Baha'i Understanding of Reincarnation in Relation to the World's Faiths (doc 28922, by title)
  - checked: find-document "A Bahá'í Understanding of Reincarnation in Relation to the W…" → A Baha'i Understanding of Reincarnation in Relation to the World's Faiths (28922); A Baha'i Understanding of Reincarnation in Relation to the World's Faiths (810623); A Bahá’í Understanding of Reincarnation in Relation to the World's Faiths (14346)
- 004-soul-reincarnation T2: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097) | phrase search → Some Answered Questions: Study Guide (919097) ¶2926 coverage 1.00
- 004-soul-reincarnation T3: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- 004-soul-reincarnation T3: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → Selections from the Writings of 'Abdu'l-Baha: Study Guide (doc 919099, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Selections from the Writings of 'Abdu'l-Baha: Study Guide (919099) ¶4499 coverage 1.00
- 004-soul-reincarnation T3: **The Concept of Spirituality** (William S. Hatcher (Bahá'í World)) [article] → The Concept of Spirituality (doc 2258, by title)
  - checked: find-document "The Concept of Spirituality" → The Concept of Spirituality (2258); The Concept of Spirituality (22057); The Concept of Spirituality (40938)
- 004-soul-reincarnation T4: **Paris Talks** ('Abdu'l-Bahá) [talk] → Paris Talks (doc 20908, by title)
  - checked: find-document "Paris Talks" → Paris Talks (20908); Paris Talks: Study Guide (23579); Paris Talks: Study Guide (28930) | phrase search → Paris Talks (20908) ¶254 coverage 1.00
- 004-soul-reincarnation T5: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Bahá’u’lláh and the New Era (20813) ¶887 coverage 1.00
- seed-21 T1: **Lights of Guidance** (Helen Hornby (comp.)) [compilation] → Lights of Guidance (doc 20804, by title)
  - checked: find-document "Lights of Guidance" → Lights of Guidance (20804); Lights of Guidance: A Bahá’í Reference File (8680); lights-of-guidance-000_en (609524)
- seed-21 T2: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097) | phrase search → Some Answered Questions (20911) ¶686 coverage 1.00
- seed-21 T3: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title) — was in Anís's sources
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097) | phrase search → Some Answered Questions (20911) ¶686 coverage 1.00
- seed-21 T4: **The Promulgation of Universal Peace** ('Abdu'l-Bahá) [book] → The Promulgation of Universal Peace (doc 20917, by title)
  - checked: find-document "The Promulgation of Universal Peace" → The Promulgation of Universal Peace (20917); The Promulgation of Universal Peace: Study Guide (23577); The Promulgation of Universal Peace: Study Guide (28932) | phrase search → The Promulgation of Universal Peace (20917) ¶657 coverage 1.00
- seed-21 T5: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097) | phrase search → Some Answered Questions (20911) ¶686 coverage 1.00
- seed-39 T1: **Selections from the Writings of the Báb** (The Báb) [book] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607)
- seed-39 T1: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307)
- seed-39 T1: **Gate of the Heart: Understanding the Writings of the Báb** (Nader Saiedi) [book] → Gate of the Heart: Understanding the Writings of the Báb (doc 8632, by title)
  - checked: find-document "Gate of the Heart: Understanding the Writings of the Báb" → Gate of the Heart: Understanding the Writings of the Báb (8632); Gate of the Heart: Understanding the Writings of the Bab, by Nader Saiedi: Review (153157); Gate of the Heart: Understanding the Writings of the Bab, by Nader Saiedi: Review (163882)
- seed-39 T1: **Laws Abrogated by Bahá'u'lláh (compilation)** [compilation] → Laws Abrogated by Baha'u'llah (doc 919143, by title)
  - checked: find-document "Laws Abrogated by Bahá'u'lláh" → Laws Abrogated by Baha'u'llah (919143); Bahá’u’lláh, Abrogated Laws: Prohibition of Charging Interest (357319); Bahá’u’lláh, Abrogated Laws: Prohibition of Charging Interest (357321)
- seed-39 T2: **The Kitáb-i-Aqdas (Introduction)** (Bahá'u'lláh / Universal House of Justice (Introduction)) [book] → Kitáb-i-Aqdas (doc 924862, by title)
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → Fountain of Wisdom : Tablets of Bahá’u’lláh (20781) ¶298 coverage 0.94
- seed-39 T2: **Selections from the Writings of the Báb** (The Báb) [compilation] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607)
- seed-39 T3: **Selections from the Writings of the Báb** (The Báb) [book] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607) | phrase search → Selections from the Writings of the Báb (20898) ¶509 coverage 1.00
- seed-39 T3: **Gate of the Heart: Understanding the Writings of the Báb** (Nader Saiedi) [book] → Gate of the Heart: Understanding the Writings of the Báb (doc 8632, by title)
  - checked: find-document "Gate of the Heart: Understanding the Writings of the Báb" → Gate of the Heart: Understanding the Writings of the Báb (8632); Gate of the Heart: Understanding the Writings of the Bab, by Nader Saiedi: Review (153157); Gate of the Heart: Understanding the Writings of the Bab, by Nader Saiedi: Review (163882)
- seed-39 T4: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas (Tablet of Ishráqát)** (Bahá'u'lláh) [tablet] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title) — was in Anís's sources
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827) | phrase search → Fountain of Wisdom : Tablets of Bahá’u’lláh (20781) ¶298 coverage 1.00
- seed-39 T4: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307)
- seed-39 T4: **Sacred Acts, Sacred Space, Sacred Time** (John Walbridge) [book] → Sacred Acts, Sacred Space, Sacred Time (doc 23832, by title) — was in Anís's sources
  - checked: find-document "Sacred Acts, Sacred Space, Sacred Time" → Sacred Acts, Sacred Space, Sacred Time (23832); Sacred Acts, Sacred Space, Sacred Time (328596); Sacred Acts, Sacred Space, Sacred Time, by John Walbridge: Review (59574)
- seed-39 T5: **Sacred Acts, Sacred Space, Sacred Time** (John Walbridge) [book] → Sacred Acts, Sacred Space, Sacred Time (doc 23832, by title)
  - checked: find-document "Sacred Acts, Sacred Space, Sacred Time" → Sacred Acts, Sacred Space, Sacred Time (23832); Sacred Acts, Sacred Space, Sacred Time (328596); Sacred Acts, Sacred Space, Sacred Time, by John Walbridge: Review (59574) | phrase search → Kitáb-i-Aqdas: Excerpts from John Walbridge, "Sacred Acts..." (216888) ¶14 coverage 1.00
- seed-66 T1: **Epistle to the Son of the Wolf** (Bahá'u'lláh) [tablet] → Epistle to the Son of the Wolf (doc 20780, by title)
  - checked: find-document "Epistle to the Son of the Wolf" → Epistle to the Son of the Wolf (20780); Epistle to the Son of the Wolf (926338); Epistle to the Son of the Wolf (984437) | phrase search → Epistle to the Son of the Wolf (20780) ¶36 coverage 0.81
- seed-66 T1: **Bahá'u'lláh (statement of the Bahá'í International Community)** (Bahá'í International Community Office of Public Information) [article] → Bahá'u'lláh (doc 983065, by title)
  - checked: find-document "Bahá'u'lláh" → Bahá'u'lláh (983065); Bahá’u’lláh (445720); Bahá’u’lláh (445742)
- seed-66 T1: **The Dawn-Breakers** (Nabíl-i-A'ẓam (tr. Shoghi Effendi)) [book] → The Dawn-Breakers (doc 21308, by title)
  - checked: find-document "The Dawn-Breakers" → The Dawn-Breakers (21308); The Dawn-Breakers Movie (148915); The Dawn-Breakers Novel (148933)
- seed-66 T1: **The World Order of Bahá'u'lláh** (Shoghi Effendi) [book] → The World Order of Bahá’u’lláh (doc 20894, by title)
  - checked: find-document "The World Order of Bahá'u'lláh" → The World Order of Bahá’u’lláh (20894); World Order of Bahá'u'lláh (984028); The World Order of Bahá'u'lláh (2209605)
- seed-66 T3: **The Qur'an** [book] → Hayat Al-Qulub Vol.2 (doc 21051, by quote)
  - checked: find-document "The Qur'an" → The Qur'an and Its Exegesis (English translation of Koran und Koranexegese) (956266); The Qur'an (Arabic, Simple Text) (21381); The Qur'an (Arabic) (21380) | documents?q → Qur'anic Kerygma: Epic, Apocalypse, and Typological Figuration (919398); The Qur’anic Epic and the Creation of Humanity (984142); The Qur'an: The First Book in Arabic (Part 1 of 3) (984127) | phrase search → Hayat Al-Qulub Vol.2 (21051) ¶2124 coverage 1.00
- seed-66 T4: **The Summons of the Lord of Hosts** (Bahá'u'lláh) [tablet] → Summons of the Lord of Hosts (doc 20806, by title) — was in Anís's sources
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711) | phrase search → Summons of the Lord of Hosts (20806) ¶6 coverage 1.00
- seed-66 T4: **God Passes By** (Shoghi Effendi) [book] → God Passes By (doc 21310, by title) — was in Anís's sources
  - checked: find-document "God Passes By" → God Passes By (21310); God Passes By -- Study Guide (3782); God Passes By -- Study Guide (3788)
- seed-66 T5: **The Summons of the Lord of Hosts** (Bahá'u'lláh) [book] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711) | phrase search → Summons of the Lord of Hosts (20806) ¶6 coverage 1.00
- seed-93 T1: **The Promulgation of Universal Peace** ('Abdu'l-Bahá) [book] → The Promulgation of Universal Peace (doc 20917, by title)
  - checked: find-document "The Promulgation of Universal Peace" → The Promulgation of Universal Peace (20917); The Promulgation of Universal Peace: Study Guide (23577); The Promulgation of Universal Peace: Study Guide (28932) | phrase search → Star of the West (15198) ¶799 coverage 1.00
- seed-93 T2: **Tablets to The Hague** ('Abdu'l-Bahá) [tablet] → Tablets to the Hague (doc 20916, by title) — was in Anís's sources
  - checked: find-document "Tablets to The Hague" → Tablets to the Hague (20916); Lawh-i-Lahih - Tablet to the Hague (921704); Tablet to the Central Organization for a Durable Peace, The Hague (6945) | phrase search → Bahá’í Sacred Writings (20777) ¶1027 coverage 1.00
- seed-93 T2: **The Secret of Divine Civilization** ('Abdu'l-Bahá) [book] → The Secret of Divine Civilization (doc 20919, by title)
  - checked: find-document "The Secret of Divine Civilization" → The Secret of Divine Civilization (20919); Secret of Divine Civilization (24471); Secret of Divine Civilization (983136)
- seed-93 T2: **The Advent of Divine Justice** (Shoghi Effendi) [letter] → The Advent of Divine Justice (doc 20890, by title)
  - checked: find-document "The Advent of Divine Justice" → The Advent of Divine Justice (20890); Advent of Divine Justice (912371); Advent of Divine Justice (913762)
- seed-93 T2: **Paris Talks** ('Abdu'l-Bahá) [talk] → Paris Talks (doc 20908, by title)
  - checked: find-document "Paris Talks" → Paris Talks (20908); Paris Talks: Study Guide (23579); Paris Talks: Study Guide (28930)
- seed-93 T2: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827)
- seed-93 T2: **Living the Life** (compilation) [compilation] → Living the Life (doc 983370, by title)
  - checked: find-document "Living the Life" → Living the Life (983370); Living the Life (983895); Living the Life (945915) | phrase search → Living the Life (945915) ¶2 coverage 1.00
- seed-93 T3: **Tablets to The Hague (First Tablet to The Hague)** ('Abdu'l-Bahá) [tablet] → Tablets to the Hague (doc 20916, by title)
  - checked: find-document "Tablets to The Hague" → Tablets to the Hague (20916); Lawh-i-Lahih - Tablet to the Hague (921704); Tablet to the Central Organization for a Durable Peace, The Hague (6945) | phrase search → Bahá’í Sacred Writings (20777) ¶1027 coverage 1.00
- seed-93 T4: **Tablets to The Hague** ('Abdu'l-Bahá) [tablet] → Tablets to the Hague (doc 20916, by title)
  - checked: find-document "Tablets to The Hague" → Tablets to the Hague (20916); Lawh-i-Lahih - Tablet to the Hague (921704); Tablet to the Central Organization for a Durable Peace, The Hague (6945) | phrase search → Tablets to the Hague (20916) ¶30 coverage 1.00
- seed-93 T5: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097) | phrase search → Some Answered Questions (20911) ¶702 coverage 1.00
- seed-93 T5: **The Advent of Divine Justice** (Shoghi Effendi) [letter] → The Advent of Divine Justice (doc 20890, by title)
  - checked: find-document "The Advent of Divine Justice" → The Advent of Divine Justice (20890); Advent of Divine Justice (912371); Advent of Divine Justice (913762)

### Collection gaps (27) — Perplexity named, library lacks

- soul-after-death T1: **The Bible — Matthew** (Matthew) [book]
  - checked: find-document "The Bible — Matthew" → The Gospel of Matthew (20992); Every Eye Shall See: Bible Evidence for the Return of Christ (967517) | documents?q → Every Eye Shall See: Bible Evidence for the Return of Christ (967517); The Gospel of Matthew (20992)
- soul-after-death T3: **The Holy Bible** [book]
  - checked: find-document "The Holy Bible" → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521) | documents?q → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521)
- soul-after-death T5: **Encyclopaedia Iranica: Eschatology i. In Zoroastrianism** (Encyclopaedia Iranica) [article]
  - checked: find-document "Encyclopaedia Iranica: Eschatology i. In Zoroastrianism" → none | documents?q → none
- soul-after-death T5: **Zarathushti view of death and the afterlife** (Antia) [article]
  - checked: find-document "Zarathushti view of death and the afterlife" → none | documents?q → none
- soul-after-death T5: **Understanding the Gathas** (Dinshaw J. Irani) [book]
  - checked: find-document "Understanding the Gathas" → none | documents?q → none
- detachment-buddhism T3: **The Paradox of Becoming** (Ṭhānissaro Bhikkhu) [book]
  - checked: find-document "The Paradox of Becoming" → none | documents?q → none
- detachment-buddhism T4: **Detachment and Compassion in Early Buddhism** (Elizabeth J. Harris) [article]
  - checked: find-document "Detachment and Compassion in Early Buddhism" → none | documents?q → none
- detachment-buddhism T5: **Ānanda Sutta (Saṃyutta Nikāya 22.83)** (Pali Canon, tr. Bhikkhu Bodhi) [book]
  - checked: find-document "Ānanda Sutta" → Samyutta Nikaya 22.83 - Ananda Sutta: Ananda (19401); Anguttara Nikaya 6.51 - Ananda Sutta: Ven. Ananda (19134); Anguttara Nikaya 9.37 - Ananda Sutta: With Ananda (19200) | documents?q → Samyutta Nikaya 22.83 - Ananda Sutta: Ananda (19401); Anguttara Nikaya 6.51 - Ananda Sutta: Ven. Ananda (19134); Anguttara Nikaya 9.37 - Ananda Sutta: With Ananda (19200) | phrase search → Sutra Collection (M, Part-2) (20934) ¶513 coverage 0.00
- detachment-buddhism T5: **Sammādiṭṭhi Sutta (Majjhima Nikāya 9)** (Pali Canon (Sāriputta), tr. Ṭhānissaro Bhikkhu) [book]
  - checked: find-document "Sammādiṭṭhi Sutta" → Majjhima Nikaya 9 - Sammaditthi Sutta: The Discourse on Right View (19285) | documents?q → Majjhima Nikaya 9 - Sammaditthi Sutta: The Discourse on Right View (19285) | phrase search → Samyutta Nikaya 12.46 - Aññatra Sutta: A Certain Brahman (19323) ¶4 coverage 0.33
- equality-sexes T4: **Four More Meanings of Bahá'u'lláh's Initial Revelation** [article]
  - checked: find-document "Four More Meanings of Bahá'u'lláh's Initial Revelation" → none | documents?q → none
- 004-soul-reincarnation T1: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book]
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312)
- 004-soul-reincarnation T1: **Bṛhadāraṇyaka Upaniṣad** [book]
  - checked: find-document "Bṛhadāraṇyaka Upaniṣad" → none | documents?q → none
- 004-soul-reincarnation T1: **Anattalakkhaṇa Sutta (Saṃyutta Nikāya 22.59)** [book]
  - checked: find-document "Anattalakkhaṇa Sutta" → Samyutta Nikaya 22.59 - Anattalakkhana Sutta (Not-self Characteristic) (17268) | documents?q → Samyutta Nikaya 22.59 - Anattalakkhana Sutta (Not-self Characteristic) (17268)
- 004-soul-reincarnation T1: **Milindapañha** [book]
  - checked: find-document "Milindapañha" → none | documents?q → none
- 004-soul-reincarnation T1: **Comparison of God and Soul Concepts From a Baha'i and Hindu Perspective** (Kerr) [article]
  - checked: find-document "Comparison of God and Soul Concepts From a Baha'i and Hindu …" → none | documents?q → none
- 004-soul-reincarnation T2: **Stanford Encyclopedia of Philosophy: Buddha** (Stanford Encyclopedia of Philosophy) [article]
  - checked: find-document "Stanford Encyclopedia of Philosophy: Buddha" → none | documents?q → none
- 004-soul-reincarnation T4: **Brahma-sūtra-bhāṣya** (Śaṅkara) [book]
  - checked: find-document "Brahma-sūtra-bhāṣya" → none | documents?q → none
- 004-soul-reincarnation T4: **Śaṅkara (Stanford Encyclopedia of Philosophy)** (Stanford Encyclopedia of Philosophy) [article]
  - checked: find-document "Śaṅkara" → none | documents?q → none
- 004-soul-reincarnation T5: **Vedārthasaṅgraha** (Rāmānuja) [book]
  - checked: find-document "Vedārthasaṅgraha" → none | documents?q → none
- seed-21 T3: **Enchiridion** (Augustine) [book]
  - checked: find-document "Enchiridion" → none | documents?q → none
- seed-21 T3: **The Enneads** (Plotinus) [book]
  - checked: find-document "The Enneads" → Tag: Enneads (289652); Tag: Enneads (289649) | documents?q → Tag: Enneads (289652); Tag: Enneads (289649)
- seed-39 T2: **Persian Bayán** (The Báb) [book]
  - checked: find-document "Persian Bayán" → The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726); The Persian Bayán: From A.L.M. Nicolas' French translation (15140) | documents?q → Persian Bayán: Summary and Thematic Analysis (14653); The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726)
- seed-39 T3: **Persian Bayán** (The Báb) [book]
  - checked: find-document "Persian Bayán" → The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726); The Persian Bayán: From A.L.M. Nicolas' French translation (15140) | documents?q → Persian Bayán: Summary and Thematic Analysis (14653); The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726)
- seed-39 T5: **Persian Bayán** (The Báb) [book]
  - checked: find-document "Persian Bayán" → The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726); The Persian Bayán: From A.L.M. Nicolas' French translation (15140) | documents?q → Persian Bayán: Summary and Thematic Analysis (14653); The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726)
- seed-66 T3: **The Holy Bible: Exodus** [book]
  - checked: find-document "The Holy Bible: Exodus" → Torah - Shemot (Exodus) (21277); Exodus (21226); Leviticus (21237) | documents?q → Exodus (21226); Torah - Shemot (Exodus) (21277); Leviticus (21237)
- seed-93 T1: **Toward the Most Great Justice** (Charles Lerche (ed.)) [book]
  - checked: find-document "Toward the Most Great Justice" → Toward the Most Great Justice: Elements of Justice in the New World Order, by Charles Lerche: Review (59566); Toward the Most Great Justice: Elements of Justice in the New World Order, by Charles Lerche: Review (212045); Lawh-i-Bismillih - On the Causes of Acceptance and Rejection of the Manifestations of God (926460) | documents?q → Toward the Most Great Justice: Elements of Justice in the New World Order, by Charles Lerche: Review (59566); Toward the Most Great Justice: Elements of Justice in the New World Order, by Charles Lerche: Review (212045); Lawh-i-Bismillih - On the Causes of Acceptance and Rejection of the Manifestations of God (926460)
- seed-93 T3: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [compilation]
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312)

### Not determinable (8)

- detachment-buddhism T3: **Vibhaṅga Sutta (Saṃyutta Nikāya 12.2)** (Buddha) [talk]
  - checked: find-document "Vibhaṅga Sutta" → Samyutta Nikaya 12.2 - Vibhanga Sutta (Analysis of Dependent Co-arising) (17267); Samyutta Nikaya 48.38 - Vibhanga Sutta: An Analysis ((of the Feeling Faculties)) (19557); Majjhima Nikaya 138 - Uddesa-vibhanga Sutta: An Analysis of the Statement (19238) | documents?q → Samyutta Nikaya 12.2 - Vibhanga Sutta (Analysis of Dependent Co-arising) (17267); Samyutta Nikaya 48.38 - Vibhanga Sutta: An Analysis ((of the Feeling Faculties)) (19557); Majjhima Nikaya 138 - Uddesa-vibhanga Sutta: An Analysis of the Statement (19238)
- detachment-buddhism T4: **Virāga Sutta (Saṃyutta Nikāya)** (the Buddha) [other]
  - checked: find-document "Virāga Sutta" → none | documents?q → none
- equality-sexes T1: **Letter written on behalf of Shoghi Effendi, 28 July 1936** (Shoghi Effendi) [letter]
  - checked: find-document "Letter written on behalf of Shoghi Effendi, 28 July 1936" → none | documents?q → none
- equality-sexes T1: **Letter written on behalf of Shoghi Effendi, 17 September 1952** (Shoghi Effendi) [letter]
  - checked: find-document "Letter written on behalf of Shoghi Effendi, 17 September 195…" → none | documents?q → none
- equality-sexes T2: **Universal House of Justice letter to the National Spiritual Assembly of New Zealand, 31 May 1988** (Universal House of Justice) [letter]
  - checked: find-document "Universal House of Justice letter to the National Spiritual …" → none | documents?q → none
- equality-sexes T3: **Letter of the Universal House of Justice to an individual, 24 July 1975** (Universal House of Justice) [letter]
  - checked: find-document "Letter of the Universal House of Justice to an individual, 2…" → none | documents?q → none
- equality-sexes T5: **Letter of 31 May 1988 to the National Spiritual Assembly of New Zealand** (Universal House of Justice) [letter]
  - checked: find-document "Letter of 31 May 1988 to the National Spiritual Assembly of …" → none | documents?q → none
- seed-21 T5: **Makátíb-i-'Abdu'l-Bahá, vol. 1** ('Abdu'l-Bahá) [tablet]
  - checked: find-document "Makátíb-i-'Abdu'l-Bahá, vol. 1" → none | documents?q → none

### Perplexity errors (107)

- soul-after-death T2 [misattribution]: Perplexity attributes 'the spiritual beloved ones will recognize one another' to Bahá'u'lláh. These are 'Abdu'l-Bahá's words, quoted in Esslemont's book.
- soul-after-death T2 [authority_error]: It names Bahá'u'lláh as the author of 'Bahá'u'lláh and the New Era', which is J.E. Esslemont's secondary introduction, and rests the point on that book instead of the primary tablet.
- soul-after-death T2 [misattribution]: It credits the compilation 'Family Life' to Bahá'u'lláh and paraphrases its content without naming the actual passage or author.
- soul-after-death T2 [wrong_location]: It cites the Crimson Ark passage as 'Bahá'í Sacred Writings 36.1' instead of the standard reference, Gleanings LXXXVI.
- soul-after-death T3 [misattribution]: The "spiritual beloved ones will recognize one another" passage is credited to Bahá'í World Faith, pp. 188–190. But the linked page (ibiblio BNE-148) is Esslemont's Bahá'u'lláh and the New Era, chapter 12 "Life After Death", pp. 188–190. The quoted words are 'Abdu'l-Bahá's, which Esslemont quotes there.
- soul-after-death T3 [authority_error]: The passage is placed under the Bahá'u'lláh/Gleanings bullet and never credited to 'Abdu'l-Bahá. A reader would likely take it as Bahá'u'lláh's words, and the Writings are cited through a secondary book rather than the Tablet itself.
- soul-after-death T5 [misattribution] (Anís right): Attributes 'concealed realities will become disclosed' to Gleanings from the Writings of Bahá'u'lláh. It is from a tablet of 'Abdu'l-Bahá.
- detachment-buddhism T1 [wrong_location]: The 'O Companion of My Throne! Hear no evil...' passage is Persian Hidden Word no. 44, not no. 55. It also never mentions detachment.
- detachment-buddhism T1 [invented_or_misquoted]: The 'steed of this Valley is patience' line belongs to the Valley of Search, not the Valley of Knowledge. The sentence 'The wayfarer in this journey will never reach the abode of true knowledge unless he passeth through the Valley of Search and the Valley of Love' looks invented.
- detachment-buddhism T1 [wrong_location]: I believe 'He seeth the end in the beginning' comes from the Valley of Knowledge, not the Valley of Unity, though I'm not fully certain.
- detachment-buddhism T1 [invented_or_misquoted]: The Valley of True Poverty quote is paraphrased. The actual text reads 'This station is the dying from self and the living in God, the being poor in self and rich in the Desired One.'
- detachment-buddhism T1 [misattribution]: 'The essence of true safety is to observe silence...' comes from the Words of Wisdom (Tablets of Bahá'u'lláh), not Gleanings XLIII.
- detachment-buddhism T1 [misattribution]: 'The essence of faith is fewness of words and abundance of deeds' is also from the Words of Wisdom, not Gleanings CXXVIII.
- detachment-buddhism T1 [wrong_location]: 'The Four Kinds of Love' is probably not talk 35 in Paris Talks. I'm not certain of the right number, and the quote itself is cut off.
- detachment-buddhism T2 [wrong_location]: It says the Words of Wisdom passage also speaks of spending wealth on oneself, one's family and the poor. That content is not in that passage.
- detachment-buddhism T2 [invented_or_misquoted]: The paraphrase about possessions not possessing their owner (a rich person can be detached, a poor person attached) is labelled "attributed to Bahá'u'lláh" without naming a primary source; it looks like a secondary paraphrase.
- detachment-buddhism T2 [unofficial_translation]: It quoted Cole's provisional translation of the Commentary without labelling it provisional.
- detachment-buddhism T4 [wrong_location]: Gives the passage's location as 'The Discourse on the Supreme' (the Paramaṭṭhaka Sutta, Sn 4.5), says this is in the 'Parāyanavagga' (a different chapter), and calls it 'verse 9'. The lines actually seem to be from the Attadaṇḍa Sutta, Sn 4.15 (vv. 949–951).
- detachment-buddhism T4 [other]: Doesn't name the translator (John D. Ireland, via the budsas.org page).
- detachment-buddhism T5 [misattribution]: It says 'the Buddha says' the line from SN 22.83, but in that sutta Ānanda reports the words of Venerable Puṇṇa Mantāniputta.
- detachment-buddhism T5 [wrong_location]: It calls SN 22.63 the 'Khandha Sutta', but its usual title is Upādiyamāna Sutta ('Clinging').
- detachment-buddhism T5 [invented_or_misquoted]: The MN 9 line 'From the cessation of clinging comes the cessation of becoming' is a loose paraphrase, not the translation's exact wording.
- equality-sexes T1 [other]: I can't verify the date of 17 September 1952 for the letter on behalf of Shoghi Effendi; it is cited only through a 1975 letter of the House of Justice.
- equality-sexes T2 [other]: Perplexity relies on the House of Justice's 1988 letter to explain how 'Abdu'l-Bahá's statement in Selections no. 38 is to be read. This is minor: what the House is describing is 'Abdu'l-Bahá's own later clarification.
- equality-sexes T3 [invented_or_misquoted]: It quotes 'O ye Men of Justice! Establish ye in the lands Houses of Justice…' as Aqdas text. That sentence does not exist in the authorised translation; it merges paragraph 52's address with paragraph 30's subject.
- equality-sexes T3 [wrong_location]: It places 'Men of Justice' (rijál al-'adl) at Aqdas paragraph 30; the phrase is in paragraph 52.
- equality-sexes T3 [other]: It cites the Corinne True Tablet through a secondary scholarly article (Maneck) and dates it 1909 without confirmation; the authorised wording appears in the Kitáb-i-Aqdas notes.
- equality-sexes T4 [wrong_location]: It claims 'Abdu'l-Bahá quotes the 'Men of Justice' wording in Paris Talks, Part Three, while discussing the institution. That seems unsupported.
- equality-sexes T4 [other]: It calls a Reddit thread a 'scholarly discussion' of rijál/rajul.
- equality-sexes T5 [misattribution] (Anís right): Perplexity presents 'according to the explicit text of the Law of God... a wisdom of the Lord God's' as the Universal House of Justice's own later explanation (31 May 1988). These are 'Abdu'l-Bahá's words (Selections, no. 38), which that letter quotes.
- equality-sexes T5 [authority_error] (Anís right): Perplexity treats the reason as an 'institutional explanation' by the House of Justice, which rests a doctrinal point on the House.
- equality-sexes T5 [wrong_location]: Perplexity attributes the 'Mrs. Pocohontas in Washington' identification to the Women compilation. Its location there is unverified and uncertain.
- return-iqan T1 [wrong_location] (Anís right): It places an explicit discussion of John the Baptist and Elijah in Íqán Part Two. The developed treatment of that example is in 'Abdu'l-Bahá's Some Answered Questions ch. 33, not the Íqán.
- return-iqan T1 [invented_or_misquoted]: Some of the quoted openings ('Strive therefore to comprehend the meaning of return'; 'If thou sayest that Muḥammad was the return of the Prophets of old') may not be verbatim Íqán text. I am unsure.
- return-iqan T3 [invented_or_misquoted]: It quotes 'All the Prophets of God abide in the same tabernacle, soar in the same heaven, are seated upon the same throne…' as exact text. The authorised text reads 'thou wilt behold Them all abiding in the same tabernacle, soaring in the same heaven, seated upon the same throne, uttering the same speech, and proclaiming the same Faith.'
- return-iqan T3 [wrong_location]: It places the passages at ¶¶152–153. In the Reference Library numbering they appear to fall around ¶¶161–162 (likely, not certain).
- return-iqan T3 [wrong_location]: It presents 'These sanctified Mirrors, these Daysprings of ancient glory…' as the surrounding passage, but it comes from an earlier part of Part Two (about ¶106; also Gleanings XIX).
- return-iqan T3 [invented_or_misquoted]: I can't verify 'the bearers of one Name, the exponents of one Cause, the manifestations of one Self, and the revealers of one Truth' as the exact wording of this section of the Íqán.
- return-iqan T4 [wrong_location]: The paragraph numbers for the 'bearers of His names' (¶160) and 'one person, one soul' (¶161) quotes may not be exact; I can't confirm them from memory.
- return-iqan T5 [wrong_location] (Anís right): It places the SAQ chapter at "question 18". That number comes from the Ocean of Lights file numbering; in the published book it is chapter 33.
- return-iqan T5 [wrong_location]: It places the Íqán passages ("I am all the Prophets... I am the first Adam, Noah, Moses, and Jesus" and "I am the return of all the Prophets") in Part One. They are in Part Two.
- return-iqan T5 [misattribution]: Footnote [3], given for the Íqán quotations, points to an SAQ PDF rather than to the Kitáb-i-Íqán.
- return-iqan T5 [other]: It gives rajʿa as the term without checking the Persian text of the Íqán, which I believe uses rujúʿ (رجوع). I'm not certain of this, and Perplexity hedges with "commonly associated".
- golden-rule T1 [wrong_location]: Gives the 'Lay not on any soul a load...' passage as Gleanings CXXVIII. To my knowledge it is Gleanings LXVI.
- golden-rule T1 [invented_or_misquoted]: The ESW quotation drops 'thou'. The authorised text reads 'choose thou for thy neighbour that which thou choosest for thyself'.
- golden-rule T2 [factual]: Says flatly that the Hidden Words do not contain the Golden Rule. It overlooks Arabic Hidden Word 29: 'Ascribe not to any soul that which thou wouldst not have ascribed to thee'.
- golden-rule T2 [invented_or_misquoted]: Says the earlier quoted passage was George Townshend's commentary in The Heart of the Gospel. The conversation shown gives no basis for this, and it may be fabricated.
- golden-rule T3 [factual] (Anís right): Raises a supposed numbering discrepancy ("Arabic no. 67") based on a web article. The authorised text numbers this passage 68.
- golden-rule T3 [other] (Anís right): Says "the earlier attribution to Prayers and Meditations was incorrect", accepting the reader's claim without checking it. Anís's earlier turns do not show that attribution.
- golden-rule T4 [other] (Anís right): Implicitly accepts the reader's premise that the quotation appears in The Earth Is But One Country without checking it or noting that Anís never said so.
- golden-rule T4 [other]: Quotes the KJV wording of Luke 6:31 while its cited URLs are NIV pages (minor).
- golden-rule T5 [invented_or_misquoted] (Anís right): Claims 'one same substance' translates مِنْ جَوْهَرٍ وَاحِدٍ (jawhar). The original Arabic of AHW 68 reads مِنْ شَيْءٍ واحِدٍ (shay').
- golden-rule T5 [wrong_location]: Cites 'O Moving Form of Dust' as Persian Hidden Word 27. As I recall, it is Persian no. 32 (uncertain).
- 004-soul-reincarnation T1 [authority_error]: Gives the Universal House of Justice compilation 'Reincarnation, Rebirth and the Progress of the Soul' as a source for doctrinal points (what survives death, the linear direction of existence), placing it beside Gleanings. Doctrine should rest on the Writings and on Shoghi Effendi.
- 004-soul-reincarnation T1 [wrong_location]: Cites Some Answered Questions §§80–81 for 'return'. Chapter 80 deals with pre-existence and origination; only ch. 81 is on reincarnation.
- 004-soul-reincarnation T2 [wrong_location]: It cites Some Answered Questions 'chapter 48, The Return of Christ'. The return/reincarnation material is in ch. 81 ('Reincarnation') and ch. 33 ('The Return of Christ') in the standard edition, and the URL points to chapter 13.
- 004-soul-reincarnation T2 [other] (Anís right): It does not identify the passage the reader quotes (a letter written on behalf of Shoghi Effendi, in Lights of Guidance). It moves straight to SAQ without saying where the reader's words come from.
- 004-soul-reincarnation T2 [other]: Buddhist doctrine (anatta, rebirth without transmigration) rests only on an encyclopedia article, with no Buddhist scripture such as the Pali suttas or the Milindapañha cited, though it is labelled as scholarship.
- 004-soul-reincarnation T3 [wrong_location]: Places the flower analogy in Some Answered Questions 'chapter 13, The Return of the Prophets'. The chapter on Return appears to be ch. 33 (Part 2) in the 2014 edition, though I am not fully certain.
- 004-soul-reincarnation T3 [other]: Presents bahai.org web summaries as 'the authoritative Bahá'í account' and 'official explanations' of the soul as 'essential identity', without tracing that phrase to a passage in the Writings. This is a minor mislabel of authority.
- 004-soul-reincarnation T4 [invented_or_misquoted]: In Gleanings LXXX, 'the self-same individuality, personality, consciousness, and understanding' is how the questioner phrases the question. Perplexity presents it as Bahá'u'lláh's own explicit statement, though his answer does affirm that the soul survives.
- 004-soul-reincarnation T4 [other]: I'm not certain the Paris Talks quotation and chapter title are given exactly.
- 004-soul-reincarnation T5 [other] (Anís right): It 'corrects' a Rāmānuja quotation ('The individual soul is nothing but Brahman itself appearing as finite…') that Anís never gave. The reader's actual paraphrase was different, so the reply does not match the conversation.
- 004-soul-reincarnation T5 [wrong_location]: Footnote [3] for the Rāmānuja claim points to a Gleanings page on bahai.org, not to a Rāmānuja source.
- 004-soul-reincarnation T5 [other] (Anís right): Gives none of Rāmānuja's actual words, although the reader explicitly asked for them.
- seed-21 T1 [misattribution] (Anís right): It attributes the darkness-as-absence-of-light passage (Lights of Guidance 1734) to 'Abdu'l-Bahá. It is a letter written on behalf of Shoghi Effendi.
- seed-21 T1 [wrong_location]: It gives the SAQ ch. 74 title as 'On Evil'; the actual title is 'The Nonexistence of Evil'.
- seed-21 T1 [other]: I could not verify the claim that Bahá'u'lláh wrote 'darkness of the night of error' in 'Bahá'í Sacred Writings', section 3, 'The Promised One'.
- seed-21 T2 [other]: Credits the English translation and the exact phrase 'mere non-existence' to Laura Clifford Barney. The authorised text currently on bahai.org is the 2014 revision by the Bahá'í World Centre, so the credit should go to that revision, not to Barney's 1908 original.
- seed-21 T3 [wrong_location]: Calls "The Nonexistence of Evil" chapter 48 of Some Answered Questions; it is chapter 74.
- seed-21 T3 [other]: Its account of Plotinus's matter-as-evil rests on a secondary OUP chapter, not a quotation from Ennead I.8 itself.
- seed-21 T4 [wrong_location] (Anís right): Claims the passage is properly found in Promulgation of Universal Peace pp. 242–243. It isn't: that page has a different text about mortality, while the quoted sentence is in Star of the West.
- seed-21 T4 [factual] (Anís right): Asserts that the Star of the West attribution 'was incorrect' and 'should be withdrawn', even though the passage does appear there.
- seed-21 T4 [other]: Calls Promulgation of Universal Peace an 'authorized collection'/'authoritative edition' without noting that it consists of talks recorded by others, not texts 'Abdu'l-Bahá wrote himself.
- seed-21 T5 [wrong_location]: Gives 'The Nonexistence of Evil' as Some Answered Questions chapter 80; it is chapter 74.
- seed-21 T5 [factual] (Anís right): Accepts without checking that the passage does not mention evil at all and calls it a conflation. The English text under discussion opens with 'there is no evil... evil is the absence of good'.
- seed-39 T1 [wrong_location]: The abrogation of the Bayán's command to destroy books is in Kitáb-i-Aqdas para 77 (with its note). Perplexity places it in the note to paragraph 186.
- seed-39 T1 [misattribution]: Perplexity cites Shoghi Effendi's 'eulogy of the Promised One' description to secondary notes and never names God Passes By.
- seed-39 T1 [other]: The rule that laws Bahá'u'lláh did not confirm are abrogated is given vaguely as 'guidance attributed to ʻAbdu'l-Bahá', with no source.
- seed-39 T1 [authority_error]: Perplexity rests its claim that the Bayán abolished capital punishment and restricted carrying arms on scholarly analysis (Afnan). This is doubtful given the Bayán's severe provisions.
- seed-39 T2 [wrong_location]: Says Bahá'u'lláh's 'He hath revealed certain laws… made subject to Our sanction' appears in the Notes to the Kitáb-i-Aqdas. It is quoted in the Introduction, and the citation is backed partly by a provisional notes page on bahai-library.
- seed-39 T2 [other]: Garbled placeholder references ('paragraph  abrogation section', 'note  abrogation of specific laws') where real numbers belong.
- seed-39 T2 [wrong_location]: The Persian Bayán references (Váḥid 5:7, Váḥid 6:14) are given without quotation and cannot be checked; they may be inaccurate.
- seed-39 T3 [wrong_location]: The Váḥid and Gate numbers (5:3 and 8:15) and the wording attributed to them come from Wikipedia and Bahaipedia. They are unverified and may be wrong.
- seed-39 T3 [misattribution]: It calls the source 'E. G. Browne's translation' of the Persian Bayán. Browne made an index or summary, not a full translation.
- seed-39 T3 [other]: It calls 'accept, reject or modify' an interpretive paraphrase but does not name where it comes from (I believe the Universal House of Justice's Introduction to the Kitáb-i-Aqdas).
- seed-39 T4 [invented_or_misquoted] (Anís right): It ended the quotation "and hath set others aside" and presented it as the authorised English; the authorised text (which Anís's library reproduces) reads "Others We set aside."
- seed-39 T4 [wrong_location]: It placed the passage in the "section on the eighth Ishráq", which is doubtful, and its citations for the page are bahai-library notes pages rather than the authorised edition.
- seed-39 T5 [wrong_location]: The Bayán location (Váḥid 2, Gate 19) is stated confidently and not backed by any cited source; it may be unreliable.
- seed-66 T1 [wrong_location]: Says Bahá'u'lláh described the Maiden 'in The Book of Certitude' (Kitáb-i-Íqán). The Maiden vision appears in the Súriy-i-Haykal and other tablets, not in the Íqán.
- seed-66 T1 [other]: 'Victory through suffering' is attributed loosely to The Dawn-Breakers and The World Order of Bahá'u'lláh, with no location or quotation.
- seed-66 T3 [invented_or_misquoted]: The words 'step out of the chamber of utterance', attributed to ¶7 of Súriy-i-Haykal, could not be confirmed as wording of the authorised translation. This is uncertain and may be a paraphrase.
- seed-66 T3 [other]: The Hira narrative is credited only to 'hadith accounts', with no specific collection or hadith named.
- seed-66 T4 [invented_or_misquoted] (Anís right): Gives a twelve-day window (2–13 Muḥarram 1269 / 16–27 Oct 1852) from 'one later chronology', citing the bahai.org Summons text, which contains no such dating
- seed-66 T4 [wrong_location]: Cites the God Passes By p.101 statement to a Momen PDF (footnote [4]) rather than to God Passes By itself
- seed-66 T5 [invented_or_misquoted]: Perplexity presents 'Step out of the chamber of utterance… proffer with thy ruby fingers the wine of the heavenly Dominion' as the words that follow the Maiden in Súriy-i-Haykal ¶6. I don't believe this passage comes right after her appearance in that Tablet, and it may come from another text.
- seed-66 T5 [factual]: Perplexity says that what follows is not the Maiden speaking in reported dialogue. In fact the Súriy-i-Haykal continues with the Maiden pointing to His head and proclaiming 'By God! This is the Best-Beloved of the worlds…'.
- seed-66 T5 [factual]: Perplexity treats the Epistle's 'torrent' passage as the immediate consequence of the Maiden's speech. That merges two separate accounts from two different works.
- seed-93 T1 [wrong_location]: Bahá'u'lláh's 'two pillars: reward and punishment' is sourced to The Advent of Divine Justice. Its primary source is the Tablets of Bahá'u'lláh, and I am unsure ADJ quotes it at all.
- seed-93 T1 [other]: The Promulgation of Universal Peace is cited only by work ('discourse on the economic question'), with no talk, date or page.
- seed-93 T2 [misattribution]: Perplexity places the 'second attribute of perfection … justice and impartiality' passage in Selections from the Writings of 'Abdu'l-Bahá. It is from The Secret of Divine Civilization.
- seed-93 T2 [wrong_location]: The 'twin Guardians' wording is placed in 'The Third Ṭaráz'. I am not certain of this location, and the passage may belong to another tablet in the same volume.
- seed-93 T4 [factual] (Anís right): Claims the sentence about 'justice and right' ('Until these are realized on the plane of existence, all things shall be in disorder and remain imperfect') does not appear in the Tablet to The Hague. It does, in the First Tablet (17 December 1919).
- seed-93 T4 [wrong_location] (Anís right): Says the 'these' the reader asked about refers to the delegates who will make up the Supreme Tribunal, quoting a different passage of the Tablet instead of the 'justice and right' sentence.
- seed-93 T4 [other] (Anís right): Says the 'justice and right' wording is only 'commonly cited … in older compilations or secondary presentations' and should be withdrawn, wrongly casting doubt on authorised text.
- seed-93 T5 [wrong_location]: Places SAQ ch. 77 in 'Part 3, On the Powers and Perfections of the Manifestations of God'; ch. 77 is actually in Part 4, Miscellaneous Subjects.
- seed-93 T5 [invented_or_misquoted]: The quotation blends translations. The SAQ 2014 text reads 'attributes of the All-Merciful… attributes of the Lord… rests upon justice and not upon forgiveness', while 'pole of justice' is Shoghi Effendi's rendering in ADJ.

#### soul-after-death

- T1 *opening*: **px** — Perplexity names five Bible passages at verse level, and every reference and description checks out; each one bears directly on survival, identity and recognition. Anís's single scripture citation (Summons of the Lord of Hosts) is correct and linked to its paragraph. But his other two sources are marginal: a condolence letter about one person, and a reader's visionary account in Star of the West. His quotations are truncated, and he wrongly says the texts are silent on recognising loved ones. Bahá'u'lláh's Gleanings and 'Abdu'l-Bahá's statements on the subject were missed. (Perplexity 3.9 s, $0.00488)
- T2 *reference*: **px** — Perplexity is the winner. It pointed the reader to the genuinely relevant Bahá'í texts on whether we will know our loved ones after death, and it quoted the Crimson Ark passage accurately (Gleanings LXXXVI). It did make attribution errors: it credited 'Abdu'l-Bahá's words, quoted by Esslemont, to Bahá'u'lláh, and it named Bahá'u'lláh as author of Esslemont's book and of the Family Life compilation. Anís's only citation was Muhammad's hadith as quoted in the Íqán. It sits at a real location but has nothing to do with the question, so he did not identify any source that answers the reader. (Perplexity 5.3 s, $0.00526)
- T3 *deepen*: **px** — Perplexity answered the reader's actual question with correct, precise scripture locations in each tradition. The Bible, Qur'an and Gita verses all check out, and it found the key passage on recognizing loved ones. Its flaws are real: it names the wrong book (Bahá'í World Faith instead of Esslemont's Bahá'u'lláh and the New Era) and never credits the quoted words to 'Abdu'l-Bahá. Anís, by contrast, cites nothing specific and wrongly denies something he said earlier. (Perplexity 7.8 s, $0.00612)
- T4 *absent*: **px** — The reader asked for the exact words about recognising loved ones after death. Perplexity found the two passages that answer it, 'Abdu'l-Bahá's tablet in Tablets of 'Abdu'l-Bahá vol. 1 p. 205 and Gleanings LXXXVI, and quoted and located both correctly. Anís gave one accurate Gleanings quotation that does not touch on recognition. He was honest about that, but he did not find the passages that answer the question. (Perplexity 5.0 s, $0.005)
- T5 *compare*: **anis** — The text at the centre of the turn is the line the reader quoted. Anís correctly gives it to 'Abdu'l-Bahá. Perplexity puts it in Bahá'u'lláh's Gleanings, which gets the speaker and the book wrong. Perplexity was stronger on the Zoroastrian side, with precise Yasna 31 verses and later material clearly labelled. Anís's Gathas citation has no verse and doesn't bear on the question, and his Denkard label seems to be wrong. On balance Anís wins narrowly because he got the core Bahá'í attribution right. (Perplexity 6.7 s, $0.00566)

#### detachment-buddhism

- T1 *opening*: **anis** — undefined (Perplexity 6.9 s, $0.00609)
- T2 *reference*: **px** — Both answers identified the Commentary passage correctly, and neither said it is a provisional translation. Anís's extra sources (Gleanings, Hidden Words) are correct, but they don't define detachment directly. Perplexity added an authorised passage from Words of Wisdom that answers the reader's question exactly. Against that, it wrongly placed the spending-wealth content in the same passage and used a loosely attributed paraphrase. On balance, Perplexity's source identification serves the question better. (Perplexity 5.0 s, $0.00539)
- T3 *exact_quote*: **px** — Perplexity gave a longer piece of the passage and was honest about where it comes from. It correctly said the passage isn't about virāga and admitted 'deconstruction of clinging' was a paraphrase. For the second question it pointed to real canonical texts on clinging (SN 22.121, SN 12.2) with an accurate quotation. Anís quoted the same fragment twice, described its context wrongly, and offered nothing for the second question. Neither named the source sutra, which I'm fairly confident is the Śūraṅgama. (Perplexity 6.3 s, $0.00613)
- T4 *absent*: **px** — Both answers are only partly right. Anís quotes a real-looking canonical passage on not clinging to the five aggregates, but cites it only as 'Sutra Collection (VY)'. That ignores the reader's direct request for a sutta name or number, and Anís never deals with the earlier fragment it couldn't place. Perplexity places its quotation correctly in the Sutta Nipāta's Aṭṭhakavagga, though it gets the sutta and verse wrong (it's Sn 4.15, not 'The Discourse on the Supreme' or the Parāyanavagga). It also says honestly that the earlier fragment can't be authenticated, and it points to the Virāga Sutta references. That gives Perplexity a slight edge for a locatable, correctly named work and chapter, despite its errors. (Perplexity 5.1 s, $0.00561)
- T5 *pushback*: **px** — Perplexity found the actual sutta behind the disputed passage (DN 15) and quoted its wording. It conceded the gloss and answered both of the reader's questions with sutta numbers. Anís also conceded the gloss, but he cited an unrelated Gleanings passage and named no Buddhist source at all. Perplexity's slips (calling SN 22.63 the 'Khandha Sutta' and putting the SN 22.83 words in the Buddha's mouth) are minor by comparison. (Perplexity 5.2 s, $0.00553)

#### equality-sexes

- T1 *opening*: **px** — The reader asked for exact titles and dates. Perplexity gives several dated letters written on behalf of Shoghi Effendi. It quotes the Tablets of 'Abdu'l-Bahá in their authorised translation via the 1988 letter of the House of Justice, and it is clear about what is undated. Anís offers one dated letter from the Guardian and an undated Tablet in what is probably an unofficial translation from bahai-library.com. He also attributes the Aqdas note to Bahá'u'lláh. (Perplexity 5.5 s, $0.00564)
- T2 *reference*: **px** — Perplexity answers exactly what was asked: who wrote the line, to whom, when, and whether it is 'Abdu'l-Bahá's own words. It is a letter written on behalf of Shoghi Effendi to an individual, dated 28 July 1936, found in the compilation Women. Perplexity also gives 'Abdu'l-Bahá's actual text, Selections no. 38, and correctly ranks it as a Tablet above the secretary's letter. Anís identifies nothing and contradicts the reader about his own earlier citation. (Perplexity 5.4 s, $0.00599)
- T3 *compare*: **px** — Perplexity actually answers the question. It names the Corinne True Tablet with its authorised wording and correctly says the restriction is 'Abdu'l-Bahá's reading of the Aqdas, not an explicit line in it. It also points to the Aqdas notes and the House of Justice letters. It gets the Aqdas location and wording wrong: 'Men of Justice' is in paragraph 52, and the 'Establish ye…' sentence is not in the authorised text. Anís cites nothing specific, retrieved nothing, and leaves the *rijál* and 'Text of the Book' question unanswered. (Perplexity 6.1 s, $0.00614)
- T4 *deepen*: **px** — Perplexity found the source text in Bahá'u'lláh's writings (Aqdas ¶52), gave the Arabic rijál, and found a second use in Q&A 99. That answers the reader's question, though its Paris Talks attribution is doubtful. Anís gave only a secondary citation of Sohrab's unofficial translation, did not use the Aqdas passage his retrieval surfaced, and gave no answer on the term. (Perplexity 5.2 s, $0.00538)
- T5 *absent*: **anis** — Anís puts the key reason in 'Abdu'l-Bahá's own written words and attributes it to Him correctly. Perplexity's sourcing is richer: the 1936 and 1952 letters written on Shoghi Effendi's behalf, plus a possible recipient. But it takes 'Abdu'l-Bahá's statement for an 'institutional explanation' by the Universal House of Justice. That is both a misattribution and an authority error, because it rests the reason on the House. Anís's answer is thin but correct, so he wins narrowly. (Perplexity 5.8 s, $0.00568)

#### return-iqan

- T1 *opening*: **px** — Perplexity is better. It points to the actual Íqán passages on return, real lines on the unity of the Manifestations and the return of their chosen ones, at section level, and it adds Luke 1:17. Its weak points are that it puts the Elijah/John discussion in the Íqán instead of Some Answered Questions ch. 33, and that some quotations may not be verbatim. Anís gives no Íqán passage at all and includes an irrelevant Epistle to the Son of the Wolf paragraph. He also misattributes Sours's prose to Bahá'u'lláh. His Some Answered Questions link is useful but thin, since he quotes only the cross-reference sentence. (Perplexity 6.5 s, $0.00586)
- T2 *reference*: **undefined** — undefined (Perplexity 5.7 s, $0.0061)
- T3 *exact_quote*: **px** — Perplexity found the actual Íqán sentence the reader wanted and correctly flagged 'single, enduring divine light' as a paraphrase, not the text. Its paragraph numbers seem off, one quotation is reworded, and one sentence comes from a different part of the book. Anís named no Íqán passage and quoted an unrelated provisional translation of the Tablet of All Food. (Perplexity 4.7 s, $0.00547)
- T4 *pushback*: **px** — Perplexity answered the pushback directly. It said the phrase was a summary, not a quotation, corrected the Gleanings mix-up, and gave the actual authorised Íqán wording with paragraph numbers and the matching Gleanings section. Anís named no source at all, didn't own up to the earlier paraphrase, and left the reader with nothing to read aloud. (Perplexity 5.2 s, $0.0057)
- T5 *deepen*: **px** — Anís's single citation is precise and correct, but he only repeats the pointer to the Íqán that the reader already had. Perplexity names the actual Íqán passages on \"return\" and gives the SAQ explanation, which is both the substance and the authoritative ranking the question needs. It does get several locations wrong: \"question 18\" instead of chapter 33, Part One instead of Part Two, and a footnote that points to the wrong file. On balance Perplexity still identifies the sources that matter. (Perplexity 5.6 s, $0.00569)

#### golden-rule

- T1 *opening*: **px** — The reader asked where Bahá'u'lláh states the Golden Rule. Perplexity quotes five real passages of Bahá'u'lláh with locations; one section number (Gleanings) looks wrong, and one quotation drops a word. Anís quotes no Bahá'í passage. He wrongly names the Tablet of Aḥmad, names the Hidden Words with no number, and relies on a secondary Townshend passage about Christ. His non-Bahá'í parallels are useful, but they do not answer the question. (Perplexity 3.5 s, $0.00345)
- T2 *reference*: **px** — The reader asked whether the passage is also in the Hidden Words. Perplexity actually looked in the Hidden Words and gave correct, numbered locations for three related passages. Anís asserted a Summons paragraph taken from a secondary index page, quoted nothing, and never checked the Hidden Words. Both missed Arabic Hidden Word 29, which states the Golden Rule directly. Perplexity's attribution of the earlier passage to Townshend is unsupported. Even so, its Hidden Words sourcing is more precise and verifiable. (Perplexity 4.1 s, $0.005)
- T3 *source*: **tie** — Both name the right source: Bahá'u'lláh, The Hidden Words, Arabic no. 68, and both give the correct opening, \"O Children of Men!\". Anís adds the paragraph number in his edition, but his reply is defensive and doesn't sort out the earlier Summons attribution. Perplexity clears up the confusion more plainly, but it accepts the reader's claim that Prayers and Meditations was cited earlier and raises an unnecessary no. 67/68 numbering doubt. Neither flags the reader's wrong address (\"O Son of Spirit!\") outright. Overall the two are about equal. (Perplexity 4.2 s, $0.00485)
- T4 *compare*: **px** — Both correctly place the 'same dust' passage at Hidden Words Arabic 68. Only Perplexity identifies and accurately quotes Luke 6:31 (with 6:32–35 as context) to answer the comparison. Anís pads his reply with irrelevant God Passes By and Epistle quotes and says his sources can't address the Bible. Anís was right to reject the reader's claim about The Earth Is But One Country, but that doesn't outweigh his failure to cite the Bible. (Perplexity 4.8 s, $0.0053)
- T5 *deepen*: **anis** — Both correctly place the passage at Arabic Hidden Word 68. The deeper question was which original word lies behind 'substance'. Anís quotes the actual Arabic (shay' wāḥid), while Perplexity gives jawhar, which seems to be made up. Perplexity tried harder on the 'where else' part (Súriy-i-Mulúk, the Persian 'O Son of Dust' addresses). But that rests on unchecked references and a likely wrong number, and it tracks the word turāb rather than the 'substance' term the reader asked about. (Perplexity 6.4 s, $0.00553)

#### 004-soul-reincarnation

- T1 *opening*: **px** — Perplexity named the actual primary texts, with locations, on all three sides: Some Answered Questions ch. 81 and Gleanings for the Bahá'í view, the Gītā and Upanishads for the Hindu view, SN 22.59, the Milindapañha and the Dhammapada for the Buddhist view. Its faults are an authority error (leaning on a House of Justice compilation for doctrine) and a loose SAQ §80. Anís's reply is a broken fragment that rests on one pilgrim's note. It ignores the Shoghi Effendi letters his own retrieval found and gives no Hindu or Buddhist source. (Perplexity 6.8 s, $0.00484)
- T2 *reference*: **px** — Anís correctly identified the passage the reader quoted: a letter written on behalf of Shoghi Effendi, in Lights of Guidance, linked to the paragraph. But his only other support is 'Abdu'l-Bahá's Some Answered Questions text credited to a secondary book, The God of Baha'u'llah. That is a misattribution that hides the primary author. It also concerns how things are known, not what they are, and he offers nothing on the Buddhist side. Perplexity grounds the Bahá'í distinction in 'Abdu'l-Bahá's own Some Answered Questions, which ranks above a letter written on the Guardian's behalf, and the quoted wording is accurate. The chapter number and title are wrong, and it never identifies the reader's actual passage. It also clearly cites scholarship (the SEP) for Buddhist anatta and rebirth. On balance Perplexity names the more authoritative and more relevant sources, and its error is about location rather than authorship, so it wins narrowly. (Perplexity 6.4 s, $0.00604)
- T3 *pushback*: **px** — Perplexity names the actual primary source for the analogy, Some Answered Questions, and so corrects the reader's assumption that it is only a pilgrim's note. It also keeps scripture, official summaries and scholarship separately labelled. Its chapter number appears to be wrong. Anís named no source at all, and he let the misattribution of the analogy to pilgrims' notes stand. (Perplexity 7.2 s, $0.00623)
- T4 *compare*: **px** — Anís's three Bahá'í quotations are correct and link to the exact paragraphs. But he names no source for the Advaita side, and he leaves out Gleanings LXXX, the passage that bears most directly on whether individuality survives. Perplexity points to Gleanings LXXX and LXXXI by section number and to Paris Talks. On Advaita it names Śaṅkara's commentary and labelled scholarship (Stanford Encyclopedia, Britannica), which answers the comparison the reader actually asked for. Its one flaw is presenting the questioner's wording in LXXX as Bahá'u'lláh's own explicit statement, and I'm unsure the Paris Talks wording is exact. On balance Perplexity covers the question's sources more completely and with usable section numbers. (Perplexity 6.4 s, $0.00625)
- T5 *exact_quote*: **px** — The reader's main request was the exact Gleanings passage, with a link. Perplexity gave it verbatim with the correct section (LXXXI) and authoritative links. Anís supplied neither the text nor a link. Anís did better on the Rāmānuja half, quoting a real-looking passage from the SBE 48 Śrī Bhāṣya, though without a sūtra number and with a mismatched URL. Perplexity gave no words from Rāmānuja at all. Because the Bahá'í scripture passage was primary and Perplexity got it fully right, Perplexity wins overall. (Perplexity 7.1 s, $0.00639)

#### seed-21

- T1 *opening*: **anis** — Both quote SAQ ch. 74 correctly. Anís gives exact quotations with paragraph links and correctly attributes the darkness letter to the Guardian's side. Perplexity credits that same passage to 'Abdu'l-Bahá, mislabels the SAQ chapter, and adds a citation to Bahá'u'lláh that I could not verify. (Perplexity 4.3 s, $0.00401)
- T2 *reference*: **px** — Perplexity confirmed the source as Some Answered Questions, chapter 74, and backed it with bahai.org links. It was right to hold back on naming a Persian term. Its one significant slip is the translator: it credits Barney rather than the 2014 World Centre revision. Anís retrieved nothing relevant, gave neither chapter nor translator, and pointed wrongly to Tablets of 'Abdu'l-Bahá. (Perplexity 5.2 s, $0.00542)
- T3 *compare*: **px** — Perplexity correctly identified the texts the reader named (Enchiridion 11, Ennead I.8) and located the Bahá'í passage by book and chapter title, though with the wrong chapter number. Anís sidestepped both requested texts and swapped in Maimonides, City of God and a secondary account of Sohravardi. He also left out the Some Answered Questions passage he had retrieved. (Perplexity 7.1 s, $0.00619)
- T4 *source*: **anis** — Anís wins. He links the sentence to the actual Star of the West passage, though he can't give the volume, issue, page or recorder, and he contradicts himself about having quoted it before. Perplexity wrongly moves the quote to Promulgation of Universal Peace and swaps in a different passage. It then tells the reader to withdraw a citation that was correct. (Perplexity 5.2 s, $0.00581)
- T5 *pushback*: **neither** — Neither answer pins down the text the reader is asking about. Anís gets the substance right: the passage as published does put the statement about evil next to the one about change and transformation. But he cites only a periodical with a bogus author credit, gives no location, and ignores the Persian. Perplexity names real Writings and a possible Persian original, but gives the wrong chapter of Some Answered Questions (80 instead of 74). It also concedes without checking that the passage does not mention evil, which contradicts the very text under discussion. (Perplexity 5.3 s, $0.00553)

#### seed-39

- T1 *opening*: **px** — Perplexity cites the Persian Bayán itself by Vahid and chapter, correctly names the Tablet of Ishráqát, and uses the Aqdas, though it has some location errors. Anís gives three thin quotations, none from the Bayán, and misses the Aqdas even though it was in his retrieval. (Perplexity 5.9 s, $0.00484)
- T2 *reference*: **px** — Perplexity correctly tells the reader the quote is not in the Aqdas, credits it to Walbridge, points to Bahá'u'lláh's real statement in official Aqdas material, and attempts the Báb's own words. It has errors: it names the Notes instead of the Introduction, includes garbled placeholder references, and its Bayán chapter numbers are unverified. Anís names the right book but gives the author as '6986', does not correct the reader's mistaken premise, and gives no primary source. (Perplexity 6.0 s, $0.00584)
- T3 *absent*: **px** — Anís could not find the Bayán location and simply repeated the irrelevant Spanish line the reader had rejected. Perplexity gave specific Bayán locations and sent the reader to Selections from the Writings of the Báb, the authorised English text, for a passage in the Báb's own words that can be read aloud. It also correctly said that the 'accept, reject or modify' wording is not scripture. Its Váḥid and Gate numbers rest on encyclopedia sites, and its Browne attribution is doubtful, so they need checking. Even so, it is far more useful and closer to correct than Anís. (Perplexity 5.3 s, $0.00569)
- T4 *exact_quote*: **px** — Perplexity answered the question the reader actually asked. It said the phrase is Walbridge's paraphrase and not the Aqdas, named the Tablet of Ishráqát with a page, and pointed to Aqdas ¶126 as the related passage. Anís gave the correct verbatim text but cited only a compilation paragraph and never said the phrase is a scholar's. He also added an unsupported Váḥid/Gate reference. Perplexity's slight change to the last clause is a smaller fault than these. (Perplexity 5.4 s, $0.00562)
- T5 *pushback*: **px** — The reader asked whose paraphrase it was. Perplexity answered: John Walbridge, Sacred Acts, Sacred Space, Sacred Time. It correctly labelled that as scholarship, not the Writings, and named the tablet the real passage comes from. Anís admitted the phrase was a paraphrase but did not name its author, even though he had quoted that very book in T2. He did quote Bahá'u'lláh's passage accurately with a paragraph link. (Perplexity 5.1 s, $0.00573)

#### seed-66

- T1 *opening*: **px** — The central text here is Bahá'u'lláh's own 'mighty torrent' account. Perplexity correctly places it in Epistle to the Son of the Wolf. Anís credits it to 'Revelation' and links to the Book of Revelation (the Apocalypse of St John), even though his own retrieval held the correct passage. Anís also presents an editors' footnote as 'Abdu'l-Bahá's words. His Citadel of Faith citation is accurate and precise, but that does not outweigh these misattributions. Perplexity has its own error: it places the Maiden vision in the Kitáb-i-Íqán. On the main source, though, it is right. (Perplexity 5.8 s, $0.00454)
- T2 *reference*: **px** — Both answers rest on the right text, Bahá'u'lláh's own account in Súratu'l-Haykal as published in Summons of the Lord of Hosts, and both quote it accurately. Perplexity is more precise and more useful. It names the actual tablet (Súratu'l-Haykal), gives ¶¶6–7, and quotes the whole vision, which shows the contrast the reader asked about. Anís gives only the book title with a paragraph link and quotes only the first sentence. (Perplexity 5.1 s, $0.00515)
- T3 *compare*: **px** — Both sourced the Maiden passage correctly to the Summons (Súriy-i-Haykal). Perplexity also gave the paragraph numbers and cited the scriptures the comparison depends on: Exodus 3:2–6 and Qur'an 96:1–5. Anís named no source for either Moses or Muhammad. He also credited Bahá'u'lláh's own words to Taherzadeh, and his Taherzadeh link points to the wrong work. (Perplexity 7.0 s, $0.00628)
- T4 *absent*: **px** — Perplexity placed Bahá'u'lláh's own account at Súratu'l-Haykal §6 and Shoghi Effendi's link at God Passes By p.101. Anís quoted the relevant chains passage but credited it only to a compilation, not to the Epistle to the Son of the Wolf. He also cited Messages to America for wording I can't confirm. Perplexity's twelve-day chronology is unsupported and lowers its score. (Perplexity 5.2 s, $0.00527)
- T5 *exact_quote*: **px** — Both identified the Epistle to the Son of the Wolf passage correctly and verbatim. Anís gave the link the reader asked for. Only Perplexity took up the second part, pointing to the right work and paragraph (Súriy-i-Haykal ¶6 in the Summons of the Lord of Hosts). Its account of what follows has problems: a dubious quotation and a wrong claim that the Maiden does not speak. Even so, it gave the reader the correct text to look at, while Anís said his sources could not settle the question. (Perplexity 4.9 s, $0.00564)

#### seed-93

- T1 *opening*: **px** — Perplexity bases its answer on authorised texts, chiefly 'Abdu'l-Bahá's own Promulgation talks and Advent of Divine Justice, and these address the distributive vs retributive question. Its locations are only at the level of the work, and the 'two pillars' passage is probably misplaced. Anís gives exact paragraph links for his Tablet to the Hague and ADJ quotes. But he relies on an unofficial Aqdas translation and a provisional blog translation, labels both 'Revealed Scripture', and quotes the Aqdas fragment garbled. He also never produces a text from 'Abdu'l-Bahá on the Most Great Justice itself. (Perplexity 4.6 s, $0.00397)
- T2 *reference*: **px** — The reader asked specifically about the 'justice and right … disorder and remain imperfect' passage. Perplexity traced it to the actual work, 'Abdu'l-Bahá's Tablets to The Hague. Anís named only the generic compilation 'Bahá'í Sacred Writings', even though the Tablet to the Hague was among his retrieved sources. Anís also presented a blog provisional translation without saying it was provisional. Perplexity has a misattribution of its own: the Secret of Divine Civilization passage is credited to Selections. Even so, it was more accurate on the passage at issue, and it backed the daily-life part of the answer with authoritative texts. (Perplexity 7.0 s, $0.00637)
- T3 *pushback*: **px** — Perplexity found the real source of the disputed passage, the First Tablet to The Hague dated 17 December 1919, and quoted it accurately. It also made a fair textual point about what 'these' refers to. Anís skipped the question about where the passage comes from. He then gave his 'air' phrase an apparently invented origin in an unrelated letter about Covenant-breaking, written on Shoghi Effendi's behalf, and quoted that letter in garbled form. (Perplexity 4.8 s, $0.00553)
- T4 *exact_quote*: **anis** — Neither answer delivered the exact passage. Anís's source identification is correct: the 'pole of justice' line comes from Some Answered Questions, and he gives a paragraph link. His only failure is that he didn't retrieve the Tablet to The Hague text. Perplexity points to the right work but makes a serious factual error: it denies that the 'justice and right … Until these are realized' sentence appears in the First Tablet to The Hague, which it does. It also misidentifies the referent of 'these' and 'withdraws' a correct quotation. A link to the right document doesn't make up for wrongly telling the reader the quoted words aren't in it. (Perplexity 5.5 s, $0.00546)
- T5 *source*: **px** — Perplexity answered the question the reader actually asked. It traced the 'pole of justice' line to its primary source, Some Answered Questions ch. 77, noted that Shoghi Effendi quotes it in The Advent of Divine Justice, and said plainly that it is not from the Hague tablet. Its mistakes are small: the wrong Part label and blended wording in the quotation. Anís answered about a different line, still cited only the secondary compilation, and named no primary work. (Perplexity 4.6 s, $0.00506)
