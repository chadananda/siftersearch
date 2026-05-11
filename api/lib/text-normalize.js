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
 * Strip HTML and collapse whitespace for embedding input. Preserves case and
 * punctuation because embedding models are sensitive to both ("God" ≠ "god").
 * Use this when computing the text to pass to the embedding API.
 */
export function cleanForEmbedding(text) {
  return text.replace(HTML_TAG_RE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Aggressive normalization for hash-based dedup: strips HTML, punctuation,
 * and lowercases so two paragraphs differing only in formatting share one
 * embedding cache entry. Do NOT pass this output to the embedding API —
 * stripping punctuation/case degrades embedding quality.
 */
export function normalizeForHash(text) {
  return text
    .replace(HTML_TAG_RE, '')
    .replace(/\s+/g, ' ')
    .replace(NON_WORD_NUM_SPACE_RE, '')
    .toLowerCase()
    .trim();
}

/** @deprecated Use normalizeForHash */
export const normalizeForEmbedding = normalizeForHash;

/**
 * MD5 hash of the hash-normalized form. Used as the dedup key in the
 * `content.normalized_hash` column. Powers the embedding cache + sidecar
 * harvest in the ingester.
 */
export function hashNormalized(text) {
  return createHash('md5').update(normalizeForHash(text)).digest('hex');
}

/**
 * MD5 hash of the raw content (no normalization). Used for change-detection:
 * if a paragraph's text bytes differ, the hash differs. Used by the
 * library-watcher's mtime/file_hash short-circuit.
 */
export function hashContent(text) {
  return createHash('md5').update(text).digest('hex');
}
