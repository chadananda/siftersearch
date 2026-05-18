# Jafar Quality Report — count-v2.72.25

> Generated: 2026-05-15T19:42:02.644Z
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
| Citation Presence | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 2.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 2.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 1.00 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.00 | 1 | 3 | ✓ |
| Quote Economy | 3.00 | 1 | 3 | ✓ |
| Instruction Following | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 2.00 | 0.5 | 3 | **BELOW** (need 3) |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 2.00 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 2.66 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 2.66 |

## Failure Diagnoses (worst first)

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=2.66
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing, warmth, noGeneralKnowledge
  Diagnosis: The primary issue with this response is that it provides an incorrect total number of documents in the library, which undermines the accuracy of the information. Additionally, the response includes irrelevant quotes that do not directly address the user's query about the total number of documents. To improve, the assistant should focus solely on the document count and avoid unrelated content.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 100% |
| Topic Coverage | 1 | 100% |
| Logical Coherence | 1 | 100% |
| Instruction Following | 1 | 100% |
| Warmth & Gravitas | 1 | 100% |
| No General Knowledge / No Secular Drift | 1 | 100% |
