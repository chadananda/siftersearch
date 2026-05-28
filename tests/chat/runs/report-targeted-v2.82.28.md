# Jafar Quality Report — targeted-v2.82.28

> Generated: 2026-05-18T11:37:23.835Z
> Judge model: anthropic

## Summary

| Metric | Value |
|--------|-------|
| Total | 6 |
| Passed | **5 (83%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.50 | 1.5 | 4 | ✓ |
| Citation Presence | 5.00 | 2 | 4 | ✓ |
| Citation Accuracy | 5.00 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 5.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.33 | 1.5 | 4 | ✓ |
| Logical Coherence | 5.00 | 1 | 4 | ✓ |
| Critical Engagement | 5.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 5.00 | 2 | 4 | ✓ |
| Brevity | 5.00 | 1 | 3 | ✓ |
| Quote Economy | 5.00 | 1 | 3 | ✓ |
| Instruction Following | 4.83 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 4.17 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 5.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 4.98 | 3 |
| lookup | 4.37 | 1 |
| social | 5.00 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.37 |
| browsing | 4.98 |
| edge | 5.00 |

## Failure Diagnoses (worst first)

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=4.37
  Failed: toolUsage, topicCoverage
  Diagnosis: The tool usage is weak: library_count is wrong for this task. For a lookup query ('do you have works by X?'), the assistant should use search(author='Thich Nhat Hanh') or documents(author='Thich Nhat Hanh') to actually check the collection. library_count just returns aggregate stats. The answer itself may be correct, but it's unsupported — the assistant should have searched before claiming absence. For a lookup, if the search returns zero results, that's fine; reporting zero from a proper search is instruction-following. But skipping the search entirely and relying on what appears to be implicit knowledge is not.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 17% |
| Topic Coverage | 1 | 17% |

## Common Diagnosis Themes

`search` (3x)
