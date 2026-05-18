# Jafar Quality Report — seq-verify

> Generated: 2026-05-15T12:46:14.565Z
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
| Tool Usage | 3.33 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.33 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.33 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.33 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.67 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.67 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.33 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.67 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.33 | 1 | 3 | ✓ |
| Quote Economy | 3.00 | 1 | 3 | ✓ |
| Instruction Following | 4.33 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 2.67 | 0.5 | 3 | **BELOW** (need 3) |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.33 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| research | 3.51 | 3 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| edge | 3.23 |
| multi | 4.07 |

## Failure Diagnoses (worst first)

- **[86] edge** (research) "Who was the Bab?" — overall=2.51
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, quoteEconomy, instructionFollowing, warmth
  Diagnosis: The response lacks proper citations from the library, relying instead on external links and general knowledge. To improve, it should include direct quotes from the Ocean Library to substantiate claims about the Báb's identity and significance, ensuring that all information is grounded in authoritative sources.

- **[84] edge** (research) "七つの谷" — overall=3.95
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively outlines the stages of the 'Seven Valleys' but lacks deeper critical engagement with the user's query. It could improve by addressing the significance of each valley in a more nuanced way and integrating quotes more fluidly into the narrative rather than relying on links. Additionally, the response could be more concise by reducing some repetitive phrases.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Inline Quote Integration | 2 | 67% |
| Tool Usage | 1 | 33% |
| Citation Presence | 1 | 33% |
| Citation Accuracy | 1 | 33% |
| Source Authority Hierarchy | 1 | 33% |
| Topic Coverage | 1 | 33% |
| Logical Coherence | 1 | 33% |
| Critical Engagement | 1 | 33% |
| Quote Economy | 1 | 33% |
| Instruction Following | 1 | 33% |
| Warmth & Gravitas | 1 | 33% |

## Common Diagnosis Themes

`response` (3x)
