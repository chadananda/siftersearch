// Content DB migrations 72+ — entity layer schema (ALTER TABLE only on content/docs/graph_entities/graph_relations)
// New graph pipeline tables live in graph.db via graphMigrations[1].

import { query, graphQuery } from '../db.js';
import { logger } from '../logger.js';
import { ensureIndex, onTable } from './ensure.js';


const onGraphTable = (table, label, fn) => onTable(graphQuery, table, label, fn);

export const migrations = {
  72: async () => {
    logger.info('Starting migration 72: entity layer column extensions');

    // Extend existing tables — idempotent (catch duplicate column errors)
    const addCol = async (tbl, col, def) => {
      try { await query(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`); } catch { /* duplicate column — already applied */ }
    };

    await addCol('graph_entities', 'source_authority_tier', 'TEXT');
    await addCol('graph_entities', 'cross_tradition_candidate', 'INTEGER DEFAULT 0');
    await addCol('graph_relations', 'source_authority_tier', 'TEXT');

    await addCol('content', 'text_grounded', 'TEXT');
    await addCol('content', 'grounding_confidence', 'REAL');
    await addCol('content', 'grounding_notes', 'TEXT');
    await addCol('content', 'graph_enriched', 'INTEGER DEFAULT 0');
    await addCol('content', 'graph_enriched_at', 'TEXT');
    await addCol('content', 'extractor_version', 'TEXT');
    await addCol('content', 'period_id', 'TEXT');
    await addCol('content', 'episode_id', 'TEXT');
    await addCol('content', 'grounded_synced', 'INTEGER DEFAULT 0');

    await addCol('docs', 'doc_priority', 'INTEGER DEFAULT 100');

    // Indexes on content/docs (stay in sifter.db)
    await query(`CREATE INDEX IF NOT EXISTS idx_content_graph_unsync ON content(graph_enriched) WHERE graph_enriched = 0`);
    await query(`CREATE INDEX IF NOT EXISTS idx_content_doc_graph ON content(doc_id, graph_enriched) WHERE graph_enriched = 0`);
    await query(`CREATE INDEX IF NOT EXISTS idx_docs_priority ON docs(doc_priority DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_docs_priority_active ON docs(doc_priority DESC) WHERE deleted_at IS NULL AND duplicate_of IS NULL`);

    logger.info('Migration 72 complete: entity layer column extensions');
  },

  73: async () => {
    // Grounded-text embedding storage for entity-aware semantic search.
    // embedding_grounded holds a 512-dim MRL-compressed text-embedding-3-large
    // vector of content.text_grounded — the dereference-resolved paragraph text.
    // Used by the grounded-text search path in hybridSearch when useGroundedText=true.
    const addCol = async (tbl, col, def) => {
      try { await query(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`); }
      catch { /* duplicate column — already applied */ }
    };
    await addCol('content', 'embedding_grounded', 'BLOB');
    await query(`CREATE INDEX IF NOT EXISTS idx_content_grounded_unsync ON content(grounded_synced) WHERE grounded_synced = 0 AND text_grounded IS NOT NULL`);
    logger.info('Migration 73 complete: embedding_grounded column');
  },

  74: async () => {
    // Fix: add missing UNIQUE constraints to entity_aliases, entity_mentions,
    // and promotion_queue — now in graph.db.

    // 1. Deduplicate promotion_queue — keep lowest id per (surface_norm, type)
    await graphQuery(`
      DELETE FROM promotion_queue
      WHERE id NOT IN (
        SELECT MIN(id) FROM promotion_queue GROUP BY surface_norm, type
      )
    `);
    await graphQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pq_unique ON promotion_queue(surface_norm, type)`);

    // 2. Deduplicate entity_aliases — keep highest confidence per (entity_id, surface_norm, lang)
    await graphQuery(`
      DELETE FROM entity_aliases
      WHERE id NOT IN (
        SELECT id FROM entity_aliases ea1
        WHERE confidence = (
          SELECT MAX(confidence) FROM entity_aliases ea2
          WHERE ea2.entity_id = ea1.entity_id
            AND ea2.surface_norm = ea1.surface_norm
            AND ea2.lang = ea1.lang
        )
        GROUP BY entity_id, surface_norm, lang
      )
    `);
    await graphQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_unique ON entity_aliases(entity_id, surface_norm, lang)`);

    // 3. Deduplicate entity_mentions — keep lowest id per (entity_id, content_id, role)
    await graphQuery(`
      DELETE FROM entity_mentions
      WHERE id NOT IN (
        SELECT MIN(id) FROM entity_mentions GROUP BY entity_id, content_id, role
      )
    `);
    await graphQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_em_unique ON entity_mentions(entity_id, content_id, role)`);

    await graphQuery(`ANALYZE promotion_queue`);
    await graphQuery(`ANALYZE entity_aliases`);
    await graphQuery(`ANALYZE entity_mentions`);

    logger.info('Migration 74 complete: unique constraints on entity_aliases, entity_mentions, promotion_queue');
  },

  75: async () => {
    logger.info('Starting migration 75: covering index for sync-processor ORDER BY updated_at');

    // getDirtyParagraphsBatch queries:
    //   WHERE c.synced = 0 AND c.deleted_at IS NULL ORDER BY c.updated_at DESC LIMIT N
    //
    // The existing idx_content_unsynced partial index has no updated_at column,
    // so SQLite must sort all 527K+ unsynced rows on every poll cycle — O(N log N)
    // per batch instead of O(1). This covering index lets SQLite read the top-N
    // rows directly from the index without a full scan or sort.
    await query(`
      CREATE INDEX IF NOT EXISTS idx_content_dirty_updated
        ON content(updated_at DESC)
        WHERE synced = 0 AND deleted_at IS NULL
    `);
    await query(`ANALYZE content`);

    logger.info('Migration 75 complete: idx_content_dirty_updated covering index');
  },

  76: async () => {
    logger.info('Starting migration 76: composite index for getDocsWithDirtyParagraphs GROUP BY');

    // getDocsWithDirtyParagraphs runs this subquery on every sync iteration:
    //   SELECT doc_id, MAX(updated_at) FROM content
    //   WHERE synced=0 AND deleted_at IS NULL
    //   GROUP BY doc_id ORDER BY max_updated_at DESC LIMIT ?
    //
    // Without a composite (doc_id, updated_at) index, SQLite scans all 527K+
    // unsynced rows to compute the per-doc MAX, then sorts them. With the
    // composite partial index below, SQLite can read the first (highest
    // updated_at) row per doc_id group directly from the index — O(distinct docs)
    // instead of O(total unsynced rows). ~4000 docs vs 527K rows = 130x speedup.
    await query(`
      CREATE INDEX IF NOT EXISTS idx_content_dirty_doc_updated
        ON content(doc_id, updated_at DESC)
        WHERE synced = 0 AND deleted_at IS NULL
    `);
    await query(`ANALYZE content`);

    logger.info('Migration 76 complete: idx_content_dirty_doc_updated composite index');
  },

  77: async () => {
    logger.info('Starting migration 77: partial index for recently-synced rows');

    // /api/search/health/pipeline checks how many rows were synced in last 2h:
    //   SELECT COUNT(*) FROM content WHERE synced=1 AND updated_at > datetime('now','-2 hours')
    // Without an index this scans ALL synced rows (~3M+) via better-sqlite3 (sync),
    // blocking the Node.js event loop for 69s and making the API unresponsive.
    await query(`
      CREATE INDEX IF NOT EXISTS idx_content_recently_synced
        ON content(updated_at DESC)
        WHERE synced = 1
    `);
    await query(`ANALYZE content`);

    logger.info('Migration 77 complete: idx_content_recently_synced');
  },

  78: async () => {
    // em_synced was added to entity_mentions schema but missed on servers
    // where migration 72 ran before the column was introduced. Now in graph.db.
    try { await graphQuery(`ALTER TABLE entity_mentions ADD COLUMN em_synced INTEGER DEFAULT 0`); } catch { /* already exists */ }
    try { await graphQuery(`CREATE INDEX IF NOT EXISTS idx_em_unsynced ON entity_mentions(em_synced) WHERE em_synced = 0`); } catch { /* already exists */ }
    logger.info('Migration 78 complete: em_synced column + index on entity_mentions');
  },
  79: async () => {
    // Replace idx_content_graph_unsync (WHERE graph_enriched=0 only) with a covering index
    // that also filters deleted_at IS NULL. Without this, any query adding `AND deleted_at IS NULL`
    // forces table lookups on every indexed row — 108s full scan on 4M+ rows.
    await query(`DROP INDEX IF EXISTS idx_content_graph_unsync`);
    await query(`CREATE INDEX IF NOT EXISTS idx_content_graph_unsync ON content(graph_enriched) WHERE graph_enriched = 0 AND deleted_at IS NULL`);
    logger.info('Migration 79 complete: idx_content_graph_unsync now covers deleted_at IS NULL');
  },
  80: async () => {
    // Optimistic Meilisearch sync: track submitted tasks so the worker never
    // blocks waiting for HNSW indexing (which takes 15-60min at 4M+ vectors).
    // Worker marks synced=1 immediately on submission; reconciler handles failures.
    await query(`CREATE TABLE IF NOT EXISTS meili_sync_tasks (
      task_uid    INTEGER PRIMARY KEY,
      index_uid   TEXT    NOT NULL,
      para_ids    TEXT    NOT NULL,   -- JSON array of content.id values
      submitted_at INTEGER DEFAULT (unixepoch()),
      status      TEXT    DEFAULT 'processing',  -- processing|succeeded|failed
      resolved_at INTEGER
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_meili_sync_tasks_status ON meili_sync_tasks(status, submitted_at) WHERE status = 'processing'`);
    logger.info('Migration 80 complete: meili_sync_tasks table for optimistic sync');
  },
  81: async () => {
    // idx_content_hype_hash: speeds up the IN subquery inside propagateHypeFromNormalizedHash.
    // Without this, `SELECT normalized_hash FROM content WHERE hyp_questions IS NOT NULL` full-scans
    // 4.45M rows every batch, holding the write lock for minutes.
    await query(`CREATE INDEX IF NOT EXISTS idx_content_hype_hash ON content(normalized_hash) WHERE hyp_questions IS NOT NULL AND normalized_hash IS NOT NULL`);
    logger.info('Migration 81 complete: idx_content_hype_hash for propagateHypeFromNormalizedHash');
  },
  82: async () => {
    // idx_ev_extraction_id: covers the NOT EXISTS subquery in graph-validator fetchBatch (graph.db).
    await ensureIndex(graphQuery, {
      label: 'Migration 82 (idx_ev_extraction_id)', table: 'extraction_validations', columns: ['extraction_id'],
      sql: `CREATE INDEX IF NOT EXISTS idx_ev_extraction_id ON extraction_validations(extraction_id)`,
    });
  },

  83: async () => {
    // Correct authority_tiers ranks (graph.db).
    await onGraphTable('authority_tiers', 'migration 83', async () => {
      await graphQuery(`UPDATE authority_tiers SET rank=25, description='Letters and pronouncements of the Universal House of Justice — legislative authority, not doctrinal' WHERE tier='institutional'`);
      await graphQuery(`UPDATE authority_tiers SET rank=50, description='Modern academic scholarship — historical and analytical value' WHERE tier='scholarly'`);
    });
    logger.info('Migration 83 complete: corrected authority_tiers ranks (institutional 70→25, scholarly 40→50)');
  },

  84: async () => {
    // Entity-architecture spine (sifter.db) — see docs/entity-architecture.md. Additive, empty tables only.
    // "Everything is an entity, a name, or a cited claim": events are entities; involvement + identity-equivalence
    // are claims. Four new tables over existing graph_entities + entity_mentions. Reversible by DROP. entity_aliases_v2
    // is named to sit alongside the legacy (empty) migration-72 entity_aliases until the cutover retires it.
    await query(`CREATE TABLE IF NOT EXISTS relations (
      key TEXT PRIMARY KEY, label TEXT NOT NULL, category TEXT, target_type TEXT, inverse_key TEXT, cardinality TEXT)`);

    await query(`CREATE TABLE IF NOT EXISTS entity_aliases_v2 (
      id INTEGER PRIMARY KEY, entity_id INTEGER NOT NULL,
      surface TEXT NOT NULL, surface_norm TEXT NOT NULL, script_key TEXT, phonetic_key TEXT,
      kind TEXT DEFAULT 'name', lang TEXT DEFAULT 'en', is_display INTEGER DEFAULT 0,
      confidence REAL DEFAULT 1.0, source TEXT, source_para_id TEXT, import_batch TEXT,
      created_at INTEGER DEFAULT (unixepoch()))`);
    await query(`CREATE INDEX IF NOT EXISTS idx_eav2_entity ON entity_aliases_v2(entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_eav2_norm   ON entity_aliases_v2(surface_norm)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_eav2_script ON entity_aliases_v2(script_key)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_eav2_phon   ON entity_aliases_v2(phonetic_key)`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_eav2_uniq ON entity_aliases_v2(entity_id, surface_norm, lang, kind)`);

    await query(`CREATE TABLE IF NOT EXISTS alias_priors (
      surface_norm TEXT NOT NULL, entity_id INTEGER NOT NULL, count INTEGER DEFAULT 1,
      PRIMARY KEY (surface_norm, entity_id))`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ap_surface ON alias_priors(surface_norm)`);

    await query(`CREATE TABLE IF NOT EXISTS entity_claims (
      id INTEGER PRIMARY KEY, claim_hash TEXT UNIQUE, claim_group TEXT,
      entity_id INTEGER NOT NULL, relation TEXT NOT NULL, target_entity_id INTEGER,
      statement TEXT NOT NULL, proof_verbatim TEXT, doc_id INTEGER, para_id TEXT,
      valid_from TEXT, valid_to TEXT, asserted_at INTEGER DEFAULT (unixepoch()), superseded_at INTEGER,
      rank TEXT DEFAULT 'normal', status TEXT DEFAULT 'supported',
      proof_ok INTEGER, subject_ok INTEGER, consistency_ok INTEGER,
      confidence REAL, provenance_tier INTEGER, extractor_version TEXT, import_batch TEXT)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_entity   ON entity_claims(entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_target   ON entity_claims(target_entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_relation ON entity_claims(relation)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_ent_rel  ON entity_claims(entity_id, relation)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_group    ON entity_claims(claim_group)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_para     ON entity_claims(para_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_batch    ON entity_claims(import_batch)`);
    logger.info('Migration 84 complete: entity-architecture spine (relations, entity_aliases_v2, alias_priors, entity_claims)');
  },

  85: async () => {
    // Entity-facet indexes (found by scripts/entity-read/test-index-coverage.mjs). The person-list query
    // (WHERE entity_type=? ORDER BY importance DESC) was doing a TEMP B-TREE sort of every entity on every
    // search — fine at 36k, fatal at millions. Composite index serves the facet + ordered scan.
    await ensureIndex(query, {
      label: 'Migration 85 (idx_ge_type_importance — kills the person-list TEMP B-TREE sort)',
      table: 'graph_entities', columns: ['entity_type', 'importance'],
      sql: `CREATE INDEX IF NOT EXISTS idx_ge_type_importance ON graph_entities(entity_type, importance)`,
    });
  },

  86: async () => {
    // IMPROVABLE ENTITY SUBSTRATE (sifter.db) — see docs/entity-improvable-architecture.md. Makes an entity a
    // PROJECTION over a stable source-anchored mention substrate + an append-only decision log, so the derived
    // layers (mentions/disambiguation/claims) can be regenerated by better models WITHOUT clobbering accumulated
    // human/AI decisions. Additive; reversible by DROP / leaving columns unused. Lives in sifter.db beside the
    // migration-84 spine (the legacy entity_mentions is in graph.db — this is the v2 substrate, single-DB for joins).

    // Layer 1 — source-anchored mentions. anchor = hash(doc,para,surface_norm,occurrence): a re-extraction of the
    // SAME source yields the SAME id, so Layer-5 decisions keyed on it survive re-derivation.
    await query(`CREATE TABLE IF NOT EXISTS entity_mentions_v2 (
      id INTEGER PRIMARY KEY, anchor TEXT UNIQUE NOT NULL,
      doc_id INTEGER NOT NULL, para_id TEXT NOT NULL, occurrence INTEGER DEFAULT 0,
      surface TEXT NOT NULL, surface_norm TEXT NOT NULL,
      entity_id INTEGER, resolved_as TEXT, resolution_basis TEXT, resolution_conf REAL,
      method_version TEXT, model TEXT, status TEXT DEFAULT 'active',
      created_at INTEGER DEFAULT (unixepoch()))`);
    await query(`CREATE INDEX IF NOT EXISTS idx_emv2_entity ON entity_mentions_v2(entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_emv2_doc    ON entity_mentions_v2(doc_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_emv2_norm   ON entity_mentions_v2(surface_norm)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_emv2_para   ON entity_mentions_v2(para_id)`);

    // Layer 5 — append-only DECISION LOG (the precious, never-clobbered layer). Entities are the projection of this
    // log over the mention substrate. Supersession, not deletion. actor_tier = precedence (3 human > 2 strong > 1 flash > 0 derived).
    await query(`CREATE TABLE IF NOT EXISTS entity_decisions (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL,               -- merge | split | verify | set | reassign | research | quarantine | unquarantine
      target_kind TEXT NOT NULL,        -- entity | mention | claim
      target_ids TEXT NOT NULL,         -- JSON array
      payload TEXT, evidence TEXT, rationale TEXT,
      actor TEXT NOT NULL, actor_tier INTEGER NOT NULL DEFAULT 0, confidence REAL,
      status TEXT DEFAULT 'active', supersedes INTEGER,
      valid_time TEXT, decided_at INTEGER DEFAULT (unixepoch()))`);
    await query(`CREATE INDEX IF NOT EXISTS idx_edec_target ON entity_decisions(target_kind, status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_edec_kind   ON entity_decisions(kind)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_edec_tier   ON entity_decisions(actor_tier)`);

    // Layer 3 — claims: temporal PIN/EST + reword-robust semantic key + method version for selective re-derivation.
    for (const c of ['time_value TEXT', 'time_precision TEXT', 'time_basis TEXT', 'time_anchor TEXT', 'method_version TEXT', 'semantic_key TEXT'])
      try { await query(`ALTER TABLE entity_claims ADD COLUMN ${c}`); } catch { /* exists */ }
    try { await query(`CREATE INDEX IF NOT EXISTS idx_ec_time   ON entity_claims(time_value)`); } catch { /* */ }
    try { await query(`CREATE INDEX IF NOT EXISTS idx_ec_semkey ON entity_claims(semantic_key)`); } catch { /* */ }

    // Layer 4 — graph_entities as the materialized PROJECTION: track assessment version + per-book prominence.
    for (const c of ['last_assessed_version TEXT', 'projection_rev INTEGER', 'book_prominence TEXT'])
      try { await query(`ALTER TABLE graph_entities ADD COLUMN ${c}`); } catch { /* exists */ }

    logger.info('Migration 86 complete: improvable substrate (entity_mentions_v2, entity_decisions, claim temporal+semantic_key, projection markers)');
  },

  87: async () => {
    // Fast AI-FREE entity LOOKUP index (sifter.db) — transliteration-invariant recall over the projected entities.
    // skeleton_key = api/lib/translit-key.js skeletonKeys(surface); many keys per entity (canonical + aliases + variants).
    // Rebuildable from the projection via scripts/entity-read/build-lookup-index.mjs. RECALL/lookup only — never determinative.
    await query(`CREATE TABLE IF NOT EXISTS entity_lookup_keys (
      id INTEGER PRIMARY KEY, skeleton_key TEXT NOT NULL, entity_id INTEGER NOT NULL,
      surface TEXT, surface_norm TEXT, is_canonical INTEGER DEFAULT 0, entity_type TEXT, importance REAL)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_elk_key    ON entity_lookup_keys(skeleton_key)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_elk_entity ON entity_lookup_keys(entity_id)`);
    logger.info('Migration 87 complete: entity_lookup_keys (fast transliteration-invariant lookup index)');
  },

  88: async () => {
    // Make entity_claims.entity_id NULLABLE (was NOT NULL from migration 84, predating deferred binding). NOT NULL +
    // INSERT OR IGNORE was SILENTLY DROPPING every claim whose subject didn't literal-match at extraction. SQLite
    // can't ALTER NOT NULL off → rebuild. Preserves all rows (column order = migration-84 defs then migration-86 adds).
    await query(`ALTER TABLE entity_claims RENAME TO entity_claims_pre88`);
    await query(`CREATE TABLE entity_claims (
      id INTEGER PRIMARY KEY, claim_hash TEXT UNIQUE, claim_group TEXT,
      entity_id INTEGER, relation TEXT NOT NULL, target_entity_id INTEGER,
      statement TEXT NOT NULL, proof_verbatim TEXT, doc_id INTEGER, para_id TEXT,
      valid_from TEXT, valid_to TEXT, asserted_at INTEGER DEFAULT (unixepoch()), superseded_at INTEGER,
      rank TEXT DEFAULT 'normal', status TEXT DEFAULT 'supported',
      proof_ok INTEGER, subject_ok INTEGER, consistency_ok INTEGER,
      confidence REAL, provenance_tier INTEGER, extractor_version TEXT, import_batch TEXT,
      time_value TEXT, time_precision TEXT, time_basis TEXT, time_anchor TEXT, method_version TEXT, semantic_key TEXT)`);
    await query(`INSERT INTO entity_claims SELECT * FROM entity_claims_pre88`);
    await query(`DROP TABLE entity_claims_pre88`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_entity   ON entity_claims(entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_target   ON entity_claims(target_entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_relation ON entity_claims(relation)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_ent_rel  ON entity_claims(entity_id, relation)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_group    ON entity_claims(claim_group)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_para     ON entity_claims(para_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_batch    ON entity_claims(import_batch)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_time     ON entity_claims(time_value)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_semkey   ON entity_claims(semantic_key)`);
    logger.info('Migration 88 complete: entity_claims.entity_id now NULLABLE (rebuilt; deferred binding)');
  },

  89: async () => {
    // Unified enrichment pipeline v2 (docs/architecture/unified-enrichment-pipeline.md): ONE ordered,
    // idempotent, gated orchestrator replaces the six always-on legacy pollers. doc_pipeline is the
    // single source of truth for per-document pipeline STATE (the small worklist the orchestrator walks),
    // replacing the scattered content booleans (context IS NULL / graph_enriched=0 / hyp_thesis IS NULL).
    logger.info('Starting migration 89: doc_pipeline orchestration state');
    await query(`CREATE TABLE IF NOT EXISTS doc_pipeline (
      doc_id           INTEGER PRIMARY KEY,
      priority         INTEGER NOT NULL DEFAULT 1000,    -- lower = earlier (GPB=0, DB=10, ROB=20, history=100)
      profile          TEXT,                             -- resolved profile (segmentation/prompt/model/lang)
      lang             TEXT,
      enabled          INTEGER NOT NULL DEFAULT 0,       -- 0 = ingested+base-indexed only; 1 = released into enrichment
      disambig_status  TEXT NOT NULL DEFAULT 'pending',  -- pending|running|done|error|partial
      disambig_version TEXT,
      disambig_fp      TEXT,                             -- content fingerprint disambiguation was computed over
      hype_status      TEXT NOT NULL DEFAULT 'pending',
      hype_version     TEXT,
      extract_status   TEXT NOT NULL DEFAULT 'pending',
      extract_version  TEXT,
      reconcile_status TEXT NOT NULL DEFAULT 'pending',
      dirty_paras      TEXT,                             -- JSON array of changed para ids (partial re-enrich)
      cost_tokens      INTEGER DEFAULT 0,
      error_detail     TEXT,
      updated_at       INTEGER
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_doc_pipeline_worklist ON doc_pipeline(enabled, priority, disambig_status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_doc_pipeline_stages ON doc_pipeline(enabled, priority, hype_status, extract_status)`);
    logger.info('Migration 89 complete: doc_pipeline table (backfill via scripts/pipeline/pipeline-backfill.mjs)');
  },

  90: async () => {
    // CONCEPT substrate (docs/architecture/conceptual-track.md) — the doctrinal twin of the entity layer.
    // A concept is a first-class entity (English canonical + original-language root + rendering spectrum); the
    // interpretive LEXICON is the authority-ranked, CITED map symbol→interpretation that grows top-down (higher
    // texts ARE interpretation) and is spent bottom-up. Claims/mentions/decisions/links mirror the improvable
    // entity architecture (append-only, source-anchored, deferred identity).
    logger.info('Starting migration 90: concept substrate');
    await query(`CREATE TABLE IF NOT EXISTS concept_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical TEXT NOT NULL,          -- English canonical (cross-tradition query handle)
      root TEXT,                        -- original-language root (‘adl/insáf; Logos; clouds) in native script
      renderings TEXT,                  -- JSON: spectrum of renderings across the corpus
      concept_type TEXT DEFAULT 'concept', -- concept|symbol|metaphor|term
      tradition TEXT, importance INTEGER, summary TEXT,
      last_assessed_version TEXT, created_at INTEGER DEFAULT (unixepoch()))`);
    await query(`CREATE INDEX IF NOT EXISTS idx_concept_canonical ON concept_entities(canonical)`);
    await query(`CREATE TABLE IF NOT EXISTS concept_lexicon (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,             -- the metaphor/term ("the clouds", "living water")
      concept_id INTEGER,               -- resolved concept (nullable until reconciled)
      interpretation TEXT NOT NULL,     -- the authoritative meaning
      authority TEXT, authority_tier INTEGER,  -- who established it + interpretive rank (lower=higher, SE=0…)
      layer TEXT DEFAULT 'metaphorical',       -- literal|metaphorical (separate attributed layers)
      proof_doc_id INTEGER, proof_para_id TEXT, proof_verbatim TEXT,
      method_version TEXT, created_at INTEGER DEFAULT (unixepoch()))`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lexicon_symbol ON concept_lexicon(symbol)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lexicon_authority ON concept_lexicon(authority_tier)`);
    await query(`CREATE TABLE IF NOT EXISTS concept_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT, claim_hash TEXT UNIQUE,
      concept_id INTEGER, subject TEXT, root TEXT, relation TEXT, target TEXT,
      statement TEXT, proof_verbatim TEXT, doc_id INTEGER, para_id TEXT,
      semantic_key TEXT, method_version TEXT, extractor_version TEXT,
      confidence REAL, status TEXT DEFAULT 'supported', proof_ok INTEGER DEFAULT 0, import_batch TEXT)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_concept_claims_doc ON concept_claims(doc_id)`);
    await query(`CREATE TABLE IF NOT EXISTS concept_mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, anchor TEXT UNIQUE,
      doc_id INTEGER, para_id TEXT, surface TEXT, surface_norm TEXT,
      concept_id INTEGER, resolved_as TEXT, resolution_basis TEXT, method_version TEXT, model TEXT,
      created_at INTEGER DEFAULT (unixepoch()))`);
    await query(`CREATE INDEX IF NOT EXISTS idx_concept_mentions_doc ON concept_mentions(doc_id)`);
    await query(`CREATE TABLE IF NOT EXISTS concept_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT, target_kind TEXT, target_ids TEXT, payload TEXT, evidence TEXT, rationale TEXT,
      actor TEXT, actor_tier INTEGER, confidence REAL, status TEXT DEFAULT 'proposed',
      supersedes INTEGER, valid_time TEXT, decided_at INTEGER DEFAULT (unixepoch()))`);
    await query(`CREATE TABLE IF NOT EXISTS concept_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT, a_concept_id INTEGER, b_concept_id INTEGER,
      link_type TEXT,                   -- analogical|authoritative-bridge
      authority TEXT, proof_doc_id INTEGER, proof_para_id TEXT, proof_verbatim TEXT,
      rationale TEXT, created_at INTEGER DEFAULT (unixepoch()))`);
    logger.info('Migration 90 complete: concept substrate (concept_entities/lexicon/claims/mentions/decisions/links)');
  },

  91: async () => {
    // Grounding CONTROL: live run state the executor (api/lib/pipeline/run-grounding.js) reports INTO the canonical
    // doc_pipeline row — relocating the scattered data/siftersearch-grounding-status.json that bio.js used to infer
    // the active book from. JSON: {docId,stage,stageIndex,totalStages,pid,host,startedAt,updatedAt} | null when idle.
    logger.info('Starting migration 91: doc_pipeline.run_json (driver-reported live grounding state)');
    try { await query(`ALTER TABLE doc_pipeline ADD COLUMN run_json TEXT`); }
    catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
    logger.info('Migration 91 complete: doc_pipeline.run_json');
  },

  92: async () => {
    // EEWA versioned adjudication: stamp each reconcile decision with the adjudicator engine version so a book's
    // decisions carry their version and stale ones can be re-adjudicated. entity_decisions had `supersedes` but not
    // `method_version`; the versioning code (store.saveDecisions/getProposedDecisions/getReadjudicationClusters +
    // the bio.js roadmap version badge) requires it. Design: docs/architecture/reconcile-evidence-escalation.md.
    logger.info('Starting migration 92: entity_decisions.method_version (EEWA adjudicator versioning)');
    try { await query(`ALTER TABLE entity_decisions ADD COLUMN method_version TEXT`); }
    catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
    logger.info('Migration 92 complete: entity_decisions.method_version');
  },
  93: async () => {
    // Grounding QUEUE. Until now the work ORDER lived in an operator's head (or an agent's polling loop), and each
    // next book was launched by hand — so when the babysitter stopped, the pipeline stopped with a free machine and
    // hours of nothing. The queue moves that order into the API: enqueue books, and a supervisor advances them.
    // A dead babysitter must not mean a dead pipeline.
    logger.info('Starting migration 93: grounding_queue');
    await query(`CREATE TABLE IF NOT EXISTS grounding_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL,
      opts_json TEXT,                          -- {from,to,only,readjudicate,cc} → passed straight to the executor
      position INTEGER NOT NULL DEFAULT 0,     -- work order (ties break by id)
      status TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | failed | cancelled
      note TEXT,
      error TEXT,
      pid INTEGER,
      enqueued_at INTEGER DEFAULT (unixepoch()),
      started_at INTEGER,
      finished_at INTEGER
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_grounding_queue_pick ON grounding_queue(status, position, id)`);
    logger.info('Migration 93 complete: grounding_queue');
  },
  94: async () => {
    // GRAPH-BAND MUTEX. The old rule serialized WHOLE books to protect the shared entity graph — a book held the
    // "tail" for its entire run (Vol8's 6.5h reconcile blocked every English book's graph-integration). But only
    // project→dedup actually mutate the shared graph, and the single writer already serializes the WRITES; we
    // just need at most one run in the MUTATING band at a time. This lock is that mutex: a run claims it only for
    // project→dedup, so every other stage (disambiguate…research, hype, verify) runs fully concurrently.
    // Claims route through the single writer, so the atomic UPDATE-WHERE-holder-IS-NULL is truly atomic across procs.
    logger.info('Starting migration 94: grounding_locks (graph-band mutex)');
    await query(`CREATE TABLE IF NOT EXISTS grounding_locks (
      name TEXT PRIMARY KEY,
      holder INTEGER,                 -- docId currently in the band, or NULL
      acquired_at INTEGER             -- unixepoch when claimed; a holder older than the stale window is reclaimable
    )`);
    await query(`INSERT INTO grounding_locks (name, holder, acquired_at) VALUES ('graph_band', NULL, NULL)
                 ON CONFLICT(name) DO NOTHING`);
    logger.info('Migration 94 complete: grounding_locks');
  },
  95: async () => {
    // UNATTENDED SELF-HEAL + SPEND BACKSTOP. For a run that must survive travel with nobody watching:
    //  • grounding_budget — a per-provider ceiling the SUPERVISOR enforces (books billing to an over-budget
    //    provider stay queued), so spend can't run away without a human's monitoring loop. `spent` is measured
    //    INCREMENTALLY over baseline_usd (captured when the budget was set).
    //  • grounding_queue.retry_count / next_attempt_at — auto-retry with backoff, so a transient death (timeout,
    //    killed proc, flaky fetch) requeues itself instead of stranding the book until a human re-enqueues it.
    logger.info('Starting migration 95: grounding_budget + queue auto-retry columns');
    await query(`CREATE TABLE IF NOT EXISTS grounding_budget (
      provider TEXT PRIMARY KEY,               -- 'anthropic' | 'deepseek' | 'openai'
      ceiling_usd REAL NOT NULL,               -- incremental allowance over baseline_usd
      baseline_usd REAL NOT NULL DEFAULT 0,    -- SUM(cost) at the moment the budget was set → spent = SUM(cost)-baseline
      warn_frac REAL NOT NULL DEFAULT 0.8,     -- surface a heads-up at this fraction of the ceiling
      offpeak_only INTEGER NOT NULL DEFAULT 0, -- 1 = supervisor won't LAUNCH this provider's books during a peak window
      peak_windows TEXT,                       -- JSON [["HH:MM","HH:MM"],…] UTC; NULL = DEFAULT_PEAK_WINDOWS (DeepSeek 2× hours)
      updated_at INTEGER DEFAULT (unixepoch())
    )`);
    const addCol = async (sql) => { try { await query(sql); } catch (err) { if (!err.message?.includes('duplicate column')) throw err; } };
    await addCol(`ALTER TABLE grounding_queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`);
    await addCol(`ALTER TABLE grounding_queue ADD COLUMN next_attempt_at INTEGER`);
    logger.info('Migration 95 complete: grounding_budget + auto-retry columns');
  },
  96: async () => {
    // CACHE METRICS. logAIUsage already receives + costs cached_tokens/cache_write_tokens (DeepSeek prefix-cache
    // hits bill ~0.1x, writes ~1.25x) but never PERSISTED the counts — so realized cache-hit rate was unmeasurable
    // (couldn't tell whether the big static hype/disambiguate prefix was actually caching). Add the columns so the
    // INSERT records them and per-stage cache efficiency (SUM(cached_tokens)/SUM(prompt_tokens)) becomes queryable.
    logger.info('Starting migration 96: ai_usage cache-token columns');
    const addCol = async (sql) => { try { await query(sql); } catch (err) { if (!err.message?.includes('duplicate column')) throw err; } };
    await addCol(`ALTER TABLE ai_usage ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0`);
    await addCol(`ALTER TABLE ai_usage ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0`);
    logger.info('Migration 96 complete: ai_usage cache-token columns');
  },
  97: async () => {
    // GROUNDING COMPLETION-CHECK INDEXES. getIntegrationProgress() (bio.js) runs reachedBound() over ~898 plan docs
    // on every follower tick (plan.js followPlanTick) AND on every /grounding status/monitor call. Two of
    // reachedBound's per-doc subqueries were catastrophic at that fan-out:
    //   (a) reconcile-decisions count: entity_decisions filtered by CAST(json_extract(payload,'$.docId') AS INT) had
    //       NO matching index — the existing idx_edec_target only narrowed by target_kind, then json_extract'd every
    //       mention-cluster row (~0.4s/doc × 898 ≈ 6 min of CPU).
    //   (b) claims count (also hit by plan.js resumeStageFor per candidate book): entity_claims has no doc_id index
    //       → a full SCAN of 607K rows on every call.
    // Together these pinned the API event loop at 100% CPU for minutes → /health timed out, all control was lost
    // (incident 2026-07-29). Both are ADDITIVE indexes — verified USED via EXPLAIN QUERY PLAN, zero logic change,
    // an index can never alter query RESULTS, only speed. The expression index must match the query expression
    // character-for-character, so keep this in sync with reachedBound()/resumeStageFor() if that CAST/path changes.
    logger.info('Starting migration 97: grounding completion-check indexes');
    await query(`CREATE INDEX IF NOT EXISTS idx_edec_cluster_docid
                 ON entity_decisions(target_kind, CAST(json_extract(payload,'$.docId') AS INT))`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ec_doc ON entity_claims(doc_id)`);
    await query(`ANALYZE entity_decisions`);
    await query(`ANALYZE entity_claims`);
    logger.info('Migration 97 complete: grounding completion-check indexes');
  },
  98: async () => {
    // HyPE generator version stamp (mirrors context_model for disambiguation). v2 ("hype-v2-facts") makes
    // question counts ADAPTIVE (2-5) and feeds cited claims into generation — so which generator produced a
    // paragraph's questions must be trackable for measurement + selective re-runs. NULL = v1 (legacy 5-question).
    logger.info('Starting migration 98: content.hyp_model (HyPE generator version stamp)');
    try { await query(`ALTER TABLE content ADD COLUMN hyp_model TEXT`); }
    catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
    logger.info('Migration 98 complete: content.hyp_model');
  },
  99: async () => {
    // SifterChat widget profiles (planning/sifterchat-widget-plan.md Phase 0). One row per embeddable site:
    // token identifies the profile; domains[] is the origin allowlist (config endpoint + CORS both read it);
    // config_json carries theme/greeting/scoping. Seeds the two dogfood sites (Chad 2026-08-08); Long Beach
    // domain is a best guess — edit the row if the real domain differs.
    logger.info('Starting migration 99: widget_profiles');
    await query(`CREATE TABLE IF NOT EXISTS widget_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      domains TEXT NOT NULL DEFAULT '[]',
      tier TEXT NOT NULL DEFAULT 'free',
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`);
    await query(`INSERT OR IGNORE INTO widget_profiles (token, name, domains, config_json) VALUES
      ('wgt_be_7f3a9c2e51', 'Bahá''í Education', '["bahai-education.org","www.bahai-education.org","localhost"]',
       '{"greeting":"Welcome! Ask me anything about the Bahá''í teachings, history, or sacred texts.","accent":"#1a6b5e","position":"bottom-right"}'),
      ('wgt_lb_4b8d1f6a92', 'Long Beach Bahá''í Community', '["bahailongbeach.org","www.bahailongbeach.org","localhost"]',
       '{"greeting":"Hello! I can answer questions about the Bahá''í Faith and its teachings.","accent":"#27548c","position":"bottom-right"}')`);
    logger.info('Migration 99 complete: widget_profiles (+2 dogfood seeds)');
  },
  100: async () => {
    // Widget admin: (1) is_house — the ONE permanent profile that runs on siftersearch.com itself as the
    // internal lab; the admin API refuses to delete a house row. (2) widget_events — per-profile analytics
    // (client-emitted: widget_load/open/message_sent/answer_served), keyed by token so the admin screen can
    // segment each profile. Volume is tiny for now (2 dogfood sites + the lab); add rollups/pruning if it grows.
    logger.info('Starting migration 100: widget house flag + widget_events');
    const addCol = async (sql) => { try { await query(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };
    await addCol(`ALTER TABLE widget_profiles ADD COLUMN is_house INTEGER NOT NULL DEFAULT 0`);
    await query(`CREATE TABLE IF NOT EXISTS widget_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      type TEXT NOT NULL,
      session_id TEXT,
      meta_json TEXT,
      ts INTEGER NOT NULL DEFAULT (unixepoch())
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_widget_events_token_ts ON widget_events(token, ts DESC)`);
    // The house profile — internal lab on siftersearch.com. is_house=1 (undeletable). Scoped to the default
    // corpus (chatbotLocation null = full cross-tradition Jafar), so it doubles as a live corpus assistant.
    await query(`INSERT OR IGNORE INTO widget_profiles (token, name, domains, is_house, config_json) VALUES
      ('wgt_house_siftersearch', 'SifterSearch (house)', '["siftersearch.com","www.siftersearch.com","localhost"]', 1,
       '{"greeting":"Ask me anything across the sacred literature — this is SifterSearch''s own assistant.","accent":"#0f5f73","position":"bottom-right"}')`);
    await query(`UPDATE widget_profiles SET is_house=1 WHERE token='wgt_house_siftersearch' AND is_house=0`);
    logger.info('Migration 100 complete: is_house + widget_events (+ house profile)');
  },

  101: async () => {
    // Answer cache (perf Layer 1) with VERSIONED metrics and stale-while-revalidate.
    // answer_cache: one row per cached (question, persona) — research bundle (persona-
    //   independent) + crafted answer, stamped with the SEARCH_VERSION that produced it.
    //   A version-mismatched hit is served AS-IS (fast) and queued for background
    //   revalidation, so search improvements phase the old cache out systematically
    //   without ever giving up the latency win.
    // answer_cache_serves: one row per serve — cache_status × versions × latency —
    //   the measurement substrate for hit-rate/latency/quality dashboards per version.
    // search_versions: log of version bumps so metrics join to what changed and when.
    logger.info('Starting migration 101: answer_cache + serve metrics + search_versions');
    await query(`CREATE TABLE IF NOT EXISTS answer_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_norm TEXT NOT NULL,
      question_hash TEXT NOT NULL,
      question_embedding BLOB,
      tradition TEXT,
      persona TEXT NOT NULL DEFAULT 'Jafar',
      research_json TEXT,
      answer_md TEXT,
      citations_json TEXT,
      search_version TEXT NOT NULL,
      retrieved_count INTEGER,
      web_fallback INTEGER NOT NULL DEFAULT 0,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_served_at INTEGER
    )`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_answer_cache_qp ON answer_cache(question_hash, persona)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_answer_cache_version ON answer_cache(search_version)`);
    await query(`CREATE TABLE IF NOT EXISTS answer_cache_serves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_hash TEXT,
      cache_status TEXT NOT NULL,           -- hit-fresh | hit-stale | miss | store
      served_version TEXT,                  -- version of the answer actually served
      current_version TEXT NOT NULL,        -- pipeline version at serve time
      similarity REAL,
      latency_ms INTEGER,
      ts INTEGER NOT NULL DEFAULT (unixepoch())
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_acs_ts ON answer_cache_serves(ts DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_acs_status_ts ON answer_cache_serves(cache_status, ts DESC)`);
    await query(`CREATE TABLE IF NOT EXISTS search_versions (
      version TEXT PRIMARY KEY,
      first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      notes TEXT
    )`);
    logger.info('Migration 101 complete: answer cache + versioned serve metrics');
  },

  102: async () => {
    // Semantic-question caching (the HyPE mechanism applied to the cache): entries are
    // KEYED by the canonical question form (LLM-rewritten from the user's raw phrasing,
    // context-resolved), so statements/keywords/follow-ups collapse onto one embedding.
    logger.info('Starting migration 102: answer_cache.canonical_question');
    try { await query(`ALTER TABLE answer_cache ADD COLUMN canonical_question TEXT`); }
    catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
    logger.info('Migration 102 complete');
  },

  103: async () => {
    // One Tap widget connections: a visitor on a host site connects via Google (intermediate
    // iframe on api.siftersearch.com) to receive research summaries by email. One row per
    // (site token, google account); session_id ties the connection to the analytics session.
    logger.info('Starting migration 103: widget_connections (One Tap)');
    await query(`CREATE TABLE IF NOT EXISTS widget_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      session_id TEXT,
      email TEXT NOT NULL,
      google_sub TEXT NOT NULL,
      name TEXT,
      picture TEXT,
      connected_at INTEGER DEFAULT (unixepoch()),
      last_report_at INTEGER,
      unsubscribed_at INTEGER,
      UNIQUE(token, google_sub)
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_wconn_email ON widget_connections(email)`);
    logger.info('Migration 103 complete: widget_connections');
  },

  104: async () => {
    // Bio-search scale fix: bioSearch loaded ALL ~611k proof-gated claims into JS per request
    // (40s+ timeouts once the pipeline grew the table). hay_folded = diacritic/apostrophe-folded
    // statement+proof, written by the claims adapter on insert and backfilled by
    // scripts/backfill-claims-fold.mjs — lets the search prefilter claims in SQL by query tokens.
    logger.info('Starting migration 104: entity_claims.hay_folded');
    try { await query(`ALTER TABLE entity_claims ADD COLUMN hay_folded TEXT`); }
    catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
    logger.info('Migration 104 complete');
  },

  105: async () => {
    // The per-doc billed-provider lookup (spend policy: "the provider the doc ACTUALLY billed to")
    // ran as a 290ms two-temp-btree scan PER BOOK on the API event loop — the grounding follower
    // fires it for every queued doc every ~3 min, seizing the loop for seconds and slowing every
    // endpoint. Expression index matches the query shape exactly (same pattern as migration 97).
    logger.info('Starting migration 105: ai_usage (caller, CAST(document_id AS INT)) index');
    await query(`CREATE INDEX IF NOT EXISTS idx_ai_usage_caller_docid
                 ON ai_usage(caller, CAST(document_id AS INT))`);
    await query(`ANALYZE idx_ai_usage_caller_docid`);
    logger.info('Migration 105 complete');
  },

  // Threads: who a conversation BELONGS to. chat_sessions.user_id is INTEGER, so an anonymous
  // participant (a 'sess_…' cookie id / 'user_…' client id) cannot live there — and the site chat was
  // storing the API KEY OWNER in it, which pools every visitor's conversations under one account. A
  // TEXT participant_id is the same key the companion uses, so a thread and its remembered context
  // belong to the same person, and connecting an account can merge both in one step.
  106: async () => {
    logger.info('Starting migration 106: chat_sessions.participant_id (thread ownership)');
    try { await query('ALTER TABLE chat_sessions ADD COLUMN participant_id TEXT'); } catch { /* exists */ }
    await query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_participant ON chat_sessions(participant_id, last_activity)');
    logger.info('Migration 106 complete');
  },

  // ── Pipeline state as RECORDED FACT, not inference ──────────────────────────────────────────────────
  // Every pipeline bug this project has had traces to the same root: no stage records what it did, so every
  // consumer RE-DERIVES doneness by counting columns. Disambiguation ended up with three different
  // definitions of "done" and the work-selector disagreed with the gate, so books retried forever having
  // made zero model calls. And because progress was only ever inferred from side effects (spend, row
  // counts), "never started", "running", and "nothing to do" were indistinguishable from outside.
  //
  // ingest_stage  = one row per (thing, stage): what happened to it, why, and at which version.
  // pipeline_run  = one row per RUN of a stage: items in/out/rejected/failed + reasons + last error.
  // Together they answer, in ONE query: what stage is each item in, what was rejected and why, what is
  // stuck and for how long, and when did this stage last actually run.
  //
  // TIMESTAMP CONVENTION: epoch INTEGER (unixepoch()) everywhere. Mixing epoch ints and ISO text is what
  // produced three separate comparison bugs in one day — one matching zero rows, one matching every row.
  107: async () => {
    logger.info('Starting migration 107: ingest_stage + pipeline_run (recorded pipeline state)');
    await query(`CREATE TABLE IF NOT EXISTS ingest_stage (
      item_ref TEXT NOT NULL,              -- stable id of the thing: stub doc id, or library-relative path
      stage TEXT NOT NULL,                 -- 'convert' | 'ingest' (extensible)
      status TEXT NOT NULL,                -- pending | running | done | rejected | failed
      version TEXT,                        -- the rule/code version that produced this outcome
      attempts INTEGER NOT NULL DEFAULT 0,
      reason TEXT,                         -- WHY rejected (quality gate, unsupported ext, no source…)
      last_error TEXT,
      doc_id INTEGER,                      -- the resulting doc, once there is one
      payload_json TEXT,                   -- small: source url, rel path, words/pages
      started_at INTEGER,
      updated_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (item_ref, stage)
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ingest_stage_status ON ingest_stage(stage, status, updated_at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ingest_stage_doc ON ingest_stage(doc_id)`);

    await query(`CREATE TABLE IF NOT EXISTS pipeline_run (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',   -- running | ok | error
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      finished_at INTEGER,
      items_in INTEGER NOT NULL DEFAULT 0,
      items_out INTEGER NOT NULL DEFAULT 0,
      items_rejected INTEGER NOT NULL DEFAULT 0,
      items_failed INTEGER NOT NULL DEFAULT 0,
      reasons_json TEXT,                        -- {reason: count} — rejection is data, not a log line
      last_error TEXT,
      note TEXT
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pipeline_run_stage ON pipeline_run(stage, started_at)`);
    logger.info('Migration 107 complete');
  },

  // ── The audit trail: WHO changed this file/doc, WHEN, and WHY ────────────────────────────────────────
  // "We cannot figure out why files were moved" is the problem this solves. Mutations were audited only to
  // the process log (safeSoftDeleteDocs logs 'AUDIT' via logger.warn), which cannot be queried from off-box
  // and rotates away — so a doc that vanished had no recoverable explanation. Durable + queryable instead.
  // Append-only by convention: rows are never updated, so the history of a doc is the history.
  // ── The extraction stamp: the one stage that never recorded that it ran ─────────────────────────────
  // Disambiguation writes context_model, hype writes hyp_model, extraction wrote only its OUTPUT. So
  // "has this paragraph been extracted, and by which extractor?" had no answer, and completion was inferred
  // from yield or from stage order — both wrong, and together they certified 53 books done with no cast.
  // The version also makes an extractor upgrade targetable (WHERE extract_model <> current) instead of
  // all-or-nothing across 6.7M paragraphs.
  //
  // Column only — NO backfill. Rewriting every live prose row of ~800 already-extracted books would be a
  // multi-million-row UPDATE holding the single writer at API start. Legacy rows are grandfathered in the
  // completion rule instead (a doc with mentions but no stamp is treated as extracted), so the gate targets
  // exactly the books that have neither.
  // ── Covering index for the per-language rollup ──────────────────────────────────────────────────────
  // pipeline-snapshot's by-language tally reads every live paragraph to produce per-language doc counts and
  // an embedding/sync breakdown. Rewriting it to roll up per doc_id first took it from 95.8s to 50.8s —
  // better, still a 50-second synchronous freeze ~6x a day, and still over the 5s alert threshold.
  //
  // The remaining cost is believed to be the row reads: content rows are wide (they carry the paragraph
  // text), and the rollup needs only doc_id, synced, and whether embedding IS NULL. An index carrying
  // exactly those lets the whole scan run index-only, never touching the table — and because doc_id leads,
  // the GROUP BY gets its ordering for free instead of building a temp B-tree.
  //
  // `(embedding IS NULL)` is indexed as an EXPRESSION, not the column: embedding is a vector BLOB and
  // indexing it would be enormous, while the boolean is one byte and is all the query actually asks.
  // Partial on deleted_at IS NULL to match the query's own population and keep the index off dead rows.
  //
  // NB the diagnosis is a hypothesis — no query plan was captured for the slow run — so this is verified by
  // MEASURING the query afterwards, not by assuming (Chad chose this over a docs-only rewrite, 2026-08-14).
  // ── Drop the index that EXPLAIN proved is never used ────────────────────────────────────────────────
  // 116 added idx_content_lang_rollup on the theory that by-language was reading wide rows. EXPLAIN QUERY
  // PLAN says otherwise: the query was ALREADY an index scan (SCAN content USING INDEX
  // idx_content_doc_id_cover) and never touched the new index — and a control with the embedding
  // expression removed produced an identical plan, so that suspicion was wrong too. The 55s is simply the
  // cost of visiting ~6.7M index entries to GROUP BY doc_id, which no index can shortcut.
  // An unused index is not free: it is written on every content insert and update. Remove it, and fix the
  // query by not counting every row (see snapshot-queries.js). Measured, not assumed, this time.
  117: async () => {
    logger.info('Starting migration 117: drop idx_content_lang_rollup (proven unused by EXPLAIN QUERY PLAN)');
    await query(`DROP INDEX IF EXISTS idx_content_lang_rollup`);
    logger.info('Migration 117 complete');
  },

  116: async () => {
    logger.info('Starting migration 116: covering index for the per-language rollup');
    await ensureIndex(query, {
      label: 'Migration 116 (idx_content_lang_rollup — index-only per-language rollup)',
      table: 'content', columns: ['doc_id', 'synced', 'embedding', 'deleted_at'],
      sql: `CREATE INDEX IF NOT EXISTS idx_content_lang_rollup
              ON content(doc_id, synced, (embedding IS NULL)) WHERE deleted_at IS NULL`,
    });
    logger.info('Migration 116 complete');
  },

  115: async () => {
    logger.info('Starting migration 115: content.extract_model — the extraction version stamp');
    // ALTER ... ADD COLUMN throws if it already exists; a migration must be safe to re-run.
    try { await query(`ALTER TABLE content ADD COLUMN extract_model TEXT`); }
    catch (err) {
      if (!/duplicate column/i.test(err.message)) throw err;
      logger.info('Migration 115: content.extract_model already present');
    }
    // Partial index: the coverage query counts stamped live prose per doc, and the stamped set is the
    // minority during rollout, so a partial index stays small while answering exactly that question.
    await ensureIndex(query, {
      label: 'Migration 115 (idx_content_extract_model — per-doc extraction coverage)',
      table: 'content', columns: ['extract_model', 'doc_id'],
      sql: `CREATE INDEX IF NOT EXISTS idx_content_extract_model ON content(doc_id)
              WHERE extract_model IS NOT NULL AND deleted_at IS NULL`,
    });
    logger.info('Migration 115 complete');
  },

  119: async () => {
    // The entity catalog reads these on every query. They were added to graph_entities by ad-hoc ALTERs
    // that did not reach every database — the local dev DB has last_assessed_version but NOT importance.
    // This must be its OWN migration: 118 had already been applied when the gap was found, and the runner
    // applies each version exactly once, so amending 118 would have been dead code everywhere it had run.
    for (const [col, decl] of [['importance', 'INTEGER'], ['summary', 'TEXT'], ['significance', 'TEXT'],
                               ['name_meaning', 'TEXT'], ['research_notes', 'TEXT']]) {
      try { await query(`ALTER TABLE graph_entities ADD COLUMN ${col} ${decl}`); }
      catch (err) { if (!/duplicate column/i.test(err?.message || '')) throw err; }
    }
    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_ge_type_imp_id ON graph_entities(entity_type, importance DESC, id)`);
      await query(`ANALYZE graph_entities`);
    } catch (err) {
      if (!/no such (column|table)/i.test(err?.message || '')) throw err;
    }
    logger.info('Migration 119 complete: graph_entities catalog columns guaranteed');
  },

  118: async () => {
    // R5 change feed for external entity consumers. Append-only; a monotonic seq is the cursor.
    // Populated by triggers so no writer path can forget to record a change.
    await query(`CREATE TABLE IF NOT EXISTS graph_entity_changes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      op TEXT NOT NULL,                 -- insert | update | delete
      canonical_name TEXT, entity_type TEXT, religion TEXT,
      merged_into INTEGER,              -- set when the change tombstoned the row
      changed_at INTEGER DEFAULT (unixepoch())
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_gec_entity ON graph_entity_changes(entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_gec_changed ON graph_entity_changes(changed_at)`);

    // Only columns an external consumer can observe. Importance/mention churn would flood the feed
    // without telling anyone anything they could act on.
    try {
    await query(`DROP TRIGGER IF EXISTS trg_ge_insert`);
    await query(`CREATE TRIGGER trg_ge_insert AFTER INSERT ON graph_entities BEGIN
      INSERT INTO graph_entity_changes (entity_id, op, canonical_name, entity_type, religion, merged_into)
      VALUES (NEW.id, 'insert', NEW.canonical_name, NEW.entity_type, NEW.religion,
              CASE WHEN NEW.last_assessed_version LIKE 'merged-into-%'
                   THEN CAST(REPLACE(NEW.last_assessed_version,'merged-into-','') AS INTEGER) END);
    END`);
    await query(`DROP TRIGGER IF EXISTS trg_ge_update`);
    await query(`CREATE TRIGGER trg_ge_update AFTER UPDATE ON graph_entities
      WHEN OLD.canonical_name IS NOT NEW.canonical_name
        OR OLD.entity_type IS NOT NEW.entity_type
        OR OLD.religion IS NOT NEW.religion
        OR OLD.last_assessed_version IS NOT NEW.last_assessed_version
      BEGIN
      INSERT INTO graph_entity_changes (entity_id, op, canonical_name, entity_type, religion, merged_into)
      VALUES (NEW.id, 'update', NEW.canonical_name, NEW.entity_type, NEW.religion,
              CASE WHEN NEW.last_assessed_version LIKE 'merged-into-%'
                   THEN CAST(REPLACE(NEW.last_assessed_version,'merged-into-','') AS INTEGER) END);
    END`);
    await query(`DROP TRIGGER IF EXISTS trg_ge_delete`);
    await query(`CREATE TRIGGER trg_ge_delete AFTER DELETE ON graph_entities BEGIN
      INSERT INTO graph_entity_changes (entity_id, op, canonical_name, entity_type, religion, merged_into)
      VALUES (OLD.id, 'delete', OLD.canonical_name, OLD.entity_type, OLD.religion, NULL);
    END`);
    } catch (err) {
      if (!/no such (column|table)/i.test(err?.message || '')) throw err;
      logger.warn({ err: err.message }, 'Migration 118: change-feed triggers skipped — older graph_entities schema variant');
    }

    // R1/R3: keyset pagination and type+importance ordering over LIVE rows.
    // Tolerated failure ONLY for a schema variant that predates the column (in-memory test DBs build a
    // minimal graph_entities). A missing index costs speed, never correctness — but anything else must
    // still surface, so we re-throw whatever is not a known-shape mismatch.
    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_ge_type_imp_id ON graph_entities(entity_type, importance DESC, id)`);
      await query(`ANALYZE graph_entities`);
    } catch (err) {
      if (!/no such (column|table)/i.test(err?.message || '')) throw err;
      logger.warn({ err: err.message }, 'Migration 118: catalog index skipped — graph_entities lacks the column (older schema variant)');
    }
    logger.info('Migration 118 complete: graph_entity_changes + triggers + catalog index');
  },

  114: async () => {
    logger.info('Starting migration 114: study_notes — the instructor-notes companion (planning/dawn-breakers-notes-plan.md)');
    // Chad's one requested feature for the notes companion: "a persistent research-notes database. Before
    // researching each paragraph, the AI searches that database so it knows what it has already covered."
    // That search is what makes "avoid repetition" enforceable instead of a plea in a prompt.
    //
    // One row per NOTE, not per paragraph: a paragraph may warrant a name note and a connection note, or
    // none at all. Notes are anchored to external_para_id, which IS OceanLibrary's paragraph anchor
    // (${source_url}?paraId=para_NNNN), so a future exporter is a mapping rather than a rewrite.
    await query(`CREATE TABLE IF NOT EXISTS study_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL,
      para_id TEXT NOT NULL,             -- external_para_id: the citable, exportable anchor
      paragraph_index INTEGER NOT NULL,
      chapter_num TEXT, chapter_title TEXT,
      category TEXT NOT NULL,            -- profile-defined: name|person|place|connection|islamic|detail|…
      subject_key TEXT NOT NULL,         -- what the note TEACHES: 'entity:1247564' | 'term:babu-l-bab'
      subject_entity_id INTEGER,         -- when the subject is a resolved entity (preferred over a string)
      body TEXT NOT NULL,                -- the model's note
      edited_body TEXT,                  -- a human's correction, kept SEPARATE so the prompt can be judged
                                         -- against what Chad actually keeps rather than what it produced
      claim_kind TEXT,                   -- explicit_teaching | strong_parallel | interpretive | fact
      sources_json TEXT,                 -- [{docId,paraId,url,quote}] — required for fact/quotation
      new_dimension TEXT,                -- when re-touching a taught subject: what this adds. NULL = first
      review TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | edited | rejected
      model TEXT, version TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      reviewed_at INTEGER
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_study_notes_doc_para ON study_notes(doc_id, paragraph_index)`);
    // The repetition lookup: "have we already taught this subject in this book?" Review state is IN the index
    // because only ACCEPTED notes count as taught — a rejected note must never suppress a later good one.
    await query(`CREATE INDEX IF NOT EXISTS idx_study_notes_subject ON study_notes(doc_id, subject_key, review)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_study_notes_entity ON study_notes(subject_entity_id)`);

    // COMPLETION IS A STAMP, NEVER A NOTE COUNT. Chad's first rule is "many paragraphs may need only one
    // note or no note", so an empty result is COMMON and correct — and measuring done-ness by output is the
    // bug that cost 2026-08-13 twice over (disambiguation, then hype). See api/lib/pipeline/processed.js.
    await query(`CREATE TABLE IF NOT EXISTS study_note_pass (
      doc_id INTEGER NOT NULL,
      para_id TEXT NOT NULL,
      version TEXT NOT NULL,
      notes_written INTEGER NOT NULL DEFAULT 0,
      at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (doc_id, para_id, version)
    )`);
    logger.info('Migration 114 complete: study_notes + study_note_pass');
  },

  113: async () => {
    logger.info('Starting migration 113: query_stats keyed by LABEL (fixes name/fingerprint key mismatch)');
    // BUG in 111+112, caught by a flush test before it could mislead anyone: the in-memory counters key on
    // the query NAME, but the table's primary key was (hour, proc, kind, fingerprint). Two different names
    // that share a statement shape therefore collided into ONE row and silently merged their costs — an
    // accounting tool reporting confidently wrong totals, which is worse than no tool.
    // The persisted key must be the SAME key the counters use: label = name, falling back to fingerprint.
    // query_stats is hours old and purely derived telemetry, so recreating it is cheaper and clearer than
    // migrating rows; at most one hour of stats is lost and it refills within the minute.
    await query(`DROP TABLE IF EXISTS query_stats`);
    await query(`CREATE TABLE query_stats (
      hour INTEGER NOT NULL,
      proc TEXT NOT NULL,
      db_name TEXT,
      kind TEXT NOT NULL,            -- read | write
      label TEXT NOT NULL,           -- the NAME when the call site gave one, else the statement shape
      name TEXT,                     -- present only when named (label === name); NULL flags "wants a name"
      fingerprint TEXT NOT NULL,     -- one representative shape, for reading the SQL behind a name
      n INTEGER NOT NULL DEFAULT 0,
      total_ms INTEGER NOT NULL DEFAULT 0,
      max_ms INTEGER NOT NULL DEFAULT 0,
      sql_sample TEXT,
      PRIMARY KEY (hour, proc, kind, label)
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_qstats_hour ON query_stats(hour)`);
    logger.info('Migration 113 complete: one row per (hour, process, query type)');
  },

  112: async () => {
    logger.info('Starting migration 112: query_stats.name — attribute cost to a QUERY TYPE, not a SQL blob');
    // Chad, 2026-08-13: "each query should have a name so we can easily see which query types are consuming
    // resources, not just individual slow queries." A fingerprint tells you WHAT ran; a name tells you WHY,
    // which is the thing you act on — "budget-check" and "snapshot:bottlenecks" are decisions, a 300-char
    // SELECT is homework. db.query(sql, params, name) has always accepted a name; almost nothing passed one.
    const addCol = async (sql) => { try { await query(sql); } catch (err) { if (!err.message?.includes('duplicate column')) throw err; } };
    await addCol(`ALTER TABLE query_stats ADD COLUMN name TEXT`);
    await addCol(`ALTER TABLE slow_query_log ADD COLUMN name_backfill TEXT`);   // no-op if 109 already added `name`
    logger.info('Migration 112 complete: query cost is attributable by name');
  },

  111: async () => {
    logger.info('Starting migration 111: query_stats — total time attribution for EVERY query');
    // slow_query_log (migration 109) records OUTLIERS (>=1s). That answers "what froze the process" but not
    // "where does the time actually go": a 200ms query run 10,000×/day costs 33 min and never appears. Both
    // failure shapes have bitten this system — a 152s scan AND a 1.3s budget check on a 20s tick — so the
    // instrument has to measure TOTAL time, not just tail latency.
    // Aggregated per (hour, process, statement shape): counters are incremented in memory and flushed
    // periodically, so recording costs one upsert per distinct shape per minute rather than a row per query.
    await query(`CREATE TABLE IF NOT EXISTS query_stats (
      hour INTEGER NOT NULL,         -- unixepoch() truncated to the hour: keeps the table small and trendable
      proc TEXT NOT NULL,
      db_name TEXT,
      kind TEXT NOT NULL,            -- read | write
      fingerprint TEXT NOT NULL,     -- statement shape, literals stripped (shared with slow_query_log)
      n INTEGER NOT NULL DEFAULT 0,
      total_ms INTEGER NOT NULL DEFAULT 0,
      max_ms INTEGER NOT NULL DEFAULT 0,
      sql_sample TEXT,
      PRIMARY KEY (hour, proc, kind, fingerprint)
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_qstats_hour ON query_stats(hour)`);
    logger.info('Migration 111 complete: query_stats');
  },

  110: async () => {
    logger.info('Starting migration 110: bounded budget accounting (baseline_at) + provider/time index');
    // THE SCALING BUG (measured 2026-08-13). The budget gate computed spend as
    //   SUM(estimated_cost_usd) over ALL ai_usage for a provider  −  baseline_usd
    // The arithmetic is right, but it rescans the ENTIRE billing history to derive a number that only
    // depends on rows written since the baseline was taken. ai_usage grows ~76k rows PER BOOK, and
    // budgetStatus() runs on the supervisor's 20s tick and on every monitor poll: 672 calls in 24h,
    // averaging 1.3s each = ~15 min/day of a SYNCHRONOUS freeze in the API process — and it gets
    // linearly worse with every book ever ground. That is a self-throttling pipeline: the more you
    // ground, the slower grounding's own budget check becomes.
    //
    // baseline_at records WHEN the baseline was captured, so the sum can be bounded to rows after it.
    // Backfilled from updated_at — the moment the budget row was written, which is exactly when the
    // baseline was measured, so existing rows stay arithmetically identical.
    const addCol = async (sql) => { try { await query(sql); } catch (err) { if (!err.message?.includes('duplicate column')) throw err; } };
    await addCol(`ALTER TABLE grounding_budget ADD COLUMN baseline_at TEXT`);
    await query(`UPDATE grounding_budget SET baseline_at = datetime(COALESCE(updated_at, 0), 'unixepoch') WHERE baseline_at IS NULL`);
    // ai_usage.timestamp is TEXT datetime('now'), so lexicographic compare works and an index on
    // (provider, timestamp) turns the scan into a range seek over just the current budget period.
    await ensureIndex(query, {
      label: 'Migration 110 (idx_ai_usage_provider_ts)', table: 'ai_usage', columns: ['provider', 'timestamp'],
      sql: `CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_ts ON ai_usage(provider, timestamp)`,
    });
    logger.info('Migration 110 complete: budget spend is now bounded to the current period');
  },

  109: async () => {
    logger.info('Starting migration 109: slow_query_log (the slow-query signal finally has somewhere to land)');
    // db.js has timed every query against SLOW_QUERY_THRESHOLD_MS for a long time and calls itself "the
    // single source of truth for slow-query visibility" — but the signal had NO consumer: it wrote one
    // log line and stopped. A 61-SECOND writer-blocking UPDATE and a 151ms read produced the same kind of
    // line, in a 629MB file nobody reads. That query stalled the single writer's event loop on every boot,
    // closed /write's sockets mid-request, and killed a whole night of grounding before anyone looked.
    // Recording it makes it queryable across ALL processes (api, worker, embedding…), which an in-memory
    // counter cannot do — the worker is a different process from the API that serves the dashboard.
    await query(`CREATE TABLE IF NOT EXISTS slow_query_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL DEFAULT (unixepoch()),
      proc TEXT NOT NULL,            -- which process blocked: api | worker | embedding | <script name>
      db_name TEXT,                  -- content | user | graph
      kind TEXT NOT NULL,            -- read | write  (a slow WRITE on the worker stalls /write for everyone)
      duration_ms INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,     -- statement shape with literals stripped, so repeats aggregate
      sql_sample TEXT,               -- one real example, truncated
      query_plan TEXT,               -- EXPLAIN output for reads: usually names the missing index outright
      name TEXT                      -- caller label when the call site passed one
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_slowq_at ON slow_query_log(at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_slowq_fp ON slow_query_log(fingerprint, at)`);
    logger.info('Migration 109 complete: slow_query_log');
  },

  108: async () => {
    logger.info('Starting migration 108: audit_log (durable file/doc mutation trail)');
    await query(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL DEFAULT (unixepoch()),
      actor TEXT NOT NULL,           -- who: 'convert-missing-books', 'ingest-converted-books', 'ingester', 'dedupe', 'api:<route>'
      action TEXT NOT NULL,          -- what: file.write | file.delete | doc.create | doc.update | doc.retire | doc.delete | doc.restore | doc.language
      target TEXT,                   -- the file path, or doc:<id>
      doc_id INTEGER,
      reason TEXT,                   -- WHY, in words a human can act on
      detail_json TEXT,              -- {from,to,bytes,source_url,superseded_by,…}
      run_id INTEGER                 -- pipeline_run.id when inside a stage run, so an action ties to its batch
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_doc ON audit_log(doc_id, at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target)`);
    logger.info('Migration 108 complete');
  },
};

export const graphMigrations = {
  1: async () => {
    logger.info('Starting graph migration 1: entity layer schema in graph.db');

    await graphQuery(`CREATE TABLE IF NOT EXISTS authority_tiers (
      tier TEXT PRIMARY KEY,
      rank INTEGER NOT NULL,
      description TEXT,
      is_closed_corpus INTEGER
    )`);

    const tiers = [
      ['revealed', 100, "Words of a Manifestation of God (Bahá'u'lláh, the Báb) — primary scripture", 1],
      ['central_figure', 90, "Writings of ʿAbdu'l-Bahá as Centre of the Covenant", 1],
      ['authorized_interpretation', 80, 'Writings of Shoghi Effendi in his interpretive capacity — doctrinally binding; closed 1957', 1],
      ['institutional', 25, 'Letters and pronouncements of the Universal House of Justice — legislative authority, not doctrinal', 0],
      ['approved_history', 60, 'Histories explicitly approved by the central institution', 0],
      ['primary_scripture_other', 90, 'Primary scripture of non-Bahá\'í traditions — within its own tradition', 1],
      ['tradition_doctrinal', 75, 'Doctrinally binding interpretation within a tradition', 0],
      ['tradition_authoritative', 65, 'Authoritative-but-not-doctrinal works (major commentaries, classical histories)', 0],
      ['scholarly', 50, 'Modern academic scholarship — historical and analytical value', 0],
      ['secondary', 30, 'Devotional, biographical, or interpretive works without doctrinal standing', 0],
      ['reference', 20, 'Encyclopedia entries, dictionaries, general reference works', 0],
      ['unknown', 10, 'Source authority undetermined', 0],
    ];
    for (const [tier, rank, desc, closed] of tiers) {
      await graphQuery(`INSERT OR IGNORE INTO authority_tiers VALUES (?,?,?,?)`, [tier, rank, desc, closed]);
    }

    await graphQuery(`CREATE TABLE IF NOT EXISTS entity_aliases (
      id INTEGER PRIMARY KEY,
      entity_id INTEGER NOT NULL,
      surface TEXT NOT NULL,
      surface_norm TEXT NOT NULL,
      lang TEXT DEFAULT 'en',
      source TEXT,
      confidence REAL DEFAULT 1.0,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS entity_mentions (
      id INTEGER PRIMARY KEY,
      entity_id INTEGER NOT NULL,
      content_id TEXT NOT NULL,
      role TEXT,
      resolution_confidence REAL,
      status TEXT DEFAULT 'resolved',
      em_synced INTEGER DEFAULT 0,
      extractor_version TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS paragraph_roles (
      id INTEGER PRIMARY KEY,
      content_id TEXT NOT NULL,
      speaker_entity_id INTEGER,
      narrator_entity_id INTEGER,
      addressee_entity_id INTEGER,
      setting_place_entity_id INTEGER,
      setting_time TEXT,
      extractor_version TEXT
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS entity_sets (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      set_type TEXT,
      religion TEXT,
      source_authority_tier TEXT REFERENCES authority_tiers(tier),
      notes TEXT
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS set_members (
      set_id INTEGER NOT NULL REFERENCES entity_sets(id),
      entity_id INTEGER NOT NULL,
      ordinal INTEGER,
      source_paragraph_id TEXT,
      PRIMARY KEY (set_id, entity_id)
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS quote_clusters (
      id INTEGER PRIMARY KEY,
      speaker_entity_id INTEGER,
      canonical_text TEXT,
      lang TEXT,
      instance_count INTEGER DEFAULT 1
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS quote_instances (
      id INTEGER PRIMARY KEY,
      cluster_id INTEGER REFERENCES quote_clusters(id),
      content_id TEXT NOT NULL,
      span_start INTEGER,
      span_end INTEGER,
      speaker_surface TEXT,
      speaker_entity_id INTEGER,
      attribution_pattern TEXT,
      nesting_depth INTEGER DEFAULT 0,
      extractor_version TEXT
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS paragraph_extractions (
      id INTEGER PRIMARY KEY,
      content_id TEXT NOT NULL,
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

    await graphQuery(`CREATE TABLE IF NOT EXISTS extraction_validations (
      id INTEGER PRIMARY KEY,
      extraction_id INTEGER NOT NULL REFERENCES paragraph_extractions(id),
      validator_model TEXT,
      errors_json TEXT,
      confidence REAL,
      recommended_action TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS extraction_runs (
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

    await graphQuery(`CREATE TABLE IF NOT EXISTS er_audit_log (
      id INTEGER PRIMARY KEY,
      action TEXT NOT NULL,
      candidate TEXT,
      model_votes TEXT,
      evidence_paragraphs TEXT,
      run_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS model_calibration (
      id INTEGER PRIMARY KEY,
      model TEXT NOT NULL,
      category TEXT NOT NULL,
      accuracy REAL,
      sample_size INTEGER,
      run_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(model, category)
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS promotion_queue (
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

    await graphQuery(`CREATE TABLE IF NOT EXISTS significance_markers (
      id INTEGER PRIMARY KEY,
      subject_entity_id INTEGER,
      marker_type TEXT,
      marker_value TEXT,
      source_paragraph_id TEXT,
      source_authority_tier TEXT REFERENCES authority_tiers(tier),
      source_work_id TEXT,
      notes TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS periods (
      id TEXT PRIMARY KEY,
      religion TEXT,
      parent_id TEXT REFERENCES periods(id),
      name TEXT,
      date_start TEXT,
      date_end TEXT,
      date_precision TEXT,
      sort_order INTEGER
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      period_id TEXT REFERENCES periods(id),
      name TEXT,
      date_start TEXT,
      date_end TEXT,
      date_precision TEXT,
      narrative_summary TEXT,
      source_paragraph_ids TEXT
    )`);

    await graphQuery(`CREATE TABLE IF NOT EXISTS pending_bridge_relations (
      id INTEGER PRIMARY KEY,
      subject_entity_id INTEGER,
      predicate TEXT NOT NULL,
      target_tradition TEXT NOT NULL,
      target_literal TEXT NOT NULL,
      target_entity_id INTEGER,
      evidence_paragraph_id TEXT,
      modality TEXT,
      confidence REAL,
      source_authority TEXT,
      source_authority_tier TEXT REFERENCES authority_tiers(tier),
      status TEXT DEFAULT 'pending_target',
      created_at INTEGER DEFAULT (unixepoch()),
      resolved_at INTEGER
    )`);

    // Indexes
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_em_entity ON entity_mentions(entity_id)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_em_content ON entity_mentions(content_id)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_em_unsynced ON entity_mentions(em_synced) WHERE em_synced = 0`);
    await graphQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_em_unique ON entity_mentions(entity_id, content_id, role)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_alias_surface ON entity_aliases(surface_norm)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_alias_entity ON entity_aliases(entity_id)`);
    await graphQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_unique ON entity_aliases(entity_id, surface_norm, lang)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_quote_cluster ON quote_instances(cluster_id)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_promotion_priority ON promotion_queue(priority DESC, attempts ASC)`);
    await graphQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pq_unique ON promotion_queue(surface_norm, type)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_episodes_period ON episodes(period_id)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_sig_entity ON significance_markers(subject_entity_id)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_sig_tier ON significance_markers(source_authority_tier)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_pending_bridge ON pending_bridge_relations(target_tradition, status)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_extractions_resolved ON paragraph_extractions(resolved)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_extraction_runs_date ON extraction_runs(created_at)`);
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_ev_extraction_id ON extraction_validations(extraction_id)`);

    logger.info('Graph migration 1 complete: entity layer schema in graph.db');
  },
};
