---
title: Agent Architecture
description: The agents behind SifterSearch — Anís the research companion, Dewey the librarian, and the components that support them
---

# SifterSearch Agents

## The interactive agents

Two agents are people you talk to, each with its own soul, purpose, tools, schedule and memory:

- **[Anís](/docs/agents/anis)** — the research companion: a chat on many sites and an email address
  (anis@oceanlibrary.com), answering from the library in the reader's interest. He is the search interface.
- **[Dewey](/docs/agents/dewey)** — the AI Librarian for Ocean 2.0 (dewey@oceanlibrary.com): checks holdings, takes in
  scans and finds, improves and organizes the library, works with contributors (designed; building from about
  mid-November 2026).

## How a question is answered

```
question ─▶ Anís
             ├─ System-1 (Clef / Jev): triage, then choose a search strategy for the question
             ├─ search: phrase, keyword and semantic layers over the whole library
             ├─ System-1: re-rank, pick the passages that answer
             ├─ CTAI API: renderings and term studies for Arabic and Persian originals
             └─ one reply-model call: the answer, with a link to every passage quoted
```

Every exchange is audited afterwards (was the strategy right, did the evidence answer, did the format fit), and the
audits feed new strategies. The technical detail is in the
[Anís Technical Reference Manual](https://siftersearch.com/admin/anis#trm) (admin).

## Supporting components

- **[Narrator](/docs/agents/narrator)** — audio narration with a pronunciation dictionary for sacred names and terms.
- **[Researcher](/docs/agents/researcher)** — the earlier multi-query search planner, still behind the legacy
  `/api/search/analyze` endpoint; Anís's strategy choice supersedes it.

## Retired (2026-10)

| Was | Replaced by |
|---|---|
| Sifter (orchestrator) | Anís — the search interface itself |
| Analyzer (LLM scoring and re-ranking) | search strategies chosen by System-1, and Clef re-ranking |
| Translator (Shoghi Effendi style) | the CTAI API |
| Memory (conversation memory) | never built as an agent; Anís keeps each person's conversation history |
| Transcriber (audio/video to text) | never built; talks ingestion is planned separately |
