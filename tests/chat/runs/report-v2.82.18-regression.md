# Jafar Quality Report — v2.82.18-regression

> Generated: 2026-05-18T10:25:10.175Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 7 |
| Passed | **2 (29%)** |
| Failed | 5 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.71 | 1.5 | 4 | ✓ |
| Citation Presence | 3.14 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.29 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 4.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.00 | 1.5 | 4 | ✓ |
| Logical Coherence | 3.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.86 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.29 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.29 | 1 | 3 | ✓ |
| Quote Economy | 3.43 | 1 | 3 | ✓ |
| Instruction Following | 4.43 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.29 | 0.5 | 3 | ✓ |
| No Hallucination | 3.00 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 3.43 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.15 | 3 |
| lookup | 3.54 | 3 |
| reading | 4.15 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.54 |
| browsing | 3.15 |
| reading | 4.15 |

## Failure Diagnoses (worst first)

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=2.34
  Failed: citationAccuracy, logicalCoherence, quoteEconomy, noHallucination, noGeneralKnowledge
  Diagnosis: The response correctly answers the browsing question with accurate library statistics (toolUsage=5, instructionFollowing=5). However, it then appends a completely unmotivated Bahá'í quote about trust in God that has zero relevance to document counts, creating the appearance of source authority and citation while actually hallucinating a link and forcing a spurious connection. The quote is not summoned by the question, adds no value, and suggests the assistant is padding a simple factual answer with unrelated spiritual content — a critical failure in noHallucination (1) and citationAccuracy (1). The question asks for a statistic, not theology. A one-sentence answer with the breakdown would be perfect.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=2.85
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration, noHallucination, noGeneralKnowledge
  Diagnosis: The response used the correct tool and correctly reported the document count (475), but contains a critical hallucination: the link and title '[The Institution of the Mashriqu'l-Adhkár](https://oceanlibrary.com/institution-of-the-mashriqul-adhkar_bahaullah)' appears fabricated—the URL structure is wrong and attributes the work to Bahá'u'lláh when it's supposedly by the UHJ. For a lookup query, the user needed a direct count (delivered correctly) plus representative titles; instead, they got a misleading example with an invented URL. Remove the fabricated link and either list actual UHJ document titles from the search results or acknowledge you cannot list all 475 without additional queries.

- **[66] browsing** (browsing) "What's the largest collection?" — overall=2.9
  Failed: citationAccuracy, logicalCoherence, noHallucination
  Diagnosis: The response correctly identified the largest collection and used the right tool, but then undermined itself by fabricating a quote. The inline link appears authentic but the quote 'well-being of mankind' cannot be verified as coming from that source, and the citation feels artificially grafted onto a question that didn't ask for spiritual interpretation—this is hallucination plus unnecessary editorializing. For a simple browsing question, the factual answer alone would have been sufficient and stronger.

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.17
  Failed: logicalCoherence, inlineQuoteIntegration, noHallucination, noGeneralKnowledge
  Diagnosis: The response used the library tool correctly and identified two real works by Rumi, but then padded its answer with generic characterizations ('depths of mysticism,' 'profound reflections') drawn from general knowledge rather than the library. For a lookup query, the user is asking 'Do you have this?' — the tool call confirmed it (library_count = 3), and the assistant should have simply listed the works found, possibly with a note inviting further browsing. Instead, it added ungrounded interpretive commentary that sounds wise but isn't anchored to any retrieved text. If it had quoted an actual passage from the Masnavi or Divan to illustrate why these works matter, that would be different — but summaries of 'mysticism and spiritual insight' are filler. Keep the listing, drop the gloss.

- **[75] reading** (reading) "Show me the first few paragraphs of the Tao Te Chi" — overall=4.15
  Failed: logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response correctly retrieves and cites the opening passages with proper attribution and links, fulfilling the reading request. However, it treats three consecutive paragraphs as a unified block with minimal framing prose—the single introductory sentence ('opens with profound reflections...') doesn't guide the reader through the logical arc of the verses, and the assistant doesn't note that these are alternative translations or framings of the same opening concept. For a 'show me' request, slightly more contextual guidance between quotes would improve coherence without sacrificing brevity.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Logical Coherence | 5 | 71% |
| No Hallucination | 4 | 57% |
| Inline Quote Integration | 3 | 43% |
| No General Knowledge / No Secular Drift | 3 | 43% |
| Citation Accuracy | 3 | 43% |
| Quote Economy | 1 | 14% |

## Common Diagnosis Themes

`response` (5x), `correctly` (5x), `answer` (4x), `would` (4x), `question` (3x), `quote` (3x), `document` (3x), `assistant` (3x), `spiritual` (3x), `works` (3x)
