# Jafar Quality Report — 2026-05-15T17-56-04

> Generated: 2026-05-15T17:56:27.188Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 4 |
| Passed | **0 (0%)** |
| Failed | 4 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.75 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 2.75 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.50 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.25 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.00 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.75 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.75 | 1 | 3 | ✓ |
| Quote Economy | 3.00 | 1 | 3 | ✓ |
| Instruction Following | 4.50 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.50 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.82 | 2 |
| lookup | 3.54 | 1 |
| research | 2.56 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.54 |
| browsing | 3.82 |
| multi | 2.56 |

## Failure Diagnoses (worst first)

- **[96] multi** (research) "How many documents by 'Abdu'l-Bahá do you have, an" — overall=2.56
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, quoteEconomy, instructionFollowing
  Diagnosis: The response lacks citations and specific document titles, which are crucial for a research query. To improve, it should include relevant quotes from the library that specifically mention governance in 'Abdu'l-Bahá's works, along with a more detailed list of documents discussing governance.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.54
  Failed: toolUsage, topicCoverage, logicalCoherence
  Diagnosis: The response lacks a comprehensive search of the library's documents, relying instead on general knowledge about the Universal House of Justice. To improve, the assistant should provide more specific examples or quotes from the documents themselves, enhancing citation presence and accuracy.

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=3.54
  Failed: logicalCoherence
  Diagnosis: The response lacks clarity in the citations, as the quotes do not directly support the claims made about the scriptures. Additionally, the assistant could have provided a more authoritative source hierarchy by prioritizing scripture over commentary. To improve, it should ensure that quotes are directly relevant to the claims and consider using more authoritative texts.

- **[65] browsing** (browsing) "List the Bahá'í collections" — overall=4.1
  Failed: topicCoverage
  Diagnosis: The response effectively lists the Bahá'í collections and includes relevant quotes, but it could improve in topic coverage by providing a more comprehensive list of the collections instead of just mentioning a few. Additionally, the warmth could be enhanced to create a more engaging tone.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 3 | 75% |
| Logical Coherence | 3 | 75% |
| Tool Usage | 1 | 25% |
| Citation Presence | 1 | 25% |
| Citation Accuracy | 1 | 25% |
| Critical Engagement | 1 | 25% |
| Inline Quote Integration | 1 | 25% |
| Quote Economy | 1 | 25% |
| Instruction Following | 1 | 25% |

## Common Diagnosis Themes

`response` (4x), `quotes` (4x), `lacks` (3x), `improve,` (3x), `should` (3x), `relevant` (3x), `could` (3x)
