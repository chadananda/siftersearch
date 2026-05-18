# Jafar Quality Report — targeted-v2.80.33

> Generated: 2026-05-18T04:46:29.763Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 8 |
| Passed | **4 (50%)** |
| Failed | 4 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.13 | 1.5 | 4 | ✓ |
| Citation Presence | 3.63 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.75 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.63 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.88 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.75 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.75 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.38 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.63 | 1 | 3 | ✓ |
| Quote Economy | 3.63 | 1 | 3 | ✓ |
| Instruction Following | 4.38 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.50 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.25 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.68 | 1 |
| lookup | 3.86 | 3 |
| research | 3.87 | 4 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.86 |
| browsing | 3.68 |
| edge | 3.88 |
| multi | 3.51 |
| topical | 4.20 |

## Failure Diagnoses (worst first)

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.29
  Failed: citationAccuracy, logicalCoherence
  Diagnosis: The response lacks direct quotes from Rumi's works, which would enhance its authority and support the claims made about his themes. To improve, the assistant should include specific excerpts from the texts to illustrate Rumi's exploration of divine love and the soul's journey.

- **[98] multi** (research) "I'm a Christian interested in what other religions" — overall=3.51
  Failed: citationPresence, citationAccuracy, inlineQuoteIntegration
  Diagnosis: The response lacks specific quotes from the library to support its claims, which weakens its authority and citation presence. To improve, the assistant should include direct quotes from the retrieved texts to substantiate the interpretations of the return of Christ in Islam and the Bahá'í Faith.

- **[77] edge** (research) "Udo Schafer" — overall=3.88
  Failed: instructionFollowing
  Diagnosis: The response provides a good overview of various religious texts but lacks a direct focus on Udo Schaefer's specific contributions or works. To improve, it should include more relevant details about Schaefer himself and how his scholarship relates to the themes discussed in the quoted texts.

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.88
  Failed: topicCoverage, instructionFollowing
  Diagnosis: The response provides relevant Buddhist teachings but lacks clarity on the user's vague query. While it effectively uses quotes and integrates them well, it could improve by addressing the ambiguity of the user's question more directly and inviting further clarification. A more focused approach to the user's intent would enhance the overall engagement.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 2 | 25% |
| Instruction Following | 2 | 25% |
| Logical Coherence | 1 | 13% |
| Topic Coverage | 1 | 13% |
| Citation Presence | 1 | 13% |
| Inline Quote Integration | 1 | 13% |

## Common Diagnosis Themes

`response` (4x), `lacks` (4x), `quotes` (4x), `direct` (3x), `improve,` (3x), `should` (3x), `include` (3x), `specific` (3x), `texts` (3x), `user's` (3x)
