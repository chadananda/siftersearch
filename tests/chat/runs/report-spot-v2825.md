# Jafar Quality Report — spot-v2825

> Generated: 2026-05-18T09:22:15.222Z
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
| Tool Usage | 4.40 | 1.5 | 4 | ✓ |
| Citation Presence | 4.00 | 2 | 4 | ✓ |
| Citation Accuracy | 4.00 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.20 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.20 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.00 | 1 | 4 | ✓ |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.40 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.60 | 1 | 3 | ✓ |
| Quote Economy | 4.00 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.40 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.80 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.96 | 4 |
| reading | 4.76 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.96 |
| reading | 4.76 |

## Failure Diagnoses (worst first)

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.39
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response provides a good overview of Moojan Momen's works but lacks specific quotes from the library to support claims about his contributions. To improve, it should include direct citations from the library that substantiate the claims made about his work and its themes.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 20% |
| Logical Coherence | 1 | 20% |
