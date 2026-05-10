# Jafar Quality Report — v7-hype-thesis

> Generated: 2026-04-30T15:02:55.256Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 100 |
| Passed | **49 (49%)** |
| Failed | 51 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.77 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.56 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.63 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.76 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.48 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.82 | 1 | 4 | **BELOW** (need 4) |
| Inline Quote Integration | 3.39 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.68 | 1 | 3 | ✓ |
| Quote Economy | 3.53 | 1 | 3 | ✓ |
| Instruction Following | 4.23 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.32 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge | 4.63 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.03 | 10 |
| lookup | 3.52 | 10 |
| reading | 3.29 | 5 |
| research | 4.12 | 73 |
| social | 2.68 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.52 |
| browsing | 3.03 |
| comparative | 4.14 |
| edge | 3.93 |
| factual | 4.08 |
| multi | 3.94 |
| philosophical | 4.37 |
| reading | 3.29 |
| topical | 4.09 |

## Failure Diagnoses (worst first)

- **[73] reading** (reading) "What does the first chapter of the Quran say?" — overall=1.5
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, brevity, quoteEconomy, instructionFollowing, warmth, noGeneralKnowledge
  Diagnosis: The assistant failed to provide any text from the Quran, relying instead on general knowledge about Al-Fatiha. To improve, it should have used the reading mode to retrieve the actual text of the first chapter from the library, as that was the user's explicit request.

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=1.84
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, brevity, quoteEconomy, instructionFollowing
  Diagnosis: The assistant completely failed to address the user's query about Hindu scriptures by providing irrelevant information about the Bahá'í Faith instead. To improve, the assistant should have searched for Hindu scriptures in the library and provided relevant titles or excerpts from those texts.

- **[75] reading** (reading) "Show me the first few paragraphs of the Tao Te Chi" — overall=1.84
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, brevity, quoteEconomy, instructionFollowing
  Diagnosis: The assistant failed to locate and provide the requested text from the Tao Te Ching, which is a critical error for a reading request. To improve, it should have successfully searched for and presented the first few paragraphs of the text, rather than providing general information about it.

- **[11] factual** (research) "What is the Sikh concept of seva?" — overall=1.95
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response lacks any quotes from the library, which is critical for a research question. The assistant should have provided specific citations to support the explanation of 'seva' in Sikhism. To improve, the assistant should ensure that all claims are backed by relevant quotes from the library content.

- **[64] browsing** (browsing) "What languages are available?" — overall=1.95
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response relies heavily on general knowledge rather than utilizing the library's resources effectively. It fails to provide any citations or specific information from the library, which is critical for a browsing question. To improve, the assistant should ensure that all claims are supported by quotes from the library and focus solely on the retrieved content.

- **[42] topical** (research) "What do scriptures teach about marriage?" — overall=2.03
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response lacks specific citations from the library, relying instead on general knowledge about Bahá'í teachings. To improve, the assistant should ensure it retrieves and quotes relevant scripture directly from the library, enhancing both citation presence and accuracy.

- **[79] edge** (social) "?" — overall=2.55
  Failed: logicalCoherence, quoteEconomy, instructionFollowing
  Diagnosis: The response lacks any citations or quotes from the library, which is critical even for a social query. While it does ask for clarification, it could have included a relevant quote or teaching to engage the user more effectively. To improve, the assistant should provide a brief, relevant quote from the library related to the Bahá'í Faith or another topic to enhance the response.

- **[37] topical** (research) "Find passages about environmental stewardship" — overall=2.61
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The primary issue with this response is the reliance on secondary sources instead of providing direct quotes from primary Bahá'í texts. To improve, the assistant should ensure it retrieves and cites relevant passages from the library that directly address environmental stewardship, rather than summarizing secondary interpretations.

- **[96] multi** (research) "How many documents by 'Abdu'l-Bahá do you have, an" — overall=2.66
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy, instructionFollowing, noGeneralKnowledge
  Diagnosis: The response lacks specific citations from the library, relying instead on general knowledge about 'Abdu'l-Bahá's works. To improve, the assistant should have provided actual quotes from the library that discuss governance, ensuring that all claims are backed by specific references.

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=2.68
  Failed: citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy
  Diagnosis: The primary issue with this response is the lack of citations and specific references to the library's content, which is crucial for a lookup query. To improve, the assistant should provide actual titles or passages from the library that relate to the user's interest in Thich Nhat Hanh, even if they are translations or commentaries on Buddhist scriptures.

