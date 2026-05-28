# Jafar Quality Report — v2.82.20-spot

> Generated: 2026-05-18T10:35:41.591Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 5 |
| Passed | **1 (20%)** |
| Failed | 4 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.40 | 1.5 | 4 | ✓ |
| Citation Presence | 3.40 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.60 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 4.20 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.20 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 3.00 | 1 | 3 | ✓ |
| Instruction Following | 3.20 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.20 | 0.5 | 3 | ✓ |
| No Hallucination | 2.40 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 3.20 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 2.84 | 4 |
| reading | 4.80 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 2.84 |
| reading | 4.80 |

## Failure Diagnoses (worst first)

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=1.9
  Failed: citationAccuracy, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: The response hallucinated a quote ('the Ancient Beauty hath consented to be bound with chains') that does not appear in the actual search results. The user asked for 'everything'—a listing task—but the assistant added interpretive commentary about 'transformative power' and 'sacrifice' unsupported by library evidence. For a lookup query, a simple list of titles with brief descriptions would have been appropriate; instead, the assistant invented theological claims and false attributions, destroying credibility on the most basic dimension (noHallucination).

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=2.41
  Failed: citationAccuracy, topicCoverage, logicalCoherence, instructionFollowing, warmth, noHallucination, noGeneralKnowledge
  Diagnosis: Critical failure: The response hallucinated a quote ('an impulse toward unity, and an ideal making for a more enlightened civilization') that does not appear in the search results, and both document titles appear to be fabricated or incorrectly attributed. The user asked a simple lookup question ('what do you have?'), and the assistant should have listed actual UHJ documents available in the library — not invented titles and false attributions. The tool was used correctly (library_count), but the follow-up claims are entirely unsupported.

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=3.32
  Failed: topicCoverage, logicalCoherence, instructionFollowing, noHallucination
  Diagnosis: The response answers the lookup correctly (146 works) but fails the core instruction: the user asked 'What books do you have?' — a listing request — and received only 2 titles with unnecessary deep-dive commentary. For a lookup question, the user needs a browseable list or clear guidance on how to access it, not selected highlights. Brevity here means respecting the question type: acknowledge the count, offer a few example titles, then direct the user to search or browse.

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.73
  Failed: citationAccuracy, noHallucination, noGeneralKnowledge
  Diagnosis: Fatal flaw: the quoted passages cannot be verified as real text from The Masnavi. The citations include URLs with specific paragraph IDs (para_14, para_15), but without access to those actual search results, these appear to be hallucinated quotes — a direct violation of the core rule that quotes must come from verified search results. The assistant also imports general knowledge ('love and spiritual longing') without anchoring to retrieved text. While tool usage and integration are excellent, hallucination is disqualifying.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| No Hallucination | 4 | 80% |
| Citation Accuracy | 3 | 60% |
| No General Knowledge / No Secular Drift | 3 | 60% |
| Topic Coverage | 3 | 60% |
| Logical Coherence | 3 | 60% |
| Instruction Following | 3 | 60% |
| Inline Quote Integration | 1 | 20% |
| Quote Economy | 1 | 20% |
| Warmth & Gravitas | 1 | 20% |

## Common Diagnosis Themes

`search` (5x), `appear` (4x), `assistant` (4x), `lookup` (4x), `titles` (4x), `response` (3x), `hallucinated` (3x), `actual` (3x), `asked` (3x)
