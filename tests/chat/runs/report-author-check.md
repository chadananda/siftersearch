# Jafar Quality Report — author-check

> Generated: 2026-05-18T03:40:54.578Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 5 |
| Passed | **4 (80%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.00 | 1.5 | 4 | ✓ |
| Citation Presence | 3.20 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.60 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 4.20 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.60 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.80 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.80 | 1 | 3 | ✓ |
| Quote Economy | 3.80 | 1 | 3 | ✓ |
| Instruction Following | 4.80 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.40 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.83 | 5 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.83 |

## Failure Diagnoses (worst first)

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.22
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the documents, which diminishes its authority and support for claims made. To improve, the assistant should include specific excerpts from the documents to substantiate the summary of their content.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 20% |
| Logical Coherence | 1 | 20% |
| Inline Quote Integration | 1 | 20% |
