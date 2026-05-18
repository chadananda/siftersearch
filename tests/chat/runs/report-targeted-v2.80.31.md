# Jafar Quality Report — targeted-v2.80.31

> Generated: 2026-05-18T04:32:17.280Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 10 |
| Passed | **7 (70%)** |
| Failed | 3 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.90 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.80 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.90 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.90 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.80 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.70 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.80 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.40 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.60 | 1 | 3 | ✓ |
| Quote Economy | 3.80 | 1 | 3 | ✓ |
| Instruction Following | 4.60 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.30 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.50 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| framing | 4.20 | 1 |
| lookup | 3.77 | 3 |
| research | 3.94 | 6 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.77 |
| edge | 3.68 |
| framing | 4.20 |
| multi | 4.20 |
| topical | 4.20 |

## Failure Diagnoses (worst first)

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.24
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the documents, which diminishes its authority and support for claims made. To improve, the assistant should include specific excerpts from the documents to substantiate its statements about their content.

- **[77] edge** (research) "Udo Schafer" — overall=3.32
  Failed: toolUsage, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, instructionFollowing
  Diagnosis: The response lacks depth in addressing Udo Schaefer specifically, as it veers into general religious themes without a clear focus on his contributions. To improve, the assistant should provide more detailed information about Schaefer's works and their significance within the Bahá'í context, while ensuring that all quotes are directly relevant to his scholarship.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.49
  Failed: toolUsage, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, instructionFollowing
  Diagnosis: The response lacks clarity and specificity due to the vague nature of the user's query. While it provides relevant Buddhist insights, it does not fully engage with the user's imprecise terminology or explore the topic deeply enough. To improve, the assistant should clarify the user's intent and provide a more focused answer based on specific aspects of suffering in Buddhism.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Logical Coherence | 3 | 30% |
| Inline Quote Integration | 3 | 30% |
| Tool Usage | 2 | 20% |
| Topic Coverage | 2 | 20% |
| Critical Engagement | 2 | 20% |
| Instruction Following | 2 | 20% |
| Citation Accuracy | 1 | 10% |

## Common Diagnosis Themes

`response` (3x), `lacks` (3x), `improve,` (3x), `assistant` (3x), `should` (3x), `user's` (3x)
