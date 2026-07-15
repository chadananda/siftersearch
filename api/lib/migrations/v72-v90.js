// Content DB migrations 72+ — entity layer schema (ALTER TABLE only on content/docs/graph_entities/graph_relations)
// New graph pipeline tables live in graph.db via graphMigrations[1].

import { query, graphQuery } from '../db.js';
import { logger } from '../logger.js';

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
    await graphQuery(`CREATE INDEX IF NOT EXISTS idx_ev_extraction_id ON extraction_validations(extraction_id)`);
    logger.info('Migration 82 complete: idx_ev_extraction_id on extraction_validations');
  },

  83: async () => {
    // Correct authority_tiers ranks (graph.db).
    await graphQuery(`UPDATE authority_tiers SET rank=25, description='Letters and pronouncements of the Universal House of Justice — legislative authority, not doctrinal' WHERE tier='institutional'`);
    await graphQuery(`UPDATE authority_tiers SET rank=50, description='Modern academic scholarship — historical and analytical value' WHERE tier='scholarly'`);
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
    await query(`CREATE INDEX IF NOT EXISTS idx_ge_type_importance ON graph_entities(entity_type, importance)`);
    logger.info('Migration 85 complete: idx_ge_type_importance (kills the person-list TEMP B-TREE sort)');
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
