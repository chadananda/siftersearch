#!/usr/bin/env node
// UPS ledger CLI (api/lib/ops/ups-ledger.js). `append <step> [ok|fail] [detail|json]` — called by ups-power.sh / deploy/nut at each
// power step (adds battery % + runtime from upsc; at poweroff also the writer's /power). `confirm [--dry]` — run by
// system-checks --check and after resume: once the event is over, probe health (healthz + ops API + zpool, never the DB) and
// send ONE report ([UPS] … ✓, or an [ACTION] "UPS plan failed at <step>"). Bounded: a power step never waits on this.
import { spawnSync } from 'node:child_process';
import { uptime } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendStep, buildUpsReport, confirmPlan, readLedger } from '../../api/lib/ops/ups-ledger.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UPS = process.env.SIFTER_UPS || 'tower@localhost';
const UPSC = process.env.SIFTER_UPSC || 'upsc';
const WRITER = process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849';
const GATEWAY = process.env.SIFTER_GATEWAY_URL || 'http://127.0.0.1:7839';
const sh = (cmd, args, timeout = 5000) => { try { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout }); return r.status === 0 ? r.stdout.trim() : null; } catch { return null; } };
const getJson = async (url, { timeout = 3000, headers = {} } = {}) => {
  try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) }); return { status: r.status, body: await r.json().catch(() => null) }; } catch (e) { return { status: 0, error: e.message }; }
};

function battery() {
  const v = (k) => { const x = sh(UPSC, [UPS, k], 3000); return x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : x; };
  const b = { charge: v('battery.charge'), runtime: v('battery.runtime'), status: v('ups.status') };
  return b.charge == null && b.runtime == null && b.status == null ? null : b;
}

/** Post-event health: gateway + writer healthz, power flag gone, services beating, ZFS pools, the previous boot's ending. */
export async function probeHealth({ shutdown }) {
  const checks = [];
  const gw = await getJson(`${GATEWAY}/health`, { timeout: 8000 });
  checks.push({ name: 'API gateway', ok: gw.status === 200, detail: gw.status === 200 ? (gw.body?.version || 'ok') : `status ${gw.status} ${gw.error || ''}`.trim() });
  const wr = await getJson(`${WRITER}/health`, { timeout: 8000 });
  checks.push({ name: 'Writer (DB answers)', ok: wr.status === 200 && !wr.body?.power, detail: wr.status === 200 ? (wr.body?.power ? `still in ${wr.body.power} mode` : 'ok') : `status ${wr.status} ${wr.error || ''}`.trim() });
  const pw = await getJson(`${WRITER}/power`, { timeout: 5000 });
  checks.push({ name: 'Writes accepted', ok: pw.status === 200 && pw.body?.mode === 'normal', detail: pw.status === 200 ? `mode ${pw.body?.mode}` : `status ${pw.status}` });
  const key = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;
  const sv = await getJson(`${GATEWAY}/api/admin/ops/services`, { timeout: 15000, headers: key ? { 'X-Internal-Key': key } : {} });
  const services = sv.body?.services;
  if (!Array.isArray(services)) checks.push({ name: 'Services beating', ok: null, detail: `unavailable (status ${sv.status})` });
  else {
    const silent = services.filter((x) => x.health === 'silent' || Number(x.age_s) > 300);
    checks.push({ name: 'Services beating', ok: !silent.length, detail: silent.length ? `silent: ${silent.map((x) => x.name).join(', ')}` : `${services.length} services` });
  }
  const zp = sh('zpool', ['status', '-x'], 15000) ?? sh('sudo', ['-n', 'zpool', 'status', '-x'], 15000);
  checks.push({ name: 'ZFS pools', ok: zp == null ? null : /all pools are healthy/i.test(zp), detail: zp == null ? 'zpool status unavailable' : zp.split('\n')[0].slice(0, 160) });
  let prevBootClean = null;
  if (shutdown) {
    const j = sh('journalctl', ['-b', '-1', '-o', 'cat', '--no-pager', '-n', '600'], 20000) ?? sh('sudo', ['-n', 'journalctl', '-b', '-1', '-o', 'cat', '--no-pager', '-n', '600'], 20000);
    if (j != null) {
      prevBootClean = /Reached target .*Power[- ]?Off|System Power Off|reboot: Power down/i.test(j);
      checks.push({ name: 'Previous boot ended in a clean power-off', ok: prevBootClean, detail: /sifter-ups-shutdown/.test(j) ? 'sifter-ups-shutdown ran' : 'sifter-ups-shutdown not seen in the journal' });
    } else checks.push({ name: 'Previous boot ended in a clean power-off', ok: null, detail: 'journal unavailable' });
  }
  return { checks, prevBootClean };
}

