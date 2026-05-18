# Jafar Quality Report — count-v2.72.24

> Generated: 2026-05-15T19:40:22.143Z
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
| Citation Presence | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.00 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 1.00 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.00 | 1 | 3 | ✓ |
| Quote Economy | 2.00 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 3.00 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 2.71 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 2.71 |

## Failure Diagnoses (worst first)

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=2.71
  Failed: toolUsage, topicCoverage, logicalCoherence, noGeneralKnowledge
  Diagnosis: The primary issue with this response is the inaccurate total document count, which does not align with the actual library data. Additionally, the quote provided is not relevant to the user's query about the total number of documents. To improve, the assistant should ensure the accuracy of the document count and provide relevant information without unnecessary quotes.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 100% |
| Topic Coverage | 1 | 100% |
| Logical Coherence | 1 | 100% |
| No General Knowledge / No Secular Drift | 1 | 100% |
