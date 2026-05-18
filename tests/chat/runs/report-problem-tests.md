# Jafar Quality Report — problem-tests

> Generated: 2026-05-18T03:12:56.597Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 3 |
| Passed | **1 (33%)** |
| Failed | 2 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.33 | 1.5 | 4 | ✓ |
| Citation Presence | 4.00 | 2 | 4 | ✓ |
| Citation Accuracy | 4.00 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.33 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 4.00 | 1 | 4 | ✓ |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 4.00 | 2 | 4 | ✓ |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 4.00 | 1 | 3 | ✓ |
| Instruction Following | 4.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 4.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.33 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| reading | 4.24 | 1 |
| research | 3.92 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| edge | 3.92 |
| reading | 4.24 |

## Failure Diagnoses (worst first)

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.88
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response lacks clarity and specificity due to the vague nature of the user's question. While it provides relevant Buddhist teachings on suffering, it could improve by directly addressing the ambiguity of the user's query and encouraging them to clarify their question further. Additionally, a more comprehensive exploration of the topic could enhance the response.

- **[81] edge** (research) "Tell me everything about Buddhism" — overall=3.95
  Failed: topicCoverage
  Diagnosis: The response provides a good overview of Buddhism but lacks comprehensive coverage of key aspects such as the Four Noble Truths, the Eightfold Path, and the historical context of Buddhism. To improve, it should include these fundamental teachings and concepts to give a fuller picture of Buddhism.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 2 | 67% |
| Instruction Following | 1 | 33% |
