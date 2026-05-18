# Jafar Quality Report — post-deploy-check

> Generated: 2026-05-15T12:08:45.247Z
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
| Tool Usage | 4.00 | 1.5 | 4 | ✓ |
| Citation Presence | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.00 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.50 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 2.50 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.00 | 0.5 | 3 | ✓ |
| No Hallucination | 2.00 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 2.00 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| research | 2.54 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| factual | 2.54 |

## Failure Diagnoses (worst first)

- **[6] factual** (research) "What are the Five Pillars of Islam?" — overall=2.24
  Failed: citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, inlineQuoteIntegration, quoteEconomy, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: The assistant used the right tool (search) and identified four pillars correctly, but committed two critical failures: (1) It provided NO actual quoted text from the library—only hyperlinked topic labels without evidence that search results were read or integrated, and (2) It omitted the Fifth Pillar (Shahada—the declaration of faith), which is a glaring factual gap for a research question. The hyperlinks suggest results were retrieved but not actually quoted or fully processed.

- **[8] factual** (research) "What is the Eightfold Path in Buddhism?" — overall=2.85
  Failed: citationPresence, citationAccuracy, sourceAuthority, topicCoverage, inlineQuoteIntegration, noHallucination, noGeneralKnowledge
  Diagnosis: The response cites a single quoted list without substantive support for surrounding claims. The attribution is suspect (dhammapada_buddha as a source for Samyutta Nikaya material is questionable), and key assertions—the 'goal of freeing individuals from attachments,' the 'Middle Way' connection, the 'Four Noble Truths' framing—rest entirely on general knowledge, not on retrieved text. For a research question, this needs either (a) direct quotes anchoring each major claim, or (b) acknowledgment that the library's coverage of this topic is limited.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Presence | 2 | 100% |
| Citation Accuracy | 2 | 100% |
| Source Authority Hierarchy | 2 | 100% |
| Topic Coverage | 2 | 100% |
| Inline Quote Integration | 2 | 100% |
| No Hallucination | 2 | 100% |
| No General Knowledge / No Secular Drift | 2 | 100% |
| Logical Coherence | 1 | 50% |
| Quote Economy | 1 | 50% |
| Instruction Following | 1 | 50% |

## Common Diagnosis Themes

`quoted` (3x)
