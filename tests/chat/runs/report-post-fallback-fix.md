# Jafar Quality Report — post-fallback-fix

> Generated: 2026-05-18T03:24:31.820Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 110 |
| Passed | **100 (91%)** |
| Failed | 10 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.36 | 1.5 | 4 | ✓ |
| Citation Presence | 4.15 | 2 | 4 | ✓ |
| Citation Accuracy | 4.16 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.13 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.31 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.11 | 1 | 4 | ✓ |
| Critical Engagement | 3.26 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.88 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.72 | 1 | 3 | ✓ |
| Quote Economy | 4.07 | 1 | 3 | ✓ |
| Instruction Following | 4.97 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.50 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.66 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.83 | 10 |
| framing | 4.27 | 10 |
| lookup | 4.08 | 10 |
| reading | 4.64 | 5 |
| research | 4.25 | 73 |
| social | 4.63 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.08 |
| browsing | 3.83 |
| comparative | 4.28 |
| edge | 4.27 |
| factual | 4.16 |
| framing | 4.27 |
| multi | 4.21 |
| philosophical | 4.31 |
| reading | 4.64 |
| topical | 4.35 |

## Failure Diagnoses (worst first)

- **[66] browsing** (browsing) "What's the largest collection?" — overall=2.71
  Failed: citationPresence, citationAccuracy, quoteEconomy
  Diagnosis: The response lacks citations from the library, which is critical for supporting the claims made about the Bahá'í collection. Additionally, the assistant does not provide specific quotes or references to the documents mentioned, which diminishes the authority and credibility of the information presented. To improve, the assistant should include direct quotes or references from the library to substantiate its claims.

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=3.12
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from Bahá'u'lláh's works, which diminishes its authority and support for the claims made. To improve, the assistant should include specific excerpts from the documents listed to enhance citation presence and accuracy.

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.37
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks specific quotes from Moojan Momen's works, which would enhance citation presence and accuracy. Additionally, the assistant could improve critical engagement by providing more context or insights about the significance of these works rather than just listing them.

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.44
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks direct quotes from Rumi's works, which would enhance citation presence and accuracy. To improve, the assistant should include specific excerpts or insights from the texts to substantiate its claims about Rumi's mystical insights.

- **[67] browsing** (browsing) "Do you have any Jain texts?" — overall=3.51
  Failed: topicCoverage
  Diagnosis: The response includes relevant Jain texts but diverges into unrelated Bahá'í and Christian quotes, which do not address the user's specific query. To improve, the assistant should focus solely on Jain texts and provide more context or details about them without introducing unrelated content.

- **[84] edge** (research) "七つの谷" — overall=3.83
  Failed: citationPresence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the library, which weakens its citation presence and inline quote integration. To improve, the assistant should include specific quotes from the text to support its claims about the stages of the spiritual journey in the 'Seven Valleys.' This would enhance the overall authority and engagement of the response.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.88
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response lacks clarity and specificity regarding the user's vague query, which could lead to confusion. To improve, the assistant should ask clarifying questions to better understand the user's intent before providing information, ensuring a more targeted and relevant response.

- **[77] edge** (research) "Udo Schafer" — overall=3.93
  Failed: inlineQuoteIntegration
  Diagnosis: The response provides a good overview of Udo Schaefer's contributions and includes relevant quotes from various religious texts. However, it lacks a deeper critical engagement with the user's query about Schaefer, as it shifts focus to general themes in multiple religions without fully exploring his specific work. To improve, the assistant should concentrate more on Schaefer's scholarship and its implications within the Bahá'í context.

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=3.93
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively covers the concept of covenant in both the Bahá'í Faith and Judaism, but it could improve by integrating quotes more seamlessly into the narrative. Additionally, while the assistant engages with the topic, it could better address the nuances of the covenant in Judaism beyond the new covenant mentioned, which would enhance critical engagement and topic coverage.

- **[3] factual** (research) "What is the Buddhist concept of nirvana?" — overall=3.98
  Failed: inlineQuoteIntegration
  Diagnosis: The response provides a solid overview of the Buddhist concept of nirvana, but it could improve in critical engagement by addressing common misconceptions about nirvana, such as the idea that it is merely annihilation. Additionally, the integration of quotes could be smoother to enhance the flow of the argument.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Inline Quote Integration | 5 | 5% |
| Citation Accuracy | 4 | 4% |
| Logical Coherence | 3 | 3% |
| Citation Presence | 2 | 2% |
| Topic Coverage | 2 | 2% |
| Quote Economy | 1 | 1% |
| Instruction Following | 1 | 1% |

## Common Diagnosis Themes

`response` (10x), `assistant` (10x), `quotes` (10x), `which` (9x), `lacks` (7x), `about` (7x), `specific` (7x), `improve,` (7x), `should` (7x), `enhance` (6x)
