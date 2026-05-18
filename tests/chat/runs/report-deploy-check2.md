# Jafar Quality Report — deploy-check2

> Generated: 2026-05-15T12:08:13.601Z
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
| Tool Usage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 2.50 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.50 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.50 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.50 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.50 | 1 | 3 | ✓ |
| Quote Economy | 3.00 | 1 | 3 | ✓ |
| Instruction Following | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 2.50 | 0.5 | 3 | **BELOW** (need 3) |
| No Hallucination | 2.00 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 2.00 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| research | 2.92 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| factual | 2.92 |

## Failure Diagnoses (worst first)

- **[6] factual** (research) "What are the Five Pillars of Islam?" — overall=2.39
  Failed: toolUsage, citationPresence, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, criticalEngagement, inlineQuoteIntegration, quoteEconomy, instructionFollowing, warmth, noHallucination, noGeneralKnowledge
  Diagnosis: The response conflates fragmentary commentary (washings, alms, fasting, pilgrimage) with the Five Pillars themselves, creating a misleading structure. It omits *shahādah* (testimony of faith) from the inline citations, relegating it to unsourced prose, and the quoted fragments don't actually articulate the Five Pillars as a coherent Islamic doctrine — they're scattered observations. The assistant needed to search for primary Islamic sources (Qur'an, Hadith) that explicitly enumerate the Five Pillars, not scraps from a Qur'anic commentary that happen to mention related practices. The result reads like general knowledge wrapped in false citations rather than library-grounded scholarship.

- **[8] factual** (research) "What is the Eightfold Path in Buddhism?" — overall=3.46
  Failed: citationAccuracy, topicCoverage, noHallucination, noGeneralKnowledge
  Diagnosis: The response integrates quotes smoothly and demonstrates appropriate tool usage, but contains a critical accuracy problem: both citations point to the same URL (dhammapada_buddha), yet the first quote about 'noble truth of the way of practice' does not appear in standard Dhammapada texts—it's a paraphrase of Samyutta Nikaya language that wasn't actually retrieved. Additionally, the opening claim about 'freeing from attachments and delusions' and the closing reference to the Four Noble Truths framework are unsupported by the search results shown, suggesting general-knowledge supplementation. A rigorous response would either retrieve and quote the actual source directly, or acknowledge when the phrasing is a paraphrase rather than a direct quote.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 2 | 100% |
| Topic Coverage | 2 | 100% |
| No Hallucination | 2 | 100% |
| No General Knowledge / No Secular Drift | 2 | 100% |
| Tool Usage | 1 | 50% |
| Citation Presence | 1 | 50% |
| Source Authority Hierarchy | 1 | 50% |
| Logical Coherence | 1 | 50% |
| Critical Engagement | 1 | 50% |
| Inline Quote Integration | 1 | 50% |
| Quote Economy | 1 | 50% |
| Instruction Following | 1 | 50% |
| Warmth & Gravitas | 1 | 50% |

## Common Diagnosis Themes

`response` (3x)
