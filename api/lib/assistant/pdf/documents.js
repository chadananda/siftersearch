// Anís document modality (Chad 11-10): a reply → branded PDF (render.js) → R2 under an unguessable key → a download link in
// the reply, and/or a link letter by mail. Mail follows the report rule (deep-report.js): an approval draft in the report
// outbox unless ANIS_REPORT_SEND=direct. Deps: pdf/render.js, storage.js, deep-report.js (outbox, offerStore).
import { randomBytes, createHash } from 'node:crypto';
import { renderPdf } from './render.js';
import { reportOutbox, offerStore } from '../deep-report.js';

export const DOC_TEXT = {
  link: (url) => `Here is your document, ready to print or save: [Download the PDF](${url}).`,
  linkAskEmail: (url) => `Here is your document, ready to print or save: [Download the PDF](${url}). If you would like it emailed too, tell me the address.`,
  emailed: (email, url) => `I have prepared the PDF and will email it to ${email}. You can also [download it here](${url}).`,
  letterLink: (url) => `I have also prepared this letter as a printable PDF: [Download the PDF](${url}).`,
  failed: 'I could not prepare the PDF just now. Please try again in a little while.',
  nothing: 'I do not yet have an answer to put in a document. Ask me the question first, and then ask for it as a PDF.',
};
const slug = (s) => String(s || 'research').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 48) || 'research';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Documents service. Every dependency injectable; defaults = live R2 upload, report outbox, tower mail. */
export const PDF_CACHE_VERSION = 8;   // bump when the print design changes: every cached document re-renders once
// permanent short links (Chad 11-13: "short URLs that work with QR codes"): <base>/<code> → the site Worker reads the map
// anis/s/<code>.json and redirects (worker/short-links.js). A cached work's code comes from its cacheKey, so it outlives re-renders.
export const SHORT_BASE = process.env.ANIS_SHORT_URL || 'https://siftersearch.com/d';
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const shortCode = (bytes) => { let n = BigInt(`0x${Buffer.from(bytes).subarray(0, 8).toString('hex')}`), s = ''; for (let i = 0; i < 8; i++) { s += B62[Number(n % 62n)]; n /= 62n; } return s; };

export function makeDocuments({ render = renderPdf, upload, exists, publicUrl, outbox = reportOutbox(), sendMail, store = offerStore(), mode = process.env.ANIS_REPORT_SEND, siteUrl, shortBase = SHORT_BASE } = {}) {
  const put = async (key, body, contentType = 'application/pdf') => {
    if (upload) return upload(key, body, contentType);
    const s = await import('../../storage.js');
    s.initStorage();
    if (!s.hasCloudStorage()) return null;
    return (await s.uploadFile(key, body, { contentType }))?.url ?? null;
  };
  const cached = async (key) => {
    if (exists) return exists(key);
    const s = await import('../../storage.js');
    s.initStorage();
    return s.hasCloudStorage() && (await s.fileExists(key).catch(() => false)) ? s.getPublicUrl(key) : null;
  };
  // the PDF's own address, known before it is stored (the share QR on its last page, Chad 11-13)
  const urlOf = async (key) => {
    if (publicUrl) return publicUrl(key);
    const s = await import('../../storage.js');
    s.initStorage();
    return s.getPublicUrl(key);
  };
  return {
    /** → { url, key, bytes, title, cached? } or null when it could not be stored. `cacheKey` (same work, same editions) → one stored
     *  document reused by every reader, re-rendered only when PDF_CACHE_VERSION changes. */
    async create({ title, markdown, onlineUrl = null, widgets = [], cacheKey = null, qr = null, running = null }) {
      const key = cacheKey
        ? `anis/pdf/c/${createHash('sha256').update(`${PDF_CACHE_VERSION}|${cacheKey}`).digest('hex').slice(0, 32)}/anis-${slug(title)}.pdf`
        : `anis/pdf/${randomBytes(16).toString('hex')}/anis-${slug(title)}.pdf`;
      const code = shortCode(cacheKey ? createHash('sha256').update(`short|${cacheKey}`).digest() : randomBytes(8));
      const short = shortBase ? `${shortBase}/${code}` : null;
      if (cacheKey) { const hit = await cached(key); if (hit) return { url: short || hit, file_url: hit, key, title, cached: true }; }
      const fileUrl = await urlOf(key).catch(() => null);
      // the map first: the PDF's own share QR carries the short link only once it resolves
      const mapped = short && fileUrl ? await put(`anis/s/${code}.json`, Buffer.from(JSON.stringify({ url: fileUrl, title })), 'application/json').catch(() => null) : null;
      const pdfUrl = mapped ? short : fileUrl;
      const buf = await render({ title, markdown, onlineUrl, widgets, qr, running, pdfUrl, ...(siteUrl ? { siteUrl } : {}) });
      const url = await put(key, buf);
      return url ? { url: mapped ? short : url, file_url: url, key, bytes: buf.length, title } : null;
    },
    /** A mail with the download link: an outbox draft (default) or a direct send. → 'drafted' | 'sent' */
    async email(doc, to) {
      const subject = `Your document: ${doc.title}`.slice(0, 160);
      const text = `Peace be upon you,\n\nThe PDF you asked for is ready: ${doc.url}\n\nAnís, Ocean AI Research Assistant`;
      const html = `<p>Peace be upon you,</p><p>The PDF you asked for is ready: <a href="${esc(doc.url)}">${esc(doc.title)} (PDF)</a></p><p>Anís, Ocean AI Research Assistant</p>`;
      if (mode === 'direct') { await (sendMail ? sendMail({ to, subject, html, text }) : (await import('../../../services/email.js')).sendEmail({ to, subject, html, text })); return 'sent'; }
      await outbox.put({ key: `pdf-${doc.key}-${String(to).toLowerCase()}`, to, subject, html, text });
      return 'drafted';
    },
    remember: (k, doc) => store.set(`pdf:${k}`, doc),
    last: (k) => store.get(`pdf:${k}`),
  };
}
