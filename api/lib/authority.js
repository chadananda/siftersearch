/**
 * Authority Configuration from Library Metadata
 *
 * Reads doctrinal weight values from the library's meta.yaml files:
 * - .religion/meta.yaml - Religion-level defaults
 * - .collection/meta.yaml - Collection-level defaults
 *
 * Priority order:
 * 1. Document's explicit `authority` field (frontmatter override)
 * 2. Author-based authority (Central Figures, scripture authors — exact match)
 * 3. Title-pattern authority (primary scriptures with Unknown/compound authors)
 * 4. Collection's meta.yaml authority (librarian override)
 * 5. Religion's meta.yaml authority
 * 6. External-site authority_default
 * 7. Global default (5)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { join } from 'path';
import { config } from './config.js';
import { norm, WRITER_RE } from './rights/canonical.js';

// Cache for authority values from library meta.yaml files
let libraryAuthority = null;
let lastLoadTime = 0;

// Returned when the library has never been scanned successfully — no basePath
// configured, or the directory is not mounted. Every caller dereferences
// .collectionMeta / .collections straight away, so handing back null crashed
// ingestion with an opaque TypeError instead of falling back to defaults.
// Not cached: leaving libraryAuthority null means the next call retries the scan.
const EMPTY_AUTHORITY = Object.freeze({
  religions: {},
  collections: {},
  religionMeta: {},
  collectionMeta: {},
});
let backgroundRefreshPending = false;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — library structure changes rarely

// Author-based authority defaults — used when no title pattern or collection override matches.
// These are DEFAULTS, not overrides: collection meta.yaml and title patterns take priority.
// Matched by exact equality — avoids false positives like "Muhammad Husayn Tabatabai"
// matching the prophet "Muhammad" or "John Calvin" matching the apostle "John".
// OceanLibrary stores individual book authors as the canonical name (e.g. "Matthew",
// "John", "Siddhartha Buddha") — exact match is safe and necessary here.
// Lower than title-pattern authority (10) so that named canonical works beat compilations
// by the same author (e.g. Seven Valleys beats "Bahá'í Sacred Writings" anthology).
const AUTHOR_AUTHORITY = {
  // Bahá'í Central Figures — canonical works get 10 via TITLE_AUTHORITY patterns;
  // compilations and unrecognized works fall back to these default values.
  "Bahá'u'lláh": 8,
  "Baha'u'llah": 8,
  "The Báb": 8,
  "The Bab": 8,
  "'Abdu'l-Bahá": 7,
  "Abdu'l-Baha": 7,
  "Abdul-Baha": 7,
  "Shoghi Effendi": 7,
  "Universal House of Justice": 7,
  // OceanLibrary multi-author compilations, credited to their compiler (site-adapters/oceanlibrary.js) — they are made
  // of the authoritative texts, so they keep the rank the old "Bahá'u'lláh" credit gave them.
  "Compilation (Bahá'í Writings)": 8,
  "Research Department of the Universal House of Justice (compiler)": 7,
  // Islamic scripture — OceanLibrary Quran surahs have author="Muhammad" (exact)
  "Muhammad": 8,
  // Christian scripture — OceanLibrary individual Gospel/Epistle books
  "Matthew": 8,
  "Mark": 8,
  "Luke": 8,
  "John": 8,
  "Paul": 8,
  // Buddhist primary texts — OceanLibrary attribution
  "Siddhartha Buddha": 8,
  "Gautama Buddha": 8,
  "The Buddha": 8,
  // Tao primary texts
  "Lao-tzu": 8,
  "Laozi": 8,
  "Lao Tzu": 8,
  "Chuang Tzu": 7,
  "Zhuangzi": 7,
  // Confucian primary texts
  "Confucius": 8,
  "Mencius": 7,
  // Jewish scripture — OceanLibrary prophets/kings (exact author names from OL ingestion)
  "Moses": 8,
  "King David": 8,
  "King Solomon": 7,
  "Isaiah": 8,
  "Jeremiah": 8,
  "Daniel": 7,
  "Joshua": 7,
  "Samuel": 7,
  "Ezra": 7,
  "Nehemiah": 7,
  "Hosea": 7,
  "Amos": 7,
  "Micah": 7,
  "Joel": 7,
  "Jonah": 7,
  "Habakkuk": 7,
  "Haggai": 7,
  "Zechariah": 7,
  "Malachi": 7,
  "Obadiah": 7,
  "Zephaniah": 7,
  // Hindu primary scripture authors
  "Vyāsa": 8,
  "Vyasa": 8,
  "Valmiki": 8,
  // Zoroastrian — Gathas author
  "Zoroaster": 8,
  "Zarathustra": 8,
  // Sikh — Guru Granth Sahib contributors
  "Guru Nanak": 8,
  "Guru Nanak Dev": 8,
  "Kabîr": 7,
  "Kabir": 7,
  "Guru Angad": 7, "Guru Amar Das": 7, "Guru Ram Das": 7, "Guru Arjan": 7, "Guru Arjan Dev": 7, "Guru Tegh Bahadur": 7,   // more Guru Granth Sahib contributors
  // Christian — the remaining epistle writers (OceanLibrary individual books)
  "Peter": 8, "James": 8, "Jude": 7,
};

// Title-pattern authority overrides for primary scriptures stored under "Unknown" author.
// OceanLibrary ingests complete Quran/Bible translation volumes without a canonical author
// field (author="Unknown"), so they miss the AUTHOR_AUTHORITY step. These regex patterns
// match the translation titles (not commentaries on them) and assign authority 10.
// Each pattern must NOT match commentary titles — checked before religion default.
const TITLE_AUTHORITY = [
  // Quran translations: "The Qur'an (Rodwell)", "The Holy Qur-an (Yusuf Ali)",
  // "The Meaning of the Glorious Qur'án (Pickthall)", etc.
  // Excluded: "The Qur'an Commentary of...", "Tafsir al-Quran..."
  {
    pattern: /^(the\s+)?(holy\s+|meaning\s+of\s+the\s+glorious\s+|glorious\s+)?qur(?:['\u2019\u02bc-])?[a\u00e1\u00e2\u0101]n(\s*\([^)]*\)|\s*$)/i,
    authority: 10, kind: 'quran',
  },
  // Koran translations: "The Koran Interpreted", "The Koran (Sale)", etc.
  // Excluded: "Tafsir...", "Commentary..."
  {
    pattern: /^(the\s+)?koran(\s+interpreted|\s+\([^)]*\)|\s*$)/i,
    authority: 10, kind: 'quran',
  },
  // Complete Bible translations: "The King James Bible", "American Standard Version", etc.
  // Individual Gospels already handled by AUTHOR_AUTHORITY (author=Matthew/Mark/etc.)
  {
    pattern: /^(the\s+)?(holy\s+)?(bible|king\s+james\s+(bible|version)|american\s+standard\s+version|world\s+english\s+bible|douay.rheims\s+bible)(\s*$|\s*[-—(])/i,
    authority: 10, kind: 'bible',
  },
  // Tao Te Ching translations (when author stored as Unknown/Various)
  { pattern: /^(the\s+)?tao\s+te\s+ching(\s*[-—(]|\s*$)/i, authority: 10 },
  // Psalms and Torah books (when author not stored individually)
  { pattern: /^(the\s+)?(book\s+of\s+)?(psalms|proverbs|ecclesiastes|song\s+of\s+(solomon|songs))(\s*$|\s*[-—(])/i, authority: 10, kind: 'bible' },
  // Bhagavad Gita translations
  { pattern: /^(the\s+)?bhagavad[\s-]?g[iī]t[aā](\s*[-—(]|\s*$)/i, authority: 10 },
  // Analects of Confucius
  { pattern: /^(the\s+)?analects(\s+of\s+confucius)?(\s*$|\s*[-—(])/i, authority: 10 },
  // Upanishads / Vedas
  { pattern: /^(the\s+)?(principal\s+)?upanishads?(\s*$|\s*[-—(])/i, authority: 10 },
  // Gathas of Zoroaster
  { pattern: /^(the\s+)?gathas?(\s*$|\s*[-—(])/i, authority: 10 },
  // Guru Granth Sahib
  { pattern: /^(the\s+)?guru\s+granth\s+sahib(\s*$|\s*[-—(])/i, authority: 10 },
  // Bahá'í canonical primary scriptures — explicit title patterns give 10 so they beat
  // compilations/anthologies that inherit author-default authority (8).
  { pattern: /^(the\s+)?kit[aá]b-i-[ií]q[aá]n(\s*$|\s*[-—(])/i, authority: 10 },  // Book of Certitude
  { pattern: /^(the\s+)?(most\s+holy\s+book|kit[aá]b-i-aqdas)(\s*$|\s*[-—(])/i, authority: 10 },  // Aqdas
  { pattern: /^(the\s+)?seven\s+valleys(\s+and\s+the\s+four\s+valleys)?(\s*$|\s*[-—(])/i, authority: 10 },
  { pattern: /^(the\s+)?four\s+valleys(\s*$|\s*[-—(])/i, authority: 10 },
  { pattern: /^(the\s+)?hidden\s+words(\s+of\s+bah[aá]'?u'?ll[aá]h)?(\s*$|\s*[-—(])/i, authority: 10 },
  { pattern: /^gleanings\s+from\s+the\s+writings\s+of\s+bah[aá]/i, authority: 10 },
  { pattern: /^(the\s+)?epistle\s+to\s+the\s+son\s+of\s+the\s+wolf(\s*$|\s*[-—(])/i, authority: 10 },
  { pattern: /^prayers\s+and\s+meditations(\s*$|\s*[-—(])/i, authority: 10 },
  { pattern: /^tablets?\s+of\s+bah[aá]'?u'?ll[aá]h(\s*$|\s*[-—(])/i, authority: 10 },
  { pattern: /^(the\s+)?(tabernacle|summons)\s+of\s+(the\s+lord\s+of\s+hosts|god)(\s*$|\s*[-—(])/i, authority: 10 },
  { pattern: /^some\s+answered\s+questions(\s*$|\s*[-—(])/i, authority: 10 },
  // Writings/Letters/etc. "of Bahá'u'lláh" — catches "Tablets of Bahá'u'lláh revealed after..."
  // which OceanLibrary sometimes stores as the author field.
  { pattern: /^(letters?|writings?|words?|tablets?|gems)\s+of\s+bah[aá][''\u2019]u[''\u2019]ll[aá]h/i, authority: 10 },
  // Lights of Guidance — authenticated Bahá'í Q&A compiled by Helen Hornby.
  // Each entry directly answers a doctrinal question; treat as high-authority reference.
  { pattern: /^lights\s+of\s+guidance/i, authority: 8 },
  // Buddhist canonical texts — Pali Canon Nikayas (primary scripture)
  // Titles like "Digha Nikaya 16 - Sutta Name", "Dīghanikāya: Long Discourses"
  { pattern: /^d[iī]gha[\s-]?nik[aā]ya(\s+\d|\s*[-:—(]|\s*$)/i, authority: 10 },
  { pattern: /^majjhima[\s-]?nik[aā]ya(\s+\d|\s*[-:—(]|\s*$)/i, authority: 10 },
  { pattern: /^samyutta[\s-]?nik[aā]ya(\s+\d|\s*[-:—(]|\s*$)/i, authority: 10 },
  { pattern: /^a[nṅ]guttara[\s-]?nik[aā]ya(\s+\d|\s*[-:—(]|\s*$)/i, authority: 10 },
  // Dhammapada (most widely read Buddhist scripture)
  { pattern: /^(the\s+)?(buddha'?s?\s+path\s+of\s+virtue\s*\()?(dhammapada)(\s*\(|\s*[-—]|\s*$)/i, authority: 10 },
  // Sutta Nipata (early Pali canon discourse collection)
  { pattern: /^(the\s+)?sutta\s+nip[aā]ta(\s*$|\s*[-—(])/i, authority: 10 },
  // Sutra Collections (primary Mahayana sutras: Diamond, Heart, Lotus etc.)
  { pattern: /^sutra\s+collection\s*\(/i, authority: 10 },
  // Diamond Sutra (Vajracchedika Prajnaparamita)
  { pattern: /^(the\s+)?diamond\s+sutra(\s*$|\s*[-—(])/i, authority: 10 },
  // Buddhacarita (Ashvaghosha's life of the Buddha — primary canonical poem)
  { pattern: /^buddhacarita(\s*$|\s*[-—(])/i, authority: 9 },
  // Jataka Tales (canonical but narrative/secondary)
  { pattern: /^(buddhist\s+birth\s+stories|jataka\s+tales?)(\s*$|\s*[-—(])/i, authority: 8 },
];

const DEFAULT_AUTHORITY = 5;
/** A talk (media transcript) — below published scholarship (3): a speaker's commentary. */
export const TALK_AUTHORITY = 2;
/** The collection every media transcript is filed under (media/ingest.js: <tradition>/Media/<slug>.md). */
export const isTalkCollection = (collection) => /^media$/i.test(String(collection || '').trim());

