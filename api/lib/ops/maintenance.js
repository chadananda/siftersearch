// Weekly maintenance queue (Chad 11-03: "a weekly maintenance email with such suggestions flagged; daily or hourly emails only
// for issues that need addressed right away"). File-based under data/run/maintenance (gitignored) so tower scripts can call it:
// queue/<key>.json = one item, deduped by key; <source>.json = a whole section ({source, generated, title, summary, items, html}).
// system-checks.mjs --weekly renders everything (buildWeekly, pure) and drains it to sent/<date>/. Never throws on queueing.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownHtml } from '../mail-render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const maintenanceDir = () => process.env.MAINTENANCE_DIR || join(ROOT, 'data', 'run', 'maintenance');
const safe = (k) => String(k).replace(/[^a-z0-9_.-]/gi, '_').slice(0, 180);
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const writeAtomic = (f, obj) => { mkdirSync(dirname(f), { recursive: true }); const tmp = `${f}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(obj, null, 1)); renameSync(tmp, f); };

/**
 * Queue one item for the weekly email. The same key again updates it (text/title/data replaced, `seen` counted, `first` kept);
 * `merge(prevData, data)` combines data instead (digests that add up over the week); `render(mergedData)` → {title, text} then
 * writes the item's words from the combined data.
 * @returns the stored item, or null on failure (never throws)
 */
export function queueMaintenance({ source, key, title, text = '', severity = 'suggestion', data = null, merge = null, render = null }, deps = {}) {
  try {
    if (!source || !key) throw new Error('source and key are required');
    const f = join(deps.dir || maintenanceDir(), 'queue', `${safe(key)}.json`);
    const now = new Date(deps.now ?? Date.now()).toISOString(), prev = readJson(f);
    const stored = merge ? merge(prev?.data ?? null, data) : data;
    const words = render ? render(stored) : {};
    const item = { source, key, title: words.title || title || key, text: String(words.text ?? text ?? ''), severity: severity === 'warn' ? 'warn' : 'suggestion',
      first: prev?.first || now, last: now, seen: (prev?.seen || 0) + 1, data: stored };
    writeAtomic(f, item);
    return item;
  } catch (e) {
    console.error(`[maintenance] queue failed for ${key}: ${e.message}`);
    return null;
  }
}

/** The queued items (oldest first) and the sections (<source>.json with items) waiting for the next weekly email. */
export function pendingMaintenance(deps = {}) {
  const dir = deps.dir || maintenanceDir(), qd = join(dir, 'queue');
  const queued = existsSync(qd) ? readdirSync(qd).filter((f) => f.endsWith('.json')).map((f) => readJson(join(qd, f))).filter(Boolean) : [];
  const sections = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, ...readJson(join(dir, f)) })).filter((s) => s.source && Array.isArray(s.items)) : [];
  queued.sort((a, b) => String(a.first).localeCompare(String(b.first)));
  return { queued, sections };
}

/** After the weekly email went out: move every queued item and section into sent/<date>/ (kept, never re-sent). */
export function drainMaintenance(deps = {}) {
  const dir = deps.dir || maintenanceDir(), qd = join(dir, 'queue');
  const out = join(dir, 'sent', new Date(deps.now ?? Date.now()).toISOString().slice(0, 10));
  mkdirSync(join(out, 'queue'), { recursive: true });
  let n = 0;
  if (existsSync(qd)) for (const f of readdirSync(qd).filter((x) => x.endsWith('.json'))) { renameSync(join(qd, f), join(out, 'queue', f)); n++; }
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const s = readJson(join(dir, f));
    if (s?.source && Array.isArray(s.items)) { renameSync(join(dir, f), join(out, f)); n++; }
  }
  return { moved: n, to: out };
}

// ---- render (pure) ------------------------------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const H2 = (t) => `<h2 style="font-size:18px;margin:22px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px">${t}</h2>`;
const P = (t, style = '') => `<p style="margin:6px 0;${style}">${t}</p>`;
const MUTED = 'color:#666;font-size:14px';
const day = (iso) => String(iso || '').slice(0, 10);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n).trimEnd()} …` : s);
/** Human labels for the queue's sources (unknown sources show their own name). */
export const SOURCE_LABELS = Object.freeze({
  'system-checks': 'Health warnings during the week', host: 'Host resources (disk and memory warnings)', 'anis-audit': 'Anís answers that need a look',
  grounding: 'Grounding progress', ingest: 'Ingest progress', 'stall-guard': 'Grounding stall guard', segmentation: 'Approvals: Arabic segmentation over the cap',
  dewey: 'Dewey spend', ups: 'UPS', 'drive-wear': 'Drive wear (NVMe/SSD writes per day)',
});
const ITEMS_PER_SOURCE = 25;

