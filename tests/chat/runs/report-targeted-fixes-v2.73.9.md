# Jafar Quality Report — targeted-fixes-v2.73.9

> Generated: 2026-05-15T22:20:33.343Z
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
| Tool Usage | 4.25 | 1.5 | 4 | ✓ |
| Citation Presence | 3.75 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 3.50 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 3.75 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.00 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.00 | 1 | 4 | ✓ |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.75 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.00 | 1 | 3 | ✓ |
| Quote Economy | 3.75 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.25 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.75 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| research | 4.03 | 4 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| edge | 4.19 |
| factual | 3.56 |
| topical | 4.17 |

## Failure Diagnoses (worst first)

- **[5] factual** (research) "What is the Hindu concept of dharma?" — overall=3.56
  Failed: citationPresence, citationAccuracy, inlineQuoteIntegration
  Diagnosis: The primary issue with this response is the citation accuracy; the quote provided is misattributed to the *Bhagavad Gita* but links to the *Atharva Veda*. To improve, the assistant should ensure that quotes are accurately attributed to their correct sources and provide more direct quotes from the *Bhagavad Gita* to support the explanation of dharma.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Presence | 1 | 25% |
| Citation Accuracy | 1 | 25% |
| Inline Quote Integration | 1 | 25% |