/**
 * Load authority values from library's meta.yaml files
 */
function scanLibraryAuthority() {
  const fresh = {
    religions: {},
    collections: {},
    religionMeta: {},
    collectionMeta: {},
  };

  const basePath = config.library.basePath;
  if (!basePath) {
    console.warn('No library basePath configured');
    return;
  }

  try {
    const religions = readdirSync(basePath).filter(item => {
      try { return statSync(join(basePath, item)).isDirectory() && !item.startsWith('.'); }
      catch { return false; }
    });

    for (const religion of religions) {
      const religionPath = join(basePath, religion);
      try {
        const meta = parseYaml(readFileSync(join(religionPath, '.religion', 'meta.yaml'), 'utf-8'));
        fresh.religionMeta[religion] = meta;
        if (meta.authority !== undefined) fresh.religions[religion] = meta.authority;
      } catch { /* No religion meta */ }

      fresh.collections[religion] = {};
      fresh.collectionMeta[religion] = {};

      const collections = readdirSync(religionPath).filter(item => {
        try { return statSync(join(religionPath, item)).isDirectory() && !item.startsWith('.'); }
        catch { return false; }
      });

      for (const collection of collections) {
        try {
          const meta = parseYaml(readFileSync(join(religionPath, collection, '.collection', 'meta.yaml'), 'utf-8'));
          fresh.collectionMeta[religion][collection] = meta;
          if (meta.authority !== undefined) fresh.collections[religion][collection] = meta.authority;
        } catch { /* No collection meta */ }
      }
    }

    libraryAuthority = fresh;
    lastLoadTime = Date.now();
  } catch (err) {
    console.error('Failed to load library authority:', err.message);
  }
}

