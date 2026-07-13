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

## Research-resolve — "uncertain" is a research task, NOT a human-review hold
Holding a figure as "uncertain" for later review offloads the research onto the user. The pipeline must
RESOLVE it autonomously (the [[entity-research]] methodology): for each uncertain cluster / orphaned
claim-figure —
1. **Corpus-first** (authoritative + fast): search Meili across ALL books — is the figure/episode named in
   another, more authoritative book? Did a scholar identify them? (e.g. GPB's bare "Lady Agnew" → the corpus
   shows the attested London figures are Lady Blomfield + Arthur S. Agnew, no corroborating "Lady Agnew"
   episode.)
2. **Web/Wikipedia when the corpus is thin** (WebSearch/WebFetch): who was this figure? (e.g. Lady Agnew of
   Lochnaw = Gertrude Vernon, 1864–1932 — but no source ties her to ‘Abdu'l-Bahá → stays low-confidence.)
3. **Adjudicate** with the gathered evidence: same as an existing entity (link) / distinct new person (create,
   cited) / likely-artifact (drop) / genuinely-thin (hold at low confidence, never assert).
4. **Commit** a grounded, cited resolution. Never punt to the user.

**EVERY evidence item records its SOURCE — provenance is mandatory, especially for out-of-corpus evidence.**
We can only authority-rank a resolution if we know where its evidence came from:
- **In-corpus** evidence → `{source_doc_id, para_id, authority_tier}` (ranked by the authority plan:
  GPB/Shoghi Effendi > Dawn-Breakers > rigorous scholars > … — via `api/lib/authority.js` / `doc-tier.js`).
- **External** evidence (web / Wikipedia / Perplexity) → `{url, source_title, retrieved_at, authority_tier:
  'external-web'}` — the LOWEST tier, explicitly BELOW every in-corpus source. A fact resting only on external
  web evidence is flagged as such (low confidence, corroboration-only), never allowed to outrank a corpus
  source. Store the reference so the ranking (and any later re-adjudication) can see exactly what it stands on.
No anonymous evidence — in-corpus or external, the resolution carries its citation.

Built as `entities/research-resolve` (Lurch 6). Ports: `searchCorpus` (Meili, all books, returns doc→authority
tier) + a web-research port (WebSearch/WebFetch or the deep-research worker `api/lib/deep-research.js`) that
returns `{answer, sources[]}`. Runs on each book's `uncertain` set as part of the DoD — a book isn't done until
its uncertains are researched (with sourced evidence), not merely held.

### Backward re-resolution — the convergence sweep (TO BUILD)
research-resolve runs FORWARD-ONLY: each book is resolved against the corpus grounded *at that moment*. So a
figure held "uncertain" in an early book was researched against only the *earlier* corpus — e.g. Dawn-Breakers
(book 2) had 330 uncertain martyrs, researched against GPB + web alone, because Mázindarání and the Nayríz
biographies (Ahdieh/Rabbani) that explain many of them are grounded *later* in the sequence. Those tails do NOT
resolve on their own. **Convergence requires a backward sweep:** after later books are grounded, RE-RUN
research-resolve over ALL accumulated `uncertain` clusters against the now-fuller grounded corpus — an
early-book blank becomes resolvable once the book that explains it is absorbed. Idempotent + reversible
(proposes decisions; the guard skips non-integer link ids). Run it periodically during the wave and once as a
final pass; it is the mechanism that makes cumulative ordering actually *converge* rather than strand tails.
The biography progress popup surfaces the per-book `unresolved` count so the size of this tail is always visible.

## Definition of Done (per book) — see wave1-extraction-pipeline.md
disambiguate → mentions → claims → reconcile(FULL) → project(link+create) → link-claims → dup-guard →
HyPE+Meili sync → **verify searchable**. Never "done" without the final search-verify.
