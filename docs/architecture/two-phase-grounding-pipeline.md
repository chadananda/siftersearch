# Two-Phase Grounding Pipeline (approved 2026-07-12)

The design for turning an ordered stack of books into cumulatively-searchable, entity-grounded knowledge —
**highly parallel, token-lean, and never deferring completion.** Supersedes the breadth-first campaign that
left books half-finished. Operational contract: [wave1-extraction-pipeline.md](wave1-extraction-pipeline.md)
"Definition of Done". Library internals: `api/lib/rag/`.

## The invariant that justifies ordered accumulation
Book N must be **fully reconciled + searchable** before Book N+1's entity-resolution runs, because N+1's
merge/split decisions **query the accumulated grounded corpus (via search) as evidence**. We order books
most-authoritative-first precisely so the best evidence is available when resolving later books. Deferring a
book's completion breaks this feedback loop — it is the whole point of sequenced addition.

## Dependency analysis → two phases
Each stage's real dependency splits cleanly:

**Phase A — book-local** (needs only the book's own text; parallel across books AND within a book):
`disambiguate → mentions → claims → HyPE`, then index paragraphs+claims+HyPE into Meili. ~95% of token cost
lives here. May run FAR AHEAD (prefetch) for many books at once — this is legitimate parallelism, not
deferral.

**Phase B — cumulative** (needs all prior books grounded+searchable; strictly serial in authority order):
`reconcile → project(link+create) → dup-guard → link-claims → search-verify`. Cluster-level (hundreds of
names/book, not thousands of paragraphs) → cheap and fast. Completed + verified before the next book's
Phase B.

The ONLY cross-book edge is **PhaseB(N) ← grounded(≤N−1)**. So: prefetch Phase A broadly in parallel; walk
Phase B one book at a time. Expensive work parallel; ordering-sensitive work serial and fast. (The
Máz-v3-claims / Momen-disambig jobs running now are valid Phase-A prefetch.)

## Resolve-against-search (the capability the ordering demands — currently MISSING)
Today `reconcile` recalls candidates by SQL name-match and reads only in-book scenes + a 90-char summary — it
cannot see the accumulated corpus. Upgrade:
- New Store port **`searchGrounded(query, {docs, limit})`** → Meili over the grounded corpus (BOUND claims +
  entity dossiers of COMPLETED books; bound-only naturally excludes un-reconciled material), returns top-k
  compact snippets carrying their `entity_id`.
- `reconcile` adds a grounded-EVIDENCE block to each cluster's dossier → adjudicator decides
  link/create/merge/split on real cross-book evidence (catches transliteration/namesake cases name-recall
  misses, e.g. "the amanuensis Mírzá Aḥmad" → Qazvíní, not Azghandí).
- **dup-guard** (new `entities/dedup-guard.js`): after creates, search grounded corpus for each new entity's
  distinctive claims (birth/death/kin/role/place); a strong match name-recall missed → propose merge (via
  existing `entities/merge.js`).

## Token + parallelism levers
- Resolve at CLUSTER level, not mention level (100s not 10,000s of AI calls/book).
- **Deterministic fast-path**: a cluster with exactly one candidate corroborated by matching claims
  auto-links with NO model call; AI spend only on ambiguous clusters.
- Retrieve-then-reason: search returns short snippets, never full text.
- Cheapest reliable model per language (deepseek-flash EN, haiku FA); prefix-cached disambiguation;
  deterministic mentions/link-claims (free); idempotent resume everywhere.
- Phase A parallel across books + within book (pools); different providers concurrent.

## What EXISTS vs what to BUILD (honest inventory, 2026-07-12)
EXISTS (stage functions, isolated): `enrich/{disambiguate,retrieval(HyPE)}`, `entities/{mentions,claims,
reconcile,project,merge,lookup}`, `concepts/*`, `kernel/*`, `rag-adapter/store.js`. `link-claims` +
`verify-claim-direction` live as scripts in `scripts/entity-read/` (fold into lib).
MISSING: the orchestrator (`pipeline.js` is referenced by CLAUDE.md but **does not exist**), `searchGrounded`
port + search-evidence reconcile, dup-guard, search-verify stage, drop-in watcher hook.

## Build sequence (GROUND FIRST, automate after — per approval)
1. `searchGrounded` port + adapter (Meili over grounded bound-claims/entities) + wire into `reconcile`
   dossier. TDD via `tests/rag/`.
2. `entities/dedup-guard.js` (search-driven merge proposals) + test.
3. search-verify stage (assert cast + sample claims + HyPE return in prod).
4. Hand-driven `complete-book` runner using the above; **ground the ordered core serially**:
   GPB 21310 → DB 21308 → Gate 8632 → ROB v1 429 → ROB 430/431/432 → Balyuzi (28849,462,3789,3887,464,465,467)
   → Máz (15228,15257,15254,20028,15256,20035,20037,15255,15259) → Momen 13433. Resume skips done Phase-A.
5. THEN automate: `pipeline.js` orchestrator over `doc_pipeline` + watcher enqueue → drop-in books auto-run
   Phase A immediately, Phase B when their turn arrives.

## Definition of Done (per book) — see wave1-extraction-pipeline.md
disambiguate → mentions → claims → reconcile(FULL) → project(link+create) → link-claims → dup-guard →
HyPE+Meili sync → **verify searchable**. Never "done" without the final search-verify.
