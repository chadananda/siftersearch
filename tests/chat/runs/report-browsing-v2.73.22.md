# Jafar Quality Report — browsing-v2.73.22

> Generated: 2026-05-15T23:11:03.681Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 4 |
| Passed | **3 (75%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.50 | 1.5 | 4 | ✓ |
| Citation Presence | 3.00 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.25 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.75 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 3.50 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 2.00 | 1.5 | 3 | **BELOW** (need 3) |
| Inline Quote Integration | 2.75 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.25 | 1 | 3 | ✓ |
| Quote Economy | 3.00 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.25 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.25 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.53 | 4 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| browsing | 3.53 |

## Failure Diagnoses (worst first)

- **[66] browsing** (browsing) "What's the largest collection?" — overall=2.71
  Failed: citationPresence, citationAccuracy, quoteEconomy
  Diagnosis: The response lacks citations from the library, which is critical for supporting the claims made about the collections. Additionally, it does not provide specific quotes or references to the documents mentioned, which undermines the authority and accuracy of the information presented. To improve, the assistant should include direct quotes or references from the library to substantiate its claims.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Presence | 1 | 25% |
| Citation Accuracy | 1 | 25% |
| Quote Economy | 1 | 25% |
