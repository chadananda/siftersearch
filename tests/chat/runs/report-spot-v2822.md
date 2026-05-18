# Jafar Quality Report — spot-v2822

> Generated: 2026-05-18T08:02:38.114Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 3 |
| Passed | **2 (67%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.67 | 1.5 | 4 | ✓ |
| Citation Presence | 3.33 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 4.00 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.00 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.00 | 1 | 4 | ✓ |
| Critical Engagement | 2.67 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.67 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 3.67 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.33 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.33 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.50 | 2 |
| reading | 4.76 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.50 |
| reading | 4.76 |

## Failure Diagnoses (worst first)

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.24
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the documents, which diminishes its authority and support for claims made. To improve, the assistant should include specific excerpts or quotes from the documents to substantiate the information provided about the Universal House of Justice's works.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 33% |
| Logical Coherence | 1 | 33% |
| Inline Quote Integration | 1 | 33% |
