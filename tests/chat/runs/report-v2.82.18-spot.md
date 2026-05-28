# Jafar Quality Report — v2.82.18-spot

> Generated: 2026-05-18T10:23:47.732Z
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
| Tool Usage | 5.00 | 1.5 | 4 | ✓ |
| Citation Presence | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 5.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 2.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 3.00 | 1 | 3 | ✓ |
| Instruction Following | 2.00 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 1.00 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 4.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 2.88 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 2.88 |

## Failure Diagnoses (worst first)

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=2.88
  Failed: citationAccuracy, topicCoverage, logicalCoherence, instructionFollowing, noHallucination
  Diagnosis: The response invents or misrepresents the title of at least one work (the hyperlinked title appears fabricated or severely garbled), and fails to follow the user's straightforward instruction to list what books the library actually has. A lookup query expects a clean, accurate list of real titles—not promotional summaries or invented URLs. The assistant should have either listed actual titles from the search results or acknowledged if the library's tools don't support granular title listing.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 100% |
| Topic Coverage | 1 | 100% |
| Logical Coherence | 1 | 100% |
| Instruction Following | 1 | 100% |
| No Hallucination | 1 | 100% |

## Common Diagnosis Themes

`title` (3x)
