# Jafar Quality Report — remaining-failures

> Generated: 2026-05-18T03:35:09.135Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 7 |
| Passed | **5 (71%)** |
| Failed | 2 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.29 | 1.5 | 4 | ✓ |
| Citation Presence | 3.29 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.71 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.57 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.71 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.71 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.43 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.29 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.71 | 1 | 3 | ✓ |
| Quote Economy | 3.57 | 1 | 3 | ✓ |
| Instruction Following | 4.57 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.29 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.29 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.56 | 2 |
| lookup | 3.29 | 1 |
| research | 4.01 | 4 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.29 |
| browsing | 3.56 |
| edge | 3.99 |
| multi | 4.07 |

## Failure Diagnoses (worst first)

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.29
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks direct quotes from Rumi's works, which would enhance citation presence and accuracy. To improve, the assistant should include specific excerpts or lines from the mentioned works to provide a richer context and support its claims about Rumi's insights and expressions.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.95
  Failed: instructionFollowing
  Diagnosis: The response provides a solid exploration of a central theme in Buddhism, but it lacks a clear connection to the user's vague query. It would benefit from a more direct engagement with the user's question, perhaps by asking for clarification or providing a broader overview of relevant topics in Buddhism before narrowing down to suffering. This would enhance critical engagement and instruction following.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 14% |
| Logical Coherence | 1 | 14% |
| Instruction Following | 1 | 14% |

## Common Diagnosis Themes

`would` (3x)
