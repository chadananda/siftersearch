# Researcher Agent

**Role:** Search Strategy Specialist
**File:** `api/agents/agent-researcher.js`

## Overview

The Researcher agent designs comprehensive search strategies for interfaith research queries. Its goal is to uncover ALL relevant perspectives, especially unexpected or counterintuitive teachings.

## Core Principles

1. **Challenge Assumptions** - Identify obvious answers and design searches to find teachings that contradict or complicate expectations
2. **Cross-Traditional Coverage** - Cast a wide net across multiple religious/spiritual traditions
3. **Multiple Angles** - Explore queries from various conceptual facets
4. **Unexpected Connections** - Find tangential topics that reveal surprising insights
5. **Keyword Diversity** - Use literal, metaphorical, traditional, and modern terminology

## Search Angles

| Angle | Description |
|-------|-------------|
| direct | Direct teachings on the topic |
| metaphor | Related metaphors, parables, symbolic teachings |
| historical | Historical/cultural context |
| practical | Practical applications, ethical implications |
| paradox | Paradoxes or tensions within traditions |
| unexpected | Tangential topics with surprising connections |

## Search Modes

- **hybrid**: Best for most queries (semantic + keyword combined)
- **semantic**: Best for conceptual/meaning-based queries
- **keyword**: Best for specific phrases, names, titles

## Plan Output Structure

```javascript
{
  type: "simple" | "exhaustive" | "comparative",
  assumptions: ["expected answer 1", "expected answer 2"],
  reasoning: "Overall strategy explanation",
  queries: [
    {
      query: "search string",
      mode: "hybrid" | "semantic" | "keyword",
      rationale: "Why this specific search",
      angle: "direct" | "metaphor" | "historical" | "practical" | "paradox" | "unexpected",
      limit: 10
    }
  ],
  traditions: ["Baha'i", "Buddhist", "Christian", ...],
  surprises: ["Unexpected findings to watch for"],
  followUp: ["Suggested next searches"]
}
```

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
Creates a comprehensive search plan without executing.

Returns a plan object with:
- `type` - Plan complexity level
- `assumptions` - Obvious answers being challenged
- `reasoning` - Overall strategy explanation
- `queries` - Array of 5-10 search queries with rationale
- `traditions` - Traditions being explored
- `surprises` - What unexpected findings to watch for
- `followUp` - Suggested next searches

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
  maxTokens: 1500      // Increased for richer output
});
```

## API Integration

The researcher is used in the `/api/search/analyze/stream` endpoint:

1. Creates search plan with timing metrics
2. Sends plan via SSE `{ type: 'plan', plan: {...} }` event
3. Executes plan and returns deduplicated results

## UI Display

The Research Strategy panel shows:
- Plan type badge (Simple/Exhaustive/Comparative)
- Planning time in milliseconds
- Strategy reasoning
- Assumptions being challenged
- Traditions covered
- Each query with rationale and angle
- Surprises to watch for
- Suggested follow-up searches

## Deduplication

Results are automatically deduplicated across multiple search queries using hit IDs, ensuring no duplicate passages in final results.

## Philosophy

> "The most valuable insights often come from what we DON'T expect to find. Design searches to prove yourself wrong, not right."
