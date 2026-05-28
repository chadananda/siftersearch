# Jafar Quality Report — check-33-35

> Generated: 2026-05-18T12:06:22.966Z
> Judge model: anthropic

## Summary

| Metric | Value |
|--------|-------|
| Total | 2 |
| Passed | **1 (50%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.50 | 1.5 | 4 | ✓ |
| Citation Presence | 4.00 | 2 | 4 | ✓ |
| Citation Accuracy | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 5.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.50 | 1.5 | 4 | ✓ |
| Logical Coherence | 3.50 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 4.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 4.00 | 2 | 4 | ✓ |
| Brevity | 4.50 | 1 | 3 | ✓ |
| Quote Economy | 4.00 | 1 | 3 | ✓ |
| Instruction Following | 4.50 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.50 | 0.5 | 3 | ✓ |
| No Hallucination | 3.00 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 5.00 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 4.05 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.05 |

## Failure Diagnoses (worst first)

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=3.27
  Failed: citationAccuracy, logicalCoherence, noHallucination
  Diagnosis: Critical hallucination: the quoted passage about religion as 'an impulse toward unity' is not from the Universal House of Justice and does not appear in the cited document (The Institution of the Mashriqu'l-Adhkár, which is by Bahá'u'lláh, not the UHJ). The URL structure suggests fabrication. This is an automatic noHallucination=1. The response correctly uses library_count and identifies 475 documents, but then invents a quote to pad the answer.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 50% |
| Logical Coherence | 1 | 50% |
| No Hallucination | 1 | 50% |
