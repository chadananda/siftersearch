// Person-catalog review: DeepSeek classifies every live "person" (individual | title_of | group | work | place |
// concept | junk), 25 per call, into entity_catalog_review. Resumable (skips reviewed at CATALOG_VERSION). A title_of
// verdict's figure is resolved to a live entity with the core-name-first recall. Changes NOTHING in the catalog —
// applying verdicts is a separate reviewed step. Options: --limit=N --concurrency=N.
// Output: logs/entity-catalog-review-<ts>.json. POST /api/admin/server/entity-catalog-review.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';
const { queryAll, transaction } = await import('../api/lib/db.js');
const { chatCompletion } = await import('../api/lib/ai.js');
const { LIVE_SQL } = await import('../api/lib/entity-live.js');
const { makeStore } = await import('../api/lib/rag-adapter/store.js');
const { SYSTEM, buildUser, parseReview, CATALOG_VERSION } = await import('../api/lib/catalog-review.js');

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : undefined; };
const LIMIT = Number(arg('limit')) || 100000;
const CC = Number(arg('concurrency')) || 8;
const MODEL = 'deepseek-v4-flash';
const store = makeStore();
const parse = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

const ents = await queryAll(`SELECT ge.id, ge.canonical_name name, ge.importance imp, er.aliases, er.summary
    FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name
    LEFT JOIN entity_catalog_review r ON r.entity_id = ge.id AND r.version >= ?
   WHERE ge.entity_type = 'person' AND ${LIVE_SQL('ge.')} AND r.entity_id IS NULL
   ORDER BY (ge.importance IS NULL), ge.importance DESC, ge.id LIMIT ?`, [CATALOG_VERSION, LIMIT]);
const batches = [];
for (let i = 0; i < ents.length; i += 25) batches.push(ents.slice(i, i + 25));
const report = { started: new Date().toISOString(), version: CATALOG_VERSION, entities: ents.length, batches: batches.length,
  kinds: {}, titleResolved: 0, titleUnresolved: 0, parseFail: 0, errors: 0, tokens: { prompt: 0, completion: 0 }, samples: {} };

async function one(batch) {
  const ids = batch.map((e) => e.id);
  const ph = ids.map(() => '?').join(',');
  const mentions = new Map((await queryAll(`SELECT entity_id id, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id IN (${ph}) GROUP BY entity_id`, ids)).map((r) => [r.id, r.n]));
  const claims = new Map();
  for (const c of await queryAll(`SELECT entity_id id, statement FROM entity_claims WHERE entity_id IN (${ph}) AND (status IS NULL OR status='supported') LIMIT ${ids.length * 6}`, ids)) {
    const a = claims.get(c.id) || []; if (a.length < 2) a.push(c.statement); claims.set(c.id, a);
  }
  const recs = batch.map((e) => ({ name: e.name, aliases: parse(e.aliases), summary: e.summary, claims: claims.get(e.id) || [], mentions: mentions.get(e.id) || 0 }));
  try {
    const r = await chatCompletion([{ role: 'system', content: SYSTEM }, { role: 'user', content: buildUser(recs) }],
      { provider: 'deepseek', model: MODEL, temperature: 0, maxTokens: 120 + 60 * batch.length, responseFormat: { type: 'json_object' }, caller: 'entity-catalog-review' });
    report.tokens.prompt += r.usage?.promptTokens || 0; report.tokens.completion += r.usage?.completionTokens || 0;
    const v = parseReview(r.content, batch.length);
    if (!v) { report.parseFail += batch.length; return; }
    const stmts = [];
    for (let i = 0; i < batch.length; i++) {
      const x = v[i]; if (!x) { report.parseFail++; continue; }
      let sameId = null;
      if (x.kind === 'title_of' && x.same_as) {
        const c = (await store.findCandidateEntities(x.same_as, { type: 'person', limit: 1 }))[0];
        if (c && c.id !== batch[i].id) { sameId = c.id; report.titleResolved++; } else report.titleUnresolved++;
      }
      report.kinds[x.kind] = (report.kinds[x.kind] || 0) + 1;
      const s = (report.samples[x.kind] ||= []); if (s.length < 30) s.push({ id: batch[i].id, name: batch[i].name, same_as: x.same_as, sameId, conf: x.confidence, reason: x.reason });
      stmts.push({ sql: `INSERT OR REPLACE INTO entity_catalog_review (entity_id, kind, same_as, same_as_id, confidence, reason, model, version) VALUES (?,?,?,?,?,?,?,?)`,
        args: [batch[i].id, x.kind, x.same_as, sameId, x.confidence, x.reason, MODEL, CATALOG_VERSION] });
    }
    if (stmts.length) await transaction(stmts, 'entity-catalog-review');
  } catch (err) { report.errors++; if (report.errors <= 5) console.error(`review error: ${err.message}`); }
}
let next = 0, done = 0;
await Promise.all(Array.from({ length: CC }, async () => {
  while (next < batches.length) { await one(batches[next++]); if (++done % 40 === 0) console.log(`progress ${done}/${batches.length} batches · ${JSON.stringify(report.kinds)}`); }
}));
report.finished = new Date().toISOString();
mkdirSync('logs', { recursive: true });
const file = `logs/entity-catalog-review-${report.started.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(report, null, 1));
const { samples, ...summary } = report;
console.log(`REPORT ${file}`);
console.log(JSON.stringify(summary));
process.exit(0);
