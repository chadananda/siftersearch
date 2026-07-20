// Grounding progress DIGEST — an hourly "here's what finished" email so the run can be trusted while unattended.
// Reports every book that reached full grounding in the window (author · title · description · people grounded ·
// net-new people added to the graph) plus where the whole plan stands (documents + paragraphs done/remaining).
// Sent only when ≥1 book completed in the window. Data: grounding_queue (what finished) + bio.getIntegrationProgress
// (per-book people counts + plan totals) + docs (descriptions). Delivery: the app email service.
import { queryAll, queryOne } from '../db.js';
import { logger } from '../logger.js';
import { sendEmail } from '../../services/email.js';
import { getIntegrationProgress } from '../bio.js';
import { slugifyPath } from '../slug.js';

// Link a book title to its page. Prefer the SifterSearch library URL (works for every doc with a slug); fall back
// to the Ocean source_url when present. Same scheme as the sitemap: /library/<religion>/<collection>/<slug>.
const SITE_URL = 'https://siftersearch.com';
function bookUrl(m) {
  if (m && m.slug && m.religion && m.collection) return `${SITE_URL}/library/${slugifyPath(m.religion)}/${slugifyPath(m.collection)}/${m.slug}`;
  return (m && m.source_url) || null;
}
const titleHtml = (b, style) => (b.url ? `<a href="${esc(b.url)}" target="_blank" style="${style};text-decoration:underline">${esc(b.title)}</a>` : esc(b.title));

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const commas = (n) => Number(n || 0).toLocaleString('en-US');

// Gather the digest for books whose FIRST full-grounding completion landed in (since, now].
export async function buildDigest(sinceEpoch, deps = {}) {
  const qAll = deps.queryAll || queryAll;
  const prog = deps.getProgress ? await deps.getProgress() : await getIntegrationProgress();
  const planBooks = (prog.phases || []).flatMap((p) => (p.books || []).map((b) => ({ ...b, phase: p.label })));
  const byId = new Map(planBooks.map((b) => [b.id, b]));

  // Report each book AT MOST ONCE, in the window of its FIRST completion. The queue can accumulate many 'done'
  // rows for one doc (a book that re-grounds writes a fresh row each time — one doc had 47), so filtering on any
  // row's finished_at re-reported the same book every hour. GROUP BY doc_id + MIN(finished_at) = first completion:
  // once a book's first completion falls in a past window, it can never re-appear even if it re-grounds later.
  const doneRows = await qAll(
    `SELECT doc_id, MIN(finished_at) finished_at FROM grounding_queue WHERE status='done' AND finished_at IS NOT NULL
     GROUP BY doc_id HAVING MIN(finished_at) > ? ORDER BY finished_at ASC`, [sinceEpoch]);

  // Defense in depth: one entry per doc_id (rows are sorted first-completion-first, so the first wins).
  const seen = new Set();
  const uniqueRows = doneRows.filter((r) => (seen.has(r.doc_id) ? false : (seen.add(r.doc_id), true)));

  const books = [];
  for (const r of uniqueRows) {
    const b = byId.get(r.doc_id) || {};
    const meta = await (deps.queryOne || queryOne)(`SELECT title, author, description, paragraph_count, slug, collection, religion, source_url FROM docs WHERE id=?`, [r.doc_id]);
    if (!meta) continue;
    // Count people DIRECTLY from the book's bound entities — getIntegrationProgress only computes b.persons for the
    // curated seed/foundation/primary docs, so pilgrim/biography completions were reporting 0 (the "0 names" bug).
    const pc = await (deps.queryOne || queryOne)(
      `SELECT COUNT(DISTINCT entity_id) n FROM entity_claims WHERE doc_id=? AND entity_id IS NOT NULL`, [r.doc_id]);
    books.push({
      id: r.doc_id,
      title: b.title || meta.title || `doc ${r.doc_id}`,
      author: b.author || meta.author || 'Unknown',
      description: meta.description || '',
      phase: b.phase || '',
      paras: b.size || meta.paragraph_count || 0,
      people: (pc && pc.n) || b.persons || 0,   // people grounded in this book (bound entities)
      newPeople: b.newInSequence || 0,          // NET-new to the graph (curated only; 0 for dynamic — secondary)
      url: bookUrl(meta),
      finishedAt: r.finished_at,
    });
  }

  // Currently-processing books (in flight) with their live stage + within-stage progress, so the digest shows
  // momentum even in an hour where nothing fully finished.
  const procRows = await qAll(
    `SELECT q.doc_id, d.title, d.author, d.paragraph_count paras, d.slug, d.collection, d.religion, d.source_url, p.run_json
     FROM grounding_queue q LEFT JOIN docs d ON d.id=q.doc_id LEFT JOIN doc_pipeline p ON p.doc_id=q.doc_id
     WHERE q.status='running' ORDER BY q.position`);
  const processing = procRows.map((r) => {
    let rj = {}; try { rj = r.run_json ? JSON.parse(r.run_json) : {}; } catch { /* ignore */ }
    return { id: r.doc_id, title: r.title || `doc ${r.doc_id}`, author: r.author || 'Unknown', paras: r.paras || 0,
      url: bookUrl(r),
      stage: rj.stage || '—', stageNum: (rj.stageIndex ?? 0) + 1, totalStages: rj.totalStages || 11, withinFrac: rj.withinFrac || 0 };
  });

  // doneBooks/doneParas come from getIntegrationProgress and count EVERY phase incl. pilgrim groups, so the headline
  // reflects the primary-source grounding actually in progress (not just the frozen seed+foundation total).
  const doneParas = prog.doneParas || 0;
  const plan = {
    docsDone: prog.doneBooks || 0,
    docsTotal: prog.totalBooks || 0,
    docsPct: pct(prog.doneBooks || 0, prog.totalBooks || 0),
    parasDone: doneParas,
    parasTotal: prog.totalParas || 0,
    parasPct: pct(doneParas, prog.totalParas || 0),
    peopleTotal: prog.cumulativeUnique || 0,
  };
  return { books, processing, plan, sinceEpoch };
}

