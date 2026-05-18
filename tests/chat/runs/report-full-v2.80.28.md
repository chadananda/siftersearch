# Jafar Quality Report — full-v2.80.28

> Generated: 2026-05-18T04:10:43.088Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 110 |
| Passed | **104 (95%)** |
| Failed | 6 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.35 | 1.5 | 4 | ✓ |
| Citation Presence | 4.27 | 2 | 4 | ✓ |
| Citation Accuracy | 4.26 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.17 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.40 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.15 | 1 | 4 | ✓ |
| Critical Engagement | 3.26 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.94 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.74 | 1 | 3 | ✓ |
| Quote Economy | 4.16 | 1 | 3 | ✓ |
| Instruction Following | 4.95 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.46 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.77 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.97 | 10 |
| framing | 4.29 | 10 |
| lookup | 4.00 | 10 |
| reading | 4.62 | 5 |
| research | 4.31 | 73 |
| social | 4.80 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.00 |
| browsing | 3.97 |
| comparative | 4.27 |
| edge | 4.33 |
| factual | 4.40 |
| framing | 4.29 |
| multi | 4.23 |
| philosophical | 4.50 |
| reading | 4.62 |
| topical | 4.23 |

## Failure Diagnoses (worst first)

- **[35] author** (lookup) "Who wrote the most books in the library?" — overall=3.32
  Failed: toolUsage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks a direct answer to the user's query about who wrote the most books in the library, instead providing a general overview of prolific authors across different traditions. To improve, it should focus specifically on the authors within the Ocean Library and provide a clear answer based on the search results.

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.59
  Failed: logicalCoherence
  Diagnosis: The response provides a good overview of Moojan Momen's works but lacks direct quotes from the library to support the claims about his writings. To improve, it should include specific quotes or excerpts from the documents to enhance citation presence and inline quote integration.

- **[98] multi** (research) "I'm a Christian interested in what other religions" — overall=3.71
  Failed: citationPresence, inlineQuoteIntegration
  Diagnosis: The response lacks comprehensive coverage of non-Christian perspectives on the return of Christ, particularly from other religions. To improve, it should include specific quotes from relevant texts in Islam and other traditions, ensuring a more balanced view of the topic.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.78
  Failed: topicCoverage, inlineQuoteIntegration, instructionFollowing
  Diagnosis: The response lacks clarity in addressing the user's vague query, leading to a somewhat disconnected exploration of Buddhist concepts. To improve, the assistant should seek to clarify the user's intent before providing information, ensuring that the response is more directly relevant to their question.

- **[28] author** (lookup) "Show me books by Shoghi Effendi" — overall=3.85
  Failed: toolUsage
  Diagnosis: The response provides a good overview of Shoghi Effendi's works but lacks direct quotes from the library to substantiate claims. To improve, it should include specific passages from the retrieved documents to enhance citation presence and accuracy, ensuring every claim is directly supported by the texts.

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=3.98
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively covers the topic of covenants in both the Bahá'í Faith and Judaism, but it could improve in critical engagement by addressing the differences in how each tradition interprets the concept of covenant. Additionally, while the citations are mostly accurate, the integration of quotes could be more fluid to enhance the overall coherence of the argument.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Inline Quote Integration | 3 | 3% |
| Tool Usage | 2 | 2% |
| Logical Coherence | 2 | 2% |
| Instruction Following | 2 | 2% |
| Topic Coverage | 1 | 1% |
| Citation Presence | 1 | 1% |

## Common Diagnosis Themes

`response` (7x), `lacks` (5x), `improve,` (5x), `should` (5x), `quotes` (5x), `direct` (3x), `user's` (3x), `overview` (3x), `library` (3x), `include` (3x)
