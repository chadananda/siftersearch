#!/usr/bin/env node
/**
 * Build Knowledge Graph from content_objects
 *
 * Reads content_objects (NER results), aggregates entities by name+type+religion,
 * computes co-occurrence relations, and populates graph_entities/graph_relations.
 *
 * Usage:
 *   node scripts/build-graph.js                    # full build
 *   node scripts/build-graph.js --dry-run           # count only
 *   node scripts/build-graph.js --religion "Baha'i" # single religion
 *   node scripts/build-graph.js --min-mentions 3    # filter noise
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'sifter.db');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const minMentions = parseInt(args[args.indexOf('--min-mentions') + 1]) || 2;
const religionFilter = args.includes('--religion') ? args[args.indexOf('--religion') + 1] : null;

// Entity types we extract from JSON columns
const ENTITY_COLUMNS = [
  { column: 'people_json', type: 'person' },
  { column: 'places_json', type: 'place' },
  { column: 'concepts_json', type: 'concept' },
  { column: 'events_json', type: 'event' },
  { column: 'documents_json', type: 'document' },
];

// Normalize entity names for deduplication
function canonicalize(name) {
  return name
    .trim()
    .replace(/\s+/g, ' ')           // collapse whitespace
    .replace(/^(the|a|an)\s+/i, '') // strip leading articles
    .replace(/[''`]/g, "'");        // normalize quotes
}

// Filter out garbage entities
function isValidEntity(name) {
  if (!name || name.length < 2 || name.length > 100) return false;
  // Skip numeric-only, single chars, control chars
  if (/^\d+$/.test(name)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(name)) return false;
  // Skip entities that are mostly punctuation
  const alphaRatio = (name.match(/[\p{L}]/gu) || []).length / name.length;
  if (alphaRatio < 0.4) return false;
  return true;
}

function main() {
  console.log('=== Build Knowledge Graph ===');
  console.log(`Min mentions: ${minMentions}`);
  if (religionFilter) console.log(`Religion filter: ${religionFilter}`);
  console.log();

  const db = new Database(DB_PATH, { readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Ensure tables exist (migration 50)
  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      religion TEXT,
      mention_count INTEGER DEFAULT 1,
      doc_count INTEGER DEFAULT 1,
      era TEXT,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(canonical_name, entity_type, religion)
    );
    CREATE TABLE IF NOT EXISTS graph_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_entity_id INTEGER NOT NULL,
      target_entity_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'co-occurs',
      weight INTEGER DEFAULT 1,
      source_doc_id INTEGER,
      source_content_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_entity_id, target_entity_id, relation_type),
      FOREIGN KEY (source_entity_id) REFERENCES graph_entities(id),
      FOREIGN KEY (target_entity_id) REFERENCES graph_entities(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ge_religion ON graph_entities(religion);
    CREATE INDEX IF NOT EXISTS idx_ge_type ON graph_entities(entity_type);
    CREATE INDEX IF NOT EXISTS idx_ge_mention ON graph_entities(mention_count DESC);
    CREATE INDEX IF NOT EXISTS idx_gr_source ON graph_relations(source_entity_id);
    CREATE INDEX IF NOT EXISTS idx_gr_target ON graph_relations(target_entity_id);
  `);

  // Phase 1: Read all content_objects and aggregate entities
  console.log('Phase 1: Aggregating entities from content_objects...');

  let query = `
    SELECT co.content_id, co.doc_id,
           co.people_json, co.places_json, co.documents_json,
           co.events_json, co.concepts_json,
           d.religion
    FROM content_objects co
    JOIN docs d ON co.doc_id = d.id
  `;
  const params = [];
  if (religionFilter) {
    query += ' WHERE d.religion = ?';
    params.push(religionFilter);
  }

  const rows = db.prepare(query).all(...params);
  console.log(`  Content objects: ${rows.length.toLocaleString()}`);

  // entityKey → { name, canonical, type, religion, mentions, docs: Set }
  const entityMap = new Map();
  // co-occurrence: paragraphId → [entityKey, ...]
  const cooccurrences = [];
  let totalEntities = 0;

  for (const row of rows) {
    const religion = row.religion || 'Unknown';
    const paraEntities = [];

    for (const { column, type } of ENTITY_COLUMNS) {
      let entities;
      try {
        entities = JSON.parse(row[column] || '[]');
      } catch { continue; }

      for (const ent of entities) {
        const name = ent?.name;
        if (!name || !isValidEntity(name)) continue;

        const canonical = canonicalize(name);
        const key = `${type}::${canonical}::${religion}`;

        if (!entityMap.has(key)) {
          entityMap.set(key, {
            name: name,  // keep first-seen display name
            canonical,
            type,
            religion,
            mentions: 0,
            docs: new Set()
          });
        }

        const entry = entityMap.get(key);
        entry.mentions++;
        entry.docs.add(row.doc_id);
        totalEntities++;
        paraEntities.push(key);
      }
    }

    // Track co-occurrences for this paragraph
    if (paraEntities.length >= 2) {
      cooccurrences.push(paraEntities);
    }
  }

  console.log(`  Unique entities: ${entityMap.size.toLocaleString()}`);
  console.log(`  Total mentions: ${totalEntities.toLocaleString()}`);
  console.log(`  Paragraphs with co-occurrences: ${cooccurrences.length.toLocaleString()}`);

  // Filter by minimum mentions
  const filtered = new Map();
  for (const [key, ent] of entityMap) {
    if (ent.mentions >= minMentions) {
      filtered.set(key, ent);
    }
  }
  console.log(`  After filtering (>=${minMentions} mentions): ${filtered.size.toLocaleString()}`);

  if (dryRun) {
    // Show top entities per religion
    const byReligion = new Map();
    for (const ent of filtered.values()) {
      if (!byReligion.has(ent.religion)) byReligion.set(ent.religion, []);
      byReligion.get(ent.religion).push(ent);
    }
    for (const [rel, ents] of [...byReligion.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const top = ents.sort((a, b) => b.mentions - a.mentions).slice(0, 5);
      console.log(`\n  ${rel} (${ents.length} entities):`);
      for (const e of top) {
        console.log(`    ${e.name} (${e.type}, ${e.mentions} mentions, ${e.docs.size} docs)`);
      }
    }
    db.close();
    return;
  }

  // Phase 2: Insert entities
  console.log('\nPhase 2: Inserting entities...');

  // Clear existing data
  if (religionFilter) {
    db.prepare('DELETE FROM graph_relations WHERE source_entity_id IN (SELECT id FROM graph_entities WHERE religion = ?)').run(religionFilter);
    db.prepare('DELETE FROM graph_relations WHERE target_entity_id IN (SELECT id FROM graph_entities WHERE religion = ?)').run(religionFilter);
    db.prepare('DELETE FROM graph_entities WHERE religion = ?').run(religionFilter);
  } else {
    db.exec('DELETE FROM graph_relations');
    db.exec('DELETE FROM graph_entities');
  }

  const insertEntity = db.prepare(`
    INSERT OR REPLACE INTO graph_entities (name, canonical_name, entity_type, religion, mention_count, doc_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Map entityKey → graph_entity.id
  const entityIdMap = new Map();
  const insertBatch = db.transaction((entries) => {
    for (const [key, ent] of entries) {
      const info = insertEntity.run(ent.name, ent.canonical, ent.type, ent.religion, ent.mentions, ent.docs.size);
      entityIdMap.set(key, info.lastInsertRowid);
    }
  });

  const entries = [...filtered.entries()];
  const BATCH_SIZE = 5000;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    insertBatch(entries.slice(i, i + BATCH_SIZE));
    if ((i / BATCH_SIZE + 1) % 10 === 0) {
      console.log(`  ${Math.min(i + BATCH_SIZE, entries.length).toLocaleString()} / ${entries.length.toLocaleString()}`);
    }
  }
  console.log(`  Inserted: ${entityIdMap.size.toLocaleString()} entities`);

  // Phase 3: Build co-occurrence relations
  console.log('\nPhase 3: Building co-occurrence relations...');

  // Count co-occurrences between entity pairs
  const pairCounts = new Map();
  let totalPairs = 0;

  for (const paraKeys of cooccurrences) {
    // Only use entities that passed the filter
    const validKeys = paraKeys.filter(k => entityIdMap.has(k));
    // Deduplicate within paragraph
    const unique = [...new Set(validKeys)];

    // Create pairs (sorted to avoid duplicates)
    for (let i = 0; i < unique.length && i < 20; i++) { // cap at 20 to avoid N^2 explosion
      for (let j = i + 1; j < unique.length && j < 20; j++) {
        const pair = unique[i] < unique[j] ? `${unique[i]}|||${unique[j]}` : `${unique[j]}|||${unique[i]}`;
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
        totalPairs++;
      }
    }
  }

  console.log(`  Raw co-occurrence pairs: ${pairCounts.size.toLocaleString()}`);

  // Filter to relations with weight >= 2 (co-occur in at least 2 paragraphs)
  const minWeight = 2;
  const validRelations = [...pairCounts.entries()].filter(([, w]) => w >= minWeight);
  console.log(`  After filtering (weight >= ${minWeight}): ${validRelations.length.toLocaleString()}`);

  const insertRelation = db.prepare(`
    INSERT OR REPLACE INTO graph_relations (source_entity_id, target_entity_id, relation_type, weight)
    VALUES (?, ?, 'co-occurs', ?)
  `);

  const insertRelBatch = db.transaction((rels) => {
    for (const [pair, weight] of rels) {
      const [keyA, keyB] = pair.split('|||');
      const idA = entityIdMap.get(keyA);
      const idB = entityIdMap.get(keyB);
      if (idA && idB) {
        insertRelation.run(idA, idB, weight);
      }
    }
  });

  for (let i = 0; i < validRelations.length; i += BATCH_SIZE) {
    insertRelBatch(validRelations.slice(i, i + BATCH_SIZE));
  }

  // Final stats
  const entityCount = db.prepare('SELECT COUNT(*) as c FROM graph_entities').get().c;
  const relationCount = db.prepare('SELECT COUNT(*) as c FROM graph_relations').get().c;
  const byReligion = db.prepare('SELECT religion, COUNT(*) as c FROM graph_entities GROUP BY religion ORDER BY c DESC').all();
  const byType = db.prepare('SELECT entity_type, COUNT(*) as c FROM graph_entities GROUP BY entity_type ORDER BY c DESC').all();

  console.log('\n=== Summary ===');
  console.log(`Entities:  ${entityCount.toLocaleString()}`);
  console.log(`Relations: ${relationCount.toLocaleString()}`);
  console.log('\nBy religion:');
  for (const r of byReligion) console.log(`  ${r.religion}: ${r.c.toLocaleString()}`);
  console.log('\nBy type:');
  for (const t of byType) console.log(`  ${t.entity_type}: ${t.c.toLocaleString()}`);

  // Top 10 entities overall
  const top = db.prepare('SELECT name, entity_type, religion, mention_count FROM graph_entities ORDER BY mention_count DESC LIMIT 10').all();
  console.log('\nTop 10 entities:');
  for (const e of top) console.log(`  ${e.name} (${e.entity_type}, ${e.religion}) — ${e.mention_count.toLocaleString()} mentions`);

  db.close();
  console.log('\nDone.');
}

main();
