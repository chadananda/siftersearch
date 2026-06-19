// One-off: add enrichment columns to entity_research + graph_entities (idempotent).
//   summary           — 1–2 sentence "who + role in Bahá'í history"
//   importance        — 1–100 (rubric-anchored AI judgment of how helpful knowing this name is)
//   importance_reason — one-line justification for the score
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query} = await import('../../../api/lib/db.js');
const cols = [
  ['entity_research','summary','TEXT'],
  ['entity_research','importance','INTEGER'],
  ['entity_research','importance_reason','TEXT'],
  ['graph_entities','summary','TEXT'],
  ['graph_entities','importance','INTEGER'],
];
for (const [t,c,ty] of cols) {
  try { await query(`ALTER TABLE ${t} ADD COLUMN ${c} ${ty}`); console.log(`added ${t}.${c}`); }
  catch (e) { console.log(`skip ${t}.${c} (${(e.message||'').split('\n')[0]})`); }
}
process.exit(0);
