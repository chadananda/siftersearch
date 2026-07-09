// Coverage of the per-paragraph disambiguation field (content.context) for the entity-seed books.
//   node scripts/entity-read/context-coverage.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
for (const [doc, name] of [[21310, 'GPB'], [21308, 'Dawn-Breakers']]) {
  const r = (await queryAll(`SELECT COUNT(*) total, COUNT(context) have_ctx, COUNT(DISTINCT context_model) models FROM content WHERE doc_id=? AND deleted_at IS NULL`, [doc]))[0];
  const models = (await queryAll(`SELECT context_model m, COUNT(*) n FROM content WHERE doc_id=? AND deleted_at IS NULL AND context IS NOT NULL GROUP BY context_model`, [doc]));
  console.log(`${name} (${doc}): ${r.have_ctx}/${r.total} paragraphs have context  ${models.length ? '· by model: ' + models.map((x) => `${x.m || 'null'}=${x.n}`).join(', ') : ''}`);
}
process.exit(0);
