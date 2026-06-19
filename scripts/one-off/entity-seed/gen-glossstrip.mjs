// Generate a collision-guarded gloss-strip rename plan for DB-created PLACES and WORKS whose canonical
// ends in a PURE descriptor/author appositive — never touches persons (their glosses are often needed
// namesake disambiguators) and never strips a deliberate original-title gloss on a work. Emits
// {entity_type, from, to} for clean-canonical.mjs (which collision-guards). Run from project root.
import { writeFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {queryAll} = await import('../../../api/lib/db.js');
// place descriptors + work author-appositives that are safe to drop
const PLACE_GLOSS = /\((village|town|city|district|province|region|suburb of [^)]+|near [^)]+|quarter|the [^)]+ quarter|fortress|mosque|summer-house|orchard|[A-ZÁ-Ú][\wÀ-ÿ’'-]*)\)\s*$/;
const WORK_GLOSS  = /\(\s*(by |trans\.|translated by )[^)]*\)\s*$/i;
const rows = await queryAll("SELECT canonical_name, entity_type FROM entity_research WHERE entity_type IN ('place','work') AND canonical_name LIKE '%(%' AND sources LIKE 'Dawn-Breakers%'");
const plan = [];
for (const r of rows) {
  const m = r.canonical_name.match(/^(.*?)\s*\([^)]*\)\s*$/);
  if (!m) continue;
  const base = m[1].trim();
  if (base.length < 3) continue;
  const gloss = r.canonical_name.slice(m[1].length);
  const ok = r.entity_type === 'place' ? PLACE_GLOSS.test(gloss) : WORK_GLOSS.test(gloss);
  if (ok) plan.push({ entity_type: r.entity_type, from: r.canonical_name, to: base });
}
writeFileSync('tmp/entity-research/glossstrip.json', JSON.stringify(plan));
console.log(`gloss-strip candidates: ${plan.length} (place+work)`);
process.exit(0);
