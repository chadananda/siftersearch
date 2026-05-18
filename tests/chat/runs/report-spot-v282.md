# Jafar Quality Report — spot-v282

> Generated: 2026-05-18T07:57:25.891Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 3 |
| Passed | **1 (33%)** |
| Failed | 2 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.00 | 1.5 | 4 | ✓ |
| Citation Presence | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.67 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.67 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.33 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.67 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.33 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.67 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.67 | 1 | 3 | ✓ |
| Quote Economy | 3.33 | 1 | 3 | ✓ |
| Instruction Following | 4.33 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 3.67 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.40 | 2 |
| reading | 3.85 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.40 |
| reading | 3.85 |

## Failure Diagnoses (worst first)

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration, noGeneralKnowledge
  Diagnosis: The response lacks sufficient citations from the library to support the claims about Momen's themes and works. To improve, it should include direct quotes or more specific references from the library's documents, particularly regarding the themes explored in Momen's writings.

- **[75] reading** (reading) "Show me the first few paragraphs of the Tao Te Chi" — overall=3.85
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response does not fully comply with the user's request for the first few paragraphs of the *Tao Te Ching*, as it only provides a single quote rather than multiple paragraphs. To improve, the assistant should retrieve and present the actual text of the first few paragraphs directly from the document.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 33% |
| Logical Coherence | 1 | 33% |
| Inline Quote Integration | 1 | 33% |
| No General Knowledge / No Secular Drift | 1 | 33% |
| Topic Coverage | 1 | 33% |
| Instruction Following | 1 | 33% |
