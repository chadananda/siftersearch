import { createHash } from 'crypto';

const md5 = (text) => createHash('md5').update(text).digest('hex');

// Stable combined disambiguation + HyPE instructions block
const INSTRUCTIONS_TEXT = `You are an expert semantic enrichment assistant. Your task involves two modes:

DISAMBIGUATION: Identify the specific entities, concepts, and contextual meaning of the target paragraph. Resolve ambiguous references using surrounding context. Output a structured JSON object with fields: entities, concepts, relations, context_summary.

HYPE (Hypothetical Paragraph Embeddings): Generate 3-5 hypothetical search queries that a user might type to find the target paragraph. These queries should represent different ways a reader might search for this content. Output a structured JSON array of query strings.

Instructions apply to all enrichment tasks. Always output valid JSON only.`;

export const buildInstructionsBlock = () => {
  const text = INSTRUCTIONS_TEXT;
  const hash = md5(text);
  return { text, hash };
};

export const buildBookMetaBlock = (doc) => {
  // Fixed field order: title|author|religion|collection|year|language|description
  const text = `BOOK METADATA\ntitle: ${doc.title}\nauthor: ${doc.author}\nreligion: ${doc.religion}\ncollection: ${doc.collection}\nyear: ${doc.year}\nlanguage: ${doc.language}\ndescription: ${doc.description}`;
  const hash = md5(text);
  return { text, hash };
};

export const buildWindowBlock = (paragraphs) => {
  // Each paragraph formatted as `[P{index}] {text}` using 1-based index
  const text = paragraphs.map((p, i) => `[P${i + 1}] ${p.text}`).join('\n');
  const hash = md5(text);
  return { text, hash };
};

// Recursively sort object keys for deterministic serialization
const sortedStringify = (val) => {
  if (Array.isArray(val)) return '[' + val.map(sortedStringify).join(',') + ']';
  if (val !== null && typeof val === 'object') {
    const sorted = Object.keys(val).sort().map(k => JSON.stringify(k) + ':' + sortedStringify(val[k]));
    return '{' + sorted.join(',') + '}';
  }
  return JSON.stringify(val);
};

export const buildObjectsBlock = (objects) => {
  const text = sortedStringify(objects);
  const hash = md5(text);
  return { text, hash };
};

export const buildTargetBlock = (mode, paragraphId) => {
  const text = mode === 'hype' ? `HYPE [P${paragraphId}]` : `DISAMBIGUATE [P${paragraphId}]`;
  return { text };
};
