# Analyzer Agent

**Role:** Re-ranking and Summarization Specialist
**File:** `api/agents/agent-analyzer.js`

## Overview

The Analyzer agent processes search results to re-rank by relevance, filter irrelevant results, identify key sentences, highlight important phrases, and generate concise summaries.

## Analysis Tasks

1. **Re-rank** passages by relevance (most relevant first)
2. **Filter** passages that don't help answer the query
3. **Extract** the most relevant sentence in each passage
4. **Identify** 1-3 key words/phrases in that sentence
5. **Summarize** with a direct 5-10 word answer

## Summary Rules

The Analyzer follows strict summary guidelines:

- Answer the query directly from the quote's content
- NO meta-language ("this passage states", "asserts", "discusses")
- Maximum 10 words per summary
- Format: Just the answer

**Good:** "Unity through diversity of traditions"
**Bad:** "This passage asserts that unity comes through diversity"

## Methods

### `analyze(query, searchResults, options)`
Main analysis method.

```javascript
const analysis = await analyzer.analyze(
  "What is justice?",
  searchResults,
  { stream: false }
);
```

Returns:
```javascript
{
  results: [
    {
      id: "doc123",
      text: "Original passage text...",
      title: "Hidden Words",
      author: "Baha'u'llah",
      summary: "Justice is the light of men",
      relevantSentence: "The best beloved...",
      keyWords: ["justice", "light"],
      highlightedText: "<mark>The <strong>best beloved</strong>...</mark>"
    }
  ],
  introduction: "Found 5 relevant passages on justice.",
  query: "What is justice?",
  originalCount: 10,
  filteredCount: 5
}
```

### `checkRelevance(query, passage)`
Quick relevance check without full analysis.

```javascript
const { relevant, reason } = await analyzer.checkRelevance(
  "justice",
  "This passage about love..."
);
```

### `synthesize(query, passages)`
Generates a 2-3 sentence synthesis of multiple passages.

```javascript
const { synthesis, passageCount } = await analyzer.synthesize(
  "What is justice?",
  analyzedPassages
);
```

## Highlighting

The Analyzer creates highlighted text by:
1. Finding the relevant sentence in the passage
2. Wrapping key words in `<strong>` tags
3. Wrapping the entire sentence in `<mark>` tags

## Configuration

```javascript
const analyzer = new AnalyzerAgent({
  model: 'gpt-4o',
  temperature: 0.3,    // Low for consistent analysis
  maxTokens: 3000      // Higher for processing multiple results
});
```

## Error Handling

If analysis fails, returns original results with empty summaries as fallback.
