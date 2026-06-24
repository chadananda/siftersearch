// Apply enrich-drafts.json: write summary/side/importance/importance_reason + union aliases to entity_research
// and mirror summary/importance to graph_entities. Reversible (backup first). Writes via SIFTER_WRITER_URL
// (:7849). DRY=1 previews. Skips drafts with errors or empty summary.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
const { query, queryOne } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const drafts = JSON.parse(readFileSync('tmp/entity-research/seqread/enrich-drafts.json', 'utf8')).filter(d => !d.error && (d.summary || '').trim());
const SIDES = new Set(['Bábí', 'Bahá’í', "Bahá'í", 'opponent', 'other']);
let n = 0;
for (const d of drafts) {
  const cn = (await queryOne('SELECT canonical_name FROM graph_entities WHERE id=?', [d.id]))?.canonical_name;
  if (!cn) { console.log(`  skip ${d.id} (gone)`); continue; }
  const er = await queryOne("SELECT aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [cn]);
  const aliases = new Set(); try { for (const a of JSON.parse(er?.aliases || '[]')) aliases.add(a); } catch {}
  for (const a of (d.aliases || [])) if (a && a !== cn) aliases.add(a);
  const side = SIDES.has(d.side) ? d.side : null;
  const imp = Number.isFinite(d.importance) ? Math.max(1, Math.min(100, Math.round(d.importance))) : null;
  console.log(`  ${DRY ? 'would set' : 'SET'} ${d.id} "${cn}" imp=${imp ?? '-'} side=${side ?? '-'}${d.notable ? ' [NOTABLE]' : ''}`);
  if (DRY) { n++; continue; }
  await query(`UPDATE entity_research SET summary=?, importance=COALESCE(?,importance), importance_reason=?, side=COALESCE(?,side), aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'`,
    [d.summary.trim(), imp, (d.importance_reason || '').slice(0, 200), side, JSON.stringify([...aliases]), cn]);
  await query('UPDATE graph_entities SET summary=?, importance=COALESCE(?,importance) WHERE id=?', [d.summary.trim(), imp, d.id]);
  n++;
}
console.log(`\n${DRY ? '[DRY] would write' : 'WROTE'} ${n} enrichments`);
process.exit(0);
