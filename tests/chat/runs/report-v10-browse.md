# Jafar Quality Report — v10-browse

> Generated: 2026-05-11T12:24:08.386Z
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
| Tool Usage | 2.70 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 2.10 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.50 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.60 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.30 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 2.60 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | N/A | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 1.70 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.40 | 1 | 3 | ✓ |
| Quote Economy | 2.20 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 2.70 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.20 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 3.70 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 2.81 | 10 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 2.81 |

## Failure Diagnoses (worst first)

- **[67] browsing** (browsing) "Do you have any Jain texts?" — overall=1.63
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to utilize the library's resources effectively, as it does not provide any actual search results or quotes from Jain texts. Instead, it relies on general knowledge about Jain literature, which is not acceptable in this context. To improve, the assistant should have searched for Jain texts in the library and provided relevant information based on the search results.

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=1.82
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, brevity, quoteEconomy, instructionFollowing, warmth
  Diagnosis: The response fails to answer the user's query about the total number of documents in the library, instead providing unrelated excerpts. To improve, the assistant should directly state the total number of documents if available, or acknowledge the lack of specific information while still addressing the user's question more effectively.

- **[65] browsing** (browsing) "List the Bahá'í collections" — overall=2.18
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to provide a direct list of Bahá'í collections as requested, relying instead on general knowledge about key texts without citing any specific excerpts from the library. To improve, the assistant should ensure it retrieves and presents relevant collections directly from the library's resources.

- **[66] browsing** (browsing) "What's the largest collection?" — overall=2.45
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response lacks direct engagement with the user's query about the largest collection, relying instead on general knowledge and examples without specific citations from the library. To improve, the assistant should focus on retrieving and quoting relevant texts that explicitly address the concept of the largest collection in a religious context.

- **[62] browsing** (browsing) "How many Buddhist texts do you have?" — overall=2.89
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks specific quantitative information about the number of Buddhist texts available, which was the user's primary inquiry. To improve, the assistant should provide a clearer count or range of texts and better integrate the cited materials into the response.

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=2.97
  Failed: topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The primary issue with this response is the lack of specific citations from the library, which undermines the authority of the claims made. To improve, the assistant should provide a direct quote from the mentioned document and clarify the absence of specific Hindu scriptures in the collection more effectively.

- **[64] browsing** (browsing) "What languages are available?" — overall=3
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks specific quotes from the search results, which diminishes its authority and support for the claims made. To improve, the assistant should provide actual quotes regarding the languages available, even if they are general statements about translation efforts.

- **[63] browsing** (browsing) "Show me the Islamic collections" — overall=3.05
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks comprehensive coverage of Islamic collections, only mentioning a single translation of the Qur'an without exploring other significant texts or collections. To improve, the assistant should provide a broader overview of available Islamic collections, including Hadith and other relevant texts, while integrating quotes more effectively into the response.

- **[68] browsing** (browsing) "Show me documents about the Pali Canon" — overall=3.29
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks depth and specificity regarding the Pali Canon, as it does not provide direct quotes from the documents. While it mentions relevant texts, it fails to integrate them effectively into the answer. To improve, the assistant should include more direct citations from the library and better integrate them into a cohesive response.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 9 | 90% |
| Logical Coherence | 9 | 90% |
| Instruction Following | 9 | 90% |
| Tool Usage | 8 | 80% |
| Citation Presence | 3 | 30% |
| Citation Accuracy | 3 | 30% |
| Quote Economy | 3 | 30% |
| No General Knowledge / No Secular Drift | 3 | 30% |
| Brevity | 1 | 10% |
| Warmth & Gravitas | 1 | 10% |

## Common Diagnosis Themes

`response` (9x), `improve,` (9x), `assistant` (9x), `should` (9x), `provide` (7x), `specific` (7x), `about` (6x), `texts` (6x), `quotes` (5x), `relevant` (5x)
