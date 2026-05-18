# Jafar Quality Report — remaining-v2.73.10

> Generated: 2026-05-15T22:25:07.289Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 5 |
| Passed | **3 (60%)** |
| Failed | 2 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.00 | 1.5 | 4 | ✓ |
| Citation Presence | 3.60 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.40 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.60 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.80 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.60 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.80 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.60 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 3.60 | 1 | 3 | ✓ |
| Instruction Following | 4.60 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 4.80 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 4.20 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| reading | 4.22 | 1 |
| research | 3.70 | 4 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| factual | 3.60 |
| multi | 3.39 |
| reading | 4.22 |
| topical | 4.22 |

## Failure Diagnoses (worst first)

- **[5] factual** (research) "What is the Hindu concept of dharma?" — overall=3.12
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, noHallucination, noGeneralKnowledge
  Diagnosis: The response lacks accurate citations, as the quote from the *Bhagavad Gita* is misattributed to the *Atharva Veda*. Additionally, it does not fully engage with the complexities of dharma, such as its variations across different contexts and texts. To improve, the assistant should ensure accurate citations and provide a more comprehensive overview of dharma's significance in Hinduism.

- **[99] multi** (research) "Search for passages about the covenant in both the" — overall=3.39
  Failed: toolUsage, citationPresence, citationAccuracy, topicCoverage, logicalCoherence, inlineQuoteIntegration
  Diagnosis: The response lacks sufficient direct quotes from the search results, particularly for the Jewish perspective on the covenant, which weakens the overall argument. To improve, the assistant should include more specific passages from the library that directly address the covenant in both traditions.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Presence | 2 | 40% |
| Citation Accuracy | 2 | 40% |
| Topic Coverage | 2 | 40% |
| Logical Coherence | 2 | 40% |
| Inline Quote Integration | 2 | 40% |
| Critical Engagement | 1 | 20% |
| No Hallucination | 1 | 20% |
| No General Knowledge / No Secular Drift | 1 | 20% |
| Tool Usage | 1 | 20% |
