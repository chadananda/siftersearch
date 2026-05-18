# Jafar Quality Report — count-check

> Generated: 2026-05-15T19:38:14.760Z
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
| Citation Presence | 1.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 1.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 1.00 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 5.00 | 1.5 | 4 | ✓ |
| Logical Coherence | 5.00 | 1 | 4 | ✓ |
| Critical Engagement | 1.00 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 1.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 1.00 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 5.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 2.95 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 2.95 |

## Failure Diagnoses (worst first)

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=2.95
  Failed: citationPresence, citationAccuracy, quoteEconomy
  Diagnosis: The response contains fabricated information about the number of documents in the library, which is a critical error. To fix this, the assistant should ensure that the data retrieved from the tool is accurate and directly reflects the library's actual statistics.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Presence | 1 | 100% |
| Citation Accuracy | 1 | 100% |
| Quote Economy | 1 | 100% |
