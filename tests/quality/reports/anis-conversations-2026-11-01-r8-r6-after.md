# Anís conversations 2026-11-01 (r8-r6-after)

10 conversations, 50 turns, 0 errors. Overall 3.02/10. Cost $7.4829 ($0.7483/conversation: Anís $0.1413, reader $0, judge $3.0754, Perplexity $0.284, source-compare judge $3.9822).
Latency p50 7.8 s, p90 13.6 s, max 22.7 s, 4 turns over 15 s.

Judged 2× per conversation: overall per judge 2.9 / 3.15; per-conversation spread mean 0.35, max 1; defects per judge 100 / 109 (defects below are judge 1's).

| dimension | mean (1–5) |
|---|---|
| grounding | 2.2 |
| citation_links | 2.5 |
| follow_up_resolution | 2.1 |
| coherence | 2.05 |
| depth | 2.1 |
| honesty_absence | 2.05 |
| authority_ordering | 2.85 |
| tone | 2.95 |
| latency | 4 |

Defects: 100 — by stage strategy 10, follow_up_context 5, retrieval 12, selection 9, answer 59, latency 5; by severity critical 16, major 49, minor 35.

## soul-after-death — seeker (conv_3d9b18e7-a4f5-4ba3-bd1e-1db9f3ef31f0)

Theme: what happens to the soul after death and whether we will know our loved ones

**3/10 (judges 3 / 3, spread 0; defects 11 / 11)** — The reader asked a grieving question that the library answers directly ('Abdu'l-Bahá: "As to the question whether the souls will recognize each other in the spiritual world: This fact is certain"), but Anís wrongly told her nothing existed, spent three turns on off-target passages, and only found the core text in the final turn.

- T1 *opening* (15.8 s, topic, history 0): Hello Anís. My grandmother passed away a few months ago, and I keep wondering where she is now, and whether I'll actually recognize her someday. Do these texts 
  - **retrieval** [critical] Retrieval surfaced newspapers, memoirs and Talmud passages instead of the Writings on the soul and on recognition after death
  - **answer** [major] False claim that the library lacks the text, plus cold boilerplate to a grieving reader
  - **latency** [minor] Over 15 s
- T2 *reference* (10.9 s, fact, history 2): That's a little disappointing, but when you say traditions approach it through their primary scriptures and commentaries, does that mean there are some in the l
  - **strategy** [major] Planned as a yes/no 'fact' question, searched as the raw message, and returned an irrelevant Íqán reference
  - **answer** [minor] Did not say that the 'primary scriptures and commentaries' remark was not made in this conversation
- T3 *deepen* (10.3 s, define, history 4): You said the texts "point to primary scriptures and their commentaries as places to search" — what does "primary scriptures" actually mean here, and which ones 
  - **answer** [major] Bluffed an etymology of 'scripture' and cited the Aqdas without quoting it
  - **answer** [major] Arabic quoted with no English for a newcomer, via a corrupted link; the authorized English (Gleanings LXXXI) was not used
- T4 *absent* (6.0 s, quote, history 6): Let's start with the Bahá'í writings, since you mentioned "various tablets concerning the soul and the afterlife" — is there a specific passage in them where it
  - **strategy** [critical] Treated the reader's quoted phrase as a quotation to look up, so the actual question about recognizing loved ones was never searched
  - **answer** [major] Misattribution, and the reply did not admit that the passage does not answer the question
- T5 *compare* (6.4 s, topic, history 8): That's more comforting than I expected, especially "the Kingdom is the world of vision where all the concealed realities will become disclosed." How does that c
  - **retrieval** [minor] The Gathas verse quoted is not about the afterlife; the Gathas' own afterlife verses were not surfaced
  - **selection** [minor] Bahá'u'lláh's own passage on souls associating after death was surfaced but not used

Top fixes:
- Add a retrieval fixture for afterlife/recognition questions: 'will I recognize my loved ones' must surface 'Abdu'l-Bahá's 'souls will recognize each other' tablet and Gleanings LXXXI/LXXXVI. Never claim a text is absent when retrieval found only off-topic material
- Do not treat a phrase the reader quotes from Anís's earlier reply as a quotation to look up; plan the search from the reader's actual question, combined with the earlier-turn referent
- Remove the 'experimental AI' opener and the stock authority-layer paragraphs; open with warmth to a grieving reader, and give English translations alongside Arabic

## detachment-buddhism — skeptic (conv_4339d17d-a064-49f9-8fcc-776b7b6df207)

Theme: detachment in the Bahá'í Writings, compared with non-attachment in Buddhism

**2.75/10 (judges 2.5 / 3, spread 0.5; defects 9 / 11)** — Anís handled the Buddhist-text lookups in turns 3 and 4 reasonably, but turn 1 promised three statements and showed none, and turn 5 answered the reader's challenge about a Pali passage with an unrelated study of an Arabic root.

- T1 *opening* (13.6 s, topic, history 0): Hello. I've read that the Bahá'í Writings put a lot of weight on "detachment," and I'm trying to work out whether it's really the same thing as Buddhist non-att
  - **retrieval** [critical] No passages on detachment were retrieved (retrieved:0). The four sources surfaced are off-topic: a God Passes By scene with Mamaqani, a thesis interview, and two talk transcripts.
  - **answer** [critical] The reply promises three statements and shows none, then summarizes as if they had been quoted.
  - **answer** [major] False claim that the library holds nothing on Buddhism.
- T2 *reference* (12.5 s, quote, history 2): That third one, "not meant giving away and depleting all one's wealth", is interesting, but what does it say detachment *is* if not that? Does the passage give 
  - **answer** [minor] The quotes link to the bare work URL rather than the paragraph. The phrase the reader cited is never shown in context, and Anís does not note that he did not quote it in this conversation.
- T3 *exact_quote* (13.0 s, quote, history 4): The Sutra Collection line about "the absence of attributes indicates negation" reads like a fragment of an argument, and I can't tell whether it's about virāga 
  - **answer** [major] Anís presents the same five sentences as the 'full passage' and says it concerns virāga. It is actually the Śūraṅgama dialogue with Ānanda about where the mind is located. The sutra is not identified, and one source is mislabelled [Baha'i].
  - **answer** [minor] Sycophantic opening, and a closing gloss about 'dismantling the very categories of existence' that rests on no text.
- T4 *absent* (7.7 s, quote, history 6): So you can't give me the fuller passage or a location, and your own earlier claim about Buddhist texts "deconstructing clinging itself" rests on a fragment you 
  - **answer** [major] A modern commentator's prose is presented as a Buddhist sutra passage in answer to a request for the Buddha's own words. The markdown link is also nested and broken.
- T5 *pushback* (3.9 s, define, history 8): You say this passage shows "the systematic release of specific supports... whose cessation brings an end to becoming," but the text itself only poses a rhetoric
  - **strategy** [critical] A pushback about a Buddhist passage was routed as a 'define' term study. The reply analyses the Arabic root تجرد and ignores the question entirely.
  - **answer** [minor] The table contradicts itself, and the reply claims 'a wide range of renderings' while showing only one.

Top fixes:
- Route pushback and challenge turns ('is that your gloss?', 'does the sutra use the word') to a verification strategy built on the previous turn's passages. Never route them to term_study or define.
- Add an output check that blocks replies which announce quotations ('Here are three statements:') but contain none, and that rejects nested or broken markdown links.
- Tag Buddhist sources as scripture or commentary in retrieval metadata, and have the answer label commentary when the reader asks for the Buddha's own words. Also fix the 'no Buddhism in library' claim by checking which traditions the library actually holds.

## equality-sexes — scholar (conv_bd3903d1-4fd2-439c-a1bd-c3b7f6857468)

Theme: the equality of women and men, and how it squares with the membership of the Universal House of Justice

**3/10 (judges 3 / 3, spread 0; defects 14 / 14)** — Turn 1 surfaced the key primary texts: 'Abdu'l-Bahá's Tablet to Corinne True and the 15 July 1947 letter written on the Guardian's behalf. From then on Anís lost track of them, denied having material he had already shown, never gave the dates and recipients the scholar asked for, and fell back on a hadith dictionary and an unrelated memoir.

- T1 *opening* (5.7 s, topic, history 0): Hello Anís. I'm trying to understand how the Bahá'í principle of the equality of women and men is reconciled with the restriction of Universal House of Justice 
  - **selection** [major] Ignored the most primary text in the sources, 'Abdu'l-Bahá's own Tablet to Corinne True, and the dated Lights of Guidance letter, even though the reader asked for exact titles and dates.
  - **answer** [minor] Uncompiled Letters blockquote has no paragraph link, and letters written on his behalf are presented as Shoghi Effendi's own words.
  - **answer** [minor] Unsourced paragraph about what historians say, and a claim that the Aqdas has no verse on this, which contradicts the Aqdas note and the Corinne True 'Text of the Book' in its own sources.
- T2 *reference* (12.7 s, quote, history 2): That second passage worries me: you attribute the "wisdom of it will be fully revealed in the future" line to Shoghi Effendi explaining a Tablet, yet cite *Unco
  - **strategy** [major] The 'quote' plan latched onto the reader's paraphrase 'dated around the mid-20th century' as a phrase to find, instead of tracing the provenance of the letter quoted in turn 1.
  - **answer** [major] Cited an irrelevant memoir as if it bore on the question, and did not use the provenance details already shown in turn 1.
- T3 *compare* (11.5 s, topic, history 4): Your two replies now attribute that "wisdom" line differently: first to 'Abdu'l-Bahá via Shoghi Effendi, then to Bahá'u'lláh. Setting that aside, how does the p
  - **retrieval** [major] The Corinne True letter from turn 1 was not brought back. Anís then said it was absent.
  - **answer** [major] Authority error: the Universal House of Justice is presented as an interpreter of scripture.
  - **selection** [minor] Used a hadith biographical dictionary and unsourced claims about the Qur'an as lexical evidence for rijál.
  - **answer** [minor] Agreed to attribution errors (to Bahá'u'lláh) that this conversation never contained.
- T4 *deepen* (18.7 s, define, history 6): You quote Bahá'u'lláh's phrase «O ye men of the House of Justice!» from *Abdu'l-Bahá in Egypt* by Sohrab, but what is the original term behind "men" there, and 
  - **retrieval** [major] Found no instances of rijál in the Writings and no original text, although the Arabic Aqdas had come up in turn 3 and the Momen/Buck studies on rijál-i bayt-i 'adl were in the library (turn 5).
  - **answer** [major] The reply is cut off. It also says the original Arabic is absent, contradicting the previous turn, and links the wrong work.
  - **latency** [minor] 18.7 s, over the 15 s threshold.
- T5 *absent* (9.3 s, quote, history 8): Since Momen's study gives *rijál-i bayt-i 'adl-i iláhí*, is there a passage where 'Abdu'l-Bahá or Shoghi Effendi explicitly states the reason for confining memb
  - **follow_up_context** [major] Searched only the transliterated phrase, without the earlier Tablet as referent, and did not give the recipient that was already established.
  - **selection** [minor] Momen's study, which was surfaced in this turn and which the reader asked about, was not used.

Top fixes:
- Carry the sources from earlier turns into the follow-up context (especially metadata such as dates and recipients), and do not claim absence when an earlier turn surfaced the text.
- Do not treat a phrase the reader paraphrases from a prior reply as a quote to search. Route provenance questions to metadata lookup for the cited work.
- Add an authority check that blocks describing the Universal House of Justice as interpreting scripture and that labels letters written on Shoghi Effendi's behalf. Add an output check that rejects truncated replies and links pointing to a different work.

## return-iqan — study_leader (conv_fc4a46fc-89bd-443d-9928-bfed760c1bfb)

Theme: what the Kitáb-i-Íqán means by the "return" of the Prophets

**2.25/10 (judges 2 / 2.5, spread 0.5; defects 8 / 8)** — Anís found the right Íqán paragraphs (¶174, ¶29, ¶30) in turn 1 but never quoted them properly. One quote stitched an Íqán line onto a Some Answered Questions line and credited the result to 'Abdu'l-Bahá. Then he wrongly told the reader three times that these passages couldn't be found, and agreed to mistakes he hadn't made in this run.

- T1 *opening* (6.6 s, topic, history 0): Hello Anís, I'm preparing a study session on the Kitáb-i-Íqán and want to focus on what it means by the "return" of the Prophets, like how John the Baptist is E
  - **answer** [critical] Quote stitched from two works and credited to the wrong author
  - **selection** [major] Retrieved Íqán ¶29 (Jesus's return) was left out, and the reply never explains how the passages connect
  - **retrieval** [minor] Íqán passages on the return of names and attributes, which John/Elijah would illustrate, were not surfaced
- T2 *reference* (6.9 s, quote, history 2): The four lines you mentioned didn't come through on my end, only the summary after them. Could you send them again with where each one is found? I'd like to ope
  - **strategy** [critical] A request to resend earlier passages was planned as an exact-quote search of the reader's own message
- T3 *exact_quote* (11.1 s, quote, history 4): I can narrow it down: I want the Íqán passage where it says the Prophets are all one reality, the "single, enduring divine light" you mentioned in your summary.
  - **strategy** [major] After the exact phrase wasn't found there was no fallback search on the topic, so the passage the reader actually wanted was never given
- T4 *pushback* (4.4 s, quote, history 6): Two things in that last reply don't sit right with me: you said the quote is "drawn from the Kitáb-i-Íqán" yet placed it at Gleanings paragraph 148, and earlier
  - **answer** [major] He agreed to the reader's charge without checking it and refused to confirm wording the library holds
- T5 *deepen* (13.2 s, original, history 8): You quoted 'Abdu'l-Bahá saying Bahá'u'lláh gave a "lengthy and detailed explanation" of the return of the Prophets, so what does "return" actually mean in that 
  - **selection** [major] The Some Answered Questions chapter he retrieved has the actual explanation (John/Elijah, return of qualities), but he used only its circular opening line
  - **answer** [major] The original-language term is stated with no source, and its spelling and form are doubtful

Top fixes:
- Before searching, check whether a follow-up is asking to resend or confirm earlier passages, and answer it from the previous turn's sources (¶174 etc.) instead of running an exact-quote search on the reader's own words
- When an exact-phrase search comes back empty, run a topic search on the same subject before replying with 'not found'; and don't concede to a reader's correction without checking the conversation and the sources
- Add an output check that rejects quotes stitched from two source passages and verifies each quote's author and work against the snippet it came from

## golden-rule — non_native (conv_4b4b1010-b896-41b7-8691-d07dc81853e7)

Theme: the Golden Rule across the world's scriptures, and where the Bahá'í Writings state it

**3/10 (judges 3 / 3, spread 0; defects 0 / 10)** — Turn 1 was solid, then the conversation fell apart. In turn 2 Anís missed the Hidden Word that states the Golden Rule and linked his quote to a pilgrim's note. In turn 3 he called Arabic Hidden Word 68 "Persian 68", and that error led him to quote an unrelated Hidden Word in turn 5. He also never put a Bible verse beside the Bahá'í text.

- T1 *opening* (7.8 s, quote, history 0): Hello Anís. I am looking for the Golden Rule in many religions, like "do to others what you want for yourself". Where Bahá'u'lláh say this in the Bahá'í Writing
- T2 *reference* (5.5 s, fact, history 2): This passage you just quoted is very clear, thank you. Is it also in the Hidden Words, or only in this Summons?
- T3 *source* (9.3 s, quote, history 4): Wait, you say this is in the Hidden Words, but under the quote I see *Prayers and Meditations*. Which book is it really from, and what is the number or page of 
- T4 *compare* (8.5 s, topic, history 6): OK, now I understand it is Hidden Words, but the number is still not clear for me. You said the passage is quoted in *The Earth Is But One Country*. How does th
- T5 *deepen* (3.7 s, original, history 8): You say the Bahá'í text is "ontological" and talks about "same substance". What is the original word in Arabic or Persian for this, and where else in the Writin

## 004-soul-reincarnation — skeptic (conv_25b53324-da39-4a01-ac30-c729b0e7817b)

Theme: The Bahá'í Soul, Buddhist Anatta, and the Limits of Both/And

**3/10 (judges 3 / 3, spread 0; defects 15 / 14)** — Asked outright for the full Gleanings passage with its link, Anís gave a "full passage" that is partly made up and blends two different Gleanings selections, still with no link, while saying he was glad the reader caught the missing link. That breaks trust in an otherwise careful, well-paced conversation.

- T1 *opening* (7.1 s, topic, history 0): How does the Bahá'í concept of the soul differ from the Hindu and Buddhist concepts of reincarnation? I want a sharp answer — not 'all religions teach about the
  - **retrieval** [major] No Hindu or Buddhist scripture was surfaced, and neither was 'Abdu'l-Bahá's SAQ chapter on reincarnation, although the reader asked for a sharp ontological comparison.
  - **selection** [major] Relevant sources that were surfaced went unused: the Getsinger record of 'Abdu'l-Bahá on the 'two aspects' of Hindu reincarnation, and the 'essentially different from the Hindu conception' passage.
  - **answer** [major] False claim of absence: the library holds Hindu and Buddhist texts.
- T2 *reference* (9.1 s, topic, history 2): That passage says the Bahá'ís accept a "return of the attributes and qualities" but not of "the essence or the reality of things" — but what does that distincti
  - **retrieval** [major] No Buddhist source on anattā or the skandhas was surfaced. Off-topic or garbled texts were surfaced instead: a prayer, OCR noise from the Arabic Bayán, the Isolated Letters commentary.
  - **answer** [minor] The account of Buddhist doctrine is put under the heading 'scholarship and history' but cites no source, and it asserts that the soul 'persists eternally' even though the quoted passage speaks of 'every being'.
- T3 *pushback* (8.6 s, quote, history 4): You say the distinction is that individual identity and "the essence or the reality of things" "remain distinct and do not return" — but the Shoghi Effendi pass
  - **strategy** [major] A pushback turn was sent down the quote strategy, searching for the phrase 'remain distinct and do not return', which is not a text in the library. The result was junk retrieval (Tao Te Ching on disputes).
  - **answer** [minor] He accepts that he made the lamp-and-flower claim without saying it was never made in this conversation. The pilgrim-note quotation he offers instead is about the Trinity, not the soul.
  - **answer** [minor] The standing of pilgrims' notes is settled by pointing to what scholars say, instead of placing them by the authority order: below the written text, above scholarship.
- T4 *compare* (7.0 s, topic, history 6): You cite Shoghi Effendi's line that the soul keeps "developing and unfolding and returning towards its Creator" while rejecting return to new bodies. How does t
  - **answer** [major] Gleanings is credited with something it does not say: it never mentions 'distinct identity'.
  - **answer** [minor] Wrong name for the work in the link label. The account of Advaita is unsourced even though a Vedānta source was surfaced, and it never says that Rāmānuja, unlike Advaita, preserves individuality.
  - **answer** [minor] The reader asked whether the text gives a reason why individuality survives. That reason, which is in the SAQ passage, is never stated.
- T5 *exact_quote* (8.8 s, quote, history 8): You quote Bahá'u'lláh that the soul "will continue to progress until it attaineth the presence of God," but that's one sentence, and you cited Gleanings twice w
  - **retrieval** [critical] The Gleanings passage the reader explicitly asked for was not surfaced. The search query was a cluttered mix of the reader's words.
  - **answer** [critical] A quotation presented as 'in full' is partly made up and blends two Gleanings selections.
  - **answer** [major] Gleanings is still unlinked straight after he apologises for the missing link. The Rāmānuja link points to a different work (hymns-of-atharva-veda).
  - **answer** [minor] On whether the passage states that individuality survives, he overclaims 'a distinct entity'.

Top fixes:
- When the reader asks for 'exact passage in full', carry forward sources already cited in earlier turns (e.g. Gleanings para_474), and add an output check that blocks any block quote not found word for word in the surfaced sources.
- Route pushback turns away from the quote strategy when the quoted phrase is Anís's own wording, not a text. Search for primary texts on the disputed concept instead.
- For comparative questions, require retrieval from the other tradition's scripture (Pali Canon, Upaniṣads, Gita) before Anís says 'the texts here do not settle this'. Validate that each link's slug matches the work named.

## seed-21 — scholar (conv_3c3720aa-1b53-4b2e-9ed2-b983149aea8c)

Theme: Evil — Privation, Active Force, or Necessary Shadow?

**3/10 (judges 3 / 3, spread 0; defects 12 / 10)** — Retrieval turned up the right texts, including the Arabic tablet with «امر عدمی» and the Star of the West talk on evil, but Anís invented facts about the source of the Some Answered Questions passage, quietly swapped in other works for Augustine and Plotinus, and in turn 5 wrongly told the reader the passage never mentions evil, when the text he had just retrieved says it in its first line.

- T1 *opening* (7.2 s, topic, history 0): Do the Bahá'í writings handle evil as the mere privation of good (Augustinian), as an active force, or as a necessary shadow that makes good visible?
  - **selection** [major] Ignored sources that bear directly on the 'active force' option and on original-language terms.
  - **answer** [minor] Overclaim, plus a scholarly link with no paragraph.
  - **answer** [minor] The 'necessary shadow' option the reader asked about is never addressed.
- T2 *reference* (11.4 s, original, history 2): Regarding the first one you quoted: is that actually from Some Answered Questions, and which chapter and whose translation? I'd also like to know whether 'mere 
  - **answer** [critical] Self-contradiction, a wrong chapter number, and a fabricated translator/recorder history.
  - **retrieval** [major] The original-text search returned the wrong chapter and missed the Persian of SAQ 74 and the Arabic tablet already in hand.
  - **follow_up_context** [minor] The search used the bare 'first one you quoted' rather than the quoted SAQ sentence.
- T3 *compare* (7.2 s, topic, history 4): You said evil is "much as cold is the absence of heat or darkness the absence of light." How does that compare with Augustine's formulation in the Enchiridion (
  - **answer** [major] Did not say the Enchiridion and the Ennead are missing from the sources; quietly swapped in other works. Also did not say he had not used the cold/heat analogy in this conversation.
  - **answer** [minor] The same SAQ quote is repeated a third time, and the Gutenberg link is book-level.
- T4 *source* (7.8 s, quote, history 6): That last quotation about change and transformation, "if change and transformation does not exist, then there can be no composition and growth", you attribute t
  - **answer** [major] Cut out the part of the retrieved passage that is about evil, and kept the periodical as the author credit after the reader criticized it.
- T5 *pushback* (19.5 s, quote, history 8): The Persian you quoted reads «ترکیب و تربیت اشیا» (*tarkīb va tarbiyat*, "composition and training/nurture"), not "growth", and its subject is *aḍdād* (opposite
  - **follow_up_context** [critical] Lost the turn-4 passage and wrongly conceded that it never mentions evil.
  - **answer** [major] Sycophantic agreement with Persian he never retrieved, then an irrelevant deflecting quote.
  - **latency** [major] Too slow.

Top fixes:
- Carry quoted text and source IDs from earlier turns into follow-up planning and search, so a pushback is checked against the actual earlier passage instead of conceding by default.
- Block invented provenance: chapter numbers, translators and recorders must come from source metadata, and the 2014 SAQ translation must be distinguished from Barney's.
- When a named work (Enchiridion, Ennead) is missing from the sources, say so explicitly instead of substituting other works; use original-language sources already retrieved (AB07049) to answer term questions.

## seed-39 — study_leader (conv_5ac9df59-36e1-4db5-bcc8-c453c41bb0b2)

Theme: What Did the Báb's Bayán Actually Teach?

**2.25/10 (judges 2.5 / 2, spread 0.5; defects 10 / 11)** — Anís never told the reader that "accept, reject or modify as He chose" is John Walbridge's commentary, although his own sources labelled it Walbridge in turns 2 and 4. Instead he went from a Spanish line that didn't answer the question, to an unfinished non-answer, to "provenance not settled", and he never gave the group a passage in the Báb's own words.

- T1 *opening* (7.8 s, topic, history 0): The Báb's Bayán contains laws and teachings that Bahá'u'lláh subsequently abrogated or fulfilled. What was the Bayán actually teaching, and how should a Bahá'í 
  - **retrieval** [major] No primary Bayán text (e.g., Selections from the Writings of the Báb, Persian Bayán excerpts) was surfaced, so the core question of what the Bayán taught got no answer.
  - **answer** [minor] Scholarship is placed under the scripture heading, and some citations have no links.
- T2 *reference* (7.2 s, source, history 2): That second quote about the Báb's laws being a gift that Bahá'u'lláh could "accept, reject or modify as He chose" is something I could read aloud to the group, 
  - **strategy** [major] The two-part request (where the passage is, plus the Báb's own words) was handled as a single source hunt with no search_query, and it returned one Spanish document.
  - **answer** [major] He quoted an unrelated Spanish phrase as the answer and mentioned the real source (Walbridge) only in passing.
- T3 *absent* (22.7 s, quote, history 4): That Spanish line, "Él hace lo que desea y ordena lo que Le place", isn't the "accept, reject or modify" wording I asked about, so I still don't have a source f
  - **retrieval** [major] Only irrelevant texts were surfaced (Lights of Guidance on Counsellors, Smith on historians), and no Bayán text at all.
  - **answer** [major] He described the earlier line wrongly, and the reply stops mid-thought without the promised content.
  - **latency** [minor] Slow turn.
- T4 *exact_quote* (7.5 s, quote, history 6): Anís, you've now given me that same Spanish line twice and it still doesn't answer what I asked. Back in your first reply you quoted the Aqdas as saying the Báb
  - **answer** [major] The quote is credited to the Aqdas 'explanatory notes' and the link goes to the Aqdas root page. The source is Walbridge's commentary.
- T5 *pushback* (6.7 s, quote, history 8): In your first reply you put "accept, reject or modify as He chose" in quotation marks and attributed it to the Kitáb-i-Aqdas, but the passage you just gave me s
  - **answer** [major] He didn't answer 'whose commentary?' even though Walbridge had already been identified, and he hinted the phrase comes from the House's notes.
  - **selection** [minor] Bahá'u'lláh's words are quoted through a secondary book, with a garbled interpolation, even though the primary source (Aqdas note 109) was surfaced in turn 1.

Top fixes:
- Keep track of where each quote came from across turns: when a phrase was traced to a named author (Walbridge), reuse that attribution and don't regress to 'provenance not settled' or misattributions.
- When a quoted-phrase lookup hits a non-English or off-topic match, don't present it as the answer. Prefer the English source and say plainly whether it matches.
- Index and retrieve the Báb's primary texts (Selections from the Writings of the Báb, Persian Bayán excerpts) for questions about the Bayán, and stop using the reader's whole message as the search query.

## seed-66 — non_native (conv_65bd2c09-681d-4486-a08f-ebc315e5a657)

Theme: What Did Bahá'u'lláh Do in the Síyáh-Chál?

**5.5/10 (judges 5 / 6, spread 1; defects 8 / 9)** — Anís quotes Bahá'u'lláh's own Síyáh-Chál accounts correctly and links them, but in turn 3 he wrongly says no authoritative text compares the experience to Moses or Muhammad. Shoghi Effendi's passage in Messages to America makes exactly that comparison, and Anís cites it in turn 4 without ever correcting himself. Turn 2 also credits a passage by Bahá'u'lláh to the Báb and shows a raw source ID to the reader.

- T1 *opening* (6.7 s, fact, history 0): Bahá'u'lláh was imprisoned in the Síyáh-Chál (Black Pit) of Tehran in 1852 — the moment of his revelation. What happened in that pit, and why does it matter tha
  - **answer** [minor] The 'why does it matter' half of the question is answered with an unsourced generality.
- T2 *reference* (7.2 s, topic, history 2): You said "the striking contrast" between the outside and the inside. Can you show me the passage where He Himself describes it, I mean the Maid of Heaven, not o
  - **answer** [major] A passage by Bahá'u'lláh is credited to the Báb, and a raw source ID is shown to the reader.
  - **answer** [minor] The blockquote markdown is broken: the quote runs inline after 'writing: >'.
- T3 *compare* (5.9 s, quote, history 4): You said the Maiden came "suspended in the air" with a "call which captivated the hearts." Is this like Muhammad and the angel Gabriel in the cave of Hira, or M
  - **strategy** [critical] The quote rule turned a comparison question into a phrase lookup for 'call which captivated the hearts'. Shoghi Effendi's comparison passage was therefore never searched for.
  - **answer** [major] The reply says no authoritative comparison exists when one does.
- T4 *absent* (6.9 s, fact, history 6): You said Shoghi Effendi links these experiences, and that Bahá'u'lláh was in "heavy chains." Can you give me the exact date when the Maid of Heaven first appear
  - **answer** [major] Contradicts turn 3 without acknowledging it.
  - **answer** [minor] The claim from A Traveler's Narrative is not grounded and the link has no paragraph. The chains quote is cited to a compilation rather than to the Epistle.
- T5 *exact_quote* (9.7 s, quote, history 8): You said He recalls "the galling weight of the chains and the stench-filled air allowed Me but little sleep." Can you give me the full passage with the link, wh
  - **answer** [minor] The dream account was surfaced but only a three-word fragment is quoted. The reader's 'what happened right after' is left mostly unanswered.

Top fixes:
- Do not let the quote rule override comparison or explanation questions just because the reader quotes a phrase from an earlier reply. Search the topic, and use the phrase only as a supplement.
- Before making a 'the texts do not contain X' claim, run a focused retrieval for X. When a later turn finds X, have the answer stage correct the earlier claim explicitly.
- Fix attribution metadata for personal compilations: label quoted text by its real author (match it against canonical sources such as Gleanings) and never show numeric IDs like '5480' to the reader.

## seed-93 — seeker (conv_bd6fdd6f-01b5-42bc-ad6a-7c5b9a7bd7ee)

Theme: What Did 'Abdu'l-Bahá Mean by 'The Most Great Justice'?

**2.5/10 (judges 2 / 3, spread 1; defects 13 / 11)** — Anís answered the "these" question correctly in turn 2, then gave it up under pushback and invented a wrong referent. Next he claimed the Tablet to the Hague passage wasn't available, though he had quoted and linked it twice, and in the end he never said who wrote the "pole of justice" line.

- T1 *opening* (6.6 s, topic, history 0): 'Abdu'l-Bahá speaks of 'the Most Great Justice' as a foundation of the new world order. Is this distributive justice, retributive justice, or something more lik
  - **answer** [major] The reply is cut off in the middle of a sentence and a link.
  - **answer** [major] The reply does not answer the distributive/retributive/metaphysical question. It also does not say whether the library holds 'Most Great Justice' as a phrase.
  - **answer** [minor] The Aqdas parallel and Paradise of Justice quotes have no paragraph links.
- T2 *reference* (5.2 s, topic, history 2): The second one you quoted, about things being "in disorder and remain imperfect" until these are realized, makes me wonder what "these" actually refers to there
  - **answer** [major] A sentence quoted from Buck and Khademi's scholarly study is presented as Bahá'u'lláh's 'Revealed Scripture'.
  - **answer** [minor] The 'Authorized Interpretation' bullet quotes nothing, and the daily-life answer is a generic sentence.
- T3 *pushback* (7.2 s, quote, history 4): You said "these" refers directly to "justice and right," but is that actually what the Tablet to the Hague says, or are you reading it in? And the line about ju
  - **strategy** [critical] The pushback was planned as a quote hunt for the reader's phrase, so the Hague text was never fetched again to check it.
  - **answer** [critical] Anís gives up a correct reading and invents a false referent for 'these'.
  - **answer** [major] Anís confesses to a phrase he did not say in this conversation.
- T4 *exact_quote* (6.7 s, quote, history 6): That quote about the "pole of justice, and not of forgiveness" is striking, but you cited *The Pattern of Baha'i Life*, which doesn't sound like 'Abdu'l-Bahá's 
  - **follow_up_context** [critical] The search followed the 'pole of justice' phrase and dropped the reader's main request, the Hague passage. Anís then wrongly says he doesn't have it.
  - **answer** [minor] Anís apologises for a claim he never made.
- T5 *source* (13.4 s, quote, history 8): You called that line "the original words of 'Abdu'l-Bahá" but still credited it to *The Pattern of Baha'i Life*, so who actually said it, and in which book, tab
  - **follow_up_context** [major] The search looked for the reader's wrapper phrase, not the 'pole of justice' line, so nothing useful came back.
  - **answer** [critical] Anís does not answer 'who said it and where', although turn 4 had already established it. He again says the Hague passage is unavailable.
  - **latency** [minor] 13.4 s, mostly the original and source-hunt stages, for an empty reply.

Top fixes:
- When the reader pushes back, fetch the cited passage again and check it before conceding. Never give up a reading the text supports, and never invent a replacement referent.
- For follow-ups, add the earlier turns' cited passages (URLs and paraIds) to the candidate set, so a text already quoted is never reported as 'not available'.
- Quote strategy should not search for phrases the reader quotes back from Anís's own replies. It should take the actual thing being asked about from the conversation and answer the 'who and where' question directly.

## Perplexity comparison (sources)

50 turns compared (50 Perplexity answers, 0 Perplexity failures, 0 judge failures). Winner: Anís 9 · Perplexity 37 · tie 0 · neither 1.
Cost: Perplexity $0.284 ($0.00568/turn, p50 5736 ms), comparison judge $3.9822 ($0.07964/turn).

### Missed but in the library (90) — Anís retrieval/selection defects

- soul-after-death T1: **Bhagavad Gita** [book] → The Bhagavad-Gita (doc 21038, by title)
  - checked: find-document "Bhagavad Gita" → Bhagavad Gita (in The Bhagavad Gita (Song Celestial, tr. Edwin Arnold), paragraphs 12-undefined) (17365); The Bhagavad-Gita (21038); Bhagavad-Gita and the Baha'i Faith (282917)
- soul-after-death T2: **Bahá'u'lláh and the New Era** (J.E. Esslemont) [book] → Bahá’u’lláh and the New Era (doc 20813, by title)
  - checked: find-document "Bahá'u'lláh and the New Era" → Bahá’u’lláh and the New Era (20813); Bahá’u’lláh and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (125); Baha'u'llah and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (27740)
- soul-after-death T2: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- soul-after-death T2: **Bahá'í Sacred Writings** (Bahá'u'lláh) [compilation] → Bahá’í Sacred Writings (doc 20777, by title)
  - checked: find-document "Bahá'í Sacred Writings" → Bahá’í Sacred Writings (20777); Tag: - Bahai Sacred Writings (book) (284267); Fire and Light: Excerpts from the Baha'i Sacred Writings (22261)
- soul-after-death T4: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶335 coverage 1.00
- soul-after-death T4: **Bahá'u'lláh and the New Era** (J. E. Esslemont (quoting 'Abdu'l-Bahá)) [book] → Bahá’u’lláh and the New Era (doc 20813, by title)
  - checked: find-document "Bahá'u'lláh and the New Era" → Bahá’u’lláh and the New Era (20813); Bahá’u’lláh and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (125); Baha'u'llah and the New Era Regarding the Explanation of Daniel 12:12: Beckwith's Allegations (27740) | phrase search → Bahá’u’lláh and the New Era (20813) ¶891 coverage 1.00
- detachment-buddhism T1: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title)
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679) | phrase search → The Hidden Words of Bahá’u’lláh (20809) ¶18 coverage 1.00
- detachment-buddhism T1: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title)
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679)
- detachment-buddhism T1: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827) | phrase search → Fountain of Wisdom : Tablets of Bahá’u’lláh (20781) ¶363 coverage 1.00
- detachment-buddhism T1: **Paris Talks** ('Abdu'l-Bahá) [talk] → Paris Talks (doc 20908, by title)
  - checked: find-document "Paris Talks" → Paris Talks (20908); Paris Talks: Study Guide (23579); Paris Talks: Study Guide (28930) | phrase search → Paris Talks (20908) ¶357 coverage 1.00
