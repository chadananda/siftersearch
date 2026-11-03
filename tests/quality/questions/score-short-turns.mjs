// Scores short-turns.jsonl: for each elliptical message, with its history and reader card, does Jev (triageMessage) give
// the labelled OUTCOME (search / ask_back / none) and follow-up, and does the resolver (Haiku) write a query naming the
// subject? Live: Jev ≈ $0.0001/case, Haiku ≈ $0.001/case → the whole battery ≈ $0.07. Never touches production data.
//   node tests/quality/questions/score-short-turns.mjs [--lib /path/to/checkout] [--no-resolve] [--json out.json] [--only id,id]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(arg('--lib', path.join(HERE, '../../..')));
const CASES = path.join(HERE, 'short-turns.jsonl');
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;

const { triageMessage } = await import(path.join(LIB, 'api/lib/assistant/triage.js'));   // also loads .env (dotenvx)
const { resolveQuery } = await import(path.join(LIB, 'api/lib/assistant/short-turn.js'));
if (!process.env.TYPESAFE_API_KEY) { console.error('TYPESAFE_API_KEY missing'); process.exit(2); }

const cases = fs.readFileSync(CASES, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((c) => !ONLY || ONLY.has(c.id));
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’'`ʼ]/g, "'");
const hasTerm = (q, terms) => terms.some((t) => fold(q).includes(fold(t)) || String(q).includes(t));

const one = async (c) => {
  const messages = [...(c.history || []), { role: 'user', content: c.text }];
  const tri = await triageMessage(messages, { card: c.card, timeoutMs: 8000 }).catch((e) => ({ error: e.message }));
  const outcome = tri?.outcome?.choice ?? null;
  const row = { id: c.id, text: c.text, expect: c.expect, outcome, outcomeC: tri?.outcome?.confidence ?? null, kind: tri?.kind?.choice ?? null,
    follow_up: tri?.follow_up ?? null, ok: outcome === c.expect.outcome, error: tri?.error };
  if (c.expect.follow_up != null && tri?.follow_up != null) row.follow_ok = (tri.follow_up >= 0.5) === c.expect.follow_up;
  if (c.expect.query_terms && !flag('--no-resolve') && c.expect.outcome === 'search') {
    const r = await resolveQuery({ messages, card: c.card }).catch(() => null);
    row.query = r?.query ?? null;
    row.query_ok = !!row.query && hasTerm(row.query, c.expect.query_terms);
  }
  return row;
};
const rows = [];
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (next < cases.length) rows.push(await one(cases[next++])); }));

const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}% (${n}/${d})` : 'n/a';
const by = (k) => rows.filter((r) => r.expect.outcome === k);
const summary = {
  n: rows.length,
  outcome: pct(rows.filter((r) => r.ok).length, rows.length),
  outcome_by_label: Object.fromEntries(['search', 'ask_back', 'none'].map((k) => [k, pct(by(k).filter((r) => r.ok).length, by(k).length)])),
  follow_up: pct(rows.filter((r) => r.follow_ok === true).length, rows.filter((r) => r.follow_ok != null).length),
  resolved_query_names_subject: pct(rows.filter((r) => r.query_ok === true).length, rows.filter((r) => r.query_ok != null).length),
  errors: rows.filter((r) => r.error).length,
};
console.log(JSON.stringify(summary, null, 2));
for (const r of rows.filter((r) => !r.ok || r.follow_ok === false || r.query_ok === false).sort((a, b) => a.id.localeCompare(b.id)))
  console.log(`  ${r.ok ? '  ' : 'XX'} ${r.id.padEnd(22)} ${JSON.stringify(r.text).slice(0, 40).padEnd(42)} want ${r.expect.outcome.padEnd(8)} got ${String(r.outcome).padEnd(8)} (${r.outcomeC ?? '-'}) kind=${r.kind} fu=${r.follow_up ?? '-'}${r.follow_ok === false ? ' FU!' : ''}${r.query_ok === false ? ` Q!="${r.query}"` : ''}${r.error ? ` err=${r.error}` : ''}`);
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ summary, rows }, null, 1));
