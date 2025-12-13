---
title: Memory Agent
description: Semantic memory for user conversations, enabling personalized context and recall
role: User Context
icon: brain
order: 6
---

# Memory Agent

**Role:** User Context & Memory Specialist
**File:** `api/agents/agent-memory.js`

## Overview

The Memory agent provides semantic memory for user conversations. It stores, indexes, and retrieves relevant context from past interactions, enabling Sifter to maintain continuity across sessions and personalize responses based on user history.

## Core Capabilities

### 1. Memory Storage
- Store conversation messages with embedding vectors
- Extract and index key topics from each message
- Associate memories with user IDs (anonymous or authenticated)
- Support metadata for additional context

### 2. Semantic Search
- Find relevant past conversations using cosine similarity
- Threshold-based filtering for quality matches (default 0.75)
- Return memories ranked by relevance
- Support for recent context retrieval

### 3. User Profile Management
- Build user profiles from accumulated memories
- Track topic interests over time
- Store and merge preferences
- Support user ID unification on login

## Architecture

```
┌────────────────────┐
│   User Message     │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Generate Embed    │ ──► text-embedding-3-small
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Extract Topics    │ ──► AI topic extraction
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Store in DB       │ ──► conversation_memories table
└────────────────────┘
```

## Database Schema

```sql
-- Conversation memories with embeddings
CREATE TABLE conversation_memories (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,          -- Anonymous (user_xxx) or auth user ID
  role TEXT NOT NULL,             -- 'user' or 'assistant'
  content TEXT NOT NULL,          -- Message content (max 2000 chars)
  embedding TEXT,                 -- JSON embedding vector
  topics TEXT,                    -- JSON array of topics
  metadata TEXT,                  -- JSON additional context
  created_at DATETIME
);

-- User profile data
CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  name TEXT,
  bio TEXT,
  spiritual_background TEXT,
  interests TEXT,                 -- JSON array
  preferred_sources TEXT,         -- JSON array
  language TEXT DEFAULT 'en',
  metadata TEXT,
  created_at DATETIME,
  updated_at DATETIME
);
```

## Usage Examples

### Store a Memory

```javascript
import { MemoryAgent } from './api/agents/agent-memory.js';

const memory = new MemoryAgent();

// Store user message
await memory.storeMemory(
  'user_abc123',
  'user',
  'What does the Quran say about justice?',
  { searchQuery: true }
);

// Store assistant response
await memory.storeMemory(
  'user_abc123',
  'assistant',
  'The Quran speaks extensively about justice (adl)...',
  { hadSources: true }
);
```

### Search Memories

```javascript
// Find relevant past conversations
const memories = await memory.searchMemories(
  'user_abc123',
  'Islamic teachings on fairness',
  5 // limit
);

// Returns: [{ content, similarity, topics, createdAt }, ...]
```

### Get User Profile

```javascript
const profile = await memory.getUserProfile('user_abc123');
// Returns: { userId, memoryCount, topTopics, preferences, savedInterests }
```

### Unify User IDs

```javascript
// When user logs in, merge anonymous memories
await memory.unifyMemories('user_abc123', 42); // 42 = authenticated user ID
```

## Integration with Sifter

The Memory agent is called by Sifter to:

1. **Before search**: Recall relevant past conversations
2. **After response**: Store the interaction
3. **On session init**: Load user profile for context

```javascript
// In Sifter's process method
const relevantMemories = await this.memory.searchMemories(userId, query);
const userProfile = await this.memory.getUserProfile(userId);

// Include in context for personalized responses
const context = {
  memories: relevantMemories,
  profile: userProfile
};
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `similarityThreshold` | 0.75 | Minimum cosine similarity for memory retrieval |
| `maxMemories` | 5 | Maximum memories to return per search |
| `model` | gpt-4o-mini | Model for topic extraction |

## Privacy Considerations

- Memories are scoped per user ID
- Anonymous users can have memories transferred on login
- Content is limited to 2000 characters per memory
- Users can request memory deletion (not yet implemented)

## Future Enhancements

- [ ] Memory summarization for long histories
- [ ] Time decay for relevance scoring
- [ ] Multi-device memory sync
- [ ] Memory deletion API
- [ ] Graph-based relationship tracking between topics
