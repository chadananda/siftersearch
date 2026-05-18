# Jafar Quality Report — catalog-fix-v2.80.27

> Generated: 2026-05-18T04:00:04.070Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 2 |
| Passed | **1 (50%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.00 | 1.5 | 4 | ✓ |
| Citation Presence | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 4.50 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.50 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.50 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.50 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 3.50 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.50 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.73 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.73 |

## Failure Diagnoses (worst first)

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.24
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks inline quote integration and does not provide specific quotes from the documents, which is critical for a lookup request. To improve, the assistant should include direct quotes from the Universal House of Justice's writings to support its claims and enhance the response's authority and engagement.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 50% |
| Logical Coherence | 1 | 50% |
| Inline Quote Integration | 1 | 50% |
