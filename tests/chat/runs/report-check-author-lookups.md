# Jafar Quality Report — check-author-lookups

> Generated: 2026-05-18T12:09:54.871Z
> Judge model: anthropic

## Summary

| Metric | Value |
|--------|-------|
| Total | 6 |
| Passed | **0 (0%)** |
| Failed | 5 |
| Errors | 1 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 3.00 | 1.5 | 4 | **BELOW** (need 4) |
| Citation Presence | 4.40 | 2 | 4 | ✓ |
| Citation Accuracy | 2.40 | 2 | 4 | **BELOW** (need 4) |
| Source Authority Hierarchy | 4.40 | 1.5 | 3 | ✓ |
| Topic Coverage | 3.20 | 1.5 | 4 | **BELOW** (need 4) |
| Logical Coherence | 4.00 | 1 | 4 | ✓ |
| Critical Engagement | 3.40 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 4.40 | 2 | 4 | ✓ |
| Brevity | 4.40 | 1 | 3 | ✓ |
| Quote Economy | 4.40 | 1 | 3 | ✓ |
| Instruction Following | 3.60 | 1.5 | 4 | **BELOW** (need 4) |
| Warmth & Gravitas | 3.60 | 0.5 | 3 | ✓ |
| No Hallucination | 2.20 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 3.00 | 1.5 | 4 | **BELOW** (need 4) |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| lookup | 3.53 | 6 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 3.53 |

## Failure Diagnoses (worst first)

- **[27] author** (lookup) "What works by 'Abdu'l-Bahá are in the library?" — overall=2.56
  Failed: toolUsage, citationAccuracy, topicCoverage, logicalCoherence, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: The response misses the core instruction (LOOKUP type: list works available). Instead of providing a catalog-style listing of 'Abdu'l-Bahá titles in the library, it cherry-picks three works and adds interpretive commentary—padding with general knowledge about what these texts 'highlight' rather than simply answering 'what works are available.' The fake URLs and unverified quotes further undermine trust. The correct answer should use deep_research with author filter and systematically list the titles returned, without invention.

- **[29] author** (lookup) "Do you have anything by Rumi?" — overall=3.34
  Failed: citationAccuracy, noHallucination, noGeneralKnowledge
  Diagnosis: CRITICAL FAILURE: The assistant hallucinated a quote. The attribution URL format and the specific phrasing 'love is the astrolabe of God's mysteries' cannot be verified as real text from the actual search results — this is a fabricated quote presented as evidence, which is an automatic noHallucination=1. For a lookup query, simply listing the 3 works by title would have been sufficient and correct; adding unsupported claims about Rumi's themes pushed the response into unwarranted citation territory. The response is otherwise well-structured for a lookup task, but the fabrication is disqualifying.

- **[34] author** (lookup) "Do you have any books by Adib Taherzadeh?" — overall=3.71
  Failed: toolUsage, citationAccuracy, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: Tool choice was suboptimal (library_count returns aggregate counts, not title listings) and the response drifts into general-knowledge characterization of the works instead of sticking to what the library catalog actually shows. For a lookup query, use 'search' mode with author filter to retrieve the actual titles with metadata, or use 'library_overview' if you need aggregate stats. The three titles mentioned may or may not be accurate — the tool used doesn't verify them.

- **[28] author** (lookup) "Show me books by Shoghi Effendi" — overall=3.9
  Failed: toolUsage, instructionFollowing, noHallucination, noGeneralKnowledge
  Diagnosis: Tool usage is suboptimal: library_count returns a count, not a list. The assistant should have used library_search with filters (author='Shoghi Effendi') to retrieve and display actual titles from the catalog. The three titles cited appear reasonable but lack verification from actual search results, and the response doesn't show the full range of 69 works the user asked to see. For a lookup request, the user expects either a complete list or at least a representative sampling with confidence that the titles are real catalog entries.

- **[33] author** (lookup) "What do you have by the Universal House of Justice" — overall=4.13
  Failed: citationAccuracy, logicalCoherence, noHallucination
  Diagnosis: The response correctly uses library_count for a catalog-lookup query and reports the accurate figure (475 documents). However, the hyperlink attribution is false: *The Institution of the Mashriqu'l-Adhkár* is attributed to Bahá'u'lláh in the URL, but the UHJ wrote about this institution. The assistant has either hallucinated the link or misattributed authorship without verifying against search results. For a browsing query like this, the core task is fulfilled (cite the count, name a few works), but fabricating source attributions damages credibility.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| No Hallucination | 5 | 83% |
| Citation Accuracy | 4 | 67% |
| No General Knowledge / No Secular Drift | 4 | 67% |
| Tool Usage | 3 | 50% |
| Instruction Following | 3 | 50% |
| Logical Coherence | 2 | 33% |
| Topic Coverage | 1 | 17% |
| error | 1 | 17% |

## Common Diagnosis Themes

`titles` (7x), `response` (6x), `works` (6x), `actual` (4x), `lookup` (4x), `three` (3x), `about` (3x), `assistant` (3x), `search` (3x)
