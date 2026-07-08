// READ-ONLY: map the entity layer across BOTH databases so we can decide the single home for aliases.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const c = async (fn, sql) => { try { return (await fn(sql))[0].n; } catch (e) { return 'ERR: ' + String(e.message).slice(0, 40); } };

console.log('=== sifter.db (content) ===');
for (const t of ['graph_entities', 'entity_research', 'entity_aliases', 'entity_mentions']) {
  console.log(`  ${t.padEnd(18)} ${await c(queryAll, `SELECT COUNT(*) n FROM ${t}`)}`);
}
console.log('  entity_research w/ non-empty aliases JSON:',
  await c(queryAll, `SELECT COUNT(*) n FROM entity_research WHERE aliases IS NOT NULL AND aliases NOT IN ('','[]')`));
console.log('  total alias strings inside er.aliases JSON:',
  await c(queryAll, `SELECT COALESCE(SUM(json_array_length(aliases)),0) n FROM entity_research WHERE json_valid(aliases)`));

console.log('\n=== graph.db (graph) ===');
for (const t of ['graph_entities', 'entity_aliases', 'entity_mentions']) {
  console.log(`  ${t.padEnd(18)} ${await c(graphQueryAll, `SELECT COUNT(*) n FROM ${t}`)}`);
}

console.log('\n=== does graph.db entity_aliases cover the entity-read cast? (sample id 1247617) ===');
try { const r = await graphQueryAll(`SELECT surface, surface_norm, source, confidence FROM entity_aliases WHERE entity_id=1247617`);
  console.log(`  rows for 1247617 in graph.db: ${r.length}`); for (const x of r.slice(0, 8)) console.log('   ', JSON.stringify(x));
} catch (e) { console.log('  ERR', e.message); }
console.log('\n  graph.db entity_aliases entity_id range:',
  await c(graphQueryAll, `SELECT (SELECT MIN(entity_id) FROM entity_aliases)||'..'||(SELECT MAX(entity_id) FROM entity_aliases) n`));
process.exit(0);
