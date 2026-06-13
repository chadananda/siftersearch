// AI duplicate adjudication. Decides whether two documents are the SAME
// underlying work (same text — possibly a different edition, translation, scan,
// OCR, or formatting) vs DISTINCT works. This is an analytical judgment over the
// actual content — NEVER title/author keyword or substring matching, which
// mislabeled e.g. "The Analects of Confucius (tr. James Legge)" as the "Epistle
// of James" and every "Ibn Ezra on <book>" commentary as the book itself.
//
// Fail-safe: any AI error, timeout, or unparseable answer returns
// { same: false } — we never mark a duplicate on uncertainty. See
// feedback_oceanlibrary_canonical and project_canonical_gutted_by_dedupe_20260609.
import { aiService } from './ai-services.js';
import { queryAll } from './db.js';
import { logger } from './logger.js';

// Pick a representative spread (start/middle/end) so the model can identify the
// work without being fed the whole text.
function sampleParas(paras, n = 8) {
  const texts = (paras || []).map(p => (typeof p === 'string' ? p : p.text || '').trim()).filter(Boolean);
  if (texts.length <= n) return texts;
  const out = [];
  const step = Math.max(1, Math.floor(texts.length / n));
  for (let i = 0; i < texts.length && out.length < n; i += step) out.push(texts[i]);
  return out;
}
const clip = (s, n = 500) => (s || '').slice(0, n);

/**
 * @param {{title, author, religion, paragraphs:Array<{text}>}} incoming
 * @param {number} candidateDocId  existing doc to compare against
 * @returns {Promise<{same:boolean, confidence:number, reason:string}>}
 */
export async function adjudicateSameWork(incoming, candidateDocId, { service = 'balanced' } = {}) {
  const meta = (await queryAll('SELECT title, author, religion FROM docs WHERE id = ?', [candidateDocId]))[0];
  if (!meta) return { same: false, confidence: 0, reason: 'candidate not found' };
  const candParas = await queryAll(
    'SELECT text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index LIMIT 500',
    [candidateDocId]
  );
  const aSample = sampleParas(incoming.paragraphs).map(t => clip(t)).join('\n— — —\n');
  const bSample = sampleParas(candParas).map(t => clip(t)).join('\n— — —\n');

  const system = 'You compare two documents and decide whether they are the SAME underlying work or DISTINCT works. You reason about the actual text, not titles. Respond with strict JSON only, no prose.';
  const user = [
    'Decide whether DOC A and DOC B are the SAME underlying work (the same text — possibly a different edition, translation, transliteration, scan/OCR, or paragraph formatting) or DISTINCT works.',
    '',
    'They are DISTINCT (NOT duplicates) when ANY of these hold:',
    '- one is a commentary, study guide, footnotes, or analysis OF the other (e.g. "Ibn Ezra on Amos" or "Malbim on Hosea" is NOT the Book of Amos/Hosea);',
    '- they are different works that merely share an author, translator, or a name (e.g. a translator named "James" vs the "Epistle of James"; "Songs of Kabir" in two traditions may still differ);',
    '- they are different volumes, parts, or selections; or one is an excerpt and the other the whole.',
    'They are SAME only when the two excerpt sets are substantively the same text.',
    '',
    `DOC A — title: ${incoming.title || '?'} | author: ${incoming.author || '?'} | tradition: ${incoming.religion || '?'}`,
    `A excerpts:\n${aSample || '(none)'}`,
    '',
    `DOC B — title: ${meta.title || '?'} | author: ${meta.author || '?'} | tradition: ${meta.religion || '?'}`,
    `B excerpts:\n${bSample || '(none)'}`,
    '',
    'Respond with JSON only: {"verdict":"same"|"distinct","confidence":0.0-1.0,"reason":"one short sentence"}',
  ].join('\n');

  let resp;
  try {
    resp = await aiService(service).chat(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { caller: 'dedup-adjudicator' }
    );
  } catch (e) {
    logger.warn({ err: e.message, candidateDocId }, 'dedup-adjudicator: AI call failed — treating as DISTINCT (safe default)');
    return { same: false, confidence: 0, reason: `ai error: ${e.message}` };
  }

  const text = (resp && resp.content) || '';
  let parsed = null;
  try { parsed = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]); } catch { /* fall through */ }
  if (!parsed || (parsed.verdict !== 'same' && parsed.verdict !== 'distinct')) {
    logger.warn({ candidateDocId, sample: text.slice(0, 200) }, 'dedup-adjudicator: unparseable verdict — treating as DISTINCT');
    return { same: false, confidence: 0, reason: 'unparseable verdict' };
  }
  return { same: parsed.verdict === 'same', confidence: Number(parsed.confidence) || 0, reason: parsed.reason || '' };
}
