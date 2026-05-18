# Jafar Quality Report — post-session-fixes

> Generated: 2026-05-18T03:01:31.920Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 110 |
| Passed | **87 (79%)** |
| Failed | 4 |
| Errors | 19 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.40 | 1.5 | 4 | ✓ |
| Citation Presence | 4.37 | 2 | 4 | ✓ |
| Citation Accuracy | 4.25 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.26 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.49 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.11 | 1 | 4 | ✓ |
| Critical Engagement | 3.36 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.92 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.74 | 1 | 3 | ✓ |
| Quote Economy | 4.19 | 1 | 3 | ✓ |
| Instruction Following | 4.98 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.57 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.81 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 4.49 | 10 |
| framing | 4.28 | 10 |
| lookup | 4.14 | 10 |
| reading | N/A | 5 |
| research | 4.34 | 73 |
| social | 4.29 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.14 |
| browsing | 4.49 |
| comparative | 4.31 |
| edge | 4.23 |
| factual | 4.42 |
| framing | 4.28 |
| multi | 4.19 |
| philosophical | 4.49 |
| reading | N/A |
| topical | 4.33 |

## Failure Diagnoses (worst first)

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=3.27
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks direct quotes from the library, which diminishes its authority and support for the claims made. To improve, the assistant should include specific excerpts from Bahá'u'lláh's writings to substantiate its statements and enhance the overall quality of the response.

- **[81] edge** (research) "Tell me everything about Buddhism" — overall=3.88
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response provides a good overview of Buddhism but lacks comprehensive coverage of key aspects such as the Four Noble Truths, the Eightfold Path, and the various schools of Buddhism. To improve, it should include a broader range of teachings and concepts while ensuring all claims are well-supported by quotes from the library.

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=3.98
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively covers the topic of the covenant in both the Bahá'í Faith and Judaism, but it could improve in critical engagement by addressing the nuances of the term 'covenant' in each tradition more explicitly. Additionally, while the citations are mostly accurate, integrating quotes more seamlessly into the narrative would enhance the overall flow and engagement with the text.

- **[106] framing** (framing) "Bahá'u'lláh's teachings are pretty compatible with" — overall=4.05
  Failed: criticalEngagement
  Diagnosis: The response partially engages critically with the user's framing but could do better by explicitly addressing the limitations of equating Bahá'u'lláh's teachings with secular humanism. Additionally, while the quotes are well-integrated, the response could be more concise to enhance clarity and impact.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| error | 19 | 17% |
| Inline Quote Integration | 2 | 2% |
| Citation Accuracy | 1 | 1% |
| Logical Coherence | 1 | 1% |
| Topic Coverage | 1 | 1% |
| Instruction Following | 1 | 1% |
| Critical Engagement | 1 | 1% |

## Common Diagnosis Themes

`response` (5x), `quotes` (4x), `enhance` (3x), `while` (3x), `could` (3x)
