// Rule-based Hebrew segmenter. No LLM — Hebrew has reliable punctuation cues
// (standard `.!?` plus sof pasuq `\u05C3`), and rabbinic texts often arrive
// pre-marked with sentence wrappers `⁅sN⁆...⁅/sN⁆` from earlier passes.
// Two strategies, in order of preference:
//   1. If markers are present, pack sentences greedily up to maxChars.
//   2. Otherwise, recursive splitter: paragraph → sentence → clause → word.
// Deps: ./markers.js for marker detection + stripping.

import { hasMarkers, stripMarkers } from './markers.js';

const SOF_PASUQ = '\u05C3';
const CLOSE_MARKER_RE = /\u2045\/s\d+\u2046/g;
const SENTENCE_TERMINATOR_RE = new RegExp(`(?<=[.!?${SOF_PASUQ}])\\s+`);
const CLAUSE_BOUNDARY_RE = /(?<=[;:])\s+/;
const SUBCLAUSE_BOUNDARY_RE = /(?<=[,])\s+/;
const PARAGRAPH_BREAK_RE = /\n{2,}/;
const ANY_WHITESPACE_RE = /\s+/;

const DEFAULT_MAX_CHARS = 3000;
const DEFAULT_MIN_CHARS = 20;

export function segmentHebrew(text, options = {}) {
  const { maxChars = DEFAULT_MAX_CHARS, minChars = DEFAULT_MIN_CHARS } = options;
  if (!text || typeof text !== 'string') return [];
  if (text.length <= maxChars) {
    const trimmed = text.trim();
    return trimmed.length >= minChars ? [trimmed] : [];
  }

  const chunks = hasMarkers(text)
    ? chunkBySentenceMarkers(text, maxChars)
    : recursiveSplit(text, maxChars);

  // Recursively re-split any chunk that's still too long (single overlong sentence)
  const final = [];
  for (const chunk of chunks) {
    if (chunk.length > maxChars) {
      final.push(...recursiveSplit(chunk, maxChars));
    } else {
      final.push(chunk);
    }
  }

  return final
    .map(c => stripMarkers(c).trim())
    .filter(c => c.length >= minChars);
}

function chunkBySentenceMarkers(text, maxChars) {
  const sentenceEnds = [];
  let m;
  while ((m = CLOSE_MARKER_RE.exec(text)) !== null) {
    sentenceEnds.push(m.index + m[0].length);
  }
  CLOSE_MARKER_RE.lastIndex = 0;
  if (sentenceEnds.length === 0) return [text];

  const chunks = [];
  let chunkStart = 0;

  for (let i = 0; i < sentenceEnds.length; i++) {
    const end = sentenceEnds[i];
    const nextEnd = sentenceEnds[i + 1];
    if (nextEnd && nextEnd - chunkStart > maxChars) {
      chunks.push(text.slice(chunkStart, end));
      chunkStart = end;
    }
  }
  if (chunkStart < text.length) chunks.push(text.slice(chunkStart));
  return chunks;
}

function recursiveSplit(text, maxChars) {
  const stripped = stripMarkers(text);
  const delimiters = [
    PARAGRAPH_BREAK_RE,
    SENTENCE_TERMINATOR_RE,
    CLAUSE_BOUNDARY_RE,
    SUBCLAUSE_BOUNDARY_RE,
    ANY_WHITESPACE_RE
  ];

  for (const delim of delimiters) {
    const parts = stripped.split(delim);
    if (parts.length < 2) continue;
    const chunks = greedyPack(parts, maxChars);
    const allFit = chunks.every(c => c.length <= maxChars);
    if (allFit) return chunks;
    // Some chunk still too long — recurse on the offenders
    return chunks.flatMap(c => c.length > maxChars ? recursiveSplit(c, maxChars) : [c]);
  }

  // Hard fallback: char-level cut. Only reached if no whitespace exists at all.
  const out = [];
  for (let i = 0; i < stripped.length; i += maxChars) {
    out.push(stripped.slice(i, i + maxChars));
  }
  return out;
}

function greedyPack(parts, maxChars) {
  const chunks = [];
  let current = '';
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const candidate = current ? `${current} ${trimmed}` : trimmed;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = trimmed;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
