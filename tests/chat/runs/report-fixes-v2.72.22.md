# Jafar Quality Report — fixes-v2.72.22

> Generated: 2026-05-15T19:33:03.910Z
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
| Citation Presence | 4.00 | 2 | 4 | ✓ |
| Citation Accuracy | 4.00 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 3.50 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.50 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.50 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.50 | 1 | 3 | ✓ |
| Quote Economy | 4.00 | 1 | 3 | ✓ |
| Instruction Following | 4.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.29 | 1 |
| research | 3.98 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.29 |
| multi | 3.98 |

## Failure Diagnoses (worst first)

- **[31] author** (lookup) "Do you have works by Thich Nhat Hanh?" — overall=3.29
  Failed: toolUsage, topicCoverage, logicalCoherence, instructionFollowing
  Diagnosis: The primary issue with this response is the lack of tool usage, as it did not search for Thich Nhat Hanh's works despite the user specifically asking for them. To improve, the assistant should have conducted a search for Thich Nhat Hanh's works and provided relevant results or clarified the absence of such works based on the search results.

- **[97] multi** (research) "What Buddhist texts discuss mindfulness, and can y" — overall=3.98
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively identifies key Buddhist texts on mindfulness and provides relevant passages, but it could improve by integrating quotes more seamlessly into the narrative. Additionally, while it covers the topic well, it could engage more critically with the concept of mindfulness as presented in these texts, rather than just summarizing their content.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 1 | 50% |
| Topic Coverage | 1 | 50% |
| Logical Coherence | 1 | 50% |
| Instruction Following | 1 | 50% |
| Inline Quote Integration | 1 | 50% |

## Common Diagnosis Themes

`search` (3x), `works` (3x)
