# Jafar Quality Report — fix-bahai-full

> Generated: 2026-05-16T00:32:39.315Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 9 |
| Passed | **8 (89%)** |
| Failed | 1 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.33 | 1.5 | 4 | ✓ |
| Citation Presence | 4.33 | 2 | 4 | ✓ |
| Citation Accuracy | 4.11 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.00 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.33 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.11 | 1 | 4 | ✓ |
| Critical Engagement | 3.11 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.89 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.89 | 1 | 3 | ✓ |
| Quote Economy | 4.11 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.33 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.89 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| reading | 4.24 | 1 |
| research | 4.24 | 8 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| edge | 4.10 |
| factual | 4.36 |
| multi | 4.22 |
| philosophical | 4.22 |
| reading | 4.24 |
| topical | 4.29 |

## Failure Diagnoses (worst first)

- **[87] edge** (research) "Is the Bahá'í Faith a cult?" — overall=4.05
  Failed: inlineQuoteIntegration
  Diagnosis: The response effectively uses the library to support its claims, but it could improve in critical engagement by addressing the loaded term 'cult' more directly and exploring the implications of that label. Additionally, while the citations are relevant, integrating them more fluidly into the text would enhance the overall coherence and argumentative strength.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Inline Quote Integration | 1 | 11% |