// A clean, email-client-safe HTML digest (inline styles, table layout, dark-friendly neutral palette).
export function renderDigestHtml({ books, processing = [], plan }) {
  const procRow = (b) => `<tr><td style="padding:9px 0;border-bottom:1px solid #eef1f5">
      <div style="font:600 14px/1.3 Georgia,serif;color:#1a2233">${titleHtml(b, "color:#1a2233")}</div>
      <div style="font:400 12px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#8b92a1">${esc(b.author)}</div>
      <div style="margin-top:5px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:5px;background:#eef1f5;overflow:hidden"><tr><td style="height:6px;width:${Math.max(2, Math.round((b.withinFrac || 0) * 100))}%;background:#f5a623;font-size:0;line-height:0">&nbsp;</td><td style="font-size:0">&nbsp;</td></tr></table></div>
      <div style="font:400 11px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#9aa0ac;margin-top:3px">stage ${b.stageNum}/${b.totalStages} · ${esc(b.stage)} · ${Math.round((b.withinFrac || 0) * 100)}% · ${commas(b.paras)} paragraphs</div>
    </td></tr>`;
  const procSection = processing.length ? `
      <tr><td style="padding:22px 4px 8px;font:600 13px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#5a6172;text-transform:uppercase;letter-spacing:.5px">Currently processing (${processing.length})</td></tr>
      <tr><td style="padding:0 18px;background:#fff;border:1px solid #e3e7ee;border-radius:10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${processing.map(procRow).join('')}</table></td></tr>` : '';
  return renderDigestHtmlInner({ books, plan, procSection });
}
function renderDigestHtmlInner({ books, plan, procSection }) {
  const bar = (p, color) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;background:#e8ebf0;overflow:hidden"><tr><td style="height:10px;width:${Math.max(2, p)}%;background:${color};font-size:0;line-height:0">&nbsp;</td><td style="font-size:0;line-height:0">&nbsp;</td></tr></table>`;
  const card = (b) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #e3e7ee;border-radius:10px;background:#fff">
      <tr><td style="padding:16px 18px">
        <div style="font:600 16px/1.35 Georgia,'Times New Roman',serif;color:#1a2233">${titleHtml(b, "color:#1a2233")}</div>
        <div style="font:400 13px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#7b8394;margin:2px 0 8px">${esc(b.author)}${b.phase ? ` &nbsp;·&nbsp; <span style="color:#9aa0ac">${esc(b.phase)}</span>` : ''}</div>
        ${b.description ? `<div style="font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#4a5162;margin:0 0 12px">${esc(b.description).slice(0, 320)}${b.description.length > 320 ? '…' : ''}</div>` : ''}
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${[[commas(b.people), 'people grounded'], [`+${commas(b.newPeople)}`, 'new to the graph'], [commas(b.paras), 'paragraphs']].map(([v, l]) =>
            `<td style="padding:0 22px 0 0"><div style="font:700 18px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2f6fed">${v}</div><div style="font:400 11px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#8b92a1;text-transform:uppercase;letter-spacing:.4px">${l}</div></td>`).join('')}
        </tr></table>
      </td></tr>
    </table>`;

  return `<!-- digest -->
  <div style="margin:0;padding:0;background:#f4f6f9">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td style="padding:0 4px 18px">
        <div style="font:700 20px/1.2 Georgia,'Times New Roman',serif;color:#1a2233">SifterSearch &middot; Grounding Progress</div>
        <div style="font:400 13px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#7b8394;margin-top:3px">${books.length} document${books.length === 1 ? '' : 's'} fully grounded this hour</div>
      </td></tr>
      <tr><td style="padding:18px 20px;background:#1a2233;border-radius:12px">
        <div style="font:400 11px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#9aa8c4;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Library — history plan</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#dfe4ee;padding-bottom:4px">Documents: <b style="color:#fff">${commas(plan.docsDone)}</b> of ${commas(plan.docsTotal)} <span style="color:#7f8db0">(${plan.docsPct}%)</span> &nbsp;&middot;&nbsp; ${commas(plan.docsTotal - plan.docsDone)} remaining</td></tr>
          <tr><td style="padding-bottom:12px">${bar(plan.docsPct, '#4c8dff')}</td></tr>
          <tr><td style="font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#dfe4ee;padding-bottom:4px">Content: <b style="color:#fff">${commas(plan.parasDone)}</b> of ${commas(plan.parasTotal)} paragraphs <span style="color:#7f8db0">(${plan.parasPct}%)</span></td></tr>
          <tr><td>${bar(plan.parasPct, '#38c793')}</td></tr>
        </table>
      </td></tr>
      ${books.length ? `<tr><td style="padding:22px 4px 10px;font:600 13px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#5a6172;text-transform:uppercase;letter-spacing:.5px">Completed this hour</td></tr>
      <tr><td>${books.map(card).join('')}</td></tr>` : ''}
      ${procSection}
      <tr><td style="padding:10px 4px 4px;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#9aa0ac">Cumulative unique people grounded across the library: <b style="color:#5a6172">${commas(plan.peopleTotal)}</b>. You'll get the next update in an hour, only if more books finish.</td></tr>
    </table>
  </td></tr></table></div>`;
}

export function renderDigestText({ books, processing = [], plan }) {
  const lines = [
    `SifterSearch — Grounding Progress`,
    `${books.length} document(s) fully grounded this hour`, '',
    `LIBRARY (history plan):`,
    `  Documents: ${commas(plan.docsDone)} of ${commas(plan.docsTotal)} (${plan.docsPct}%) — ${commas(plan.docsTotal - plan.docsDone)} remaining`,
    `  Content:   ${commas(plan.parasDone)} of ${commas(plan.parasTotal)} paragraphs (${plan.parasPct}%)`, '',
  ];
  if (books.length) {
    lines.push(`COMPLETED THIS HOUR:`);
    for (const b of books) {
      lines.push(`  • ${b.title} — ${b.author}${b.phase ? ` [${b.phase}]` : ''}${b.url ? `\n    ${b.url}` : ''}`);
      if (b.description) lines.push(`      ${b.description.slice(0, 200)}`);
      lines.push(`      ${commas(b.people)} people grounded · +${commas(b.newPeople)} new to the graph · ${commas(b.paras)} paragraphs`);
    }
    lines.push('');
  }
  if (processing.length) {
    lines.push(`CURRENTLY PROCESSING (${processing.length}):`);
    for (const b of processing) lines.push(`  • ${b.title} — ${b.author}  [stage ${b.stageNum}/${b.totalStages} · ${b.stage} · ${Math.round((b.withinFrac || 0) * 100)}%]`);
    lines.push('');
  }
  lines.push(`Cumulative unique people grounded: ${commas(plan.peopleTotal)}.`);
  return lines.join('\n');
}

// Build + send the digest for (sinceEpoch, now]. Returns {count, sentTo|null}. Sends nothing when no book finished.
export async function sendDigest(sinceEpoch, deps = {}) {
  const digest = await buildDigest(sinceEpoch, deps);
  // Hourly cron: skip the email when nothing finished. `force` (a manual test) always sends, so the recipient can
  // confirm delivery immediately and still see in-progress + plan status.
  if (!digest.books.length && !deps.force) return { count: 0, processing: digest.processing.length, sentTo: null };
  const to = deps.to || process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL;
  if (!to) { logger.warn('digest: no recipient (set DIGEST_EMAIL or SITE_ADMIN_EMAIL)'); return { count: digest.books.length, sentTo: null }; }
  const tag = deps.force && !digest.books.length ? '[TEST] ' : '';
  const subject = `${tag}SifterSearch: ${digest.books.length} grounded, ${digest.processing.length} in progress — ${digest.plan.docsDone}/${digest.plan.docsTotal} done (${digest.plan.docsPct}%)`;
  await (deps.sendEmail || sendEmail)({ to, subject, text: renderDigestText(digest), html: renderDigestHtml(digest) });
  logger.info({ to, count: digest.books.length, processing: digest.processing.length }, 'grounding digest sent');
  return { count: digest.books.length, processing: digest.processing.length, sentTo: to };
}