// Stale-while-revalidate: serve cached data immediately; trigger background
// re-scan when TTL expires so synchronous FS operations never block the event loop.
function loadLibraryAuthority() {
  if (!libraryAuthority) {
    // Cold start: must scan synchronously before any request can be answered
    scanLibraryAuthority();
  } else if (Date.now() - lastLoadTime >= CACHE_TTL_MS && !backgroundRefreshPending) {
    // Stale: return current data and refresh in background
    backgroundRefreshPending = true;
    setImmediate(() => {
      scanLibraryAuthority();
      backgroundRefreshPending = false;
    });
  }
  return libraryAuthority || EMPTY_AUTHORITY;
}

/**
 * Get authority value for a document based on its metadata
 *
 * @param {Object} doc - Document metadata
 * @param {string} doc.author - Document author
 * @param {string} doc.religion - Document religion/tradition
 * @param {string} doc.collection - Document collection
 * @param {number} [doc.authority] - Explicit authority override
 * @returns {number} Authority value (1-10)
 */
// Normalize typographic apostrophes/quotation marks to ASCII ' so author strings
// from the DB (which use U+2019 RIGHT SINGLE QUOTATION MARK) match the ASCII-keyed
// AUTHOR_AUTHORITY map. Also covers U+2018, U+02BC, U+0060, U+00B4.
function normalizeApostrophes(str) {
  return str.replace(/[\u2018\u2019\u02bc\u0060\u00b4]/g, "'");
}

