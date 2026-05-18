# Jafar Quality Report — full-v2.73.12

> Generated: 2026-05-15T22:59:08.342Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 110 |
| Passed | **100 (91%)** |
| Failed | 10 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.25 | 1.5 | 4 | ✓ |
| Citation Presence | 4.20 | 2 | 4 | ✓ |
| Citation Accuracy | 4.14 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.06 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.39 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.10 | 1 | 4 | ✓ |
| Critical Engagement | 3.22 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.90 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.75 | 1 | 3 | ✓ |
| Quote Economy | 4.09 | 1 | 3 | ✓ |
| Instruction Following | 4.95 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.51 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.82 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.70 | 10 |
| framing | 4.32 | 10 |
| lookup | 4.19 | 10 |
| reading | 4.59 | 5 |
| research | 4.26 | 73 |
| social | 4.80 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.19 |
| browsing | 3.70 |
| comparative | 4.27 |
| edge | 4.28 |
| factual | 4.25 |
| framing | 4.32 |
| multi | 4.22 |
| philosophical | 4.35 |
| reading | 4.59 |
| topical | 4.27 |

## Failure Diagnoses (worst first)

- **[69] browsing** (browsing) "What Hindu scriptures do you carry?" — overall=2.95
  Failed: logicalCoherence
  Diagnosis: The response fails to focus on the user's specific query about Hindu scriptures, instead introducing unrelated quotes from other religious texts. This distracts from the main topic and does not provide adequate citations for the Hindu texts mentioned. To improve, the assistant should concentrate on listing and quoting relevant Hindu scriptures directly from the library.

- **[64] browsing** (browsing) "What languages are available?" — overall=2.98
  Failed: citationPresence, citationAccuracy, quoteEconomy
  Diagnosis: The response lacks citations and does not reference any specific documents from the library, which is critical for a browsing question. To improve, the assistant should include a quote or reference from the library that lists the languages available.

- **[12] factual** (research) "What does the Bhagavad Gita say about duty?" — overall=3.54
  Failed: citationPresence, citationAccuracy, sourceAuthority, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the Bhagavad Gita itself, relying instead on secondary sources, which diminishes its authority. To improve, the assistant should include specific verses from the Gita that illustrate the concepts of 'Nishkama Karma' and 'Svadharma' directly, ensuring that the primary text is prioritized over commentary.

- **[49] topical** (research) "Find passages about service to others" — overall=3.73
  Failed: toolUsage
  Diagnosis: The response relies on general knowledge for the overarching theme of service to others rather than strictly using library content. To improve, it should focus solely on passages retrieved from the library without general commentary. Additionally, while the citations are mostly accurate, the assistant could prioritize more authoritative sources where applicable.

- **[19] comparative** (research) "How do Buddhism and Hinduism differ on the concept" — overall=3.88
  Failed: citationPresence, citationAccuracy, inlineQuoteIntegration
  Diagnosis: The response effectively uses the library tools and provides a clear comparison of self in Hinduism and Buddhism. However, it lacks direct quotes from the texts, which would strengthen the claims made. To improve, the assistant should include specific quotes from the retrieved documents to support the assertions about the concepts of âtmabhâva and anatta.

- **[44] topical** (research) "What do the texts say about the soul?" — overall=3.95
  Failed: toolUsage
  Diagnosis: The response provides a good overview of the concept of the soul across various traditions, but it lacks optimal tool usage by not filtering for specific religions and missing some authoritative sources. To improve, Jafar should ensure that the most authoritative texts are prioritized and that the search is more focused on the specific religious contexts mentioned.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.95
  Failed: topicCoverage
  Diagnosis: The response does a good job of addressing the Buddhist perspective on suffering, but it lacks clarity due to the vague nature of the user's question. To improve, the assistant could ask clarifying questions to better understand the user's intent before providing an answer.

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=3.98
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively covers the topic of covenants in both the Bahá'í Faith and Judaism, but it could improve in critical engagement by addressing the nuances of the term 'covenant' in each tradition more explicitly. Additionally, while the citations are mostly accurate, integrating quotes more fluidly into the text would enhance the overall coherence and engagement with the material.

- **[106] framing** (framing) "Bahá'u'lláh's teachings are pretty compatible with" — overall=4
  Failed: criticalEngagement
  Diagnosis: The response partially engages with the user's framing but does not critically address the implications of equating Bahá'u'lláh's teachings with secular humanism. To improve, it should clarify the limitations of secular humanism in capturing the spiritual dimensions of Bahá'u'lláh's teachings more explicitly.

- **[43] topical** (research) "Search for teachings about truthfulness and honest" — overall=4.2
  Failed: toolUsage
  Diagnosis: The response provides a solid overview of teachings on truthfulness and honesty across various religions, but it lacks a thorough search of the Ocean Library, missing some potential relevant passages. To improve, Jafar should ensure that the search includes specific filters for each religion to capture a broader range of teachings.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Presence | 3 | 3% |
| Citation Accuracy | 3 | 3% |
| Inline Quote Integration | 3 | 3% |
| Tool Usage | 3 | 3% |
| Source Authority Hierarchy | 1 | 1% |
| Quote Economy | 1 | 1% |
| Logical Coherence | 1 | 1% |
| Topic Coverage | 1 | 1% |
| Critical Engagement | 1 | 1% |

## Common Diagnosis Themes

`response` (10x), `improve,` (9x), `should` (8x), `specific` (7x), `assistant` (6x), `lacks` (6x), `quotes` (5x), `user's` (4x), `citations` (4x), `library` (4x)
