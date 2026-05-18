# Jafar Quality Report — torah-fix-v2.73

> Generated: 2026-05-15T20:01:20.887Z
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
| Tool Usage | 4.00 | 1.5 | 4 | ✓ |
| Citation Presence | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 4.00 | 1 | 4 | ✓ |
| Critical Engagement | 2.50 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.50 | 1 | 3 | ✓ |
| Quote Economy | 3.50 | 1 | 3 | ✓ |
| Instruction Following | 4.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.63 | 1 |
| research | 3.51 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.63 |
| factual | 3.51 |

## Failure Diagnoses (worst first)

- **[9] factual** (research) "What does the Torah say about justice?" — overall=3.51
  Failed: citationPresence, citationAccuracy, topicCoverage, inlineQuoteIntegration
  Diagnosis: The response lacks sufficient direct quotes from the Torah to substantiate its claims about justice, which weakens citation presence and accuracy. To improve, the assistant should include more specific passages from the Torah that directly address justice, ensuring they are accurately cited and integrated into the argument.

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=3.63
  Failed: topicCoverage
  Diagnosis: The assistant correctly searched for Thich Nhat Hanh's works but failed to find any, which is acceptable. However, it then shifted focus to unrelated Buddhist texts without addressing the user's specific request for Thich Nhat Hanh. To improve, the assistant should have acknowledged the absence of his works and offered a brief explanation or context about his significance in Buddhism instead of diverting to other texts.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 2 | 100% |
| Citation Presence | 1 | 50% |
| Citation Accuracy | 1 | 50% |
| Inline Quote Integration | 1 | 50% |

## Common Diagnosis Themes

`assistant` (3x)