async function send(report) {
  if (report.ok) {
    const to = process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL;
    if (!to) throw new Error('no recipient (DIGEST_EMAIL)');
    const { sendEmail } = await import('../../api/services/email.js');
    await sendEmail({ to, subject: report.subject, text: report.text, html: report.html });
    return true;
  }
  const { actionRequired } = await import('../../api/lib/ops/alert.js');
  return actionRequired({ key: `ups-plan-failed-${report.steps[0]?.at || 'x'}`, quietMs: 0, severity: 'action', subject: report.subject, html: report.html, text: report.text });
}

async function confirm({ dry = false } = {}) {
  const bootAt = new Date(Date.now() - uptime() * 1000).toISOString();
  let plan = confirmPlan(readLedger(), { bootAt });
  if (plan.action === 'boot') {
    if (!dry) appendStep({ step: 'boot', detail: `booted ${bootAt}` }, { now: Date.parse(bootAt) });
    plan = confirmPlan(dry ? [...readLedger(), { at: bootAt, step: 'boot', ok: true }] : readLedger(), { bootAt });
  }
  if (plan.action === 'quiet') { if (!dry) appendStep({ step: 'reported', detail: plan.reason }); return console.log(`ups: ${plan.reason}`); }
  if (plan.action !== 'report') return plan.action === 'none' ? undefined : console.log(`ups: ${plan.action} — ${plan.reason}`);
  const shutdown = plan.event.some((e) => ['poweroff', 'lowbatt', 'boot'].includes(e.step));
  const health = await probeHealth({ shutdown });
  const bad = health.checks.some((c) => c.ok === false);
  if (bad && !plan.finalIfUnhealthy) return console.log(`ups: not healthy yet (${health.checks.filter((c) => c.ok === false).map((c) => c.name).join(', ')}) — next tick`);
  const healthy = { at: new Date().toISOString(), step: 'healthy', ok: !bad, detail: health };
  const report = buildUpsReport([...plan.event, healthy]);
  if (dry) return console.log(report.text);
  appendStep({ step: 'healthy', ok: !bad, detail: health });
  const sent = await send(report).catch((e) => { console.error(`ups: report mail failed: ${e.message}`); return false; });
  if (sent) appendStep({ step: 'reported', ok: report.ok, detail: report.headline });
  console.log(`ups: ${report.headline}${sent ? ' — mailed' : ' — mail NOT sent (retries next tick)'}`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'append' && args[0]) {
  const [step, status = 'ok', raw = ''] = args;
  let detail = raw; try { if (/^[[{]/.test(raw)) detail = JSON.parse(raw); } catch { /* plain text */ }
  const entry = { step, ok: status !== 'fail', ...(detail ? { detail } : {}) };
  const b = battery(); if (b) entry.battery = b;
  if (step === 'poweroff') {
    const w = await getJson(`${WRITER}/power`, { timeout: 2000 });
    entry.detail = { ...(typeof detail === 'object' && detail ? detail : detail ? { note: detail } : {}), writer: w.body ? { mode: w.body.mode, quiet_ms: w.body.quiet_ms } : { error: w.error || `status ${w.status}` } };
  }
  appendStep(entry);
  process.exit(0);
} else if (cmd === 'confirm') {
  const dotenv = (await import('dotenv')).default;
  dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true }); dotenv.config({ path: join(ROOT, '.env-public'), quiet: true });
  await confirm({ dry: args.includes('--dry') });
  process.exit(0);
} else {
  console.error('usage: ups-ledger.mjs append <step> [ok|fail] [detail|json] | confirm [--dry]');
  process.exit(2);
}
