/**
 * Authority Configuration from Library Metadata
 *
 * Reads doctrinal weight values from the library's meta.yaml files:
 * - .religion/meta.yaml - Religion-level defaults
 * - .collection/meta.yaml - Collection-level defaults
 *
 * Priority order:
 * 1. Document's explicit `authority` field (frontmatter override)
 * 2. Author-based authority (Central Figures, etc.)
 * 3. Collection's meta.yaml authority
 * 4. Religion's meta.yaml authority
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

// Author-based authority overrides (Central Figures, institutions)
const AUTHOR_AUTHORITY = {
  "Bahá'u'lláh": 10,
  "Baha'u'llah": 10,
  "The Báb": 10,
  "The Bab": 10,
  "'Abdu'l-Bahá": 9,
  "Abdu'l-Baha": 9,
  "Abdul-Baha": 9,
  "Shoghi Effendi": 9,
  "Universal House of Justice": 8,
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

  // 2. Check author-based authority (Central Figures)
  if (doc.author) {
    for (const [authorPattern, authorityValue] of Object.entries(AUTHOR_AUTHORITY)) {
      if (doc.author.includes(authorPattern)) {
        return authorityValue;
      }
    }
  }

  const libAuth = loadLibraryAuthority();
  const { religion, collection } = doc;

  // 3. Check collection-specific authority from meta.yaml
  if (religion && collection && libAuth.collections[religion]?.[collection] !== undefined) {
    return libAuth.collections[religion][collection];
  }

  // 4. Check religion default from meta.yaml
  if (religion && libAuth.religions[religion] !== undefined) {
    return libAuth.religions[religion];
  }

  // 5. Return global default
  return DEFAULT_AUTHORITY;
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
