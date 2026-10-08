// How an Anís letter looks: Markdown → inline-styled email HTML (Georgia body, quoted passages set off, Arabic/Persian
// right-to-left), and the signature every letter carries — the name in large italic Palatino (after Jafar's letters at
// ctai.info) over "AI Research Assistant for Ocean 2.0". Whatever sign-off the writer produced is replaced by it.
// Tables are styled; ```chart blocks become bar charts (HTML) and block-character bars (plain text). Pure.
import { marked } from 'marked';

const INK = '#2b2621', SEA = '#1f6f8b', MIST = '#8fa3ab', RULE = '#a9cbd6';
export const SIGN_NAME = 'Anís';
export const SIGN_TITLE = 'AI Research Assistant for Ocean 2.0';

/** Drop a trailing sign-off name ("Anís", "— Anis", "Ocean AI Research Assistant"…); keep "Warmly," and the like. */
export function stripSignOff(text) {
  const lines = String(text || '').replace(/\s+$/, '').split('\n');
  while (lines.length && /^\s*(?:[—–-]\s*)?(?:an[ií]s\b.*|(?:ocean\s+)?ai research assistant\b.*|anis@oceanlibrary\.com)\s*$/i.test(lines.at(-1))) lines.pop();
  return lines.join('\n').replace(/\s+$/, '');
}

export const signatureText = () => `— ${SIGN_NAME}\n${SIGN_TITLE}`;
export const signatureHtml = () =>
  `<p style="margin:22px 0 2px;font-family:'Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif;font-style:italic;font-size:24px;color:${SEA}">— ${SIGN_NAME}</p>` +
  `<p style="margin:0;font-size:12.5px;letter-spacing:.02em;color:${MIST}">${SIGN_TITLE}</p>`;

// ── charts: a fenced ```chart block holding {"title"?, "bars":[{"label","value"}], "unit"?} becomes a bar chart drawn
// with table cells — the one chart form every mail client shows (Gmail strips SVG and blocks remote images by default).
const CHART_RE = /```chart\s*\n([\s\S]*?)\n```/g;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function parseChart(src) {
  try {
    const c = JSON.parse(src);
    const bars = (c.bars || []).filter((b) => b && b.label != null && Number.isFinite(Number(b.value))).slice(0, 24);
    return bars.length ? { title: c.title || '', unit: c.unit || '', bars: bars.map((b) => ({ label: String(b.label), value: Number(b.value) })) } : null;
  } catch { return null; }
}
export function chartHtml(c) {
  const max = Math.max(...c.bars.map((b) => b.value), 1);
  const rows = c.bars.map((b) => `<tr><td dir="auto" style="padding:3px 12px 3px 0;white-space:nowrap;vertical-align:middle">${esc(b.label)}</td>` +
    `<td style="width:100%;vertical-align:middle"><div style="background:${SEA};height:14px;border-radius:2px;width:${Math.max(1, Math.round((100 * b.value) / max))}%"></div></td>` +
    `<td style="padding:3px 0 3px 10px;text-align:right;white-space:nowrap;color:#55606a">${esc(b.value)}${c.unit ? ` ${esc(c.unit)}` : ''}</td></tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:14.5px;width:100%;max-width:34em">` +
    (c.title ? `<caption style="text-align:left;padding:0 0 6px;font-weight:bold;color:${INK}">${esc(c.title)}</caption>` : '') + `${rows}</table>`;
}
export function chartText(c) {
  const max = Math.max(...c.bars.map((b) => b.value), 1);
  const w = Math.max(...c.bars.map((b) => b.label.length));
  return [c.title, ...c.bars.map((b) => `${b.label.padEnd(w)}  ${'█'.repeat(Math.max(1, Math.round((20 * b.value) / max)))} ${b.value}${c.unit ? ` ${c.unit}` : ''}`)]
    .filter(Boolean).join('\n');
}
/** The plain-text letter: charts drawn with block characters. */
export const plainText = (md) => String(md || '').replace(CHART_RE, (m, src) => { const c = parseChart(src); return c ? chartText(c) : m; });

/** Markdown → the letter body, styled inline (mail clients ignore stylesheets). Tables get rules and padding. */
export function bodyHtml(md) {
  const charts = [];
  const withSlots = String(md || '').replace(CHART_RE, (m, src) => { const c = parseChart(src); if (!c) return m; charts.push(chartHtml(c)); return `\n\n@@CHART${charts.length - 1}@@\n\n`; });
  return marked.parse(withSlots, { async: false })
    .replace(/<p>/g, '<p dir="auto" style="margin:0 0 14px">')
    .replace(/<blockquote>/g, `<blockquote style="margin:16px 0;padding:2px 0 2px 18px;border-left:2px solid ${RULE};color:#3f3a34">`)
    .replace(/<a href=/g, `<a style="color:${SEA};text-decoration:none;border-bottom:1px solid ${SEA}66" href=`)
    .replace(/<li>/g, '<li dir="auto" style="margin:0 0 6px">')
    .replace(/<table>/g, '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:15px">')
    .replace(/<th(\s[^>]*)?>/g, (m, a = '') => `<th${a} dir="auto" style="text-align:left;padding:6px 14px 6px 0;border-bottom:1px solid ${RULE};color:${SEA};vertical-align:bottom">`)
    .replace(/<td(\s[^>]*)?>/g, (m, a = '') => `<td${a} dir="auto" style="padding:6px 14px 6px 0;border-bottom:1px solid #e3ebee;vertical-align:top">`)
    .replace(/<p dir="auto" style="[^"]*">@@CHART(\d+)@@<\/p>/g, (m, i) => charts[Number(i)]);   // charts last: they carry their own styles
}

export const wrapHtml = (inner) => `<div style="font-family:Georgia,'Times New Roman',serif;color:${INK};font-size:16.5px;line-height:1.65;max-width:40em">${inner}</div>`;

/** The whole letter as sent: body, signature, then the small footer (pause link). */
export function composeLetter(md, pauseUrl) {
  const body = stripSignOff(md);
  const text = `${plainText(body)}\n\n${signatureText()}\n\n—\nRather not hear from me? ${pauseUrl}`;
  const html = wrapHtml(`${bodyHtml(body)}${signatureHtml()}<p style="margin:28px 0 0;font-size:12px;color:${MIST}"><a href="${pauseUrl}" style="color:${MIST}">Rather not hear from me?</a></p>`);
  return { text, html };
}

/** An Anís letter's middle, to set inside another letter: its salutation ("Dear friend,") and closing ("Warmly, Anís")
 *  removed. */
export function answerBody(md) {
  const lines = stripSignOff(md).split('\n');
  if (/^\s*(dear|hello|hi|greetings|salaam|peace)\b[^\n]{0,60}[,!]?\s*$/i.test(lines[0] || '')) lines.shift();
  while (lines.length && (/^\s*$/.test(lines.at(-1)) || /^\s*(warmly|warm regards|with warm regards|with love|yours|kind regards|best|blessings|in friendship)[^\n]{0,30}[,.]?\s*$/i.test(lines.at(-1)))) lines.pop();
  return lines.join('\n').trim();
}