- detachment-buddhism T1: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → Selections from the Writings of ‘Abdu’l-Bahá (doc 20910, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Selections from the Writings of ‘Abdu’l-Bahá (20910) ¶687 coverage 1.00
- detachment-buddhism T2: **Divine Philosophy** ('Abdu'l-Bahá (compiled by Isabel Fraser Chamberlain)) [book] → Divine Philosophy (doc 20904, by title)
  - checked: find-document "Divine Philosophy" → Divine Philosophy (20904); Divine Philosophy (8308); Divine Philosophy (7189) | phrase search → Divine Philosophy (20904) ¶453 coverage 1.00
- detachment-buddhism T2: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶486 coverage 1.00
- detachment-buddhism T3: **Saṃyutta Nikāya 22.63 (Upādiyamāna Sutta)** (the Buddha (tr. Maurice Walshe)) [tablet] → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (doc 19396, by quote)
  - checked: find-document "Saṃyutta Nikāya 22.63" → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (19396) | documents?q → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (19396) | phrase search → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (19396) ¶1 coverage 0.88
- detachment-buddhism T3: **Saṃyutta Nikāya 22.121 (Upādāna Sutta)** (the Buddha (tr. Thanissaro Bhikkhu)) [tablet] → Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (doc 19374, by quote)
  - checked: find-document "Saṃyutta Nikāya 22.121" → Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (19374) | documents?q → Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (19374) | phrase search → Samyutta Nikaya 22.121 - Upadana Sutta: Clinging (19374) ¶3 coverage 1.00
- detachment-buddhism T3: **Saṃyutta Nikāya 12.52 (Upādāna Sutta)** (the Buddha) [tablet] → Anguttara Nikaya 10.92 - Vera Sutta: Animosity (doc 18890, by quote)
  - checked: find-document "Saṃyutta Nikāya 12.52" → Samyutta Nikaya 12.52 - Upadana Sutta: Clinging (19325) | documents?q → Samyutta Nikaya 12.52 - Upadana Sutta: Clinging (19325) | phrase search → Anguttara Nikaya 10.92 - Vera Sutta: Animosity (18890) ¶15 coverage 1.00
- detachment-buddhism T5: **Saṃyutta Nikāya 22.63 (Upādiyamāna Sutta)** (Buddha (tr. Walshe)) [book] → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (doc 19396, by quote)
  - checked: find-document "Saṃyutta Nikāya 22.63" → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (19396) | documents?q → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (19396) | phrase search → Samyutta Nikaya 22.63 - Upaadiyamaano Sutta: Clinging (19396) ¶1 coverage 0.53
- equality-sexes T1: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [tablet] → Selections from the Writings of ‘Abdu’l-Bahá (doc 20910, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Selections from the Writings of ‘Abdu’l-Bahá (20910) ¶265 coverage 1.00
- equality-sexes T1: **Women: Extracts from the Writings of Bahá'u'lláh, 'Abdu'l-Bahá, Shoghi Effendi and the Universal House of Justice** (Shoghi Effendi (letter on his behalf, 28 July 1936)) [compilation] → Women (doc 20874, by quote)
  - checked: find-document "Women: Extracts from the Writings of Bahá'u'lláh, 'Abdu'l-Ba…" → Women (20874) | documents?q → Women (20874) | phrase search → Women (20874) ¶76 coverage 1.00
- equality-sexes T2: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → Messages from the Universal House of Justice: 1986-2001 (doc 366, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Messages from the Universal House of Justice: 1986-2001 (366) ¶1152 coverage 1.00
- equality-sexes T2: **Women (compilation of the Research Department) / Universal House of Justice letter of 31 May 1988 to the NSA of New Zealand** (Letter written on behalf of Shoghi Effendi, 28 July 1936) [letter] → Women (doc 20874, by quote)
  - checked: find-document "Women (compilation of the Research Department) / Universal H…" → none | documents?q → none | phrase search → Women (20874) ¶76 coverage 1.00
- equality-sexes T3: **Tablet of 'Abdu'l-Bahá to Corinne True (women and the House of Justice)** ('Abdu'l-Bahá) [tablet] → Letter to Corinne True re Women on the House of Justice (doc 16858, by quote) — was in Anís's sources
  - checked: find-document "Tablet of 'Abdu'l-Bahá to Corinne True" → Words to Corinne True spoken in 1907 (provisional translation) (982152); Words to Corinne True spoken around 1912-Jun-17 (provisional translation) (982386); Words to Corinne and Arna True spoken in Feb. 1907 (provisional translation) (981162) | documents?q → Words to Corinne True spoken in 1907 (provisional translation) (982152); Words to Corinne True spoken around 1912-Jun-17 (provisional translation) (982386); Words to Corinne and Arna True spoken in Feb. 1907 (provisional translation) (981162) | phrase search → Letter to Corinne True re Women on the House of Justice (16858) ¶10 coverage 1.00
- equality-sexes T3: **The Kitáb-i-Aqdas (Notes)** (Bahá'u'lláh / Universal House of Justice (notes)) [book] → Kitáb-i-Aqdas (doc 924862, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → The Local Spiritual Assembly (945923) ¶0 coverage 1.00
- equality-sexes T4: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307)
- equality-sexes T4: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → Selections from the Writings of ‘Abdu’l-Bahá (doc 20910, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Selections from the Writings of ‘Abdu’l-Bahá (20910) ¶265 coverage 1.00
- equality-sexes T4: **The Kitáb-i-Aqdas: Questions and Answers** (Bahá'u'lláh) [book] → The Kitáb-i-Aqdas: Questions and Answers (doc 335536, by title)
  - checked: find-document "The Kitáb-i-Aqdas: Questions and Answers" → The Most Holy Book (Kitáb-i-Aqdas) (16712); The Kitáb-i-Aqdas: Questions and Answers (335536); The Kitab-i-Aqdas: Exemption from Obligatory Prayer for the Sick — Questions and Answers 93 (967572)
- equality-sexes T5: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book] → Selections from the Writings of ‘Abdu’l-Bahá (doc 20910, by quote)
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312) | phrase search → Selections from the Writings of ‘Abdu’l-Bahá (20910) ¶265 coverage 1.00
- equality-sexes T5: **Lights of Guidance (letter on behalf of Shoghi Effendi, 28 July 1936)** (Shoghi Effendi (on his behalf)) [letter] → Lights of Guidance (doc 20804, by title)
  - checked: find-document "Lights of Guidance" → Lights of Guidance (20804); Lights of Guidance: A Bahá’í Reference File (8680); lights-of-guidance-000_en (609524) | phrase search → Women (20874) ¶76 coverage 1.00
- return-iqan T2: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Divine Philosophy (7189) ¶1444 coverage 1.00
- return-iqan T2: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → The Kitáb-i-Íqán (20810) ¶161 coverage 1.00
- return-iqan T2: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → A Hymn to Love (Sáqí, bi-dih ábí) (11447) ¶290 coverage 1.00
- return-iqan T4: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → The Kitáb-i-Íqán (20810) ¶161 coverage 1.00
- return-iqan T4: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → Bahá’í Pilgrimage to Israel (9760) ¶56 coverage 1.00
- return-iqan T4: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → The Kitáb-i-Íqán (20810) ¶170 coverage 1.00
- return-iqan T5: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → Kitáb-i-Íqán (doc 2209921, by title)
  - checked: documents?q → Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946); Kitáb-i-Íqán (984312) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶99 coverage 1.00 | error /api/v1/library/find-document 503
- return-iqan T5: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → Kitáb-i-Íqán (doc 2209921, by title)
  - checked: documents?q → Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946); Kitáb-i-Íqán (984312) | phrase search → Gleanings from the Writings of Bahá’u’lláh (20783) ¶99 coverage 1.00 | error /api/v1/library/find-document 503
