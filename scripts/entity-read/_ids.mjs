import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
for (const id of [1247563, 1248214, 1249582, 1248174, 1247602]) {
  const ge = (await queryAll('SELECT canonical_name cn FROM graph_entities WHERE id=?', [id]))[0];
  let cids = [];
  try { cids = [...new Set((await graphQueryAll('SELECT content_id FROM entity_mentions WHERE entity_id=?', [id])).map((m) => String(m.content_id)))]; } catch {}
  let inDocs = 0;
  if (cids.length) {
    const rows = await queryAll(`SELECT c.doc_id FROM content c WHERE c.id IN (${cids.slice(0, 600).map(() => '?').join(',')}) AND c.doc_id IN (21310,57347,21308)`, cids.slice(0, 600));
    inDocs = rows.length;
  }
  console.log(`${id} ${ge?.cn}: total mentions=${cids.length}, in GPB/DB=${inDocs}`);
}
process.exit(0);
