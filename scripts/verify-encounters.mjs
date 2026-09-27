// Verify MEETING claims (met/visited/accompanied/hosted/…) against their full source paragraph, one DeepSeek call per
// paragraph (all its claims together), storing verdicts in claim_verifications. Resumable: claims already verified
// at VERIFY_VERSION are skipped. Options: --limit=N (claims this run) --typed (only claims with a resolved target —
// the first tranche) --concurrency=N. Output: logs/verify-encounters-<ts>.json. POST /api/admin/server/verify-encounters.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';
const { queryAll, transaction } = await import('../api/lib/db.js');
const { chatCompletion } = await import('../api/lib/ai.js');
const { SYSTEM, buildUser, parseVerdicts, VERIFY_VERSION } = await import('../api/lib/verify-encounters.js');

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : undefined; };
const LIMIT = Number(arg('limit')) || 1000;
const TYPED = process.argv.includes('--typed');
const CC = Number(arg('concurrency')) || 8;
const MODEL = 'deepseek-v4-flash';
const MEETING = ['met', 'visited', 'accompanied', 'hosted', 'host-of', 'interviewed-by', 'companion-of'];

const claims = await queryAll(`SELECT ec.id, ec.statement, ec.doc_id, ec.para_id, ec.relation, s.canonical_name subject, t.canonical_name target
    FROM entity_claims ec
    JOIN graph_entities s ON s.id = ec.entity_id
    LEFT JOIN graph_entities t ON t.id = ec.target_entity_id AND ec.target_entity_id <> ec.entity_id
    LEFT JOIN claim_verifications cv ON cv.claim_id = ec.id AND cv.version >= ?
   WHERE cv.claim_id IS NULL AND ec.relation IN (${MEETING.map(() => '?').join(',')})
     AND (ec.status IS NULL OR ec.status = 'supported') AND ec.doc_id IS NOT NULL AND ec.para_id IS NOT NULL
     -- group facts (config/group-facts.json) are verified by construction: a verbatim proof from the core histories
     -- that speaks of the GROUP ("these, and a few others"), which a per-person reading would call not_stated.
     AND (ec.import_batch IS NULL OR ec.import_batch NOT LIKE 'group-fact:%')
     ${TYPED ? 'AND t.id IS NOT NULL' : ''}
   ORDER BY (t.id IS NULL), ec.id LIMIT ?`, [VERIFY_VERSION, ...MEETING, LIMIT]);

// Group by paragraph: one model call reads a paragraph once for all of its claims.
const groups = new Map();
for (const c of claims) { const k = `${c.doc_id}|${c.para_id}`; (groups.get(k) || groups.set(k, []).get(k)).push(c); }
const objectOf = (c) => c.target || String(c.statement).split(' — ').slice(1).join(' ').replace(/^[a-z-]+ /i, '').trim();

const report = { started: new Date().toISOString(), version: VERIFY_VERSION, model: MODEL, claims: claims.length, paragraphs: groups.size,
  verdicts: {}, noParagraph: 0, parseFail: 0, errors: 0, tokens: { prompt: 0, completion: 0, cached: 0 }, samples: {} };
let done = 0;
const work = [...groups.entries()];
async function one([key, cs]) {
  const [docId, pid] = key.split('|');
  const para = (/^p\d+$/.test(pid)
    ? await queryAll(`SELECT c.text, d.title FROM content c JOIN docs d ON d.id=c.doc_id WHERE c.id=?`, [Number(pid.slice(1))])
    : await queryAll(`SELECT c.text, d.title FROM content c JOIN docs d ON d.id=c.doc_id WHERE c.doc_id=? AND c.external_para_id=? LIMIT 1`, [Number(docId), pid]))[0];
  if (!para?.text) { report.noParagraph += cs.length; return; }
  const rows = cs.map((c) => ({ subject: c.subject, object: objectOf(c), statement: c.statement }));
  try {
    const r = await chatCompletion([{ role: 'system', content: SYSTEM }, { role: 'user', content: buildUser(para, rows) }],
      { provider: 'deepseek', model: MODEL, temperature: 0, maxTokens: 150 + 90 * cs.length, responseFormat: { type: 'json_object' }, caller: 'verify-encounters' });
    report.tokens.prompt += r.usage?.promptTokens || 0; report.tokens.completion += r.usage?.completionTokens || 0; report.tokens.cached += r.usage?.cachedTokens || 0;
    const v = parseVerdicts(r.content, cs.length);
    if (!v) { report.parseFail += cs.length; return; }
    const stmts = [];
    v.forEach((x, i) => {
      if (!x) { report.parseFail++; return; }
      report.verdicts[x.verdict] = (report.verdicts[x.verdict] || 0) + 1;
      const s = (report.samples[x.verdict] ||= []); if (s.length < 12) s.push({ claim: cs[i].statement, source: para.title, quote: x.quote, reason: x.reason });
      stmts.push({ sql: `INSERT OR REPLACE INTO claim_verifications (claim_id, verdict, quote, reason, model, version) VALUES (?,?,?,?,?,?)`,
        args: [cs[i].id, x.verdict, x.quote, x.reason, MODEL, VERIFY_VERSION] });
    });
    if (stmts.length) await transaction(stmts, 'verify-encounters');
  } catch (err) { report.errors++; if (report.errors <= 5) console.error(`verify error ${key}: ${err.message}`); }
}
let next = 0;
await Promise.all(Array.from({ length: CC }, async () => {
  while (next < work.length) {
    const g = work[next++];
    await one(g);
    if (++done % 100 === 0) console.log(`progress ${done}/${work.length} paragraphs · ${JSON.stringify(report.verdicts)}`);
  }
}));
report.finished = new Date().toISOString();
mkdirSync('logs', { recursive: true });
const file = `logs/verify-encounters-${report.started.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(report, null, 1));
const { samples, ...summary } = report;
console.log(`REPORT ${file}`);
console.log(JSON.stringify(summary));
process.exit(0);
