// INGEST progress digest — the peak-window counterpart to digest.js. The box does two different jobs at
// different hours: it grounds books in DeepSeek's cheap off-peak window, and it converts + ingests the
// backlog of missing books during peak, when grounding is paused. One hourly email either way, so the
// subject line always says which half of the day it is. Data: docs (what landed) + the admin snapshot
// (what's left). Pure render functions; sending lives in sendIngestDigest. Deps: db, email, snapshot.
import { readFileSync } from 'fs';
import { join } from 'path';
import { queryAll, queryOne } from '../db.js';
import { logger } from '../logger.js';
import { sendEmail } from '../../services/email.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const commas = (n) => Number(n || 0).toLocaleString('en-US');

/**
 * What was ingested in (since, now], and how much of the missing-books queue is left.
 * @param {number} sinceEpoch unix seconds
 */
export async function buildIngestDigest(sinceEpoch, deps = {}) {
  const qAll = deps.queryAll || queryAll;
  const qOne = deps.queryOne || queryOne;
  // docs.created_at / deleted_at are ISO-8601 TEXT, not epoch integers. Comparing them to a number
  // silently matches EVERY row (SQLite sorts every integer below every text), which reported the whole
  // LIMIT as "ingested this hour". Compare text to text.
  const sinceIso = new Date(sinceEpoch * 1000).toISOString();
  // A converted book arrives as a NEW doc carrying real prose. `converted` in the frontmatter is the
  // marker the converter writes, so this counts our own work rather than any unrelated ingest.
  const books = await qAll(
    `SELECT d.id, d.title, d.author, d.paragraph_count AS paras, d.religion, d.collection
       FROM docs d
      WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
        AND d.created_at > ? AND d.paragraph_count > 0
      ORDER BY d.paragraph_count DESC LIMIT 60`, [sinceIso]).catch(() => []);
  const retired = (await qOne(
    `SELECT COUNT(*) n FROM docs WHERE duplicate_of IS NOT NULL AND deleted_at > ?`, [sinceIso]).catch(() => null))?.n ?? 0;
  const paras = books.reduce((a, b) => a + (b.paras || 0), 0);

  // What's LEFT comes from the admin snapshot's missing-books section (already computed, never rescanned
  // here — that scan takes ~6s and must not run in a request or a cron tick).
  let queue = { haveSource: null, noSource: null };
  try {
    const snap = JSON.parse(readFileSync(join(process.cwd(), 'data', 'pipeline-status.json'), 'utf8'));
    const mb = snap?.missingBooks;
    if (mb) queue = { haveSource: mb.haveSourceTotal ?? null, noSource: mb.noSourceTotal ?? null };
  } catch { /* snapshot optional — the digest still reports what landed */ }

  return { books, paras, retired, queue, since: sinceEpoch, now: Math.floor(Date.now() / 1000) };
}

export function renderIngestDigestText({ books, paras, retired, queue }) {
  const lines = [`INGESTED THIS HOUR: ${books.length} document${books.length === 1 ? '' : 's'} · ${commas(paras)} paragraphs · ${retired} stub${retired === 1 ? '' : 's'} retired`, ''];
  for (const b of books) lines.push(`  • ${b.title || '(untitled)'}${b.author ? ` — ${b.author}` : ''} (${commas(b.paras)} ¶)`);
  if (!books.length) lines.push('  (nothing new landed in this window)');
  lines.push('', 'MISSING-BOOKS QUEUE');
  lines.push(`  with a fetchable source: ${queue.haveSource == null ? '—' : commas(queue.haveSource)}   ← this is the list that drains`);
  lines.push(`  still needing a source:  ${queue.noSource == null ? '—' : commas(queue.noSource)}`);
  lines.push('', 'Grounding is paused for off-peak pricing; ingestion uses the idle window.');
  return lines.join('\n');
}

export function renderIngestDigestHtml({ books, paras, retired, queue }) {
  const row = (b) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(b.title || '(untitled)')}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555">${esc(b.author || '')}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#555">${commas(b.paras)}</td></tr>`;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px">
    <h2 style="margin:0 0 4px">Ingested this hour: ${books.length} document${books.length === 1 ? '' : 's'}</h2>
    <p style="margin:0 0 16px;color:#555">${commas(paras)} paragraphs · ${retired} stub${retired === 1 ? '' : 's'} retired.
      Grounding is paused for off-peak pricing, so ingestion is using the idle window.</p>
    ${books.length ? `<table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="text-align:left;color:#666"><th style="padding:6px 10px">Title</th><th style="padding:6px 10px">Author</th><th style="padding:6px 10px;text-align:right">¶</th></tr></thead>
      <tbody>${books.map(row).join('')}</tbody></table>` : '<p style="color:#777">Nothing new landed in this window.</p>'}
    <h3 style="margin:20px 0 6px">Missing-books queue</h3>
    <p style="margin:0;color:#555">With a fetchable source: <b>${queue.haveSource == null ? '—' : commas(queue.haveSource)}</b> — the list that drains as we convert and import.<br>
      Still needing a source: <b>${queue.noSource == null ? '—' : commas(queue.noSource)}</b></p>
  </div>`;
}

export async function sendIngestDigest(sinceEpoch, deps = {}) {
  const d = await buildIngestDigest(sinceEpoch, deps);
  // Quiet when nothing happened — an hourly "0 books" email trains the reader to ignore the digest.
  if (!d.books.length && !d.retired && !deps.force) return { count: 0, sentTo: null };
  const to = deps.to || process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL;
  if (!to) { logger.warn('ingest digest: no recipient (set DIGEST_EMAIL or SITE_ADMIN_EMAIL)'); return { count: d.books.length, sentTo: null }; }
  const left = d.queue.haveSource == null ? '' : ` — ${commas(d.queue.haveSource)} sourced books left`;
  await (deps.sendEmail || sendEmail)({
    to,
    subject: `SifterSearch ingest: ${d.books.length} document${d.books.length === 1 ? '' : 's'}, ${commas(d.paras)} ¶ this hour${left}`,
    text: renderIngestDigestText(d), html: renderIngestDigestHtml(d),
  });
  logger.info({ to, count: d.books.length, paras: d.paras }, 'ingest digest sent');
  return { count: d.books.length, paras: d.paras, sentTo: to };
}
