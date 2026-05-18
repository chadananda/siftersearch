# Jafar Quality Report — target-v2.72.20

> Generated: 2026-05-15T19:28:38.239Z
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
| Tool Usage | 3.67 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.33 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.33 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.67 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.67 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.67 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.67 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 3.67 | 1 | 3 | ✓ |
| Instruction Following | 4.67 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.67 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.02 | 1 |
| reading | 4.15 | 1 |
| research | 4.05 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.02 |
| multi | 4.05 |
| reading | 4.15 |

## Failure Diagnoses (worst first)

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=3.02
  Failed: toolUsage, citationAccuracy, topicCoverage, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct citations from the library, which is crucial for a lookup query. While it provides alternative resources, it should have included specific quotes or references from the library to support its claims about the Sutra Collection. To improve, the assistant should have searched for relevant texts and included direct quotes or links to specific passages.

- **[97] multi** (research) "What Buddhist texts discuss mindfulness, and can y" — overall=4.05
  Failed: citationAccuracy
  Diagnosis: The response effectively identifies key Buddhist texts on mindfulness and provides relevant quotes, but the citation accuracy suffers due to the incorrect attribution of the quotes to the wrong texts. To improve, ensure that quotes are accurately attributed to their respective sources within the Buddhist canon.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 2 | 67% |
| Tool Usage | 1 | 33% |
| Topic Coverage | 1 | 33% |
| Logical Coherence | 1 | 33% |
| Inline Quote Integration | 1 | 33% |

## Common Diagnosis Themes

`quotes` (4x)
