/**
 * Authority Configuration Loader and Utilities
 *
 * Provides doctrinal weight values for documents based on:
 * 1. Author (highest priority)
 * 2. Collection within Religion
 * 3. Religion default
 * 4. Global default
 */

import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../../data/authority-config.yml');

let authorityConfig = null;

/**
 * Load and cache the authority configuration
 */
function loadConfig() {
  if (authorityConfig) return authorityConfig;

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    authorityConfig = parseYaml(content);
  } catch (err) {
    console.warn('Failed to load authority config, using defaults:', err.message);
    authorityConfig = {
      default_authority: 5,
      religions: {},
      collections: {},
      authors: {}
    };
  }

  return authorityConfig;
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
  // If document has explicit authority set, use it
  if (doc.authority !== null && doc.authority !== undefined) {
    return Math.min(10, Math.max(1, doc.authority));
  }

  const config = loadConfig();
  const { author, religion, collection } = doc;

  // Check author-based authority first (highest priority)
  if (author && config.authors) {
    for (const [authorPattern, authorityValue] of Object.entries(config.authors)) {
      if (author.includes(authorPattern)) {
        return authorityValue;
      }
    }
  }

  // Check collection-specific authority
  if (religion && collection && config.collections?.[religion]) {
    const collectionAuthority = config.collections[religion][collection];
    if (collectionAuthority !== undefined) {
      return collectionAuthority;
    }
  }

  // Check religion default
  if (religion && config.religions?.[religion]) {
    return config.religions[religion];
  }

  // Return global default
  return config.default_authority || 5;
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
 * Get the authority configuration for display purposes
 *
 * @returns {Object} The full authority configuration
 */
export function getAuthorityConfig() {
  return loadConfig();
}

/**
 * Reload the authority configuration (for hot-reloading)
 */
export function reloadConfig() {
  authorityConfig = null;
  return loadConfig();
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
