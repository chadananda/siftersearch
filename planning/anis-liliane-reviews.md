# Anís × Liliane — letter-by-letter reviews

Chad 10-23: *"Liliane is helping test Anís (email), so make sure to carefully check each Anís answer to see if we could have
done better. If so, fix, and then have Anís send a follow-up email as a reflection on what he could have done better."*

Reader: liliane.saberin@gmail.com, one Gmail thread (`<CAG0CNiwHG2Da4iXQsznnjhC…>`, subjects "irfan" → "Something more on
“than let's use the english word knowledge”"). Message ids are D1 `anis.mail_messages.id`.

## Runbook (resumable)

1. **List what is waiting:** `GET https://siftersearch.com/_mail/reviews?status=pending` with `x-internal-key: $INTERNAL_API_KEY`.
   It also queues anything new first. The hourly cron (`0 * * * *` → `queueReviews`, worker/mail/reviews.js) queues every
   letter Anís SENDS to a watched reader (setting `reflection_readers`) as `pending`, so none is missed. Reflections are
   not queued. Each row carries the letter's text and the reader's message it answered.
2. **Review each one** against: accuracy (quotes verified, links resolve), completeness (did it answer what she asked),
   use of our sources (authorized translations, CTAI / word_study, find_translation, reading guide), rendering (markdown,
   bidi, ```bilingual tables, markers ¹²³), and tone/length. Append the review below: date · her question · the answer in
   brief · issues · severity · verdict (good / could be better / wrong).
3. **Record the verdict:** `POST /_mail/reviews {letter_id, verdict, severity, summary}`.
4. **If it could be better, fix the ROOT cause** (code / prompt / tool), with a test or a battery case
   (`scripts/anis/research-battery.mjs` cases 11–12 are hers). Push. Wait until tower runs the commit
   (`GET /api/admin/ops/services`, siftersearch-anis). Then re-run the same question through the fixed Anís: POST
   `https://api.siftersearch.com/api/v1/anis/draft` `{async:true, job, messages, email:'test-rerun@siftersearch.com'[, attachments]}`,
   then poll `GET …/draft/job/<job>`. The test-rerun address is kept out of the digest. Keep both versions here.
5. **One reflection per letter, only to Liliane, only for a real improvement:** `POST /_mail/reflect {to, covers:[letter ids], text}`.
   The text is Markdown in Anís's voice: what he could have done better, then the corrected answer, with proper rendering
   and links. The Worker refuses it unless `to` is a watched reader and each covered letter is reviewed `could be better` or
   `wrong` with no reflection yet. It is sent in her thread, logged in `mail_reviews.reflection_id`, and listed in the daily
   digest under "Anís reflections".
6. Local helpers used in this session: `d1.sh` (wrangler d1 execute anis --remote) and `rerun.py` (thread replay, `ATT=` an
   image, `ONLY_LAST=1`) in the session scratchpad. They are easy to recreate from the steps above.

**Two traps:** (1) inbound text in D1 includes the quoted history, so cut at the "On … wrote:" line (the Worker's `ownText`).
(2) The per-person daily cap does not apply to replies, and reflections are replies.

## Status (10-23, end of session)

| # | sent (UTC) | her question | verdict | severity | reflection |
|---|---|---|---|---|---|
| 31 | 10-12 21:38 | What is Irfan in the Bahá'í Faith? | good | low | none needed |
| 36 | 10-13 17:41 | please give me some example of ILM in the writings | wrong | high | R1 |
| 38 | 10-13 18:12 | than let's use the english word knowledge | could be better | medium | R1 |
| 67 | 10-16 19:01 | (outreach on "knowledge") | wrong | medium | R1 |
| 693 | 10-18 19:01 | (outreach on "knowledge") | wrong | medium | R1 |
| 720 | 10-23 15:02 | find the original of this English prayer | wrong | high | R2 |
| 898 | 10-23 17:40 | (photo of the Persian) can you translate this | wrong | high | R2 |
| 904 | 10-23 17:58 | (typed Persian) translate this, or go to Jafar | could be better | medium | R2 |

Discarded drafts 28 and 30 (10-12) never reached her. Chad's review gate caught them; they are noted under #31.

---

## #31 · 10-12 · "What is Irfan in the Baha'i faith?" → **good** (low)

**Answer:** ʿirfán (عرفان), root ع-ر-ف, "knowing by recognition"; CTAI chart of Shoghi Effendi's renderings across 62
passages (knowledge 22, recognition 12, understanding 8 …); a 7-row table setting the original beside his English (PM LVIII.9,
Íqán 158, PM LXII.1, Gleanings CXXIV.1, LXXXIX.4, LXXXII.1, II.1); Gleanings II opening line quoted; offers maʿrifat / ʿilm.
**Checked:** the Gleanings II quotation is exact. The CTAI links resolve. The renderings are consistent with CTAI's per-word counts.
**Issues:** (1) She had to ask "did you get my question". The first two drafts (28: "I cannot find any definition or mention
of Irfan", 30: an empty hello) were discarded by Chad, and the good letter went 6½ h after her question. The old pipeline
caused this; the researcher (10-19) and immediate replies now cover it. (2) The plain-text part shows the chart as a stack
of bare lines (visible in her quoted reply). The HTML part was fine.
**Verdict:** good. Nothing to reflect on.

## #36 · 10-13 · "please give me some example of ILM in the writings" → **wrong** (high)

**Answer (sent):** "the records available to me do not contain examples or discussions of ʿilm", then an authority-layers
paragraph and an empty bulleted list ("No cited examples of ʿilm in the current records").
**Issues:** False. علم is one of the commonest words in the Writings (Íqán ¶154, ¶183, ¶202; Gleanings; Tajallíyát …).
The old one-search pipeline's "never fill gaps" rule turned a failed lookup into "the library has nothing". It also offered
boilerplate about authority instead of an answer.
**Root cause / fix:** already fixed by the researcher (1419d956, 10-19: word_study + search, an empty result is never
evidence). No new code was needed.
**Re-run (10-23, fixed Anís):** five sections. "Knowledge is as wings to man's life…" (Tajallíyát); "the sciences of today
are bridges to reality" and "if learning be not a means of access to Him…" ('Abdu'l-Bahá); Íqán ¶202 in a bilingual block
(علم …); Íqán ¶154 "divinely-learned" = ʿulamá-yi rabbání; a closing reading of ʿilm against ʿirfán. Substantive and correct.
**Reflection:** R1.

## #38 · 10-13 · "than let's use the english word knowledge" → **could be better** (medium)

**Answer (sent):** one passage (Some Answered Questions: "knowledge is figuratively described as light…"), then a paragraph
listing the layers of authority, then one sentence of reflection.
**Issues:** Thin: one passage for a study question. The authority paragraph is boilerplate (that rule was retired 10-19). It
never connects "knowledge" back to her ʿilm / ʿirfán question.
**Root cause / fix:** the old pipeline. The researcher replaced it (10-19).
**Re-run:** Gleanings II ("The beginning of all things is the knowledge of God"); the Báb, "True knowledge … is the knowledge
of God" = recognising His Manifestation; SAQ "the knowledge of the Manifestations of God is the knowledge of God"; Íqán ¶166,
¶183, ¶202 with the Persian; knowledge and light; religion "the supporter of knowledge". Much better.
**Reflection:** R1 (with #36).

## #67 · 10-16 · outreach "Something more on “than let's use the english word knowledge”" → **wrong** (medium)

**Letter:** "I neglected to mention that I can also show you the original words behind a translation", then "I cannot
find a passage that sets an English word on 'knowledge' beside its original", the authority boilerplate, and a footnote
on *manqúl va maʿqúl*.
**Issues:** The letter advertises a capability and then says it cannot use it. A letter Anís starts must never decline.
The subject quotes her two-word follow-up.
**Root cause / fix (dd952f55):** `/outreach` used the old one-search path. It now uses the researcher
(`direction.research`). `weakLetter()` makes a declining letter silent, and `threadQuestion()`/`subjectTopic()` name the
real question. Re-run of her thread through /outreach: **silent**. The gate held. Silence beats that letter.
**Reflection:** R1.

## #693 · 10-18 · outreach (same subject) → **wrong** (medium)

**Letter:** four "related" passages about *words* and *learning to read* (The Chosen Highway, with its scan typo "ion";
a pilgrim note; Fires in Many Hearts; The Priceless Pearl), prefaced "the texts I can search here do not settle a
systematic definition of 'knowledge'".
**Issues:** The passages are irrelevant to knowledge (they matched the word "words"). They are pilgrim notes and memoirs
on a doctrinal theme, which is an authority error. The letter also hedges.
**Root cause / fix:** same as #67.
**Reflection:** R1.

## #720 · 10-23 · "this is a translation of a prayer can you find the original for me" → **wrong** (high)

**Her text:** an English prayer ("O Divine Providence! Render thou the friends successful… that the Turks may regard the
Persians as confidants… ‘Ayn, ‘Ayn").
**Answer (sent):** "I couldn't find the exact Persian". It offered a different tablet (AB05556, "O servant of Bahá! Sow
thou a seed…") for the East/West image and a Star of the West line, and suggested she find the English's source.
**Issues:** The tablet IS in the library: Phelps' inventory **AB05355** ("O Lord! Make Thy loved ones victorious…", with
"may the Turk consider the Tajik an intimate companion"). Anís offered a sibling tablet as if it were a lead. It did not
recognise ع ع as 'Abdu'l-Bahá's signature.
**Root cause / fix:** the researcher had no way from an older English wording to the Persian. The prompt now says: render
distinctive clauses into Persian ("the Turks … the Persians" = ترک … تاجیک), search, and the moment any original wording
appears (even a memoir quoting it) call find_translation with it. ع ع is signed 'Abdu'l-Bahá (dd952f55). Battery case 12
must contain AB05355.
**Re-run:** found AB05355 through Furútan's *Trip to USSR*, which quotes the prayer. It gives the matching lines beside
Phelps' rendering in a bilingual block and explains *tájík* and *farang*. This is the right tablet. It is still partial,
because it read only the memoir's lines; 34a58373 (find_translation by line and by meaning) closes that.
**Reflection:** R2.

## #898 · 10-23 · photo of the Persian: "Can you translate this for me to english" → **wrong** (high)

**Her letter:** an image attachment `Munáját-háy-i-Hadrat-i-'Abdu'l-Bahá Prayer 51 pp. 51-52.jpg`, two pages of the
printed *Munáját* with prayer 51 (هو الله · ای پروردگار یاران را کامکار کن … ع ع).
**Answer (sent):** "The picture itself hasn't reached me". Then a DIFFERENT prayer (AB06734, "O Thou Incomparable God!…")
with Anís's own rendering and word notes, and the admission "the match is partial".
**Issues:** The photo was dropped at the door. inbound() never stored attachments, and the draft never saw them. Offering
an unrelated prayer, glossed at length, misleads.
**Root cause / fix (dd952f55):** inbound images and PDFs go to R2 (`anis-mail/<id>/…`) and `mail_attachments`.
`draftJob` sends them to tower. A vision role (`anis-read-attachment`, Sonnet 5.5) transcribes each verbatim in its own
script, keeps the file name and joins it to her message (api/lib/assistant/attachments.js; tests in
anis-liliane-fixes.test.js).
**Re-run with her photo (after 34a58373 too):** the photo is read: "prayer 51 in the *Munáját*", the full Persian clause by clause, and notes on the differences from her English. Still its OWN translation, because find_translation cannot reach AB05355 (see "Open" below). Earlier re-run: it reads the photo: the full Persian of prayer 51, from هو الله to ع ع, in a bilingual block,
with the one unclear word left as a gap. It names her English as the same prayer and notes ای پروردگار vs "O Divine
Providence", همدم, ترک/تاجیک, فرنگ. Remaining flaw: it said "no published English translation tied to this Persian" and
translated it itself. find_translation missed AB05355 on the transcription, which is fixed in 34a58373 (re-run below).
**Reflection:** R2.

## #904 · 10-23 · typed Persian: "can you translate this one or go to jafar to do this" → **could be better** (medium)

**Answer (sent):** "it is the same prayer"; a 17-bullet "line by line" (`- Persian: *English*`); identifies Phelps'
AB05355 and quotes one sentence of it; notes on پروردگار, پرغرور, Turk/Tajik; *100 Prayers* PDF link.
**Issues:**
- The bullets mix scripts, so in Gmail the lines arrived scrambled (full stops at the wrong end, right-aligned).
  The parallel agent fixed this (488c49c5: the ```bilingual two-column table).
- It used its own translation although Phelps' provisional AB05355 exists. Fixed in parallel (558199a5: find_translation;
  existing translations first, labelled).
- A stray section, "The image you asked about earlier — I can't tell you … which tablet this is", contradicts the
  identification above it.
- "go to Jafar" went unanswered.
- Routing (found by the parallel agent): sent on its own, this message went to the READING GUIDE (an address with an
  open reading) or was templated as small talk (a fresh address). Fixed here (dd952f55, text-request.js): a pasted
  original or a translate / find-the-original request is research in reading.js, turn.js and respond.js.
- Their redraft merged middle lines into Phelps' sentence and numbered its markers ¹ → ³. Fixed: one pair per clause
  (channels.js) and `renumberSources()` in the Worker's tidy.
**Re-run, standalone from an address with no thread:** research path; Phelps' AB05355 verbatim, clause by clause, 15
rows, marker ¹ only; notes on the scan's shuffled words (درنگ / بی‌درنگ, توئی بخشنده) and on دمساز, مهرپرور, الفت.
Correct and well rendered.
**Reflection:** R2.

---

## Reflections sent (10-23 19:33 UTC, both in her thread, subject "Re: Something more on “than let's use the english word knowledge”")

- **R1 = mail #909, covers 36, 38, 67, 693.** It admits the false "no examples of ʿilm", the single passage and the two weak
  outreach letters. It gives Íqán ¶154 in a bilingual table (Persian from CTAI beside Shoghi Effendi, verified), where
  *maʿrifat* (same root as ʿirfán) stands against *ʿilm*/*ʿálim*/*ʿulamá-yi rabbání*. Then Íqán ¶202 (*ʿilm* misnamed), the
  Tajallíyát ("Knowledge is as wings…") and 'Abdu'l-Bahá ("The sciences of today are bridges to reality…"). Every
  quotation was checked against the library and CTAI.
- **R2 = mail #910, covers 720, 898, 904.** It admits the dropped photo, the two wrong-tablet leads, and the scrambled list
  with its own wording. It names the source (Munáját, prayer 51, pp. 51–52). It gives the full prayer in a ```bilingual
  table: the Persian read from her photograph, and Phelps' AB05355 English verbatim (checked against doc 972497),
  clause by clause, ¹ Anís (heading, signature) and ² Phelps. It explains how her English renders پروردگار, فرنگ and
  ترک/تاجیک, and answers "go to Jafar".
- Both were rendered and inspected before sending (scratchpad refl/r1.png, r2.png).

Texts as sent: `SELECT text FROM mail_messages WHERE id IN (909, 910)` (D1 anis).

## Open

- **AB05355's Persian is not searchable.** The core-tablets doc 972497 holds only Phelps' English (one paragraph, no
  original). /search/original and source-hunt never reach it from the Persian, so find_translation cannot connect a
  reader's Persian to an existing Phelps translation. Anís reached it only by drafting a literal English line and running
  source_of. Proposal for Chad: store each PI tablet's original beside its English (or link the original doc, e.g.
  *100 Prayers* / Munáját), so Persian → existing translation works.
- The *100 Prayers by 'Abdu'l-Bahá* PDF text on oceanoflights is scrambled (reversed RTL extraction). It is worth re-OCR.
- Her English "O Divine Providence! Render thou the friends successful…" is not in the library. R2 asks her where it was
  published.
- Outreach to her is now researcher-written, and silent when weak. The next one is due ~10-26 (cadence 3 days after her
  last letter).
