# System-1 jobs — one plan for every fast decision (2026-10-10)

A System-1 job is a typed decision (choice / yes-no with calibrated confidence) made in ~40–150 ms instead of an LLM
call. Backends: **Jev** (paid, $0.042/M input, the default since 10-10), **Clef / Clef-flash** (Workers AI, fallback +
sampled shadow), **Laya** (local on boss, free, must be trained per job). Training plan: `laya-training-plan-20261010.md`.

## Every job is specified the same way

| Field | What it fixes |
|---|---|
| **Decision** | the typed questions (choices + criteria), versioned — a change is a new version, never silent |
| **State** | exactly what the model sees, built by one function, with a **token budget ≤ 900** so Laya can take it over (its limit is 1,024). Larger inputs are decomposed into several short decisions, never sent whole |
| **Unit & volume** | per paragraph / per page / per turn; expected calls per day and per backfill |
| **Latency class** | *interactive* (in a reply: ≤ 300 ms total) or *batch* (ingest, backfill) |
| **Cost ceiling** | calls × tokens × rate, stated before any backfill (Chad approves anything above a few dollars) |
| **Labels** | Jev's logged distributions (distillation) + a **gold set** of ≥ 200 judged cases per job |
| **Switch rule** | Laya serves when it matches Jev on the gold set and held-out data in two eval windows; Jev stays as fallback below `min_conf` |

Proposed enforcement: one registry (`api/lib/system1/jobs.js`) declaring each job's questions, state builder, budget and
latency class; a test fails any state builder that exceeds its budget on the job's fixtures, and the admin hub shows
spend and served-by per job.

## The jobs

| # | Job | Logged as | State today | Unit · volume | Class | Built | Laya fit |
|---|---|---|---|---|---|---|---|
| 1 | **Author / speaker identification** | `paragraph-attribution` (64k), `paragraph-speaker-window` (150k), `talk-speaker` (2.7k) | 776 · **9,799** · 580 tokens | per paragraph · whole library | batch | yes | yes after the window job is **redesigned**: one paragraph + a running speaker state (previous speaker, heading, open quotation) instead of a 10k-token window |
| 2 | **Search strategy choice** | `search-plan` (5.3k) | 1,299 tokens | per turn | interactive | yes | yes once trimmed (latest turn + a compact thread summary) |
| 3 | **Search branching** (follow-ups, exploration chips, research mode) | — | menu of id-backed branches + the follow-up message, ~400–600 tokens | per follow-up / hop | interactive | **designed, not built** (`search-strategy-layer.md`) | yes — designed short from the start |
| 4 | **Answer format selection** | `anis-format` (13) | 624 tokens | per turn | interactive | yes | yes; too few labels yet — needs a gold set |
| 5 | **Scraped page content identification** (document vs metadata vs navigation) | `page-role` (76k, Clef-served) | head 1,500 chars + tail + metadata ≈ 600–900 tokens | per page · every ingest | batch | yes | **fits** — the state is already short; 76k Clef labels (97.8% agreement with Jev) |

Also running today:

| Job | Logged as | State | Class | Note |
|---|---|---|---|---|
| Anís triage (research / canned / tarpit / stop) | `anis-triage` | 1,054 | interactive | every turn |
| Anís persona check | `anis-persona-check` | 890 | interactive | every reply |
| Entity merge / split audit | `identity-audit` (8.3k) | 707 | batch | fits now |
| Source resolution (which passage a quote is from) | `source-resolve` (4.9k) | **4,254** | interactive | trim |
| SourceHunt: held? / span / highlight | `sourcehunt-holds` / `-span` / `-highlight` | **3,936** / 2,306 / 1,175 | interactive | trim; span decides per clause list |
| Cross-lingual pair verification | `xl-verify` | 1,880 | batch | trim |
| Search scope extraction | `scope-extract` | — | interactive | |

Designed or named, not built yet:

| Job | Where it was identified | Class |
|---|---|---|
| Search branching (#3 above) | `search-strategy-layer.md` (Chad 10-01) | interactive |
| **Passage re-ranking** (which retrieved passages answer the question; Chad: "Clef to re-rank") | `search-strategy-layer.md`; today re-ranking is arithmetic / `reranker.js`, not System-1 | interactive |
| **Concept linking** (does this passage express this kernel idea / answer this canonical question) | concept index monthly cycle (09-28) | batch, whole library monthly |
| **Strategy audit triage** (which logged exchanges are worth a full audit) | strategy audit plan (10-07); the audit itself is an LLM | batch, nightly |
| Dewey: **holdings verdict**, **title-page / cover photo reading**, **tradition and collection placement**, **OCR quality accept / re-run** | `docs/agents/agent-dewey.md` | intake |
| Talks: speaker / topic labelling of transcripts | `backlog-youtube-talks-20261009.md` (`talk-speaker` exists) | batch |

Logged earlier, not called by current code: `xl-verify` (cross-lingual pair checks), `sourcehunt-highlight`,
`attribution-experiments`.

## Order of work

1. **Registry + budgets** for the jobs that exist (no model cost): every state builder declared and measured.
2. **Trim the over-budget states** (window, source-resolve, sourcehunt-holds/span, search-plan, xl-verify) — this also
   cuts Jev spend now.
3. **Gold sets**, 200 per job, judged in session from the passages (free), starting with the batch jobs.
4. **Laya pilots** where labels are plentiful and states fit: author identification (`paragraph-attribution`), page
   role, identity audit. Interactive jobs follow as their logs grow — their Jev cost is pennies; Laya's gain there is
   latency (~40 ms) and independence.
5. **Build branching (#3)** on the registry from day one.

## Cost at Jev prices (for scale)

A per-paragraph job at 700 tokens costs **$0.03 per 1,000 paragraphs**; one pass over a million paragraphs is about
**$30**. An interactive job at 1,000 tokens per turn costs $0.04 per 1,000 turns. The 10-08/09 overspend came from
10k-token states and duplicated shadows, not from the decisions themselves.
