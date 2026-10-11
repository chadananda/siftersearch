// File-level sentence segmentation of Arabic/Persian SOURCE files, done ONCE before ingest (Chad 10-11: "a one-time
// segmentation of all arabic documents at the file level as they arrive"). The edition's paragraphs are kept (never
// arbitrary splits — feedback_segmentation_semantic_only); each paragraph gets ⁅sN⁆ sentence markers from Haiku 5.5,
// which returns sentence ENDINGS only and never rewrites text (stripMarkers(result) must equal the input, else the
// paragraph is left unmarked). The file then declares `needs_segmentation: false`, so every ingest after this costs
// only embeddings. Calls stay far under Haiku's 100k-token price step (5× above). Deps: segmenter, markers, ai-context.
import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { dirname, join } from 'path';
import { batchAddSentenceMarkers } from '../../services/segmenter.js';
import { hasMarkers, validateMarkers, stripMarkers } from '../markers.js';
import { withAIContext } from '../ai-context.js';
import { getModel } from '../model-registry.js';

export const SEGMENT_MODEL = { provider: 'anthropic', model: 'claude-haiku-5-5' };
const BATCH_CHARS = 40000;        // ≈16–20k Arabic tokens per call: far below the 100k step, few calls
const CHARS_PER_TOKEN = 2.5;      // Arabic, measured order of magnitude (estimates only; the ledger records actuals)
const OUTPUT_TOKENS_PER_SENTENCE = 12, CHARS_PER_SENTENCE = 150;

const FM = /^---\n([\s\S]*?)\n---\n/;
/** A body block is TEXT when it carries Arabic-script letters and is not structure (heading, comment, page break). */
const isTextBlock = (b) => /[؀-ۿ]/.test(b) && !/^\s*(#|<!--|<pb\b|\{|\|)/.test(b);

/** body → alternating [block, separator, block, …] so the file is rebuilt byte-for-byte except the marked blocks */
export function splitBody(body) { return body.split(/(\n[ \t]*\n)/); }

/** The segmenter's own rule: ≥1 of . ! ? ؟ ؛ per 50 words → the text marks its own sentences (no model needed). */
export function isPunctuated(texts) {
  const words = texts.reduce((n, t) => n + t.split(/\s+/).length, 0);
  const enders = texts.reduce((n, t) => n + (t.match(/[.!?؟؛]/g) || []).length, 0);
  return words > 0 && enders * 50 >= words;
}

/** Dollar estimate for segmenting these texts with Haiku 5.5 (list price; batching would halve it). */
export function estimateUsd(texts) {
  const chars = texts.reduce((n, t) => n + t.length, 0);
  const p = getModel(SEGMENT_MODEL.model).pricing;
  const inTok = chars / CHARS_PER_TOKEN + (chars / BATCH_CHARS + 1) * 1500;          // text + prompt per call
  const outTok = (chars / CHARS_PER_SENTENCE) * OUTPUT_TOKENS_PER_SENTENCE;
  return Math.round((inTok * p.input + outTok * p.output) / 1000 * 100) / 100;
}

/** Set `needs_segmentation: false` (+ provenance) in the frontmatter; other keys untouched. */
export function markFrontmatter(text, stamp) {
  const m = text.match(FM);
  const lines = (m ? m[1] : '').split('\n').filter((l) => l && !/^(needs_segmentation|segmented_by):/.test(l));
  lines.unshift('needs_segmentation: false');
  if (stamp) lines.push(`segmented_by: '${stamp}'`);
  return `---\n${lines.join('\n')}\n---\n${m ? text.slice(m[0].length) : text}`;
}

/**
 * Segment one file. → { status, paragraphs, sentences, integrityFailures, estimateUsd }
 * status: already-marked · punctuated (flag only) · over-budget · would-segment (dry) · segmented
 * opts: apply, maxUsd (per file), lang ('ar'|'fa'), pilot (first N paragraphs → written to pilotOut, source untouched),
 *       backupDir (outside Dropbox), relPath (for the backup name)
 */
export async function segmentFile(absPath, { apply = false, maxUsd = 2, lang = 'ar', pilot = 0, pilotOut = null,
  backupDir = '/tank/sifter/segment-backups', relPath = null } = {}) {
  const text = await readFile(absPath, 'utf8');
  const fm = text.match(FM);
  const body = fm ? text.slice(fm[0].length) : text;
  if (hasMarkers(body) && validateMarkers(body).valid) return { status: 'already-marked' };
  const parts = splitBody(body);
  const idx = parts.map((b, i) => (i % 2 === 0 && isTextBlock(b) ? i : -1)).filter((i) => i >= 0);
  const target = pilot ? idx.slice(0, pilot) : idx;
  const texts = target.map((i) => parts[i].trim());
  if (!pilot && isPunctuated(texts)) {
    if (apply) await writeFile(absPath, markFrontmatter(text, null));
    return { status: 'punctuated', paragraphs: texts.length };
  }
  const est = estimateUsd(texts);
  if (est > maxUsd) return { status: 'over-budget', paragraphs: texts.length, estimateUsd: est };
  if (!apply && !pilot) return { status: 'would-segment', paragraphs: texts.length, estimateUsd: est };

  let results;
  try {
    results = await withAIContext({ stage: 'file-segment', sourceLang: lang, caller: 'file-segment', segmentationModel: SEGMENT_MODEL },
      () => batchAddSentenceMarkers(texts.map((t, j) => ({ id: String(j), text: t })), lang, { maxCharsPerBatch: BATCH_CHARS, strict: true }));
  } catch (err) {
    return { status: 'model-failed', paragraphs: texts.length, error: String(err.message || err).slice(0, 300) };   // file untouched
  }
  let sentences = 0, integrityFailures = 0;
  const out = [...parts];
  results.forEach((r, j) => {
    const i = target[j];
    if (stripMarkers(r.text) !== texts[j]) { integrityFailures++; return; }          // never trust a rewritten paragraph
    sentences += r.sentenceCount;
    out[i] = parts[i].replace(texts[j], r.text);
  });
  const newBody = out.join('');
  if (pilot) {
    await writeFile(pilotOut, target.map((i) => out[i].trim()).join('\n\n'));
    return { status: 'pilot', paragraphs: texts.length, sentences, integrityFailures, estimateUsd: est };
  }
  if (!validateMarkers(newBody).valid) return { status: 'invalid-markers', paragraphs: texts.length, integrityFailures };
  const backup = join(backupDir, `${relPath || absPath.replace(/^\//, '')}.${Date.now()}`);
  await mkdir(dirname(backup), { recursive: true });
  await copyFile(absPath, backup);
  await writeFile(absPath, markFrontmatter((fm ? fm[0] : '') + newBody, `${SEGMENT_MODEL.model} ${new Date().toISOString().slice(0, 10)}`));
  return { status: 'segmented', paragraphs: texts.length, sentences, integrityFailures, estimateUsd: est, backup };
}
