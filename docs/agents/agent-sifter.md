# Sifter Agent

**Role:** Orchestrator
**File:** `api/agents/agent-sifter.js`

## Overview

Sifter is the main orchestrator agent that receives user queries, routes them to appropriate sub-agents, maintains conversational context, and synthesizes responses.

## Personality

- Warm, welcoming, and genuinely curious
- Scholarly but approachable
- Respectful of all traditions
- Brief and to-the-point

## Routing Strategies

| Strategy | Use Case | Example |
|----------|----------|---------|
| `simple_search` | Direct factual queries | "What does Baha'u'llah say about justice?" |
| `complex_search` | Multi-faceted questions | "Compare teachings on the afterlife across traditions" |
| `translation` | Style transformation requests | "Translate this in Shoghi Effendi's style" |
| `narration` | Audio requests | "Read this to me" |
| `conversational` | General chat | "What can you help me with?" |

## Methods

### `process(query, options)`
Main entry point. Routes query through appropriate agents.

```javascript
const result = await sifter.process("What is the purpose of life?", {
  context: { previousMessages: [] },
  stream: false
});
```

### `routeQuery(query, context)`
Determines routing strategy using AI analysis.

Returns:
```javascript
{
  strategy: "simple_search",
  reasoning: "Direct question about teachings",
  searchQueries: ["purpose of life"],
  requiresMultipleSearches: false,
  targetTraditions: []
}
```

### `registerAgents({ researcher, analyzer, translator, narrator })`
Wires up sub-agents for orchestration.

### `generateWelcome()`
Generates a dynamic welcome message (API call).

### `getDefaultWelcome()`
Returns static welcome message (no API call).

## Configuration

```javascript
const sifter = new SifterAgent({
  model: 'gpt-4o',      // AI model
  temperature: 0.7,      // Creativity level
  maxTokens: 1000        // Response limit
});
```

## Response Format

Sifter instructs the AI to:
- Keep introductions brief (1-2 sentences)
- Let sources speak for themselves
- Reference passages by citation numbers [1], [2]
- Never fabricate quotes
- Acknowledge honestly when no results found
