# Jafar Quality Report — post-crafter-fix

> Generated: 2026-05-18T02:32:25.171Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 7 |
| Passed | **4 (57%)** |
| Failed | 3 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.00 | 1.5 | 4 | ✓ |
| Citation Presence | 4.00 | 2 | 4 | ✓ |
| Citation Accuracy | 4.00 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.57 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 4.00 | 1 | 4 | ✓ |
| Critical Engagement | 3.14 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 4.00 | 2 | 4 | ✓ |
| Brevity | 3.86 | 1 | 3 | ✓ |
| Quote Economy | 4.00 | 1 | 3 | ✓ |
| Instruction Following | 4.57 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.29 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.57 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| framing | 4.22 | 1 |
| reading | 4.07 | 1 |
| research | 4.03 | 5 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| edge | 4.00 |
| framing | 4.22 |
| multi | 4.15 |
| reading | 4.07 |

## Failure Diagnoses (worst first)

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.88
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response provides a solid overview of the Buddhist perspective on craving and suffering, but it lacks a clear connection to the user's vague query. To improve, the assistant should clarify the user's intent and possibly ask for more specifics before diving into the explanation.

- **[81] edge** (research) "Tell me everything about Buddhism" — overall=3.93
  Failed: topicCoverage
  Diagnosis: The response provides a solid overview of Buddhism with relevant quotes, but it lacks comprehensive coverage of key aspects such as the Four Noble Truths and the Eightfold Path. To improve, it should include these foundational teachings and engage more critically with the user's request for 'everything about Buddhism.'

- **[74] reading** (reading) "Read the opening verses of the Bhagavad Gita" — overall=4.07
  Failed: topicCoverage
  Diagnosis: The response effectively uses quotes and integrates them well, but it lacks a direct reading of the verses as requested. To improve, the assistant should provide the actual text of the opening verses instead of summarizing them, ensuring it adheres strictly to the user's request.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 3 | 43% |
| Instruction Following | 1 | 14% |

## Common Diagnosis Themes

`user's` (4x), `response` (3x), `lacks` (3x), `improve,` (3x), `should` (3x)
