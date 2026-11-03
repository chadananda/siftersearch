// UPS power-event LEDGER + the one confirmation report (Chad 11-03: "automated confirmation it is working as planned if it ever
// has to"; the UPS is for SAFE SHUTDOWN). Each power step appends one JSON line to a file that survives reboot (/tank, not
// /dev/shm); after mains return or the boot that follows a UPS shutdown, buildUpsReport (pure) proves the shutdown was safe.
// Writers: scripts/ops/ups-ledger.mjs (append/confirm), ups-power.sh, deploy/nut/*. No DB. Drill: scripts/ops/ups-drill.mjs.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const ledgerPath = () => process.env.SIFTER_UPS_LEDGER || '/tank/sifter/ups/ledger.jsonl';

/** Append one step ({step, ok, detail, battery}) with a timestamp. Never throws (a power step must not fail on its log). */
export function appendStep(entry, { file = ledgerPath(), now = Date.now() } = {}) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const line = { at: new Date(now).toISOString(), ok: true, ...entry };
    appendFileSync(file, `${JSON.stringify(line)}\n`);
    return line;
  } catch (e) {
    console.error(`[ups-ledger] append failed: ${e.message}`);
    return null;
  }
}

export function readLedger({ file = ledgerPath() } = {}) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** The steps of the event not yet reported: everything after the last 'reported' line, from its first 'onbatt'. */
export function currentEvent(lines) {
  let i = lines.length - 1;
  while (i >= 0 && lines[i].step !== 'reported') i--;
  const rest = lines.slice(i + 1);
  const start = rest.findIndex((l) => l.step === 'onbatt');
  return start < 0 ? [] : rest.slice(start);
}

// ---- the plan ---------------------------------------------------------------------------------------------------------
// Steps in the order the plan runs them. `need` = required on that path; a missing or failed required step is where the plan
// failed. 'shutdown' = low battery → clean power-off → boot; 'held' = mains came back first (writes refused, everything flushed).
export const STEPS = [
  { step: 'onbatt', label: 'Mains lost — UPS on battery', need: ['shutdown', 'held'] },
  { step: 'writers-stopped', label: 'Writers drained and stopped', need: ['shutdown', 'held'] },
  { step: 'readonly', label: 'Writes refused (read-only mode)', need: ['shutdown', 'held'] },
  { step: 'db-flushed', label: 'Database WAL checkpointed (TRUNCATE)', need: ['shutdown', 'held'] },
  { step: 'ram-flushed', label: 'RAM-disk index flushed to snapshots', need: [] },
  { step: 'zpool-synced', label: 'ZFS pools synced', need: ['shutdown'] },
  { step: 'db-shipped', label: 'Database copy shipped to /tank', need: [] },
  { step: 'online', label: 'Mains back', need: [] },
  { step: 'resume', label: 'Writes accepted again (resume)', need: ['held'] },
  { step: 'lowbatt', label: 'Low battery — shutdown ordered', need: [] },
  { step: 'services-stopped', label: 'Power-down target ran (final flush)', need: ['shutdown'] },
  { step: 'poweroff', label: 'Clean OS shutdown started', need: ['shutdown'] },
  { step: 'boot', label: 'Tower booted', need: ['shutdown'] },
  { step: 'healthy', label: 'Healthy after the event', need: ['shutdown', 'held'] },
];
export const MIN_MARGIN_S = 30;   // battery runtime left at power-off below this = the shutdown cut it too fine

const t = (iso) => (iso ? Date.parse(iso) : NaN);
const hhmm = (iso) => (iso ? String(iso).slice(11, 19) : '—');
const secs = (a, b) => Math.round((t(b) - t(a)) / 1000);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Words for one step's detail (pure). */
function describe(s, line) {
  if (!line) return '';
  const d = line.detail || {};
  const b = line.battery || {};
  const batt = b.charge != null ? `battery ${b.charge}%${b.runtime != null ? `, ${b.runtime} s runtime left` : ''}` : '';
  switch (s) {
    case 'writers-stopped': return [d.stopped ? `stopped: ${d.stopped || 'none'}` : '', d.drained ? `drained: ${d.drained}` : '', d.drain_s != null ? `drain ${d.drain_s} s` : ''].filter(Boolean).join(' · ');
    case 'db-flushed': {
      const c = d.content || {};
      return d.error ? `flush failed: ${d.error}` : `content WAL busy=${c.busy ?? '?'} log=${c.log ?? '?'} checkpointed=${c.checkpointed ?? '?'}${d.telemetry ? ` · telemetry busy=${d.telemetry.busy ?? '?'}` : ''}`;
    }
    case 'poweroff': return [batt, d.writer ? `writer ${d.writer.mode || '?'}${d.writer.quiet_ms != null ? `, last write ${Math.round(d.writer.quiet_ms / 1000)} s before` : ''}` : ''].filter(Boolean).join(' · ');
    case 'healthy': return (d.checks || []).map((c) => `${c.ok === false ? '✗' : c.ok == null ? '?' : '✓'} ${c.name}${c.detail ? `: ${c.detail}` : ''}`).join(' · ');
    default: return [typeof line.detail === 'string' ? line.detail : '', batt].filter(Boolean).join(' · ');
  }
}