- **[89] edge** (social) "Thank you!" — overall=2.82
  Failed: topicCoverage, quoteEconomy
  Diagnosis: The response lacks any citations or quotes from the library, which is critical even in a social context. While the warmth and logical coherence are good, the absence of any library content significantly lowers the score. To improve, the assistant should include a relevant quote or reference from the library, even in a casual response.

- **[26] author** (lookup) "Do you have any books by Udo Schaefer?" — overall=2.84
  Failed: toolUsage, citationAccuracy, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks direct quotes from the library, relying instead on general knowledge about Udo Schaefer's works. To improve, the assistant should provide actual quotes from the library's documents to support its claims and ensure proper citation of the works mentioned.

- **[61] browsing** (browsing) "What's in the library?" — overall=2.84
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks specific details about the library's contents and relies too heavily on generalizations. To improve, the assistant should provide more concrete examples of the types of documents available, ideally with direct quotes from the library to enhance credibility and authority.

- **[63] browsing** (browsing) "Show me the Islamic collections" — overall=2.87
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks direct citations from the library, which is crucial for a browsing query. It also fails to provide a clear list or overview of Islamic collections, which was the user's request. To improve, the assistant should focus on retrieving and presenting relevant Islamic texts or collections directly from the library.

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=2.87
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks clarity and specificity regarding the total number of documents in the library. It should have provided a direct answer based on the library's total document count instead of referencing an unrelated excerpt. To improve, the assistant should focus on delivering the exact figure if available or clearly state the inability to find that information without introducing unrelated details.

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=2.95
  Failed: toolUsage, citationAccuracy, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The main issue with this response is the lack of direct quotes from Bahá'u'lláh's works, which are essential for a lookup request. To improve, the assistant should ensure it retrieves and cites actual texts by Bahá'u'lláh rather than secondary references or bibliographic mentions.

- **[67] browsing** (browsing) "Do you have any Jain texts?" — overall=3
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks direct quotes from Jain texts, relying instead on secondary sources, which diminishes its authority. To improve, the assistant should provide actual excerpts from Jain texts found in the library, ensuring a more authoritative and direct answer to the user's query.

- **[77] edge** (research) "Udo Schafer" — overall=3.11
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, inlineQuoteIntegration, instructionFollowing
  Diagnosis: The response lacks direct quotes from the library, which is essential for a research query. While it provides some context about Udo Schaefer's work, it should have included specific passages from the library to support its claims. To improve, the assistant should ensure that all substantive claims are backed by direct quotes from the search results.

- **[35] author** (lookup) "Who wrote the most books in the library?" — overall=3.13
  Failed: toolUsage, citationAccuracy, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The response lacks specific citations from the library, which is crucial for a lookup question. To improve, the assistant should provide direct quotes from the library that clearly indicate the authorship of the most books, rather than general statements about the central figures in the Bahá'í Faith.

- **[74] reading** (reading) "Read the opening verses of the Bhagavad Gita" — overall=3.16
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, inlineQuoteIntegration, instructionFollowing
  Diagnosis: The assistant failed to provide the actual opening verses of the Bhagavad Gita, which was the user's request. Instead, it offered a related passage without quoting it directly, leading to a lack of citation presence and inline integration. To improve, the assistant should ensure it retrieves and presents the specific text requested by the user.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 43 | 43% |
| Instruction Following | 27 | 27% |
| Tool Usage | 23 | 23% |
| Logical Coherence | 22 | 22% |
| Inline Quote Integration | 20 | 20% |
| Citation Accuracy | 19 | 19% |
| Citation Presence | 17 | 17% |
| Quote Economy | 11 | 11% |
| Source Authority Hierarchy | 6 | 6% |
| No General Knowledge | 6 | 6% |
| Brevity | 3 | 3% |
| Warmth & Gravitas | 1 | 1% |

## Common Diagnosis Themes

`response` (47x), `assistant` (46x), `should` (44x), `improve,` (41x), `quotes` (41x), `which` (30x), `lacks` (29x), `direct` (21x), `provide` (20x), `library` (20x)
