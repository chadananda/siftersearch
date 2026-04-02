import { createHash } from 'crypto';

const md5 = (text) => createHash('md5').update(text).digest('hex');

export const computeArtifactCacheKey = ({ instructionsHash, bookMetaHash, windowHash, objectsHash, taskMode, targetParagraphId, pipelineVersion }) => {
  const raw = `${instructionsHash}|${bookMetaHash}|${windowHash}|${objectsHash}|${taskMode}|${targetParagraphId}|${pipelineVersion}`;
  return md5(raw);
};

// Signature: (cacheKey, db) — key first, db second (matches test usage)
export const isArtifactCached = (cacheKey, db) => {
  const row = db.prepare('SELECT cache_key FROM content_enrichment WHERE cache_key = ?').get(cacheKey);
  return row != null;
};

export const buildSlidingWindows = (paragraphs, N) => {
  const windows = [];
  let start = 0;
  while (start < paragraphs.length) {
    const slice = paragraphs.slice(start, start + 2 * N);
    if (slice.length === 0) break;
    const targetParagraphs = slice.slice(N);
    windows.push({ paragraphs: slice, targetParagraphs });
    // next window starts at start + N (overlap by N)
    if (slice.length < 2 * N) break;
    start += N;
  }
  return windows;
};
