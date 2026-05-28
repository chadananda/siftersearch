# Jafar Quality Report — check-33

> Generated: 2026-05-18T12:02:11.273Z
> Judge model: anthropic

## Summary

| Metric | Value |
|--------|-------|
| Total | 1 |
| Passed | **0 (0%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 2.00 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 1.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 2.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 2.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 2.00 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 2.00 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 1.00 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 2.00 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 2.07 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 2.07 |

## Failure Diagnoses (worst first)

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=2.07
  Failed: toolUsage, citationAccuracy, topicCoverage, logicalCoherence, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: Critical hallucination: the quoted phrase 'a spirit of brotherhood, an impulse toward unity' does not appear in the search results and the URL citations are fabricated (all pointing to the same Mashriqu'l-Adhkár document when the second should be from 'Regarding Economic Life'). For a lookup query, the response should report catalog facts accurately without inventing quotes. The tool usage is also weak — library_count was used correctly, but search appears to have been misused to generate topical content rather than verify actual document titles and content.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 100% |
| Citation Accuracy | 1 | 100% |
| Topic Coverage | 1 | 100% |
| Logical Coherence | 1 | 100% |
| Instruction Following | 1 | 100% |
| No Hallucination | 1 | 100% |
| No General Knowledge / No Secular Drift | 1 | 100% |
