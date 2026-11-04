// SCRIPTURE REFERENCE (W3; planning/anis-strategies.json A5): Jev said the message gives a chapter-and-verse reference. Code
// PARSES it (Bible / Qur’án / Gita — deterministic, after his decision, never to decide intent), finds the book and the chapter
// section, and the verse where the edition marks one (KJV: a "(verse N)" marker in `context`; Pickthall's Qur’án: one verse per paragraph, by the
// verse table in numbering.js); where it marks none (Yusuf Ali,
// the Gita) the chapter is given and the place is labelled approximate. Numbered Bahá’í references ("Gleanings 27") are the
// lookups fast path (lookup.js). Deps (injectable via ctx.deps): docs-repo listDocs, sections-repo sectionsOfDoc/findSections,
// paragraphs-repo paragraphsInRange, work-request findTitled, hit-links withLinks.
import { NO_LOG } from './decision-log.js';
import { run as runTool } from './tools.js';
import { PICKTHALL, layoutTotal, quranRange } from './numbering.js';

export const KJV = 'The Bible (KJV)';
const BIBLE = {
  gen: 'Genesis', genesis: 'Genesis', ex: 'Exodus', exod: 'Exodus', exodus: 'Exodus', lev: 'Leviticus', leviticus: 'Leviticus', num: 'Numbers', numbers: 'Numbers',
  deut: 'Deuteronomy', dt: 'Deuteronomy', deuteronomy: 'Deuteronomy', josh: 'Joshua', joshua: 'Joshua', judg: 'Judges', judges: 'Judges', ruth: 'Ruth',
  '1sam': '1 Samuel', '1samuel': '1 Samuel', '2sam': '2 Samuel', '2samuel': '2 Samuel', '1kgs': '1 Kings', '1kings': '1 Kings', '2kgs': '2 Kings', '2kings': '2 Kings',
  '1chr': '1 Chronicles', '1chronicles': '1 Chronicles', '2chr': '2 Chronicles', '2chronicles': '2 Chronicles', ezra: 'Ezra', neh: 'Nehemiah', nehemiah: 'Nehemiah',
  esth: 'Esther', esther: 'Esther', job: 'Job', ps: 'Psalms', psa: 'Psalms', psalm: 'Psalms', psalms: 'Psalms', prov: 'Proverbs', proverbs: 'Proverbs',
  eccl: 'Ecclesiastes', ecclesiastes: 'Ecclesiastes', song: 'The Song of Solomon', songofsolomon: 'The Song of Solomon', songofsongs: 'The Song of Solomon', canticles: 'The Song of Solomon',
  isa: 'Isaiah', isaiah: 'Isaiah', jer: 'Jeremiah', jeremiah: 'Jeremiah', lam: 'Lamentations', lamentations: 'Lamentations', ezek: 'Ezekiel', ezekiel: 'Ezekiel',
  dan: 'Daniel', daniel: 'Daniel', hos: 'Hosea', hosea: 'Hosea', joel: 'Joel', amos: 'Amos', obad: 'Obadiah', obadiah: 'Obadiah', jonah: 'Jonah', mic: 'Micah', micah: 'Micah',
  nah: 'Nahum', nahum: 'Nahum', hab: 'Habakkuk', habakkuk: 'Habakkuk', zeph: 'Zephaniah', zephaniah: 'Zephaniah', hag: 'Haggai', haggai: 'Haggai', zech: 'Zechariah', zechariah: 'Zechariah', mal: 'Malachi', malachi: 'Malachi',
  matt: 'The Gospel of Matthew', mt: 'The Gospel of Matthew', matthew: 'The Gospel of Matthew', mark: 'The Gospel of Mark', mk: 'The Gospel of Mark', luke: 'The Gospel of Luke', lk: 'The Gospel of Luke',
  john: 'The Gospel of John', jn: 'The Gospel of John', acts: 'The Acts of the Apostles', rom: 'Romans', romans: 'Romans', '1cor': '1 Corinthians', '1corinthians': '1 Corinthians',
  '2cor': '2 Corinthians', '2corinthians': '2 Corinthians', gal: 'Galatians', galatians: 'Galatians', eph: 'Ephesians', ephesians: 'Ephesians', phil: 'Philippians', philippians: 'Philippians',
  col: 'Colossians', colossians: 'Colossians', '1thess': '1 Thessalonians', '1thessalonians': '1 Thessalonians', '2thess': '2 Thessalonians', '2thessalonians': '2 Thessalonians',
  '1tim': '1 Timothy', '1timothy': '1 Timothy', '2tim': '2 Timothy', '2timothy': '2 Timothy', titus: 'Titus', phlm: 'Philemon', philemon: 'Philemon', heb: 'Hebrews', hebrews: 'Hebrews',
  jas: 'James', james: 'James', '1pet': '1 Peter', '1peter': '1 Peter', '2pet': '2 Peter', '2peter': '2 Peter', '1john': '1 John', '1jn': '1 John', '2john': '2 John', '3john': '3 John',
  jude: 'Jude', rev: 'Revelation', revelation: 'Revelation', revelations: 'Revelation', apocalypse: 'Revelation',
};
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

