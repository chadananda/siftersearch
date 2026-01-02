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
