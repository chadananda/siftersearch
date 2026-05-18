# Jafar Quality Report — author-retest

> Generated: 2026-05-18T03:50:29.033Z
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
| Citation Presence | 2.50 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.25 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 4.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.25 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.25 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 3.25 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.75 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.25 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.51 | 4 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.51 |

## Failure Diagnoses (worst first)

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.29
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks direct quotes from Rumi's works, which would enhance citation presence and accuracy. To improve, the assistant should include specific excerpts or key themes from the texts to provide a richer context and demonstrate engagement with Rumi's poetry.

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=3.32
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the documents by Bahá'u'lláh, which is essential for a lookup request. To improve, the assistant should include specific excerpts or key phrases from the documents to support its claims about their themes and significance.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.34
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the documents, which diminishes its authority and support for claims made. To improve, the assistant should include specific excerpts or quotes from the Universal House of Justice's documents to substantiate its claims and enhance the response's credibility.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 3 | 75% |
| Logical Coherence | 3 | 75% |
| Inline Quote Integration | 2 | 50% |

## Common Diagnosis Themes

`quotes` (4x), `response` (3x), `lacks` (3x), `direct` (3x), `which` (3x), `improve,` (3x), `assistant` (3x), `should` (3x), `include` (3x), `specific` (3x)
