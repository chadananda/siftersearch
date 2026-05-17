# SifterSearch Entity Layer — Execution Plan

**Audience:** Claude Code. Terse. Each step: action, files, test, success-gate, rollback. Stop on test failure.

## 0. Constants

```yaml
budget_usd_monthly: 1000
deepseek_v3_promo_ends: 2026-05-31T15:59:00Z
extractor_version: v1
models:
  # DeepSeek model IDs are OpenAI-compatible API IDs — verify at https://api.deepseek.com/models before first run
  bulk: deepseek-chat           # DeepSeek V3 — fast/cheap extraction
  adjudicate_promo: deepseek-reasoner  # DeepSeek R1 — higher-quality adjudication during promo
  adjudicate_post: deepseek-chat + claude-sonnet-4-6  # after promo ends
  validate: claude-haiku-4-5-20251001  # batch API, 50% discount
  arbiter: claude-sonnet-4-6
  apex: claude-opus-4-7
endpoints:
  deepseek: https://api.deepseek.com/v1  # OpenAI-compatible; use OpenAI client with custom baseURL
  anthropic: https://api.anthropic.com
env_required:
  - DEEPSEEK_API_KEY
  - ANTHROPIC_API_KEY
  - SIFTER_DB_PATH (existing)
  - MEILISEARCH_HOST (existing)
  - MEILISEARCH_API_KEY (existing)
  - EXTRACTION_BUDGET_USD (default 1000)
```

## 1. Migration 72 — schema

**File:** `api/lib/migrations/v72-v90.js` (new file — JS async functions, NOT SQL files)

**Register in `api/lib/migrations/runner.js`:**
```javascript
import { migrations as v72to90 } from './v72-v90.js';
export const migrations = { ...v1to25, ...v26to45, ...v46to58, ...v72to90 };
// Also bump CURRENT_VERSION to 72
```

**Migration 72 content:**

