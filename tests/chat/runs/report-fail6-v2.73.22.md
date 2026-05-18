# Jafar Quality Report — fail6-v2.73.22

> Generated: 2026-05-15T23:12:43.433Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 6 |
| Passed | **5 (83%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.83 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.83 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.83 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.67 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.83 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.83 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.83 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.33 | 1 | 3 | ✓ |
| Quote Economy | 3.50 | 1 | 3 | ✓ |
| Instruction Following | 4.50 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.50 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.50 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.89 | 2 |
| framing | 4.22 | 2 |
| research | 3.53 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 3.89 |
| edge | 3.53 |
| framing | 4.22 |

## Failure Diagnoses (worst first)

- **[80] edge** (research) "What about the thing with the stuff?" — overall=3.1
  Failed: toolUsage, citationPresence, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, instructionFollowing
  Diagnosis: The primary issue with this response is the lack of clarity and specificity in addressing the user's vague query. To improve, the assistant should have asked clarifying questions to better understand the user's intent before providing information, ensuring a more relevant and focused response.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 17% |
| Citation Presence | 1 | 17% |
| Topic Coverage | 1 | 17% |
| Logical Coherence | 1 | 17% |
| Critical Engagement | 1 | 17% |
| Inline Quote Integration | 1 | 17% |
| Instruction Following | 1 | 17% |
