# Jafar Quality Report — sweep-v1

> Generated: 2026-05-15T13:03:52.153Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 14 |
| Passed | **9 (64%)** |
| Failed | 5 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.86 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.79 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.93 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.79 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.07 | 1.5 | 4 | ✓ |
| Logical Coherence | 3.93 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.93 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.64 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.57 | 1 | 3 | ✓ |
| Quote Economy | 3.86 | 1 | 3 | ✓ |
| Instruction Following | 4.64 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.43 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.43 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.69 | 3 |
| research | 4.03 | 10 |
| social | 4.20 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.69 |
| edge | 4.27 |
| multi | 3.86 |

## Failure Diagnoses (worst first)

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.2
  Failed: toolUsage, citationAccuracy, topicCoverage, logicalCoherence
  Diagnosis: The response lacks depth in citations and does not provide direct quotes from the documents, which is crucial for a lookup request. To improve, it should include specific quotes from the Universal House of Justice's documents to substantiate its claims and enhance authority.

- **[96] multi** (research) "How many documents by 'Abdu'l-Bahá do you have, an" — overall=3.29
  Failed: citationPresence, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response provides a good overview of the number of documents by 'Abdu'l-Bahá but lacks specific titles discussing governance, which is the user's primary request. Additionally, the inclusion of unrelated religious texts dilutes the focus on 'Abdu'l-Bahá's writings. To improve, the assistant should directly list relevant documents on governance and avoid extraneous comparisons unless they directly relate to the query.

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=3.49
  Failed: toolUsage, citationPresence, citationAccuracy, inlineQuoteIntegration
  Diagnosis: The response lacks sufficient citations from the Bahá'í texts, which weakens the overall authority and completeness of the answer. To improve, the assistant should ensure it retrieves and includes specific Bahá'í passages related to the covenant, thereby enhancing the depth and accuracy of the response.

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=3.85
  Failed: topicCoverage
  Diagnosis: The response effectively uses the library to confirm the absence of Thich Nhat Hanh's works and provides a relevant quote from a Buddhist text. However, it could improve by offering a more authoritative source related to Buddhism rather than just a general Sutra Collection. Additionally, the assistant could engage more critically with the user's interest in Thich Nhat Hanh by discussing how the quoted text relates to his teachings.

- **[97] multi** (research) "What Buddhist texts discuss mindfulness, and can y" — overall=3.98
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively identifies key Buddhist texts on mindfulness and provides relevant passages, but it could improve by integrating quotes more seamlessly into the narrative. Additionally, it could engage more critically with the user's question by discussing the broader implications of mindfulness in Buddhism rather than just listing texts.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 3 | 21% |
| Inline Quote Integration | 3 | 21% |
| Tool Usage | 2 | 14% |
| Citation Accuracy | 2 | 14% |
| Logical Coherence | 2 | 14% |
| Citation Presence | 2 | 14% |
| Critical Engagement | 1 | 7% |
| Instruction Following | 1 | 7% |
| No General Knowledge / No Secular Drift | 1 | 7% |

## Common Diagnosis Themes

`response` (5x), `could` (4x), `lacks` (3x), `quotes` (3x), `which` (3x), `improve,` (3x), `should` (3x), `specific` (3x), `documents` (3x), `provides` (3x)
