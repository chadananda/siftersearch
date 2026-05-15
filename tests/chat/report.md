# Jafar Quality Report — 2026-05-15T17-21-58

> Generated: 2026-05-15T17:31:55.844Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 110 |
| Passed | **93 (85%)** |
| Failed | 17 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.37 | 1.5 | 4 | ✓ |
| Citation Presence | 4.25 | 2 | 4 | ✓ |
| Citation Accuracy | 4.23 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.19 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.38 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.16 | 1 | 4 | ✓ |
| Critical Engagement | 3.29 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 4.00 | 2 | 4 | ✓ |
| Brevity | 3.73 | 1 | 3 | ✓ |
| Quote Economy | 4.15 | 1 | 3 | ✓ |
| Instruction Following | 4.90 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.50 | 0.5 | 3 | ✓ |
| No Hallucination | 4.98 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 4.70 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 4.15 | 10 |
| framing | 4.25 | 10 |
| lookup | 4.21 | 10 |
| reading | 4.60 | 5 |
| research | 4.26 | 73 |
| social | 4.47 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.21 |
| browsing | 4.15 |
| comparative | 4.33 |
| edge | 4.29 |
| factual | 4.34 |
| framing | 4.25 |
| multi | 4.00 |
| philosophical | 4.23 |
| reading | 4.60 |
| topical | 4.34 |

## Failure Diagnoses (worst first)

- **[65] browsing** (browsing) "List the Bahá'í collections" — overall=3.37
  Failed: toolUsage, topicCoverage, logicalCoherence
  Diagnosis: The response lacks a comprehensive list of Bahá'í collections, which is what the user requested. Instead, it provides a few examples without sufficient detail or organization. To improve, the assistant should present a clearer and more complete list of collections, ensuring that it adheres closely to the user's request.

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=3.41
  Failed: logicalCoherence, noHallucination
  Diagnosis: The response provides a good overview of Hindu scriptures but includes misattributed quotes and lacks clarity on the specific texts mentioned. To improve, it should ensure accurate citations from the library and provide more context for the quotes used.

- **[96] multi** (research) "How many documents by 'Abdu'l-Bahá do you have, an" — overall=3.44
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration
  Diagnosis: The response lacks specific quotes from 'Abdu'l-Bahá's writings, which are essential for supporting claims about governance. To improve, it should include direct citations from relevant documents that discuss governance, enhancing both citation presence and accuracy.

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=3.54
  Failed: toolUsage, citationPresence, inlineQuoteIntegration, instructionFollowing
  Diagnosis: The response lacks sufficient Bahá'í passages, which is a significant gap given the user's request for both traditions. To improve, the assistant should ensure it retrieves and includes relevant Bahá'í texts to provide a more balanced and comprehensive answer.

- **[5] factual** (research) "What is the Hindu concept of dharma?" — overall=3.56
  Failed: citationPresence, citationAccuracy, inlineQuoteIntegration, noHallucination
  Diagnosis: The response lacks precise citations from authoritative texts, as it references the wrong document for the quotes provided. Additionally, the quotes are not fully integrated into the argument, which affects the overall coherence. To improve, the assistant should ensure that quotes are accurately attributed to the correct sources and better woven into the narrative to enhance clarity and authority.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.56
  Failed: toolUsage, topicCoverage, logicalCoherence
  Diagnosis: The response lacks depth in citation presence and critical engagement, as it does not provide enough specific quotes from the documents to support its claims. To improve, the assistant should include more direct quotes from the Universal House of Justice's documents to substantiate its points and engage more critically with the user's request.

- **[64] browsing** (browsing) "What languages are available?" — overall=3.66
  Failed: toolUsage
  Diagnosis: The response provides a good overview of the languages available but lacks a thorough search for specific language listings in the library. Additionally, while it includes relevant quotes, the integration of these quotes could be improved to better connect them to the main point about language diversity. Focusing more on the languages themselves and less on the texts would enhance clarity.

