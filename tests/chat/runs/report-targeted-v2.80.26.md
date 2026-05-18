# Jafar Quality Report — targeted-v2.80.26

> Generated: 2026-05-18T03:55:44.664Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 5 |
| Passed | **3 (60%)** |
| Failed | 2 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.20 | 1.5 | 4 | ✓ |
| Citation Presence | 3.40 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.80 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 4.20 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.80 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.80 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.60 | 1 | 3 | ✓ |
| Quote Economy | 3.80 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.40 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.20 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| framing | 4.12 | 1 |
| lookup | 3.24 | 2 |
| reading | 4.85 | 1 |
| research | 4.02 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.24 |
| edge | 4.02 |
| framing | 4.12 |
| reading | 4.85 |

## Failure Diagnoses (worst first)

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=3.24
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the documents by Bahá'u'lláh, which diminishes its authority and support for the claims made. To improve, the assistant should include specific excerpts or key themes from the works mentioned to provide a richer context and deeper engagement with the user's request.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.24
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the documents, which diminishes its authority and support for claims made. To improve, the assistant should include specific excerpts or insights from the documents to substantiate its statements about the Universal House of Justice's guidance.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 2 | 40% |
| Logical Coherence | 2 | 40% |
| Inline Quote Integration | 2 | 40% |
