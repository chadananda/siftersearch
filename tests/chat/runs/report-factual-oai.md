# Jafar Quality Report — factual-oai

> Generated: 2026-05-15T12:20:05.696Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 15 |
| Passed | **13 (87%)** |
| Failed | 2 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.13 | 1.5 | 4 | ✓ |
| Citation Presence | 4.27 | 2 | 4 | ✓ |
| Citation Accuracy | 4.13 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.13 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.13 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.20 | 1 | 4 | ✓ |
| Critical Engagement | 3.20 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 4.00 | 2 | 4 | ✓ |
| Brevity | 3.93 | 1 | 3 | ✓ |
| Quote Economy | 4.13 | 1 | 3 | ✓ |
| Instruction Following | 4.93 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.27 | 0.5 | 3 | ✓ |
| No Hallucination | 4.93 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 4.80 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| research | 4.22 | 15 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| factual | 4.22 |

## Failure Diagnoses (worst first)

- **[5] factual** (research) "What is the Hindu concept of dharma?" — overall=3.32
  Failed: toolUsage, citationPresence, citationAccuracy, inlineQuoteIntegration, noHallucination
  Diagnosis: The response lacks a direct quote from the *Bhagavad Gita* and instead cites a passage from the *Atharva Veda*, which is less relevant to the concept of dharma. To improve, the assistant should have searched specifically for passages from the *Bhagavad Gita* that define dharma and integrated those quotes more effectively into the explanation.

- **[15] factual** (research) "What is the concept of grace in Christianity?" — overall=4.07
  Failed: topicCoverage
  Diagnosis: The response provides a solid overview of grace in Christianity but lacks depth in critical engagement with the concept. It could be improved by addressing potential misconceptions or nuances in the understanding of grace, as well as including more diverse perspectives from different Christian traditions.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 7% |
| Citation Presence | 1 | 7% |
| Citation Accuracy | 1 | 7% |
| Inline Quote Integration | 1 | 7% |
| No Hallucination | 1 | 7% |
| Topic Coverage | 1 | 7% |