- **[20] comparative** (research) "What do the Bahá'í Faith and Islam say about fasti" — overall=3.76
  Failed: citationPresence, topicCoverage
  Diagnosis: The response lacks sufficient citations for the Bahá'í Faith, which weakens the overall coverage of the topic. To improve, the assistant should retrieve and include specific Bahá'í texts related to fasting to provide a more balanced comparison with Islam.

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=3.8
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response does not directly address the user's request for works by Thich Nhat Hanh, which is a significant oversight. To improve, the assistant should explicitly state the absence of his works and focus more on relevant Buddhist texts without assuming a connection to Thich Nhat Hanh's teachings, which could mislead the user.

- **[97] multi** (research) "What Buddhist texts discuss mindfulness, and can y" — overall=3.83
  Failed: citationAccuracy, inlineQuoteIntegration
  Diagnosis: The response provides relevant texts and passages but lacks precision in citation accuracy, as the links provided do not correspond to the mentioned texts. To improve, ensure that the citations directly reference the correct texts and passages discussed, enhancing both accuracy and authority.

- **[81] edge** (research) "Tell me everything about Buddhism" — overall=3.88
  Failed: topicCoverage
  Diagnosis: The response provides a good overview of Buddhism but lacks comprehensive coverage of key aspects such as the Four Noble Truths, the Eightfold Path, and major schools of thought. To improve, it should include more foundational elements of Buddhism and ensure all claims are fully supported by quotes from the library.

- **[9] factual** (research) "What does the Torah say about justice?" — overall=3.9
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively uses the library but could improve by citing more authoritative sources directly from the Torah rather than secondary texts. Additionally, while the quotes are relevant, they could be better integrated into the argument to enhance clarity and flow.

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=3.95
  Failed: instructionFollowing
  Diagnosis: The response provides a good overview of Bahá'u'lláh's writings but lacks a comprehensive list of all his works as requested. To improve, it should include a more direct listing of his major texts or a link to a complete bibliography, ensuring it follows the user's instruction more closely.

- **[105] framing** (framing) "So detachment in the Bahá'í writings just means no" — overall=4
  Failed: criticalEngagement
  Diagnosis: The response effectively addresses the user's framing but could improve in critical engagement by explicitly naming the flawed assumption that equates detachment solely with material minimalism. Additionally, while the quotes are relevant, integrating them more fluidly into the argument would enhance the overall coherence.

- **[107] framing** (framing) "The Bahá'í Faith is basically a liberal religion t" — overall=4.05
  Failed: criticalEngagement
  Diagnosis: The response does a good job of addressing the user's framing but could improve in critical engagement by explicitly naming the imprecise term 'liberal religion' and clarifying how Bahá'í principles differ from typical political categories. Additionally, while the response is mostly concise, it could be tightened further to enhance brevity.

- **[110] framing** (framing) "Isn't the Bahá'í teaching on the soul basically th" — overall=4.05
  Failed: criticalEngagement
  Diagnosis: The response does a good job of integrating quotes and addressing the user's question, but it could improve in critical engagement by more explicitly naming the differences between Bahá'í teachings and common notions of spirituality. Additionally, some sentences could be tightened for brevity without losing meaning.

- **[109] framing** (framing) "So the Bahá'í concept of justice is the same as so" — overall=4.1
  Failed: criticalEngagement
  Diagnosis: The response does a good job of integrating quotes and addressing the user's question, but it could improve in critical engagement by more explicitly naming the differences between Bahá'í justice and modern social justice. This would provide a clearer distinction and deepen the user's understanding of the Bahá'í perspective.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 6 | 5% |
| Inline Quote Integration | 5 | 5% |
| Critical Engagement | 5 | 5% |
| Citation Presence | 4 | 4% |
| Tool Usage | 4 | 4% |
| Logical Coherence | 4 | 4% |
| Citation Accuracy | 3 | 3% |
| Instruction Following | 3 | 3% |
| No Hallucination | 2 | 2% |

## Common Diagnosis Themes

`response` (18x), `quotes` (14x), `lacks` (11x), `improve,` (11x), `should` (10x), `user's` (10x), `could` (10x), `bahá'í` (9x), `texts` (8x), `which` (7x)
