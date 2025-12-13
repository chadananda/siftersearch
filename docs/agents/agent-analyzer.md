---
title: Analyzer Agent
description: Relevance scoring and reranking specialist that scores results using the research plan
role: Re-ranking & Scoring
icon: bar-chart
order: 3
---

# Analyzer Agent

**Role:** Relevance Scoring and Reranking Specialist
**Location:** Inline in `api/routes/search.js` (analyzer prompt)

## Overview

The Analyzer processes federated search results from the Researcher agent. It scores each result by relevance using the research plan as context, filters low-scoring results (below 60), extracts key sentences, highlights core terms, and generates brief answers.

## Scoring Criteria

Results are scored 0-100 based on four weighted factors:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Direct Relevance** | 40% | How directly does the passage address the user's query? |
| **Depth of Insight** | 30% | Substantive teaching vs surface mention? |
| **Research Plan Alignment** | 20% | Does it address angles/facets from the research plan? |
| **Unexpectedness** | 10% | Does it challenge assumptions or reveal surprising perspectives? |

## Analysis Tasks

1. **Score** passages (0-100) using the weighted criteria above
2. **Filter** passages scoring below 60
3. **Extract** the most relevant sentence (using start/end anchors)
4. **Identify** 3-7 core terms to highlight within that sentence
5. **Summarize** with a brief 5-8 word answer from the quote's perspective
6. **Explain** why the passage is relevant (context of research plan)

## Output Format

The analyzer returns JSON with ranked results (highest score first):

```javascript
{
  results: [
    {
      originalIndex: 0,           // Index in original search results
      id: "passage_123",          // Passage ID for tracking
      score: 95,                  // Relevance score (0-100)
      briefAnswer: "Divine love unites all faiths",  // 5-8 word answer
      sentenceStart: "In the sight of",  // First 3-5 words VERBATIM
      sentenceEnd: "one human family.",  // Last 3-5 words VERBATIM
      coreTerms: ["divine", "love", "unites", "human", "family"],
      relevanceNote: "Addresses cross-traditional unity angle from research plan"
    }
  ],
  introduction: "Brief 1-2 sentence intro orienting the user to what was found.",
  semanticNote: "Optional: note if key terms appear in distinctly different senses across passages"
}
```

## Brief Answer Rules

The brief answer must:
- Answer the query directly from the quote's perspective
- Be 5-8 words maximum
- NO meta-language ("this passage states", "asserts", "discusses")
- Just the answer itself

**Good:** "Divine love unites all faiths"
**Bad:** "This passage asserts that divine love unites faiths"

## Sentence Anchoring

Instead of copying entire sentences (which can fail due to LLM rephrasing), the analyzer uses anchor-based matching:

1. **sentenceStart**: First 3-5 words VERBATIM from the text
2. **sentenceEnd**: Last 3-5 words VERBATIM (including punctuation)

The route handler uses these anchors to find and highlight the exact sentence in the original text.

## Semantic Awareness

The analyzer notes when key terms appear with different philosophical meanings across passages:

- "equality" → rights vs outcomes vs nature vs dignity
- "freedom" → from constraint vs to act vs spiritual vs political
- "justice" → retributive vs restorative vs distributive vs divine
- "love" → divine vs human vs duty vs emotion

These distinctions are captured in `semanticNote` when relevant.

## Research Plan Context

The analyzer receives the full research plan from the Researcher agent:

```
RESEARCH STRATEGY:
- Reasoning: [Overall search strategy explanation]
- Assumptions being challenged: [List of expected answers to disprove]
- Search queries used:
  1. "query text" (hybrid) - [rationale]
  2. "query text" (semantic) - [rationale]
- Traditions covered: [List of religions/traditions]
- Surprises to watch for: [Unexpected findings to highlight]
```

This context helps the analyzer:
- Understand why each passage was found
- Score passages that address multiple research angles higher
- Identify passages that challenge stated assumptions
- Note which tradition/angle each result addresses

## Sorting

The analyzer **ranks** results by score in its JSON output. The route handler **sorts** the enhanced sources by score before sending to the frontend, ensuring results are always ordered by relevance.

## Highlighting Flow

1. Analyzer identifies relevant sentence via anchors
2. Route handler matches anchors in original text
3. Core terms within the sentence get `<b>` tags
4. Entire sentence gets `<mark>` tags
5. Result: `${before}<mark>The <b>divine</b> <b>love</b>...</mark>${after}`

## Configuration

The analyzer runs inline in the search route with:

```javascript
await ai.chat([
  { role: 'system', content: 'You are an expert search result analyzer. Return only valid JSON, no markdown.' },
  { role: 'user', content: analyzerPrompt }
], {
  temperature: 0.3,    // Low for consistent scoring
  maxTokens: 3000      // Higher for processing multiple results
});
```

## Error Handling

If analysis fails, the route falls back to sending original results with:
- Empty summaries
- Plain text (no highlighting)
- No scoring/ranking