- golden-rule T1: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → The Kitáb-i-Íqán (20810) ¶214 coverage 1.00
- golden-rule T1: **Epistle to the Son of the Wolf** (Bahá'u'lláh) [book] → Epistle to the Son of the Wolf (doc 20780, by title)
  - checked: find-document "Epistle to the Son of the Wolf" → Epistle to the Son of the Wolf (20780); Epistle to the Son of the Wolf (926338); Epistle to the Son of the Wolf (984437) | phrase search → Star of the West (15205) ¶138 coverage 1.00
- golden-rule T1: **The Hidden Words of Bahá'u'lláh** (Bahá'u'lláh) [book] → The Hidden Words of Bahá’u’lláh (doc 20809, by title) — was in Anís's sources
  - checked: find-document "The Hidden Words of Bahá'u'lláh" → The Hidden Words of Bahá’u’lláh (20809); 隐言经 (Hidden Words of Baha'u'llah) (28629); 隐言经 (Hidden Words of Baha'u'llah) (22143) | phrase search → Bahá’u’lláh and the New Era (20813) ¶349 coverage 1.00
- golden-rule T1: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [compilation] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title) — was in Anís's sources
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Summons of the Lord of Hosts (20806) ¶417 coverage 1.00
- golden-rule T2: **The Summons of the Lord of Hosts** (Bahá'u'lláh) [book] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711) | phrase search → Summons of the Lord of Hosts (20806) ¶417 coverage 1.00
- golden-rule T4: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122) | phrase search → Addressing the Rising Tide of Globalization and Amorality in the Present World Order and Its Implications on Extremes of Wealth and Poverty (14228) ¶101 coverage 1.00
- golden-rule T4: **Tablets of Bahá'u'lláh Revealed After the Kitáb-i-Aqdas** (Bahá'u'lláh) [tablet] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed After the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827)
- golden-rule T5: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946)
- golden-rule T5: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas** (Bahá'u'lláh) [tablet] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827)
- 004-soul-reincarnation T1: **Gleanings from the Writings of Bahá'u'lláh** (Bahá'u'lláh) [book] → Gleanings from the Writings of Bahá’u’lláh (doc 20783, by title)
  - checked: find-document "Gleanings from the Writings of Bahá'u'lláh" → Gleanings from the Writings of Bahá’u’lláh (20783); Gleanings from the Writings of Baha'u'llah: Study Guide (919098); Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing) (956122)