export const roman = (n) => { const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s; };

/** "John 3:16", "1 Cor. 13:4-7", "Qur’án 2:255", "Sura 24", "Bhagavad Gita 2:47", "Gita chapter 2" → a reference, or null. Pure. */
export function parseScriptureRef(text) {
  const t = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[“”"‘’']/g, '').trim();   // Qur’án → Quran, Gītā → Gita
  const q = /\b(?:qur['’]?[aā]n|quran|koran|s[uūú]rah?|surih)\s*(?:chapter\s*)?(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?/i.exec(t);
  if (q) return { kind: 'quran', sura: +q[1], verse: q[2] ? +q[2] : null, verseEnd: q[3] ? +q[3] : null, label: `Qur’án ${q[1]}${q[2] ? `:${q[2]}${q[3] ? `–${q[3]}` : ''}` : ''}` };
  const g = /\b(?:bhagavad[\s-]*g[iī]t[aā]|g[iī]t[aā])\s*(?:chapter|ch\.?)?\s*(\d{1,2})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?/i.exec(t);
  if (g) return { kind: 'gita', chapter: +g[1], verse: g[2] ? +g[2] : null, verseEnd: g[3] ? +g[3] : null, label: `Bhagavad Gita ${g[1]}${g[2] ? `:${g[2]}${g[3] ? `–${g[3]}` : ''}` : ''}` };
  const b = /\b((?:[123]\s*)?[A-Za-z]{2,}(?:\s+of\s+[A-Za-z]+)?)\.?\s+(?:chapter\s+)?(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?\b/i.exec(t);
  if (b) {
    const key = fold(b[1].replace(/^(?:the\s+)?(?:gospel\s+of|book\s+of|epistle\s+to\s+the)\s+/i, '').replace(/^(?:the\s+)/i, ''));
    const book = BIBLE[key] || BIBLE[key.replace(/^(?:gospelof|bookof)/, '')];
    if (book) return { kind: 'bible', book, chapter: +b[2], verse: b[3] ? +b[3] : null, verseEnd: b[4] ? +b[4] : null, label: `${book} ${b[2]}${b[3] ? `:${b[3]}${b[4] ? `–${b[4]}` : ''}` : ''}` };
  }
  return null;
}

/** The verse marker of a KJV row: "Chapter 2 (verse 14)" / "(verse 15–17)" → [from, to] or null. Pure. */
export const verseSpan = (row) => { const m = /\(verses?\s+(\d+)(?:\s*[–-]\s*(\d+))?\)/i.exec(String(row?.context || '')); return m ? [+m[1], +(m[2] || m[1])] : null; };

/** Rows of a chapter → the rows holding the verse(s): exact where marked, else approximate by position (labelled). Pure. */
const WHOLE_MAX = 60;   // rows of a whole chapter given to the writer
export function verseRows(rows, verse, verseEnd = null) {
  if (!rows.length) return { rows: [], exact: false };
  if (verse == null) return { rows: rows.slice(0, WHOLE_MAX), exact: true, whole: true };   // a whole chapter is served whole (Psalm 23; W3 11-03)
  const to = verseEnd ?? verse;
  const marked = rows.filter((r) => { const s = verseSpan(r); return s && s[1] >= verse && s[0] <= to; });
  if (marked.length) return { rows: marked, exact: true };
  if (rows.some(verseSpan)) return { rows: [], exact: true };   // the edition marks verses and has no such verse
  const last = verseSpan(rows[rows.length - 1]);
  const total = last ? last[1] : rows.length;
  const at = (v) => Math.min(rows.length - 1, Math.max(0, Math.round(((v - 1) / Math.max(total, 1)) * rows.length)));
  // every verse asked for plus one line either side (W3 11-03: Isaiah 11:6-9 got only the place of verse 6 ± 1)
  return { rows: rows.slice(Math.max(0, at(verse) - 1), at(to) + 2), exact: false };
}

export const REFERENCE_HOW = (ref, exact) => `The reader gave the reference ${ref.label}. Quote the passage VERBATIM from the passages (name the translation: the King James Bible, Pickthall's or Yusuf Ali's Qur’án, the Gita's translator), with its link; one line of context at most. ${exact ? '' : 'This edition does not number the verses: say the chapter is given and the lines quoted are the APPROXIMATE place of the verse asked for.'}${ref.whole ? ' The whole chapter was asked for: quote the whole chapter, every line of the passages in order (a very long chapter: as much as the passages hold, then the link to read on).' : ''}`.trim();

const hit = (r, doc, theme) => ({ id: r.id, text: r.text, title: doc.title || doc.book, author: doc.author, document_id: doc.id ?? doc.doc_id, paragraph_index: r.paragraph_index,
  religion: doc.religion ?? null, collection: doc.collection ?? null, language: doc.language ?? null, source_url: r.url || null, theme });

const isHeadingRow = (r) => r.heading || /^\s*#/.test(String(r.text || ''));
/** Qur’án reference → Pickthall's exact verse paragraphs, or null (edition absent, its layout changed, or no such verse). */
async function quranExact(ref, { listDocs, paragraphsInRange, fields, decisions }) {
  const { docs = [] } = await listDocs({ title: PICKTHALL.title, fields: [...fields, 'paragraph_count'], limit: 10, count: false }).catch(() => ({ docs: [] }));
  const want = layoutTotal(PICKTHALL);
  const doc = docs.find((d) => /qur/i.test(d.title || '') && Number(d.paragraph_count) === want) || null;
  const range = doc ? quranRange(PICKTHALL, ref) : null;
  const rows = range ? (await paragraphsInRange(doc.id, range[0], range[1]).catch(() => [])).filter((r) => !isHeadingRow(r) && String(r.text || '').trim()) : [];
  decisions.record('reference:verse-table', { by: 'code', saw: { editions: docs.map((d) => `${d.id}:${d.paragraph_count}`), layout: want, range },
    options: ['exact (verse table)', 'chapter section'], chosen: rows.length ? 'exact (verse table)' : 'chapter section',
    reason: !doc ? 'no Pickthall edition with the expected layout' : !range ? 'no such verse' : rows.length ? `${doc.title} ¶${range[0]}–${range[1]}` : 'no paragraphs at the verse' });
  return rows.length ? { doc, rows } : null;
}

export async function scriptureReference(ctx) {
  const { question, decisions = NO_LOG, deps = {} } = ctx;
  const ref = parseScriptureRef(question);
  decisions.record('reference:parse', { by: 'code', saw: question, options: ['bible', 'quran', 'gita', 'none'], chosen: ref?.kind ?? 'none', reason: ref ? ref.label : 'no chapter-and-verse pattern' });
  if (!ref) return null;
  const listDocs = deps.listDocs || (await import('../docs-repo.js')).listDocs;
  const sectionsOfDoc = deps.sectionsOfDoc || (await import('../repos/sections-repo.js')).sectionsOfDoc;
  const paragraphsInRange = deps.paragraphsInRange || (await import('../paragraphs-repo.js')).paragraphsInRange;
  const withLinks = deps.withLinks || (await import('../hit-links.js')).withLinks;
  const fields = ['id', 'title', 'author', 'religion', 'collection', 'language'];
  let doc = null, section = null, chapter = ref.chapter ?? ref.sura;
  if (ref.kind === 'bible') {
    const { docs = [] } = await listDocs({ collection: KJV, fields, limit: 100, count: false }).catch(() => ({ docs: [] }));
    doc = docs.find((d) => fold(d.title) === fold(ref.book)) || docs.find((d) => fold(d.title).endsWith(fold(ref.book))) || null;
  } else if (ref.kind === 'gita') {
    doc = (await runTool('document_search', { title: 'Bhagavad Gita', min: 0.9 }, { deps }).catch(() => null))?.works?.[0] || null;
  } else {
    // EXACT first: Pickthall numbers one verse per paragraph — the verse table (numbering.js) gives the paragraph, checked
    // against the edition's paragraph_count (launch gate 11-03: the approximate Yusuf Ali place gave Ṭálút for 2:255)
    const exact = await quranExact(ref, { listDocs, paragraphsInRange, fields, decisions });
    if (exact) {
      const linked = await withLinks(exact.rows.map((r) => ({ id: r.id, doc_id: exact.doc.id, paragraph_index: r.paragraph_index, text: r.text, title: exact.doc.title }))).catch(() => exact.rows);
      const passages = exact.rows.map((r, i) => hit({ ...r, url: linked[i]?.url || null }, exact.doc, ref.label));
      return { passages, plan: { shape: 'reference', ref, exact: true, book: exact.doc.id, section: `Sūra ${ref.sura}` },
        format: { id: 'reference', by: 'strategy:reference', how: REFERENCE_HOW({ ...ref, whole: ref.verse == null }, true) } };
    }
    const findSections = deps.findSections || (await import('../repos/sections-repo.js')).findSections;
    const want = new RegExp(`^s[uūú]ra\\s+${roman(ref.sura)}\\.?$`, 'i');
    const s = (await findSections(`Sūra ${roman(ref.sura)}`, { limit: 30 }).catch(() => [])).find((x) => want.test(x.title) && /qur/i.test(x.book || ''));
    if (s) { section = s; doc = { id: s.doc_id, title: s.book, author: s.author, religion: 'Islam' }; }
  }
  decisions.record('reference:book', { by: 'code', saw: ref.label, chosen: doc ? `${doc.id} ${doc.title}` : null, reason: doc ? null : 'book not in the library' });
  if (!doc) return null;
  if (!section) {
    const sections = await sectionsOfDoc(doc.id).catch(() => []);
    const re = new RegExp(`(?:^|\\s|-)(?:chapter\\s+)?(?:${chapter}|${roman(chapter)})\\.?\\s*(?:[—–:-].*)?$`, 'i');
    section = sections.find((s) => re.test(s.title)) || null;
  }
  decisions.record('reference:chapter', { by: 'code', saw: chapter, chosen: section ? section.title : null, reason: section ? null : 'no such chapter section' });
  if (!section) return null;
  const rows = await paragraphsInRange(doc.id, section.start_index, section.end_index).catch(() => []);
  const v = verseRows(rows.filter((r) => String(r.text || '').trim()), ref.verse, ref.verseEnd);
  decisions.record('reference:verse', { by: 'code', saw: { rows: rows.length, verse: ref.verse, marked: rows.some(verseSpan) }, options: ['exact', 'approximate', 'none'],
    chosen: !v.rows.length ? 'none' : v.exact ? 'exact' : 'approximate', reason: v.exact ? (v.whole ? 'whole chapter' : 'verse marker in context') : 'edition marks no verses' });
  if (!v.rows.length) return null;
  const linked = await withLinks(v.rows.map((r) => ({ id: r.id, doc_id: doc.id, paragraph_index: r.paragraph_index, text: r.text, title: doc.title }))).catch(() => v.rows);
  const passages = v.rows.map((r, i) => hit({ ...r, url: linked[i]?.url || null }, doc, ref.label));
  return { passages, plan: { shape: 'reference', ref, exact: v.exact, book: doc.id, section: section.title }, format: { id: 'reference', by: 'strategy:reference', how: REFERENCE_HOW({ ...ref, whole: v.whole }, v.exact) } };
}
