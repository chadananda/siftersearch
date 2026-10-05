#!/usr/bin/env node
// Jev vs Clef / Clef-flash on OUR logged System-1 calls (Chad 10-05: "test Jev & Clef for every job"). Replays a sample of
// each task's logged calls through the edge route (POST /_s1/run, Workers AI binding) and records every answer in the
// shadow table (call_id, backend) — so live shadows and replays land in one place. Per task: agreement with Jev per
// question (choice: same choice; noul: same side of 0.5; score: within 0.15), mean |Δp| on Jev's choice, latency, errors.
// Agreement is NOT accuracy: where gold exists (calls.gold) accuracy is reported too; disagreements are dumped for review.
// Runs ON tower.   node scripts/systemone/compare-clef.mjs [--per-task 300] [--tasks a,b] [--concurrency 6] [--report file.json]
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env-secrets'), quiet: true });
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PER = +arg('per-task', 300), CONC = +arg('concurrency', 6), MODELS = ['clef-flash', 'clef'];
const EDGE = `${process.env.CLEF_URL || 'https://siftersearch.com'}/_s1/run`, KEY = process.env.SYSTEMONE_EDGE_KEY || process.env.INTERNAL_API_KEY;
const db = new Database(join(process.env.SYSTEMONE_DIR || '/tank/sifter/systemone', 'calls.db'));
db.pragma('busy_timeout = 30000');
db.exec(`CREATE TABLE IF NOT EXISTS shadow (call_id INTEGER NOT NULL, backend TEXT NOT NULL, at INTEGER NOT NULL,
  answers TEXT, ms INTEGER, error TEXT, PRIMARY KEY (call_id, backend))`);
const tasks = (arg('tasks', '') || '').split(',').filter(Boolean);
const taskList = tasks.length ? tasks : db.prepare('SELECT DISTINCT task FROM calls WHERE jev IS NOT NULL').all().map((r) => r.task);
const put = db.prepare('INSERT OR REPLACE INTO shadow (call_id, backend, at, answers, ms, error) VALUES (?, ?, ?, ?, ?, ?)');
const have = db.prepare('SELECT answers, ms, error FROM shadow WHERE call_id = ? AND backend = ?');

async function run(model, row) {
  const cached = have.get(row.id, model);
  if (cached && (cached.answers || cached.error)) return { answers: cached.answers && JSON.parse(cached.answers), ms: cached.ms, error: cached.error };
  const t0 = Date.now();
  try {
    const r = await fetch(EDGE, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', 'X-Internal-Key': KEY },
      body: JSON.stringify({ model, state: row.state, questions: JSON.parse(row.questions) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.answers) throw new Error(`${r.status} ${j.error || ''}`.slice(0, 200));
    put.run(row.id, model, Date.now(), JSON.stringify(j.answers), j.ms ?? Date.now() - t0, null);
    return { answers: j.answers, ms: j.ms ?? Date.now() - t0 };
  } catch (e) { put.run(row.id, model, Date.now(), null, null, e.message); return { error: e.message }; }
}

// one question's agreement with Jev: same decision, and the probability gap on Jev's pick
function agree(q, jevA, other) {
  if (!jevA || !other) return null;
  if (q.type === 'choice' || jevA.choice !== undefined) {
    const p = (a, c) => a?.probabilities?.[c] ?? a?.distribution?.[c] ?? (a?.choice === c ? a.confidence ?? 1 : 0);
    return { same: jevA.choice === other.choice, dp: Math.abs(p(jevA, jevA.choice) - p(other, jevA.choice)) };
  }
  if (q.type === 'noul' || jevA.noul !== undefined) return { same: (jevA.noul >= 0.5) === (other.noul >= 0.5), dp: Math.abs(jevA.noul - other.noul) };
  if (q.type === 'score' || jevA.score !== undefined) return { same: Math.abs(jevA.score - other.score) <= 0.15, dp: Math.abs(jevA.score - other.score) };
  return null;
}
const pctl = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };

const report = {};
for (const task of taskList) {
  // spread over the log (not just the newest) — a fixed stride over ids
  const ids = db.prepare('SELECT id FROM calls WHERE task = ? AND jev IS NOT NULL ORDER BY id').all(task).map((r) => r.id);
  const step = Math.max(1, Math.floor(ids.length / PER));
  const pick = ids.filter((_, i) => i % step === 0).slice(0, PER);
  const rows = pick.map((id) => db.prepare('SELECT id, state, questions, jev, jev_ms, gold FROM calls WHERE id = ?').get(id));
  const res = { n: rows.length, jev_p50_ms: pctl(rows.map((r) => r.jev_ms).filter(Boolean), 0.5) };
  const disagreements = [];
  for (const m of MODELS) {
    const out = [];
    for (let i = 0; i < rows.length; i += CONC) out.push(...await Promise.all(rows.slice(i, i + CONC).map((r) => run(m, r).then((x) => ({ r, x })))));
    let qs = 0, same = 0, dp = 0, gq = 0, gj = 0, gm = 0;
    for (const { r, x } of out) {
      if (!x.answers) continue;
      const jev = JSON.parse(r.jev), questions = JSON.parse(r.questions), gold = r.gold ? JSON.parse(r.gold) : null;
      for (const [k, q] of Object.entries(questions)) {
        const a = agree(q, jev[k], x.answers[k]); if (!a) continue;
        qs++; same += a.same ? 1 : 0; dp += a.dp;
        if (!a.same && disagreements.length < 40) disagreements.push({ call_id: r.id, model: m, question: k, jev: jev[k]?.choice ?? jev[k]?.noul ?? jev[k]?.score,
          other: x.answers[k]?.choice ?? x.answers[k]?.noul ?? x.answers[k]?.score, state: String(r.state).slice(0, 400) });
        if (gold && gold[k] !== undefined) { gq++; gj += jev[k]?.choice === gold[k] ? 1 : 0; gm += x.answers[k]?.choice === gold[k] ? 1 : 0; }
      }
    }
    const ok = out.filter((o) => o.x.answers);
    res[m] = { answered: ok.length, errors: out.length - ok.length, agreement: qs ? +(same / qs).toFixed(3) : null, mean_dp: qs ? +(dp / qs).toFixed(3) : null,
      p50_ms: pctl(ok.map((o) => o.x.ms), 0.5), p95_ms: pctl(ok.map((o) => o.x.ms), 0.95),
      ...(gq ? { gold_n: gq, gold_acc: +(gm / gq).toFixed(3), jev_gold_acc: +(gj / gq).toFixed(3) } : {}) };
  }
  res.disagreements = disagreements;
  report[task] = res;
  const { disagreements: _, ...brief } = res;
  console.log(task.padEnd(26), JSON.stringify(brief));
}
if (arg('report')) writeFileSync(arg('report'), JSON.stringify({ at: new Date().toISOString(), per_task: PER, report }, null, 1));
process.exit(0);
