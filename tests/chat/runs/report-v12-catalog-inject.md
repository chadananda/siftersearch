# Jafar Quality Report — v12-catalog-inject

> Generated: 2026-05-11T12:28:37.778Z
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
| Tool Usage | 3.10 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 2.30 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.50 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.60 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | N/A | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.40 | 1 | 3 | ✓ |
| Quote Economy | 2.50 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 3.30 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.30 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.04 | 10 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 3.04 |

## Failure Diagnoses (worst first)

- **[68] browsing** (browsing) "Show me documents about the Pali Canon" — overall=2.03
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response lacks specific citations from the library, relying instead on general knowledge about the Pali Canon. It fails to provide any quotes or references from the documents, which is critical for a browsing query. To improve, the assistant should ensure it retrieves and cites relevant documents directly from the library.

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=2.08
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing, warmth
  Diagnosis: The response fails to provide any specific information or quotes from the library, resulting in a lack of substance. To improve, the assistant should ensure it retrieves relevant data regarding the total document count and present it clearly, rather than stating it couldn't find the information.

- **[64] browsing** (browsing) "What languages are available?" — overall=2.76
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The primary issue with this response is that it does not utilize the library effectively, relying instead on general knowledge and a single quote that lacks proper integration. To improve, the assistant should have conducted a search specifically for the languages available in Bahá'í literature and provided a more comprehensive list with better integration of quotes.

- **[67] browsing** (browsing) "Do you have any Jain texts?" — overall=2.76
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy
  Diagnosis: The primary issue with this response is the lack of any citations or quotes from the library, which is critical for a browsing query. While the assistant correctly states that there are no Jain texts, it fails to provide any supporting evidence or context from the search results. To improve, the assistant should include specific details from the search results to substantiate its claims.

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=2.95
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks specific citations of Hindu scriptures and relies on a vague reference to a secondary source. To improve, the assistant should provide clearer information about the absence of specific texts and offer to search for particular scriptures directly, ensuring better engagement with the user's query.

- **[62] browsing** (browsing) "How many Buddhist texts do you have?" — overall=3.03
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks a clear count of the Buddhist texts available, which was the user's primary query. Additionally, while it mentions a few texts, it does not provide a comprehensive overview or a total number, which would enhance the answer's relevance and completeness. To improve, the assistant should directly state the number of Buddhist texts available and provide a more thorough list or overview of them.

- **[63] browsing** (browsing) "Show me the Islamic collections" — overall=3.13
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks specific details about Islamic collections, which is the user's primary request. To improve, the assistant should provide a clearer overview of available Islamic collections or suggest specific documents related to the query, rather than only mentioning a phrase from the Qur'an.

- **[66] browsing** (browsing) "What's the largest collection?" — overall=3.16
  Failed: topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks specific citations from the library, which diminishes its authority and support for claims made. To improve, the assistant should provide direct quotes from relevant texts to substantiate the discussion of significant collections in religious contexts.

- **[65] browsing** (browsing) "List the Bahá'í collections" — overall=3.79
  Failed: topicCoverage
  Diagnosis: The response provides a good overview of Bahá'í collections but lacks a comprehensive list, which was the user's request. To improve, the assistant should include a more extensive list of collections and ensure that all claims are backed by specific quotes from the library.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 9 | 90% |
| Logical Coherence | 8 | 80% |
| Instruction Following | 7 | 70% |
| Tool Usage | 6 | 60% |
| Citation Presence | 3 | 30% |
| Citation Accuracy | 3 | 30% |
| Quote Economy | 3 | 30% |
| No General Knowledge / No Secular Drift | 1 | 10% |
| Warmth & Gravitas | 1 | 10% |

## Common Diagnosis Themes

`assistant` (10x), `response` (9x), `specific` (9x), `improve,` (9x), `should` (9x), `provide` (8x), `lacks` (7x), `which` (7x), `quotes` (5x), `citations` (4x)
