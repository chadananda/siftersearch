# Jafar Quality Report — v9-browse-fix

> Generated: 2026-05-11T12:21:52.163Z
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
| Citation Accuracy | 2.20 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.30 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.40 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 2.90 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | N/A | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 1.70 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.10 | 1 | 3 | ✓ |
| Quote Economy | 2.20 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 3.10 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 2.90 | 0.5 | 3 | **BELOW** (need 3) |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 3.60 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 2.78 | 10 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 2.78 |

## Failure Diagnoses (worst first)

- **[66] browsing** (browsing) "What's the largest collection?" — overall=1.61
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, brevity, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to utilize the library effectively, relying instead on general knowledge without any citations from the Ocean Library. It also does not directly answer the user's query about the largest collection, leading to a lack of clarity and relevance. To improve, the assistant should search for specific collections within the library and provide relevant citations.

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=1.82
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, brevity, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response fails to provide the specific information requested about the total number of documents in the library, instead offering unrelated examples of documents. It should have directly stated the total number of documents found in the library, which is a straightforward browsing query.

- **[68] browsing** (browsing) "Show me documents about the Pali Canon" — overall=2.08
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing, warmth
  Diagnosis: The response fails to utilize the library effectively, relying instead on general knowledge about the Pali Canon without any actual quotes or citations from the library. To improve, the assistant should conduct a proper search for relevant documents and provide specific quotes or references from those documents.

- **[65] browsing** (browsing) "List the Bahá'í collections" — overall=2.39
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response lacks specific citations from the library, which is critical for a browsing query. While it mentions key texts, it does not provide any direct quotes or references to support these claims. To improve, the assistant should include actual excerpts from the search results that list or describe Bahá'í collections.

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=2.58
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks specific citations from the library, relying instead on vague references and general knowledge. To improve, the assistant should provide a clearer list of Hindu scriptures available in the collection, along with relevant quotes or references to specific texts.

- **[67] browsing** (browsing) "Do you have any Jain texts?" — overall=2.68
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy
  Diagnosis: The primary issue with this response is the lack of any citations or quotes from the search results, which undermines the credibility of the claim that there are no Jain texts available. To improve, the assistant should provide specific details from the search results, even if they indicate the absence of Jain texts, and could also suggest alternative resources or approaches based on the user's interest in Jain philosophy.

- **[63] browsing** (browsing) "Show me the Islamic collections" — overall=3.05
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks comprehensive coverage of Islamic collections, only mentioning the Qur'án without exploring other significant texts like Hadith. To improve, the assistant should provide a broader overview of available Islamic collections and their significance, ensuring that the user receives a more informative answer.

- **[62] browsing** (browsing) "How many Buddhist texts do you have?" — overall=3.68
  Failed: toolUsage, topicCoverage, instructionFollowing
  Diagnosis: The response lacks a precise count of Buddhist texts available, which was the user's primary inquiry. While it provides relevant information about specific texts, it should have included a more comprehensive overview of the total number of Buddhist texts in the library. To improve, the assistant should directly address the user's question about the quantity before elaborating on specific texts.

- **[64] browsing** (browsing) "What languages are available?" — overall=3.68
  Failed: toolUsage, topicCoverage
  Diagnosis: The response relies on a single quote from a secondary source rather than directly from primary Bahá'í texts, which affects the source authority score. To improve, the assistant should prioritize quoting primary sources or authoritative translations of Bahá'í scripture when discussing the availability of languages.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 9 | 90% |
| Tool Usage | 8 | 80% |
| Instruction Following | 7 | 70% |
| Logical Coherence | 7 | 70% |
| Citation Presence | 5 | 50% |
| Citation Accuracy | 5 | 50% |
| Quote Economy | 5 | 50% |
| No General Knowledge / No Secular Drift | 3 | 30% |
| Brevity | 2 | 20% |
| Warmth & Gravitas | 1 | 10% |

## Common Diagnosis Themes

`should` (10x), `response` (9x), `specific` (9x), `improve,` (8x), `assistant` (8x), `provide` (7x), `citations` (5x), `about` (5x), `search` (5x), `which` (5x)
