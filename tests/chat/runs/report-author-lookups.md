# Jafar Quality Report — author-lookups

> Generated: 2026-05-15T12:23:15.383Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 10 |
| Passed | **1 (10%)** |
| Failed | 9 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.10 | 1.5 | 4 | ✓ |
| Citation Presence | 2.70 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.90 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.90 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.20 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 1.70 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.10 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.50 | 1 | 3 | ✓ |
| Quote Economy | 2.70 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 4.20 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.20 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.30 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.26 | 10 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.26 |

## Failure Diagnoses (worst first)

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=2.63
  Failed: citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy
  Diagnosis: The response lacks any direct quotes or citations from the library, which is critical for a lookup request. To improve, the assistant should include specific titles or excerpts from Rumi's works to substantiate its claims and enhance the authority of the response.

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=2.66
  Failed: citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy
  Diagnosis: The response fails to provide any citations or references to the library's content, which is critical for a lookup query. Additionally, it does not engage with the user's request for Thich Nhat Hanh's works beyond stating their absence, missing an opportunity to suggest relevant alternatives or related texts. To improve, the assistant should include any relevant Buddhist texts available in the library and provide citations for those.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=2.98
  Failed: toolUsage, citationAccuracy, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks focus on the user's specific request about the Universal House of Justice, instead introducing unrelated texts from other religions. To improve, the assistant should concentrate on providing relevant information about the Universal House of Justice, including specific documents or guidance it has issued, and integrate quotes more effectively.

- **[35] author** (lookup) "Who wrote the most books in the library?" — overall=2.98
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to directly address the user's query about which author wrote the most books in the library, instead providing a general overview of various authors and their works. To improve, the assistant should focus on answering the specific question and clarify the limitations of the library's data regarding author counts.

- **[34] author** (lookup) "Do you have any books by Adib Taherzadeh?" — overall=3.1
  Failed: citationAccuracy, topicCoverage, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks proper citations and integration of quotes from the library, relying instead on general knowledge about the author. To improve, it should include specific titles with accurate citations and integrate them into the response more effectively.

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.17
  Failed: citationAccuracy, topicCoverage, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the library, which is crucial for citation presence and accuracy. To improve, the assistant should include specific titles with proper citations from the library to enhance authority and support for the claims made.

- **[28] author** (lookup) "Show me books by Shoghi Effendi" — overall=3.34
  Failed: toolUsage, topicCoverage, logicalCoherence
  Diagnosis: The response lacks sufficient inline quotes from the library, relying instead on general descriptions of Shoghi Effendi's works. To improve, it should include direct quotes from the texts to substantiate claims and enhance authority. Additionally, it could better engage with the user's request by providing a more comprehensive list of his works.

- **[27] author** (lookup) "What works by 'Abdu'l-Bahá are in the library?" — overall=3.61
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks a clear focus on the specific works of 'Abdu'l-Bahá, as it includes quotes from secondary sources rather than directly from his texts. To improve, the assistant should provide a list of works by 'Abdu'l-Bahá with direct citations from those works, ensuring that the quotes are accurately attributed to him rather than to secondary interpretations.

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=3.73
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response does not fully address the user's request for 'everything by Bahá'u'lláh,' as it only provides a few selected quotes rather than a comprehensive list of his writings. To improve, the assistant should include a more extensive overview or list of Bahá'u'lláh's works, ensuring it aligns with the user's request.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Logical Coherence | 8 | 80% |
| Topic Coverage | 8 | 80% |
| Citation Accuracy | 6 | 60% |
| Inline Quote Integration | 4 | 40% |
| Tool Usage | 3 | 30% |
| Instruction Following | 3 | 30% |
| Citation Presence | 2 | 20% |
| Source Authority Hierarchy | 2 | 20% |
| Quote Economy | 2 | 20% |
| No General Knowledge / No Secular Drift | 1 | 10% |

## Common Diagnosis Themes

`response` (10x), `quotes` (9x), `improve,` (9x), `should` (9x), `citations` (7x), `assistant` (7x), `specific` (7x), `lacks` (6x), `include` (6x), `user's` (6x)
