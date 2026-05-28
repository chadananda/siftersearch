# Jafar Quality Report — v2.82.16-spot

> Generated: 2026-05-18T10:21:49.700Z
> Judge model: gpt-4o-mini

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
| Citation Presence | 1.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 1.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 5.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 2.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 5.00 | 1 | 4 | ✓ |
| Critical Engagement | 5.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 5.00 | 2 | 4 | ✓ |
| Brevity | 5.00 | 1 | 3 | ✓ |
| Quote Economy | 5.00 | 1 | 3 | ✓ |
| Instruction Following | 2.00 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 4.00 | 0.5 | 3 | ✓ |
| No Hallucination | 1.00 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 5.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.15 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.15 |

## Failure Diagnoses (worst first)

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.15
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, instructionFollowing, noHallucination
  Diagnosis: The assistant used library_count (a metadata tool) instead of search/browse to answer a lookup question about a specific author, then fabricated two book titles as examples without verifying them exist in the library. For an author-lookup query, the correct tool is 'browse' or 'search' with author filter to retrieve and display actual titles. The two titles provided appear to be hallucinated — they do not match Momen's actual published works and were not retrieved from any search result.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 100% |
| Citation Presence | 1 | 100% |
| Citation Accuracy | 1 | 100% |
| Topic Coverage | 1 | 100% |
| Instruction Following | 1 | 100% |
| No Hallucination | 1 | 100% |
