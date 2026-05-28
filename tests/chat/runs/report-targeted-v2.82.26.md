# Jafar Quality Report — targeted-v2.82.26

> Generated: 2026-05-18T11:34:23.587Z
> Judge model: anthropic

## Summary

| Metric | Value |
|--------|-------|
| Total | 6 |
| Passed | **3 (50%)** |
| Failed | 3 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.67 | 1.5 | 4 | ✓ |
| Citation Presence | 3.33 | 2 | 4 | **BELOW** (need 4) |
| Citation Accuracy | 4.33 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.50 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.83 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.50 | 1 | 4 | ✓ |
| Critical Engagement | 4.33 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.83 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 4.67 | 1 | 3 | ✓ |
| Quote Economy | 4.50 | 1 | 3 | ✓ |
| Instruction Following | 5.00 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 4.00 | 0.5 | 3 | ✓ |
| No Hallucination | 4.33 | 2 | 5 | **BELOW** (need 5) |
| No General Knowledge / No Secular Drift | 4.33 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 3.75 | 3 |
| lookup | 4.76 | 1 |
| social | 5.00 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.76 |
| browsing | 3.75 |
| edge | 5.00 |

## Failure Diagnoses (worst first)

- **[66] browsing** (browsing) "What's the largest collection?" — overall=2.68
  Failed: citationAccuracy, logicalCoherence, noHallucination, noGeneralKnowledge
  Diagnosis: The response uses the right tool and directly answers the user's simple question (5/5 on toolUsage and instructionFollowing), but commits a critical hallucination: the quoted phrase 'wonders of His Revelation' is not present in the search results and appears to be fabricated. Additionally, the Bahá'u'lláh quote is grafted onto the answer artificially — it has no connection to the user's factual query about collection sizes, and the response provides no evidence that this quote appears in the Papers collection or anywhere in the library. For a browsing question, citations aren't mandatory, but when offered, they must be real and relevant. The false attribution and invented quote are disqualifying.

- **[64] browsing** (browsing) "What languages are available?" — overall=3.98
  Failed: citationPresence
  Diagnosis: For a browsing question about library stats/metadata, citations are not mandatory — the assistant correctly used the tool and reported the result accurately. The response is factually grounded, concise, and instruction-following. The only weakness is lack of warmth; it reads slightly perfunctory. A single sentence of genuine welcome would lift this to a 4.

- **[70] browsing** (browsing) "How many documents are in the library total?" — overall=4.59
  Failed: citationPresence
  Diagnosis: Perfect execution for a browsing query. The user asked a factual question about library size, not for citations. Tool usage was correct (library_overview), facts are accurate and grounded in the search result, response is concise and informative. The only minor miss: the preamble ('This includes...') could be slightly warmer or more conversational to match the 'Warmth' standard, but this is marginal for a stats question.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Citation Presence | 2 | 33% |
| Citation Accuracy | 1 | 17% |
| Logical Coherence | 1 | 17% |
| No Hallucination | 1 | 17% |
| No General Knowledge / No Secular Drift | 1 | 17% |

## Common Diagnosis Themes

`response` (4x), `question` (3x), `quote` (3x), `about` (3x), `browsing` (3x)
