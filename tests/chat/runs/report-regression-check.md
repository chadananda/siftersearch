# Jafar Quality Report — regression-check

> Generated: 2026-05-18T03:20:39.701Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 12 |
| Passed | **11 (92%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.58 | 1.5 | 4 | ✓ |
| Citation Presence | 4.25 | 2 | 4 | ✓ |
| Citation Accuracy | 4.08 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.08 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.25 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.17 | 1 | 4 | ✓ |
| Critical Engagement | 3.17 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.75 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.83 | 1 | 3 | ✓ |
| Quote Economy | 4.17 | 1 | 3 | ✓ |
| Instruction Following | 4.92 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.50 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.75 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.27 | 1 |
| lookup | 4.05 | 1 |
| reading | 4.24 | 1 |
| research | 4.36 | 9 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.05 |
| browsing | 3.27 |
| comparative | 4.07 |
| edge | 4.05 |
| factual | 4.46 |
| philosophical | 4.71 |
| reading | 4.24 |
| topical | 4.48 |

## Failure Diagnoses (worst first)

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.95
  Failed: topicCoverage
  Diagnosis: The response does a good job of addressing the topic of suffering in Buddhism, but it assumes the user's vague question refers to this specific aspect without confirming. A more effective approach would involve asking for clarification before providing detailed information, ensuring the response is directly relevant to the user's intent.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 1 | 8% |
