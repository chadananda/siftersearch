# Jafar Quality Report — edge-multi

> Generated: 2026-05-15T12:32:36.653Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 20 |
| Passed | **14 (70%)** |
| Failed | 6 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.15 | 1.5 | 4 | ✓ |
| Citation Presence | 3.70 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.70 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.70 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.95 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.75 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.80 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.30 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.50 | 1 | 3 | ✓ |
| Quote Economy | 3.50 | 1 | 3 | ✓ |
| Instruction Following | 4.70 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.25 | 0.5 | 3 | ✓ |
| No Hallucination | 4.90 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 4.60 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.64 | 10 |
| reading | 4.20 | 5 |
| research | 3.88 | 4 |
| social | 4.54 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 3.64 |
| edge | 4.01 |
| reading | 4.20 |

## Failure Diagnoses (worst first)

- **[63] browsing** (browsing) "Show me the Islamic collections" — overall=2.63
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy
  Diagnosis: The response lacks citations and does not reference specific documents or quotes from the library, which is critical for a browsing query. To improve, the assistant should include specific titles or excerpts from the Islamic collections to substantiate its claims.

- **[65] browsing** (browsing) "List the Bahá'í collections" — overall=2.63
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, warmth
  Diagnosis: The response lacks citations from the library, which is critical for supporting the claims made about the Bahá'í collections. To improve, the assistant should include specific quotes or references from the library to substantiate the information provided.

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=2.63
  Failed: toolUsage, topicCoverage, logicalCoherence
  Diagnosis: The primary issue with this response is that it provides incorrect information about the total number of documents in the library, which should have been verified through the appropriate tool. Additionally, the citations lack integration into the response, making it feel disjointed and less authoritative. To improve, the assistant should ensure accurate data retrieval and better integrate quotes into a cohesive narrative.

- **[76] edge** (research) "bahaullah" — overall=2.85
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: The response lacks direct quotes from the search results, which diminishes its authority and support for the claims made. To improve, the assistant should include specific quotes from the retrieved documents to substantiate its points about Bahá'u'lláh's teachings.

- **[72] reading** (reading) "Show me the beginning of the Kitáb-i-Íqán" — overall=2.95
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: The response fails to provide the actual text from the Kitáb-i-Íqán as requested, instead summarizing its themes and referencing other traditions. To improve, the assistant should directly quote the opening passage of the Kitáb-i-Íqán, ensuring it adheres to the user's request for reading material.

- **[78] edge** (research) "books" — overall=3.88
  Failed: topicCoverage
  Diagnosis: The response provides a good overview of how different traditions view books, but it lacks depth in addressing the user's query about 'books' specifically. To improve, the assistant should clarify the context of 'books' (e.g., religious texts, literature) and provide more specific examples or a broader range of texts from each tradition.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 6 | 30% |
| Logical Coherence | 5 | 25% |
| Citation Presence | 4 | 20% |
| Citation Accuracy | 4 | 20% |
| Tool Usage | 3 | 15% |
| Quote Economy | 2 | 10% |
| Critical Engagement | 2 | 10% |
| Inline Quote Integration | 2 | 10% |
| Instruction Following | 2 | 10% |
| No Hallucination | 2 | 10% |
| No General Knowledge / No Secular Drift | 2 | 10% |
| Warmth & Gravitas | 1 | 5% |

## Common Diagnosis Themes

`should` (7x), `response` (6x), `improve,` (6x), `assistant` (6x), `specific` (5x), `quotes` (5x), `lacks` (4x), `which` (4x), `about` (4x), `citations` (3x)
