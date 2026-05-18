# Jafar Quality Report — full-v2.73.20

> Generated: 2026-05-15T23:11:29.326Z
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
| Tool Usage | 4.35 | 1.5 | 4 | ✓ |
| Citation Presence | 4.22 | 2 | 4 | ✓ |
| Citation Accuracy | 4.19 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.16 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.40 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.14 | 1 | 4 | ✓ |
| Critical Engagement | 3.21 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.97 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.75 | 1 | 3 | ✓ |
| Quote Economy | 4.15 | 1 | 3 | ✓ |
| Instruction Following | 4.94 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.52 | 0.5 | 3 | ✓ |
| No Hallucination | 4.99 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 4.76 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.60 | 10 |
| framing | 4.32 | 10 |
| lookup | 4.11 | 10 |
| reading | 4.70 | 5 |
| research | 4.32 | 73 |
| social | 4.73 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.11 |
| browsing | 3.60 |
| comparative | 4.24 |
| edge | 4.29 |
| factual | 4.30 |
| framing | 4.32 |
| multi | 4.29 |
| philosophical | 4.43 |
| reading | 4.70 |
| topical | 4.40 |

## Failure Diagnoses (worst first)

- **[64] browsing** (browsing) "What languages are available?" — overall=2.98
  Failed: citationPresence, citationAccuracy, quoteEconomy
  Diagnosis: The response lacks citations from the library, which is critical for supporting the claims made about the languages available. To improve, the assistant should include specific references or quotes from the library's content to substantiate the information provided.

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=3.22
  Failed: noHallucination, noGeneralKnowledge
  Diagnosis: The primary issue with this response is the inaccurate document count; the assistant stated 44,937 documents instead of the correct total of 7,900+. Additionally, the quote provided is not relevant to the user's query about the number of documents, which detracts from the overall effectiveness of the response. To improve, the assistant should ensure factual accuracy and provide quotes that directly relate to the user's question.

- **[77] edge** (research) "Udo Schafer" — overall=3.8
  Failed: criticalEngagement
  Diagnosis: The response lacks critical engagement with the user's query about Udo Schaefer, instead providing a broad overview of various religious texts without directly addressing Schaefer's contributions. To improve, the assistant should focus more on Schaefer's specific ideas and how they relate to Bahá'í ethics, while still incorporating relevant quotes from the texts mentioned.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.95
  Failed: instructionFollowing
  Diagnosis: The response lacks clarity and specificity due to the vague nature of the user's question. While it provides relevant Buddhist teachings, it could improve by directly addressing the ambiguity of the user's query and asking for clarification before diving into the topic. This would enhance critical engagement and instruction following.

- **[106] framing** (framing) "Bahá'u'lláh's teachings are pretty compatible with" — overall=4.07
  Failed: criticalEngagement
  Diagnosis: The response does a good job of engaging with the user's framing but could improve by more explicitly naming the limitations of equating Bahá'u'lláh's teachings with secular humanism. Additionally, while the quotes are relevant, the assistant could have integrated them more seamlessly into the argument to enhance clarity and flow.

- **[107] framing** (framing) "The Bahá'í Faith is basically a liberal religion t" — overall=4.1
  Failed: criticalEngagement
  Diagnosis: The response partially engages with the user's framing but does not critically address the term 'liberal religion' or the implications of 'modern progressive values.' To improve, it should clarify how Bahá'í principles differ from or align with these terms, using specific quotes to anchor the discussion more firmly in the tradition's vocabulary.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Critical Engagement | 3 | 3% |
| Citation Presence | 1 | 1% |
| Citation Accuracy | 1 | 1% |
| Quote Economy | 1 | 1% |
| No Hallucination | 1 | 1% |
| No General Knowledge / No Secular Drift | 1 | 1% |
| Instruction Following | 1 | 1% |

## Common Diagnosis Themes

`user's` (7x), `response` (6x), `assistant` (5x), `quotes` (5x), `improve,` (4x), `should` (4x), `lacks` (3x), `critical` (3x), `about` (3x), `specific` (3x)