/**
 * Authority of a NAMED WRITER, for a paragraph whose own writer is known (content.authors): a Bahá’u’lláh quotation inside
 * a commentary carries Bahá’u’lláh's authority, whatever the book's collection says. Apostrophes normalised (the reader
 * writes ’ , this table uses '). null when the writer is not in the table — keep the book's authority then.
 */
export function authorAuthority(name) {
  if (!name) return null;
  const key = String(name).replace(/[‘’ʼ`]/g, "'");
  return AUTHOR_AUTHORITY[key] ?? AUTHOR_AUTHORITY[key.replace(/^'/, '')] ?? null;
}

export function getAuthority(doc) {
  // 1. If document has explicit authority set, use it
  if (doc.authority !== null && doc.authority !== undefined) {
    return Math.min(10, Math.max(1, Number(doc.authority)));
  }

  const libAuth = loadLibraryAuthority();
  const { religion, collection, source_site } = doc;
  // Normalize author for AUTHOR_AUTHORITY lookup — DB stores smart quotes (U+2019)
  // but map keys use ASCII apostrophes (U+0027).
  const authorNorm = doc.author ? normalizeApostrophes(doc.author) : null;

  // 2. Collection-specific authority from meta.yaml takes highest priority so that
  // curated overrides (e.g. Pilgrim Notes = 1) always apply, even for Central Figure authors.
  if (religion && collection && libAuth.collections[religion]?.[collection] !== undefined) {
    return libAuth.collections[religion][collection];
  }

  // 2b. A TALK (a media transcript: <tradition>/Media/<slug>.md) is a speaker's commentary — the lowest tier, whatever its
  // title or speaker (Chad 10-31: talks were polluting Anís's doctrinal answers). Never a title pattern: a talk titled
  // "The Iqan" is not the Kitáb-i-Íqán.
  if (isTalkCollection(collection)) return TALK_AUTHORITY;

  // 3. Title-pattern authority — canonical named works win over author-default authority.
  // Evaluated before author defaults so "Seven Valleys" (10) beats a "Bahá'í Sacred Writings"
  // anthology (author-default 8) when both are attributed to Bahá'u'lláh.
  // Also checks authorNorm for OceanLibrary's pattern of storing a book title in the author field
  // (e.g., author="Tablets of Bahá'u'lláh revealed after the Kitáb-i-Aqdas").
  for (const { pattern, titleOnly, authority: titleAuth } of TITLE_AUTHORITY) {
    if (doc.title && pattern.test(doc.title)) return titleAuth;
    if (!titleOnly && authorNorm && pattern.test(authorNorm)) return titleAuth;
  }

  // 4. Author-based authority — fallback default for primary scripture authors when no
  // title pattern matches. Compilations and anthologies that don't match a specific title
  // pattern inherit this lower default (8 for Central Figures vs 10 for named canonical works).
  // Uses exact string equality to avoid false positives like "Muhammad Husayn Tabatabai".
  if (authorNorm && AUTHOR_AUTHORITY[authorNorm] !== undefined) {
    return AUTHOR_AUTHORITY[authorNorm];
  }

  // 5. Religion default from meta.yaml — applies to general content without recognized author.
  if (religion && libAuth.religions[religion] !== undefined) {
    return libAuth.religions[religion];
  }

  // 6. External-site authority floor from sites.yaml. Lazy-load to avoid
  // circular import (scope.js doesn't import from authority.js).
  // Supplementals like bahai-library.com (authority_default 3) get a low
  // ranking floor here; primary docs at the SAME relevance score outrank
  // them. Site-only sites land here too if their content somehow leaks
  // into a search context, but the scope wall should prevent that.
  if (source_site) {
    const cfg = getSiteRegistryConfig(source_site);
    if (cfg && typeof cfg.authority_default === 'number') {
      return Math.min(10, Math.max(0, cfg.authority_default));
    }
  }

  // 7. Return global default
  return DEFAULT_AUTHORITY;
}

// DOCTRINAL TIER (Chad 11-09: "the division is between doctrinal core and supplemental, which is important historical or
// philosophical but not core"). core | gray | supplemental, by the TEXT — never by where the copy came from (docs.scope only means
// "scraped from a website"; a website copy of the Hidden Words is still core). PER PARAGRAPH, by its own author (Chad 11-09:
// every paragraph by the Báb, Bahá'u'lláh, 'Abdu'l-Bahá or Shoghi Effendi is core whatever book it sits in — Lights of Guidance,
// a compilation, Paris Talks; a compiler's intro or a UHJ letter in the same book is not). ORDER only: every non-duplicate paragraph is
// indexed in every tier (phrase indexing is the primary retrieval mechanism). Pure: tables above + the doc's own fields.
export const TIERS = ['core', 'gray', 'supplemental'];
// Islam: only the Qur'an is core. Hadith = gray; Shi'i Imams' sayings (Nahj al-Balagha, al-Kafi …) = gray. Tafsir = supplemental.
const ISLAM_GRAY_TITLE = /\b(sahih|bukhari|sunan|muwatta|tirmidhi|abu dawud|ibn majah|nasai|mishkat|riyad as salihin|hadith|nahj al balagha|al kafi|bihar al anwar|sahifa|sahifah)\b/;
// Other traditions' secondary canon = gray: Talmud, Mencius, Zhuangzi, Jataka.
const OTHER_GRAY_TITLE = /\b(talmud|mishnah|jataka|buddhist birth stories|mencius|zhuangzi|chuang tzu)\b/;
const GRAY_AUTHORS = new Set(['Mencius', 'Zhuangzi', 'Chuang Tzu']);
// Per-tradition canon by TITLE, unanchored ("Chandogya Upanishad", "Sri Guru Granth Sahib", "The New Testament (RSV)", "The Noble
// Quran"): a scripture is core whatever its edition string; a title naming a commentary on it never is (ABOUT). The data behind
// assistant/tradition-authority.js (one authority model per tradition). Folded text (norm); tested per tradition.
const ABOUT = /\b(commentar(y|ies)|tafsir|according to|study of|studies|introduction to|guide to|companion|essays?|lectures?|reflections?|explained|interpreted by|history of|life of|introduction|sermons?|ulum|ahkam)\b/;
const CANON = [
  [/^hind/, { core: /\b(vedas?|rig ?veda|yajur ?veda|sama ?veda|atharva ?veda|upanishads?|bhagavad ?gita|ramayana|mahabharata|brahma ?sutras?)\b/, gray: /\b(puranas?|bhagavata|manu ?smriti|laws of manu|dharma ?(shastras?|sutras?)|yoga sutras?)\b/ }],
  [/^budd/, { core: /\b(nikaya|dhammapada|sutta ?nipata|udana|itivuttaka|theragatha|therigatha|sutras?|suttas?|tripitaka|pali canon|vinaya)\b/, gray: /\b(jataka|buddhist birth stories|milindapanha|visuddhimagga|abhidhamma|abhidharma)\b/ }],
  [/^jain/, { core: /\b(agamas?|acaranga|sutrakritanga|sutrakrtanga|kalpa ?sutra|uttaradhyayana|akaranga|bhagavati|tattvartha ?sutra|samayasara|jain sutras?)\b/, gray: /\b(niryukti|churni|tika)\b/ }],
  [/^sikh/, { core: /\b(guru granth( sahib)?|adi granth|japji|sukhmani|jaap sahib|anand sahib)\b/, gray: /\b(dasam granth|janamsakhi|rehras|rahit ?nama|vars? of bhai gurdas)\b/ }],
  [/^(zoro|parsi)/, { core: /\b(avesta|gathas?|yasna|vendidad|videvdat|visperad|yashts?|afrinagan|sirozah|nyayesh|nyaish|khordeh)\b/, gray: /\b(bundahishn|denkard|pahlavi|zand|arda viraf|arda wiraz|dadistan)\b/ }],
  [/^(tao|dao)/, { core: /\b(tao te ching|dao de jing|daodejing|tao ?teh ?king|i ching|yi ?jing)\b|道德經|道德真經/, gray: /\b(liezi|lieh tzu|huainanzi|daozang)\b/ }],
  [/^confuc/, { core: /\b(analects|lunyu|doctrine of the mean|great learning|i ching|yi jing|book of changes|book of songs|book of documents|classic of filial piety|four books|five classics|zhou ?yi|shang ?shu|shu ?jing|shi ?jing|shih ?king|shu ?king|book of poetry|book of odes)\b|周易|尚書|詩經|書經/, gray: /\b(xunzi|hsun tzu|mencius|record of rites|book of rites)\b/ }],
  [/^(jud|jew)/, { core: /\b(tanakh|tanach|torah|pentateuch|hebrew bible|genesis|exodus|leviticus|deuteronomy|isaiah|jeremiah|ezekiel|psalms|proverbs|ecclesiastes|lamentations|book of (numbers|job|esther|daniel))\b/, gray: /\b(talmud|mishnah|midrash|zohar|tosefta|mishneh torah)\b/ }],
  [/^christ/, { core: /\b(bible|new testament|old testament|gospels?|epistles?|acts of the apostles)\b/, gray: /\b(apocrypha|pseudepigrapha|gospel of thomas|didache|apostolic fathers)\b/ }],
  [/^(islam|muslim)/, { core: /\b(qur ?an|koran)\b/, gray: null }],
];
// Commentary vs scripture by AUTHOR first (Chad 11-09 canon fix): a title that names a scripture is the scripture only when its author
// is the scripture's own writer / anthology ("Various", "Unknown") / absent (translator only: "tr. X", "retold by X"); a named later author
// (Luther on the Epistles, al-Suyuti, Zhou Dunyi) makes it commentary. Plus the catalogue's own form markers ("X on Genesis", 講義/註/論).
const SCRIPTURE_WRITER = /^(various|unknown|traditional|anonymous|attrib|sefaria|community translation|laozi|lao tzu|confucius|zengzi|kongzi|vyasa|valmiki|moses|paul|john|peter|james|jude|matthew|mark|luke|guru|bhagat|sikh|mahavira|buddha|muhammad|david|solomon|zarathustra|zoroaster|mahabharata|ramayana)\b/;
const COMMENTARY_MARK = /註|注|疏|講義|讲义|論(?!語)/;
const authorIsScripture = (author) => {
  const raw = String(author || '').replace(/(^|[,;]\s*)(tr|tran|trans|translated|retold|ed|edited)\b.*$/i, '').replace(/\(.*?\)/g, '').trim(), a = norm(raw);
  if (/[^\x00-\x7f]/.test(raw) && /[\u3400-\u9fff]/.test(raw)) return /老子|孔子|曾子|孟子|莊子/.test(raw);   // CJK author: only the scripture's own
  return !a || SCRIPTURE_WRITER.test(a);
};
const isCommentaryOn = (rel, title, author) => COMMENTARY_MARK.test(title) || (/^(jud|jew|christ)/.test(rel) && /\bon [a-z]/i.test(title)) || !authorIsScripture(author);
const canonFor = (rel) => CANON.find(([re]) => re.test(rel))?.[1] ?? null;
const isScriptureAuthor = (a) => !!a && (AUTHOR_AUTHORITY[a] ?? 0) >= 7 && !GRAY_AUTHORS.has(a) && a !== 'Muhammad'
  && !WRITER_RE.test(norm(a)) && !/universal house of justice|research department|^compilation/i.test(a);

/** doc: { religion, collection, title, author }; para: { author } = the paragraph's own writer (paragraphAuthor: content.authors, else
 *  the doc's author). No para → the doc's own author/title decide. */
export function doctrinalTier(doc = {}, para = null) {
  if (isTalkCollection(doc.collection)) return 'supplemental';   // media transcripts: modern speakers' talks
  const rel = norm(doc.religion), title = String(doc.title || ''), t = norm(title);
  const author = doc.author ? normalizeApostrophes(String(doc.author)) : '', a = norm(author);
  if (/pilgrim notes/.test(norm(doc.collection)) || /\bpilgrims? notes?\b/.test(t)) return 'gray';
  const titleCore = (kinds) => TITLE_AUTHORITY.some(({ pattern, authority, kind }) => authority >= 10 && kinds.includes(kind) && (pattern.test(title) || pattern.test(author)));
  if (/^bah/.test(rel)) {
    // the paragraph's own writer decides when known: a Central Figure or the Guardian = core; "Compilation (Bahá'í Writings)" = made
    // of their texts = core; anyone else (compiler's intro, UHJ letter, scholar) = supplemental. Some Answered Questions via its title.
    const w = para?.author ? norm(para.author) : null;
    if (w != null) return WRITER_RE.test(w) || /^compilation/.test(w) ? 'core' : 'supplemental';
    return titleCore([undefined]) || /^compilation/.test(a) || WRITER_RE.test(a) ? 'core' : 'supplemental';
  }
  const canon = canonFor(rel), plain = !ABOUT.test(norm(title.replace(/\([^)]*\b(book|lecture|part|vol|volume|chapter)\b[^)]*\)/gi, '')));   // a title naming a commentary on a scripture is the commentary
  const canonCore = !!canon?.core && plain && (canon.core.test(t) || canon.core.test(title)) && !isCommentaryOn(rel, title, author), canonGray = !!canon?.gray && plain && (canon.gray.test(t) || canon.gray.test(title));
  const comm = isCommentaryOn(rel, title, author);
  if (/^(islam|muslim)/.test(rel)) {
    if (!comm && titleCore(['quran']) || canonCore) return 'core';
    if (ISLAM_GRAY_TITLE.test(t)) return 'gray';
    return author === 'Muhammad' ? 'core' : 'supplemental';   // OceanLibrary Qur'an surahs carry author "Muhammad"
  }
  if (/^christ/.test(rel)) return canonGray ? 'gray' : !comm && titleCore(['bible']) || canonCore || isScriptureAuthor(author) ? 'core' : 'supplemental';   // the Bible
  if (OTHER_GRAY_TITLE.test(t) || GRAY_AUTHORS.has(author) || canonGray) return 'gray';
  return !comm && titleCore(['quran', 'bible', undefined]) || canonCore || isScriptureAuthor(author) ? 'core' : 'supplemental';
}

// Site registry hook. Wired at boot from api/index.js + worker startup so
// getAuthority can read authority_default per source_site without a circular
// import on api/lib/search/scope.js (scope.js → authority.js would create
// the cycle). Defaults to null, meaning step 4 silently skips and we fall
// through to author-based authority.
let _siteRegistryRef = null;
export function setAuthoritySiteRegistry(registry) {
  _siteRegistryRef = registry || null;
}
function getSiteRegistryConfig(sourceSite) {
  if (!_siteRegistryRef) return null;
  return _siteRegistryRef[sourceSite] || null;
}

/**
 * Get all authority values for a batch of documents
 *
 * @param {Object[]} docs - Array of document metadata
 * @returns {Map<string, number>} Map of document ID to authority value
 */
export function getAuthorityBatch(docs) {
  const result = new Map();
  for (const doc of docs) {
    result.set(doc.id, getAuthority(doc));
  }
  return result;
}

/**
 * Get encumbered status for a document
 * Priority: document frontmatter > collection meta.yaml > religion meta.yaml > default (false)
 *
 * @param {Object} doc - Document metadata
 * @param {boolean} [doc.encumbered] - Explicit frontmatter override
 * @param {string} doc.religion - Document religion/tradition
 * @param {string} doc.collection - Document collection
 * @returns {boolean} Whether the document is encumbered (copyrighted)
 */
export function getEncumbered(doc) {
  // 1. Explicit frontmatter override (true or false)
  if (doc.encumbered !== null && doc.encumbered !== undefined) {
    return !!doc.encumbered;
  }
  const libAuth = loadLibraryAuthority();
  const { religion, collection } = doc;
  // 2. Collection meta.yaml
  if (religion && collection) {
    const colMeta = libAuth.collectionMeta[religion]?.[collection];
    if (colMeta?.encumbered !== undefined) return !!colMeta.encumbered;
  }
  // 3. Religion meta.yaml
  if (religion) {
    const relMeta = libAuth.religionMeta[religion];
    if (relMeta?.encumbered !== undefined) return !!relMeta.encumbered;
  }
  // 4. Default: not encumbered
  return false;
}

/** Traditions marked `hidden: true` in their .religion/meta.yaml — searchable, never listed on the library shelves (Chad 10-21:
 *  "Other" — works spanning traditions, related ideas, contrasting beliefs such as atheism and secularism). Pure over the meta. */
export const hiddenFrom = (religionMeta = {}) => new Set(Object.entries(religionMeta).filter(([, m]) => m && m.hidden === true).map(([n]) => n));
export function hiddenReligions() {
  try { return hiddenFrom(loadLibraryAuthority().religionMeta); } catch { return new Set(); }
}

/**
 * Get metadata for a religion from its .religion/meta.yaml
 *
 * @param {string} religion - Religion name
 * @returns {Object|null} Religion metadata or null
 */
export function getReligionMeta(religion) {
  const libAuth = loadLibraryAuthority();
  return libAuth.religionMeta[religion] || null;
}

/**
 * Get metadata for a collection from its .collection/meta.yaml
 *
 * @param {string} religion - Religion name
 * @param {string} collection - Collection name
 * @returns {Object|null} Collection metadata or null
 */
export function getCollectionMeta(religion, collection) {
  const libAuth = loadLibraryAuthority();
  return libAuth.collectionMeta[religion]?.[collection] || null;
}

/**
 * Get all loaded authority data (for debugging/display)
 *
 * @returns {Object} The full authority data from library
 */
export function getAuthorityConfig() {
  return loadLibraryAuthority();
}

/**
 * Force reload of authority configuration from library
 */
export function reloadConfig() {
  libraryAuthority = null;
  lastLoadTime = 0;
  return loadLibraryAuthority();
}

/**
 * Invalidate the cache (call when meta.yaml files change)
 */
export function invalidateCache() {
  libraryAuthority = null;
  lastLoadTime = 0;
}

// Authority tier rank map for entity-layer conflict resolution.
// When two graph_relations make conflicting claims about the same entity,
// the claim from the higher-rank source wins; lower-rank claims get status='superseded_by'.
const TIER_RANKS = {
  revealed: 100,
  central_figure: 90,
  authorized_interpretation: 80,
  institutional: 70,
  approved_history: 60,
  primary_scripture_other: 90,
  tradition_doctrinal: 75,
  tradition_authoritative: 65,
  scholarly: 40,
  secondary: 30,
  reference: 20,
  unknown: 10,
};

/**
 * Rank of a source_authority_tier string (higher = more authoritative).
 * @param {string|null} tier
 * @returns {number}
 */
export function getTierRank(tier) {
  return TIER_RANKS[tier] ?? 10;
}

/**
 * Re-rank a list of search hits by blending RRF score with source_authority_tier.
 * Hits from higher-tier sources get a lift so primary texts beat secondary books
 * at equal relevance. Only modifies score — does not filter.
 *
 * @param {Array<{_rrfScore?: number, source_authority_tier?: string, authority?: number}>} hits
 * @param {number} [tierLiftFactor=0.05] - per-tier-rank-point score boost
 * @returns {Array} same hits, sorted by blended score descending
 */
export function rerankByAuthorityTier(hits, tierLiftFactor = 0.05) {
  return hits
    .map(hit => {
      const tierRank = getTierRank(hit.source_authority_tier || null);
      const baseScore = hit._rrfScore ?? hit._rankingScore ?? 0;
      return { ...hit, _blendedScore: baseScore + tierLiftFactor * (tierRank / 100) };
    })
    .sort((a, b) => b._blendedScore - a._blendedScore);
}

/**
 * Get human-readable authority label
 *
 * @param {number} authority - Authority value (1-10)
 * @returns {string} Label describing the authority level
 */
export function getAuthorityLabel(authority) {
  if (authority >= 10) return 'Sacred Text';
  if (authority >= 9) return 'Authoritative';
  if (authority >= 8) return 'Institutional';
  if (authority >= 7) return 'Official';
  if (authority >= 6) return 'Reference';
  if (authority >= 5) return 'Published';
  if (authority >= 4) return 'Historical';
  if (authority >= 3) return 'Research';
  if (authority >= 2) return 'Commentary';
  return 'Unofficial';
}
