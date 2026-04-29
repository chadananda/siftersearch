# Test Layers

Three layers, each catching a different class of regression. All three measure both **quality** and **performance** — a slow-but-correct system fails just as much as a fast-but-wrong one.

## Layer 1 — Health checks (operational, continuous)

`scripts/health-check.mjs` — single-pass probe. Designed to be called periodically by the watchdog (or on demand via SSH).

```bash
# Full probe (includes chat smoke test, ~10s)
node scripts/health-check.mjs

# Quick probe (skip chat smoke, ~2s)
node scripts/health-check.mjs --quick

# Machine-readable for watchdog
node scripts/health-check.mjs --json
```

Exit code 0 = healthy, 1 = degraded/down. Probes:
- API (Cloudflare → tower-nas → Fastify health endpoint, latency)
- Meilisearch paragraphs index (size + embedding ratio)
- Meilisearch hype_questions sidecar (size + embedding ratio)
- boss vLLM (responding + model loaded)
- PM2 process state (all 5 expected processes online)
- SQLite recent worker writes (24h window — proves worker is alive)
- Enrichment progress (% paragraphs with context/hype, recent writes)
- Chat smoke test (single short query, full SSE round-trip)

Each check classifies as **ok** / **warn** / **fail** with a specific message and relevant metrics.

## Layer 2 — Quality + performance batteries (primitive APIs)

Scorable test arrays for the primitive APIs Jafar's chat sits on top of. **Run these BEFORE building/scoring full conversations** — they isolate where quality issues come from (search? library? crafter?).

### Search (`tests/quality/search-fixtures.json` + `score-search.mjs`)

12 fixtures covering: phrase-match, concept-match, literal-name match (Pythagoras), anti-tests (primary should beat secondary). Score = (rank in top-K) × (text-match check) × (anti-test check).

```bash
node tests/quality/score-search.mjs            # human report
node tests/quality/score-search.mjs --json     # machine
node tests/quality/score-search.mjs --top-k=5  # tighter cutoff
```

Reports MRR, p50/p95 latency, per-fixture pass/fail.

### Library (`tests/quality/library-fixtures.json` + `score-library.mjs`)

10 fixtures covering canonical-works lookups (Tablet of Wisdom, Iqán, Aqdas, Tablet of Ahmad, etc.). Verifies `find_document_for_citation` returns the expected doc_id, paragraph range, and is_primary flag.

```bash
node tests/quality/score-library.mjs
```

Catches regressions like "Tablet of Ahmad fuzzy-matches to Tablet to Alí Páshá" (which we hit before adding 1616 to CANONICAL_WORKS).

### Chat single-turn (`tests/chat/run-scenarios.js`, existing)

Pre-built rubric (12-dimension, in `tests/chat/rubric.js`) — already scores Jafar replies. Run before evaluating full conversations:

```bash
node tests/chat/run-scenarios.js                    # all 100
node tests/chat/run-scenarios.js --category factual # one category
node tests/chat/run-scenarios.js --ids 1,2,3        # specific IDs
```

## Layer 3 — Behavioral tests (built features)

`tests/behavioral/dialogue.test.js` (vitest) — validates every dialog in `src/content/dialogs/` for structural completeness. Catches the regressions you've had to point out manually:

- Hero image referenced but file missing (broken images)
- Q/A summary headers (`### question?` / `#### answer.`) absent
- Block quotes rendered as `>>+` (nested blockquote markup)
- Frontmatter schema violations (`flags:` instead of `flags: []`, missing fields)
- Doubled-prefix stream-concat glitches ("YesYes...", "BahBah...")
- Citation links pointing to nonexistent doc ID patterns (`/document_id=N` instead of `/document/N`)
- Assessment block malformed
- featured/published flags out of sync with qualityScore

```bash
npx vitest run tests/behavioral/dialogue.test.js
```

**Strictness gate:** drafts (`published: false`) get LIGHT validation; published dialogs get FULL enforcement. Legacy archive content stays green; pipeline regressions get caught.

## Adding new test cases

### New search fixture
Edit `search-fixtures.json`. Required: `id`, `query`, `intent` (human description), at least one of: `expected_doc_id` (with optional `expected_passage_range`) or `expected_author_contains`. Optional: `expected_text_contains` array, `expected_author_not_contains` (anti-test), `religion_filter`.

### New library fixture
Edit `library-fixtures.json`. Required: `id`, `method`, `args`, `expected_top_doc_id`. Optional: `expected_paragraph_range`, `expected_is_primary`.

### New behavioral check
Add an `it()` inside the per-dialog `describe()` block in `tests/behavioral/dialogue.test.js`. Use `it.skipIf(!isPublished)(...)` for strict checks that only apply to published dialogs.

## Running everything

A future `tests/quality/run-all.mjs` could orchestrate; for now run each individually. Each script returns exit 0 on full pass, 1 on any failure — friendly for CI / cron.
