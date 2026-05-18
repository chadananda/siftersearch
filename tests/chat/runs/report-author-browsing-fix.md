# Jafar Quality Report — author-browsing-fix

> Generated: 2026-05-18T03:27:13.078Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 6 |
| Passed | **3 (50%)** |
| Failed | 3 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.50 | 1.5 | 4 | ✓ |
| Citation Presence | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 4.00 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.50 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.50 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.83 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.67 | 1 | 3 | ✓ |
| Quote Economy | 3.83 | 1 | 3 | ✓ |
| Instruction Following | 4.50 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.33 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.33 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.56 | 2 |
| lookup | 3.97 | 3 |
| research | 3.88 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.97 |
| browsing | 3.56 |
| edge | 3.88 |

## Failure Diagnoses (worst first)

- **[67] browsing** (browsing) "Do you have any Jain texts?" — overall=2.83
  Failed: topicCoverage, logicalCoherence, noGeneralKnowledge
  Diagnosis: The response fails to focus on the user's specific inquiry about Jain texts, instead introducing unrelated content from other religions. This distracts from the main question and demonstrates a lack of critical engagement with the user's request. To improve, the assistant should have provided a concise list of Jain texts without extraneous information from other traditions.

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.61
  Failed: logicalCoherence
  Diagnosis: The response lacks direct quotes from Rumi's works, which would enhance citation presence and accuracy. To improve, the assistant should include specific excerpts or lines from the texts to provide a richer context and support its claims about Rumi's themes.

- **[77] edge** (research) "Udo Schafer" — overall=3.88
  Failed: instructionFollowing
  Diagnosis: The response provides a good overview of how different religious traditions address themes of guidance and enlightenment, but it lacks a direct focus on Udo Schaefer himself, which was the user's initial query. To improve, the assistant should include specific information about Schaefer's contributions or works related to the Bahá'í Faith before expanding into broader themes.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Logical Coherence | 2 | 33% |
| Topic Coverage | 1 | 17% |
| No General Knowledge / No Secular Drift | 1 | 17% |
| Instruction Following | 1 | 17% |

## Common Diagnosis Themes

`response` (3x), `user's` (3x), `specific` (3x), `about` (3x), `improve,` (3x), `assistant` (3x), `should` (3x)
