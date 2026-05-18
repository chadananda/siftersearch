# Jafar Quality Report — fix-verify

> Generated: 2026-05-15T12:44:22.527Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 8 |
| Passed | **4 (50%)** |
| Failed | 4 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.38 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.25 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.38 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.50 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.50 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.13 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.50 | 1 | 3 | ✓ |
| Quote Economy | 3.25 | 1 | 3 | ✓ |
| Instruction Following | 4.13 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.13 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.38 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| research | 3.58 | 8 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| edge | 3.86 |
| multi | 3.31 |

## Failure Diagnoses (worst first)

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=2.02
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, quoteEconomy, instructionFollowing
  Diagnosis: The response fails to provide any actual passages or quotes from the library, which is critical for a research query. To improve, the assistant should ensure it retrieves relevant passages and integrates them into the response, addressing the user's request directly with citations from both traditions.

- **[86] edge** (research) "Who was the Bab?" — overall=3.17
  Failed: toolUsage, citationPresence, citationAccuracy, logicalCoherence, criticalEngagement, inlineQuoteIntegration
  Diagnosis: The response relies on external links rather than integrating quotes directly from the library, which affects citation presence and accuracy. To improve, the assistant should provide direct quotes from the library that support the claims made about the Báb, ensuring a more authoritative and cohesive response.

- **[96] multi** (research) "How many documents by 'Abdu'l-Bahá do you have, an" — overall=3.22
  Failed: toolUsage, citationPresence, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response lacks specificity regarding which documents by 'Abdu'l-Bahá discuss governance, failing to provide a direct list or quotes from those works. Additionally, the inclusion of unrelated religious traditions dilutes the focus on the user's query about 'Abdu'l-Bahá's writings. To improve, the assistant should have focused solely on 'Abdu'l-Bahá's documents and provided relevant quotes or titles.

- **[92] multi** (research) "List all Bahá'í books by 'Abdu'l-Bahá and tell me " — overall=3.83
  Failed: citationPresence, inlineQuoteIntegration
  Diagnosis: The response provides a good list of 'Abdu'l-Bahá's works and identifies one that discusses education, but it lacks direct quotes from the library to support the claims made. To improve, the assistant should include specific quotes from *The Secret of Divine Civilization* to substantiate the emphasis on education.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Presence | 4 | 50% |
| Inline Quote Integration | 4 | 50% |
| Tool Usage | 3 | 38% |
| Logical Coherence | 3 | 38% |
| Critical Engagement | 3 | 38% |
| Citation Accuracy | 2 | 25% |
| Topic Coverage | 2 | 25% |
| Instruction Following | 2 | 25% |
| No General Knowledge / No Secular Drift | 1 | 13% |
| Source Authority Hierarchy | 1 | 13% |
| Quote Economy | 1 | 13% |

## Common Diagnosis Themes

`quotes` (7x), `response` (4x), `improve,` (4x), `assistant` (4x), `should` (4x), `provide` (3x), `which` (3x), `direct` (3x), `'abdu'l-bahá's` (3x)
