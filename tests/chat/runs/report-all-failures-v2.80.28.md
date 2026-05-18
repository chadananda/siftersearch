# Jafar Quality Report — all-failures-v2.80.28

> Generated: 2026-05-18T04:04:01.321Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 9 |
| Passed | **5 (56%)** |
| Failed | 4 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.00 | 1.5 | 4 | ✓ |
| Citation Presence | 3.89 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 4.00 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.11 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.89 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 4.11 | 1 | 4 | ✓ |
| Critical Engagement | 3.11 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.89 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.78 | 1 | 3 | ✓ |
| Quote Economy | 4.00 | 1 | 3 | ✓ |
| Instruction Following | 4.89 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.33 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.33 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| framing | 4.10 | 1 |
| lookup | 3.91 | 4 |
| reading | 4.85 | 1 |
| research | 4.04 | 3 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.91 |
| edge | 4.01 |
| framing | 4.10 |
| reading | 4.85 |
| topical | 4.10 |

## Failure Diagnoses (worst first)

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.49
  Failed: citationAccuracy
  Diagnosis: The response lacks direct quotes from Rumi's works, which would strengthen the claims made about his themes. To improve, the assistant should include specific excerpts from the documents found in the library to provide a more authoritative and engaging answer.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=4
  Failed: topicCoverage
  Diagnosis: The response provides a solid overview of Buddhist teachings on suffering, but it lacks clarity on the user's vague query. It could improve by directly addressing the ambiguity of 'the thing with the stuff' and asking for clarification. Additionally, while the citations are relevant, the response could benefit from a more authoritative source hierarchy.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=4.07
  Failed: toolUsage
  Diagnosis: The response provides a solid overview of the documents by the Universal House of Justice, but it could improve by integrating a more specific quote from one of the documents to enhance citation presence and accuracy. Additionally, while the assistant engages with the user's query well, it could better address the significance of the works mentioned to provide deeper insight.

- **[106] framing** (framing) "Bahá'u'lláh's teachings are pretty compatible with" — overall=4.1
  Failed: criticalEngagement
  Diagnosis: The response partially engages with the user's framing but could improve by more critically addressing the implications of equating Bahá'u'lláh's teachings with secular humanism. It should clarify the distinctions between the two more explicitly, especially regarding the spiritual dimensions of Bahá'u'lláh's teachings that secular humanism lacks.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 11% |
| Tool Usage | 1 | 11% |
| Topic Coverage | 1 | 11% |
| Critical Engagement | 1 | 11% |

## Common Diagnosis Themes

`response` (5x), `could` (5x), `documents` (3x), `teachings` (3x), `user's` (3x), `improve` (3x)
