# Jafar Quality Report — fixes-v2.73.16

> Generated: 2026-05-15T22:57:45.665Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 2 |
| Passed | **1 (50%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.50 | 1.5 | 4 | ✓ |
| Citation Presence | 4.50 | 2 | 4 | ✓ |
| Citation Accuracy | 4.50 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.50 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.50 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.50 | 1 | 4 | ✓ |
| Critical Engagement | 3.50 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 4.50 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.50 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.50 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| research | 4.37 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| factual | 4.76 |
| multi | 3.98 |

## Failure Diagnoses (worst first)

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=3.98
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively uses multiple sources and covers the topic well, but it could improve in critical engagement by addressing the differences in how each tradition views the covenant more explicitly. Additionally, some inline quotes could be better integrated into the narrative to enhance the flow and connection to the claims made.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Inline Quote Integration | 1 | 50% |
