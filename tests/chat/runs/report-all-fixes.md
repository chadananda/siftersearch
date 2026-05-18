# Jafar Quality Report — all-fixes

> Generated: 2026-05-18T02:37:26.394Z
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
| Brevity | 3.43 | 1 | 3 | ✓ |
| Quote Economy | 4.00 | 1 | 3 | ✓ |
| Instruction Following | 4.57 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.14 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.43 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| framing | 4.12 | 1 |
| reading | 3.88 | 1 |
| research | 4.04 | 5 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| edge | 4.01 |
| framing | 4.12 |
| multi | 4.15 |
| reading | 3.88 |

## Failure Diagnoses (worst first)

- **[74] reading** (reading) "Read the opening verses of the Bhagavad Gita" — overall=3.88
  Failed: topicCoverage
  Diagnosis: The response provides a good summary of the opening verses but lacks a direct reading of the text as requested. To improve, it should include the actual verses from the Bhagavad Gita instead of summarizing them, ensuring it adheres strictly to the user's request for a reading.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.88
  Failed: topicCoverage
  Diagnosis: The response provides a solid overview of the Buddhist perspective on suffering, but it lacks clarity due to the vague nature of the user's question. To improve, the assistant should have asked for clarification on what specific aspect the user was interested in before diving into the explanation. Additionally, while the citations are relevant, they could be more directly tied to the claims made for better integration.

- **[81] edge** (research) "Tell me everything about Buddhism" — overall=4
  Failed: topicCoverage
  Diagnosis: The response provides a good overview of Buddhism with relevant quotes, but it lacks comprehensive coverage of key aspects such as the Four Noble Truths and the Eightfold Path. To improve, it should include these fundamental teachings and their significance in Buddhism for a more complete answer.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 3 | 43% |

## Common Diagnosis Themes

`response` (3x), `provides` (3x), `lacks` (3x), `improve,` (3x), `should` (3x)
