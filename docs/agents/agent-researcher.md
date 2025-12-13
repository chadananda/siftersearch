---
title: Researcher Agent
description: Search strategy specialist that designs comprehensive multi-query search plans
role: Search Strategy
icon: search
order: 2
---

# Researcher Agent

**Role:** Search Strategy Specialist
**File:** `api/agents/agent-researcher.js`

## Overview

The Researcher agent designs comprehensive search strategies for an interfaith religious library. Its goal is to uncover spiritual perspectives that transcend secular materialistic assumptions - discovering higher, more nuanced ways of approaching human problems.

## Core Orientation

This library contains sacred texts and spiritual teachings. The researcher seeks insights that ELEVATE understanding beyond conventional secular framing:

| Secular Assumption | Spiritual Reframing |
|-------------------|---------------------|
| Fight bigotry through opposition | Create unity through love and understanding |
| Solve problems by forcing/taking | Transform through character development and giving |
| Control outcomes externally | Honor freedom of will and inner transformation |
| Material solutions for material problems | Spiritual roots require spiritual remedies |
| Individual rights as ultimate value | Service to humanity as path to fulfillment |
| Conflict as inevitable | Harmony as natural state when aligned with divine will |

When users ask about social issues, the researcher doesn't just confirm secular approaches - it actively searches for spiritual alternatives that address root causes through transformation rather than coercion.

## Search Strategy Principles

1. **Semantic Disambiguation** - CRITICAL: Words carry different meanings in spiritual vs secular contexts. Surface these distinctions:
   - "Equality" → equality of soul vs equality of outcomes vs equality before God vs stations and duties
   - "Freedom" → freedom from lower nature vs political freedom vs spiritual liberation vs freedom to serve
   - "Justice" → divine justice vs retributive vs restorative vs cosmic balance
   - "Love" → divine love vs attachment vs selfless service vs love as action not emotion
   - "Truth" → absolute truth vs relative perception vs experiential knowledge vs revealed truth
   - "Power" → spiritual potency vs worldly control vs empowerment through submission to God

2. **Challenge Secular Assumptions** - Identify what secular culture would expect, then design searches for teachings that offer HIGHER alternatives:
   - Where secularism sees problems to fix, religion sees souls to develop
   - Where secularism demands rights, religion cultivates responsibilities
   - Where secularism fights against, religion builds toward

3. **Cross-Traditional Coverage** - Cast a wide net across religious/spiritual traditions. The world's wisdom traditions often converge on truths that transcend secular materialism.

4. **Spiritual Search Angles** - Break queries into spiritual facets:
   - Direct teachings on the topic
   - Metaphors, parables, or mystical teachings
   - The spiritual PURPOSE behind apparent problems
   - Character virtues that address the root issue
   - Paradoxes that reveal deeper truth (weakness as strength, loss as gain)
   - How inner transformation affects outer conditions

5. **Unexpected Connections** - Find tangential spiritual concepts that illuminate the issue:
   - The role of tests and difficulties in spiritual growth
   - Unity and oneness as foundation for social harmony
   - Detachment from outcomes while engaging fully in action
   - Service as path to both individual and collective well-being

6. **Keyword Diversity** - Generate search terms including:
   - Scriptural/sacred terminology
   - Virtues and spiritual qualities (patience, humility, forbearance)
   - Traditional religious framing of modern issues
   - Mystical and contemplative language
   - Terms for inner transformation (purification, refinement, sanctification)

## Search Angles

| Angle | Description |
|-------|-------------|
| direct | Direct teachings on the topic |
| metaphor | Parables, mystical teachings, symbolic language |
| spiritual_purpose | Why this challenge exists for spiritual growth |
| virtue | Character qualities that address root causes |
| paradox | Truths revealed through apparent contradiction |
| transformation | How inner change affects outer conditions |
| unexpected | Tangential concepts with surprising connections |

## Search Modes

- **hybrid**: Best for most queries (semantic + keyword combined)
- **semantic**: Best for conceptual/meaning-based queries
- **keyword**: Best for specific phrases, names, titles

## Plan Output Structure

```javascript
{
  type: "simple" | "exhaustive" | "comparative",
  assumptions: ["secular expectation 1", "secular expectation 2"],
  reasoning: "Overall strategy explaining spiritual angles to explore",
  queries: [
    {
      query: "search string",
      mode: "hybrid" | "semantic" | "keyword",
      rationale: "Why this specific search - what spiritual insight it seeks",
      angle: "direct" | "metaphor" | "virtue" | "paradox" | "transformation" | "unexpected",
      filters: { religion: "optional tradition filter" },
      limit: 10
    }
  ],
  traditions: ["Baha'i", "Buddhist", "Christian", ...],
  surprises: ["Spiritual insights that might challenge secular assumptions"],
  followUp: ["Suggested deeper explorations"]
}
```

