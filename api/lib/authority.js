/**
 * Authority Configuration from Library Metadata
 *
 * Reads doctrinal weight values from the library's meta.yaml files:
 * - .religion/meta.yaml - Religion-level defaults
 * - .collection/meta.yaml - Collection-level defaults
 *
 * Priority order:
 * 1. Document's explicit `authority` field (frontmatter override)
 * 2. Collection's meta.yaml authority (primary source)
 * 3. Religion's meta.yaml authority
 * 4. Author-based authority (Central Figures fallback)
 * 5. Global default (5)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { join } from 'path';
import { config } from './config.js';

// Cache for authority values from library meta.yaml files
let libraryAuthority = null;
let lastLoadTime = 0;
const CACHE_TTL_MS = 60000; // Reload every 60 seconds

// Author-based authority overrides (Central Figures, institutions, primary scripture authors).
// Matched by exact equality — avoids false positives like "Muhammad Husayn Tabatabai"
// matching the prophet "Muhammad" or "John Calvin" matching the apostle "John".
// OceanLibrary stores individual book authors as the canonical name (e.g. "Matthew",
// "John", "Siddhartha Buddha") — exact match is safe and necessary here.
const AUTHOR_AUTHORITY = {
  // Bahá'í Central Figures
  "Bahá'u'lláh": 10,
  "Baha'u'llah": 10,
  "The Báb": 10,
  "The Bab": 10,
  "'Abdu'l-Bahá": 9,
  "Abdu'l-Baha": 9,
  "Abdul-Baha": 9,
  "Shoghi Effendi": 9,
  "Universal House of Justice": 8,
  // Islamic scripture — OceanLibrary Quran surahs have author="Muhammad" (exact)
  "Muhammad": 10,
  // Christian scripture — OceanLibrary individual Gospel/Epistle books
  "Matthew": 10,
  "Mark": 10,
  "Luke": 10,
  "John": 10,
  "Paul": 10,
  // Buddhist primary texts — OceanLibrary attribution
  "Siddhartha Buddha": 10,
  "Gautama Buddha": 10,
  "The Buddha": 10,
};

const DEFAULT_AUTHORITY = 5;

/**
 * Load authority values from library's meta.yaml files
 */
function loadLibraryAuthority() {
  const now = Date.now();
  if (libraryAuthority && (now - lastLoadTime) < CACHE_TTL_MS) {
    return libraryAuthority;
  }

  libraryAuthority = {
    religions: {},      // religion -> authority
    collections: {},    // religion -> { collection -> authority }
    religionMeta: {},   // religion -> full meta object
    collectionMeta: {}, // religion -> { collection -> full meta object }
  };

  const basePath = config.library.basePath;
  if (!basePath) {
    console.warn('No library basePath configured');
    return libraryAuthority;
  }

  try {
    // Scan religion directories
    const religions = readdirSync(basePath).filter(item => {
      const fullPath = join(basePath, item);
      try {
        return statSync(fullPath).isDirectory() && !item.startsWith('.');
      } catch { return false; }
    });

    for (const religion of religions) {
      const religionPath = join(basePath, religion);

      // Check for .religion/meta.yaml
      const religionMetaPath = join(religionPath, '.religion', 'meta.yaml');
      try {
        const content = readFileSync(religionMetaPath, 'utf-8');
        const meta = parseYaml(content);
        libraryAuthority.religionMeta[religion] = meta;
        if (meta.authority !== undefined) {
          libraryAuthority.religions[religion] = meta.authority;
        }
      } catch { /* No religion meta */ }

      // Scan collection directories
      libraryAuthority.collections[religion] = {};
      libraryAuthority.collectionMeta[religion] = {};

      const collections = readdirSync(religionPath).filter(item => {
        const fullPath = join(religionPath, item);
        try {
          return statSync(fullPath).isDirectory() && !item.startsWith('.');
        } catch { return false; }
      });

      for (const collection of collections) {
        const collectionMetaPath = join(religionPath, collection, '.collection', 'meta.yaml');
        try {
          const content = readFileSync(collectionMetaPath, 'utf-8');
          const meta = parseYaml(content);
          libraryAuthority.collectionMeta[religion][collection] = meta;
          if (meta.authority !== undefined) {
            libraryAuthority.collections[religion][collection] = meta.authority;
          }
        } catch { /* No collection meta */ }
      }
    }

    lastLoadTime = now;
  } catch (err) {
    console.error('Failed to load library authority:', err.message);
  }

  return libraryAuthority;
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
export function getAuthority(doc) {
  // 1. If document has explicit authority set, use it
  if (doc.authority !== null && doc.authority !== undefined) {
    return Math.min(10, Math.max(1, Number(doc.authority)));
  }

  const libAuth = loadLibraryAuthority();
  const { religion, collection, source_site } = doc;

  // 2. Check collection-specific authority from meta.yaml (primary source)
  if (religion && collection && libAuth.collections[religion]?.[collection] !== undefined) {
    return libAuth.collections[religion][collection];
  }

  // 3. Author-based authority for primary scripture authors (Central Figures, prophets).
  // Checked BEFORE religion default so e.g. OceanLibrary Quran surahs (author="Muhammad",
  // no collection authority) get 10 rather than the Islam religion default of 6.
  // Uses exact string equality to avoid false positives like "Muhammad Husayn Tabatabai".
  if (doc.author && AUTHOR_AUTHORITY[doc.author] !== undefined) {
    return AUTHOR_AUTHORITY[doc.author];
  }

  // 4. Check religion default from meta.yaml
  if (religion && libAuth.religions[religion] !== undefined) {
    return libAuth.religions[religion];
  }

  // 5. External-site authority floor from sites.yaml. Lazy-load to avoid
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

  // 6. Return global default
  return DEFAULT_AUTHORITY;
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
