# Jafar Quality Report — v11-catalog

> Generated: 2026-05-11T12:26:11.223Z
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
| Tool Usage | 3.20 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 2.30 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.40 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.40 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.40 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 2.60 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | N/A | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 1.60 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.40 | 1 | 3 | ✓ |
| Quote Economy | 2.40 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.10 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.10 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 2.95 | 10 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 2.95 |

## Failure Diagnoses (worst first)

- **[68] browsing** (browsing) "Show me documents about the Pali Canon" — overall=2.03
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to provide any citations from the library, relying instead on general knowledge about the Pali Canon. This results in a lack of authoritative sources and relevant quotes. To improve, the assistant should ensure it retrieves and cites specific documents related to the Pali Canon from the library.

- **[67] browsing** (browsing) "Do you have any Jain texts?" — overall=2.42
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing
  Diagnosis: The primary issue with this response is the lack of any retrieved quotes or information regarding Jain texts, despite multiple tool calls. The assistant should have provided at least some relevant information or context about Jain texts, even if none were found, to better address the user's query.

- **[62] browsing** (browsing) "How many Buddhist texts do you have?" — overall=2.45
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to provide the specific number of Buddhist texts available in the library, which was the user's primary request. Instead, it offers general information about the Pali Canon without directly addressing the query. To improve, the assistant should focus on delivering the exact count of Buddhist texts and avoid unnecessary general knowledge unless it directly relates to the question.

- **[64] browsing** (browsing) "What languages are available?" — overall=2.53
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response fails to utilize the library tools effectively, relying instead on general knowledge about Bahá'í literature translations. It also lacks proper citation integration and authority, as it does not quote directly from the library. To improve, the assistant should conduct a search for the specific languages available and provide a direct quote from the library to support its claims.

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=2.58
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing, warmth
  Diagnosis: The response lacks a clear answer to the user's query about the total number of documents in the library, which is the primary focus. It also fails to provide relevant quotes or data from the search results, leading to a lack of authority and coherence. To improve, the assistant should directly address the total document count if available, or clearly state the inability to find that information while providing any relevant context from the search results.

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=3.05
  Failed: topicCoverage, logicalCoherence
  Diagnosis: The response lacks specific citations from the library, which is critical for supporting claims about scripture availability. To improve, the assistant should provide a direct quote or reference from the search results to substantiate its claims about the Hindu scriptures it carries.

- **[63] browsing** (browsing) "Show me the Islamic collections" — overall=3.13
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks depth and specificity regarding Islamic collections, only mentioning a single quote from the Qur'án without context. To improve, the assistant should provide a more comprehensive overview of available Islamic collections and include additional relevant quotes or references from the library.

- **[66] browsing** (browsing) "What's the largest collection?" — overall=3.32
  Failed: toolUsage, topicCoverage, logicalCoherence
  Diagnosis: The response lacks depth and specificity regarding the largest collection of religious texts, as it does not clarify what is meant by 'largest' (e.g., number of texts, volume, or influence). Additionally, while it provides links, it does not integrate quotes or specific content from the library, which would strengthen the claims made. To improve, the assistant should clarify the criteria for 'largest' and provide more detailed citations from the library.

- **[65] browsing** (browsing) "List the Bahá'í collections" — overall=3.92
  Failed: topicCoverage
  Diagnosis: The response provides a good overview of Bahá'í collections but lacks a comprehensive list, which was the user's request. To improve, the assistant should include more specific collections and their titles, ensuring a complete response to the user's query.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 9 | 90% |
| Logical Coherence | 8 | 80% |
| Tool Usage | 6 | 60% |
| Instruction Following | 6 | 60% |
| No General Knowledge / No Secular Drift | 2 | 20% |
| Citation Presence | 2 | 20% |
| Citation Accuracy | 2 | 20% |
| Quote Economy | 2 | 20% |
| Warmth & Gravitas | 1 | 10% |

## Common Diagnosis Themes

`response` (10x), `assistant` (9x), `should` (9x), `improve,` (8x), `provide` (7x), `about` (7x), `specific` (6x), `lacks` (6x), `library,` (5x), `relevant` (5x)
