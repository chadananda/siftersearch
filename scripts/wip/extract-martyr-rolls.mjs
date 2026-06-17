#!/usr/bin/env node
// Subscription-extraction (Claude Code, NOT an API model) of the Dawn-Breakers
// martyr-roll list-items the adapter fix recovered. Range-driven: each ROLL gives
// a paragraph_index window + provenance (the judgment); the script pulls the
// PENDING (graph_enriched=0) list-items in that window, creates ONE durable person
// entity each (religion='' to match the canonical roster), folds kinship/origin
// from the text into `description`, and writes a mention + flips graph_enriched.
//
// SKIPS NOTHING in-window. Same-name collisions disambiguated by paragraph_index
// so distinct martyrs never collapse. Kinship is recorded as TEXT in description,
// NOT as a graph_relation (linking to a same-named entity would be a namesake error;
// real relations come in the Step-3 research pass).
//
// SAFETY: two-books only (DOC=21308). sifter.db writes route through the single-
// writer (SIFTER_WRITER_URL); graph.db direct. DRY-RUN by default.
//   node scripts/wip/extract-martyr-rolls.mjs            # dry-run
//   node scripts/wip/extract-martyr-rolls.mjs --apply

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { query, queryAll, graphQuery, transaction } = await import(join(ROOT, 'api/lib/db.js'));
const { normalizeSurface } = await import(join(ROOT, 'api/lib/graph-db.js'));

const APPLY = process.argv.includes('--apply');
const DOC = 21308;
const EV = 'cc-subscription-rolls-v1';

// Each ROLL: { tag, prov, start, end }. prov = the standalone descriptor (from the
// framing paragraph). tag = short locative used to disambiguate canonical names.
const ROLLS = [
  { tag: 'Sang-Sar',   start: 821, end: 841, prov: 'Bábí; companion of the village of Sang-Sar (district of Simnán) — one of the eighteen martyred — who fell in the Bábí upheavals of Mázindarán. (The Dawn-Breakers, Sang-Sar roll.)' },
  { tag: 'Mázindarán', start: 843, end: 869, prov: 'Bábí; one of the twenty-seven recorded martyrs among the adherents of the Faith in Mázindarán. (The Dawn-Breakers, Mázindarán roll.)' },
];

// trailing footnote markers [^N], page markers [pg N]/[pgN], trailing "and", punctuation
function cleanName(t) {
  return t
    .replace(/\[\^[^\]]*\]/g, '')
    .replace(/\[pg[^\]]*\]/gi, '')
    .replace(/\\/g, '')
    .replace(/\s+and\s*$/i, '')
    .replace(/[,.;:\s]+$/g, '')
    .trim();
}
// kinship / descriptor clause after the first comma (e.g. "the brother of Mullá Ḥusayn")
function kinClause(t) {
  const m = cleanName(t).match(/,\s*(.+)$/);
  return m ? m[1].trim() : null;
}
// the bare name = text before the first comma
function bareName(t) {
  return cleanName(t).split(',')[0].trim();
}

async function run() {
  let created = 0, mentions = 0, enriched = 0;
  for (const roll of ROLLS) {
    const rows = await queryAll(
      `SELECT id, paragraph_index, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND COALESCE(graph_enriched,0)=0 AND blocktype='paragraph' AND paragraph_index BETWEEN ? AND ? ORDER BY paragraph_index`,
      [DOC, roll.start, roll.end]
    );
    // Decide canonicals (disambiguate same-name within the roll by paragraph_index)
    const decided = [];
    const seen = new Map();
    for (const r of rows) {
      const bare = bareName(r.text), kin = kinClause(r.text);
      const n = (seen.get(bare) || 0) + 1; seen.set(bare, n);
      decided.push({ cid: r.id, bare, canonical: `${bare} (${roll.tag}${n > 1 ? `, ${r.paragraph_index}` : ''})`, description: roll.prov + (kin ? ` Described as: ${kin}.` : ''), kin });
    }
    console.log(`\n=== ${roll.tag} [${roll.start}-${roll.end}] — ${decided.length} pending members ===`);
    if (!APPLY) { for (const d of decided) console.log(`  [${d.cid}] "${d.canonical}"${d.kin ? `  ← ${d.kin}` : ''}`); continue; }
    if (!decided.length) continue;

    // 1. ONE writer transaction: insert all entities
    await transaction(decided.map(d => ({ sql: `INSERT OR IGNORE INTO graph_entities (canonical_name, name, entity_type, religion, description) VALUES (?,?, 'person', '', ?)`, args: [d.canonical, d.canonical, d.description] })));
    // 2. one read: resolve ids
    const ph = decided.map(() => '?').join(',');
    const idRows = await queryAll(`SELECT id, canonical_name FROM graph_entities WHERE canonical_name IN (${ph}) AND entity_type='person' AND religion=''`, decided.map(d => d.canonical));
    const idMap = new Map(idRows.map(r => [r.canonical_name, r.id]));
    // 3. graph.db (direct, fast): aliases + mentions
    for (const d of decided) {
      const id = idMap.get(d.canonical); if (!id) continue;
      await graphQuery(`INSERT OR IGNORE INTO entity_aliases (entity_id, surface, surface_norm, lang, source, confidence) VALUES (?,?,?, 'en', ?, 0.9)`, [id, d.bare, normalizeSurface(d.bare), EV]);
      await graphQuery(`INSERT OR IGNORE INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?, 'subject', 1.0, 'resolved', ?)`, [id, String(d.cid), EV]);
      created++; mentions++;
    }
    // 4. ONE writer transaction: flip graph_enriched for the whole roll
    await transaction([{ sql: `UPDATE content SET graph_enriched = 1, graph_enriched_at = datetime('now'), extractor_version = ? WHERE id IN (${decided.map(() => '?').join(',')})`, args: [EV, ...decided.map(d => d.cid)] }]);
    enriched += decided.length;
    console.log(`  ✓ ${roll.tag}: ${decided.length} entities + mentions + enriched`);
  }
  console.log(`\n${APPLY ? '⚙ APPLIED' : '🔍 DRY-RUN'}: ${APPLY ? `created ${created} entities, ${mentions} mentions, ${enriched} enriched` : 're-run with --apply to write'}`);
  process.exit(0);
}
run();
