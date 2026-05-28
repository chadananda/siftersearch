# Jafar Quality Report — final-targeted-v2.82.31

> Generated: 2026-05-18T11:41:25.644Z
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
| Topic Coverage | 5.00 | 1.5 | 4 | ✓ |
| Logical Coherence | 5.00 | 1 | 4 | ✓ |
| Critical Engagement | 5.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 5.00 | 2 | 4 | ✓ |
| Brevity | 4.83 | 1 | 3 | ✓ |
| Quote Economy | 5.00 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.83 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 5.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 4.95 | 3 |
| lookup | 4.71 | 1 |
| social | 5.00 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.71 |
| browsing | 4.95 |
| edge | 5.00 |

## Failure Diagnoses (worst first)

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=4.71
  Failed: toolUsage, warmth
  Diagnosis: Wrong tool used. For an author-lookup query, the correct tool is 'search' with author filter (e.g., search(query='Thich Nhat Hanh', mode='documents', author='Thich Nhat Hanh')), not 'library_count' which aggregates totals. A negative result from library_count cannot definitively answer whether the author is in the collection. Score this a 2 for tool usage because the assistant answered with certainty based on an inappropriate tool.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 17% |
| Warmth & Gravitas | 1 | 17% |
