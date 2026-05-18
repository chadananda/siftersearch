# Jafar Quality Report — spot-failures

> Generated: 2026-05-18T07:53:28.341Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 10 |
| Passed | **5 (50%)** |
| Failed | 5 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.10 | 1.5 | 4 | ✓ |
| Citation Presence | 3.90 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 4.00 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.80 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 4.00 | 1 | 4 | ✓ |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.80 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.90 | 1 | 3 | ✓ |
| Quote Economy | 4.00 | 1 | 3 | ✓ |
| Instruction Following | 4.90 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.40 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.30 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| framing | 4.10 | 1 |
| lookup | 3.20 | 1 |
| reading | 4.07 | 1 |
| research | 4.17 | 7 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.20 |
| edge | 4.02 |
| factual | 4.46 |
| framing | 4.10 |
| multi | 4.07 |
| reading | 4.07 |
| topical | 4.15 |

## Failure Diagnoses (worst first)

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.2
  Failed: citationAccuracy, logicalCoherence, noGeneralKnowledge
  Diagnosis: The response lacks sufficient citations from the library, as it only mentions titles without quoting or providing specific details about them. To improve, the assistant should include direct quotes or summaries from the works to enhance citation presence and accuracy.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.95
  Failed: topicCoverage
  Diagnosis: The response lacks clarity due to the vague nature of the user's question, which could have been addressed more directly. To improve, the assistant should have asked for clarification on the specific topic of interest while still providing relevant information about craving in Buddhism.

- **[87] edge** (research) "Is the Bahá'í Faith a cult?" — overall=4
  Failed: topicCoverage
  Diagnosis: The response provides a solid defense against the cult label but lacks a critical engagement with the user's framing of the question. It could improve by addressing the term 'cult' more directly and exploring the nuances of the Bahá'í Faith's structure in relation to common cult characteristics. Additionally, while the citations are relevant, a more authoritative source could enhance the argument.

- **[75] reading** (reading) "Show me the first few paragraphs of the Tao Te Chi" — overall=4.07
  Failed: topicCoverage
  Diagnosis: The response effectively provides quotes from the *Tao Te Ching*, but it lacks a complete reading of the first few paragraphs as requested. To improve, the assistant should include more text from the beginning of the document to fully satisfy the user's request.

- **[107] framing** (framing) "The Bahá'í Faith is basically a liberal religion t" — overall=4.1
  Failed: criticalEngagement
  Diagnosis: The response partially engages critically with the user's framing but could do better by explicitly addressing the limitations of labeling the Bahá'í Faith as merely 'liberal' or 'progressive.' Strengthening the critical engagement by clarifying the unique aspects of the Faith would enhance the response.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Topic Coverage | 3 | 30% |
| Citation Accuracy | 1 | 10% |
| Logical Coherence | 1 | 10% |
| No General Knowledge / No Secular Drift | 1 | 10% |
| Critical Engagement | 1 | 10% |

## Common Diagnosis Themes

`response` (5x), `lacks` (4x), `user's` (4x), `could` (4x), `improve,` (3x), `assistant` (3x), `should` (3x), `enhance` (3x)
