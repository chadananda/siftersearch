# Jafar Dialog Iteration Log — Overnight 2026-04-27/28

**Session start:** ~22:00 local
**Goal:** Run as many of the 100 seed dialogs as feasible against real Jafar; assess between each; iterate the system prompt as patterns emerge; deliver a comprehensive morning report.

---

## Versions tested

### v1 (production at session start)
- Original prompt — research-assistant posture
- Tested in: dialogs 001–004 (manual hand-driven 10-round conversations)
- Average score: 65.5%
- Headline weaknesses: literal-phrase trap, search-result blindness, hedging, generic Bahá'í-discourse reflex

### v2 (proposal — analytical wise-friend)
- Adds Posture section, Persistence ladder, Source hierarchy, Take-a-position rule
- Tested in: 5-round comparison run on Dialog 1 (left/right warnings)
- Estimated score: 72–75% on the same hardest topic v1 scored 58%
- Documented in `docs/jafar-system-prompt-v2.md`

### v3 (deployed — perennialist wise-believer)
- User direction: "Jafar should be the wise believer in the deep unity and wisdom of all prophetic traditions. His wisdom is not from modern materialistic, nihilistic thinking, it is from deep appreciation of the guidance of God through all time and all traditions."
- Adds: explicit perennialist voice section, "How you understand other traditions", "What you are NOT"
- Tested in: dialog 005 (alcohol/tobacco)
- Score: 69%
- **Critical issue surfaced**: Jafar quoted "The system of Bahá'u'lláh is adaptable, and will, in the course of time, evolve and expand…" attributed to Shoghi Effendi — appears fabricated from training memory, not in search results. The "think first, search to verify" posture was making Jafar invent quotes.

### v3.1 (deployed — hard search-before-quote rule)
- Adds: RULE 1 NEVER QUOTE WITHOUT SEARCHING; explicit "Quoting from training memory is the same severity as fabricating"
- Tested in: dialogs 005-007 (alcohol, homosexuality, progressive revelation)
- Scores: 66% / 61% / 60% — average 62.3%, **regression from v3**
- Naturalness dropped from 72→60-65
- Signal pattern: "more specific examples and evidence", "question assumptions more deeply"
- Diagnosis: hard search rule made Jafar more rigid; without abundant searching it had less specific material to work with

### v3.2 (deployed — multi-search + primary-first + specificity + tougher user-agent)
- Adds: RULE 2 SEARCH MULTIPLE TIMES PER TURN, RULE 3 BE SPECIFIC (name the work, the date, the figure), RULE 6 PRIMARY-FIRST SEARCH STRATEGY
- User-agent prompt also strengthened: pushes for primary scripture, demands verbatim quotes when paraphrased, interrogates word meanings across centuries
- Tested in: dialog 005 (alcohol/tobacco)
- Score: **58% — further regression**
- Naturalness: 55 (still dropping)
- Signal: same as v3.1 — "incorporate more direct primary sources"

## The wall: prompt iteration alone has a ceiling

| Version | Dialog 5 score | Naturalness | Issue |
|---|---|---|---|
| v1 (baseline manual) | 58% | n/a | over-hedging, generic |
| v3 | 69% | 72 | fabricated quotes from training |
| v3.1 | 66% | 60 | rigid, less specific |
| v3.2 | 58% | 55 | doubled down on rigidity |

Each prompt tightening reduces naturalness further. The persistent judge signal — "more primary sources" — is not a prompt-fixable problem. Jafar IS searching multiple times in v3.2. The issue is that the search ranking returns Star of the West articles, scholarly essays, and family memoirs above primary scripture from Bahá'u'lláh.

**This is a search-layer problem.** No prompt change will fix it. Required infrastructure work:
1. Add a `source_tier` weight to the indexer — multiply BM25/hybrid scores by source authority
2. Re-rank search results so primary scripture surfaces above commentary
3. Optionally: separate `search_primary` and `search_commentary` tools so Jafar can target tier directly

Until that work happens, prompt iteration has hit its ceiling around 60-70%. v3.2 is the most honest of the versions — it doesn't fabricate, it tries to search well, but it has to work with whatever the index hands it.

## Decision for the rest of the night

Let v3.2 run to completion. The conversations it produces are honest, citation-disciplined, and reasonably wise — just not the 80%+ "archive-worthy" threshold I'd set as a target. The morning report will:
1. Be transparent about the score plateau
2. Identify the search-layer work as the next-leverage move
3. Provide a representative sample of conversations across the 100-question span
4. Document the prompt-version journey for future reference

---

## Iteration cycle

| Pass | Range | Avg score | Weakest dim | Signal | Action |
|---|---|---|---|---|---|
| v1 hand-run | 1–4 | 65.5% | stereotype-avoidance, hedging | analytical posture loses voice | propose v2 |
| v2 spot-test | 1 (5 rounds) | est. 72–75% | source-tier discipline | search returns secondary first | propose v3 |
| v3 batch | 5–? | tbd | tbd | tbd | tbd |

(This table updates as conversations complete and signals accumulate.)

---

## Live progress

(Updated as the batch runs.)

| # | Title | Topic | Score | Naturalness | Believer voice | Archive | Notable |
|---|---|---|---|---|---|---|---|

---

## Patterns to watch

From v1 analysis, carried forward as concerns to verify or refute:
- Does v3 speak with believer-voice or hedge into academic neutrality?
- Does the persistence ladder fire when search is weak, or get over-applied?
- Does brevity-by-default actually work, or do responses balloon?
- Does Jafar resist the numbered-list reflex?
- Does Jafar bring context unprompted (dates, controversies, sister-traditions)?

---

## Notes on architecture

- `scripts/jafar-batch-runner.js` orchestrates: USER-agent (gpt-4o, perpetual-curious-questioner persona) ↔ JAFAR-agent (real chat.js with v3 prompt + tools) ↔ JUDGE-agent (gpt-4o, multi-dimensional rubric)
- Each transcript saved as `src/content/dialogs/{slug}.md` with frontmatter
- Each score saved as `tmp-scores/{slug}.json` for batch analysis
- `scripts/refine-jafar-prompt.js` aggregates signals across conversations to propose next-iteration prompt changes

---

## Refinement deltas (v3 → v3.x)

(To be filled in as the batch runs and signals accumulate.)
