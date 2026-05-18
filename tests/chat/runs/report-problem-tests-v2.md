# Jafar Quality Report — problem-tests-v2

> Generated: 2026-05-18T03:16:56.499Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 3 |
| Passed | **2 (67%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.33 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.33 | 1 | 3 | ✓ |
| Quote Economy | 3.00 | 1 | 3 | ✓ |
| Instruction Following | 3.67 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.33 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.67 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| reading | 4.17 | 1 |
| research | 2.93 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| edge | 2.93 |
| reading | 4.17 |

## Failure Diagnoses (worst first)

- **[80] edge** (research) "What about the thing with the stuff?" — overall=1.78
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, brevity, quoteEconomy, instructionFollowing
  Diagnosis: The response fails to address the user's query and does not utilize the library's resources. Instead of asking for clarification, it should have attempted to provide information based on the search results. To improve, the assistant should have made an effort to interpret the vague question and provide relevant information from the library.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 33% |
| Citation Presence | 1 | 33% |
| Citation Accuracy | 1 | 33% |
| Source Authority Hierarchy | 1 | 33% |
| Topic Coverage | 1 | 33% |
| Logical Coherence | 1 | 33% |
| Critical Engagement | 1 | 33% |
| Inline Quote Integration | 1 | 33% |
| Brevity | 1 | 33% |
| Quote Economy | 1 | 33% |
| Instruction Following | 1 | 33% |
