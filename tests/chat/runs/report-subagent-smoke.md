# Jafar Quality Report — subagent-smoke

> Generated: 2026-04-30T02:07:28.309Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 8 |
| Passed | **5 (63%)** |
| Failed | 3 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.88 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.63 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.75 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.88 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.75 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.75 | 1 | 4 | **BELOW** (need 4) |
| Inline Quote Integration | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.75 | 1 | 3 | ✓ |
| Quote Economy | 3.63 | 1 | 3 | ✓ |
| Instruction Following | 3.88 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.50 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge | 5.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| reading | 3.45 | 5 |
| research | 4.80 | 3 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| factual | 4.92 |
| multi | 4.92 |
| reading | 3.45 |
| topical | 4.55 |

## Failure Diagnoses (worst first)

- **[73] reading** (reading) "What does the first chapter of the Quran say?" — overall=1.89
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy, instructionFollowing
  Diagnosis: The assistant failed to provide the actual text of the first chapter of the Quran, which was the user's request. Instead, it relied on general knowledge without quoting any specific passages from the library. To improve, the assistant should ensure it retrieves and presents the requested text directly from the library.

- **[75] reading** (reading) "Show me the first few paragraphs of the Tao Te Chi" — overall=2.16
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy, instructionFollowing, warmth
  Diagnosis: The assistant failed to provide any actual text from the Tao Te Ching, which is a critical part of the user's request. To improve, it should have searched more effectively for the document and provided the requested paragraphs if available, or clearly stated the absence of the text without suggesting alternative interpretations or commentaries.

- **[74] reading** (reading) "Read the opening verses of the Bhagavad Gita" — overall=3.37
  Failed: citationPresence, citationAccuracy, topicCoverage, logicalCoherence, inlineQuoteIntegration, instructionFollowing
  Diagnosis: The assistant did not provide the exact opening verses as requested, which is a critical failure in instruction following. To improve, it should have either found the specific verses or clearly stated that they were not available, while providing a relevant excerpt instead.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Presence | 3 | 38% |
| Citation Accuracy | 3 | 38% |
| Topic Coverage | 3 | 38% |
| Logical Coherence | 3 | 38% |
| Inline Quote Integration | 3 | 38% |
| Instruction Following | 3 | 38% |
| Tool Usage | 2 | 25% |
| Source Authority Hierarchy | 2 | 25% |
| Quote Economy | 2 | 25% |
| Warmth & Gravitas | 1 | 13% |

## Common Diagnosis Themes

`assistant` (4x), `provide` (3x), `which` (3x), `improve,` (3x), `should` (3x)
