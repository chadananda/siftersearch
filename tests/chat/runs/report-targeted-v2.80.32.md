# Jafar Quality Report — targeted-v2.80.32

> Generated: 2026-05-18T04:41:47.736Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 11 |
| Passed | **8 (73%)** |
| Failed | 3 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.09 | 1.5 | 4 | ✓ |
| Citation Presence | 3.82 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.82 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.73 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.82 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.73 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.73 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.64 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.73 | 1 | 3 | ✓ |
| Quote Economy | 3.73 | 1 | 3 | ✓ |
| Instruction Following | 4.82 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.27 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.45 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.59 | 1 |
| lookup | 3.80 | 4 |
| research | 4.10 | 6 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.80 |
| browsing | 3.59 |
| edge | 3.95 |
| multi | 4.13 |
| topical | 4.29 |

## Failure Diagnoses (worst first)

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.37
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response provides some useful information about Rumi but lacks direct quotes from his works, which would enhance citation presence and accuracy. To improve, the assistant should include specific excerpts from Rumi's writings to better illustrate his contributions and insights.

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.54
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks specific titles of Moojan Momen's works, which would enhance citation presence and accuracy. Additionally, the quote from Bahá’u’lláh does not directly support the claims about Momen's themes, leading to a weaker integration of quotes. Focusing on providing more precise titles and relevant quotes would improve the response significantly.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.88
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response lacks clarity due to the vague nature of the user's question, which could have been addressed more directly. Additionally, while the assistant provides relevant Buddhist concepts, it could improve by explicitly connecting them to the user's query and asking for clarification on what 'the thing with the stuff' refers to, enhancing critical engagement.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 2 | 18% |
| Logical Coherence | 2 | 18% |
| Topic Coverage | 1 | 9% |
| Instruction Following | 1 | 9% |

## Common Diagnosis Themes

`response` (4x), `lacks` (3x), `which` (3x), `would` (3x)
