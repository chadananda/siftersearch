# Jafar Quality Report — v2.82.22-spot

> Generated: 2026-05-18T10:44:33.228Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 4 |
| Passed | **0 (0%)** |
| Failed | 4 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.50 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 2.75 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 1.50 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 2.50 | 1.5 | 3 | **BELOW** (need 3) |
| Topic Coverage | 2.50 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 2.75 | 1 | 4 | **BELOW** (need 4) |
| Critical Engagement | 3.00 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 2.75 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.75 | 1 | 3 | ✓ |
| Quote Economy | 3.00 | 1 | 3 | ✓ |
| Instruction Following | 2.75 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.25 | 0.5 | 3 | ✓ |
| No Hallucination | 1.50 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 2.50 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 2.60 | 4 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 2.60 |

## Failure Diagnoses (worst first)

- **[30] author** (lookup) "What books by Moojan Momen do you have?" — overall=1.93
  Failed: toolUsage, citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: The response conflates authorship: Moojan Momen is the translator/editor of 'Abdu'l-Bahá's Commentary, not its author. The user asked for books *by* Momen, but this answer lists a work by 'Abdu'l-Bahá edited by Momen. The quoted text is unverified (the link format appears fabricated). A proper answer would list actual works authored or primarily authored by Momen (his studies, monographs, edited collections) rather than describing one secondary source with an unverified quote.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=2
  Failed: citationAccuracy, sourceAuthority, topicCoverage, logicalCoherence, instructionFollowing, warmth, noHallucination, noGeneralKnowledge
  Diagnosis: The response contains hallucinated quotes falsely attributed to UHJ documents. The first quote ('any House raised in towns or villages...') is from Bahá'u'lláh's writings, not the UHJ. The second quote ('a spirit of brotherhood...') cannot be verified in search results. For a lookup question, the user asked what documents exist by the UHJ — the appropriate response is a curated list of titles with brief descriptions, not topical interpretation with invented quotes. The assistant also strayed into secular reframing ('spirit of brotherhood, impulse toward unity') without grounding in the actual source material.

- **[32] author** (lookup) "Show me everything by Bahá'u'lláh" — overall=2.76
  Failed: citationAccuracy, topicCoverage, logicalCoherence, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: The response misses the core ask. The user said 'show me everything' — they wanted a comprehensive list, not a curated summary of three notable works. The quoted passage ('The source of all good is trust in God') cannot be verified as appearing in The Hidden Words and may be hallucinated or misattributed. For a lookup task asking for 'everything,' the assistant should have delivered a fuller catalog (or at minimum acknowledged the 522-document scope and offered to drill deeper) rather than filtering to 'notable works.'

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.71
  Failed: citationAccuracy, noHallucination, noGeneralKnowledge
  Diagnosis: The response is well-structured and warm, but the quote accuracy is suspect. The hyperlink points to a real-seeming URL with a specific paraId, which suggests the assistant may be fabricating the exact citation location rather than drawing from actual search results. For a lookup query, this is acceptable brevity and tone, but the citation needs verification — if that quote wasn't in the actual search results with that specific location, it's a hallucination. Additionally, the closing sentence ('This reflects the depth...') is mild general-knowledge commentary that adds padding without new information.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Accuracy | 4 | 100% |
| No Hallucination | 4 | 100% |
| No General Knowledge / No Secular Drift | 4 | 100% |
| Topic Coverage | 3 | 75% |
| Logical Coherence | 3 | 75% |
| Instruction Following | 3 | 75% |
| Source Authority Hierarchy | 2 | 50% |
| Tool Usage | 1 | 25% |
| Warmth & Gravitas | 1 | 25% |

## Common Diagnosis Themes

`response` (5x), `actual` (4x), `quote` (4x), `rather` (3x), `source` (3x), `search` (3x), `lookup` (3x), `assistant` (3x)
