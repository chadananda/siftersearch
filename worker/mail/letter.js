// How an Anís letter looks: Markdown → inline-styled email HTML (Georgia body, quoted passages set off, Arabic/Persian
// right-to-left), and the signature every letter carries — the name in large italic Palatino (after Jafar's letters at
// ctai.info) over "AI Research Assistant for Ocean 2.0". Whatever sign-off the writer produced is replaced by it. Pure.
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

/** Markdown → the letter body, styled inline (mail clients ignore stylesheets). */
export function bodyHtml(md) {
  return marked.parse(String(md || ''), { async: false })
    .replace(/<p>/g, '<p dir="auto" style="margin:0 0 14px">')
    .replace(/<blockquote>/g, `<blockquote style="margin:16px 0;padding:2px 0 2px 18px;border-left:2px solid ${RULE};color:#3f3a34">`)
    .replace(/<a href=/g, `<a style="color:${SEA};text-decoration:none;border-bottom:1px solid ${SEA}66" href=`)
    .replace(/<li>/g, '<li dir="auto" style="margin:0 0 6px">');
}

export const wrapHtml = (inner) => `<div style="font-family:Georgia,'Times New Roman',serif;color:${INK};font-size:16.5px;line-height:1.65;max-width:40em">${inner}</div>`;

/** The whole letter as sent: body, signature, then the small footer (pause link). */
export function composeLetter(md, pauseUrl) {
  const body = stripSignOff(md);
  const text = `${body}\n\n${signatureText()}\n\n—\nRather not hear from me? ${pauseUrl}`;
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
