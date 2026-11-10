// Anís document modality (Chad 11-10): a reply → branded PDF (render.js) → R2 under an unguessable key → a download link in
// the reply, and/or a link letter by mail. Mail follows the report rule (deep-report.js): an approval draft in the report
// outbox unless ANIS_REPORT_SEND=direct. Deps: pdf/render.js, storage.js, deep-report.js (outbox, offerStore).
import { randomBytes } from 'node:crypto';
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
export function makeDocuments({ render = renderPdf, upload, outbox = reportOutbox(), sendMail, store = offerStore(), mode = process.env.ANIS_REPORT_SEND, siteUrl } = {}) {
  const put = async (key, body) => {
    if (upload) return upload(key, body);
    const s = await import('../../storage.js');
    s.initStorage();
    if (!s.hasCloudStorage()) return null;
    return (await s.uploadFile(key, body, { contentType: 'application/pdf' }))?.url ?? null;
  };
  return {
    /** → { url, key, bytes, title } or null when it could not be stored. */
    async create({ title, markdown, onlineUrl = null }) {
      const buf = await render({ title, markdown, onlineUrl, ...(siteUrl ? { siteUrl } : {}) });
      const key = `anis/pdf/${randomBytes(16).toString('hex')}/anis-${slug(title)}.pdf`;
      const url = await put(key, buf);
      return url ? { url, key, bytes: buf.length, title } : null;
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