```javascript
export const migrations = {
  72: async () => {
    logger.info('Starting migration 72: entity layer schema');

    // --- New entity-layer tables ---
    await query(`CREATE TABLE IF NOT EXISTS entity_aliases (
      id INTEGER PRIMARY KEY,
      entity_id INTEGER NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
      surface TEXT NOT NULL,
      surface_norm TEXT NOT NULL,
      lang TEXT DEFAULT 'en',
      source TEXT,
      confidence REAL DEFAULT 1.0,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await query(`CREATE TABLE IF NOT EXISTS entity_mentions (
      id INTEGER PRIMARY KEY,
      entity_id INTEGER NOT NULL REFERENCES graph_entities(id),
      content_id TEXT NOT NULL REFERENCES content(id),
      role TEXT,
      resolution_confidence REAL,
      status TEXT DEFAULT 'resolved',
      extractor_version TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await query(`CREATE TABLE IF NOT EXISTS paragraph_roles (
      id INTEGER PRIMARY KEY,
      content_id TEXT NOT NULL REFERENCES content(id),
      speaker_entity_id INTEGER REFERENCES graph_entities(id),
      narrator_entity_id INTEGER REFERENCES graph_entities(id),
      addressee_entity_id INTEGER REFERENCES graph_entities(id),
      setting_place_entity_id INTEGER REFERENCES graph_entities(id),
      setting_time TEXT,
      extractor_version TEXT
    )`);

    await query(`CREATE TABLE IF NOT EXISTS entity_sets (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      set_type TEXT,
      religion TEXT,
      source_authority_tier TEXT REFERENCES authority_tiers(tier),
      notes TEXT
    )`);

    await query(`CREATE TABLE IF NOT EXISTS set_members (
      set_id INTEGER NOT NULL REFERENCES entity_sets(id),
      entity_id INTEGER NOT NULL REFERENCES graph_entities(id),
      ordinal INTEGER,
      source_paragraph_id TEXT REFERENCES content(id),
      PRIMARY KEY (set_id, entity_id)
    )`);

    await query(`CREATE TABLE IF NOT EXISTS quote_clusters (
      id INTEGER PRIMARY KEY,
      speaker_entity_id INTEGER REFERENCES graph_entities(id),
      canonical_text TEXT,
      lang TEXT,
      instance_count INTEGER DEFAULT 1
    )`);

    await query(`CREATE TABLE IF NOT EXISTS quote_instances (
      id INTEGER PRIMARY KEY,
      cluster_id INTEGER REFERENCES quote_clusters(id),
      content_id TEXT NOT NULL REFERENCES content(id),
      span_start INTEGER, span_end INTEGER,
      speaker_surface TEXT,
      speaker_entity_id INTEGER REFERENCES graph_entities(id),
      attribution_pattern TEXT,
      nesting_depth INTEGER DEFAULT 0,
      extractor_version TEXT
    )`);

    await query(`CREATE TABLE IF NOT EXISTS paragraph_extractions (
      id INTEGER PRIMARY KEY,
      content_id TEXT NOT NULL REFERENCES content(id),
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      output_json TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cached_tokens INTEGER,
      cost_usd REAL,
      resolved INTEGER DEFAULT 0,
      extractor_version TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await query(`CREATE TABLE IF NOT EXISTS extraction_validations (
      id INTEGER PRIMARY KEY,
      extraction_id INTEGER NOT NULL REFERENCES paragraph_extractions(id),
      validator_model TEXT,
      errors_json TEXT,
      confidence REAL,
      recommended_action TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await query(`CREATE TABLE IF NOT EXISTS extraction_runs (
      id INTEGER PRIMARY KEY,
      model TEXT NOT NULL,
      task_type TEXT NOT NULL,
      paragraph_id TEXT,
      run_id TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cached_tokens INTEGER,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await query(`CREATE TABLE IF NOT EXISTS er_audit_log (
      id INTEGER PRIMARY KEY,
      action TEXT NOT NULL,
      candidate TEXT,
      model_votes TEXT,
      evidence_paragraphs TEXT,
      run_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await query(`CREATE TABLE IF NOT EXISTS model_calibration (
      id INTEGER PRIMARY KEY,
      model TEXT NOT NULL,
      category TEXT NOT NULL,
      accuracy REAL,
      sample_size INTEGER,
      run_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(model, category)
    )`);

    await query(`CREATE TABLE IF NOT EXISTS promotion_queue (
      id INTEGER PRIMARY KEY,
      surface_norm TEXT NOT NULL,
      type TEXT,
      context_snippet TEXT,
      doc_id TEXT,
      content_id TEXT,
      resolved INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await query(`CREATE TABLE IF NOT EXISTS authority_tiers (
      tier TEXT PRIMARY KEY,
      rank INTEGER NOT NULL,
      description TEXT,
      is_closed_corpus INTEGER
    )`);

    const tiers = [
      ['revealed', 100, 'Words of a Manifestation of God (Bahá\'u\'lláh, the Báb) — primary scripture', 1],
      ['central_figure', 90, 'Writings of ʿAbdu\'l-Bahá as Centre of the Covenant', 1],
      ['authorized_interpretation', 80, 'Writings of Shoghi Effendi in his interpretive capacity — doctrinally binding; closed 1957', 1],
      ['institutional', 70, 'Letters and pronouncements of the Universal House of Justice', 0],
      ['approved_history', 60, 'Histories explicitly approved by the central institution', 0],
      ['primary_scripture_other', 90, 'Primary scripture of non-Bahá\'í traditions — within its own tradition', 1],
      ['tradition_doctrinal', 75, 'Doctrinally binding interpretation within a tradition', 0],
      ['tradition_authoritative', 65, 'Authoritative-but-not-doctrinal works (major commentaries, classical histories)', 0],
      ['scholarly', 40, 'Modern academic scholarship', 0],
      ['secondary', 30, 'Devotional, biographical, or interpretive works without doctrinal standing', 0],
      ['reference', 20, 'Encyclopedia entries, dictionaries, general reference works', 0],
      ['unknown', 10, 'Source authority undetermined', 0],
    ];
    for (const [tier, rank, desc, closed] of tiers) {
      await query(`INSERT OR IGNORE INTO authority_tiers VALUES (?,?,?,?)`, [tier, rank, desc, closed]);
    }

    await query(`CREATE TABLE IF NOT EXISTS significance_markers (
      id INTEGER PRIMARY KEY,
      subject_entity_id INTEGER REFERENCES graph_entities(id),
      marker_type TEXT,
      marker_value TEXT,
      source_paragraph_id TEXT REFERENCES content(id),
      source_authority_tier TEXT REFERENCES authority_tiers(tier),
      source_work_id TEXT REFERENCES docs(id),
      notes TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await query(`CREATE TABLE IF NOT EXISTS periods (
      id TEXT PRIMARY KEY,
      religion TEXT,
      parent_id TEXT REFERENCES periods(id),
      name TEXT,
      date_start TEXT, date_end TEXT,
      date_precision TEXT,
      sort_order INTEGER
    )`);

    await query(`CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      period_id TEXT REFERENCES periods(id),
      name TEXT,
      date_start TEXT, date_end TEXT, date_precision TEXT,
      narrative_summary TEXT,
      source_paragraph_ids TEXT
    )`);

    await query(`CREATE TABLE IF NOT EXISTS pending_bridge_relations (
      id INTEGER PRIMARY KEY,
      subject_entity_id INTEGER REFERENCES graph_entities(id),
      predicate TEXT NOT NULL,
      target_tradition TEXT NOT NULL,
      target_literal TEXT NOT NULL,
      target_entity_id INTEGER REFERENCES graph_entities(id),
      evidence_paragraph_id TEXT REFERENCES content(id),
      modality TEXT,
      confidence REAL,
      source_authority TEXT,
      source_authority_tier TEXT REFERENCES authority_tiers(tier),
      status TEXT DEFAULT 'pending_target',
      created_at INTEGER DEFAULT (unixepoch()),
      resolved_at INTEGER
    )`);

    // --- Extend existing tables (idempotent: ignore duplicate column errors) ---
    const addCol = async (tbl, col, def) => {
      try { await query(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`); } catch {}
    };

    // Extend graph_entities (existing table from migration 50)
    await addCol('graph_entities', 'source_authority_tier', 'TEXT REFERENCES authority_tiers(tier)');
    await addCol('graph_entities', 'cross_tradition_candidate', 'INTEGER DEFAULT 0');

    // Extend graph_relations (existing table from migration 50)
    await addCol('graph_relations', 'source_authority_tier', 'TEXT REFERENCES authority_tiers(tier)');

    // Extend content
    await addCol('content', 'text_grounded', 'TEXT');
    await addCol('content', 'grounding_confidence', 'REAL');
    await addCol('content', 'grounding_notes', 'TEXT');
    await addCol('content', 'graph_enriched', 'INTEGER DEFAULT 0');
    await addCol('content', 'graph_enriched_at', 'TEXT');
    await addCol('content', 'extractor_version', 'TEXT');
    await addCol('content', 'period_id', 'TEXT');
    await addCol('content', 'episode_id', 'TEXT');
    await addCol('content', 'grounded_synced', 'INTEGER DEFAULT 0');

    // Extend docs with priority column for extraction ordering
    await addCol('docs', 'doc_priority', 'INTEGER DEFAULT 100');

    // --- Indexes ---
    await query(`CREATE INDEX IF NOT EXISTS idx_content_graph_unsync ON content(graph_enriched) WHERE graph_enriched = 0`);
    await query(`CREATE INDEX IF NOT EXISTS idx_em_entity ON entity_mentions(entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_em_content ON entity_mentions(content_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_alias_surface ON entity_aliases(surface_norm)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_alias_entity ON entity_aliases(entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_quote_cluster ON quote_instances(cluster_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_promotion_priority ON promotion_queue(priority DESC, attempts ASC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_episodes_period ON episodes(period_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sig_entity ON significance_markers(subject_entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sig_tier ON significance_markers(source_authority_tier)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pending_bridge ON pending_bridge_relations(target_tradition, status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_extractions_resolved ON paragraph_extractions(resolved)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_extraction_runs_date ON extraction_runs(created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_docs_priority ON docs(doc_priority DESC)`);

    logger.info('Migration 72 complete: entity layer schema');
  }
};
```

**Authority-tier vocabulary** (seeded by migration):

Tier semantics in the graph:
- Conflict resolution: when two sources make contradictory claims, the higher-tier source wins. This is not "scholarly consensus"; it's authority-aware truth-tracking.
- Display: significance markers from `authorized_interpretation` tier are surfaced first in person/concept dossiers and not overridden by scholarly claims.
- Cross-tradition bridges: the source authority that *asserts* a bridge determines the bridge's tier. A bridge mined from GPB is `authorized_interpretation`-tier within the Bahá'í framework; a bridge mined from a Christian patristic source is the appropriate Christian tier within that tradition.
- The `is_closed_corpus = 1` flag is informational but doctrinally significant: it tells the graph that no new works can ever be added to that tier. Particularly relevant for Bahá'í `revealed`, `central_figure`, and `authorized_interpretation` tiers.

**Test:**
```bash
node -e "import('./api/lib/migrations/runner.js').then(m => m.runMigrations())"
sqlite3 $SIFTER_DB_PATH ".schema entity_mentions" | grep -q entity_id
sqlite3 $SIFTER_DB_PATH "SELECT COUNT(*) FROM content;"  # unchanged
sqlite3 $SIFTER_DB_PATH "PRAGMA index_list('content');" | grep -q idx_content_graph_unsync
```

**Success:** all 14 new tables exist, all indexes present, content row count unchanged.

**Rollback:** `DROP TABLE` each new table; `ALTER TABLE graph_entities/graph_relations/content/docs` columns cannot be dropped in SQLite — must restore from backup.

## 2. Model client modules

**Extend `api/lib/ai.js`** (NOT a new `api/services/llm/` directory — extend the existing pattern):
- Add `getDeepSeek()` lazy-init: `new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' })`
- Add `chatDeepSeek()` helper following existing `chatOpenAI` pattern
- Add `'deepseek'` case to `chatCompletion()` switch

**Extend `api/lib/model-registry.js`** (add to MODEL_REGISTRY):
```javascript
// IMPORTANT: Verify these IDs at https://api.deepseek.com/models before first run.
// Likely IDs: deepseek-chat (V3 fast) and deepseek-reasoner (R1 reasoning).
// Stored as constants here so a single-line change corrects any mismatches.
'deepseek-chat': {
  provider: 'deepseek', name: 'DeepSeek V3', type: 'chat',
  pricing: { input: 0.00027, output: 0.0011 }, contextWindow: 64000, maxOutput: 8192,
  capabilities: ['extraction', 'classification', 'json_schema'],
  quality: 'quality', speed: 'fast',
  notes: 'OpenAI-compatible. Supports response_format json_schema for structured extraction.'
},
'deepseek-reasoner': {
  provider: 'deepseek', name: 'DeepSeek R1', type: 'chat',
  pricing: { input: 0.00055, output: 0.0022 }, contextWindow: 64000, maxOutput: 8192,
  capabilities: ['reasoning', 'adjudication', 'analysis'],
  quality: 'premium', speed: 'medium',
  notes: 'Use for promotion adjudication and high-stakes resolution. Promo price until 2026-05-31.'
},
'claude-haiku-4-5-20251001': {
  provider: 'anthropic', name: 'Claude Haiku 4.5', type: 'chat',
  pricing: { input: 0.00025, output: 0.00125 }, contextWindow: 200000, maxOutput: 8192,
  capabilities: ['validation', 'classification', 'batch'],
  quality: 'balanced', speed: 'very_fast',
  notes: 'Use via Anthropic batch API for 50% discount on validation passes.'
},
```

**New file `api/lib/entity-cost-tracker.js`:**
```javascript
// Tracks AI spend for extraction pipeline. Writes to extraction_runs table.
import { query, queryOne } from './db.js';

export async function trackCost({ model, taskType, paragraphId, runId, inputTokens, outputTokens, cachedTokens, costUsd }) {
  await query(
    `INSERT INTO extraction_runs (model, task_type, paragraph_id, run_id, input_tokens, output_tokens, cached_tokens, cost_usd) VALUES (?,?,?,?,?,?,?,?)`,
    [model, taskType, paragraphId, runId, inputTokens, outputTokens, cachedTokens, costUsd]
  );
}

export async function getMonthlySpend() {
  const row = await queryOne(`SELECT COALESCE(SUM(cost_usd),0) as total FROM extraction_runs WHERE created_at > strftime('%s','now','start of month')`);
  return row.total;
}

const BUDGET = parseFloat(process.env.EXTRACTION_BUDGET_USD ?? '1000');

export async function checkBudget() {
  const spend = await getMonthlySpend();
  const fraction = spend / BUDGET;
  if (fraction >= 1.0) return { fraction, action: 'halt' };
  if (fraction >= 0.8) return { fraction, action: 'local' };  // switch to Qwen
  if (fraction >= 0.5) return { fraction, action: 'warn' };
  return { fraction, action: 'ok' };
}
```

**Test:**
```bash
node -e "const {getDeepSeek} = await import('./api/lib/ai.js'); console.log(!!getDeepSeek())"
node -e "const {getModel} = await import('./api/lib/model-registry.js'); console.log(getModel('deepseek-chat'))"
```

**Success:** DeepSeek client initializes; model registry returns entries; cost tracker inserts rows.

## 3. DeepSeek trust calibration

**File:** `scripts/calibrate-deepseek.js` + fixture `scripts/calibration/bahai-calibration-set.json`.

**Calibration set:** 100 questions across 5 categories (25/20/20/20/15). Source: derive answers from GPB + Dawn-Breakers paragraphs already in `content` table. Each item: `{id, category, question, expected_answer_keywords[], reference_paragraph_ids[], difficulty}`.

**Generation procedure (one-time, gated by `--regenerate-fixture` flag):**
1. Sonnet 4.6 generates 120 candidate questions from sample GPB paragraphs.
2. For each, Sonnet 4.6 extracts the expected answer + reference paragraph IDs from corpus.
3. Filter: keep only items where Sonnet's answer is verifiable against `content.text`.
4. Final 100 items committed as fixture.

**Calibration run (`--run`):**
1. For each item, query `deepseek-chat`, `deepseek-reasoner` (if pre-May 31), `claude-haiku-4-5-20251001`, `claude-sonnet-4-6` in parallel.
2. Score each response against `expected_answer_keywords` (semantic match via embeddings, threshold 0.75).
3. Write per-model, per-category accuracy to `model_calibration` table.

**Routing rules table:** computed from calibration scores:
- category accuracy ≥ 0.85 → trust DeepSeek standalone
- 0.70–0.85 → DeepSeek extracts, Haiku validates 100% of category
- < 0.70 → route category directly to Sonnet 4.6

**Test:**
```bash
node scripts/calibrate-deepseek.js --regenerate-fixture  # one-time
node scripts/calibrate-deepseek.js --run
sqlite3 $SIFTER_DB_PATH "SELECT model, category, accuracy FROM model_calibration ORDER BY model, category;"
```

**Success:** all 5 categories have scored values for all 4 models. Routing rules generated and written to `config/model-routing.json`.

**Cost:** ~$15–20 one-time.

## 4. Graph DB access layer

**Extend `api/lib/graph-db.js`** (existing file — NOT a new `api/services/graph-db.js`).

**Note on existing SCHEMA constant:** `graph-db.js` has an inline `SCHEMA` variable that diverges from migration 50 (adds `language` column, uses `source_doc_ids` JSON). Remove the inline SCHEMA constant — migration 50 is authoritative. New functions must work with actual DB columns.

**Add exports:**
```
findEntity({surface, type?, religion?, lang?}) → {entity_id, confidence, method}
resolveAlias(surface_norm, lang?) → entity_id | null
createEntity({canonical_name, type, religion, aliases[]}) → entity_id
addAlias(entity_id, {surface, surface_norm, lang, source, confidence})
mergeEntities(keeper_id, merged_ids[], audit: {reason, evidence}) → audit_id
splitEntity(entity_id, splits: [{aliases[], mentions[]}], audit) → [new_ids]
getMentions(entity_id, filters?) → rows
getRelations(entity_id, direction: 'in'|'out'|'both') → rows
recordExtraction({content_id, model, promptVersion, outputJson, tokens, cost}) → id
```

`surface_norm`: lowercase, NFD decompose, strip combining marks except for explicit canonical diacritics (Bahá'í transliteration policy lives in `config/orthography-policy.json`).

**Test:**
```bash
node test/graph-db.test.js  # uses fixture in-memory SQLite; 20 unit tests
```

**Success:** all unit tests pass. Merge/split operations write reversible audit rows.

## 5. Orthography policy

**File:** `config/orthography-policy.json`.

**Source of truth:** the spell-checked GPB in your corpus (locate via `SELECT id FROM docs WHERE title LIKE '%God Passes By%' AND deleted_at IS NULL LIMIT 1`).

**Rules to encode:**
- Preserve ʻayn (ʻ U+02BB), hamza (ʼ U+02BC), macrons (ā ē ī ō ū), under-dots (ḥ ṭ ṣ ẓ ḍ), acute accents (á é í ó ú).
- Never substitute ASCII apostrophe for ʻayn or hamza.
- Canonical form = form as it appears in GPB. All other variants are aliases.
- `surface_norm` for matching: NFD + strip combining marks + lowercase.

**Test:**
```bash
node -e "const {normalizeSurface} = await import('./api/lib/graph-db.js'); console.log(normalizeSurface('Bahá\u02bcu\u02bclláh'))"
```

## 6. Meilisearch synonym sync

**File:** `api/lib/graph-meili-sync.js`.

**Function:** `syncAliasesToMeili()` reads `entity_aliases`, builds synonym map (`canonical_name ↔ [aliases]`), patches Meili `paragraphs` index settings. **CRITICAL:** preserve `embedders` config on every PATCH (the documented invariant in `api/lib/search.js`).

**Trigger:** runs after every promotion batch and on startup.

**Test:**
```bash
node scripts/sync-aliases-to-meili.js
curl -s "$MEILISEARCH_HOST/indexes/paragraphs/settings/synonyms" -H "Authorization: Bearer $MEILISEARCH_API_KEY" | jq '. | length'
# Expect non-zero after seed step (10)
curl -s "$MEILISEARCH_HOST/indexes/paragraphs/settings/embedders" -H "Authorization: Bearer $MEILISEARCH_API_KEY" | jq '.default.dimensions'
# Expect 512 — confirms embedder config preserved (system uses text-embedding-3-large @ 512 MRL dims)
```

**Success:** synonyms populated; embedder dimensions = 512 and config intact.

## 7. Extraction prompt v1

**Files:** `api/lib/llm-prompts/extract-v1.md` + `api/lib/llm-prompts/extract-v1.schema.json`.

**Prompt structure:** system message gives task description, orthographic policy, candidate-entity dictionary (top 30 candidates from `findEntity` over surface tokens). User message contains paragraph text + structural envelope (work, author, period, preceding-paragraph speaker/setting).

**Output schema (strict JSON):**
```json
{
  "mentions": [{"surface","span":[s,e],"type","local_role","proposed_entity_id"}],
  "referring_expressions": [{"surface","span","class","proposed_referent","method","confidence"}],
  "roles": {"speaker","narrator","addressee","setting_place","setting_time"},
  "quotations": [{"span","speaker_surface","speaker_candidate","attribution_pattern","nesting_depth"}],
  "relations": [{"subject","predicate","object","evidence_span","modality","confidence"}],
  "text_grounded": "...",
  "grounding_confidence": 0.0,
  "grounding_notes": "...",
  "uncertainties": []
}
```

**Hard constraints in prompt:** preserve diacritics exactly; propose candidate entity IDs only from supplied dictionary; never invent IDs; mark uncertain referents in `uncertainties[]` instead of guessing.

**DeepSeek call:** uses `response_format: {type: "json_schema", schema: ...}` for structured output enforcement.

**Test:**
```bash
node scripts/test-extraction-prompt.js --paragraphs 50 --doc-filter "God Passes By"
# Validates 50 GPB paragraphs: JSON schema validity, span correctness, no hallucinated entity IDs
```

**Success:** ≥99% JSON validity, ≥95% spans within paragraph bounds, 0 hallucinated entity IDs.

## 8. Extraction worker

**File:** `api/workers/graph-extractor.js` (new PM2 process: `siftersearch-graph-extractor`).

**Doc-priority ordering:** `priority_for_doc()` is NOT implementable as a SQL function in SQLite (no stored procedures). Instead:

1. On worker startup, run `scripts/apply-doc-priority.js` which reads `config/doc-tier-priority.json` and updates `docs.doc_priority` for all matching docs.
2. Worker query uses `ORDER BY (SELECT doc_priority FROM docs WHERE id = c.doc_id) DESC NULLS LAST`.

**File `scripts/apply-doc-priority.js`:**
```javascript
// Reads config/doc-tier-priority.json, populates docs.doc_priority column.
// Run once after migration 72, then after any config change.
```

**Loop:**
```
1. SELECT c.id, c.text, c.doc_id, c.paragraph_index FROM content c
   WHERE c.graph_enriched = 0 AND c.deleted_at IS NULL
   ORDER BY (SELECT doc_priority FROM docs WHERE id = c.doc_id) DESC NULLS LAST
   LIMIT batch_size;
2. For each batch (default 16 concurrent DeepSeek calls):
   - Check checkBudget() — halt or switch to Qwen if needed
   - Look up candidate-entity dictionary via findEntity on surface tokens
   - Build prompt with structural envelope
   - Call chatCompletion({provider:'deepseek', model:'deepseek-chat', response_format:{type:'json_schema',...}})
3. Validate JSON output against schema.
4. Write to paragraph_extractions (raw JSON + tokens + cost + extractor_version).
5. Call trackCost() from api/lib/entity-cost-tracker.js.
6. UPDATE content SET graph_enriched = 1, graph_enriched_at = datetime('now') WHERE id = ?
```

**Failure handling:** schema-invalid output → retry once with explicit "fix the JSON" instruction → if still fails, mark `graph_enriched = -1` (error) and continue.

**Cache strategy:** system prompt (~2000 tokens) + orthographic policy + entity dictionary are all cacheable. Structure messages so first ~3000 tokens are stable across all calls in a session.

**Test:**
```bash
# Queue 100 GPB paragraphs
sqlite3 $SIFTER_DB_PATH "UPDATE content SET graph_enriched = 0 WHERE doc_id IN (SELECT id FROM docs WHERE title = 'God Passes By') LIMIT 100;"
timeout 120 node api/workers/graph-extractor.js --once --limit 100
sqlite3 $SIFTER_DB_PATH "SELECT COUNT(*) FROM paragraph_extractions WHERE extractor_version = 'v1';"  # expect 100
sqlite3 $SIFTER_DB_PATH "SELECT SUM(cost_usd) FROM extraction_runs WHERE task_type = 'extract' AND created_at > unixepoch()-300;"
```

**Success:** 100 paragraphs extracted; total cost < $0.10; cache hit ratio > 50% by end of batch.

**Rollback:** `UPDATE content SET graph_enriched = 0 WHERE graph_enriched_at > ?; DELETE FROM paragraph_extractions WHERE created_at > ?`

## 9. Validation worker (Haiku QA)

**File:** `api/workers/graph-validator.js` (new PM2 process: `siftersearch-graph-validator`).

**Function:** samples extractions for QA validation by `claude-haiku-4-5-20251001` (batch API for 50% discount).

**Sampling rules per paragraph (driven by `model_calibration` routing):**
- Trusted category (Flash accuracy ≥ 0.85): sample 5% randomly
- Untrusted category (0.70–0.85): validate 100%
- Below threshold: re-extract with Sonnet directly (skip validator)

**Validation prompt:** Haiku receives original paragraph + DeepSeek's extraction JSON. Task: "Identify any incorrect entity attributions, fabricated relations, wrong speaker assignments, or hallucinated dates. Output JSON: `{errors: [...], confidence: 0–1, recommended_action: 'accept'|'reextract'|'arbitrate'}`."

**On `arbitrate`:** queue for Sonnet 4.6.

**On `reextract`:** mark `graph_enriched = 0` for re-run (use Sonnet directly this time).

**Output written to:** `extraction_validations` table (defined in migration 72).

**Cost guardrail:** validator burns budget fast if untrusted-category fraction is high. If validator monthly spend > $200, escalate alert and switch trusted-category sampling to 1%.

**Test:**
```bash
node api/workers/graph-validator.js --once
sqlite3 $SIFTER_DB_PATH "SELECT recommended_action, COUNT(*) FROM extraction_validations GROUP BY recommended_action;"
```

**Success:** all sampled extractions have validation rows; ≤5% recommended_action='reextract' on GPB.

## 10. Resolution worker

**File:** `api/workers/graph-resolver.js` (new PM2 process: `siftersearch-graph-resolver`).

**Loop:**
```
1. SELECT * FROM paragraph_extractions WHERE resolved = 0 ORDER BY id LIMIT batch;
2. For each extraction's mentions, run cascade:
   a. resolveAlias(surface_norm, lang) — deterministic dict
   b. Meilisearch alias index — fuzzy match
   c. deepseek-chat pairwise — "Is mention X the same as canonical Y given context Z?"
      - Run in parallel for top-3 candidates per mention
      - Conservative: require winning candidate confidence ≥ 0.85 AND ≥ 2 candidates ranked
3. If cascade resolves with confidence ≥ 0.85: write entity_mentions row.
4. If 0.65–0.85: write entity_mentions row with status='probable' and queue for adjudication.
5. If < 0.65: write to promotion_queue with surrounding context.
6. Relations: write only if BOTH subject and object resolved at confidence ≥ 0.85.
7. Quotations: write quote_instances; cluster step deferred to step 14.
8. Roles: write paragraph_roles for all roles where entity resolved.
9. Grounded text: write to content.text_grounded; flag content.grounded_synced = 0.
10. UPDATE paragraph_extractions SET resolved = 1 WHERE id = ?;
```

**Test:**
```bash
node api/workers/graph-resolver.js --once --limit 100
sqlite3 $SIFTER_DB_PATH "SELECT COUNT(*), AVG(resolution_confidence) FROM entity_mentions WHERE created_at > unixepoch()-300;"
```

**Success:** resolution rate ≥ 80% on GPB.

## 11. Promotion adjudicator (autonomous)

**File:** `api/workers/graph-promoter.js` (new PM2 process; runs hourly).

**Logic:** human-in-loop replaced with **cross-model voting**.

```
1. Aggregate promotion_queue by surface_norm:
   SELECT surface_norm, type, COUNT(*) as freq,
          group_concat(DISTINCT context_snippet, '|||') as contexts
   FROM promotion_queue WHERE resolved = 0 GROUP BY surface_norm, type
   HAVING freq >= 3 AND COUNT(DISTINCT doc_id) >= 2;
2. For each candidate cluster (up to 50 per hour):
   - Build adjudication prompt with: surface, type, sample contexts (max 5),
     top-10 nearest existing entities by embedding.
   - Query deepseek-chat + claude-haiku-4-5-20251001 + (claude-sonnet-4-6 if Bahá'í tier-1 doc):
     each returns {action: 'promote_new' | 'merge_into' | 'defer', target_id?, confidence}.
   - Consensus rule:
     a. All ≥0.85 agree on action AND target → execute.
     b. Majority (2/3) agree at ≥0.75 AND no model strongly disagrees (>0.85 opposing) → execute with audit flag.
     c. Otherwise → defer.
3. Audit log every decision: {candidate, model_votes, action, evidence_paragraphs, run_id}.
4. After execution: queue affected paragraphs for re-resolution.
5. Sync new aliases to Meili (step 6).
```

**Conservative bias:** false-merge cost > false-defer cost. When in doubt, defer.

**Test:**
```bash
node test/graph-promoter.test.js
sqlite3 $SIFTER_DB_PATH "SELECT action, COUNT(*) FROM er_audit_log GROUP BY action;"
```

**Success:** decisions logged; no entity created without audit row; reversible.

## 12. Doc-tier priority queue

**File:** `config/doc-tier-priority.json`.

**Bahá'í cascade (process in strict order):**

```json
{
  "bahai_layers": [
    {"layer": 1, "match": {"title": "God Passes By", "author": "Shoghi Effendi"}, "priority": 1000},
    {"layer": 2, "match": {"title": "Dawn-Breakers", "author": "Nabíl-i-Zarandí"}, "priority": 900},
    {"layer": 3, "match": {"title_contains": "Revelation of Bahá'u'lláh", "author": "Adib Taherzadeh"}, "priority": 800},
    {"layer": 4, "match": {"author_contains": "Balyuzi"}, "priority": 700},
    {"layer": 5, "match": {"author_contains": "Mazandarani"}, "priority": 600},
    {"layer": 6, "match": {"religion": "Bahá'í", "authority": {">=": 8}}, "priority": 500},
    {"layer": 7, "match": {"religion": "Bahá'í", "authority": {">=": 5}}, "priority": 400},
    {"layer": 8, "match": {"religion": "Bahá'í"}, "priority": 300}
  ]
}
```

After creating this file, run:
```bash
node scripts/apply-doc-priority.js  # populates docs.doc_priority column
```

Other religions: populated in step 20. Layer priorities 300 and below by default. Bahá'í always wins priority until Bahá'í layer 6 complete.

## 13. Bahá'í seed run — GPB pass

Execute in strict order:

```bash
# 13.1 Reset Bahá'í tier 1 docs to graph_enriched=0
sqlite3 $SIFTER_DB_PATH "UPDATE content SET graph_enriched = 0 WHERE doc_id IN (SELECT id FROM docs WHERE title = 'God Passes By');"

# 13.2 Start workers (PM2)
pm2 start api/workers/graph-extractor.js --name siftersearch-graph-extractor
pm2 start api/workers/graph-validator.js --name siftersearch-graph-validator
pm2 start api/workers/graph-resolver.js --name siftersearch-graph-resolver
pm2 start api/workers/graph-promoter.js --name siftersearch-graph-promoter --cron "0 * * * *"

# 13.3 Monitor
watch -n 30 'sqlite3 $SIFTER_DB_PATH "SELECT (SELECT COUNT(*) FROM content WHERE graph_enriched=1 AND doc_id IN (SELECT id FROM docs WHERE title=\"God Passes By\")) as done, (SELECT COUNT(*) FROM content WHERE doc_id IN (SELECT id FROM docs WHERE title=\"God Passes By\")) as total, (SELECT ROUND(SUM(cost_usd),2) FROM extraction_runs WHERE created_at > strftime(\"%s\",\"now\",\"start of month\")) as mtd_cost;"'
```

**13.4 Period + episode extraction** (script `scripts/extract-gpb-structure.js`, run after 13.3 drains):

GPB's chronology is *episodic*, not date-anchored throughout. Many paragraphs have no explicit date; they situate events within a named episode within a named period.

```
1. Parse GPB's chapter + section headings + opening paragraphs.
2. Sonnet 4.6 reads heading + first 5 paragraphs of each section, extracts:
   {period_id, period_name, parent_period_id?, episodes: [{id, name, narrative_summary,
    estimated_date_start?, estimated_date_end?, date_precision}]}
   Date fields nullable; many episodes legitimately lack dates.
3. INSERT into periods, episodes tables.
4. For each GPB paragraph, Sonnet 4.6 (batched, cached system prompt) tags
   {episode_id, confidence}. Leave NULL if confidence < 0.7.
5. UPDATE content SET period_id = ?, episode_id = ? for GPB paragraphs.
```

Expected: ~10–15 periods, ~80–120 episodes. Cost: ~$8–15.

**13.5 Episode-anchored downstream benefit:** when Dawn-Breakers and Taherzadeh paragraphs are later resolved, an unresolved temporal expression like "during the closing days of His sojourn in Adrianople" gets bridged to the episode's date range via `episode_id` lookup.

**13.6 Prophetic-bridge extraction** (script `scripts/extract-gpb-prophetic-bridges.js`):

GPB explicitly identifies Bahá'í central figures and events as the fulfilment of expectations articulated in earlier traditions. These authoritative interpretive claims are first-class graph edges.

**New relation predicates** (add to relation type vocabulary):
- `identified_as_fulfilment_of`
- `identified_as_return_of`
- `continues_covenant_with`
- `prefigured_by`
- `fulfils_expectation_of_tradition`

**Mining procedure:**
```
1. Sonnet 4.6 reads each GPB paragraph (cached system prompt with predicate vocabulary).
2. For each paragraph, extract any explicit interpretive bridge:
   {subject_entity_id, predicate, object: {tradition, figure_or_concept, source_text_phrase},
    evidence_paragraph_id, modality: 'asserted'|'reported'|'qualified', confidence}
3. Object handling: at GPB-extraction time, the object's tradition is named but the
   figure_or_concept is captured as a literal. Store as 'pending_target' in
   pending_bridge_relations table. Target-tradition entity ID resolved in step 21.
```

**Authority tier:** every row carries `source_authority_tier = 'authorized_interpretation'`. These are Shoghi Effendi's interpretive claims, doctrinally binding within the Bahá'í framework.

Expected: ~150–300 prophetic-bridge relations. Cost: ~$5–10.

**13.7 Significance-marker extraction** (script `scripts/extract-gpb-significance.js`):

**Marker types** (`significance_markers.marker_type` vocabulary):
- `station` — spiritual/institutional station of a figure
- `centrality` — relative centrality of figures
- `principal_work` — identification of a tablet/book as principal work (doctrinal listing)
- `turning_point` — constitutive or epoch-making events
- `closed_set_membership` — explicit declarations of complete membership (e.g., Letters of the Living)
- `period_constitutive_event` — events defining the period containing them
- `covenant_role` — explicit claims about roles within the Covenant

**Mining procedure:**
```
1. Sonnet 4.6 reads each GPB paragraph with marker-type vocabulary in cached system prompt.
2. Extract explicit significance claims only (not implied): {subject_entity_id, marker_type,
   marker_value, evidence_paragraph_id, confidence}
3. Conservative: do NOT extract markers that are implied by phrasing but not stated.
4. INSERT into significance_markers with source_authority_tier = 'authorized_interpretation'.
```

Expected: ~400–800 significance markers. Cost: ~$8–15.

**Why this matters:** "who are the Letters of the Living?" should return exactly the eighteen, as Shoghi Effendi enumerates them (`closed_set_membership`), not a fuzzy entity-frequency ranking. "What are the principal tablets of the Báb?" returns the answer that *God Passes By* provides, not a scholarly aggregate.

**Success gate before proceeding to step 14:**
- All GPB paragraphs `graph_enriched = 1`
- Resolution rate ≥ 80% on GPB mentions
- MTD cost < $200 (GPB alone)
- Promotion queue ≤ 200 unresolved candidates
- `model_calibration` table updated with GPB-derived ground truth
- `periods` and `episodes` tables populated; ≥ 80% of GPB paragraphs have non-NULL `period_id`
- `pending_bridge_relations` populated with ≥ 100 entries covering at least 3 traditions
- `significance_markers` populated with ≥ 300 entries; all carry `source_authority_tier = 'authorized_interpretation'`

**Expected (total step 13):** ~3000 paragraphs, ~$60–95 cost, ~600–900 canonical entities, ~3000 aliases, ~100 episodes, ~150–300 pending bridges, ~400–800 significance markers.

## 14. Quote clustering — GPB pass

**File:** `api/workers/quote-clusterer.js`.

**Function:**
```
1. SELECT quote_instances WHERE cluster_id IS NULL.
2. Normalize quoted_text (strip diacritics for matching only, preserve in storage).
3. Embed quoted_text_norm via existing embedder — 512 dims (text-embedding-3-large MRL-compressed).
4. Agglomerative cluster within (speaker_entity_id, lang) groups, cosine threshold 0.92.
5. Cross-language bridges: if a quote in language A has cosine ≥ 0.85 to quote in language B
   AND speaker matches, link clusters (don't merge).
6. Write quote_clusters rows; assign cluster_id to instances.
7. Canonical text per cluster = earliest-dated manifestation, prefer original-language form.
```

**Test:**
```bash
node api/workers/quote-clusterer.js --once
sqlite3 $SIFTER_DB_PATH "SELECT COUNT(DISTINCT cluster_id), COUNT(*) FROM quote_instances WHERE cluster_id IS NOT NULL;"
```

**Success:** cluster count is 30–50% of instance count.

## 15. Grounded-text indexing pipeline

**Migration 73:** simple follow-up migration adding `embedding_grounded BLOB` to content.

**Files modified:**
- `api/services/ingester.js` — when `text_grounded` is set and `grounded_synced = 0`, embed it (512 dims) and store in `embedding_grounded`
- `api/workers/sync-processor.js` — extend Meili paragraphs document to include `text_grounded` searchable field + `_vectors.grounded` for grounded embedding. **PRESERVE existing embedder config.**
- `api/lib/search.js` — `hybridSearch` accepts `useGroundedText: bool` (default true after success gate)

**Test:**
```bash
sqlite3 $SIFTER_DB_PATH "SELECT COUNT(*) FROM content WHERE text_grounded IS NOT NULL AND grounded_synced = 0;"  # > 0 after step 13
node scripts/embed-grounded.js --limit 100
sqlite3 $SIFTER_DB_PATH "SELECT COUNT(*) FROM content WHERE embedding_grounded IS NOT NULL;"
curl -X POST $MEILISEARCH_HOST/indexes/paragraphs/search -H "Authorization: Bearer $MEILISEARCH_API_KEY" \
  -d '{"q":"Bahá'\''u'\''lláh exile from Baghdád","hybrid":{"embedder":"grounded"},"limit":5}'
```

**Success:** grounded embeddings populated; search using grounded sidecar returns results.

## 16. Entity-mentions Meilisearch sidecar

**File:** `api/lib/search/entity.js` (follows existing `api/lib/search/hype.js` pattern).

**Index name:** `entity_mentions_idx` — add to `initializeIndexes()` in `api/lib/search.js` alongside paragraphs, hype_questions, deep_research.

**Index settings** (follow HyPE pattern — `source: 'userProvided'`, 512 dims):
```javascript
{
  primaryKey: 'id',
  searchableAttributes: ['entity_canonical_name'],
  filterableAttributes: ['entity_id', 'paragraph_id', 'religion', 'authority', 'role'],
  sortableAttributes: ['authority'],
  embedders: { default: { source: 'userProvided', dimensions: 512 } }
}
```

**Index docs:** denormalized — one document per `(paragraph_id, entity_id, role)`. Fields: `paragraph_id, entity_id, entity_canonical_name, role, religion, authority`.

**`searchByEntity(entityIds, filters)`:** exported from `api/lib/search/entity.js`, re-exported from `api/lib/search.js` (follows HyPE re-export pattern at line 941–943).

**Integration with `multiIndexSearch`:**
- Add as third RRF input alongside `paragraphs` and `hype_questions`.
- Weight: 1.0 (equal to HyPE).
- Triggered when `classifyIntentAndEntities` resolves any named entity in user query.

**Test:**
```bash
curl "$API/api/v1/search?q=Bahá'u'lláh+justice&debug=1" | jq '._layers'
# Expect: layers includes 'entity_mentions' with non-zero hits
```

## 17. Jafar pipeline entity awareness

**File modified:** `api/lib/jafar-pipeline.js` (the canonical chat pipeline — NOT `api/services/jafar/*.js`).

**Changes:**

**1. Entity resolution in intent classification.**
- `classifyIntentAndEntities()` now also returns `entityIds[]` (resolved via `findEntity` over extracted person/work/place names).
- `deterministicResearch()` adds parallel entity-filtered search branch per resolved entity, merged into existing dedup pipeline.
- Feature flag: `ENABLE_ENTITY_AWARE_JAFAR=true` env var (default false; flip after step 16 verified).

**2. Register classification — conversational vs. research.** Jafar is conversational by default. Dossiers, tables, and structured compilations are produced *only when explicitly requested*.

`classifyIntentAndEntities()` returns `response_register`, one of:
- `conversational` — terse, wise, brief; a few sentences of direct prose. The default.
- `research` — structured output, tables, longer prose with citations. Triggered only by explicit signals.

**Signals for `research` register** (any of):
- explicit research verbs: *compile, research, find all, list, enumerate, summarize, write up, document, report on, give me a dossier, give me a table, all the X, every X*
- explicit length signals: *in detail, comprehensively, thorough, exhaustive, full picture*
- explicit structural requests: *as a table, as a list, as a timeline, organized by, broken down by*
- meta-requests for documents: *write a report, prepare a brief, draft a document*

In the absence of these signals, `conversational` is default — even for questions that the entity layer *could* answer with substantial depth.

**Examples:**
| Query | Register | Reasoning |
|---|---|---|
| *Who was Mullá Husayn?* | conversational | Plain biographical question; a few sentences suffice |
| *Tell me about the Conference of Badasht* | conversational | "Tell me about" is conversational |
| *What did Bahá'u'lláh say about justice?* | conversational | A question, not a research task |
| *Compile all references to Mullá Husayn in the Dawn-Breakers* | research | "Compile all" is explicit |
| *Give me a timeline of the Báb's imprisonments* | research | "Timeline" is structural |
| *Research the relationship between the Letters of the Living* | research | "Research" verb |
| *Write a summary of Bahá'u'lláh's ʿAkká period* | research | "Write a summary" is meta-request |
| *What's significant about the Tablet of Aḥmad?* | conversational | Question, not a compilation request |
| *List every tablet addressed to a king* | research | "List every" is explicit |

When ambiguous, default to `conversational` and offer at the end: *"I can compile a fuller dossier on this if it would help."*

**3. Crafter behavior by register.** `craftResponse()` in `jafar-pipeline.js` receives the register:
- **`conversational`:** prose-only, typically 1–5 sentences. Cite passages naturally inline. No headings, tables, or bullet lists. Gesture at depth without delivering it.
- **`research`:** structured response allowed. Tables, headings, lists, ordered chronologies. Dossier scaffold available but used only when request implies that breadth.

**Test:**
```bash
curl -X POST $API/api/v1/chat -d '{"messages":[{"role":"user","content":"Who was Mullá Husayn?"}]}' | jq -r '.reply' | wc -w
# Expect < 150 words (conversational)
curl -X POST $API/api/v1/chat -d '{"messages":[{"role":"user","content":"Compile all key events of Mullá Husayn'\''s life with dates and sources"}]}' | jq -r '.reply'
# Expect tables/lists/headings (research)
```

**Success:** conversational queries return prose under ~200 words; research queries scale appropriately.

## 17B. Authority-tier ranking integration

**Files modified:** `api/lib/authority.js`, `api/lib/jafar-pipeline.js`.

**Three behaviors:**

**1. Search ranking lift.** In `authority.js`, augment rerank to consider `source_authority_tier` on relations and significance markers attached to a paragraph:

```javascript
const tierLift = {
  revealed: 0.20, central_figure: 0.15, authorized_interpretation: 0.12,
  institutional: 0.08, approved_history: 0.05,
  primary_scripture_other: 0.15, tradition_doctrinal: 0.08, tradition_authoritative: 0.04,
  scholarly: 0, secondary: 0, reference: 0, unknown: 0
};
// each paragraph's authority score includes max(tierLift) over its associated markers/relations
```

**2. Conflict resolution.** When two relations make contradictory claims, the higher-tier source wins. The lower-tier claim is preserved with `status='superseded_by'`. If both claims are at the same tier, the conflict remains visible in dossiers as "sources differ."

**3. Display by register.** Significance markers from `authorized_interpretation` tier or higher are treated as definitional facts — not hedged with "according to" attribution. Markers from `scholarly` tier and below are always attributed and may be explicitly qualified.

**Test:**
```bash
node test/authority-tier.test.js
curl "$API/api/v1/search?q=Centre+of+the+Covenant&debug=1" | jq '.hits[0] | {title, authority_tier_lift}'
```

## 18. Bahá'í cascade — Dawn-Breakers + Taherzadeh + Balyuzi + Mazandarani

Each step: enable that doc tier in `doc-tier-priority.json`, run `scripts/apply-doc-priority.js`, queue paragraphs, monitor.

```bash
# 18.1 Dawn-Breakers — three resolution passes
sqlite3 $SIFTER_DB_PATH "UPDATE content SET graph_enriched = 0 WHERE doc_id IN (SELECT id FROM docs WHERE title LIKE '%Dawn-Breakers%');"
# Wait for extraction + resolution + promotion to drain; then:
node scripts/requeue-unresolved.js --doc-filter "Dawn-Breakers"
node scripts/requeue-unresolved.js --doc-filter "Dawn-Breakers"  # second pass

# 18.2 Taherzadeh (4 volumes)
sqlite3 $SIFTER_DB_PATH "UPDATE content SET graph_enriched = 0 WHERE doc_id IN (SELECT id FROM docs WHERE author LIKE '%Taherzadeh%');"

# 18.3 Balyuzi
sqlite3 $SIFTER_DB_PATH "UPDATE content SET graph_enriched = 0 WHERE doc_id IN (SELECT id FROM docs WHERE author LIKE '%Balyuzi%');"

# 18.4 Mazandarani — Persian language, special handling
node scripts/test-persian-extraction.js --sample 50  # verify DeepSeek handles Persian acceptably first
sqlite3 $SIFTER_DB_PATH "UPDATE content SET graph_enriched = 0 WHERE doc_id IN (SELECT id FROM docs WHERE author LIKE '%Mazandarani%' OR title LIKE '%Asraru%' OR title LIKE '%Zuhur%');"
```

**Success gate per layer:**
- Resolution rate ≥ 90% (Dawn-Breakers), ≥ 92% (Taherzadeh), ≥ 92% (Balyuzi), ≥ 85% (Mazandarani Persian)
- New canonical entities: each layer adds 100–800 to graph
- Cost stays under monthly budget cap

## 19. Bahá'í remaining corpus

```bash
sqlite3 $SIFTER_DB_PATH "UPDATE content SET graph_enriched = 0 WHERE doc_id IN (SELECT id FROM docs WHERE religion = 'Bahá''í' AND COALESCE(graph_enriched, 0) != 1);"
```

**Success:** all Bahá'í paragraphs have extractions and resolutions; promotion queue drained to < 100 candidates.

## 20. Other religions — automated seed strategies

For each non-Bahá'í tradition, the spine work has been pre-selected. Look up the corresponding doc(s) in your corpus, prioritize them for extraction first, and the same cascade applies.

**File:** `config/non-bahai-seed-strategies.json`:

```json
{
  "Christian": {
    "rationale": "No single one-volume survey has GPB's authority. Use Eusebius for the foundational historical narrative + the four Gospels as primary scripture, with the Acts of the Apostles for the apostolic-age prosopography. Augustine's City of God provides systematic theological terminology. Modern: Schaff's History of the Christian Church for comprehensive Patristic coverage.",
    "layers": [
      {"priority": 1000, "match": {"title_contains": ["Ecclesiastical History"], "author_contains": ["Eusebius"]}},
      {"priority": 950, "match": {"title_in": ["Gospel of Matthew","Gospel of Mark","Gospel of Luke","Gospel of John"]}},
      {"priority": 900, "match": {"title_contains": ["Acts of the Apostles","Acts"]}},
      {"priority": 850, "match": {"title_contains": ["City of God"], "author_contains": ["Augustine"]}},
      {"priority": 800, "match": {"title_contains": ["History of the Christian Church"], "author_contains": ["Schaff"]}},
      {"priority": 700, "match": {"religion": "Christian", "authority": {">=": 9}}},
      {"priority": 500, "match": {"religion": "Christian", "authority": {">=": 7}}},
      {"priority": 300, "match": {"religion": "Christian"}}
    ],
    "language_policy": "Greek/Latin terminology preserved as alias; English canonical from KJV/RSV unless tradition-specific convention applies.",
    "high_stakes_disambiguation_pairs": [
      ["James son of Zebedee","James brother of Jesus","James son of Alphaeus"],
      ["Mary mother of Jesus","Mary Magdalene","Mary of Bethany","Mary mother of James"],
      ["Judas Iscariot","Jude/Judas brother of James","Judas Maccabeus"]
    ]
  },
  "Islam": {
    "rationale": "Ibn Hisham's Sīrat Rasūl Allāh is the canonical biography of Muhammad with extensive prosopography. Tabarī's Tārīkh is the foundational universal history. Bukhārī's Sahīh provides the standard hadith corpus with isnād chains that are themselves a prosopographical network. Quran is primary scripture.",
    "layers": [
      {"priority": 1000, "match": {"title_contains": ["Sirat","Sira","Life of the Prophet"], "author_contains": ["Ibn Hisham","Ibn Ishaq"]}},
      {"priority": 950, "match": {"title": "Quran"}},
      {"priority": 900, "match": {"title_contains": ["History","Tarikh"], "author_contains": ["Tabari","al-Tabari"]}},
      {"priority": 850, "match": {"title_contains": ["Sahih"], "author_contains": ["Bukhari","Muslim"]}},
      {"priority": 800, "match": {"author_contains": ["Ibn Kathir"]}},
      {"priority": 700, "match": {"religion": "Islam", "authority": {">=": 9}}},
      {"priority": 500, "match": {"religion": "Islam", "authority": {">=": 7}}},
      {"priority": 300, "match": {"religion": "Islam"}}
    ],
    "language_policy": "Arabic transliteration: prefer canonical form with diacritics; both 'Muḥammad' and 'Mohammed' as aliases. Isnād chain handling: each transmitter is an entity; isnād is a relation chain.",
    "high_stakes_disambiguation_pairs": [
      ["Ali ibn Abi Talib","Ali ibn al-Husayn (Zayn al-Abidin)","Ali al-Rida"],
      ["Hasan ibn Ali","Hasan al-Basri","Hasan al-Askari"],
      ["Muhammad ibn Abdullah (the Prophet)","Muhammad al-Baqir","Muhammad ibn Hanafiyyah"]
    ]
  },
  "Jewish": {
    "rationale": "Josephus's Antiquities of the Jews provides the foundational historical narrative. The Tanakh is primary scripture. The Mishnah codifies tannaitic-period rabbinic prosopography; the Talmud extends this to amoraic figures. Maimonides' Mishneh Torah provides medieval systematization.",
    "layers": [
      {"priority": 1000, "match": {"title_contains": ["Antiquities of the Jews"], "author_contains": ["Josephus"]}},
      {"priority": 950, "match": {"title_in": ["Tanakh","Hebrew Bible","Torah"]}},
      {"priority": 900, "match": {"title_contains": ["Mishnah"]}},
      {"priority": 850, "match": {"title_contains": ["Talmud","Gemara"]}},
      {"priority": 800, "match": {"title_contains": ["Mishneh Torah","Guide for the Perplexed"], "author_contains": ["Maimonides","Rambam"]}},
      {"priority": 700, "match": {"religion": "Jewish", "authority": {">=": 9}}},
      {"priority": 500, "match": {"religion": "Jewish", "authority": {">=": 7}}},
      {"priority": 300, "match": {"religion": "Jewish"}}
    ],
    "language_policy": "Hebrew preserved; standard academic transliteration. Each named rabbi in Mishnah/Talmud is a canonical entity; cross-citation patterns extracted as relations.",
    "high_stakes_disambiguation_pairs": [
      ["Hillel the Elder","Hillel ha-Nasi"],
      ["Rabbi Yehudah ha-Nasi","Yehudah bar Ilai","Yehudah ben Bava"],
      ["Joseph son of Jacob","Joseph of Arimathea","Joseph son of Tobias"]
    ]
  },
  "Buddhist": {
    "rationale": "The Pali Canon's Vinaya Pitaka and Sutta Pitaka contain the foundational prosopography of the Buddha's contemporaries. The Mahavamsa is the canonical historical chronicle (Theravada). For Mahayana: the Lotus Sutra; Nāgārjuna's Mūlamadhyamakakārikā establishes Madhyamaka terminology.",
    "layers": [
      {"priority": 1000, "match": {"title_contains": ["Mahavamsa"]}},
      {"priority": 950, "match": {"title_contains": ["Sutta","Nikaya","Pitaka"]}},
      {"priority": 900, "match": {"title_contains": ["Vinaya"]}},
      {"priority": 850, "match": {"title_contains": ["Visuddhimagga"], "author_contains": ["Buddhaghosa"]}},
      {"priority": 800, "match": {"title_contains": ["Lotus Sutra","Heart Sutra","Diamond Sutra"]}},
      {"priority": 700, "match": {"religion": "Buddhist", "authority": {">=": 9}}},
      {"priority": 500, "match": {"religion": "Buddhist", "authority": {">=": 7}}},
      {"priority": 300, "match": {"religion": "Buddhist"}}
    ],
    "language_policy": "Pali and Sanskrit forms as alternate aliases (Dhamma/Dharma; Nibbana/Nirvana). Buddhist personal names in Pali for Theravada texts, Sanskrit for Mahayana.",
    "high_stakes_disambiguation_pairs": [
      ["Siddhartha Gautama (historical Buddha)","Maitreya","Amitabha","Vairocana"],
      ["Ananda (Buddha's attendant)","Ananda (different historical figures)"],
      ["Nāgārjuna (Madhyamaka founder)","Nāgārjuna (alchemist/later)"]
    ]
  },
  "Hindu": {
    "rationale": "The Mahābhārata and Rāmāyaṇa are the foundational epics with vast prosopographies. The Bhagavad Gītā is core doctrinal scripture. The principal Upaniṣads establish philosophical terminology.",
    "layers": [
      {"priority": 1000, "match": {"title_contains": ["Mahabharata"]}},
      {"priority": 1000, "match": {"title_contains": ["Ramayana"]}},
      {"priority": 950, "match": {"title_contains": ["Bhagavad Gita"]}},
      {"priority": 900, "match": {"title_contains": ["Upanishad"]}},
      {"priority": 850, "match": {"title_contains": ["Purana","Bhagavata"]}},
      {"priority": 800, "match": {"title_contains": ["Vedas","Rig Veda","Sama Veda","Yajur Veda","Atharva Veda"]}},
      {"priority": 700, "match": {"religion": "Hindu", "authority": {">=": 9}}},
      {"priority": 500, "match": {"religion": "Hindu", "authority": {">=": 7}}},
      {"priority": 300, "match": {"religion": "Hindu"}}
    ],
    "language_policy": "Sanskrit canonical form with IAST diacritics; English transliterations as aliases. Avatāras of Viṣṇu treated as related-but-distinct entities with explicit avatar_of relation.",
    "high_stakes_disambiguation_pairs": [
      ["Krishna (Mahabharata)","Krishna (Bhagavata Purana)","Bala Krishna (child form)"],
      ["Rama (Ramayana)","Parashurama","Balarama"],
      ["Vyasa (compiler of Mahabharata)","Vyasa as title for other arrangers"]
    ]
  },
  "Zoroastrian": {
    "rationale": "The Avesta is primary scripture. The Bundahishn provides cosmological-historical narrative. The Denkard is a 9th-10th century encyclopedic compilation. Western academic spine: Mary Boyce's History of Zoroastrianism.",
    "layers": [
      {"priority": 1000, "match": {"title_contains": ["History of Zoroastrianism"], "author_contains": ["Boyce"]}},
      {"priority": 950, "match": {"title_contains": ["Avesta","Yasna","Gathas","Vendidad"]}},
      {"priority": 900, "match": {"title_contains": ["Bundahishn"]}},
      {"priority": 850, "match": {"title_contains": ["Denkard"]}},
      {"priority": 700, "match": {"religion": "Zoroastrian", "authority": {">=": 9}}},
      {"priority": 500, "match": {"religion": "Zoroastrian", "authority": {">=": 7}}},
      {"priority": 300, "match": {"religion": "Zoroastrian"}}
    ],
    "language_policy": "Avestan and Pahlavi forms as aliases. Zarathushtra/Zoroaster/Zardusht as aliases of one canonical.",
    "high_stakes_disambiguation_pairs": [
      ["Zarathushtra (prophet)","later figures named Zarathushtra"]
    ]
  },
  "Taoist": {
    "rationale": "The Daodejing (attributed to Laozi) is the foundational scripture. The Zhuangzi provides the major prosopographical and philosophical extension. Western academic spine: Livia Kohn's Daoism Handbook.",
    "layers": [
      {"priority": 1000, "match": {"title_contains": ["Daoism Handbook"], "author_contains": ["Kohn"]}},
      {"priority": 950, "match": {"title_contains": ["Daodejing","Tao Te Ching"]}},
      {"priority": 900, "match": {"title_contains": ["Zhuangzi","Chuang Tzu"]}},
      {"priority": 850, "match": {"title_contains": ["Liezi","Lieh Tzu"]}},
      {"priority": 800, "match": {"title_contains": ["Baopuzi","Pao Pu Tzu"], "author_contains": ["Ge Hong"]}},
      {"priority": 700, "match": {"religion": "Taoist", "authority": {">=": 9}}},
      {"priority": 500, "match": {"religion": "Taoist", "authority": {">=": 7}}},
      {"priority": 300, "match": {"religion": "Taoist"}}
    ],
    "language_policy": "Pinyin canonical; Wade-Giles as alias (Laozi/Lao Tzu, Daodejing/Tao Te Ching). Concept terms (Dao, De, Wu Wei) as canonical concepts.",
    "high_stakes_disambiguation_pairs": [
      ["Laozi (Daodejing author)","Laozi as deified Lord Lao"],
      ["Zhuangzi (philosopher)","Zhuangzi (the text)"]
    ]
  },
  "Confucian": {
    "rationale": "The Analects (Lunyu) is the foundational text. The Mencius extends Confucian doctrine. The Five Classics provide pre-Confucian historical foundation.",
    "layers": [
      {"priority": 1000, "match": {"title_contains": ["Sources of Chinese Tradition"], "author_contains": ["de Bary"]}},
      {"priority": 950, "match": {"title_contains": ["Analects","Lunyu"]}},
      {"priority": 900, "match": {"title_contains": ["Mencius","Mengzi"]}},
      {"priority": 850, "match": {"title_contains": ["Doctrine of the Mean","Great Learning","Zhongyong","Daxue"]}},
      {"priority": 800, "match": {"title_contains": ["Shijing","Book of Odes","Shujing","Book of Documents"]}},
      {"priority": 700, "match": {"religion": "Confucian", "authority": {">=": 9}}},
      {"priority": 500, "match": {"religion": "Confucian", "authority": {">=": 7}}},
      {"priority": 300, "match": {"religion": "Confucian"}}
    ],
    "language_policy": "Pinyin canonical (Kongzi/Confucius, Mengzi/Mencius). Disciples of Confucius each canonical entities.",
    "high_stakes_disambiguation_pairs": [
      ["Confucius (Kongzi)","later named descendants in Kong lineage"],
      ["Mencius (Mengzi)","other named Meng figures"]
    ]
  },
  "Sikh": {
    "rationale": "The Guru Granth Sahib is primary scripture. Historical: the Janamsakhis are traditional biographies of Guru Nanak. Modern spine: Khushwant Singh's History of the Sikhs.",
    "layers": [
      {"priority": 1000, "match": {"title_contains": ["History of the Sikhs"], "author_contains": ["Khushwant Singh","McLeod"]}},
      {"priority": 950, "match": {"title_contains": ["Guru Granth Sahib","Adi Granth"]}},
      {"priority": 900, "match": {"title_contains": ["Dasam Granth"]}},
      {"priority": 850, "match": {"title_contains": ["Janamsakhi"]}},
      {"priority": 700, "match": {"religion": "Sikh", "authority": {">=": 9}}},
      {"priority": 500, "match": {"religion": "Sikh", "authority": {">=": 7}}},
      {"priority": 300, "match": {"religion": "Sikh"}}
    ],
    "language_policy": "Gurmukhi script preserved; Punjabi/Hindi transliterations as aliases. The Ten Gurus each canonical entities.",
    "high_stakes_disambiguation_pairs": [
      ["Guru Nanak","other named Nanaks"],
      ["Bhagat Kabir (in Granth)","Kabir (independent traditions)"]
    ]
  },
  "Jain": {
    "rationale": "The Āgamas and the Tattvārtha Sūtra are primary scripture. The Kalpa Sūtra contains the canonical biographies of the Tīrthaṅkaras. Modern spine: Paul Dundas's The Jains.",
    "layers": [
      {"priority": 1000, "match": {"title_contains": ["The Jains"], "author_contains": ["Dundas"]}},
      {"priority": 950, "match": {"title_contains": ["Tattvartha Sutra","Tattvarthasutra"]}},
      {"priority": 900, "match": {"title_contains": ["Kalpa Sutra","Kalpasutra"]}},
      {"priority": 850, "match": {"title_contains": ["Acaranga","Acharanga"]}},
      {"priority": 800, "match": {"title_contains": ["Agama","Anga"]}},
      {"priority": 700, "match": {"religion": "Jain", "authority": {">=": 9}}},
      {"priority": 500, "match": {"religion": "Jain", "authority": {">=": 7}}},
      {"priority": 300, "match": {"religion": "Jain"}}
    ],
    "language_policy": "Prakrit (Ardha-Magadhi) and Sanskrit forms as aliases. The 24 Tīrthaṅkaras are canonical entities.",
    "high_stakes_disambiguation_pairs": [
      ["Mahavira (24th Tirthankara)","other named figures in Jain tradition"],
      ["Parshvanatha (23rd Tirthankara)","other Parshvas"]
    ]
  }
}
```

**Execution per tradition:**
```bash
TRADITION="Christian"
node scripts/identify-tradition-spine.js --religion "$TRADITION"
node scripts/cascade-tradition.js --religion "$TRADITION" --max-layer 8
```

**Success per tradition:**
- Resolution rate ≥ 85% on layers 1–3
- Resolution rate ≥ 80% on layers 4–7
- Cross-tradition anchor entities identified (step 21)
- Monthly cost stays under budget

## 21. Cross-tradition canonical linking

**File:** `api/workers/cross-tradition-linker.js`.

**Triggered:** after each tradition completes its layers 1–3.

**21A. Resolve pre-mined bridges from GPB.**

```
1. SELECT * FROM pending_bridge_relations WHERE status = 'pending_target' AND target_tradition = ?
2. For each row, search the target tradition's entities for matches against target_literal:
   a. Meilisearch alias query over target_literal phrase
   b. Filter results to target_tradition's religion
   c. Single high-confidence match (≥0.85): write relation; mark resolved
   d. Multiple candidates: query deepseek-chat with target_literal + top-3 candidates +
      source paragraph context; if confidence ≥ 0.85, resolve; else mark ambiguous
   e. Doctrinally significant ambiguous cases: route to claude-sonnet-4-6
3. Resulting relations carry source_authority of originally-mining interpreter (e.g., 'shoghi-effendi:gpb')
```

**21B. Same-figure cross-tradition merging.**

```
1. SELECT from graph_entities WHERE cross_tradition_candidate = 1
2. For each candidate pair, query claude-sonnet-4-6 (high-stakes):
   - "Are these the same real-world figure? same_entity / same_referent_separate_traditions / distinct."
3. same_entity: merge into single canonical with per-tradition aliases.
4. same_referent_separate_traditions: create relation (entity_A, same_referent_as, entity_B); do NOT merge.
5. distinct: no action.
```

**Conservative defaults:** when confidence < 0.80 on 21A, mark `ambiguous`. When Sonnet < 0.85 on 21B, default to `same_referent_separate_traditions`.

**Note:** Bridges enter the graph only when an authorised interpreter asserts them. The linker does *not* infer bridges from co-occurrence or thematic similarity.

**Cost:** ~$20–50 across all 10 non-Bahá'í traditions.

## 22. Auto-indexing for new documents

**Files modified:** `api/services/library-watcher.js` + `api/services/segmenter.js`.

**Change:** `graph_enriched = 0` is already the column default (set in migration 72). Ensure new content rows written by ingester inherit this default. Workers (steps 8–11) pick them up automatically.

**Test:**
```bash
echo "# Test\nBahá'u'lláh spoke of justice." > $LIBRARY_PATH/Test/Test/test.md
sleep 30
sqlite3 $SIFTER_DB_PATH "SELECT id, graph_enriched FROM content WHERE doc_id IN (SELECT id FROM docs WHERE filename LIKE '%test.md');"
# Expect graph_enriched = 0 initially, then 1 within minutes
```

## 23. Search auto-consumption

Already accomplished in steps 15–17. Verify integration is default:
- `multiIndexSearch` uses entity sidecar by default when entities resolved.
- `hybridSearch` uses grounded-text embedding by default.

```bash
node scripts/run-eval-suite.js --baseline > /tmp/baseline.json
node scripts/run-eval-suite.js --entity-layer > /tmp/entity.json
node scripts/eval-compare.js /tmp/baseline.json /tmp/entity.json
```

**Success:** precision@10 improves ≥ 10% on entity-heavy queries; latency p95 increase ≤ 200ms.

## 24. Eval harness (autonomous, self-validating)

**Files:** `scripts/run-eval-suite.js` + `evals/queries.json` (auto-generated).

**Generation (one-time):**
1. Sample 100 GPB paragraphs with explicit factual statements.
2. Sonnet 4.6 generates 2–3 test queries per paragraph with known-good answers.
3. Validate each generated query is unambiguous and answerable from corpus.
4. Final eval set: ~200 queries with `{query, expected_paragraph_ids[], expected_entities[], expected_keywords[]}`.

**Run:** executes through `multiIndexSearch` + Jafar pipeline; scores precision@10, entity recall, keyword presence.

**Trigger:** weekly via cron. Reports to `eval_history` table. Auto-alert if precision@10 drops > 5% week-over-week.

## 25. Drift detection & autonomous calibration refresh

**File:** `api/workers/drift-monitor.js` (runs daily).

1. Sample 0.5% of recent extractions across all extractor_versions.
2. Sonnet 4.6 reviews; flags errors.
3. Aggregate error rate per (model, category).
4. If error rate exceeds calibration baseline + 5%, auto-rerun calibration (step 3).
5. If a new model becomes available (check static config), flag for re-calibration.

**Cost cap:** monthly drift monitoring < $30.

## 26. Cost guardrails (running)

**File:** `api/lib/entity-cost-tracker.js` — `checkBudget()` already implements this.

`api/workers/cost-monitor.js` (runs every 5 minutes):
```
mtd_cost = getMonthlySpend()
IF mtd_cost > budget * 0.5: log warn "50% budget consumed"
IF mtd_cost > budget * 0.8: switch_to_local_qwen_for_extraction()
IF mtd_cost > budget * 0.95: halt_all_cloud_workers()
```

## 27. Operational order of execution

Run in this exact order. **Stop at any step that fails its success gate.**

```
1.  Migration 72 (new JS migration file + runner.js update)
2.  DeepSeek client + model-registry + cost-tracker
3.  Calibration (~$15–20)
4.  Graph-db extension (api/lib/graph-db.js)
5.  Orthography policy (config/orthography-policy.json)
6.  Meili synonym sync (api/lib/graph-meili-sync.js)
7.  Extraction prompt v1
8.  Extractor worker — test on 100 GPB paragraphs only
9.  Validator worker
10. Resolver worker
11. Promoter worker
12. Doc-tier priority config + scripts/apply-doc-priority.js
13. GPB full run (extraction + periods + episodes + bridges + significance markers) — ~$60–95
14. Quote clustering — GPB
15. Migration 73 + grounded indexing pipeline
16. Entity sidecar (api/lib/search/entity.js + Meili index)
17. Jafar awareness (api/lib/jafar-pipeline.js)
18. Authority-tier ranking (api/lib/authority.js)
19. Dawn-Breakers — ~$80–120
20. Taherzadeh — ~$60–100
21. Balyuzi — ~$50–80
22. Mazandarani — ~$30–50
23. Bahá'í remainder — variable; monitor budget
24. Other religions (one tradition at a time, in order listed in step 20)
25. Cross-tradition linking
26. Auto-pickup + eval + monitoring (ongoing)
```

## 28. Total cost estimate

| Phase | Estimated cost |
|---|---|
| Calibration | $20 |
| Bahá'í core (GPB + periods + bridges + significance + DB + Taherzadeh + Balyuzi + Mazandarani) | $340–510 |
| Bahá'í remainder | $200–400 |
| Other religions (10 traditions, layered) | $1,500–2,500 |
| Quality validation (Haiku batch) | $200–300 |
| Cross-tradition linking | $25–65 |
| Drift monitoring | $30–50/mo ongoing |
| Apex (Opus, rare) | $30–80 |
| **Total estimated project** | **$2,350–3,950 over 3–4 months** |

At $1,000/month budget, all 11 traditions complete within 3–4 months.

## 29. Failure-mode runbook

| Symptom | Diagnosis | Action |
|---|---|---|
| Extraction JSON invalid > 5% | Prompt drift; model regression | Pause worker; sample 20 failures; revise prompt v1 → v2; recalibrate |
| Resolution rate drops > 10% | Entity dictionary stale; new tradition with weak seed | Pause; review promotion_queue; manually examine top candidates |
| Cost spike beyond budget | Validation rate too high; cache hit rate dropping | Check `extraction_runs.cached_tokens` ratio; raise trusted-category threshold; reduce validator sampling |
| Promotion queue grows monotonically | Consensus too strict OR new alias variants flooding in | Review consensus rule; consider lowering threshold from ≥0.75 to ≥0.65 temporarily |
| Cross-tradition merge regret | Sonnet adjudication wrong | All merges reversible via audit log; `splitEntity` on offending merge |
| Meili embedder config lost | PATCH to settings cleared it | Use `initializeIndexes()` in api/lib/search.js; verify dimensions = 512 within 30s |
| Drift detected | Model behavior changed | Recalibrate; if persistent, pin prompt version and re-extract affected paragraphs |
| DeepSeek model ID mismatch | API ID changed | Update `deepseek-chat`/`deepseek-reasoner` keys in model-registry.js; one-line fix |

## 30. Done state

System is "done" when:
- All 11 religions have layers 1–7 fully extracted and resolved.
- Promotion queue stable below 500 items.
- Eval suite stable: precision@10 ≥ 0.7 on broad query set, ≥ 0.85 on entity-anchored queries.
- New documents auto-index within 10 minutes of arrival.
- Monthly cost stable, predictable, well under $1,000.
- Drift monitor running daily; no alerts in 30 days.
- Conversational research agent (Jafar with entity awareness) produces dossier-quality answers for any seeded entity.

After done state: ongoing operations are entirely automated. New docs flow through pipeline. Quality monitored. Costs capped. Audit log allows future human refinement without system disruption.
