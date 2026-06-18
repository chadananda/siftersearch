#!/usr/bin/env node
// Gather VERBATIM God-Passes-By (doc 21310) characterizations into each entity's description.
// GPB (Shoghi Effendi) is the doctrinal-gold anchor: for every entity mentioned in GPB, pull
// the actual GPB sentences that name it — preserving his exact adjectives/descriptors/epithets,
// NO summarizing (fragmented verbatim quotes are fine) — and store them as the description.
// GPB text leads ("GPB: …"); any prior description (e.g. martyr provenance) is appended after " | ".
//   node scripts/wip/gather-gpb-descriptions.mjs            # dry-run (sample)
//   node scripts/wip/gather-gpb-descriptions.mjs --apply
// sifter.db writes route through the single-writer (SIFTER_WRITER_URL).

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });
const { queryAll, graphQueryAll, transaction } = await import(join(ROOT, 'api/lib/db.js'));
const { normalizeSurface } = await import(join(ROOT, 'api/lib/graph-db.js'));

const APPLY = process.argv.includes('--apply');
const GPB = 21310;
const MAX_SENT = 6;     // up to 6 verbatim sentences per entity
const MAX_LEN = 1400;   // cap description length

// 1. GPB paragraphs
const gpbRows = await queryAll(`SELECT id, text FROM content WHERE doc_id=${GPB} AND deleted_at IS NULL AND text IS NOT NULL`);
const gpbText = new Map(gpbRows.map(r => [Number(r.id), r.text]));
// 2. entity → GPB paragraphs (via mentions)
const ment = await graphQueryAll(`SELECT entity_id, content_id FROM entity_mentions`);
const entParas = new Map();
for (const m of ment) { const cid = parseInt(m.content_id, 10); if (gpbText.has(cid)) { if (!entParas.has(m.entity_id)) entParas.set(m.entity_id, new Set()); entParas.get(m.entity_id).add(cid); } }
// 3. entities + aliases + existing descriptions
const ents = await queryAll(`SELECT id, canonical_name, description FROM graph_entities`);
const entById = new Map(ents.map(e => [Number(e.id), e]));
const aliasMap = new Map();
for (const a of await graphQueryAll(`SELECT entity_id, surface FROM entity_aliases`)) { if (!aliasMap.has(a.entity_id)) aliasMap.set(a.entity_id, []); aliasMap.get(a.entity_id).push(a.surface); }

const splitSentences = (t) => t.replace(/\s+/g, ' ').split(/(?<=[.!?”])\s+(?=[A-Z“"‘'(])/).map(s => s.trim()).filter(Boolean);

const updates = [];
let withDesc = 0;
for (const [eid, paras] of entParas) {
  const e = entById.get(Number(eid)); if (!e) continue;
  // match terms: canonical name + aliases, normalized, drop tiny/generic
  const terms = [e.canonical_name, ...(aliasMap.get(eid) || [])]
    .map(n => normalizeSurface(n)).filter(n => n && n.length >= 4 && !['the','that','this','god'].includes(n));
  if (!terms.length) continue;
  const found = []; const seen = new Set();
  for (const cid of paras) {
    for (const s of splitSentences(gpbText.get(cid))) {
      const sn = normalizeSurface(s);
      if (terms.some(t => sn.includes(t))) { if (!seen.has(s) && s.length > 12) { seen.add(s); found.push(s); } }
    }
    if (found.length >= MAX_SENT) break;
  }
  if (!found.length) continue;
  let body = found.slice(0, MAX_SENT).join(' … ');
  if (body.length > MAX_LEN) body = body.slice(0, MAX_LEN).replace(/\s+\S*$/, '') + '…';
  const prior = (e.description || '').trim();
  const priorNoGpb = prior.startsWith('GPB:') ? '' : prior;   // don't double-prefix on re-runs
  const desc = `GPB: ${body}` + (priorNoGpb ? ` | ${priorNoGpb}` : '');
  updates.push({ id: Number(eid), desc });
  withDesc++;
}

console.log(`GPB-mentioned entities: ${entParas.size}; with extractable verbatim descriptors: ${withDesc}`);
if (!APPLY) {
  console.log('\n=== SAMPLE (first 6) ===');
  for (const u of updates.slice(0, 6)) console.log(`#${u.id} ${entById.get(u.id).canonical_name}:\n   ${u.desc.slice(0, 300)}\n`);
  console.log('DRY-RUN — re-run with --apply');
  process.exit(0);
}
// batch writes
for (let i = 0; i < updates.length; i += 150) {
  const chunk = updates.slice(i, i + 150);
  await transaction(chunk.map(u => ({ sql: `UPDATE graph_entities SET description = ? WHERE id = ?`, args: [u.desc, u.id] })));
}
console.log(`⚙ APPLIED: set GPB-verbatim descriptions on ${updates.length} entities.`);
process.exit(0);