/**
 * The confirmation report (pure). events = the event's ledger lines (onbatt … healthy); health = the post-event probes
 * ({checks:[{name, ok, detail}], prevBootClean?: true|false|null}) when not already in a 'healthy' line.
 * @returns {{ path, ok, failedAt, why, headline, subject, steps, html, text }}
 */
export function buildUpsReport(events, { drill = false } = {}) {
  const first = (s) => events.find((e) => e.step === s);
  const path = first('poweroff') || first('lowbatt') || first('boot') || first('services-stopped') ? 'shutdown' : 'held';
  const problems = [];   // [step, why] in plan order
  for (const def of STEPS) {
    const line = first(def.step);
    if (def.need.includes(path) && !line) problems.push([def.step, def.step === 'poweroff' && first('boot') ? 'power was lost before the clean shutdown started (the tower booted with no power-off step)' : 'step missing from the ledger']);
    else if (line && line.ok === false) problems.push([def.step, describe(def.step, line) || 'reported a failure']);
  }
  // checks across steps — what makes the shutdown SAFE
  const flushed = first('db-flushed'), off = first('poweroff'), boot = first('boot');
  if (flushed && !flushed.detail?.error && Number(flushed.detail?.content?.busy) > 0) problems.push(['db-flushed', 'the WAL checkpoint was blocked (busy > 0): the database file was not complete by itself']);
  if (path === 'shutdown' && flushed && off && t(flushed.at) > t(off.at)) problems.push(['db-flushed', 'the database flush finished after the power-off started']);
  if (off) {
    const rt = off.battery?.runtime;
    if (rt != null && Number(rt) < MIN_MARGIN_S) problems.push(['poweroff', `only ${rt} s of battery left at power-off (need ≥ ${MIN_MARGIN_S} s)`]);
    if (off.detail?.writer && off.detail.writer.mode && off.detail.writer.mode !== 'readonly') problems.push(['poweroff', `the writer was in '${off.detail.writer.mode}' mode at power-off, not read-only`]);
  }
  const healthy = first('healthy');
  if (healthy?.detail?.prevBootClean === false) problems.push(['poweroff', 'the previous boot\'s journal does not end in a clean power-off']);
  if (path === 'held' && !first('readonly')) {
    const on = first('online'), ob = first('onbatt');
    // a blip shorter than the 10 s debounce needs no action — the plan did nothing because nothing was needed
    if (on && ob && secs(ob.at, on.at) <= 15) problems.splice(0, problems.length);
  }
  const order = STEPS.map((s) => s.step);
  problems.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const ok = problems.length === 0;
  const failedAt = ok ? null : problems[0][0];
  const label = (s) => STEPS.find((x) => x.step === s)?.label || s;
  const what = path === 'shutdown' ? 'safe shutdown' : 'safe state held';
  const headline = ok ? `${what} ✓` : `${what} ✗ at ${failedAt} — ${problems[0][1]}`;
  const pre = drill ? '[DRILL] ' : '';
  const subject = ok ? `${pre}[UPS] tower power event: ${what} ✓` : `${pre}UPS plan failed at ${failedAt}`;

  const ob = first('onbatt');
  const steps = STEPS.filter((d) => first(d.step) || d.need.includes(path)).map((d) => {
    const line = first(d.step);
    const bad = problems.filter(([s]) => s === d.step).map(([, w]) => w);
    return { step: d.step, label: d.label, at: line?.at || null, plus: line && ob ? secs(ob.at, line.at) : null, ok: line ? !bad.length && line.ok !== false : !d.need.includes(path) ? null : false,
      detail: [line ? describe(d.step, line) : 'not recorded', ...bad.filter((w) => w !== describe(d.step, line))].filter(Boolean).join(' — ') };
  });
  const margin = off?.battery?.runtime != null ? `${off.battery.runtime} s of battery runtime left at power-off (${off.battery.charge ?? '?'}% charge)` : null;
  const facts = [
    ob && `On battery at ${ob.at.replace('T', ' ').slice(0, 19)} UTC${ob.battery?.charge != null ? ` with ${ob.battery.charge}% charge` : ''}.`,
    path === 'shutdown' ? (margin ? `Margin: ${margin}.` : off ? 'Margin: the battery level at power-off was not recorded.' : null)
      : 'Mains came back before low battery: no shutdown was needed.',
    boot && off && `Down for ${Math.round(secs(off.at, boot.at) / 60)} min (power-off ${hhmm(off.at)} → boot ${hhmm(boot.at)} UTC).`,
    'Database integrity is checked deeply by the nightly backup verify (quick_check on the snapshot); this report checks the WAL checkpoint before power-off and that the writer answers after.',
  ].filter(Boolean);

  const mark = (x) => (x.ok === true ? '<span style="color:#1a7f37">✓</span>' : x.ok === false ? '<span style="color:#b42318">✗</span>' : '<span style="color:#888">·</span>');
  const td = 'padding:4px 8px;border-bottom:1px solid #e5e5e5;vertical-align:top;font-size:14px';
  const html = `<p style="margin:6px 0;font-size:17px"><b style="color:${ok ? '#1a7f37' : '#b42318'}">${esc(headline)}</b></p>`
    + facts.map((f) => `<p style="margin:6px 0">${esc(f)}</p>`).join('')
    + `<table style="border-collapse:collapse;margin:10px 0;width:100%"><tr style="text-align:left;background:#f4f4f4"><th style="${td}"></th><th style="${td}">Step</th><th style="${td}">Time (UTC)</th><th style="${td}">+s</th><th style="${td}">Detail</th></tr>`
    + steps.map((x) => `<tr><td style="${td}">${mark(x)}</td><td style="${td}">${esc(x.label)}</td><td style="${td};white-space:nowrap">${hhmm(x.at)}</td><td style="${td}">${x.plus ?? ''}</td><td style="${td}">${esc(x.detail)}</td></tr>`).join('')
    + '</table>'
    + `<p style="margin:6px 0;color:#666;font-size:13px">Ledger: ${esc(ledgerPath())} · plan: scripts/ops/ups-power.sh, deploy/nut/ · drill: node scripts/ops/ups-drill.mjs --simulate</p>`;
  const text = [headline, '', ...facts, '', ...steps.map((x) => `${x.ok === true ? '✓' : x.ok === false ? '✗' : '·'} ${hhmm(x.at)}  ${x.label}${x.detail ? ` — ${x.detail}` : ''}`)].join('\n');
  return { path, ok, failedAt, why: ok ? null : problems[0][1], problems, headline, subject, steps, html, text };
}

