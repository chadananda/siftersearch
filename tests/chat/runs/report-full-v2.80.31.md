# Jafar Quality Report — full-v2.80.31

> Generated: 2026-05-18T04:37:28.777Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 110 |
| Passed | **103 (94%)** |
| Failed | 7 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.34 | 1.5 | 4 | ✓ |
| Citation Presence | 4.21 | 2 | 4 | ✓ |
| Citation Accuracy | 4.21 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.16 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.35 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.15 | 1 | 4 | ✓ |
| Critical Engagement | 3.28 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.90 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.73 | 1 | 3 | ✓ |
| Quote Economy | 4.14 | 1 | 3 | ✓ |
| Instruction Following | 4.95 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.51 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.75 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.93 | 10 |
| framing | 4.30 | 10 |
| lookup | 3.94 | 10 |
| reading | 4.59 | 5 |
| research | 4.30 | 73 |
| social | 4.69 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.94 |
| browsing | 3.93 |
| comparative | 4.23 |
| edge | 4.24 |
| factual | 4.36 |
| framing | 4.30 |
| multi | 4.13 |
| philosophical | 4.48 |
| reading | 4.59 |
| topical | 4.36 |

## Failure Diagnoses (worst first)

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=2.88
  Failed: toolUsage, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to adequately address the user's specific query about Hindu scriptures, instead introducing unrelated content from other religious texts. To improve, the assistant should focus solely on the Hindu texts available in the library and provide more detailed information about them, including notable scriptures and their significance.

- **[98] multi** (research) "I'm a Christian interested in what other religions" — overall=3.15
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy
  Diagnosis: The response lacks specific quotes from the library to support its claims about the return of Christ in different religions, which is critical for a research query. To improve, the assistant should include direct citations from the retrieved texts that clearly articulate the beliefs of Islam and the Bahá'í Faith regarding Christ's return.

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.29
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks direct quotes from Rumi's works, which would enhance citation presence and accuracy. To improve, the assistant should include specific excerpts from the documents to support its claims about Rumi's themes and insights.

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.34
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks direct quotes from Moojan Momen's works, which would enhance citation presence and accuracy. To improve, the assistant should include specific excerpts or key ideas from Momen's writings to substantiate the claims made about his exploration of the Bahá'í Faith.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.73
  Failed: topicCoverage, inlineQuoteIntegration, instructionFollowing
  Diagnosis: The response lacks clarity due to the vague nature of the user's question, which the assistant acknowledges but does not address directly. To improve, the assistant should ask for clarification while providing a more focused answer on a specific aspect of suffering in Buddhism, ensuring that the response is tightly connected to the user's potential inquiry.

- **[49] topical** (research) "Find passages about service to others" — overall=3.98
  Failed: toolUsage
  Diagnosis: The response provides a good overview of service to others across various religions but relies on a mix of sources, some of which are secondary. To improve, it should prioritize primary scriptures over secondary interpretations and ensure all quotes are directly relevant to the claims made. Additionally, the response could be more concise by reducing some of the explanatory text.

- **[97] multi** (research) "What Buddhist texts discuss mindfulness, and can y" — overall=4.07
  Failed: topicCoverage
  Diagnosis: The response effectively uses the tool to provide relevant quotes and integrates them well into the explanation. However, it could improve by addressing additional Buddhist texts that discuss mindfulness to enhance topic coverage. Additionally, a more critical engagement with the implications of mindfulness in the context of Buddhist practice would strengthen the response.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 3 | 3% |
| Logical Coherence | 3 | 3% |
| Topic Coverage | 3 | 3% |
| Tool Usage | 2 | 2% |
| Instruction Following | 2 | 2% |
| Inline Quote Integration | 2 | 2% |
| No General Knowledge / No Secular Drift | 1 | 1% |
| Citation Presence | 1 | 1% |
| Quote Economy | 1 | 1% |

## Common Diagnosis Themes

`response` (9x), `improve,` (6x), `assistant` (6x), `should` (6x), `specific` (5x), `about` (5x), `quotes` (5x), `which` (5x), `lacks` (4x), `claims` (4x)
