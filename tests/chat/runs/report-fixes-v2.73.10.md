# Jafar Quality Report — fixes-v2.73.10

> Generated: 2026-05-15T22:24:01.446Z
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
| Citation Presence | 3.67 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.33 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.67 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.00 | 1.5 | 4 | ✓ |
| Logical Coherence | 3.67 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.67 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.67 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.67 | 1 | 3 | ✓ |
| Quote Economy | 3.33 | 1 | 3 | ✓ |
| Instruction Following | 4.67 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.33 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| research | 3.81 | 3 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| factual | 3.93 |
| multi | 3.27 |
| philosophical | 4.22 |

## Failure Diagnoses (worst first)

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=3.27
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration
  Diagnosis: The response lacks specific Bahá'í passages about the covenant, which is a significant gap given the user's request. To improve, the assistant should ensure that it retrieves and includes relevant quotes from both traditions, particularly from Bahá'í texts, to provide a more comprehensive answer.

- **[5] factual** (research) "What is the Hindu concept of dharma?" — overall=3.93
  Failed: citationAccuracy
  Diagnosis: The response provides a good overview of dharma but relies on quotes that are not directly relevant to the concept of dharma itself, which affects citation accuracy. To improve, the assistant should ensure that quotes are directly tied to the definition and implications of dharma, ideally from primary texts that explicitly discuss the concept.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 2 | 67% |
| Tool Usage | 1 | 33% |
| Citation Presence | 1 | 33% |
| Topic Coverage | 1 | 33% |
| Logical Coherence | 1 | 33% |
| Critical Engagement | 1 | 33% |
| Inline Quote Integration | 1 | 33% |

## Common Diagnosis Themes

`quotes` (3x)
