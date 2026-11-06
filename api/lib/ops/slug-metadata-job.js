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
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʻʼ'`]/g, '').toLowerCase();
// title pages and bylines spell the Central Figures every way ('Bahaullah', 'BAHA'U'LLAH'); the library spells them one way
const FIGURES = { bahaullah: 'Bahá’u’lláh', abdulbaha: '‘Abdu’l-Bahá', thebab: 'The Báb', bab: 'The Báb', shoghieffendi: 'Shoghi Effendi' };
export const figureName = (a) => FIGURES[fold(a).replace(/[^a-z]/g, '')] || a;
const GENERIC = new Set(['pdf', 'book', 'books', 'text', 'texts', 'volume', 'vol', 'part', 'issue', 'page', 'edition', 'ocr', 'english']);
/** The file name was made from the real title: a proposed title sharing none of its words ('memoriam_bw_12' → 'The Baha'i World, Volume XI') is a different text. */
export const sharesFileWord = (file, title) => {
  const words = fold(file).split(/[^a-z]+/).filter((w) => w.length >= 4 && !GENERIC.has(w));
  const t = fold(title);
  return !words.length || words.some((w) => t.includes(w));
};
/** A title that is a file name ('holley_modern_social_religion', '1920-03-06,%20Thomas%20W%20Fleming…'), not a title. */
export const fileTitle = (t) => isFilenameTitle(t) || /%20|_/.test(String(t || ''));
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'de', 'la', 'le', 'des', 'du', 'et']);
/** Title pages print in capitals: 'THE MODERN SOCIAL RELIGION' → 'The Modern Social Religion'. Mixed case is left alone. */
export const unshout = (s) => (!s || /\p{Ll}/u.test(s) ? s : s.toLowerCase().split(' ')
  .map((w, i) => (i && SMALL.has(w) ? w : w.replace(/(^|[-'’‘(])(\p{L})/gu, (_, a, c) => a + c.toUpperCase()))).join(' '));

const ASK = (title, author, text) => `A library document was imported with metadata taken from its FILE NAME: title "${title}", author "${author}".
Read the beginning of its text and give the metadata the document itself prints (title page, masthead, byline, heading).
- title: the work's printed title in title case (a newspaper page: "<Newspaper>, <date>"; an article: the article's headline).
- author: the person(s) or body the document names as author/editor; null when it names none. Never derive it from the file name.
- kind: book | article | newspaper | periodical | thesis | other. publication: the newspaper/periodical/journal name, else null.
Reply with JSON only: {"title":"…","author":"…"|null,"kind":"…","publication":"…"|null,"printed":true|false}

${text}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** What a newspaper file name says for certain: the issue date, the page, the series, and a clipping's column/headline. */
export const issueOf = (file) => {
  const f = decodeURIComponent(String(file || '').replace(/%(?![0-9a-f]{2})/gi, '%25'));
  const d = f.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!d || +d[2] < 1 || +d[2] > 12) return null;
  const page = f.match(/(?:_p|seq-)(\d+)\s*$/)?.[1] || null;
  const after = f.slice(d.index + 10).replace(/^[,\s]+/, '');
  const column = /_/.test(after) && !page ? after.split(' ').pop().replace(/_+/g, ' ').replace(/\s*\.\.\.\s*.*$/, '').trim() : null;
  return { date: `${+d[3]} ${MONTHS[+d[2] - 1]} ${d[1]}`, page, series: column ? 'clip' : fold(f.slice(0, d.index)), column };
};
// a newspaper's issue is named from the file name (the reader misreads dates: '1923-05-05' → 'May 6, 1933'); the reader
// supplies only the publication, voted per series. A page's author is the paper; a clipping's writer is not knowable here.
const NEWS_REVIEW = new Set(['newspaper page', 'author unknown', 'title shares no word with the file name', 'not printed in the text']);
export const settleNewspapers = (props) => {
  const vote = new Map();
  for (const p of props) {
    const iss = p.kind === 'newspaper' && issueOf(p.from.title);
    if (!iss || !p.publication) continue;
    const pub = unshout(p.publication).replace(/\s*\(.*\)\s*$/, '');
    const v = vote.get(iss.series) || new Map(); v.set(pub, (v.get(pub) || 0) + 1); vote.set(iss.series, v);
  }
  for (const p of props) {
    const iss = p.kind === 'newspaper' && issueOf(p.from.title);
    const v = iss && vote.get(iss.series);
    if (!v) continue;
    const pub = [...v].sort((x, y) => y[1] - x[1])[0][0];
    const head = iss.column && (p.title && sharesFileWord(iss.column, p.title) && !p.title.includes(pub) ? p.title : unshout(iss.column));
    p.title = `${head ? `${head}, ` : ''}${pub}, ${iss.date}${iss.page ? `, p. ${iss.page}` : ''}`;
    p.publication = pub;
    p.review = p.review.filter((x) => !NEWS_REVIEW.has(x) && !x.startsWith('author lacks'));
    if (iss.column) { p.author = null; p.review.push('clipping: writer not established (title only)'); } else p.author = pub;
  }
  return props;
};

export async function slugMetadataJob({ scope = 'canonical', limit = 500, ids = null, concurrency = 4 } = {}, deps = {}) {
  const { gaps = () => metadataGaps({ scope, limit: 5000 }), paragraphs = (id) => getParagraphs(id, { proseOnly: false, limit: 40 }), create = roleCreate } = deps;
  const want = ids ? new Set(ids.map(Number)) : null;
  const rows = (await gaps()).filter((r) => (want ? want.has(r.id) : slugAuthor(r.author) || fileTitle(r.title))).slice(0, limit);
  const out = [];
  const one = async (r) => {
    const text = (await paragraphs(r.id).catch(() => [])).map((p) => p.text).join('\n\n').slice(0, 5000);
    const surname = slugSurname(r.author);
    const det = resolveSourceMetadata({ stubTitle: r.title, stubAuthor: r.author, text });
    const needTitle = fileTitle(r.title), needAuthor = slugAuthor(r.author);
    // the byline rule is trusted for the AUTHOR (explicit, surname-corroborated); its title guess is a first short line
    // ('A LITERARY'), so the title page read wins for the title
    const p = { id: r.id, from: { title: r.title, author: r.author }, title: null,
      author: needAuthor && det.author && det.author !== r.author ? det.author : null, source: 'byline', kind: null, publication: null, review: [] };
    if (needTitle || (needAuthor && !p.author)) {
      const res = text.length < 80 ? null : await create('dewey-identify', { max_tokens: 300, temperature: 0, messages: [{ role: 'user', content: ASK(r.title, r.author, text) }] }).catch(() => null);
      const m = String(res?.choices?.[0]?.message?.content || '').match(/\{[\s\S]*\}/);
      let j = null; try { j = m ? JSON.parse(m[0]) : null; } catch { /* unreadable reply → review */ }
      if (j) {
        if (needAuthor && !p.author && j.author) { p.author = j.author; p.source = 'title-page'; }
        if (needTitle) p.title = j.title || det.title || null;
        Object.assign(p, { kind: j.kind || null, publication: j.publication || null });
        if (!j.printed) p.review.push('not printed in the text');
        // a newspaper page carries many articles: whose byline the reader picked is not the page's author
        if (/newspaper/.test(j.kind || '')) p.review.push('newspaper page');
      } else { p.review.push(text.length < 80 ? 'no text' : 'no reply'); if (needTitle) p.title = det.title || null; }
    }
    p.title = unshout(p.title); p.author = unshout(p.author);
    if (p.author) p.author = figureName(p.author);
    if (p.title && !sharesFileWord(r.title, p.title)) p.review.push('title shares no word with the file name');
    if (p.author && surname && !fold(p.author).includes(surname)) p.review.push(`author lacks the locator surname '${surname}'`);
    if (needAuthor && !p.author) p.review.push('author unknown');
    if (needTitle && !p.title) p.review.push('title unknown');
    out.push(p);
  };
  for (let i = 0; i < rows.length; i += concurrency) await Promise.all(rows.slice(i, i + concurrency).map(one));
  settleNewspapers(out);
  out.sort((a, b) => a.id - b.id);
  return { scope, candidates: rows.length, ready: out.filter((p) => !p.review.length).length, review: out.filter((p) => p.review.length).length, proposals: out };
}
