# Jafar Quality Report — spot-v2823

> Generated: 2026-05-18T08:12:58.829Z
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
| Tool Usage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 4.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.50 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.50 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.00 | 1 | 3 | ✓ |
| Quote Economy | 3.50 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.67 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.67 |

## Failure Diagnoses (worst first)

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.34
  Failed: toolUsage, citationAccuracy, logicalCoherence
  Diagnosis: The response lacks depth in citations, as it does not provide direct quotes from the documents, relying instead on general claims about the Universal House of Justice. To improve, the assistant should include specific quotes from the documents to substantiate its claims and enhance the overall authority of the response.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 50% |
| Citation Accuracy | 1 | 50% |
| Logical Coherence | 1 | 50% |
