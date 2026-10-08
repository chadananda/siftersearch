#!/usr/bin/env node
// Daily strategy-audit digest (PM2 siftersearch-audit-digest, cron 07:00; runs ON tower). The last 24 h of verdicts from
// /tank/sifter/audit/audits.db → one email to Chad: how many exchanges, spend, strategy right/wrong (wanted → chosen),
// evidence answered, format fit, every mistake grouped by WHERE it lies (reply · library data · source text · reader's
// premise — the library ones are a work list), suggested new strategies, data gaps. Plain text + simple HTML.
//   node scripts/audit/audit-digest.mjs [--hours=24] [--dry]   (--dry prints instead of sending)
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// PM2 does not pass the env files to every app: load them here (as the other tower scripts do)
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(join(dirname(fileURLToPath(import.meta.url)), '..', '..'), f), quiet: true });
const HOURS = Number((process.argv.find((a) => a.startsWith('--hours=')) || '--hours=24').split('=')[1]);
const DRY = process.argv.includes('--dry');
const STORE = process.env.AUDIT_DB || '/tank/sifter/audit/audits.db';
const TO = process.env.AUDIT_DIGEST_EMAIL || process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL;
if (!existsSync(STORE)) { console.log('no audits yet'); process.exit(0); }

const db = new Database(STORE, { readonly: true });
const rows = db.prepare(`SELECT * FROM audits WHERE audited_at >= datetime('now', ?)`).all(`-${HOURS} hours`);
const done = rows.filter((r) => r.status === 'done').map((r) => ({ ...r, v: JSON.parse(r.verdict_json) }));
const errors = rows.length - done.length;
const usd = rows.reduce((s, r) => s + (r.usd || 0), 0);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); if (k != null) m[k] = (m[k] || 0) + 1; return m; }, {});
const top = (m, n = 8) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

const strat = count(done, (r) => r.v.strategy_verdict);
const misroutes = count(done.filter((r) => r.v.strategy_verdict === 'wrong' || r.v.best_strategy !== r.v.strategy_used), (r) => `${r.v.strategy_used} → ${r.v.best_strategy}`);
const answered = count(done, (r) => r.v.evidence?.answered);
const causes = count(done.filter((r) => r.v.evidence?.answered !== 'fully' && r.v.evidence?.cause !== 'none'), (r) => r.v.evidence?.cause);
const formatWrong = done.filter((r) => r.v.format_verdict?.fit === 'wrong').length;
const problems = done.flatMap((r) => (r.v.problems || []).map((p) => ({ ...p, session: r.session_id, round: r.round })));
const byWhere = {}; for (const p of problems) (byWhere[p.where] ||= []).push(p);
const newStrats = done.filter((r) => r.v.new_strategy?.suggested).map((r) => ({ need: r.v.new_strategy.need, route: r.v.new_strategy.route, session: r.session_id }));
const gaps = done.filter((r) => r.v.data_gap?.found).map((r) => r.v.data_gap.detail);
const feedback = done.filter((r) => r.v.reader_feedback?.present).map((r) => ({ ...r.v.reader_feedback, channel: r.channel, session: r.session_id }));

const WHERE = { 'library-data': 'In our library data (work list)', 'source-text': 'In published sources', 'reader-premise': "In readers' premises", reply: "In Anís's replies" };
const lines = [
  `Anís strategy audit — last ${HOURS} h`,
  `${done.length} exchanges audited${errors ? `, ${errors} errors` : ''} · $${usd.toFixed(2)} spent`,
  'Passages the auditor names as "missed" come from its own knowledge: leads to check, not facts.',
  '',
  ...(feedback.length ? [`Reader feedback (${feedback.length}) — the strongest signal:`, ...feedback.map((f) => `  • [${f.justified || '?'} · ${f.about || '?'} · ${f.channel || '?'}] ${f.summary || ''}${f.fix && f.fix !== 'none' ? `\n      fix: ${f.fix}` : ''}`), ''] : []),
  `Strategy: right ${strat.right || 0} · acceptable ${strat.acceptable || 0} · wrong ${strat.wrong || 0}`,
  ...(Object.keys(misroutes).length ? ['Better strategy existed (used → best):', ...top(misroutes).map(([k, n]) => `  ${k}  ×${n}`)] : []),
  `Evidence answered: fully ${pct(answered.fully || 0, done.length)} · partly ${pct(answered.partly || 0, done.length)} · no ${pct(answered.no || 0, done.length)}`,
  ...(Object.keys(causes).length ? [`  why not fully: ${top(causes).map(([k, n]) => `${k} ×${n}`).join(' · ')}`] : []),
  `Format wrong: ${formatWrong}`,
  '',
  `Mistakes found: ${problems.length}`,
  ...Object.entries(WHERE).flatMap(([k, label]) => (byWhere[k]?.length ? [`${label} (${byWhere[k].length}):`, ...byWhere[k].slice(0, 15).map((p) => `  • [${p.kind}] ${p.detail}`)] : [])),
  '',
  ...(newStrats.length ? [`Suggested new strategies (${newStrats.length}):`, ...newStrats.slice(0, 10).map((s) => `  • ${s.need}${s.route ? ` — ${s.route}` : ''}`)] : ['Suggested new strategies: none']),
  ...(gaps.length ? ['', `Library gaps (${gaps.length}):`, ...gaps.slice(0, 15).map((g) => `  • ${g}`)] : []),
];
const text = lines.join('\n');
const html = `<pre style="font:14px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`;

if (DRY || !TO) { console.log(text); if (!TO) console.log('\n(no recipient configured)'); process.exit(0); }
if (!done.length && !errors) { console.log('nothing audited in the window — no email'); process.exit(0); }
const { sendEmail } = await import('../../api/services/email.js');
await sendEmail({ to: TO, subject: `Anís audit: ${done.length} exchanges · ${feedback.length ? `${feedback.length} feedback · ` : ''}${strat.wrong || 0} misroutes · ${problems.length} mistakes`, text, html });
console.log(`sent to ${TO}`);
process.exit(0);
