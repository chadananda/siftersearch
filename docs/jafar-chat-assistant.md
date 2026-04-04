# Jafar — Ocean Library Research Assistant

> Last updated: 2026-04-04 | Code: `api/routes/chat.js`

## Personality

Jafar is a wise, warm research companion. He chooses words the way a jeweler sets stones — each one deliberate, none wasted. His responses are meant to be read aloud: short sentences, flowing rhythm, no filler.

**Core traits:**
- **Terse.** One sentence when one suffices. Never a paragraph where a line would do.
- **Truthful.** Uses tools to verify facts. Says "I don't know" when uncertain.
- **Warm.** Speaks like a brilliant friend over tea, not a search engine.
- **Bahá'í lens.** All religions as chapters of one unfolding story — held as perspective, not doctrine.

**Voice rules:**
- Markdown is allowed: **bold**, *italic*, lists, tables — when they serve clarity.
- Citations inline: (*Title* — Author).
- Questions only when they genuinely deepen the conversation.
- No hedging, no filler, no padding.

## Architecture

All Jafar code lives in one file: `api/routes/chat.js`.

```
POST /api/chat/stream
  → OpenAI gpt-4o with function calling
  → Tool loop (up to 5 rounds)
  → Streamed SSE response
```

### Tool Calling Flow

1. User message arrives
2. OpenAI decides whether to call tools
3. If yes: execute tools in parallel, feed results back, repeat
4. When done: stream final response as SSE chunks
5. Client receives `chunk`, `tool_use`, `citations`, `complete` events

## Tools

Two tools, kept deliberately minimal:

### `search`

Unified search tool — handles everything through Meilisearch (fuzzy matching, typo tolerance).

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search text — topic, author, title, concept. **Required.** |
| `mode` | enum | `passages` (default), `documents`, `count`, `read` |
| `religion` | string | Filter by religion |
| `collection` | string | Filter by collection |
| `document_id` | integer | For mode `read` — which document to fetch |
| `start` | integer | For mode `read` — paragraph offset |
| `limit` | integer | Max results (default 10) |

**Modes:**
- **passages** — Hybrid search (semantic + keyword) for relevant content quotes with citations
- **documents** — Find/list books by metadata. Fuzzy: "Udo Schafer" finds "Udo Schaefer"
- **count** — Just return how many documents match
- **read** — Fetch actual paragraphs from a specific document by ID

### `library_overview`

Returns high-level stats: total documents, passages, religions with counts, collections with counts.

## Client Integration

The chat UI is in `src/components/ChatInterface.svelte`.

**Features:**
- Chat messages persist to `localStorage` (survive page refreshes)
- Full markdown rendering via `marked.parse()` for assistant messages
- Copy button on hover for each assistant response
- Auto-focus input on printable keystrokes (Cmd+C preserved for copying)
- Auto-reload when server version changes (via `X-Server-Version` header)

**SSE Event Types:**
- `chunk` — Streamed text fragment
- `tool_use` — Jafar is calling a tool (shown as loading indicator)
- `citations` — Library passages referenced in the response
- `complete` — Stream finished
- `error` — Something went wrong

## Public API (Planned)

The search tool will be exposed as a public REST endpoint for external chatbots:

```
POST /api/tools/search
{
  "query": "books by Udo Schaefer",
  "mode": "documents",
  "limit": 10
}
```

This allows any external AI agent to query the Ocean Library with the same fuzzy, multi-mode search that Jafar uses internally.

## Prompt Engineering Notes

The system prompt is the most critical piece. Key learnings:

1. **Brevity must be the first instruction.** If it's buried, the model ignores it.
2. **"2-4 sentences" is too many.** Say "one sentence when one suffices."
3. **Metaphors work.** "Chooses words like a jeweler sets stones" produces better output than "be concise."
4. **"Don't guess — look it up"** prevents hallucinated citations.
5. **Markdown permission must be explicit** or the model avoids formatting.
6. **The tool description matters as much as the prompt.** Rich descriptions with examples help the model choose the right mode.

## Roadmap

- [ ] Expose search as public API endpoint for external chatbots
- [ ] Conversational memory — retain + compress conversations across sessions
- [ ] User preferences and reading history for personalized responses
- [ ] Voice output optimization (SSML hints, pronunciation guides for transliterated names)
- [ ] Multi-turn research — Jafar remembers what was discussed and builds on it
