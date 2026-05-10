# Jafar Quality Report — smoke-inlinequote

> Generated: 2026-04-30T00:26:20.715Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 3 |
| Passed | **0 (0%)** |
| Failed | 3 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 1.00 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.67 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.33 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.67 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.67 | 1 | 4 | **BELOW** (need 4) |
| Inline Quote Integration | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.33 | 1 | 3 | ✓ |
| Quote Economy | 3.00 | 1 | 3 | ✓ |
| Instruction Following | 2.67 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 3.67 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge | 3.67 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| research | 3.14 | 3 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| factual | 3.61 |
| multi | 4.08 |
| topical | 1.74 |

## Failure Diagnoses (worst first)

- **[45] topical** (research) "Find passages about love in the Bahá'í writings" — overall=1.74
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: The assistant did not use the library tools at all, relying solely on general knowledge, which is a critical error. Additionally, the quotes provided are not verified as real from the library, leading to hallucination issues. To improve, the assistant should perform a search for relevant passages in the Bahá'í writings using the appropriate tools.

- **[7] factual** (research) "What did Bahá'u'lláh teach about the oneness of hu" — overall=3.61
  Failed: toolUsage, inlineQuoteIntegration, instructionFollowing
  Diagnosis: The primary issue with this response is the lack of tool usage; it did not search the library for relevant content, relying instead on general knowledge. To improve, the assistant should have conducted a search to provide accurate quotes directly from Bahá'u'lláh's writings on the oneness of humanity.

- **[95] multi** (research) "What does Bahá'u'lláh say about justice, and where" — overall=4.08
  Failed: toolUsage
  Diagnosis: The primary issue with this response is the lack of tool usage; it did not search the library for relevant documents, which is essential for a research query. To improve, the assistant should have conducted a search to provide more accurate and comprehensive citations from the library.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 3 | 100% |
| Inline Quote Integration | 2 | 67% |
| Instruction Following | 2 | 67% |
| Citation Presence | 1 | 33% |
| Citation Accuracy | 1 | 33% |
| Source Authority Hierarchy | 1 | 33% |
| Topic Coverage | 1 | 33% |
| Logical Coherence | 1 | 33% |
| Quote Economy | 1 | 33% |
| No Hallucination | 1 | 33% |
| No General Knowledge | 1 | 33% |

## Common Diagnosis Themes

`search` (5x), `assistant` (4x), `library` (3x), `improve,` (3x), `should` (3x), `relevant` (3x)
