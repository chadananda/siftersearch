# Jafar Quality Report — spot-v2821

> Generated: 2026-05-18T08:00:35.221Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 3 |
| Passed | **0 (0%)** |
| Failed | 3 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.33 | 1.5 | 4 | ✓ |
| Citation Presence | 2.67 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.33 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.67 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.33 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.33 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.33 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.33 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 3.33 | 1 | 3 | ✓ |
| Instruction Following | 4.67 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.33 | 2 |
| reading | 3.93 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.33 |
| reading | 3.93 |

## Failure Diagnoses (worst first)

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.32
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the library, which diminishes its credibility and support for the claims made about Momen's work. To improve, the assistant should include specific quotes or excerpts from the titles mentioned to substantiate the claims about Momen's scholarship.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.34
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks direct quotes from the documents, which diminishes its authority and support for claims made about the content. To improve, the assistant should include specific excerpts or key points from the documents to substantiate its claims and enhance citation presence and accuracy.

- **[75] reading** (reading) "Show me the first few paragraphs of the Tao Te Chi" — overall=3.93
  Failed: topicCoverage
  Diagnosis: The response does a good job of quoting relevant passages from the *Tao Te Ching*, but it lacks a direct reading of the first few paragraphs as requested. Instead, it summarizes the content, which deviates from the user's instruction. To improve, the assistant should provide the actual text of the first few paragraphs directly from the document.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 2 | 67% |
| Logical Coherence | 2 | 67% |
| Inline Quote Integration | 1 | 33% |
| Topic Coverage | 1 | 33% |

## Common Diagnosis Themes

`claims` (4x), `response` (3x), `lacks` (3x), `direct` (3x), `quotes` (3x), `which` (3x), `about` (3x), `improve,` (3x), `assistant` (3x), `should` (3x)
