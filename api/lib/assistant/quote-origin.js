// Quote origin (Chad 11-04, "Religion is the greatest of all means…" named The Bahá'í World vol II as "the fullest"): the copies of
// one passage (lookup.js quoteCandidates, rankOrigins order) → ONE source to name, by the kind of work, never by match strength:
// Shoghi Effendi's translation (a work he translated, his own books quoting it; translator METADATA or his translation list) >
// the author's own work in another translation > an authorized compilation > the House of Justice quoting it > periodicals,
// statements and commentary. + the Tablet's name (a copy's section heading / the original's title), the original-language
// paragraph (alignment link or the stored original), and a short "also quoted in". Deps (injectable): passage-links getPassages
// (translated_by) + resolveLinks (original), paragraphs-repo originalsByIds; source-hunt guardianTranslation/quoteAuthorOf.
import { docType } from '../rights/canonical.js';
import { foldKey } from '../search/doctrinal-rank.js';
import { firstPerson } from '../authorship/reader.js';
import { guardianTranslation, quoteAuthorOf } from '../source-hunt.js';
import { foldVerbatim } from '../search/verbatim.js';

const canon = (n) => firstPerson(n || '') || n || null;
const key = (n) => foldKey(canon(n) || '');
const SE = 'shoghieffendi';
const HOUSE = /universalhouseofjustice|researchdepartment/;
/** Wall budget for the metadata reads (translator, original): late → rank without them, no original. */
export const ORIGIN_MS = 400;

