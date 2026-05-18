# Jafar Quality Report — v13-catalog-shortcut

> Generated: 2026-05-11T12:31:01.220Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 10 |
| Passed | **1 (10%)** |
| Failed | 9 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 2.90 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 2.20 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.30 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.30 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.40 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 2.80 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | N/A | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.40 | 1 | 3 | ✓ |
| Quote Economy | 2.30 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 3.20 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 3.60 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 2.87 | 10 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 2.87 |

## Failure Diagnoses (worst first)

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=1.5
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, brevity, quoteEconomy, instructionFollowing, warmth, noGeneralKnowledge
  Diagnosis: The assistant failed to provide the total number of documents in the library, which was the user's direct request. Instead, it offered examples of documents without addressing the core question. To improve, the assistant should have directly stated the total number of documents found in the library search results.

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=1.89
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing
  Diagnosis: The primary issue with this response is that it fails to utilize the library's resources effectively, as it states there are no Hindu scriptures available without providing any specific information from the collection. To improve, the assistant should have searched for and listed the Hindu scriptures present in the library, ensuring it addresses the user's query directly.

- **[66] browsing** (browsing) "What's the largest collection?" — overall=1.95
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to utilize the library effectively, relying instead on general knowledge without providing any citations or relevant quotes. To improve, the assistant should have searched for specific collections within the library and provided relevant information backed by quotes from authoritative sources.

- **[68] browsing** (browsing) "Show me documents about the Pali Canon" — overall=1.95
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to provide any citations from the library, relying instead on general knowledge about the Pali Canon. It also does not effectively address the user's request for documents, leading to a lack of relevant content. To improve, the assistant should ensure it retrieves and cites specific documents related to the Pali Canon from the library.

- **[65] browsing** (browsing) "List the Bahá'í collections" — overall=2.76
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response lacks specific citations from the library, relying instead on general knowledge about Bahá'í collections. To improve, the assistant should have searched for specific documents that list or describe these collections and provided direct quotes from those sources.

- **[67] browsing** (browsing) "Do you have any Jain texts?" — overall=2.76
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy
  Diagnosis: The response lacks any citations or quotes from the library, which is critical for supporting claims about the absence of Jain texts. To improve, the assistant should provide specific details about the search results, even if they indicate that Jain texts are not available, and mention the titles or excerpts retrieved from other traditions.

- **[63] browsing** (browsing) "Show me the Islamic collections" — overall=2.97
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks depth and specificity regarding Islamic collections, relying on a vague reference to a secondary source. To improve, the assistant should provide more detailed information about available Islamic collections and ensure that the citations are more relevant and authoritative.

- **[62] browsing** (browsing) "How many Buddhist texts do you have?" — overall=3.97
  Failed: topicCoverage
  Diagnosis: The response provides relevant Buddhist texts and links, but it lacks a precise count of the total number of Buddhist texts available in the library, which was the user's primary query. To improve, the assistant should explicitly state the total number of Buddhist texts before mentioning specific examples.

- **[64] browsing** (browsing) "What languages are available?" — overall=4.16
  Failed: topicCoverage
  Diagnosis: The response effectively uses a quote from a primary source and provides a good overview of the languages into which Bahá'í texts are translated. However, it could improve topic coverage by mentioning the total number of languages or the significance of this diversity in a broader context. Additionally, the warmth could be enhanced to create a more engaging tone.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 9 | 90% |
| Logical Coherence | 7 | 70% |
| Tool Usage | 6 | 60% |
| Instruction Following | 6 | 60% |
| Citation Presence | 5 | 50% |
| Citation Accuracy | 5 | 50% |
| Quote Economy | 5 | 50% |
| No General Knowledge / No Secular Drift | 4 | 40% |
| Brevity | 1 | 10% |
| Warmth & Gravitas | 1 | 10% |

## Common Diagnosis Themes

`assistant` (9x), `improve,` (8x), `should` (8x), `response` (8x), `specific` (7x), `library,` (6x), `total` (5x), `number` (5x), `documents` (5x), `citations` (5x)
