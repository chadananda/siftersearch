# Jafar Quality Report — full-v2.73.22

> Generated: 2026-05-15T23:20:28.804Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 110 |
| Passed | **104 (95%)** |
| Failed | 6 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.31 | 1.5 | 4 | ✓ |
| Citation Presence | 4.21 | 2 | 4 | ✓ |
| Citation Accuracy | 4.19 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.15 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.37 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.11 | 1 | 4 | ✓ |
| Critical Engagement | 3.24 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.98 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.78 | 1 | 3 | ✓ |
| Quote Economy | 4.12 | 1 | 3 | ✓ |
| Instruction Following | 4.93 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.47 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.75 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.87 | 10 |
| framing | 4.25 | 10 |
| lookup | 4.14 | 10 |
| reading | 4.74 | 5 |
| research | 4.27 | 73 |
| social | 4.72 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.14 |
| browsing | 3.87 |
| comparative | 4.23 |
| edge | 4.20 |
| factual | 4.29 |
| framing | 4.25 |
| multi | 4.23 |
| philosophical | 4.47 |
| reading | 4.74 |
| topical | 4.31 |

## Failure Diagnoses (worst first)

- **[35] author** (lookup) "Who wrote the most books in the library?" — overall=3.54
  Failed: toolUsage, logicalCoherence
  Diagnosis: The response lacks a clear focus on the primary question about who wrote the most books in the library, as it includes unrelated references to other traditions without directly addressing the user's query. To improve, the assistant should concentrate on providing a more straightforward answer regarding the authorship of the most documents in the library, ideally with a direct citation from the library's content.

- **[20] comparative** (research) "What do the Bahá'í Faith and Islam say about fasti" — overall=3.78
  Failed: citationPresence
  Diagnosis: The response lacks specific quotes from Bahá'í texts regarding fasting, which weakens the citation presence and authority. To improve, the assistant should ensure it retrieves and includes relevant Bahá'í writings to provide a more balanced comparison with Islam.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.88
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response lacks clarity and specificity regarding the user's vague query, which could be improved by asking clarifying questions rather than assuming a focus on Buddhism. Additionally, while the citations are relevant, the assistant could have better engaged with the user's ambiguous question to explore multiple perspectives or dimensions of the topic.

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=3.98
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively uses the library to provide relevant passages about the covenant in both the Bahá'í Faith and Judaism. However, it could improve in critical engagement by addressing the nuances of the term 'covenant' in both traditions, rather than simply stating the concepts. Additionally, integrating quotes more fluidly into the text would enhance the overall coherence and depth of the response.

- **[81] edge** (research) "Tell me everything about Buddhism" — overall=4
  Failed: topicCoverage
  Diagnosis: The response provides a good overview of Buddhism but lacks comprehensive coverage of key aspects such as the Four Noble Truths, the Eightfold Path, and the various schools of Buddhism. To improve, it should include these fundamental teachings and concepts to give a fuller picture of Buddhism.

- **[106] framing** (framing) "Bahá'u'lláh's teachings are pretty compatible with" — overall=4.07
  Failed: criticalEngagement
  Diagnosis: The response does a good job of addressing the user's framing but could improve in critical engagement by more explicitly naming the limitations of equating Bahá'u'lláh's teachings with secular humanism. Additionally, while the quotes are well-integrated, the assistant could enhance warmth to create a more engaging tone.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 2 | 2% |
| Citation Presence | 1 | 1% |
| Tool Usage | 1 | 1% |
| Logical Coherence | 1 | 1% |
| Instruction Following | 1 | 1% |
| Inline Quote Integration | 1 | 1% |
| Critical Engagement | 1 | 1% |

## Common Diagnosis Themes

`response` (6x), `could` (5x), `lacks` (4x), `user's` (4x), `assistant` (4x), `addressing` (3x), `improve,` (3x), `should` (3x), `regarding` (3x), `quotes` (3x)
