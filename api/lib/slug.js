/**
 * Slug Generation Utility
 *
 * Generates URL-safe slugs from titles by:
 * - Converting to lowercase
 * - Removing diacritics (Báb → bab, Bahá'u'lláh → bahaullah)
 * - Replacing non-alphanumeric chars with hyphens
 * - Collapsing multiple hyphens
 */

// Diacritics mapping - maps accented characters to their base form
const DIACRITICS_MAP = {
  // A variants
  'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ā': 'a', 'ã': 'a', 'å': 'a', 'ą': 'a',
  'Á': 'a', 'À': 'a', 'Ä': 'a', 'Â': 'a', 'Ā': 'a', 'Ã': 'a', 'Å': 'a', 'Ą': 'a',

  // E variants
  'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e', 'ē': 'e', 'ę': 'e', 'ě': 'e',
  'É': 'e', 'È': 'e', 'Ë': 'e', 'Ê': 'e', 'Ē': 'e', 'Ę': 'e', 'Ě': 'e',

  // I variants
  'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'ī': 'i', 'ı': 'i',
  'Í': 'i', 'Ì': 'i', 'Ï': 'i', 'Î': 'i', 'Ī': 'i', 'İ': 'i',

  // O variants
  'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'ō': 'o', 'õ': 'o', 'ø': 'o',
  'Ó': 'o', 'Ò': 'o', 'Ö': 'o', 'Ô': 'o', 'Ō': 'o', 'Õ': 'o', 'Ø': 'o',

  // U variants
  'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'ū': 'u', 'ů': 'u',
  'Ú': 'u', 'Ù': 'u', 'Ü': 'u', 'Û': 'u', 'Ū': 'u', 'Ů': 'u',

  // Other consonants
  'ñ': 'n', 'Ñ': 'n', 'ń': 'n', 'Ń': 'n',
  'ç': 'c', 'Ç': 'c', 'č': 'c', 'Č': 'c', 'ć': 'c', 'Ć': 'c',
  'ş': 's', 'Ş': 's', 'š': 's', 'Š': 's', 'ś': 's', 'Ś': 's',
  'ž': 'z', 'Ž': 'z', 'ź': 'z', 'Ź': 'z', 'ż': 'z', 'Ż': 'z',
  'ř': 'r', 'Ř': 'r',
  'ý': 'y', 'Ý': 'y',
  'ł': 'l', 'Ł': 'l',
  'đ': 'd', 'Đ': 'd',
  'ğ': 'g', 'Ğ': 'g',

  // Ligatures
  'æ': 'ae', 'Æ': 'ae',
  'œ': 'oe', 'Œ': 'oe',
  'ß': 'ss',
};

/**
 * Remove diacritics from a string
 * @param {string} str - Input string
 * @returns {string} String with diacritics removed
 */
export function removeDiacritics(str) {
  return str.split('').map(c => DIACRITICS_MAP[c] || c).join('');
}

/**
 * Generate a URL-safe slug from a title
 * @param {string} title - The title to slugify
 * @returns {string} URL-safe slug
 *
 * @example
 * generateSlug("The Tablet of Wisdom") // "the-tablet-of-wisdom"
 * generateSlug("Báb") // "bab"
 * generateSlug("Bahá'u'lláh's Writings") // "bahaullahs-writings"
 */
export function generateSlug(title) {
  if (!title) return '';

  return title
    .toLowerCase()
    .split('').map(c => DIACRITICS_MAP[c] || c).join('')  // Remove diacritics
    .replace(/[''`']/g, '')                                // Remove apostrophes
    .replace(/[^a-z0-9]+/g, '-')                           // Non-alphanumeric to hyphens
    .replace(/^-+|-+$/g, '')                               // Trim leading/trailing hyphens
    .replace(/-+/g, '-');                                  // Collapse multiple hyphens
}

/**
 * Generate a unique slug by appending a number if needed
 * @param {string} title - The title to slugify
 * @param {Set<string>} existingSlugs - Set of already-used slugs
 * @returns {string} Unique slug
 *
 * @example
 * const used = new Set(['tablet-of-wisdom']);
 * generateUniqueSlug("Tablet of Wisdom", used) // "tablet-of-wisdom-2"
 */
export function generateUniqueSlug(title, existingSlugs) {
  const baseSlug = generateSlug(title);

  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  // Find next available number
  let counter = 2;
  while (existingSlugs.has(`${baseSlug}-${counter}`)) {
    counter++;
  }

  return `${baseSlug}-${counter}`;
}

/**
 * Slugify a religion or collection name for URL paths
 * @param {string} name - Religion or collection name
 * @returns {string} URL-safe path segment
 *
 * @example
 * slugifyPath("Bahá'í") // "bahai"
 * slugifyPath("Islam") // "islam"
 * slugifyPath("Writings of Bahá'u'lláh") // "writings-of-bahaullah"
 */
export function slugifyPath(name) {
  return generateSlug(name);
}

/**
 * Generate a document slug from author, title/filename, and language
 * Format: author_title_lang (underscore separates parts, hyphen within parts)
 *
 * @param {object} doc - Document object with author, title, filename, language
 * @returns {string} URL-safe slug
 *
 * @example
 * generateDocSlug({ author: "Bahá'u'lláh", title: "Hidden Words", language: "en" })
 * // "bahaullah_hidden-words"
 *
 * generateDocSlug({ author: "The Báb", title: "Address to believers", language: "ar" })
 * // "the-bab_address-to-believers_ar"
 *
 * generateDocSlug({ title: "Tablet", language: "fa" })
 * // "tablet_fa" (no author)
 */
export function generateDocSlug(doc) {
  const parts = [];

  // Add author if available and not "Unknown"
  if (doc.author && doc.author !== 'Unknown') {
    parts.push(generateSlug(doc.author));
  }

  // Use title if available, otherwise use filename without extension
  let titlePart = doc.title;
  if (!titlePart && doc.filename) {
    titlePart = doc.filename.replace(/\.[^.]+$/, ''); // Remove extension
  }
  if (titlePart) {
    parts.push(generateSlug(titlePart));
  }

  if (parts.length === 0) return '';

  // Join author and title with underscore
  let slug = parts.join('_');

  // Add language suffix for non-English documents
  if (doc.language && doc.language !== 'en') {
    slug = `${slug}_${doc.language}`;
  }

  return slug;
}

/**
 * Parse a document slug to extract base slug and language
 * Handles format: author_title_lang or author_title or title_lang or title
 *
 * @param {string} slug - The slug to parse
 * @returns {{ baseSlug: string, language: string|null }}
 *
 * @example
 * parseDocSlug("bahaullah_hidden-words") // { baseSlug: "bahaullah_hidden-words", language: null }
 * parseDocSlug("the-bab_address-to-believers_ar") // { baseSlug: "the-bab_address-to-believers", language: "ar" }
 * parseDocSlug("tablet_fa") // { baseSlug: "tablet", language: "fa" }
 */
export function parseDocSlug(slug) {
  if (!slug) return { baseSlug: '', language: null };

  // Check for language suffix (2-3 letter code after last underscore)
  // Language codes: ar, fa, en, es, fr, de, etc.
  const match = slug.match(/^(.+)_([a-z]{2,3})$/);
  if (match) {
    const possibleLang = match[2];
    // Common language codes we support
    const knownLangs = ['ar', 'fa', 'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'he', 'tr', 'ur', 'hi'];
    if (knownLangs.includes(possibleLang)) {
      return { baseSlug: match[1], language: possibleLang };
    }
  }

  return { baseSlug: slug, language: null };
}