/**
 * Decide what confirm should do now (pure). lines = the whole ledger; bootAt = this boot's time (ISO); now = ms.
 * @returns {{ action: 'none'|'boot'|'wait'|'report', event, reason }}
 *   'boot'   append a boot step first (the tower restarted after the event began)
 *   'wait'   the event is still running, or services may still be starting
 *   'report' probe health, append 'healthy', send the report, append 'reported'
 *   'quiet'  a blip shorter than the debounce: mark it reported, no mail
 */
export function confirmPlan(lines, { bootAt, now = Date.now(), settleMs = 5 * 60_000, maxWaitMs = 35 * 60_000 } = {}) {
  const event = currentEvent(lines);
  if (!event.length) return { action: 'none', event, reason: 'no unreported power event' };
  const last = event[event.length - 1], has = (s) => event.some((e) => e.step === s);
  if (!has('boot') && bootAt && t(bootAt) > t(last.at)) return { action: 'boot', event, reason: `booted at ${bootAt} after the event began` };
  const ended = event.find((e) => e.step === 'boot') || (has('resume') && !has('poweroff') ? event.find((e) => e.step === 'resume') : null);
  if (!ended) {
    const ob = event.find((e) => e.step === 'onbatt'), on = [...event].reverse().find((e) => e.step === 'online');
    // mains back and nothing after it for 2 min, with no read-only step: a blip under the debounce (quiet), or read-only
    // mode never started although it should have (report → it fails at 'readonly')
    if (on && on === last && !has('readonly') && now - t(on.at) > 2 * 60_000) {
      return secs(ob.at, on.at) <= 15 ? { action: 'quiet', event, reason: `blip of ${secs(ob.at, on.at)} s — under the debounce, nothing to confirm` }
        : { action: 'report', event, reason: `on battery ${secs(ob.at, on.at)} s and read-only mode never started`, finalIfUnhealthy: true };
    }
    return { action: 'wait', event, reason: 'event still in progress' };
  }
  const since = now - t(ended.at);
  if (since < settleMs) return { action: 'wait', event, reason: `services settling (${Math.round(since / 1000)} s since ${ended.step})` };
  return { action: 'report', event, reason: `${ended.step} ${Math.round(since / 60000)} min ago`, finalIfUnhealthy: since >= maxWaitMs };
}

