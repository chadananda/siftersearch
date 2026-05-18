# Jafar Quality Report — v8-browsing

> Generated: 2026-05-11T12:13:27.670Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 10 |
| Passed | **0 (0%)** |
| Failed | 10 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 2.20 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 1.80 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.20 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.20 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 2.60 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | N/A | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 1.60 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.20 | 1 | 3 | ✓ |
| Quote Economy | 2.00 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 2.60 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 2.90 | 0.5 | 3 | **BELOW** (need 3) |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 3.10 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 2.55 | 10 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 2.55 |

## Failure Diagnoses (worst first)

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=1.71
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to utilize the library's resources, relying entirely on general knowledge instead. To improve, the assistant should have searched for specific Hindu scriptures in the Ocean Library and provided a list of those found, including relevant citations.

- **[66] browsing** (browsing) "What's the largest collection?" — overall=1.76
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, quoteEconomy, instructionFollowing, warmth, noGeneralKnowledge
  Diagnosis: The response fails to utilize the library effectively, relying instead on general knowledge without providing any relevant quotes from the search results. To improve, the assistant should have directly addressed the user's query about the largest collection by searching for specific collections within the library and citing relevant texts.

- **[68] browsing** (browsing) "Show me documents about the Pali Canon" — overall=1.95
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to provide any citations from the library, relying instead on general knowledge about the Pali Canon. To improve, the assistant should have searched for specific documents related to the Pali Canon and quoted relevant passages to support its claims.

- **[65] browsing** (browsing) "List the Bahá'í collections" — overall=2.11
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to provide a list of Bahá'í collections as requested, relying instead on general knowledge about key texts without citing any specific passages from the library. To improve, the assistant should ensure it retrieves and cites relevant documents that directly address the user's query.

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=2.26
  Failed: toolUsage, topicCoverage, logicalCoherence, criticalEngagement, instructionFollowing, warmth, noGeneralKnowledge
  Diagnosis: The response fails to directly answer the user's query about the total number of documents in the library, instead providing unrelated information about specific texts. To improve, the assistant should focus on providing the requested count or clarify that it cannot access that specific information, while avoiding irrelevant details.

- **[67] browsing** (browsing) "Do you have any Jain texts?" — overall=2.68
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, quoteEconomy
  Diagnosis: The primary issue with this response is the lack of any citations or quotes from the search results, which undermines the credibility of the claim that no Jain texts are available. To improve, the assistant should provide specific details from the search results to support its conclusion about the absence of Jain texts.

- **[62] browsing** (browsing) "How many Buddhist texts do you have?" — overall=2.76
  Failed: toolUsage, topicCoverage, logicalCoherence, criticalEngagement, instructionFollowing
  Diagnosis: The response fails to provide a specific count of Buddhist texts, which was the user's primary request. Additionally, it relies on general knowledge rather than utilizing the library's resources effectively. To improve, the assistant should have searched for the exact number of Buddhist texts available in the library and presented that information directly.

- **[63] browsing** (browsing) "Show me the Islamic collections" — overall=2.79
  Failed: toolUsage, topicCoverage, logicalCoherence, criticalEngagement, instructionFollowing
  Diagnosis: The response lacks a comprehensive list of Islamic collections, which was the user's request. The assistant should have provided more specific information or categories related to Islamic texts instead of a single quote from the Qur'án. To improve, the assistant should focus on delivering relevant collections or categories directly related to the query.

- **[64] browsing** (browsing) "What languages are available?" — overall=2.82
  Failed: toolUsage, topicCoverage, logicalCoherence, criticalEngagement
  Diagnosis: The response fails to utilize the library effectively, relying instead on general knowledge about Bahá'í translations. It should have searched for specific documents listing available languages and quoted directly from those sources. To improve, Jafar should have conducted a search for the specific query and provided a more authoritative and comprehensive answer based on the retrieved texts.

- **[61] browsing** (browsing) "What's in the library?" — overall=4.68
  Failed: criticalEngagement
  Diagnosis: The response effectively utilizes the library's resources and provides accurate citations for various religious texts. However, it could improve inline quote integration by weaving quotes more seamlessly into the narrative rather than presenting them as separate links. Overall, it is a strong response that meets the user's browsing request well.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Critical Engagement | 10 | 100% |
| Topic Coverage | 9 | 90% |
| Logical Coherence | 9 | 90% |
| Tool Usage | 8 | 80% |
| Instruction Following | 7 | 70% |
| Citation Presence | 5 | 50% |
| Citation Accuracy | 5 | 50% |
| Quote Economy | 5 | 50% |
| No General Knowledge / No Secular Drift | 5 | 50% |
| Warmth & Gravitas | 2 | 20% |

## Common Diagnosis Themes

`response` (11x), `should` (11x), `specific` (11x), `improve,` (9x), `assistant` (9x), `fails` (7x), `about` (7x), `general` (6x), `knowledge` (6x), `relevant` (6x)