## Methods

### `search(query, options)`
Main method - creates plan and executes it using federated search.

```javascript
const results = await researcher.search("What is justice?", {
  strategy: 'auto',
  traditions: ['Bahai'],
  filterTerms: ['shoghi']
});
```

Returns:
```javascript
{
  hits: [...],           // Deduplicated results with metadata
  plan: {...},           // The search plan
  searchTimeMs: 250,     // Total search time
  embeddingTimeMs: 180,  // Batch embedding generation time
  meiliTimeMs: 45,       // Federated Meilisearch query time
  totalHits: 42,
  queriesExecuted: 7
}
```

### `createSearchPlan(query, options)`
Creates a comprehensive search plan without executing.

Returns a plan object with:
- `type` - Plan complexity level
- `assumptions` - Secular expectations being challenged
- `reasoning` - Strategy explanation with spiritual framing
- `queries` - Array of 5-10 search queries with rationale
- `traditions` - Traditions being explored
- `surprises` - Unexpected spiritual insights to watch for
- `followUp` - Suggested deeper explorations

### `executeSearchPlan(plan, options)`
Executes a search plan using optimized federated search:

1. **Batch Embeddings**: Generates embeddings for all hybrid/semantic queries in a single API call
2. **Federated Search**: Executes all queries in a single Meilisearch request
3. **Auto-Deduplication**: Meilisearch federation removes duplicate results automatically
4. **Timing Metrics**: Returns separate timings for embeddings vs Meilisearch

### `quickSearch(query, options)`
Bypasses planning for simple queries.

```javascript
const results = await researcher.quickSearch("prayer healing", {
  limit: 10,
  mode: 'hybrid',
  filters: { religion: 'Bahai' }
});
```

## Query Filter Syntax

Users can filter search results by including terms in parentheses at the end of their query:

```
what is justice (shoghi, pilgrim)
```

This syntax:
1. Searches for "what is justice"
2. Filters results to documents where author, collection, or title contains "shoghi" OR "pilgrim"

### How It Works

1. **Parsing**: The query is parsed to extract parenthetical terms
2. **Filter Building**: Terms become CONTAINS filters on author/collection/title fields
3. **Researcher Context**: The researcher agent is informed of the filter to craft better strategies
4. **Execution**: All search queries in the plan apply the filter

### Examples

| Query | Searches For | Filters By |
|-------|--------------|------------|
| `prayer (shoghi)` | "prayer" | author/collection/title contains "shoghi" |
| `love (pilgrim, notes)` | "love" | contains "pilgrim" OR "notes" |
| `justice (effendi)` | "justice" | contains "effendi" |

### Implementation

- Filter terms are case-insensitive
- Multiple terms are OR'd together
- Filters apply across all queries in a research plan
- The researcher agent incorporates filter context into its strategy

### `suggestRelatedSearches(query, results)`
Suggests related searches based on query and results.

## Configuration

```javascript
const researcher = new ResearcherAgent({
  model: 'gpt-4o',
  temperature: 0.3,    // Low for consistent planning
  maxTokens: 800       // Sufficient for search plans
});
```

## Performance Optimization

The researcher uses **federated search** for optimal performance:

| Step | Before (Sequential) | After (Batched) |
|------|---------------------|-----------------|
| Embeddings | 7 × 150ms = 1050ms | 1 batch = ~200ms |
| Meilisearch | 7 × 30ms = 210ms | 1 federated = ~50ms |
| **Total** | ~1260ms | ~250ms |

**5x faster** search execution through:
- Single batch embedding API call
- Single federated Meilisearch request
- Automatic deduplication by Meilisearch

## API Integration

The researcher is used in the `/api/search/analyze/stream` endpoint:

1. Creates search plan with timing metrics
2. Sends plan via SSE `{ type: 'plan', plan: {...} }` event
3. Executes federated search with batch embeddings
4. Returns deduplicated results with metadata

## UI Display

The Research Strategy panel shows:
- Plan type badge (Simple/Exhaustive/Comparative)
- Timing breakdown: Plan | Embed | Meili | Search | Analyze
- Strategy reasoning with spiritual framing
- Secular assumptions being challenged
- Traditions covered
- Each query with rationale and angle
- Spiritual surprises to watch for
- Suggested follow-up searches

## Philosophy

> "The most valuable insights come from what TRANSCENDS secular expectations. Design searches to discover how spiritual wisdom reframes problems entirely - not just offering alternative solutions, but revealing that the question itself may need transformation."