/**
 * A drill's fake power event (pure) — the same lines the real hooks write. scenario: 'good' (low battery → clean shutdown →
 * boot → healthy) · 'held' (mains back before low battery) · 'missing' (no WAL checkpoint recorded) · 'unclean' (power lost
 * before the clean shutdown started). Times from t0 (ms).
 */
export function drillSequence(scenario = 'good', t0 = Date.parse('2026-11-03T14:00:00Z')) {
  const at = (s) => new Date(t0 + s * 1000).toISOString();
  const healthy = (prevBootClean) => ({ checks: [
    { name: 'API gateway', ok: true, detail: 'v1.0 (drill)' }, { name: 'Writer (DB answers)', ok: true, detail: 'ok' },
    { name: 'Writes accepted', ok: true, detail: 'mode normal' }, { name: 'Services beating', ok: true, detail: '14 services' },
    { name: 'ZFS pools', ok: true, detail: 'all pools are healthy' },
    ...(prevBootClean === undefined ? [] : [{ name: 'Previous boot ended in a clean power-off', ok: prevBootClean, detail: prevBootClean ? 'sifter-ups-shutdown ran' : 'journal ends without a power-off' }]),
  ], ...(prevBootClean === undefined ? {} : { prevBootClean }) });
  const flush = { ok: true, content: { busy: 0, log: 0, checkpointed: 0 }, telemetry: { busy: 0, log: 0, checkpointed: 0 } };
  const head = [
    { at: at(0), step: 'onbatt', ok: true, battery: { charge: 100, runtime: 1260, status: 'OB DISCHRG' } },
    { at: at(14), step: 'writers-stopped', ok: true, detail: { stopped: 'siftersearch-embedding siftersearch-deep-research', drained: 'siftersearch-indexer siftersearch-reports', drain_s: 4 } },
    { at: at(14), step: 'readonly', ok: true, detail: 'UPS OB DISCHRG', battery: { charge: 99, runtime: 1240 } },
    ...(scenario === 'missing' ? [] : [{ at: at(16), step: 'db-flushed', ok: true, detail: flush }]),
    { at: at(31), step: 'ram-flushed', ok: true }, { at: at(32), step: 'zpool-synced', ok: true }, { at: at(41), step: 'db-shipped', ok: true },
  ];
  if (scenario === 'held') {
    return [...head, { at: at(240), step: 'online', ok: true, battery: { charge: 81, runtime: 980 } },
      { at: at(300), step: 'resume', ok: true, detail: 'restarted: siftersearch-embedding siftersearch-deep-research' },
      { at: at(720), step: 'healthy', ok: true, detail: healthy() }];
  }
  if (scenario === 'unclean') {
    return [...head, { at: at(1090), step: 'lowbatt', ok: true, battery: { charge: 12, runtime: 175 } },
      { at: at(5400), step: 'boot', ok: true, detail: 'booted (drill)' },
      { at: at(5800), step: 'healthy', ok: false, detail: healthy(false) }];
  }
  return [...head,
    { at: at(1090), step: 'lowbatt', ok: true, battery: { charge: 12, runtime: 178 } },
    { at: at(1097), step: 'services-stopped', ok: true, detail: 'sifter-powerdown.target' },
    { at: at(1099), step: 'poweroff', ok: true, battery: { charge: 11, runtime: 166 }, detail: { note: 'shutdown -h +0', writer: { mode: 'readonly', quiet_ms: 1085000 } } },
    { at: at(5400), step: 'boot', ok: true, detail: 'booted (drill)' },
    { at: at(5800), step: 'healthy', ok: true, detail: healthy(true) }];
}
