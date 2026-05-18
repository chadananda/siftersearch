# Jafar Quality Report — author-lookups-v2

> Generated: 2026-05-15T12:31:27.315Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 10 |
| Passed | **3 (30%)** |
| Failed | 7 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.40 | 1.5 | 4 | ✓ |
| Citation Presence | 3.20 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.40 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.50 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.20 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.70 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.10 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.90 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.80 | 1 | 3 | ✓ |
| Quote Economy | 3.20 | 1 | 3 | ✓ |
| Instruction Following | 4.50 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.30 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.50 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.64 | 10 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.64 |

## Failure Diagnoses (worst first)

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=2.68
  Failed: citationPresence, citationAccuracy, sourceAuthority, topicCoverage, inlineQuoteIntegration, quoteEconomy
  Diagnosis: The response fails primarily due to a lack of citations and engagement with the user's request. While it correctly identifies that there are no works by Thich Nhat Hanh in the library, it does not provide any supporting evidence or alternative suggestions from the library, which would enhance the response's value.

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.17
  Failed: citationAccuracy, topicCoverage, logicalCoherence
  Diagnosis: The response lacks sufficient citations to support the claims about Moojan Momen's works, particularly the titles mentioned. Additionally, the assistant fails to critically engage with the user's query by not providing context or significance of the works listed, which could enhance the response's depth and relevance.

- **[34] author** (lookup) "Do you have any books by Adib Taherzadeh?" — overall=3.22
  Failed: toolUsage, topicCoverage, logicalCoherence
  Diagnosis: The response lacks sufficient citations from the library, as it only mentions titles without quoting or providing more context from the works. To improve, the assistant should include direct quotes or summaries from the texts to enhance the depth of the response and support the claims made about the content of the works.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.44
  Failed: topicCoverage, logicalCoherence
  Diagnosis: The response provides some relevant information but lacks depth regarding the Universal House of Justice specifically. It could be improved by including direct quotes from the texts of the Universal House of Justice to enhance citation presence and authority. Additionally, the response could focus more on the user's specific request rather than providing unrelated information about other traditions.

- **[35] author** (lookup) "Who wrote the most books in the library?" — overall=3.46
  Failed: toolUsage, logicalCoherence, instructionFollowing
  Diagnosis: The response fails to directly answer the user's query about the author who wrote the most books in the library, instead providing a general overview of various authors and texts. To improve, the assistant should focus on identifying the specific author with the most works and provide relevant citations to support that claim.

- **[27] author** (lookup) "What works by 'Abdu'l-Bahá are in the library?" — overall=3.76
  Failed: citationAccuracy, topicCoverage
  Diagnosis: The response provides a good overview of works by 'Abdu'l-Bahá but includes a misattributed title, as *Bahá’u’lláh and the New Era* is not authored by 'Abdu'l-Bahá. To improve, it should focus solely on works directly authored by 'Abdu'l-Bahá and ensure accurate citations.

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=4.1
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The primary issue with this response is that it does not fully comply with the user's request to show everything by Bahá'u'lláh, instead providing selected insights. To improve, the assistant should have listed all available documents or titles authored by Bahá'u'lláh, as the user specifically asked for a comprehensive lookup.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 6 | 60% |
| Logical Coherence | 4 | 40% |
| Citation Accuracy | 3 | 30% |
| Instruction Following | 2 | 20% |
| Tool Usage | 2 | 20% |
| Citation Presence | 1 | 10% |
| Source Authority Hierarchy | 1 | 10% |
| Inline Quote Integration | 1 | 10% |
| Quote Economy | 1 | 10% |

## Common Diagnosis Themes

`response` (9x), `user's` (5x), `works` (5x), `providing` (5x), `citations` (4x), `library,` (4x), `enhance` (4x), `about` (4x), `assistant` (4x), `improve,` (4x)