- 004-soul-reincarnation T1: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- 004-soul-reincarnation T1: **Lights of Guidance** (Helen Hornby (comp.); letters on behalf of Shoghi Effendi) [compilation] → Lights of Guidance (doc 20804, by title) — was in Anís's sources
  - checked: find-document "Lights of Guidance" → Lights of Guidance (20804); Lights of Guidance: A Bahá’í Reference File (8680); lights-of-guidance-000_en (609524)
- 004-soul-reincarnation T1: **Reincarnation, Rebirth and the Progress of the Soul** (Universal House of Justice (Research Department)) [compilation] → Reincarnation, Rebirth and the Progress of the Soul (doc 4669, by title) — was in Anís's sources
  - checked: find-document "Reincarnation, Rebirth and the Progress of the Soul" → Reincarnation, Rebirth and the Progress of the Soul (4669); Reincarnation, Rebirth and the Progress of the Soul (22219); Reincarnation, Rebirth and the Progress of the Soul (326594)
- 004-soul-reincarnation T1: **Bhagavad Gītā** [book] → The Bhagavad-Gita (doc 21038, by title)
  - checked: find-document "Bhagavad Gītā" → Bhagavad Gītā (in The Bhagavad Gita (Song Celestial, tr. Edwin Arnold), paragraphs 12-undefined) (17365); The Bhagavad-Gita (21038); Bhagavad-Gita and the Baha'i Faith (282917)
- 004-soul-reincarnation T2: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097) | phrase search → Postmodernism and the Bahá’í Writings (14670) ¶654 coverage 0.80
- 004-soul-reincarnation T2: **Spiritualism, Reincarnation and Related Subjects** (compilation) [compilation] → Spiritualism, Reincarnation and Related Subjects (doc 24208, by title)
  - checked: find-document "Spiritualism, Reincarnation and Related Subjects" → Spiritualism, Reincarnation and Related Subjects (24208); Spiritualism, Reincarnation and Related Subjects (39576)
- 004-soul-reincarnation T3: **Dawn of a New Day** (Shoghi Effendi (letter written on his behalf)) [letter] → Dawn of a New Day (doc 20883, by title)
  - checked: find-document "Dawn of a New Day" → Dawn of a New Day (20883); dawn-of-a-new-day-000_en (608352); dawn-of-a-new-day-001_en (608358) | phrase search → Dawn of a New Day (20883) ¶1005 coverage 1.00
- 004-soul-reincarnation T3: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097) | phrase search → Some Answered Questions (20911) ¶738 coverage 1.00
- 004-soul-reincarnation T3: **Lights of Guidance** (Helen Hornby (comp.), quoting a letter of/on behalf of Shoghi Effendi) [compilation] → Lights of Guidance (doc 20804, by title)
  - checked: find-document "Lights of Guidance" → Lights of Guidance (20804); Lights of Guidance: A Bahá’í Reference File (8680); lights-of-guidance-000_en (609524) | phrase search → Lights of Guidance: A Bahá’í Reference File (8680) ¶6524 coverage 1.00
- 004-soul-reincarnation T4: **Reincarnation and the Nature and Progress of the Soul (compilation)** [compilation] → Reincarnation and the Nature and Progress of the Soul (doc 22427, by title)
  - checked: find-document "Reincarnation and the Nature and Progress of the Soul" → Reincarnation and the Nature and Progress of the Soul (22427); Reincarnation and the Nature and Progress of the Soul (39558) | phrase search → Divine Philosophy (7189) ¶3702 coverage 1.00
- seed-21 T1: **Lights of Guidance** (Helen Hornby (comp.)) [compilation] → Lights of Guidance (doc 20804, by title)
  - checked: find-document "Lights of Guidance" → Lights of Guidance (20804); Lights of Guidance: A Bahá’í Reference File (8680); lights-of-guidance-000_en (609524)
- seed-21 T1: **The Kitáb-i-Íqán** (Bahá'u'lláh) [book] → The Kitáb-i-Íqán (doc 20810, by title)
  - checked: find-document "The Kitáb-i-Íqán" → The Kitáb-i-Íqán (20810); Kitáb-i-Íqán (2209921); Kitáb-i-Íqán (983946) | phrase search → The Kitáb-i-Íqán (20810) ¶29 coverage 1.00
- seed-21 T4: **Maḥmúd's Diary** (Mírzá Maḥmúd-i-Zarqání) [book] → Maḥmúd's Diary (doc 11355, by title)
  - checked: find-document "Maḥmúd's Diary" → Maḥmúd's Diary (11355); Mahmúd''s Diary: The Diary of Mírzá Mahmúd-i-Zarqání Chronicling ''Abdu''l-Bahá''s Journey to America (12527); Mahmúd''s Diary: Chronicling ''Abdu''l-Bahá''s Journey to America (12578) | phrase search → Mahmud's Diary: The Diary of Mirza Mahmud-i-Zarqani Chronicling 'Abdu'l-Baha's Journey to America (355398) ¶69 coverage 1.00
- seed-21 T4: **The Promulgation of Universal Peace** ('Abdu'l-Bahá) [book] → The Promulgation of Universal Peace (doc 20917, by title)
  - checked: find-document "The Promulgation of Universal Peace" → The Promulgation of Universal Peace (20917); The Promulgation of Universal Peace: Study Guide (23577); The Promulgation of Universal Peace: Study Guide (28932) | phrase search → The Promulgation of Universal Peace (20917) ¶658 coverage 1.00
- seed-21 T5: **Mahmúd's Diary** (Mírzá Maḥmúd-i-Zarqání) [book] → Maḥmúd's Diary (doc 11355, by title)
  - checked: find-document "Mahmúd's Diary" → Maḥmúd's Diary (11355); Mahmúd''s Diary: The Diary of Mírzá Mahmúd-i-Zarqání Chronicling ''Abdu''l-Bahá''s Journey to America (12527); Mahmúd''s Diary: Chronicling ''Abdu''l-Bahá''s Journey to America (12578) | phrase search → Mahmud's Diary: The Diary of Mirza Mahmud-i-Zarqani Chronicling 'Abdu'l-Baha's Journey to America (355413) ¶528 coverage 1.00
- seed-21 T5: **The Promulgation of Universal Peace** ('Abdu'l-Bahá) [book] → The Promulgation of Universal Peace (doc 20917, by title)
  - checked: find-document "The Promulgation of Universal Peace" → The Promulgation of Universal Peace (20917); The Promulgation of Universal Peace: Study Guide (23577); The Promulgation of Universal Peace: Study Guide (28932)
- seed-21 T5: **Some Answered Questions** ('Abdu'l-Bahá) [book] → Some Answered Questions (doc 20911, by title)
  - checked: find-document "Some Answered Questions" → Some Answered Questions (20911); Some Answered Questions and Its Compiler (14265); Some Answered Questions: Study Guide (919097)
- seed-39 T1: **Selections from the Writings of the Báb** (The Báb) [book] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607)
- seed-39 T1: **Gate of the Heart: Understanding the Writings of the Báb** (Nader Saiedi) [book] → Gate of the Heart: Understanding the Writings of the Báb (doc 8632, by title)
  - checked: find-document "Gate of the Heart: Understanding the Writings of the Báb" → Gate of the Heart: Understanding the Writings of the Báb (8632); Gate of the Heart: Understanding the Writings of the Bab, by Nader Saiedi: Review (153157); Gate of the Heart: Understanding the Writings of the Bab, by Nader Saiedi: Review (163882)
- seed-39 T1: **Laws Abrogated by Bahá'u'lláh (compilation)** [compilation] → Laws Abrogated by Baha'u'llah (doc 919143, by title)
  - checked: find-document "Laws Abrogated by Bahá'u'lláh" → Laws Abrogated by Baha'u'llah (919143); Bahá’u’lláh, Abrogated Laws: Prohibition of Charging Interest (357319); Bahá’u’lláh, Abrogated Laws: Prohibition of Charging Interest (357321)
- seed-39 T2: **Selections from the Writings of the Báb** (The Báb) [compilation] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607)
- seed-39 T2: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title)
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → Bayan 'illati Tahrimi'l-Maharim (provisional translation) (956858) ¶0 coverage 0.00
- seed-39 T2: **A Thematic Analysis and Summary of the Persian Bayán** (Peter Terry) [article] → A Thematic Analysis and Summary of the Persian Bayán (doc 15101, by title)
  - checked: find-document "A Thematic Analysis and Summary of the Persian Bayán" → A Thematic Analysis and Summary of the Persian Bayán (15101); Persian Bayan: Thematic Analysis and Summary (323196); Persian Bayán: Summary and Thematic Analysis (14653) | phrase search → bab-kutob-01-2-en-notes (616369) ¶18 coverage 1.00
- seed-39 T4: **Sacred Acts, Sacred Space, Sacred Time** (John Walbridge) [book] → Sacred Acts, Sacred Space, Sacred Time (doc 23832, by title) — was in Anís's sources
  - checked: find-document "Sacred Acts, Sacred Space, Sacred Time" → Sacred Acts, Sacred Space, Sacred Time (23832); Sacred Acts, Sacred Space, Sacred Time (328596); Sacred Acts, Sacred Space, Sacred Time, by John Walbridge: Review (59574) | phrase search → Kitáb-i-Aqdas: Excerpts from John Walbridge, "Sacred Acts..." (216888) ¶14 coverage 1.00
- seed-39 T4: **The Kitáb-i-Aqdas (Introduction)** (Universal House of Justice, quoting Shoghi Effendi) [book] → Kitáb-i-Aqdas (doc 924862, by title) — was in Anís's sources
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307) | phrase search → A Thematic Analysis and Summary of the Persian Bayán (15101) ¶207 coverage 0.08
- seed-39 T4: **Selections from the Writings of the Báb** (The Báb) [book] → Selections from the Writings of the Báb (doc 20898, by title)
  - checked: find-document "Selections from the Writings of the Báb" → Selections from the Writings of the Báb (20898); Prayer, Selections from the Writings of the Báb, (431606); Prayer, Selections from the Writings of the Báb, (431607) | phrase search → Selections from the Writings of the Báb (20898) ¶313 coverage 1.00
- seed-39 T5: **Sacred Acts, Sacred Space, Sacred Time** (John Walbridge) [book] → Sacred Acts, Sacred Space, Sacred Time (doc 23832, by title)
  - checked: find-document "Sacred Acts, Sacred Space, Sacred Time" → Sacred Acts, Sacred Space, Sacred Time (23832); Sacred Acts, Sacred Space, Sacred Time (328596); Sacred Acts, Sacred Space, Sacred Time, by John Walbridge: Review (59574) | phrase search → Kitáb-i-Aqdas: Excerpts from John Walbridge, "Sacred Acts..." (216888) ¶14 coverage 1.00
- seed-39 T5: **Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas** (Bahá'u'lláh) [tablet] → Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (doc 28826, by title)
  - checked: find-document "Tablets of Bahá'u'lláh Revealed after the Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28826); Tablets of Baha'u'llah Revealed after the Kitab-i-Aqdas (28827) | phrase search → Lord of Lords, Volume II: Prophecies of the Second Coming (956258) ¶2958 coverage 1.00
- seed-39 T5: **The Kitáb-i-Aqdas** (Bahá'u'lláh) [book] → Kitáb-i-Aqdas (doc 924862, by title)
  - checked: find-document "The Kitáb-i-Aqdas" → The Most Holy Book (Kitáb-i-Aqdas) (16712); Kitáb-i-Aqdas (924862); The Kitáb-i-Aqdas (21307)
- seed-66 T1: **Rashḥ-i-'Amá** (Bahá'u'lláh) [tablet] → Rashh-i-'Ama (doc 927201, by title) — was in Anís's sources
  - checked: find-document "Rashḥ-i-'Amá" → Rashh-i-'Ama (927201); Rashh-i-'Ama: Les Nuages des Royaumes d'en-haut (919090); Rashh-i-'Ama: Les nuees du plus haut des cieux (919089)
- seed-66 T1: **Bahá'u'lláh (Bahá'í International Community statement, 1992)** (Bahá'í International Community, Office of Public Information) [article] → Bahá'u'lláh (doc 983065, by title)
  - checked: find-document "Bahá'u'lláh" → Bahá'u'lláh (983065); Bahá’u’lláh (445720); Bahá’u’lláh (445742)
- seed-66 T2: **Súriy-i-Haykal (in Summons of the Lord of Hosts)** (Bahá'u'lláh) [tablet] → Súriy-i-Haykal (doc 339666, by title) — was in Anís's sources
  - checked: find-document "Súriy-i-Haykal" → Súriy-i-Haykal (339666); Súriy-i-Haykal (Tablet of the Temple) (925310); Súriy-i-Haykal (Surih of the Temple) (924993) | phrase search → Summons of the Lord of Hosts (20806) ¶6 coverage 1.00
- seed-66 T2: **Epistle to the Son of the Wolf** (Bahá'u'lláh) [book] → Epistle to the Son of the Wolf (doc 20780, by title)
  - checked: find-document "Epistle to the Son of the Wolf" → Epistle to the Son of the Wolf (20780); Epistle to the Son of the Wolf (926338); Epistle to the Son of the Wolf (984437)
