# Jafar Quality Report — 2026-05-18T12-26-15

> Generated: 2026-05-18T12:46:38.724Z
> Judge model: gpt-4o-mini

## Summary

| Metric | Value |
|--------|-------|
| Total | 110 |
| Passed | **101 (92%)** |
| Failed | 9 |
| Errors | 0 |

## Scores by Dimension

| Dimension | Avg | Weight | Threshold | Status |
|-----------|-----|--------|-----------|--------|
| Tool Usage | 4.63 | 1.5 | 4 | ✓ |
| Citation Presence | 4.45 | 2 | 4 | ✓ |
| Citation Accuracy | 4.25 | 2 | 4 | ✓ |
| Source Authority Hierarchy | 4.25 | 1.5 | 3 | ✓ |
| Topic Coverage | 4.46 | 1.5 | 4 | ✓ |
| Logical Coherence | 4.07 | 1 | 4 | ✓ |
| Critical Engagement | 3.28 | 1.5 | 3 | ✓ |
| Inline Quote Integration | 3.96 | 2 | 4 | **BELOW** (need 4) |
| Brevity | 3.76 | 1 | 3 | ✓ |
| Quote Economy | 4.19 | 1 | 3 | ✓ |
| Instruction Following | 4.90 | 1.5 | 4 | ✓ |
| Warmth & Gravitas | 3.59 | 0.5 | 3 | ✓ |
| No Hallucination | 5.00 | 2 | 5 | ✓ |
| No General Knowledge / No Secular Drift | 4.89 | 1.5 | 4 | ✓ |

## Scores by Question Type

| Type | Avg Score | Count |
|------|-----------|-------|
| browsing | 4.15 | 10 |
| framing | 4.41 | 10 |
| lookup | 4.36 | 10 |
| reading | 4.31 | 5 |
| research | 4.41 | 73 |
| social | 2.03 | 2 |

## Scores by Category

| Category | Avg Score |
|----------|-----------|
| author | 4.36 |
| browsing | 4.15 |
| comparative | 4.43 |
| edge | 4.08 |
| factual | 4.33 |
| framing | 4.41 |
| multi | 4.31 |
| philosophical | 4.63 |
| reading | 4.31 |
| topical | 4.38 |

## Failure Diagnoses (worst first)

- **[79] edge** (social) "?" — overall=1.85
  Failed: topicCoverage, logicalCoherence, criticalEngagement, quoteEconomy, instructionFollowing
  Diagnosis: The response fails to address the user's query, which is simply a question mark. It does not provide any substantive content or engage with the user meaningfully. To improve, the assistant could ask a clarifying question or offer to help with a specific topic related to the library's content.

- **[89] edge** (social) "Thank you!" — overall=2.2
  Failed: topicCoverage, logicalCoherence, criticalEngagement, quoteEconomy
  Diagnosis: The response fails to utilize any tools, which is critical even for social interactions. While it is warm and inviting, it lacks any engagement with the library's resources, which is essential for the assistant's role. To improve, the assistant should acknowledge the user's gratitude while also encouraging further exploration of the library's offerings.

- **[63] browsing** (browsing) "Show me the Islamic collections" — overall=3.1
  Failed: toolUsage
  Diagnosis: The response lacks optimal tool usage, as it did not use the correct tool for browsing queries. Additionally, while it provides some relevant information, it fails to critically engage with the user's request and includes a quote that is not directly relevant to the topic of Islamic collections. To improve, the assistant should focus on using the appropriate tool and ensure that all claims are directly tied to the user's query.

- **[65] browsing** (browsing) "List the Bahá'í collections" — overall=3.1
  Failed: warmth, noGeneralKnowledge
  Diagnosis: The response partially addresses the user's request by listing some Bahá'í collections but lacks a comprehensive list of all collections. Additionally, the quote from Bahá'u'lláh, while relevant, does not directly pertain to the user's request for collections and feels out of place. To improve, the assistant should focus on providing a complete list of Bahá'í collections without unnecessary quotes.

- **[27] author** (lookup) "What works by 'Abdu'l-Bahá are in the library?" — overall=3.66
  Failed: toolUsage, citationAccuracy
  Diagnosis: The primary issue with this response is the tool usage; while it mentions specific works, it does not indicate that the assistant searched the library for this information. Additionally, some quotes lack proper integration into the text, making them feel somewhat disconnected from the overall narrative. To improve, the assistant should ensure it clearly indicates tool usage and integrates quotes more fluidly into the response.

- **[74] reading** (reading) "Read the opening verses of the Bhagavad Gita" — overall=3.8
  Failed: toolUsage, instructionFollowing
  Diagnosis: The response provides a good overview of the opening verses but does not directly quote the text as requested. To improve, the assistant should have used the reading tool to provide the actual verses verbatim, ensuring it follows the user's instruction precisely.

- **[72] reading** (reading) "Show me the beginning of the Kitáb-i-Íqán" — overall=3.83
  Failed: toolUsage, instructionFollowing
  Diagnosis: The response does not fully adhere to the user's request for the beginning of the Kitáb-i-Íqán, as it summarizes the content instead of providing the actual text. To improve, the assistant should have used the correct tool to read and present the opening passage directly from the document.

- **[49] topical** (research) "Find passages about service to others" — overall=3.88
  Failed: toolUsage
  Diagnosis: The response lacks optimal tool usage, as it does not specify the mode or filters used during the search. While it provides a good range of quotes from various traditions, some quotes are not from the most authoritative sources available. To improve, Jafar should ensure that the search is conducted with appropriate filters and prioritize primary scriptures over secondary sources.

- **[102] framing** (framing) "True spirituality is really just about being a goo" — overall=4.2
  Failed: criticalEngagement
  Diagnosis: The response effectively covers multiple religious perspectives on spirituality but could improve in critical engagement by addressing the user's framing more directly. Specifically, it should clarify that the user's definition of 'being a good person' may lack the depth that various traditions emphasize regarding spirituality. Additionally, some quotes could be more tightly integrated into the narrative to enhance coherence and flow.


## Failure Frequency

| Dimension | Failures | % of Total |
|-----------|----------|------------|
| Tool Usage | 5 | 5% |
| Instruction Following | 3 | 3% |
| Critical Engagement | 3 | 3% |
| Topic Coverage | 2 | 2% |
| Logical Coherence | 2 | 2% |
| Quote Economy | 2 | 2% |
| Citation Accuracy | 1 | 1% |
| Warmth & Gravitas | 1 | 1% |
| No General Knowledge / No Secular Drift | 1 | 1% |

## Common Diagnosis Themes

`user's` (10x), `response` (9x), `improve,` (8x), `assistant` (8x), `should` (8x), `while` (6x), `directly` (5x), `quotes` (5x), `lacks` (4x), `additionally,` (4x)
