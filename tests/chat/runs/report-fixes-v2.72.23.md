# Jafar Quality Report — fixes-v2.72.23

> Generated: 2026-05-15T19:35:02.787Z
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
| Citation Presence | 4.00 | 2 | 4 | ✓ |
| Citation Accuracy | 4.00 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 3.50 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 4.00 | 1 | 4 | ✓ |
| Critical Engagement | 2.50 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 4.00 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.50 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.76 | 1 |
| research | 4.15 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.76 |
| multi | 4.15 |

## Failure Diagnoses (worst first)

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=3.76
  Failed: topicCoverage
  Diagnosis: The response effectively follows the user's instruction to look up works by Thich Nhat Hanh, but it fails to critically engage with the user's query by not addressing the absence of his works in the library. Additionally, while the quotes from the Dhammapada and Sutra Collection are relevant, they could be better integrated into the response to enhance coherence and relevance to the user's interest in Thich Nhat Hanh.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 1 | 50% |

## Common Diagnosis Themes

`user's` (3x)