function healthBlock(health) {
  if (!health) return P('Health snapshot unavailable this run.', MUTED);
  const crit = health.criticals || [], warns = health.warns || [];
  const row = (c, mark, color) => `<li style="margin:2px 0"><span style="color:${color}">${mark}</span> <b>${esc(c.name)}</b>${c.detail ? ` — ${esc(c.detail)}` : ''}</li>`;
  const out = [P(crit.length ? `<b style="color:#b42318">${crit.length} critical now</b> (each was alarmed on its own when it started)` : '<b style="color:#1a7f37">All critical checks passing now.</b>')];
  if (crit.length) out.push(`<ul style="margin:4px 0 4px 18px;padding:0">${crit.map((c) => row(c, '✗', '#b42318')).join('')}</ul>`);
  if (warns.length) out.push(P(`${warns.length} warning(s) now:`), `<ul style="margin:4px 0 4px 18px;padding:0">${warns.map((c) => row(c, '⚠', '#9a6700')).join('')}</ul>`);
  if (health.metrics?.length) out.push(`<ul style="margin:4px 0 4px 18px;padding:0;${MUTED}">${health.metrics.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`);
  return out.join('');
}

function queuedBlock(source, items) {
  const shown = items.slice(0, ITEMS_PER_SOURCE);
  const li = (i) => {
    const when = i.seen > 1 ? `${i.seen}× · ${day(i.first)} → ${day(i.last)}` : day(i.last);
    const flag = i.severity === 'warn' ? '<span style="color:#9a6700">⚠</span> ' : '';
    const body = i.text ? `<div style="margin:2px 0 0 0;font-size:14px">${markdownHtml(clip(i.text, 1500), { breaks: true })}</div>` : '';
    return `<li style="margin:6px 0">${flag}<b>${esc(i.title)}</b> <span style="${MUTED}">(${when})</span>${body}</li>`;
  };
  return H2(esc(SOURCE_LABELS[source] || source))
    + `<ul style="margin:4px 0 4px 18px;padding:0">${shown.map(li).join('')}</ul>`
    + (items.length > shown.length ? P(`…and ${items.length - shown.length} more (data/run/maintenance/sent on tower)`, MUTED) : '');
}

/**
 * The weekly maintenance email. Pure.
 * @param {object} o  health {criticals, warns, metrics[]} · sections [{source,title,summary,items,html}] · queued [items] · now
 * @returns {{ subject, html, text, empty }}  empty = nothing to act on (the short "all nominal" mail)
 */
export function buildWeekly({ health = null, sections = [], queued = [], now = new Date() } = {}) {
  const live = sections.filter((s) => s.items?.length);
  const warnQueued = queued.filter((i) => i.severity === 'warn').length;
  const crit = health?.criticals?.length || 0, warnNow = health?.warns?.length || 0;
  const empty = !live.length && !queued.length && !crit && !warnNow;
  const week = day(new Date(now).toISOString());
  if (empty) {
    const html = P(`<b style="color:#1a7f37">All nominal.</b> No warnings, suggestions or approvals were queued this week, and every check passes now.`)
      + (health?.metrics?.length ? `<ul style="margin:4px 0 4px 18px;padding:0;${MUTED}">${health.metrics.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '')
      + P('This is the only all-green mail: anything that needs you today arrives on its own as [ACTION] or [PAGE].', MUTED);
    return { subject: `SifterSearch weekly maintenance ${week}: all nominal`, html, text: 'All nominal. No warnings, suggestions or approvals this week; every check passes now.', empty };
  }
  const bySource = {};
  for (const i of queued) (bySource[i.source] ||= []).push(i);
  const counts = [crit && `${crit} critical`, (warnNow + warnQueued) && `${warnNow + warnQueued} warning(s)`,
    live.length && `${live.length} report section(s)`, queued.length && `${queued.length} queued item(s)`].filter(Boolean).join(' · ');
  const parts = [
    P(`<b>Week to ${week}</b> — ${esc(counts)}.`),
    P('Nothing here was urgent: urgent issues were mailed on their own as [ACTION] or [PAGE]. Work through this list when convenient.', MUTED),
    H2('Health now'), healthBlock(health),
    ...live.map((s) => s.html || (H2(esc(s.title)) + P(esc(s.summary || '')))),
    ...Object.entries(bySource).map(([src, items]) => queuedBlock(src, items)),
  ];
  const text = [`Week to ${week}: ${counts}.`, ...live.map((s) => `${s.title}: ${s.summary || ''}`),
    ...Object.entries(bySource).map(([src, items]) => `${SOURCE_LABELS[src] || src}: ${items.length} item(s)`)].join('\n');
  return { subject: `SifterSearch weekly maintenance ${week}: ${counts}`, html: parts.join(''), text, empty };
}
