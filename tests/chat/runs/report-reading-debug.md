# Jafar Quality Report — reading-debug

> Generated: 2026-05-15T13:21:08.169Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 2 |
| Passed | **0 (0%)** |
| Failed | 2 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 2.50 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 1.50 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.00 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.00 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 1.50 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.00 | 1 | 3 | ✓ |
| Quote Economy | 1.50 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 2.50 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 4.50 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 3.50 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| reading | 2.46 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| reading | 2.46 |

## Failure Diagnoses (worst first)

- **[72] reading** (reading) "Show me the beginning of the Kitáb-i-Íqán" — overall=2.07
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, quoteEconomy, instructionFollowing, warmth
  Diagnosis: The primary issue with this response is the failure to provide any actual text from the Kitáb-i-Íqán, despite the user requesting a reading of its beginning. The assistant should have used the reading mode to retrieve and present the text directly. To improve, it should ensure that it retrieves and shares the requested content when available.

- **[74] reading** (reading) "Read the opening verses of the Bhagavad Gita" — overall=2.85
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, inlineQuoteIntegration, quoteEconomy, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: The response lacks direct quotes from the Bhagavad Gita, which is essential for a reading request. To improve, the assistant should have used the reading mode to provide actual text from the document instead of summarizing the content. Additionally, the response could benefit from better integration of quotes to enhance engagement with the text.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 2 | 100% |
| Citation Presence | 2 | 100% |
| Citation Accuracy | 2 | 100% |
| Source Authority Hierarchy | 2 | 100% |
| Topic Coverage | 2 | 100% |
| Inline Quote Integration | 2 | 100% |
| Quote Economy | 2 | 100% |
| Instruction Following | 2 | 100% |
| Logical Coherence | 1 | 50% |
| Critical Engagement | 1 | 50% |
| Warmth & Gravitas | 1 | 50% |
| No Hallucination | 1 | 50% |
| No General Knowledge / No Secular Drift | 1 | 50% |

## Common Diagnosis Themes

`reading` (4x), `response` (3x), `should` (3x)
