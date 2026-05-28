# Jafar Quality Report — v2.82.7-spot

> Generated: 2026-05-18T10:03:15.545Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 1 |
| Passed | **0 (0%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.00 | 1.5 | 4 | ✓ |
| Citation Presence | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 1.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.00 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 1.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.00 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 1.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.00 | 1 | 3 | ✓ |
| Quote Economy | 1.00 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 2.00 | 0.5 | 3 | **BELOW** (need 3) |
| No Hallucination | 1.00 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 2.00 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 1.95 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 1.95 |

## Failure Diagnoses (worst first)

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=1.95
  Failed: citationAccuracy, logicalCoherence, inlineQuoteIntegration, quoteEconomy, instructionFollowing, warmth, noHallucination, noGeneralKnowledge
  Diagnosis: Critical hallucination: the quoted passage about 'Persians overthrowing Byzantines' does not appear in the search results and was fabricated. The response also introduces irrelevant historical commentary that doesn't answer the user's straightforward lookup request ('what books do you have'), violating instruction following and logical coherence. The three title claims are unverified against actual search results.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 100% |
| Logical Coherence | 1 | 100% |
| Inline Quote Integration | 1 | 100% |
| Quote Economy | 1 | 100% |
| Instruction Following | 1 | 100% |
| Warmth & Gravitas | 1 | 100% |
| No Hallucination | 1 | 100% |
| No General Knowledge / No Secular Drift | 1 | 100% |