// A periodical, newspaper or statement carrying a writer's words is never their source (The Bahá'í World volumes carry author
// "Bahá'u'lláh" on some excerpts; Star of the West; World Order magazine; BIC statements). Title/shelf/author metadata. Pure.
const PERIODICAL = [/^(?:the )?bah[aá]['’‘]?[ií] world\b(?!\s+faith)/i, /\bstar of the west\b/i, /^world order\b(?!\s+of\b)/i,
  /^(?:the )?bah[aá]['’‘]?[ií] news\b/i, /\bherald of the south\b/i, /\bstatement\b/i, /\bbah[aá]['’‘]?[ií] international community\b/i];
/** A raw file of letters nobody compiled: the same words in any published book or compilation are cited first. */
const UNCOMPILED = /\buncompiled\b/i;
export function isPeriodical(p = {}) {
  const t = String(p.title ?? p.source_title ?? '');
  if (PERIODICAL.some((re) => re.test(t))) return true;
  if (/international community/i.test(String(p.book_author || ''))) return true;
  return ['news', 'newsletter', 'paper'].includes(docType({ title: t, collection: p.collection, author: p.book_author, document_type: p.document_type }));
}

/** Shoghi Effendi's English: a work he translated (his translation list, or translator metadata), or his own book quoting it. */
export const seTranslation = (c, translatedBy = null) => guardianTranslation(c) > 0 || /shoghi effendi/i.test(String(translatedBy || c.translated_by || ''))
  || (key(c.book_author) === SE && key(c.author) !== SE);

/** Kind rank of one copy of the words of `writer` (lower first). Pure.
 *  0 his translation in the author's own work · 1 his own book quoting it · 2 the author's own work, another translation ·
 *  3 an authorized compilation · 4 the House of Justice quoting it · 5 other secondary, and the uncompiled letter files (last
 *  resort — Chad 11-01/11-04: "Man will always have to toil…" named Uncompiled Published Letters over Lights of Guidance) ·
 *  6 periodical / statement. */
export function originRank(c, translatedBy = null) {
  if (isPeriodical(c)) return 6;
  if (UNCOMPILED.test(`${c.title || ''} ${c.collection || ''}`)) return 5;
  const w = key(c.author), b = key(c.book_author) || w;
  const own = w && w === b && c.blocktype !== 'footnote';
  const comp = docType({ title: c.title, collection: c.collection }) === 'compilation';
  if (own && !comp) return seTranslation(c, translatedBy) ? 0 : 2;
  if (b === SE && w !== SE) return 1;
  if (own || comp) return seTranslation(c, translatedBy) ? 0 : 3;
  if (HOUSE.test(b)) return 4;
  return 5;
}
export const RANK_NAME = ['guardian-translation', 'guardian-quoting', 'own-work', 'compilation', 'house-quoting', 'secondary', 'periodical'];

// the Tablet a copy sits under: its section heading's last part, when it is not the book itself or a bare number
const tabletOf = (c) => {
  const h = String(c.heading || '').split(/\s*(?:>|›|»|\/|\|)\s*/).map((s) => s.replace(/^#+\s*/, '').trim()).filter(Boolean).pop() || '';
  return h && h.length <= 120 && !/^[\divxlcdm.\s]+$/i.test(h) && foldKey(h) !== foldKey(c.title || '') ? h : null;
};
const timed = (p, ms) => Promise.race([Promise.resolve(p).catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);

async function defaultDeps() {
  const links = await import('../passage-links.js');
  const repo = await import('../paragraphs-repo.js');
  return {
    translatorsOf: async (ids) => new Map([...(await links.getPassages(ids))].map(([id, p]) => [Number(id), p.translated_by || null])),
    originalsOf: async (ids) => {
      const [l, stored] = await Promise.all([links.resolveLinks(ids, { quotedBy: false }).catch(() => new Map()), repo.originalsByIds(ids).catch(() => new Map())]);
      const out = new Map();
      for (const id of ids) {
        const o = l.get(Number(id))?.original;
        if (o?.text) out.set(Number(id), { text: o.text, language: o.language, title: o.document?.title || null, author: o.document?.author || null,
          url: o.url || o.readerUrl || null, document_id: o.documentId, paragraph_index: o.paragraphIndex, id: o.id });
        else if (stored.get(Number(id))?.original) out.set(Number(id), { text: stored.get(Number(id)).original, language: stored.get(Number(id)).lang, title: null, stored: true });
      }
      return out;
    },
  };
}

/**
 * The origin of quoted words among the passages holding them (rankOrigins order in). deps: { phrase (exact holders lead a rank),
 * translatorsOf(ids) → Map id→name,
 * originalsOf(ids) → Map id→{ text, language, title, url, … } } — null to skip (tests), omitted → the library's.
 * → { source, rank, kind, writer, tablet, original, sourceOriginal, alsoIn: [passage], passages: [source, …alsoIn], secondaryOnly }
 *   or null (no passages).
 */
export async function traceQuote(passages, deps = {}) {
  const list = (passages || []).filter(Boolean);
  if (!list.length) return null;
  const need = deps.translatorsOf === undefined || deps.originalsOf === undefined ? await defaultDeps().catch(() => ({})) : {};
  const translatorsOf = deps.translatorsOf === undefined ? need.translatorsOf : deps.translatorsOf;
  const originalsOf = deps.originalsOf === undefined ? need.originalsOf : deps.originalsOf;
  const ids = list.map((p) => Number(p.id)).filter(Number.isFinite);
  const ms = deps.ms ?? ORIGIN_MS;
  const want = deps.phrase ? foldVerbatim(deps.phrase) : '';
  const holdsExact = (p) => (want && foldVerbatim(p.text || '').includes(want) ? 1 : 0);
  const [tr, origs] = await Promise.all([translatorsOf && ids.length ? timed(translatorsOf(ids), ms) : null, originalsOf && ids.length ? timed(originalsOf(ids), ms) : null]);
  // whose words: the vote over the copies (a writer credited 2, a quoted name 1); the words' copies are that writer's paragraphs
  const writer = quoteAuthorOf(list.map((p) => ({ writer: p.author, authors: p.authors }))) || canon(list[0].author);
  const ranked = list.map((p, i) => ({ p, i, rank: originRank(p, tr?.get(Number(p.id)) || null), copy: key(p.author) === key(writer) }))
    .sort((a, b) => (b.copy - a.copy) || (a.rank - b.rank) || (holdsExact(b.p) - holdsExact(a.p)) || (a.i - b.i));
  const best = ranked[0];
  const source = best.p;
  // the Tablet's name: the source's own heading, else a copy in the author's own works (a Tablets volume heads each Tablet)
  const tablet = [best, ...ranked.filter((x) => x.copy && x.rank <= 3 && x !== best)].map((x) => tabletOf(x.p)).find(Boolean) || null;
  // the original: aligned to the source, else to another copy in the author's own work (same words, same Tablet)
  const origOf = (x) => { const o = origs?.get(Number(x.p.id)); return o?.text && !/^en/i.test(String(o.language || '')) ? o : null; };
  const withOrig = [best, ...ranked.filter((x) => x.copy && x.rank <= 3 && x !== best)].find(origOf);
  const original = withOrig ? { ...origOf(withOrig), of: withOrig.p.id } : null;
  // also quoted in: the other works (one per title), the House and the Guardian first; periodicals only when nothing else
  const seen = new Set([foldKey(source.title || '')]);
  const others = ranked.slice(1).filter((x) => { const k = foldKey(x.p.title || ''); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  const alsoIn = (others.some((x) => x.rank < 6) ? others.filter((x) => x.rank < 6) : others).slice(0, 3).map((x) => x.p);
  return { source, rank: best.rank, kind: RANK_NAME[best.rank], writer, tablet: tablet || (original?.title && !original.stored ? original.title : null),
    translatedBy: best.rank <= 1 ? 'Shoghi Effendi' : (tr?.get(Number(source.id)) || null), original, alsoIn, passages: [source, ...alsoIn],
    secondaryOnly: !best.copy || best.rank >= 4 };
}

/** The writer's instructions for a traced quotation: who, which work (the Tablet), the translation, the original, also quoted in.
 *  Titles are given for the writer to italicise (code links them); no process talk, no authority claims. Pure. */
export function quoteSourceHow(o) {
  if (!o?.source) return '';
  const work = o.source.title;
  if (o.secondaryOnly) {
    return [`The library holds these words only as quoted in *${work}*${o.source.book_author ? ` (${o.source.book_author})` : ''}.`,
      `Say in one or two sentences where they are quoted, quoting them from that passage, and that the work they originally come from was not found in the library — never name a work from memory.`,
      'Never mention search or search results, and never add a claim about anyone\'s authority in quoting them.'].join(' ');
  }
  const se = o.rank <= 1;
  const via = o.rank === 1 ? `as Shoghi Effendi quotes them in his *${work}*` : `in *${work}*`;
  return [
    `These are the words of ${o.writer}${o.tablet ? `, from the Tablet ${o.tablet}` : ''}. Open by saying so in one sentence, naming ${o.tablet ? 'the Tablet and ' : ''}the work, linked: ${via}.`,
    se ? 'Say plainly that the English is Shoghi Effendi\'s translation.' : o.translatedBy ? `The English is the translation of ${o.translatedBy}.` : '',
    'Quote the words exactly from that first passage.',
    o.original ? `Then give the original ${/^fa|pers/i.test(String(o.original.language || '')) ? 'Persian' : /^ar/i.test(String(o.original.language || '')) ? 'Arabic' : 'original-language'} line that corresponds, exactly as it stands in the passage marked (original), in its own script.` : '',
    o.alsoIn.length ? `Then, in one short sentence, say they are also quoted in ${o.alsoIn.map((p) => `*${p.title}*`).join(', ')} — no more about those works.` : '',
    'Never call a periodical, statement or a work that quotes the words their source; never mention search or search results; never add a claim about the authority of anyone who quotes them.',
  ].filter(Boolean).join(' ');
}
