// Build profile cards (api/lib/profile-card.js) into entity_cards. --ids=1,2 or --min-mentions=N (every live person
// with at least N mentions). DRY unless --write. Triggered by POST /api/admin/server/entity-cards.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const val = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const WRITE = args.includes('--write');
const db = await import('../api/lib/db.js');
const { cardFor, CARD_VERSION } = await import('../api/lib/profile-card.js');
const { LIVE_SQL } = await import('../api/lib/entity-live.js');

let ids = (val('ids') || '').split(',').map(Number).filter(Boolean);
if (!ids.length) {
  const min = Number(val('min-mentions') || 1);
  ids = (await db.queryAll(`SELECT m.entity_id id FROM entity_mentions_v2 m JOIN graph_entities ge ON ge.id = m.entity_id
      WHERE ge.entity_type = 'person' AND ${LIVE_SQL('ge.')} GROUP BY m.entity_id HAVING COUNT(*) >= ? ORDER BY COUNT(*) DESC`, [min])).map((r) => r.id);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('logs', { recursive: true });
let built = 0, batch = [];
const samples = [];
const flush = async () => { if (WRITE && batch.length) await db.transaction(batch); batch = []; };
for (const id of ids) {
  const c = await cardFor(id, db);
  if (!c) continue;
  built++;
  if (samples.length < 20) samples.push({ id, card: c.card });
  batch.push({ sql: `INSERT INTO entity_cards (entity_id, card, facts, version, built_at) VALUES (?,?,?,?,unixepoch())
      ON CONFLICT(entity_id) DO UPDATE SET card = excluded.card, facts = excluded.facts, version = excluded.version, built_at = excluded.built_at`,
    args: [id, c.card, JSON.stringify(c.facts), CARD_VERSION] });
  if (batch.length >= 200) await flush();
  if (built % 1000 === 0) console.log(`progress ${built}/${ids.length}`);
}
await flush();
const out = { mode: WRITE ? 'write' : 'dry', requested: ids.length, built, samples };
writeFileSync(`logs/entity-cards-${out.mode}-${stamp}.json`, JSON.stringify(out, null, 1));
console.log(`REPORT logs/entity-cards-${out.mode}-${stamp}.json`, JSON.stringify({ requested: ids.length, built }));
process.exit(0);
