// Content DB migrations 72+ — entity layer schema
// New tables: entity_aliases, entity_mentions, paragraph_roles, entity_sets,
// set_members, quote_clusters, quote_instances, paragraph_extractions,
// extraction_validations, extraction_runs, er_audit_log, model_calibration,
// promotion_queue, authority_tiers, significance_markers, periods, episodes,
// pending_bridge_relations.
// Extends: graph_entities, graph_relations, content, docs.

import { query } from '../db.js';
import { logger } from '../logger.js';

export const migrations = {
  72: async () => {
    logger.info('Starting migration 72: entity layer schema');

    await query(`CREATE TABLE IF NOT EXISTS authority_tiers (
      tier TEXT PRIMARY KEY,
      rank INTEGER NOT NULL,
      description TEXT,
      is_closed_corpus INTEGER
    )`);

    const tiers = [
      ['revealed', 100, "Words of a Manifestation of God (Bahá'u'lláh, the Báb) — primary scripture", 1],
      ['central_figure', 90, "Writings of ʿAbdu'l-Bahá as Centre of the Covenant", 1],
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
      em_synced INTEGER DEFAULT 0,
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
      span_start INTEGER,
      span_end INTEGER,
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
      date_start TEXT,
      date_end TEXT,
      date_precision TEXT,
      sort_order INTEGER
    )`);

    await query(`CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      period_id TEXT REFERENCES periods(id),
      name TEXT,
      date_start TEXT,
      date_end TEXT,
      date_precision TEXT,
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

    // Extend existing tables — idempotent (catch duplicate column errors)
    const addCol = async (tbl, col, def) => {
      try { await query(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`); } catch { /* duplicate column — already applied */ }
    };

    await addCol('graph_entities', 'source_authority_tier', 'TEXT REFERENCES authority_tiers(tier)');
    await addCol('graph_entities', 'cross_tradition_candidate', 'INTEGER DEFAULT 0');
    await addCol('graph_relations', 'source_authority_tier', 'TEXT REFERENCES authority_tiers(tier)');

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

    // Indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_content_graph_unsync ON content(graph_enriched) WHERE graph_enriched = 0`);
    await query(`CREATE INDEX IF NOT EXISTS idx_content_doc_graph ON content(doc_id, graph_enriched) WHERE graph_enriched = 0`);
    await query(`CREATE INDEX IF NOT EXISTS idx_em_entity ON entity_mentions(entity_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_em_content ON entity_mentions(content_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_em_unsynced ON entity_mentions(em_synced) WHERE em_synced = 0`);
    await addCol('entity_mentions', 'em_synced', 'INTEGER DEFAULT 0');
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
    // and promotion_queue. Without these, INSERT OR IGNORE never ignores —
    // every call inserts a duplicate row, causing full-table-scan on each
    // write and 2000ms+ DB locks that block the entire sync pipeline.
    //
    // Steps: deduplicate existing rows, then create unique indexes.

    // 1. Deduplicate promotion_queue — keep lowest id per (surface_norm, type)
    await query(`
      DELETE FROM promotion_queue
      WHERE id NOT IN (
        SELECT MIN(id) FROM promotion_queue GROUP BY surface_norm, type
      )
    `);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pq_unique ON promotion_queue(surface_norm, type)`);

    // 2. Deduplicate entity_aliases — keep highest confidence per (entity_id, surface_norm, lang)
    await query(`
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
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_unique ON entity_aliases(entity_id, surface_norm, lang)`);

    // 3. Deduplicate entity_mentions — keep lowest id per (entity_id, content_id, role)
    await query(`
      DELETE FROM entity_mentions
      WHERE id NOT IN (
        SELECT MIN(id) FROM entity_mentions GROUP BY entity_id, content_id, role
      )
    `);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_em_unique ON entity_mentions(entity_id, content_id, role)`);

    // 4. Analyze the tables so SQLite uses the new indexes immediately
    await query(`ANALYZE promotion_queue`);
    await query(`ANALYZE entity_aliases`);
    await query(`ANALYZE entity_mentions`);

    logger.info('Migration 74 complete: unique constraints on entity_aliases, entity_mentions, promotion_queue');
  },
};
