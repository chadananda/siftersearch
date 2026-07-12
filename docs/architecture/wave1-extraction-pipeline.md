# Wave-1 Extraction Pipeline — operational guide + hardening state

How a book becomes cited, entity-bound knowledge for RAG search. This is the practical run-a-book guide and
the record of what makes the pipeline rock-solid. Interface: `docs/architecture/corpus-rag-library.md`;
library internals: `api/lib/rag/`; the one CLI: `scripts/rag.mjs` (runs ON tower-nas, writes via
`SIFTER_WRITER_URL`).

## The two tracks

**Historical** (factual, ordered by textual rigor — GPB › Dawn-Breakers › Gate › Taherzadeh › Balyuzi ›
Mázindarání › Momen):
```
disambiguate → hype → mentions → claims → reconcile → project(links) → link-claims
```
**Conceptual** (doctrinal, interpretive authority — GPB › Dispensation/World Order › Shoghi Effendi letters):
```
disambiguate → concept-extract → concept-lexicon → concept-reconcile → [concept-project: TODO]
```

## Stage contracts

| Stage | Reads | Writes | Gate | Idempotent? |
|---|---|---|---|---|
| **disambiguate** | paragraphs | `content.context` (per-para identity/time note) | — (produces the gate's input) | yes (tagged `context_model`) |
| **mentions** | disambiguation notes | `entity_mentions_v2` (deferred `entity_id`, sha1 anchor) | disambiguated | yes (anchor de-dup) |
| **claims** | notes + text | `entity_claims` (subject/relation/object/proof, deferred ids) | disambiguated | yes (`claim_hash` INSERT OR IGNORE); **`--resume`** reprocesses only gap paras |
| **reconcile** | mention clusters + lookup | `entity_decisions` (link/create/uncertain/other, proposed) | disambiguated | yes (`--resume` skips decided clusters) |
| **project** | decisions | binds mentions → `graph_entities`; applies LINKS only | — | yes |
| **link-claims** | bound mentions | `entity_claims.entity_id` (claim ← same-para mention, + doc-unambiguous fallback) | — | yes (doc-scoped WRITE self-heals) |

Concept stages mirror this: `concept-extract` → `concept_claims` (deferred `concept_id`); `concept-lexicon` →
`concept_lexicon` (authority-ranked symbol→interpretation); `concept-reconcile` → `concept_decisions`
(bind occurrence → lexicon).

## Invariants (what keeps it correct)

- **Identity is deferred**: extractors never bind `entity_id`; evidence binds it at reconcile. The materialized
  graph is a disposable projection.
- **Proof gate**: a claim survives only if its `proof_verbatim` is an exact ≥8-char substring of the paragraph.
  No anonymous facts.
- **Semantic-role direction**: the subject is the AGENT; passive voice ("X was attacked by Y") must not become
  "X attacked Y". Enforced in the claims prompt + the `verify-claim-direction` audit (relabels active→`-by`,
  drops adversary accusations). See below.
- **Namesake safety**: candidate recall is transliteration-invariant; binding is by evidence, never literal
  name-match. The doc-unambiguous fallback binds a subject globally within a doc only when its name maps to
  exactly one bound entity (keyed on the entity's CORE name, so a relative's "son of X" descriptor can't make X
  ambiguous).
- **English-canonical**: enrichment written in English (cross-lingual unification); proof stays verbatim in the
  source language.

## Model routing (never hard-coded in the library)

`api/lib/pipeline/profile.js` `LANG_ROUTING` + `PROFILE_OVERRIDES` decide per-doc models. DeepSeek-flash is
cheapest and reliable on English/Arabic/Hebrew but **silently fails on Persian** → Persian routes to
Claude-haiku (reliable on all). `kernel/model` resolves the provider from the catalog and runs an escalation
ladder (primary → fallback) with backoff retry. Adding/swapping a model — or a local one — is a config edit.
⚠ Language *detection* can misfire (a Persian text heavy with Arabic quotation reads as `ar`); pin such docs in
`PROFILE_OVERRIDES` with the correct `lang` (and use the REAL ingested doc_id, not a placeholder).

## Run a book

Historical (each stage on tower-nas; back up small entity tables before the reconcile/link writes):
```bash
node scripts/rag.mjs disambiguate <doc> --concurrency=4     # → content.context (skip if already done)
node scripts/rag.mjs mentions <doc>                          # → entity_mentions_v2
node scripts/rag.mjs claims <doc> --threshold=0.9 --concurrency=4   # add --resume to fill gaps after a throttle
# review the claims stats: written / dropped / empty / failed (failed = transient errors → re-run --resume)
node scripts/rag.mjs reconcile <doc> --resume --threshold=0.9 --limit=300   # proposes decisions
node scripts/rag.mjs project <doc> --auto --kinds=link --hiConf=0.9         # apply LINKS; HOLD creates for review
DOC=<doc> WRITE=1 SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/entity-read/link-claims.mjs
```
Conceptual: `concept-extract` → `concept-lexicon` → `concept-reconcile` (same doc-first ordering; GPB seeds the
concept skeleton, the Dispensation the ontology keystone).

Policy: **one AI pass at a time** (rate limits); **reviewed batches** — apply LINKS, HOLD creates for a
create-adjudication pass; everything reversible (small-table gz backups under
`/tank/backups/siftersearch-entity/`).

## Hardening state (2026-07-12)

- **H1 resilience** ✅ — claims writes incrementally per-paragraph; `--resume` reprocesses only gap paragraphs;
  a transient model error is counted as `failed` (recoverable), distinct from a genuine `empty` paragraph — no
  more silent loss. Tested (`tests/rag/claims.test.js`) + validated on a real run (Gate: `failed 0`).
- **Claims direction** ✅ — prompt hardened (agent/patient, narrator-asserted-only, direction-preserving proof)
  + `scripts/entity-read/verify-claim-direction.mjs` audits the suspect set (deterministic select → AI judge)
  and repairs reversed edges / drops slander. Applied to all 7 core books, verified live in search.
- **H5 multilingual** ✅ — Persian docs route to haiku; fixed the phantom-doc_id overrides; validated end-to-end
  on Mázindarání (excellent Persian→English notes, dense mentions, cross-language entity binding).
- **link-claims** ✅ — doc-unambiguous fallback (namesake-safe) + para-id join handles both `external_para_id`
  and `'p'||id` forms.

### Backlog (open)
- **H2** fold `link-claims` (script) → a tested library stage.
- **H3** fold `verify-claim-direction` (script) → a gated library stage that runs after claims; separate audit
  from apply (it currently re-audits on WRITE).
- **H4** concept **canonicalization** stage → populate `concept_entities` (group the 938 granular lexicon
  entries into canonical concepts — a semantic stage, needs design; NOT a mechanical projection).
- **H6** populate `provenance_tier` per claim + a `source_trust` tag → enables
  `docs/architecture/claim-authority-reconciliation.md` (mark claims that contradict the core as
  accusation/likely-mistake).
- **H8** canonical para-id resolution (audit all content joins for the two para-id forms).
- follow-up: persist per-paragraph claim status so `--resume` retries only *failed* paras, not empties.
