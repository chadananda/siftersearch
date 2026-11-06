// slug-metadata ops report — books whose title/author are file locators ('pdf-h-holley' / 'holley_modern_social_religion',
// the 08-13 bahai-library.com PDF batch) get the title + author their own opening pages print. Byline rule first (free,
// source-metadata.js); else the 'dewey-identify' role reads the title page. An author must carry the locator's surname
// when there is one, or the row is flagged for review. Read-only proposals; params { scope, limit, ids?, concurrency }
import { metadataGaps, getParagraphs } from '../docs-repo.js';
import { roleCreate } from '../role-client.js';
import { resolveSourceMetadata, isLocatorAuthor, isFilenameTitle, locatorSurname } from '../text/source-metadata.js';

const SLUG = /^[a-z][a-z0-9-]*$/;
export const slugAuthor = (a) => SLUG.test(String(a || '')) || isLocatorAuthor(a);
/** The surname a slug carries: 'pdf-h-holley' → 'holley', 'bayat' → 'bayat'; none for slugs that are not names. */
const NOT_NAMES = new Set(['newspaper', 'compilation', 'anonymous', 'events', 'appreciations', 'bahai', 'abs', 'uhj', 'nypl', 'wellspring']);
export const slugSurname = (a) => {
  const s = String(a || '');
  if (/^(pdf|doc|html?)-/.test(s)) { const x = locatorSurname(s); return x && !/^(compilations?|bahai|irfancolloquia|handscause|journal)\b/.test(x) ? x.split(' ')[0] : null; }
  return SLUG.test(s) && !NOT_NAMES.has(s) && !s.includes('-') ? s : null;
};
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ASK = (title, author, text) => `A library document was imported with metadata taken from its FILE NAME: title "${title}", author "${author}".
Read the beginning of its text and give the metadata the document itself prints (title page, masthead, byline, heading).
- title: the work's printed title in title case (a newspaper page: "<Newspaper>, <date>"; an article: the article's headline).
- author: the person(s) or body the document names as author/editor; null when it names none. Never derive it from the file name.
- kind: book | article | newspaper | periodical | thesis | other. publication: the newspaper/periodical/journal name, else null.
Reply with JSON only: {"title":"…","author":"…"|null,"kind":"…","publication":"…"|null,"printed":true|false}

${text}`;

export async function slugMetadataJob({ scope = 'canonical', limit = 500, ids = null, concurrency = 4 } = {}, deps = {}) {
  const { gaps = () => metadataGaps({ scope, limit: 5000 }), paragraphs = (id) => getParagraphs(id, { proseOnly: false, limit: 40 }), create = roleCreate } = deps;
  const want = ids ? new Set(ids.map(Number)) : null;
  const rows = (await gaps()).filter((r) => (want ? want.has(r.id) : slugAuthor(r.author) || isFilenameTitle(r.title))).slice(0, limit);
  const out = [];
  const one = async (r) => {
    const text = (await paragraphs(r.id).catch(() => [])).map((p) => p.text).join('\n\n').slice(0, 5000);
    const surname = slugSurname(r.author);
    const det = resolveSourceMetadata({ stubTitle: r.title, stubAuthor: r.author, text });
    const p = { id: r.id, from: { title: r.title, author: r.author }, title: det.title !== r.title ? det.title : null,
      author: det.author !== r.author ? det.author : null, source: 'byline', kind: null, publication: null, review: [] };
    if (!p.title || !p.author) {
      const res = text.length < 80 ? null : await create('dewey-identify', { max_tokens: 300, temperature: 0, messages: [{ role: 'user', content: ASK(r.title, r.author, text) }] }).catch(() => null);
      const m = String(res?.choices?.[0]?.message?.content || '').match(/\{[\s\S]*\}/);
      let j = null; try { j = m ? JSON.parse(m[0]) : null; } catch { /* unreadable reply → review */ }
      if (j) {
        if (!p.author && j.author) { p.author = j.author; p.source = 'title-page'; }
        if (!p.title && j.title) { p.title = j.title; p.source = 'title-page'; }
        Object.assign(p, { kind: j.kind || null, publication: j.publication || null });
        if (!j.printed) p.review.push('not printed in the text');
      } else p.review.push(text.length < 80 ? 'no text' : 'no reply');
    }
    if (p.author && surname && !fold(p.author).includes(surname)) p.review.push(`author lacks the locator surname '${surname}'`);
    if (!p.author) p.review.push('author unknown');
    if (!p.title) p.review.push('title unknown');
    out.push(p);
  };
  for (let i = 0; i < rows.length; i += concurrency) await Promise.all(rows.slice(i, i + concurrency).map(one));
  out.sort((a, b) => a.id - b.id);
  return { scope, candidates: rows.length, ready: out.filter((p) => !p.review.length).length, review: out.filter((p) => p.review.length).length, proposals: out };
}
