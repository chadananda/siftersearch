// Dump a cast batch (people in an importance range, not yet cross-corpus-researched) as JSON for Phase-B workers.
// Run: MIN=35 MAX=57 LIMIT=80 node scripts/entity-read/dump-cast.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const MIN = Number(process.env.MIN || 0), MAX = Number(process.env.MAX || 999), LIMIT = Number(process.env.LIMIT || 80);
const rows = await queryAll(`SELECT ge.id, ge.canonical_name cn, er.aliases, er.research_notes rn FROM graph_entities ge
  JOIN entity_research er ON er.canonical_name=ge.canonical_name
  WHERE ge.entity_type='person' AND ge.religion='' AND ge.importance BETWEEN ? AND ? ORDER BY ge.importance DESC`, [MIN, MAX]);
const out = [];
for (const p of rows) {
  let researched = false; try { researched = JSON.parse(p.rn || '{}').research_status === 'cross-corpus-researched'; } catch {}
  if (researched) continue;
  let a = []; try { a = JSON.parse(p.aliases || '[]'); } catch {}
  out.push({ id: p.id, name: p.cn, aliases: a.slice(0, 5) });
  if (out.length >= LIMIT) break;
}
process.stdout.write(JSON.stringify(out));
process.exit(0);