- seed-66 T3: **The Qur'an: Sūrat al-ʿAlaq** [book] → The Qur’ân (Palmer) (doc 21344, by quote)
  - checked: find-document "The Qur'an: Sūrat al-ʿAlaq" → none | documents?q → none | phrase search → The Qur’ân (Palmer) (21344) ¶3696 coverage 0.50
- seed-66 T3: **Ṣaḥīḥ al-Bukhārī** (al-Bukhārī) [book] → Ṣaḥíḥ al-Bukhárí (doc 21075, by title)
  - checked: find-document "Ṣaḥīḥ al-Bukhārī" → Ṣaḥíḥ al-Bukhárí (21075); Sahih al-Bukhari (Arabic) (17034); al-Mustakhraj ala Sahih al-Bukhari (Arabic) (17214)
- seed-66 T4: **The Summons of the Lord of Hosts (Súriy-i-Haykal)** (Bahá'u'lláh) [tablet] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711) | phrase search → Summons of the Lord of Hosts (20806) ¶6 coverage 1.00
- seed-66 T4: **Messianic Concealment and Theophanic Disclosure** (Moojan Momen) [article] → Messianic Concealment and Theophanic Disclosure (doc 919319, by title)
  - checked: find-document "Messianic Concealment and Theophanic Disclosure" → Messianic Concealment and Theophanic Disclosure (919319); Messianic Concealment and Theophanic Disclosure (39312); Messianic Concealment and Theophanic Disclosure (60859)
- seed-66 T5: **The Summons of the Lord of Hosts** (Bahá'u'lláh) [book] → Summons of the Lord of Hosts (doc 20806, by title)
  - checked: find-document "The Summons of the Lord of Hosts" → Summons of the Lord of Hosts (20806); Tag: - Summons of the Lord of Hosts (book) (284668); UntitledThe Summons of the Lord of Hosts (339711)
- seed-93 T1: **The Promulgation of Universal Peace** ('Abdu'l-Bahá) [talk] → The Promulgation of Universal Peace (doc 20917, by title)
  - checked: find-document "The Promulgation of Universal Peace" → The Promulgation of Universal Peace (20917); The Promulgation of Universal Peace: Study Guide (23577); The Promulgation of Universal Peace: Study Guide (28932) | phrase search → Star of the West (15198) ¶799 coverage 1.00
- seed-93 T1: **The World Order of Bahá'u'lláh** (Shoghi Effendi) [book] → The World Order of Bahá’u’lláh (doc 20894, by title)
  - checked: find-document "The World Order of Bahá'u'lláh" → The World Order of Bahá’u’lláh (20894); World Order of Bahá'u'lláh (984028); The World Order of Bahá'u'lláh (2209605)
- seed-93 T2: **Paris Talks** ('Abdu'l-Bahá) [book] → Paris Talks (doc 20908, by title)
  - checked: find-document "Paris Talks" → Paris Talks (20908); Paris Talks: Study Guide (23579); Paris Talks: Study Guide (28930) | phrase search → Paris Talks (20908) ¶698 coverage 0.00
- seed-93 T2: **The Hidden Words** (Bahá'u'lláh) [book] → The Hidden Words (doc 927205, by title)
  - checked: find-document "The Hidden Words" → The Hidden Words (927205); The Hidden Words (983231); Hidden Words (21679)
- seed-93 T2: **The Advent of Divine Justice** (Shoghi Effendi) [letter] → The Advent of Divine Justice (doc 20890, by title)
  - checked: find-document "The Advent of Divine Justice" → The Advent of Divine Justice (20890); Advent of Divine Justice (912371); Advent of Divine Justice (913762) | phrase search → The Baha'i World: A Biennial International Record, Volume VIII (95 and 96 of the Baha'i Era, April 1938 to 1940 A.D.) (967543) ¶4242 coverage 1.00
- seed-93 T3: **Tablets to The Hague** ('Abdu'l-Bahá) [tablet] → Tablets to the Hague (doc 20916, by title)
  - checked: find-document "Tablets to The Hague" → Tablets to the Hague (20916); Lawh-i-Lahih - Tablet to the Hague (921704); Tablet to the Central Organization for a Durable Peace, The Hague (6945) | phrase search → Bahá’í Sacred Writings (20777) ¶1027 coverage 1.00

### Collection gaps (34) — Perplexity named, library lacks

- soul-after-death T1: **The Holy Bible: Gospel according to Luke** [book]
  - checked: find-document "The Holy Bible: Gospel according to Luke" → none | documents?q → none
- soul-after-death T1: **The Holy Bible: Gospel according to Matthew** [book]
  - checked: find-document "The Holy Bible: Gospel according to Matthew" → none | documents?q → none
- soul-after-death T1: **The Holy Bible: First Epistle to the Corinthians** (Paul) [book]
  - checked: find-document "The Holy Bible: First Epistle to the Corinthians" → none | documents?q → none | phrase search → The Bible (KJV), 1 Corinthians (20967) ¶287 coverage 0.00
- soul-after-death T1: **The Holy Bible: Book of Revelation** [book]
  - checked: find-document "The Holy Bible: Book of Revelation" → none | documents?q → none
- soul-after-death T1: **Bardo Thödol (Tibetan Book of the Dead)** (attributed to Padmasambhava) [book]
  - checked: find-document "Bardo Thödol" → none | documents?q → none
- soul-after-death T2: **Qur'an** [book]
  - checked: find-document "Qur'an" → The Qur'an and Its Exegesis (English translation of Koran und Koranexegese) (956266); The Qur'an (Arabic, Simple Text) (21381); The Qur'an (Arabic) (21380) | documents?q → Qur'anic Kerygma: Epic, Apocalypse, and Typological Figuration (919398); The Qur’anic Epic and the Creation of Humanity (984142); The Qur'an: The First Book in Arabic (Part 1 of 3) (984127)
- soul-after-death T2: **Bible (New Testament)** [book]
  - checked: find-document "Bible" → The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); Bible Prophecies (984297); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | documents?q → Bible Prophecies (984297); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214)
- soul-after-death T5: **Avesta: Yasna (Gathas)** (Zarathushtra) [book]
  - checked: find-document "Avesta: Yasna" → Yasna Haptanghaiti 35-42 (19734); Yasna (complete) (19096); Gathas - Yasna 43-46 (Ushtavaiti Gatha) (19089) | documents?q → Yasna Haptanghaiti 35-42 (19734); Yasna (complete) (19096); Gathas - Yasna 43-46 (Ushtavaiti Gatha) (19089)
- soul-after-death T5: **Avesta: Vendidad** [book]
  - checked: find-document "Avesta: Vendidad" → Vendidad Fargard 11 (SBE) (18951); Vendidad Fargard 10 (SBE) (18948); Vendidad Fargard 15 (SBE) (18956) | documents?q → Vendidad Fargard 11 (SBE) (18951); Vendidad Fargard 10 (SBE) (18948); Vendidad Fargard 15 (SBE) (18956)
- soul-after-death T5: **Encyclopaedia Iranica, 'Eschatology i. In Zoroastrianism and Zoroastrian Influence'** [article]
  - checked: find-document "Encyclopaedia Iranica, 'Eschatology i. In Zoroastrianism and…" → none | documents?q → none
- soul-after-death T5: **Zarathushti View of Death and the Afterlife** (Antia) [article]
  - checked: find-document "Zarathushti View of Death and the Afterlife" → none | documents?q → none
- detachment-buddhism T4: **Virāga Sutta (Saṃyutta Nikāya)** (Buddha (Pali Canon)) [tablet]
  - checked: find-document "Virāga Sutta" → none | documents?q → none | phrase search → Sutra Collection (M, Part-2) (20934) ¶366 coverage 0.06
- detachment-buddhism T4: **Sammasambuddha Sutta (Saṃyutta Nikāya 22.58)** (Buddha (Pali Canon)) [tablet]
  - checked: find-document "Sammasambuddha Sutta" → none | documents?q → none | phrase search → Sutra Collection (M, Part-1) (21317) ¶1302 coverage 0.00
- detachment-buddhism T5: **Majjhima Nikāya 9: Sammādiṭṭhi Sutta (Discourse on Right View)** (Buddha (tr. Thanissaro Bhikkhu)) [book]
  - checked: find-document "Majjhima Nikāya 9: Sammādiṭṭhi Sutta" → Majjhima Nikaya 9 - Sammaditthi Sutta: The Discourse on Right View (19285) | documents?q → Majjhima Nikaya 9 - Sammaditthi Sutta: The Discourse on Right View (19285) | phrase search → Samyutta Nikaya 12.46 - Aññatra Sutta: A Certain Brahman (19323) ¶4 coverage 0.38
- equality-sexes T1: **Letter of the Universal House of Justice to an individual, 22 December 2013** (Universal House of Justice) [letter]
  - checked: find-document "Letter of the Universal House of Justice to an individual, 2…" → none | documents?q → none | phrase search → Lights of Guidance: A Bahá’í Reference File (8680) ¶5753 coverage 0.00
- equality-sexes T5: **Messages of the Universal House of Justice: letter of 22 December 2013 to an individual** (Universal House of Justice) [letter]
  - checked: find-document "Messages of the Universal House of Justice: letter of 22 Dec…" → none | documents?q → none | phrase search → Divine Philosophy (20904) ¶323 coverage 0.00
- return-iqan T1: **The Bible (Gospel of John)** [book]
  - checked: find-document "The Bible" → The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); Bible Prophecies (984297); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | documents?q → Bible Prophecies (984297); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214)
- return-iqan T1: **The Bible (Gospel of Matthew)** [book]
  - checked: find-document "The Bible" → The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); Bible Prophecies (984297); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214) | documents?q → Bible Prophecies (984297); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); The Bible and the Baha'i Faith (Part One: Understanding Biblical Evidence), from Preparing for a Baha'i-Christian Dialogue, Vol. 1 (956214)
- golden-rule T4: **The Holy Bible (Gospel of Matthew)** [book]
  - checked: find-document "The Holy Bible" → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521) | documents?q → This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (931054); The Bible, the Qur'an and Science: The Holy Scriptures Examined in the Light of Modern Knowledge (956177); This book is the Holy Book of God, of celestial Inspiration. It is the Bible of Salvation (provisional translation) (973521) | phrase search → Taxation, Drought and the Golden Rule (211729) ¶29 coverage 0.14
- 004-soul-reincarnation T1: **Bṛhadāraṇyaka Upaniṣad** [book]
  - checked: find-document "Bṛhadāraṇyaka Upaniṣad" → none | documents?q → none
- 004-soul-reincarnation T1: **Anattalakkhaṇa Sutta (Saṃyutta Nikāya)** [book]
  - checked: find-document "Anattalakkhaṇa Sutta" → Samyutta Nikaya 22.59 - Anattalakkhana Sutta (Not-self Characteristic) (17268) | documents?q → Samyutta Nikaya 22.59 - Anattalakkhana Sutta (Not-self Characteristic) (17268)
- 004-soul-reincarnation T1: **Comparison of God and Soul Concepts From a Baha'i and Hindu Perspective** (Kerr) [article]
  - checked: find-document "Comparison of God and Soul Concepts From a Baha'i and Hindu …" → none | documents?q → none
- 004-soul-reincarnation T2: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [book]
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312)
- 004-soul-reincarnation T4: **Bṛhadāraṇyaka Upaniṣad** [book]
  - checked: find-document "Bṛhadāraṇyaka Upaniṣad" → none | documents?q → none
- 004-soul-reincarnation T4: **Śaṅkara (Stanford Encyclopedia of Philosophy)** (Stanford Encyclopedia of Philosophy) [article]
  - checked: find-document "Śaṅkara" → none | documents?q → none
- 004-soul-reincarnation T5: **Vedārthasaṅgraha** (Rāmānuja) [book]
  - checked: find-document "Vedārthasaṅgraha" → none | documents?q → none
- seed-21 T1: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [compilation]
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312)
- seed-21 T3: **Enchiridion on Faith, Hope and Love** (Augustine of Hippo) [book]
  - checked: find-document "Enchiridion on Faith, Hope and Love" → none | documents?q → none | phrase search → Star of the West (15205) ¶1455 coverage 0.00
- seed-21 T3: **The Enneads** (Plotinus) [book]
  - checked: find-document "The Enneads" → Tag: Enneads (289652); Tag: Enneads (289649) | documents?q → Tag: Enneads (289652); Tag: Enneads (289649)
- seed-21 T3: **Matter and Evil (Oxford Academic chapter)** [book]
  - checked: find-document "Matter and Evil" → Healing without Medicine (921782) | documents?q → Healing without Medicine (921782)
- seed-39 T2: **Persian Bayán** (The Báb) [book]
  - checked: find-document "Persian Bayán" → The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726); The Persian Bayán: From A.L.M. Nicolas' French translation (15140) | documents?q → Persian Bayán: Summary and Thematic Analysis (14653); The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726)
- seed-66 T3: **The Holy Bible: Exodus** [book]
  - checked: find-document "The Holy Bible: Exodus" → Torah - Shemot (Exodus) (21277); Exodus (21226); Leviticus (21237) | documents?q → Exodus (21226); Torah - Shemot (Exodus) (21277); Leviticus (21237)
- seed-66 T3: **The Qur'an: Sūrat ash-Shuʿarāʾ** [book]
  - checked: find-document "The Qur'an: Sūrat ash-Shuʿarāʾ" → none | documents?q → none
- seed-93 T2: **Selections from the Writings of 'Abdu'l-Bahá** ('Abdu'l-Bahá) [compilation]
  - checked: find-document "Selections from the Writings of 'Abdu'l-Bahá" → abdul-baha-selections-writings01-004_en (564332); abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310) | documents?q → abdul-baha-selections-writings01-001_en (564304); abdul-baha-selections-writings01-001_fa (564310); abdul-baha-selections-writings01-002_en (564312)

### Not determinable (4)

- equality-sexes T2: **Letter written on behalf of Shoghi Effendi to an individual believer, 27 May 1940** (Shoghi Effendi (on his behalf)) [letter]
  - checked: find-document "Letter written on behalf of Shoghi Effendi to an individual …" → none | documents?q → none
- equality-sexes T5: **Messages of the Universal House of Justice: letter of 31 May 1988 to the National Spiritual Assembly of New Zealand** (Universal House of Justice) [letter]
  - checked: find-document "Messages of the Universal House of Justice: letter of 31 May…" → none | documents?q → none
- 004-soul-reincarnation T2: **Saṃyutta Nikāya (Anattalakkhaṇa Sutta, SN 22.59)** (Pali Canon) [other]
  - checked: find-document "Saṃyutta Nikāya" → Samyutta Nikaya 1.18 - Hiri Sutta: Conscience (19293); Samyutta Nikaya 1.69 - Iccha Sutta: Desire (19300); Samyutta Nikaya 12.11 - Ahara Sutta: Nutriment (19309) | documents?q → Samyutta Nikaya 27.1 - Upakkilesa Samyutta: Defilements (19423); Samyutta Nikaya 44 - Introduction to the Avyakata Samyutta ((Undeclared-connected)) (19516); Samyutta Nikaya 1.18 - Hiri Sutta: Conscience (19293)
