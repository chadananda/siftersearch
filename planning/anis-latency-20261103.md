# Anís site-chat latency — 3 Nov 2026

Goal (Chad): first text "within a few seconds, with a few Jev calls and a couple of LLM calls".
Branch `anis-fast` (not pushed): 2e4a2c79 (live path) + 2de384fc (core-only bare title).

**Labels.** *Measured* = timed by the local harness: the real `anisTurn` from wt-fast, with search and tools served by
production's public API, CONC=2. Its call log records every LLM, Jev and tool call. *Prod* = the wt-W7 launch-gate runs on
production. *Est.* = estimated. All quality scores come from the blind Opus judge (`research-battery.mjs --rejudge`), using
the same Perplexity answers as W7. A win counts when Anís's score is at least Perplexity's.

## Before

| run | first text p50 / p90 | total p50 / p90 | source |
|---|---|---|---|
| prod W8, ANIS_RESEARCH=all | 26.0 / 41.3 s | — | prod, wt-W7 site-chat-after-fix-summary.json |
| prod W3, ANIS_RESEARCH=all | 23.6 / 31.7 s | — | prod, same file |
| local, main code, 8 W3+W8 questions | 35.4 / 48.6 s | 41.1 / 48.9 s | measured |

Where the time went in the local 8-question run (measured):

- **Routes.** Five turns went to the agent and three to the researcher.
- **Sonnet.** 3.5 calls per turn, each about 3.4 s at p50, with input around 13k tokens at p50. Thinking was on, and the
  researcher ran several rounds and then wrote a brief.
- **Tools.** Search p50 2.2 s, source_trace 8.4 s, quotation_trace 7.2 s. Tool calls within a round ran one after another.
- **Jev.** About 0.2 s per call, less than 1 % of the turn (see the Jev section).

## Changes (2e4a2c79)

1. The `site-chat` and `widget-chat` channels carry `live: true`. Email does not.
2. On a live channel, Jev's W3 strategy (comparison, understanding, prayer, guidance, reference) runs **instead of** the
   researcher, which restores W3 routing on site chat. The agent is off on live channels unless `ANIS_RESEARCH` names it.
3. The live researcher runs **one round**: the tool calls are planned once and run in parallel, with no brief round. Jev's
   depth=research raises the round's limit from 5 calls to 8. Deeper work stays with the deep_report job.
4. Researcher tool calls in a round run in parallel (`Promise.all`) on every channel.
5. The live writer is one streaming Sonnet call with thinking off. Sonnet 5.5 rejects `{type:'disabled'}` with an HTTP 400,
   so the registry's `thinkingOff` sends `{type:'between_tools'}` instead.
6. The turn passes Jev's `depth` and lookup intent to respond.
7. A quote's source must be core literature: `sourceHunt` is called with `coreOnly: true`. A bare title opens only a core
   book unless Jev's lookup intent is `book` (2de384fc).

## After (measured, local harness)

| run | first text p50 / p90 | total p50 / p90 | $ / turn | wins vs Perplexity |
|---|---|---|---|---|
| same 8 questions | 8.75 / 12.95 s | 15.2 / 19.5 s | 0.032 | — |
| **W3, 27 questions** | **6.4 / 8.4 s** | 10.3 / 14.6 s | 0.024 | **14/27** (prod after: 21/27, prod before: 12/27) |
| **W8, 42 questions** | **9.4 / 14.6 s** | 15.6 / 20.6 s | 0.032 | **14/42** (prod after: 32/42, prod before: 3/42) |
| W8 db-01..10, live **2 rounds** (experiment, not committed) | 14.7 / 18.9 s | 23.3 / 26.6 s | 0.045 | 5/10 (the same 10 with 1 round: 2/10) |

W3 by class, wins (this run vs prod after):

| class | this run | prod after |
|---|---|---|
| comparison | 1/5 | 4/5 |
| understanding | 3/4 | 4/4 |
| prayer | 4/5 | 5/5 |
| guidance | 3/4 | 4/4 |
| reference | 1/5 | 2/5 |
| negative controls | 2/4 | 2/4 |

W8 by kind, this run: history-story 1/7, who-was 3/8, date-place 3/6, timeline 2/5, explain-passage 3/6, goth-concept 2/10.
Prod after scored 7/7, 8/8, 6/6, 5/5, 3/6 and 3/10.

