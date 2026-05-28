# Jafar Quality Report — v2.82.10-spot

> Generated: 2026-05-18T10:11:07.950Z
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
| Source Authority Hierarchy | 1.00 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 1.00 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 2.00 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.00 | 1 | 3 | ✓ |
| Quote Economy | 1.00 | 1 | 3 | **BELOW** (need 3) |
| Instruction Following | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 2.00 | 0.5 | 3 | **BELOW** (need 3) |
| No Hallucination | 1.00 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 2.00 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 2.05 | 1 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 2.05 |

## Failure Diagnoses (worst first)

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=2.05
  Failed: citationAccuracy, sourceAuthority, logicalCoherence, quoteEconomy, instructionFollowing, warmth, noHallucination, noGeneralKnowledge
  Diagnosis: Critical hallucination: the quoted passage appears fabricated or severely misattributed—the URL claims it's from 'Abdul-Bahá's commentary but the quote about Persian-Byzantine conflict has no clear connection to Momen's work or the user's simple lookup question. The response also invents or misrepresents book titles ('Mazhar-i Ilahi' is not a work by Momen in standard Bahá'í library catalogs) and abandons the straightforward lookup request by inserting an irrelevant historical quote that doesn't answer what the user asked. Fix: use library_count to return the accurate number, then list actual Momen titles from search results without fabrication or tangential content.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 1 | 100% |
| Source Authority Hierarchy | 1 | 100% |
| Logical Coherence | 1 | 100% |
| Quote Economy | 1 | 100% |
| Instruction Following | 1 | 100% |
| Warmth & Gravitas | 1 | 100% |
| No Hallucination | 1 | 100% |
| No General Knowledge / No Secular Drift | 1 | 100% |