- seed-39 T1: **From the Persian Bayán** (The Báb (Bahá'í World Centre presentation)) [website]
  - checked: find-document "From the Persian Bayán" → A Thematic Analysis and Summary of the Persian Bayán (15101); The Persian Bayán: From A.L.M. Nicolas' French translation (12396); The Persian Bayán: Partial translation (16726) | documents?q → amanat_persian_bayan_renewal (920237); A Divine Exposition for the New Age: A Textual Analysis of The Persian Bayán (984137); Part 8A: A Divine Exposition for the New Age: A Textual Analysis of The Persian Bayán (984110)

### Perplexity errors (87)

- soul-after-death T1 [other]: Perplexity left out the Bahá'í Writings (e.g. Gleanings LXXXVI, 'Abdu'l-Bahá's tablets on recognition in the next world), which answer the question most directly. Its URL list is grief blogs, not sources for the texts it cites.
- soul-after-death T2 [misattribution]: Perplexity attributes the 'Life After Death' chapter to Some Answered Questions. The linked source (ibiblio BNE-148, pp. 188–190) is Esslemont's Bahá'u'lláh and the New Era, a secondary book that quotes 'Abdu'l-Bahá's Tablets. So 'Abdu'l-Bahá's words are given the wrong book, and the citation actually rests on Esslemont's secondary text.
- soul-after-death T2 [wrong_location]: No passage or section numbers are given for the Gleanings or Crimson Ark citations, only vague 'passages'.
- soul-after-death T3 [wrong_location]: It puts the passage on the souls of the people of Bahá communing intimately in Gleanings no. 81. As I recall, that passage is Gleanings LXXXVI.
- soul-after-death T3 [wrong_location]: It puts 'all-highest Paradise' in Gleanings no. 80. As I recall, it is in no. 81, the Tablet to 'Abdu'l-Wahháb.
- soul-after-death T3 [other]: It offers The Seven Valleys as a primary source on where a soul goes after death, which is a stretch. It also loosely describes 'Abdu'l-Bahá's 'talks' as authoritative interpretation alongside His writings.
- soul-after-death T4 [wrong_location]: Attributes 'in the divine worlds the spiritual beloved ones will recognize one another...' to Some Answered Questions ch. 62. It is actually from an 'Abdu'l-Bahá tablet quoted in Bahá'u'lláh and the New Era (Tablets of Abdul-Baha Abbas).
- soul-after-death T4 [unofficial_translation]: Calls the passage a later-compilation translation of Some Answered Questions. In fact it is an early, unrevised translation of a tablet, and Perplexity doesn't flag that.
- soul-after-death T5 [invented_or_misquoted]: The quote 'So shalt thou be, holy shalt thou cause thy soul to pass over the Chinvat Bridge; holy shalt thou come into Heaven' is attributed to Yasna 51.16. That verse says no such thing, and the credit 'Moulton/Bartholomae' is confused.
- soul-after-death T5 [factual] (Anís right): It says neither corpus gives an explicit statement on recognising loved ones, and that the Bahá'í position needs a distinction between text and 'later interpretation'. In fact 'Abdu'l-Bahá's tablet says plainly: 'This fact is certain; for the Kingdom is the world of vision…'
- detachment-buddhism T1 [wrong_location]: 'The essence of detachment is for man to turn his face towards the courts of the Lord…' is cited as Arabic Hidden Words no. 14. It is from Bahá'u'lláh's Words of Wisdom (Tablets of Bahá'u'lláh).
- detachment-buddhism T1 [misattribution]: 'Detachment is as the sun…' is attributed to the Four Valleys, 'Valley of Knowledge'. That passage and section are not in the Four Valleys; it appears to come from a tablet in Tablets of Bahá'u'lláh.
- detachment-buddhism T1 [misattribution]: 'the highest form of detachment in this day is to be occupied with some profession and be self-supporting' is presented loosely as Bahá'u'lláh's teaching. The wording is from a letter written on behalf of Shoghi Effendi summarising His teaching, so it is not Bahá'u'lláh's own text.
- detachment-buddhism T2 [pilgrim_note_as_writings] (Anís right): Perplexity presents a Divine Philosophy talk note as 'Abdu'l-Bahá's own words ('In Divine Philosophy, 'Abdu'l-Bahá says') without saying it is a record of a talk.
- detachment-buddhism T2 [misattribution] (Anís right): Perplexity first calls the Divine Philosophy passage 'the passage' the reader asked about. The reader's quote ('not meant giving away and depleting all one's wealth') comes from Bahá'u'lláh's tablet 'He who knoweth his self hath known his Lord'.
- detachment-buddhism T2 [wrong_location]: Perplexity places the 'meads of sanctity and of detachment' quote in Gleanings section 2, but its own link points to section 6 and section 2 has different content. I can't confirm the correct section.
- detachment-buddhism T2 [unofficial_translation]: Perplexity does not say that the 'He who knoweth his self' quotation is Juan Cole's provisional translation. Anís leaves this out too.
- detachment-buddhism T3 [misattribution]: Credits the SN 22.63 translation to Walpola Rahula, but the cited Access to Insight file (sn22.063.wlsh) is Maurice Walshe's translation. The quoted wording also appears loosely rendered.
- detachment-buddhism T4 [wrong_location]: Virāga Sutta given as SN 48.50. The page reference S.v.27 points to the Magga-saṃyutta (SN 45.41ff.), so the sutta number appears to be wrong.
- detachment-buddhism T4 [invented_or_misquoted]: 'Dispassion is the aim of the holy life as taught by the Buddha...' is presented as the sutta's text, but it reads like an editorial summary rather than the Buddha's words.
- detachment-buddhism T4 [other]: Footnote [1] is attached to the Sutra Collection S PDF, which is actually source [6].
- detachment-buddhism T5 [misattribution]: Calls SN 22.63 the 'Khajjaniya Sutta'. SN 22.63 is the Upādiyamāna Sutta; the Khajjaniya Sutta is SN 22.79.
- detachment-buddhism T5 [invented_or_misquoted]: The SN 22.63 quotation paraphrases the Walshe translation it cites rather than reproducing it word for word.
- equality-sexes T1 [wrong_location]: Selections no. 94 is described only loosely and may not be the women's-equality passage. The 19 May 1912 date for the Promulgation talk is uncertain.
- equality-sexes T1 [wrong_location]: Unsure that the 'no equality of functions' passage comes from a letter of 14 December 1940.
- equality-sexes T2 [other]: I cannot confirm from memory that the second letter written on Shoghi Effendi's behalf is dated 27 May 1940; it may be correct.
- equality-sexes T2 [other]: Perplexity frames its answer as correcting 'the quotation I gave', but the earlier misattribution was Anís's in T1. This is a minor framing problem.
- equality-sexes T3 [factual]: Claims the 'men' in 'the trusted ones of the Merciful among men' (¶30) translates rijál. The Arabic there is 'bayna al-imkán'. Rijál occurs in 'O ye Men of Justice' (¶52) and in other Tablets.
- equality-sexes T3 [other]: Includes a garbled self-correction in the text ('transmitted through Mírzá Ahmad Sohrab? No—').
- equality-sexes T4 [wrong_location]: The Questions and Answers number for the treasure ruling (given as Q8) and the description of ¶52's context as administering funds are uncertain and may be inexact.
- equality-sexes T4 [other]: The lexical claim about rijál is supported by a Reddit thread rather than a lexicon or scholarly source.
- equality-sexes T4 [factual]: It applies Selections 38 to the 'Universal' House of Justice, but the text says 'the House of Justice'. This is a minor overstatement.
- return-iqan T1 [misattribution]: It presents the hadith 'In Him is the example of Moses… The sign from Moses is fear and expectation…' as Bahá'u'lláh's own statement. In fact it is a Shí'í tradition about the Qá'im that the Íqán quotes, and the context is misdescribed as 'the discussion of the signs of the Prophets'.
- return-iqan T1 [wrong_location]: It calls the SAQ chapter 'The Return of the Prophets'. The authorised title of ch. 33 is 'The "Return" Spoken of by the Prophets'. Minor.
- return-iqan T2 [wrong_location]: Paragraph numbering may be slightly off: the 'Temples of the Cause of God' passage is given as ¶162 and the other three as ¶161, but this run of passages may fall differently across ¶161–162. I can't confirm the exact numbers.
- return-iqan T3 [wrong_location]: The paragraph numbers seem swapped. As I recall, 'all the Prophets are the Temples of the Cause of God… divers attire… same tabernacle' is ¶161, and 'they one and all summon… invested with the robe of Prophethood' is in ¶162 (the twofold-station passage). Perplexity gives them the other way round. I'm not certain of this.
- return-iqan T3 [wrong_location]: Perplexity places 'For they are all but one person, one soul, one spirit, one being, one revelation' in the same paragraph as the 'robe of Prophethood' lines. I'm not sure that's where it sits; the wording is familiar from Gleanings XXII (Íqán material), and I can't confirm the paragraph.
- return-iqan T4 [wrong_location]: The paragraph numbers 177/192/194 may not match the official numbering in the Bahá'í Reference Library; these passages may fall nearer paragraphs 161–179. I can't confirm this.
- return-iqan T5 [wrong_location] (Anís right): Calls the SAQ chapter 'question 18'; in the standard numbering it is chapter 33 ('Return'/'The Return of the Prophets'). The '18' comes from the Ocean of Lights file numbering.
- return-iqan T5 [wrong_location]: Claims the online Íqán has no numbered paragraphs; the bahai.org edition is paragraph-numbered, so the passage could have been given exactly.
- return-iqan T5 [invented_or_misquoted]: The SAQ quotation 'not the return of the essence but of the attributes...' may not match the authorised 2014 translation word for word (uncertain).
- golden-rule T1 [wrong_location] (Anís right): Placed the "Lay not on any soul a load…" passage in Gleanings section CXXXVIII. To my knowledge it is Gleanings LXVI (Súriy-i-Mulúk).
- golden-rule T4 [wrong_location]: Placed 'The earth is but one country' in Gleanings CXXXI; it is in CXVII.
- golden-rule T4 [wrong_location]: Said the Tablet of Bishárát is in The Summons of the Lord of Hosts; it is in Tablets of Bahá'u'lláh Revealed After the Kitáb-i-Aqdas.
- golden-rule T5 [invented_or_misquoted]: It claimed that some older editions number the passage Arabic no. 67. I know of no such variant numbering.
- golden-rule T5 [wrong_location]: Kitáb-i-Íqán 'paragraph 243' for the one-light/differing-receptacles imagery is doubtful, and the passage is only paraphrased, not quoted.
- 004-soul-reincarnation T1 [wrong_location]: The Gleanings passage on the soul as an unfathomable mystery is LXXXII, not no. 81
- 004-soul-reincarnation T1 [wrong_location]: Some Answered Questions 'chapter 82' is cited for the return of attributes; that is ch. 33 (Return), ch. 81 is on reincarnation, and ch. 82 is on pantheism
- 004-soul-reincarnation T1 [authority_error] (Anís right): The doctrinal contrast (linear, not circular progress; no transmigration) is credited to the Universal House of Justice instead of the Guardian's letters and 'Abdu'l-Bahá
- 004-soul-reincarnation T2 [wrong_location]: It cites Selections from the Writings of 'Abdu'l-Bahá §30 as saying return concerns qualities, not 'specific, individual souls and identities'. I cannot verify that this section or wording is correct.
- 004-soul-reincarnation T2 [invented_or_misquoted]: The SAQ ch. 81 quotation 'the same spirit with its former essence and conditions' may not match the authorised translation. I am unsure.
- 004-soul-reincarnation T2 [other] (Anís right): It does not identify the passage the reader actually quoted, the letter on Shoghi Effendi's behalf in Dawn of a New Day.
- 004-soul-reincarnation T3 [wrong_location]: Perplexity gives Some Answered Questions ch. 82 for 'Reincarnation'. I believe the reincarnation chapter is 81 and chapter 82 is on the unity of existence.
- 004-soul-reincarnation T3 [invented_or_misquoted]: The text in quotation marks attributed to Some Answered Questions ('the repeated manifestation in this world of the same spirit with its former essence and conditions') appears to be a paraphrase, not the authorised wording.
- 004-soul-reincarnation T3 [other]: I cannot verify the Lights of Guidance 1820 quotation ('Man's identity or rather his individuality is never lost… He does not pre-exist in any form') or its number. Perplexity also calls it Shoghi Effendi's letter without saying it was written on his behalf.
- 004-soul-reincarnation T4 [authority_error] (Anís right): Presents the decisive Bahá'í statements as 'the passage compiled by the Universal House of Justice' and never names the Central Figure or Shoghi Effendi behind them. The House is the compiler, not the authority, so the doctrinal point's real source is hidden.
- 004-soul-reincarnation T4 [other] (Anís right): Gives no author, work or location for the quoted Bahá'í lines ('individuality is never lost', 'reality as a person remains intact'), so the reader cannot verify them.
- 004-soul-reincarnation T5 [invented_or_misquoted]: The 'full' LXXXI quotation is reworded and rearranged: paragraphs are out of order, 'nature of the soul' is repeated twice, the wording is paraphrased ('Maids of Paradise', 'set ablaze', 'The ascension of these souls after death is a proof of the power of God'), and the 'It will endure as long as the Kingdom of God' sentence is omitted.
- 004-soul-reincarnation T5 [other] (Anís right): Answer truncated: the LXXX quotation is incomplete, and the Rāmānuja half of the request goes unanswered.
- seed-21 T1 [invented_or_misquoted] (Anís right): Claims SAQ chapter 48 is titled 'The Nonexistence of Satan and Evil'; as far as I know, no SAQ chapter has that title, and chapter 48 is on another subject.
- seed-21 T1 [misattribution] (Anís right): Describes Lights of Guidance as 'a compilation attributed to Shoghi Effendi'. It was compiled by Helen Hornby; the passage is a letter written on the Guardian's behalf.
- seed-21 T1 [wrong_location]: I can't verify the section/paragraph numbers given for Kitáb-i-Íqán ¶8, Selections §84 and 'Bahá'í Sacred Writings section 3' (a web-page label), and they may be wrong.
- seed-21 T2 [wrong_location]: Says chapter 64, 'On Good and Evil', §7. The passage is in chapter 74, 'The Nonexistence of Evil'.
- seed-21 T2 [unofficial_translation]: Attributes the quoted wording to Barney's translation. It is the 2014 revised Bahá'í World Centre translation, and Barney's wording differs. The 'nothingness' variant it mentions is not clearly Barney's either.
- seed-21 T4 [authority_error] (Anís right): It declares the Star of the West / US Bahá'í News Service attribution 'incorrect' and says it 'should be withdrawn', with no evidence. The quoted sentence does appear in a Star of the West item. Perplexity's Maḥmúd's Diary quote has different wording, so it is a separate witness, not a correction.
- seed-21 T4 [other]: It says the English translator of Maḥmúd's Diary is unidentified, but the published English translation is by Mohi Sobhani (1998).
- seed-21 T4 [wrong_location]: I can't confirm that chapter 3 of Maḥmúd's Diary or the Boston talk in Promulgation contains the quoted wording.
- seed-21 T5 [wrong_location]: It gives the Some Answered Questions discussion of evil as non-existence (blindness, ignorance, etc.) as chapter 64. In the standard edition it is chapter 74, 'The Nonexistence of Evil'.
- seed-39 T1 [wrong_location] (Anís right): Puts the Tablet of Ishráqát passage ('in different words') in a 'note to paragraph 186' of the Kitáb-i-Aqdas. It is in note 109.
- seed-39 T1 [misattribution]: Says Bahá'u'lláh calls the Bayán the 'Mother Book' in the Kitáb-i-Aqdas, citing that same note. This could not be verified at that location.
- seed-39 T1 [invented_or_misquoted]: Presents 'On the Motive of Action' as a section of the Persian Bayán, while citing Saiedi's Gate of the Heart for it. It is likely a scholar's heading, not a heading in the scripture.
- seed-39 T2 [wrong_location]: The locations Vahid 6, Báb 8 and Q&A 32 are given with confidence but may not be accurate. The Bayán location rests on a secondary summary.
- seed-39 T2 [other]: It used an unofficial secondary summary (Terry) as the basis for a sentence meant to be read aloud about the Báb's own words.
- seed-39 T4 [other]: It quotes the Introduction sentence without saying that it quotes Shoghi Effendi (a letter written on his behalf). That leaves the passage's authority unclear.
- seed-66 T1 [wrong_location] (Anís right): Says the Kitáb-i-Íqán's 'opening historical discussion' refers to the first intimations of revelation in the prison of Ṭihrán. The Íqán contains no such account; the account is in the Epistle to the Son of the Wolf and the Súriy-i-Haykal.
- seed-66 T1 [invented_or_misquoted] (Anís right): Quotes the Epistle as 'like a mighty torrent'; the authorised text reads 'even as a mighty torrent'. It also paraphrases 'My tongue recited what no man could bear to hear' as 'verses beyond human capacity'.
- seed-66 T1 [factual]: Asserts a 'roughly twelve days in October 1852' initial phase as standard Bahá'í history, without citing any source. I am unsure of this; it is not an established datum from the authoritative texts.
- seed-66 T1 [wrong_location]: Cites 'Kitáb-i-Íqán, sections 1–80' for the 'veils' discussion. The reference is vague and only loosely relevant, and it is not tied to the Síyáh-Chál.
- seed-66 T2 [factual] (Anís right): Claims that in the Epistle to the Son of the Wolf Bahá'u'lláh 'connects the voice and the Maiden' and calls her 'the embodiment of the remembrance of the name of My Lord'. Those words are from Súriy-i-Haykal; the Epistle's Síyáh-Chál account has no Maiden.
- seed-66 T3 [other]: Perplexity does not label its claim that the Maiden passage 'functions as a symbolic and revelatory portrayal' as its own interpretation. It also misses Shoghi Effendi's authoritative comparison in God Passes By, which would have grounded the answer.
- seed-66 T4 [other]: The 'two months' and October 1852 dates rest mainly on Wikipedia and Bahaipedia rather than primary or scholarly sources, though Perplexity does label them as reconstructions.
- seed-93 T1 [misattribution]: 'The life of mankind dependeth on justice and not on forgiveness' is credited to Bahá'u'lláh as quoted in Advent; the wording matches 'Abdu'l-Bahá in Some Answered Questions (punishment of criminals).
- seed-93 T1 [misattribution]: 'Shoghi Effendi says that the canopy of existence rests on the pole of justice' blurs the speaker; these are Bahá'u'lláh's words, which Shoghi Effendi quotes.
- seed-93 T1 [wrong_location] (Anís right): The Advent quotations are given with 'locations not specified'.
- seed-93 T2 [wrong_location]: I'm not certain that 'personal benefits and selfish advantages' is in Selections section 23, or that the instruction to investigate truth is in section 30. The citation for the first also points to Bahá'í Sacred Writings, a compilation of Bahá'u'lláh's writings, which muddies who said it.
- seed-93 T2 [misattribution]: It credits the 'canopy of existence' resting on the pole of justice to 'Abdu'l-Bahá, as quoted by Shoghi Effendi. I'm not sure of this; similar 'canopy' imagery is Bahá'u'lláh's ('the canopy of world order… reward and punishment').
- seed-93 T4 [factual]: Says flatly that 'Until these are realized on the plane of existence…' does not appear in the Tablet to The Hague. That is based only on searching the 2019 authorised translation, and the wording may come from the older (1919/Star of the West) translation of the same Tablet. Unverified, not a confirmed error.

#### soul-after-death

- T1 *opening*: **px** — Perplexity named real, relevant scriptural passages and located them correctly by verse (Luke 16, Matthew 17, 1 Corinthians 15, Revelation 6 and 21, Gita 2:13/2:20, Bardo Thödol). Anís cited only irrelevant anecdotes and wrongly said the texts don't address the question, even though the Bahá'í Writings, his own library's core, speak to it explicitly. Both missed the Bahá'í sources, but only Perplexity gave the reader any correctly identified text that answers the question. (Perplexity 4.5 s, $0.00594)
- T2 *reference*: **px** — Anís's single citation is accurate and precise, but it doesn't answer the question: it only directs the reader to the Íqán for past events. Perplexity points to texts that actually address recognising loved ones: 'Abdu'l-Bahá's statements on recognition, Bahá'u'lláh's Crimson Ark passage and Gleanings, and accurate Qur'an verses. Its main flaw is crediting the 'Life After Death' chapter to Some Answered Questions when it is in Esslemont's Bahá'u'lláh and the New Era, along with vague locations. Even so, it identifies the bearing sources far better. (Perplexity 4.9 s, $0.00526)
- T3 *deepen*: **undefined** — undefined (Perplexity 5.9 s, $0.00587)
- T4 *absent*: **px** — Perplexity answered the question with the right passages and quoted them exactly. The Gleanings LXXXVI quotations are correctly located. The 'Abdu'l-Bahá passage on recognising loved ones is genuine, though Perplexity wrongly placed it in Some Answered Questions ch. 62. Anís gave one sentence that doesn't address recognition. He cited it through a secondary compilation (Divine Philosophy) and added a confused attribution to Steven Phelps. (Perplexity 4.8 s, $0.00581)
- T5 *compare*: **anis** — Perplexity is more precise on the Zoroastrian side, with Yasna and Vendidad verse numbers. But it attaches a made-up or misplaced quotation to Yasna 51.16 and wrongly denies that the Bahá'í writings say anything explicit about recognition. Anís names the actual 'Abdu'l-Bahá tablet that says recognition is 'certain', plus the correct Dawn of a New Day letter, which settles the core of the reader's question. His Zoroastrian sourcing is weak: the Gathas line has no verse and doesn't bear on the question, and the 'Denkard' passage is probably the Dadestan-i Denig. On balance Anís is more correct where it matters most. (Perplexity 6.0 s, $0.00575)

#### detachment-buddhism

- T1 *opening*: **px** — Anís did not give a single source or quotation, even though he said he would; his retrieval found nothing relevant. Perplexity gave several real primary-text passages, and Arabic Hidden Words 8 and 68 are cited correctly. It also made real errors: it misplaced the 'essence of detachment' passage, which is from Words of Wisdom, not Arabic Hidden Words 14. It put 'Detachment is as the sun' in a Four Valleys section that does not exist. And it presented a letter written on behalf of Shoghi Effendi as Bahá'u'lláh's teaching. Even so, Perplexity identified far more of the relevant sources than Anís. (Perplexity 7.4 s, $0.00613)
- T2 *reference*: **anis** — The reader asked about one specific passage. Anís answers from that passage, correctly names Bahá'u'lláh's tablet 'He who knoweth his self hath known his Lord', and gives the positive definition it contains. Perplexity first answers with a different text, the Divine Philosophy talk notes, and calls it 'the passage'. It also presents those talk notes as 'Abdu'l-Bahá's own words without qualification, and its Gleanings location looks shaky. It does reach the right tablet at the end. Neither answer says that the tablet is quoted in Juan Cole's provisional translation. (Perplexity 5.3 s, $0.00517)
- T3 *exact_quote*: **px** — Anís gives the reader the exact wording and a paragraph link, but the source is an anonymous 'Sutra Collection' with no named text or translator. He also offers nothing for the second question. Perplexity can't produce the first passage, but it grounds the claim about clinging in specific, real Pali Canon suttas (SN 22.63, 22.121, 12.52), cited by number. It also correctly separates scripture from interpretive paraphrase. Its one flaw is crediting the SN 22.63 translation to the wrong translator. On balance Perplexity's source identification is more correct and more useful. (Perplexity 5.4 s, $0.00555)
- T4 *absent*: **px** — The reader explicitly asked for the Buddha's own words with a sutta name or number. Perplexity gave named, numbered canonical suttas, and SN 22.58 is correct. It also honestly declined to place the earlier fragment. It has one probable numbering error (Virāga Sutta as SN 48.50) and a summary-like quote. Anís gave no sutta identification for his genuine aggregates passage, and his second quote is a modern commentator's paraphrase passed off as the Buddha's words. (Perplexity 5.5 s, $0.00545)
- T5 *pushback*: **px** — Perplexity actually answered the pushback. It admitted that 'systematic release' was its own gloss, said the passage does not use the word virāga, and quoted canonical suttas with their numbers. Most of that is correct, though it gave the wrong title for SN 22.63. Anís left the question unanswered and switched to a Bahá'í Arabic word study. His one citation, Gleanings LXXIX.2, is accurate but has nothing to do with the Buddhist text in question. (Perplexity 4.9 s, $0.00523)

#### equality-sexes

- T1 *opening*: **px** — Perplexity named and quoted the primary Tablet of 'Abdu'l-Bahá (Selections no. 38) and gave the Shoghi Effendi letter with its date (28 July 1936) and the compilation it appears in, which is what the reader asked for. A few of its locations are uncertain. Anís cited real Shoghi Effendi passages but gave no dates and missed the Tablet itself. He also wrongly claimed the restriction is not grounded in the Text. (Perplexity 6.8 s, $0.00621)
- T2 *reference*: **px** — Perplexity answers exactly what the reader asked. It says the quotation comes from a letter written on Shoghi Effendi's behalf, dated 28 July 1936, to an unnamed believer, and that it is not 'Abdu'l-Bahá's own wording. It also gives 'Abdu'l-Bahá's actual Tablet at Selections 38.4. Anís gives no provenance, cites an unrelated memoir, and leaves his earlier misattributions uncorrected. (Perplexity 5.5 s, $0.00594)
- T3 *compare*: **px** — Perplexity names the actual Tablet to Corinne True, with its date, translator and quoted wording, ties it to a specific Aqdas paragraph and the Notes, and correctly labels the text as 'Abdu'l-Bahá's own words rather than a secretary's letter. Its one real error is the claim that the 'men' in ¶30 is rijál. Anís doesn't find the Corinne True Tablet even though a related source was retrieved, gives no Aqdas location, brings in an irrelevant hadith-transmitter lexicon, and calls the Universal House of Justice an interpreter of the text, which is an authority error. (Perplexity 5.7 s, $0.00602)
- T4 *deepen*: **px** — Perplexity found the actual Arabic phrase in the Aqdas (¶52, yā rijāla'l-'adl) and the written text by 'Abdu'l-Bahá (Selections 38). It also kept the Aqdas wording separate from 'Abdu'l-Bahá's interpretation. Anís rested only on Sohrab's pilgrim record and admitted he couldn't answer the 'elsewhere in the Writings' part. He didn't use the surfaced Aqdas or Taherzadeh material. (Perplexity 6.4 s, $0.00631)
- T5 *absent*: **px** — Perplexity gives the actual primary passages at paragraph level: the passage from 'Abdu'l-Bahá in Selections 38.4 and the 28 July 1936 letter written on Shoghi Effendi's behalf. It correctly notes that Selections gives no recipient or date, and it marks the letter as written on the Guardian's behalf rather than by him. Anís quotes a real line from Bahá'u'lláh that does not answer the question, and he wrongly says no relevant passage from 'Abdu'l-Bahá or Shoghi Effendi exists. (Perplexity 5.1 s, $0.00585)

#### return-iqan

- T1 *opening*: **px** — Perplexity cites the passages that actually bear on the question. These are SAQ ch. 33 on John as Elijah and the Íqán's 'I am the return of all the Prophets' passage, both quoted verbatim, plus the matching Gospel verses, all correctly attributed at section level. Its only real slip is presenting a quoted Shí'í tradition as Bahá'u'lláh's own words. Anís gives one valid Íqán paragraph with a link. His second quotation joins an Íqán sentence and an SAQ sentence under a garbled attribution, and he leaves out both the SAQ chapter and the Íqán's key 'return' sentence. (Perplexity 6.6 s, $0.00611)
- T2 *reference*: **px** — Perplexity gave four real passages from the authorised translation of the Kitáb-i-Íqán, each with a paragraph number, and opened with the passage on the Messengers' shared identity as the reader asked. It also correctly placed the John/Elijah example in the Gospels. Anís gave no passages and no locations, and even failed to repeat the 'Temples of the Cause of God' line he had quoted in his own previous turn. (Perplexity 5.3 s, $0.00574)
- T3 *exact_quote*: **px** — The reader wanted the exact Íqán passage on the oneness of the Prophets, with its paragraph. Perplexity gave the authorised wording from Part Two with paragraph numbers that are close, though probably swapped. It also honestly flagged that 'single, enduring divine light' is a paraphrase. Anís was honest about the same point but found nothing and gave no location, even though he had quoted the relevant line in T1. (Perplexity 9.9 s, $0.00538)
- T4 *pushback*: **px** — Both answers admit the paraphrase. Only Perplexity then gives what the reader asked for: real, verbatim Íqán passages ('regarded as one soul and the same person', 'one person, one soul, one spirit, one being, one revelation', the mystic 'return' passage) with paragraph locations. Anís names no source at all. (Perplexity 5.4 s, $0.00594)
- T5 *deepen*: **px** — Perplexity gives the reader the actual Íqán passages on return, so each claim rests on Bahá'u'lláh's own words, and then sets out 'Abdu'l-Bahá's explanation in SAQ, with the John/Elijah application, in the right order of authority. Anís cites only the one SAQ sentence that points to the Íqán. He quotes no Íqán text and gives no source for the term raj'at. Perplexity loses some precision: no paragraph numbers, a wrong 'question 18' label, and a doubtful claim about the numbering. (Perplexity 6.3 s, $0.00616)

#### golden-rule

- T1 *opening*: **px** — Perplexity gave four genuine statements of the Golden Rule by Bahá'u'lláh. Three have correct, exact locations, and they are the classic texts for the rule (Íqán ¶214, Epistle p. 30, Arabic Hidden Words 29). It did give the wrong Gleanings section for the main passage. Anís made no errors, but he cited works only, and one of his three passages fits the rule only loosely. On precision and coverage Perplexity comes out ahead. (Perplexity 3.1 s, $0.00465)
- T2 *reference*: **px** — Perplexity gave the exact Hidden Word (Persian no. 44) with a correct quotation and located the Summons passage by paragraph, all linked to the authorised texts on bahai.org. Anís put an Arabic Hidden Word in the Persian collection, gave no number, picked a passage only loosely related to the Golden Rule, and cited a pilgrim's-note book instead of the Hidden Words. Neither found Arabic no. 30, the closest match. (Perplexity 4.8 s, $0.00487)
- T3 *source*: **px** — Both name the right book and number 68, but Anís puts the passage in the Persian part when it belongs to the Arabic part. Perplexity gives the exact reference, Arabic Hidden Words no. 68, and quotes the authorised text. It also corrects the reader's wrong opening line and plainly rejects the Prayers and Meditations attribution. (Perplexity 5.1 s, $0.0049)
- T4 *compare*: **px** — Perplexity answered the reader's actual question: Arabic Hidden Word no. 68, plus the exact Bible verse (Matthew 7:12). Anís gave neither the number nor any Bible reference, credited Bahá'u'lláh's words to Shoghi Effendi, and padded the answer with an irrelevant Epistle quote. Perplexity's own errors (Gleanings CXXXI instead of CXVII; Bishárát placed in Summons) are real but fewer. (Perplexity 5.3 s, $0.00545)
- T5 *deepen*: **px** — Perplexity wins. It correctly located the passage at Arabic Hidden Word no. 68 and gave the Arabic words actually asked for (turáb wáḥid, jawhar wáḥid). Anís cited the wrong passage (Persian no. 68) and presented its unrelated original as the answer. Perplexity's mistakes are minor: an invented numbering variant and a doubtful Íqán paragraph number. (Perplexity 6.1 s, $0.00558)

#### 004-soul-reincarnation

- T1 *opening*: **px** — Anís's one citation is correct and precise, but it answers only half the question. He said his texts 'do not settle' the Hindu and Buddhist side, even though he had retrieved a Guardian's letter that compares the Bahá'í view directly with the Hindu one. Perplexity actually answers the ontological question. It points to the primary scriptures of each tradition at verse level (Gītā, Upaniṣad, SN 22.59), and to Bahá'í primary texts at least at the level of the book. It has real faults: wrong Gleanings and Some Answered Questions locations, and a doctrinal claim (the 'linear, not circular' progress of the soul) rested on the House of Justice, though in [8] (Reincarnation, Rebirth and the Progress of the Soul) the House largely relays the Guardian's letters. Even so, its source identification is more useful and broadly more correct for the question as asked. (Perplexity 6.8 s, $0.00608)
- T2 *reference*: **px** — Anís correctly identified the exact passage the reader quoted, at paragraph level, though he presented a letter written on Shoghi Effendi's behalf as the Guardian's own words. But that is his only source. He cites no Buddhist scripture and does not use 'Abdu'l-Bahá's texts. Perplexity names 'Abdu'l-Bahá's Some Answered Questions ch. 81 and the Buddhist primary text SN 22.59, so on both sides of the comparison it rests on higher-ranking scripture, as the authority order asks. Its weak points: the lamp and rose illustration comes from ch. 33, not ch. 81, the Selections §30 reference is uncertain, and it misses the letter the reader actually quoted. On balance, Perplexity's sourcing is broader and better grounded in authority. (Perplexity 6.5 s, $0.00614)
- T3 *pushback*: **px** — Perplexity identifies the letter in dispute (Dawn of a New Day p. 201) and quotes it accurately. It also brings in the decisive primary text, Some Answered Questions on reincarnation, plus a Guardian letter on individuality, and it ranks pilgrim notes correctly. Its faults are a probably wrong chapter number (82 rather than 81), a paraphrase shown as a quotation, and a Lights of Guidance quote I cannot verify. Anís names only one pilgrim note, and its passage is about the Trinity, not the soul. He never locates the lamp-and-flower source or the Shoghi Effendi letter, and he never names Some Answered Questions. (Perplexity 6.8 s, $0.00628)
- T4 *compare*: **anis** — On the question actually asked, whether the Bahá'í text gives a reason, Anís quotes and links three primary Bahá'í texts at paragraph level (SAQ, Gleanings, and the Shoghi Effendi letter). Perplexity's Bahá'í quotations rest on an unattributed compilation entry that it frames as the House's compilation, so the real author and authority cannot be checked. Perplexity is better on the Hindu side: it cites the SEP and BU 4.4.7, while Anís cites nothing for Advaita and ignores the retrieved Rāmānuja text. Anís wins overall because he names the Bahá'í sources more precisely and places them correctly in the order of authority. (Perplexity 5.7 s, $0.00589)
- T5 *exact_quote*: **px** — On the main demand, which was the exact Gleanings passage with its link, Anís gave a fabricated composite: invented sentences, a misquoted endurance sentence, and no section number or link. Perplexity also misquoted the body of the passage, but it named the correct section (LXXXI) and linked to the official text. It also correctly identified LXXX as the passage that actually addresses whether individuality survives. Anís did better on Rāmānuja: he gave a plausible quotation from the right SBE 48 work, although without a sūtra number and with an odd link, while Perplexity gave nothing. Overall, Perplexity's correct section identification outweighs this. (Perplexity 6.4 s, $0.00635)

#### seed-21

- T1 *opening*: **anis** — Each of Anís's three citations is correct, linked to its paragraph, and ordered by authority, with the scholarship labelled as such. Perplexity covers the question more fully, but several of its citations are wrong or can't be verified: an apparently invented SAQ chapter 48 title, Lights of Guidance described as Shoghi Effendi's own compilation, and loose section numbers for the Íqán and Selections. (Perplexity 5.8 s, $0.00578)
- T2 *reference*: **px** — Both name the right book. Both get the chapter wrong (72 and 64; it is 74), and both wrongly give Barney as translator of the 2014 wording. Perplexity wins on balance. It quotes the passage exactly, gets Part Five right, and answers the terminology question plausibly ('adam vs. wujud). Anís contradicts himself, makes up a Sohrab detail and doesn't touch the Persian question at all. (Perplexity 6.6 s, $0.0058)
- T3 *compare*: **px** — Perplexity found SAQ ch. 74, flagged that the cold/heat phrase is a paraphrase wrongly treated as a quotation, quoted Enchiridion ch. 11 accurately, and dealt with Ennead I.8. Anís gave no chapter, left the misquotation uncorrected, swapped in City of God for the Enchiridion, and ignored Plotinus. (Perplexity 7.2 s, $0.00625)
- T4 *source*: **neither** — Neither answer gives the Star of the West volume, issue and page, or names who recorded the talk. Anís is honest about the gaps but adds nothing. Perplexity offers useful parallel witnesses (Maḥmúd's Diary, Promulgation), but it calls the Star of the West attribution 'incorrect' and 'to be withdrawn' with no basis: the reader's exact sentence comes from a real Star of the West item. Perplexity also quotes different wording and misses the known translator of Maḥmúd's Diary. So it swaps one unverified attribution for another rather than settling the source. (Perplexity 5.3 s, $0.00573)
- T5 *pushback*: **px** — Both admit the conflation. Perplexity also names a likely source for the passage on opposites (Mahmúd's Diary, ch. 3), quotes it, and points to Some Answered Questions as the right text for evil, though it gets that chapter number wrong. Anís names no source for the passage and cites an irrelevant pilgrim-note line. (Perplexity 5.8 s, $0.00586)

#### seed-39

- T1 *opening*: **anis** — Anís cited the exact correct Aqdas note (109) for the Ishráqát passage and a real Shoghi Effendi letter on the unity of the two Dispensations, though his reply is thin. Perplexity gives a richer picture of what the Bayán teaches, but it puts the Ishráqát passage in the wrong place (a 'note to paragraph 186'). It also attributes the 'Mother Book' label to Bahá'u'lláh without a checkable location, and presents what seems to be a scholar's section heading as part of the Bayán. (Perplexity 9.1 s, $0.00608)
- T2 *reference*: **px** — Perplexity answered both parts of the question. It said the phrase is Walbridge's paraphrase, not Aqdas text, and pointed to the Báb's Bayán and to Selections from the Writings of the Báb for His own words. Anís gave an unofficial Spanish quotation, implied the phrase was Bahá'u'lláh's, and left out the Báb's side completely. Perplexity's specific locations are not certain. (Perplexity 6.0 s, $0.0058)
- T3 *absent*: **undefined** — undefined (Perplexity 5.1 s, $0.00534)
- T4 *exact_quote*: **px** — Perplexity correctly identified the 'accept, reject or modify' sentence as John Walbridge's paraphrase in 'Sacred Acts, Sacred Space, Sacred Time'. It also offered an authoritative alternative from the official Aqdas Introduction and the Báb's own words from Selections. Anís quoted the same sentence accurately but credited it to the Aqdas's own explanatory notes. That raises a scholar's words to the authority of the official volume, even though his own retrieval ID pointed to Walbridge. (Perplexity 5.0 s, $0.00535)
- T5 *pushback*: **px** — The reader asked whose paraphrase this is. Perplexity answered directly and, as far as I know, correctly: John Walbridge, Sacred Acts, Sacred Space, Sacred Time. It also traced Bahá'u'lláh's words to their tablet. Anís said he couldn't settle where the wording came from and leaned on a secondary book (Motlagh) for scripture. He also implied the phrase came from the House's Aqdas notes, and he mangled the quotation. (Perplexity 5.6 s, $0.00547)

#### seed-66

- T1 *opening*: **anis** — Anís quotes the two main primary accounts word for word, the Epistle to the Son of the Wolf and the Súriy-i-Haykal in Summons of the Lord of Hosts, each with a paragraph link. Perplexity also identifies the Epistle, but only paraphrases it. It wrongly says the Kitáb-i-Íqán contains an account of the Síyáh-Chál revelation, and it gives vague 'sections 1–80' for the Íqán. It also leaves out the Maiden passage. Its one useful addition is Rashḥ-i-'Amá, which Anís's retrieval had found but he did not use. (Perplexity 6.6 s, $0.00594)
- T2 *reference*: **px** — Both found the right passage. Perplexity named the actual tablet (Súriy-i-Haykal) and quoted it accurately at length. Its one error is a false claim that the Epistle to the Son of the Wolf also mentions the Maiden. Anís linked the right paragraph of Summons of the Lord of Hosts but never named the tablet. He also gave a passage by Bahá'u'lláh to the Báb, credited a placeholder author ('5480'), and tied a God Passes By line about the Kurdistan seclusion to the Síyáh-Chál. (Perplexity 5.6 s, $0.00571)
- T3 *compare*: **px** — Perplexity names the Bahá'í passage down to the tablet and paragraph (Súriy-i-Haykal §§6–7). It also cites the primary scripture for both comparisons, accurately: Exodus 3, Qur'an 96:1–5 and 26:192–195, and Bukhārī's hadith on the beginning of revelation. Anís cites only the Summons, at work level with a paragraph link, and declines the comparison. He also says no authorized interpreter compares these experiences, but Shoghi Effendi does so in God Passes By. Neither answer cites that passage. (Perplexity 7.1 s, $0.00654)
- T4 *absent*: **px** — Both correctly say that no date or day count comes from Bahá'u'lláh Himself. Perplexity quotes His own account of the Maiden and names the specific tablet (Súriy-i-Haykal), and it keeps scholarly reconstructions separate from the revealed text. Anís cites the chains passage only to a general compilation, attributes the Burning Bush passage to Messages to America (it is best known from God Passes By), and leans on a translator's footnote. (Perplexity 4.8 s, $0.00533)
- T5 *exact_quote*: **anis** — Both answers correctly name Epistle to the Son of the Wolf as the source and quote the passage accurately. Anís links to the exact paragraph, while Perplexity links an excerpt page and its reply is cut off. Neither shows a source-based answer about what followed the Maiden's words. Anís also credits Bahá'u'lláh's dream words to Shoghi Effendi instead of the Epistle, which is a weakness, but his paragraph-level precision on the requested passage still gives him the edge. (Perplexity 6.5 s, $0.00312)

#### seed-93

- T1 *opening*: **anis** — Anís's quotations are mostly verbatim and linked to the exact paragraph in authoritative works. His weak points are two translations he does not flag as unofficial or provisional, and a reply that is cut off. Perplexity's answer engages the question more fully, but it gives no locations, muddles who is speaking in its Advent quotations, and seems to give Bahá'u'lláh a sentence that is 'Abdu'l-Bahá's (Some Answered Questions). Neither answer traces where the phrase 'Most Great Justice' comes from. (Perplexity 6.2 s, $0.00599)
- T2 *reference*: **px** — Both answers correctly say 'these' means 'justice and right' in the Tablet to the Hague, and Anís's paragraph link is more precise on that point. For the rest of the reply, though, Anís leans on a blog's provisional translation labelled as scripture and on a scholarly article quoted as if it were the text. He also names the wrong co-author and gives no source for his 'Authorized Interpretation' point. Perplexity answers the daily-life question with authorised texts it names correctly: Hidden Words Arabic 2, Selections, Paris Talks and the Advent of Divine Justice. My only doubts are about a few of its section numbers and one attribution. (Perplexity 7.1 s, $0.00642)
- T3 *pushback*: **px** — Perplexity quotes the actual passage from the First Tablet to The Hague with its date and paragraph. This shows that 'these' refers to 'justice and right', which was Anís's original reading. It also correctly separates the 'daily choices' line, which was a paraphrase, from the text itself. Anís agrees that the paraphrase was his own, which is right. But he then gives up his correct reading of the Tablet and replaces it with a referent he invented (peace, unity, justice), without checking the text, since his retrieval returned nothing relevant. That puts a factual error about scripture in place of a correct statement. (Perplexity 4.4 s, $0.00526)
- T4 *exact_quote*: **anis** — Anís gives the actual source of the quotation in question, Some Answered Questions, at paragraph level with a working link. That corrects the citation of a secondary compilation, which was the reader's first complaint. Perplexity answers the second half better by linking the authorised Tablets to The Hague, but it stays at work level. It also makes a negative claim I can't verify: the sentence may exist in the older translation. It also ignores the 'pole of justice' attribution. Neither supplies the Hague passage the reader asked for. On correct, precise identification of a quoted text, Anís comes out ahead, though only slightly. (Perplexity 4.4 s, $0.00513)
- T5 *source*: **undefined** — undefined (Perplexity 4.7 s, $0.00513)