Mean Anís score in the 2-round experiment was 7.0, against 5.3 for the same questions with one round. The judge is noisy:
Perplexity's score for the same text moved by up to 2 points between runs.

**Verdict: faster, but the quality gate fails.** W8 needs 32/42 or better and W3 needs 21/27 or better. The judge's reasons
on the W8 losses are consistent. One round of searches finds the right books but not the narrative passages ("declines to
walk through Nabíl's narrative", "names none of the seven"), and the Saiedi questions find no Saiedi passage. A second round
recovers much of this (5/10 against 2/10) and costs about 4-5 s. The 4 W3 reference losses (whole psalm, an Isaiah range, the
Gita, Áyat al-Kursí) partly reflect the harness, which reads documents and sections from the local dev subset
(`data/sifter.db`), not production. Prod scored reference 2/5 as well. The 4 comparison losses are mostly a missing side or a
truncated reply: the comparison and understanding formats hit the 1,100-token cap 4 times.

### Where the time goes now (measured, offsets from the turn start, p50 / p90)

| | W3 | W8 |
|---|---|---|
| Jev decisions done | 0.36 / 0.65 s | 0.34 / 0.93 s |
| Haiku research plan done (when it runs) | 1.8 / 3.7 s | 2.1 / 3.0 s |
| last tool returns | 4.5 / 7.0 s | 7.5 / 13.1 s |
| Sonnet writer starts | 4.5 / 9.5 s | 7.5 / 13.2 s |
| Sonnet first chunk after its start | 1.0 / 1.8 s | 1.0 / 1.4 s |
| first text | 6.4 / 8.4 s | 9.4 / 14.6 s |

**Search is now the critical path.** The search tool took 5.4 s at p50 and 9.1 s at p90 in W8, at 2.5 searches per turn
(measured). The same production endpoint, timed directly, gave:

| search request | timing |
|---|---|
| bare, serial | 0.7-1.0 s per search |
| with the `plan` body the tools send, serial | 1.3-1.9 s |
| 3 bare searches in parallel | 2.1 s |
| 3 searches with `plan` in parallel | 3.1 s |

So production search slows down under concurrent load, and the `plan` path adds about 0.6-0.9 s per search. Where the
server serializes is suspected, not proven; profiling it needs tower.

What remains to reach 3-5 s (est.):

- **Search.** It has to stay about 1-2 s under parallel load. This is server work on tower: find where plan searches queue.
- **Sonnet.** It already streams its first chunk about 1 s after the call starts.
- **Jev.** Already at about 0.35 s.

## Jev (separately, measured)

| call | per turn | ms p50 / p90 | request body | input tokens |
|---|---|---|---|---|
| triage (malicious, complete, stop_request, kind, stance) | 1.0 | 125-139 / 373-422 | 5.7k chars | about 1,750 |
| strategy (+ sides) | 1.0 | 191-222 / 422-438 | 3.9k chars | about 1,640 |
| search plan (tradition, comparative, author, shape, about) | 1.0 | 129-146 / 163-286 | 8.1k chars | about 2,790 |
| broken (output check) | 1.0 | 175-205 / 290-315 | 2.4-2.8k chars | — |
| format | 0.1 (W3) | 157 / 175 | 1.3k chars | — |

The ms and chars columns come from the full W3/W8 after-runs. The token figures come from the local before run.

- About 4 Jev calls per turn, and the first three run in parallel. They finish 0.34-0.36 s into the turn at p50.
- Jev was 3-3.4 calls per turn before the change: the agent route skipped some of them.
- **Jev is under 5 % of first-text time.** Narrowing Jev would not change latency measurably.

## Jev's routing errors, per class (evidence for Chad; not a decision)

Chad asked whether a deterministic pre-process should narrow Jev. The evidence below is presented without a recommendation.

### W3 strategy choice against expected (27 questions)

| run | correct | misses |
|---|---|---|
| prod W7, before research | 24/27 | `cmp-missing-side` (Bahá'í and Book of Mormon tithing): Jev chose comparison, but the route ended as topic. `und-soul-after-body` went to range_of_voices/topic. `neg-word-reference` ("significance of the number 19") went to understanding. |
| this run, local | 25/27 | `und-soul-after-body` got no strategy (researcher). `neg-word-reference` went to understanding again. |

Per class in this run:

- comparison 5/5
- understanding 3/4
- prayer 5/5
- guidance 4/4
- reference 5/5
- negative controls 3/4

The two runs agree. Jev's W3 errors are 2-3 in 27, and they are the same two questions both times.

**Routing is not what loses W3 quality.** In this run, 12 of the 13 W3 losses had the correct strategy. They lost on what the
strategy retrieved, or on the writer's token cap.

### W8 (no expected strategy) routes, this run

| kind | routes |
|---|---|
| goth-concept | understanding 9, research 1 |
| db (history, who, date, timeline, passage) | research 30, understanding 1, no strategy 1 |

### Wording battery (tests/quality/reports/anis-wording-2026-11-01.json, 1,200 scored)

`strategy_ok` was 1,049/1,200 (87.4 %). Classes with the most misses:

| class | wrong | detail |
|---|---|---|
| library_meta | 92 % (12/13) | wanted fact/converse, got enumerate |
| author_theme | 54 % | |
| author_scoped | 54 % (22/41) | went to quote 12, lookup 10 |
| misattribution | 23 % | |
| find_person | 22 % (42/195) | went to quote 27, enumerate 8 |
| find_work | 14 % | |
| lay_paraphrase | 10 % | went to topic 11 |
| scoped_topic, define_term, source_resolution, history_fact, exact_phrase, compare | 3-5 % each | |
| enumerate | 0 % | |

Later runs: post-fix 1,059/1,205 (87.9 %), r3c spot check 111/116 (95.7 %).

Caveat: the battery's "shape" is the final route. Code paths after Jev can also set it, so this rate is an upper bound on
Jev's own error rate.

## Spend

| item | $ | basis |
|---|---|---|
| before run | 1.04 | measured |
| after smoke runs | 0.33 | measured |
| W3 run | 0.65 | measured |
| W8 run | 1.36 | measured |
| 2-round experiment | 0.45 | measured |
| Opus judge | 2.70 (W3 0.80, W8 1.52, 2-round 0.38) | measured |
| **total** | **about 6.5** | against a cap of 8 |

## Two rounds on production search (after the main search speed-up, e4b727df + 4 API instances)

Changes (4340368c, c83c45c8):

1. **Round 2 searches inside the books that round 1 found.** It is code with no model call. Books come first from
   document_search (searched with the reader's question), then from each search's documents, round-robin by rank. Each book
   is searched with fused_search (`filters.documentId`, 5 hits), all in parallel. There are 3 books, or 4 at
   depth=research, and a failed book loses only its own passages.
2. **Jev's understanding strategy gets the same step.** The W8 goth questions route there.
3. **The writer's token cap is 2,400 for comparison and understanding.** It was 1,100.
4. **Reference fixes.** A whole chapter is quoted whole, up to 60 rows. A range in an edition without verse numbers now
   covers every verse asked for.

Harness: the same `anisTurn`, with search, tools **and the reference/prayer document reads** served by production's public
API (`/api/documents`). The W3 reference reads are therefore real. CONC=2. Judge: the same blind Opus rejudge against the
same Perplexity answers. A win means Anís scored at least as well as Perplexity.

| run (measured) | first text p50 / p90 | total p50 / p90 | $ turns | wins | target |
|---|---|---|---|---|---|
| **W3, 27** | **4.3 / 7.6 s** | 10.7 / 13.9 s | 0.81 | **18/27** (1 judge error, counted as a loss) | 21/27 |
| **W8, 42** | **6.6 / 8.5 s** | 12.7 / 15.8 s | 1.91 | **23/42** | 32/42 |
| W3, the 1-round run above | 6.4 / 8.4 s | 10.3 / 14.6 s | | 14/27 | |
| W8, the 1-round run above | 9.4 / 14.6 s | 15.6 / 20.6 s | | 14/42 | |

First text p50 by route (measured):

- W3: reference 2.6 s, guidance 3.4 s, prayer 4.0 s, comparison 4.2 s, understanding 6.4 s, other 5.7 s.
- W8: understanding 4.6 s, researcher 6.9 s.

The W8 researcher path, as offsets from the start of the turn (p50 / p90, 32 turns):

| step | offset |
|---|---|
| Haiku plan done | 1.9 / 2.6 s |
| round-1 searches done | 4.3 / 5.2 s |
| round 2 (in-book) done | 4.9 / 6.8 s |
| writer's first chunk | +1.2 / 2.1 s after it starts, with about 16.8k input tokens |

Search (p50 1.8 s, p90 3.0 s, 1.8 per turn) is still the largest step. Round 2 costs about 0.6 s at p50, because fused_search
inside a book takes 0.4 s.

### Wins by class

| | W3 class | wins | | W8 kind | wins |
|---|---|---|---|---|---|
| | comparison | 2/5 | | history (db) | 22/32 |
| | understanding | 3/4 | | goth (Saiedi) | **1/10** |
| | prayer | 5/5 | | | |
| | guidance | 3/4 | | | |
| | reference | 2/5 | | | |
| | negative controls | 3/4 | | | |

### Why each class loses (the judge's reasons, abridged)

- **goth: 9 of 10 lost. Round 1 never finds Gate of the Heart.**
  - Inside the book the search is excellent. Measured: fused_search with documentId 8632 for "Saiedi interpretive revelation
    modes of revelation" returns ¶165 ("The Báb's interpretation is interpretive revelation…") and ¶185-186 (the four modes),
    in 0.8 s.
  - The general search does not surface it. The planned search for "In Gate of the Heart, how does Nader Saiedi divide the
    Báb's writings into three stages?" returned God Passes By ×4, the Arabic Bayán and Panj Sha'n. Its `_plan` had
    `prefer: null` and no target work. fused_search across the library returned the *review* of the book (284049), not the
    book itself.
  - document_search with `title: "Gate of the Heart"` finds 8632 at once (encumbered: 1). But the researcher's Haiku did not
    call it in goth-01, although the prompt asks it to. The understanding strategy has no title lookup.
  - Judge, goth-02: "names none of the modes, and sends the reader off to search again".
  - Fix candidates (not built):
    - Jev's search-plan `author`/work slot should name Saiedi / Gate of the Heart for these questions; its plan returns
      `prefer: null` today.
    - Alternatively, the live path could pass Jev's named work to document_search, so the work's id joins round 2.
    - Either way Jev decides. No word rules.
- **db: 10 of 32 lost.**
  - The losses are the narrative still told thinly: "leaves out the heart of the night" (db-01), "the siege itself in one
    thin paragraph" (db-02), and "names no towns between Iṣfahán and Tabríz" (db-24).
  - Some losses are refusals when the passage was present: db-28 "won't name the siyyid … though both are in the passage
    right before the quoted lines".
  - Some are wrong dates: db-19 places the end of Ṭabarsí in autumn 1849, and db-26 dates Nayríz to 1850.
  - db-32: "cannot tell which Tablet is meant".
- **W3 reference: 3 of 5 lost.**
  - Psalm 23 now wins: it is quoted whole.
  - Isaiah 11:6-9 still gets verses 8-9 only. In this KJV edition chapter 11 is 13 rows for 16 verses, with no verse marks,
    so the place by position is off by two rows.
  - Gita 2:47 loses because Arnold's verse translation has no verse numbers, and position lands at the chapter's end.
  - Áyat al-Kursí loses only on detail (7 vs 8: no Arabic).
- **W3 comparison: 3 of 5 lost** (missing-side, fasting, afterlife). A thin or declined side: no 3 Nephi 24, calendars not
  compared, the Gita passage cut off. With the 2,400 cap these are no longer truncations. They are retrieval: one search
  per side.
- **guidance (supersede) and the negative-control prayer question:** "mostly says what it cannot determine".

### Spend (this phase, measured)

| item | $ |
|---|---|
| turns: W3 0.80, W8 1.91, W3 reference re-run 0.09 | 2.80 |
| Opus judge: W3 0.81, W8 1.51, W3 rejudge 0.80 | 3.12 |
| **total** | **5.92**, against the $8 cap for this phase |

**Verdict:**

- Speed: W3 passes (4.3 s). W8 misses the 6 s p50 target by 0.6 s, at 6.6 s.
- Quality: both batteries fail the gate (18/27 against 21/27, 23/42 against 32/42). Both improved on one round (14/27,
  14/42).
- Most of the W8 gap is the goth class. Its cause is finding the book (Jev's plan names no work), not the number of rounds.
