# Jafar Quality Report — failures-check-v2.73

> Generated: 2026-05-15T20:08:06.007Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 4 |
| Passed | **1 (25%)** |
| Failed | 3 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.25 | 1.5 | 4 | ✓ |
| Citation Presence | 3.75 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.75 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 4.00 | 1 | 4 | ✓ |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.75 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 3.75 | 1 | 3 | ✓ |
| Instruction Following | 4.25 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 4.75 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 4.25 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.85 | 1 |
| research | 3.87 | 3 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.85 |
| comparative | 3.93 |
| factual | 3.46 |
| multi | 4.22 |

## Failure Diagnoses (worst first)

- **[5] factual** (research) "What is the Hindu concept of dharma?" — overall=3.46
  Failed: citationPresence, citationAccuracy, inlineQuoteIntegration, noHallucination
  Diagnosis: The response lacks accurate citations, as the quotes provided do not seem to come from the correct texts. Additionally, the assistant should have included more authoritative sources on dharma, such as the *Manusmriti* or *Upanishads*, to strengthen the response. Improving citation accuracy and authority would significantly enhance the quality of the answer.

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=3.85
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response provides relevant quotes from Bahá'u'lláh's writings but does not fully address the user's request for 'everything' by Bahá'u'lláh, which implies a more comprehensive listing or overview of his works. To improve, the assistant should include a broader selection of his writings or a list of key texts rather than just thematic summaries.

- **[20] comparative** (research) "What do the Bahá'í Faith and Islam say about fasti" — overall=3.93
  Failed: topicCoverage
  Diagnosis: The response provides a solid overview of fasting in Islam with relevant quotes, but it lacks direct citations from Bahá'í texts, which weakens the comparative aspect of the answer. To improve, the assistant should include specific Bahá'í teachings on fasting to fully address the user's query.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 2 | 50% |
| Citation Presence | 1 | 25% |
| Citation Accuracy | 1 | 25% |
| Inline Quote Integration | 1 | 25% |
| No Hallucination | 1 | 25% |
| Instruction Following | 1 | 25% |

## Common Diagnosis Themes

`response` (3x), `assistant` (3x), `should` (3x)
