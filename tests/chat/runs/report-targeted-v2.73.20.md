# Jafar Quality Report — targeted-v2.73.20

> Generated: 2026-05-15T23:06:38.835Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 15 |
| Passed | **11 (73%)** |
| Failed | 4 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.33 | 1.5 | 4 | ✓ |
| Citation Presence | 3.93 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.80 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.67 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.20 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.07 | 1 | 4 | ✓ |
| Critical Engagement | 2.93 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.67 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.80 | 1 | 3 | ✓ |
| Quote Economy | 4.00 | 1 | 3 | ✓ |
| Instruction Following | 4.87 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.33 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.73 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.40 | 2 |
| reading | 4.07 | 1 |
| research | 4.18 | 12 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 3.40 |
| comparative | 4.37 |
| edge | 4.24 |
| factual | 4.04 |
| multi | 4.22 |
| philosophical | 4.22 |
| reading | 4.07 |
| topical | 4.15 |

## Failure Diagnoses (worst first)

- **[64] browsing** (browsing) "What languages are available?" — overall=3.2
  Failed: citationPresence, citationAccuracy
  Diagnosis: The response lacks citations from the library, which is critical for a browsing question. While it provides a comprehensive list of languages, it should have included a reference to the source of this information to enhance credibility and authority.

- **[44] topical** (research) "What do the texts say about the soul?" — overall=3.88
  Failed: citationAccuracy, inlineQuoteIntegration
  Diagnosis: The response provides a broad overview of the concept of the soul across various religions, but it lacks precise citations for some claims, particularly regarding the Bahá'í Faith and Islam. To improve, it should ensure that all quotes are accurately attributed and directly support the claims made, enhancing citation accuracy and inline integration.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.88
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response lacks clarity due to the vague nature of the user's question, which could have been addressed more directly. Additionally, while the assistant provides relevant Buddhist teachings, it could have engaged more critically with the user's imprecise framing and asked for clarification instead of assuming a specific topic.

- **[74] reading** (reading) "Read the opening verses of the Bhagavad Gita" — overall=4.07
  Failed: topicCoverage
  Diagnosis: The response effectively uses a quote from the Bhagavad Gita and provides context, but it could improve by including more direct quotes from the opening verses rather than summarizing the content. Additionally, while the emotional turmoil is acknowledged, a more critical engagement with the text's themes would enhance the depth of the response.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 2 | 13% |
| Topic Coverage | 2 | 13% |
| Inline Quote Integration | 1 | 7% |
| Citation Presence | 1 | 7% |
| Instruction Following | 1 | 7% |

## Common Diagnosis Themes

`response` (4x), `provides` (4x), `lacks` (3x), `while` (3x), `could` (3x)
