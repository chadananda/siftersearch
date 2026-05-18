# Jafar Quality Report — spot-v2826-short

> Generated: 2026-05-18T09:32:18.958Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 2 |
| Passed | **0 (0%)** |
| Failed | 2 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 4.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.00 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.50 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.50 | 1 | 3 | ✓ |
| Quote Economy | 2.50 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 4.50 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.37 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.37 |

## Failure Diagnoses (worst first)

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=3.2
  Failed: toolUsage, citationAccuracy, logicalCoherence
  Diagnosis: The response lacks sufficient integration of quotes and relies too heavily on a single document for multiple citations, which diminishes the overall authority and variety of sources. To improve, the assistant should include a broader range of Bahá'u'lláh's works and better integrate quotes into the narrative to enhance coherence and engagement.

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.54
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks sufficient integration of quotes and does not fully support its claims with specific citations from the library. To improve, it should include more direct quotes from Momen's works to substantiate the claims made about his contributions and the context of his writings.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 2 | 100% |
| Logical Coherence | 2 | 100% |
| Tool Usage | 1 | 50% |

## Common Diagnosis Themes

`quotes` (4x)
