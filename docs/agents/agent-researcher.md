# Researcher Agent

**Role:** Search Strategy Specialist
**File:** `api/agents/agent-researcher.js`

## Overview

The Researcher agent determines optimal search strategies for user queries, from simple lookups to complex multi-query investigations.

## Query Types

| Type | Description | Strategy |
|------|-------------|----------|
| Simple/Direct | Single search sufficient | One hybrid search as-is |
| Concept Exploration | Multiple related searches | 2-3 searches with synonyms |
| Cross-Tradition | Tradition-specific searches | Separate per tradition, then merge |
| Deep Dive | Comprehensive exploration | Multiple variations, broader/narrower |
| Specific Reference | Targeted lookup | Keyword search targeting works/authors |

## Search Modes

- **hybrid**: Best for most queries (semantic + keyword combined)
- **semantic**: Best for conceptual/meaning-based queries
- **keyword**: Best for specific phrases, names, titles

## Methods

### `search(query, options)`
Main method - creates plan and executes it.

```javascript
const results = await researcher.search("What is justice?", {
  strategy: 'auto',
  traditions: ['Bahai']
});
```

### `createSearchPlan(query, options)`
Creates a search plan without executing.

Returns:
```javascript
{
  type: "simple" | "multi" | "comparative",
  reasoning: "Direct question about concept",
  queries: [
    { query: "justice", mode: "hybrid", limit: 10, filters: {} }
  ]
}
```

### `executeSearchPlan(plan)`
Executes a previously created search plan.

### `quickSearch(query, options)`
Bypasses planning for simple queries.

```javascript
const results = await researcher.quickSearch("prayer healing", {
  limit: 10,
  mode: 'hybrid',
  filters: { religion: 'Bahai' }
});
```

### `suggestRelatedSearches(query, results)`
Suggests related searches based on query and results.

## Configuration

```javascript
const researcher = new ResearcherAgent({
  model: 'gpt-4o',
  temperature: 0.3,    // Low for consistent planning
  maxTokens: 800
});
```

## Deduplication

Results are automatically deduplicated across multiple search queries using hit IDs, ensuring no duplicate passages in final results.
