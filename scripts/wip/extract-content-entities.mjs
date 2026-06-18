#!/usr/bin/env node
// Step 2 content-entity extractor (subscription/Claude Code, NO API).
// Input: a decisions JSON {"paras":[{"cid":N,"surfaces":[{"s":"Imám Ḥusayn","type":"person"}, ...]}]}
// produced by me/subagents doing NER on the recovered GPB+DB footnotes/narrative.
//
// For each surface: resolve to an EXISTING entity (findEntity, alias/canonical match).
//   resolved  -> write entity_mention (graph.db, direct).
//   unresolved -> append to a new-candidates review file (do NOT auto-create from footnotes;
//                 deliberate creation happens in the Step 3 research pass).
// Mark EVERY input paragraph graph_enriched=1 (skip nothing — even no-entity definition notes).
//
// sifter.db writes route through the single-writer (SIFTER_WRITER_URL); graph.db direct.
//   node scripts/wip/extract-content-entities.mjs <decisions.json>           # dry-run
//   node scripts/wip/extract-content-entities.mjs <decisions.json> --apply

import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { query, transaction, graphQuery } = await import(join(ROOT, 'api/lib/db.js'));
const { findEntity } = await import(join(ROOT, 'api/lib/graph-db.js'));

const FILE = process.argv[2];
const APPLY = process.argv.includes('--apply');
const EV = 'cc-subscription-content-v1';
if (!FILE) { console.error('usage: extract-content-entities.mjs <decisions.json> [--apply]'); process.exit(1); }
const decisions = JSON.parse(readFileSync(FILE, 'utf8'));

const mentionStmts = [];   // graph.db inserts
const candidates = [];     // unresolved surfaces -> Step 3
const enrichCids = [];
let resolved = 0;

for (const p of decisions.paras || []) {
  enrichCids.push(p.cid);
  for (const m of (p.surfaces || [])) {
    const surface = (m.s || '').trim();
    if (!surface) continue;
    const f = await findEntity({ surface, type: m.type });
    if (f?.entity_id) {
      resolved++;
      mentionStmts.push({ sql: `INSERT OR IGNORE INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?, 'mention', 0.85, 'resolved', ?)`, args: [f.entity_id, String(p.cid), EV] });
    } else {
      candidates.push({ cid: p.cid, surface, type: m.type || null });
    }
  }
}

console.log(`paras=${(decisions.paras||[]).length} surfaces_resolved=${resolved} new_candidates=${candidates.length}`);
if (!APPLY) { console.log('DRY-RUN — re-run with --apply'); process.exit(0); }

// graph.db mentions (direct) — chunk to keep each call modest
for (let i = 0; i < mentionStmts.length; i++) { const s = mentionStmts[i]; await graphQuery(s.sql, s.args); }
// sifter.db graph_enriched (via writer) — one batched UPDATE per 400 cids
for (let i = 0; i < enrichCids.length; i += 400) {
  const chunk = enrichCids.slice(i, i + 400);
  await transaction([{ sql: `UPDATE content SET graph_enriched = 1, graph_enriched_at = datetime('now'), extractor_version = ? WHERE id IN (${chunk.map(() => '?').join(',')})`, args: [EV, ...chunk] }]);
}
// append candidates to the Step-3 review file
const CAND = join(ROOT, 'scripts/wip/corrections/content-new-candidates.json');
let prior = []; try { prior = JSON.parse(readFileSync(CAND, 'utf8')); } catch { /* none */ }
writeFileSync(CAND, JSON.stringify([...prior, ...candidates], null, 1));
console.log(`APPLIED: mentions=${resolved} enriched=${enrichCids.length} candidates_appended=${candidates.length} -> ${CAND}`);
process.exit(0);
