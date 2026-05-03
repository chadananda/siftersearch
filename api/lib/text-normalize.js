// Shared text normalization + hashing primitives. Single source of truth so
// indexer.js, ingester.js, sites-ingester.js, and any future consumer can
// never drift on the regex used to strip formatting before computing the
// dedup hash. Drift here is silently corrupt: two implementations that
// disagree by a single regex flag produce different hashes for the same
// text, which makes the embedding cache miss when it should hit.

import { createHash } from 'crypto';

const HTML_TAG_RE = /<[^>]+>/g;
const NON_WORD_NUM_SPACE_RE = /[^\p{L}\p{N}\s]/gu;

/**
 * Normalize text for embedding deduplication.
 *
 * Strips HTML tags, collapses whitespace, removes punctuation (keeping only
 * Unicode letters, numbers, and spaces), lowercases. Two paragraphs that
 * differ only in formatting/punctuation produce the same normalized form
 * and therefore the same hash — so they share an embedding in the cache.
 */
export function normalizeForEmbedding(text) {
  return text
    .replace(HTML_TAG_RE, '')
    .replace(/\s+/g, ' ')
    .replace(NON_WORD_NUM_SPACE_RE, '')
    .toLowerCase()
    .trim();
}

/**
 * MD5 hash of the embedding-normalized form. Used as the dedup key in the
 * `content.normalized_hash` column. Cross-doc match is what powers the
 * embedding cache + sidecar harvest in the ingester.
 */
export function hashNormalized(text) {
  return createHash('md5').update(normalizeForEmbedding(text)).digest('hex');
}

/**
 * MD5 hash of the raw content (no normalization). Used for change-detection:
 * if a paragraph's text bytes differ, the hash differs. Used by the
 * library-watcher's mtime/file_hash short-circuit.
 */
export function hashContent(text) {
  return createHash('md5').update(text).digest('hex');
}
