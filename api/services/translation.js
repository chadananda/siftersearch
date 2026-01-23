/**
 * Translation Service
 *
 * Handles document translation with caching to prevent duplicate work.
 * Uses AI providers for translation with quality options.
 */

// Removed: getMeili, INDEXES - translation uses LibSQL as source of truth
import { query, queryOne, queryAll } from '../lib/db.js';
import { aiService } from '../lib/ai-services.js';
import { logger } from '../lib/logger.js';
import {
  JOB_TYPES,
  JOB_STATUS,
  createJob,
  updateJobStatus,
  generateContentHash,
  checkCache,
  storeInCache,
  updateJobCheckpoint
} from './jobs.js';

// API call timeout (60 seconds)
const API_TIMEOUT_MS = parseInt(process.env.TRANSLATION_TIMEOUT_MS || '60000', 10);

// Batching configuration
const MAX_BATCH_TOKENS = parseInt(process.env.MAX_BATCH_TOKENS || '4000', 10);
const CHARS_PER_TOKEN = 4; // Rough estimate for Arabic/Persian
const BATCH_CONCURRENCY = parseInt(process.env.BATCH_CONCURRENCY || '2', 10); // Parallel batch processing
import { chatCompletion } from '../lib/ai.js';
import fs from 'fs/promises';
import path from 'path';
import { getSentences, stripMarkers, hasMarkers } from '../lib/markers.js';
import { segmentText } from './segmenter.js';
import { writeMarkersToSource } from './ingester.js';

/**
 * Parse TOON (TOML-like Object Notation) format
 * Handles: key = "value", [[array]], [section]
 * More compact than JSON, easier for AI to generate correctly
 */
function parseTOON(text) {
  const result = {};
  let currentArray = null;
  let currentSection = null;
  let currentItem = null;

  const lines = text.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Array item: [[array_name]] or [[section.array_name]]
    const arrayMatch = line.match(/^\[\[([^\]]+)\]\]$/);
    if (arrayMatch) {
      const name = arrayMatch[1];
      const parts = name.split('.');
      if (parts.length === 2) {
        // Nested array like [[p1.segments]]
        const [section, arr] = parts;
        if (!result[section]) result[section] = {};
        if (!result[section][arr]) result[section][arr] = [];
        currentArray = result[section][arr];
      } else {
        // Top-level array like [[segments]]
        if (!result[name]) result[name] = [];
        currentArray = result[name];
      }
      currentItem = {};
      currentArray.push(currentItem);
      currentSection = null;
      continue;
    }

    // Section: [section_name]
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!result[currentSection]) result[currentSection] = {};
      currentArray = null;
      currentItem = null;
      continue;
    }

    // Key-value: key = "value" or key = 'value'
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      let value = rawValue.trim();

      // Handle quoted strings (with escape sequences)
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '\\');
      }

      // Determine where to store
      if (currentItem) {
        currentItem[key] = value;
      } else if (currentSection) {
        result[currentSection][key] = value;
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Extract TOON content from text that may contain explanatory prose
 * LLMs often add explanations despite instructions - this extracts just the structured content
 */
function extractTOONContent(text) {
  // Remove markdown code blocks
  let cleaned = text.trim();
  if (cleaned.includes('```')) {
    // Extract content between code fences
    const codeBlockMatch = cleaned.match(/```(?:toml|toon|json)?\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1];
    } else {
      // Just strip the markers
      cleaned = cleaned.replace(/```(?:toml|toon|json)?/g, '');
    }
  }

  // Find the first TOON key-value pattern (reading = ", study = ", etc.)
  // This marks the start of actual TOON content
  const toonStartPatterns = [
    /^reading\s*=/m,
    /^study\s*=/m,
    /^\[\[/m,           // Array start
    /^\[[a-zA-Z]/m      // Section start
  ];

  let startIndex = cleaned.length;
  for (const pattern of toonStartPatterns) {
    const match = cleaned.match(pattern);
    if (match && match.index < startIndex) {
      startIndex = match.index;
    }
  }

  // If we found a start point, extract from there
  if (startIndex < cleaned.length) {
    cleaned = cleaned.substring(startIndex);
  }

  // Remove any trailing explanatory text after the TOON content
  // Look for patterns that indicate prose started (after the last TOON element)
  const lines = cleaned.split('\n');
  const toonLines = [];
  let inToon = false;
  let lastToonLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Valid TOON patterns
    const isToonLine = (
      line.startsWith('[[') ||                           // Array item
      line.startsWith('[') && line.endsWith(']') ||      // Section
      line.match(/^[a-zA-Z_]\w*\s*=/) ||                 // Key = value
      line === '' ||                                      // Blank lines OK
      line.startsWith('#')                                // Comments OK
    );

    if (isToonLine) {
      inToon = true;
      lastToonLine = i;
      toonLines.push(lines[i]);
    } else if (inToon) {
      // Check if this looks like prose (sentences, explanations)
      const looksLikeProse = (
        line.length > 80 ||                              // Long lines likely prose
        line.match(/^(Note|This|The|Here|I |In |To )/) || // Common prose starts
        line.match(/[.!?]$/) && !line.match(/^[a-zA-Z_].*=/) // Sentences
      );

      if (looksLikeProse) {
        // Stop here, we've hit explanatory text
        break;
      }
      // Otherwise, might be a continued value or something, include it
      toonLines.push(lines[i]);
      lastToonLine = i;
    }
  }

  return toonLines.join('\n').trim();
}

/**
 * Try to parse as TOON, fall back to JSON if it fails
 * Robust against LLM adding explanatory text before/after the structured content
 */
function parseAIResponse(text) {
  // First, try to extract clean TOON content
  const cleaned = extractTOONContent(text);

  // Try TOON first (simpler syntax, less error-prone for AI)
  try {
    const result = parseTOON(cleaned);
    // Validate we got something useful (at minimum: reading or study)
    if (result.reading || result.study || Object.keys(result).length > 0) {
      return result;
    }
  } catch {
    // Fall through to JSON
  }

  // Try JSON as fallback (also extract from explanatory text)
  try {
    // Look for JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // JSON parse failed
  }

  // Last resort: try the whole cleaned text as JSON
  return JSON.parse(cleaned);
}

// Supported languages
export const SUPPORTED_LANGUAGES = {
  en: 'English',
  ar: 'Arabic',
  fa: 'Persian (Farsi)',
  he: 'Hebrew',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  hi: 'Hindi',
  ur: 'Urdu',
  tr: 'Turkish',
  ru: 'Russian',
  pt: 'Portuguese',
  it: 'Italian'
};

// Output directory for translations
const TRANSLATIONS_DIR = process.env.TRANSLATIONS_DIR || './data/translations';

/**
 * Wrap an AI call with a timeout
 * Uses AbortController to cancel long-running requests
 */
async function withTimeout(promise, timeoutMs = API_TIMEOUT_MS, context = 'API call') {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${context} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Process items in parallel with concurrency limit
 * Like p-map but simpler, no external dependency
 */
async function parallelMap(items, fn, concurrency = 2) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  // Start concurrent workers
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

/**
 * Create dynamic batches based on token count
 * Groups paragraphs until MAX_BATCH_TOKENS is reached
 */
function createTokenBatches(paragraphs) {
  const batches = [];
  let currentBatch = [];
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = Math.ceil(para.text.length / CHARS_PER_TOKEN);

    // If adding this paragraph would exceed limit and we have items, start new batch
    if (currentTokens + paraTokens > MAX_BATCH_TOKENS && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [para];
      currentTokens = paraTokens;
    } else {
      currentBatch.push(para);
      currentTokens += paraTokens;
    }
  }

  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Request a document translation
 * Returns job ID for tracking
 *
 * Generates BOTH reading and study translations simultaneously.
 *
 * @param contentType - 'scripture' | 'historical' | 'auto' (default)
 *   - scripture: Shoghi Effendi biblical style throughout
 *   - historical: Modern English with biblical citations
 *   - auto: Detect from document collection
 */
export async function requestTranslation({
  userId,
  documentId,
  targetLanguage,
  sourceLanguage = null,
  notifyEmail,
  quality = 'standard', // standard, high
  contentType = null // scripture, historical, auto (null = auto-detect from collection)
}) {
  if (!SUPPORTED_LANGUAGES[targetLanguage]) {
    throw new Error(`Unsupported target language: ${targetLanguage}`);
  }

  // Create job
  const job = await createJob({
    type: JOB_TYPES.TRANSLATION,
    userId,
    documentId,
    params: {
      targetLanguage,
      sourceLanguage,
      quality,
      contentType
    },
    notifyEmail
  });

  return job;
}

/**
 * Process a translation job
 * Called by job worker
 *
 * Two modes:
 * 1. In-app translation (targetLanguage = 'en', source = ar/fa): Saves to content.translation
 * 2. File-based translation: Saves to files for download
 */
export async function processTranslationJob(job) {
  // Debug: log full job structure to trace undefined values
  logger.info({
    jobId: job.id,
    jobKeys: Object.keys(job),
    document_id: job.document_id,
    documentIdPresent: 'document_id' in job,
    rawJob: JSON.stringify(job).substring(0, 500)
  }, 'Job received for processing');

  const { document_id: documentId, params } = job;
  const { targetLanguage, sourceLanguage, quality, contentType: requestedContentType } = params;

  logger.info({ jobId: job.id, documentId, targetLanguage }, 'Starting translation job');

  await updateJobStatus(job.id, JOB_STATUS.PROCESSING);

  try {
    // Get document metadata from LibSQL (source of truth)
    const document = await queryOne('SELECT * FROM docs WHERE id = ?', [documentId]);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }
    const detectedSourceLang = sourceLanguage || document.language || 'en';

    // Detect content type from collection if not explicitly specified
    const contentType = requestedContentType || detectContentType(document.collection);
    logger.info({ documentId, collection: document.collection, contentType }, 'Content type detected');

    // Skip if already in target language
    if (detectedSourceLang === targetLanguage) {
      throw new Error('Document is already in target language');
    }

    // In-app translation mode: Arabic/Persian -> English, save to content table
    const isInAppTranslation = targetLanguage === 'en' && ['ar', 'fa', 'he', 'ur'].includes(detectedSourceLang);

    if (isInAppTranslation) {
      return await processInAppTranslation(job, document, detectedSourceLang, contentType);
    }

    // File-based translation mode (original behavior for export)
    // Get all segments from LibSQL (source of truth)
    const segments = await queryAll(`
      SELECT id, paragraph_index, text, blocktype
      FROM content
      WHERE doc_id = ?
      ORDER BY paragraph_index
    `, [documentId]);
    const totalSegments = segments.length;

    await updateJobStatus(job.id, JOB_STATUS.PROCESSING, { totalItems: totalSegments });

    // Process each segment
    const translatedSegments = [];
    let processedCount = 0;
    let cachedCount = 0;

    for (const segment of segments) {
      const contentHash = generateContentHash(segment.text);

      // Check cache first
      const cached = await checkCache({
        documentId,
        segmentId: segment.id,
        processType: 'translation',
        targetLanguage,
        contentHash
      });

      let translatedText;

      if (cached) {
        // Read from cache
        try {
          translatedText = await fs.readFile(cached.result_path, 'utf-8');
          cachedCount++;
        } catch (err) {
          // Cache file missing, re-translate
          logger.warn({ segmentId: segment.id }, 'Cache file missing, re-translating');
          translatedText = await translateText(segment.text, detectedSourceLang, targetLanguage, quality, contentType);
        }
      } else {
        // Translate with content-type awareness
        translatedText = await translateText(segment.text, detectedSourceLang, targetLanguage, quality, contentType);

        // Store in cache
        const segmentPath = await saveSegmentTranslation(documentId, segment.id, targetLanguage, translatedText);
        await storeInCache({
          documentId,
          segmentId: segment.id,
          processType: 'translation',
          sourceLanguage: detectedSourceLang,
          targetLanguage,
          contentHash,
          resultPath: segmentPath,
          fileSize: Buffer.byteLength(translatedText, 'utf-8')
        });
      }

      translatedSegments.push({
        ...segment,
        original_text: segment.text,
        text: translatedText,
        source_language: detectedSourceLang,
        target_language: targetLanguage
      });

      processedCount++;

      // Update progress every 10 segments
      if (processedCount % 10 === 0) {
        await updateJobStatus(job.id, JOB_STATUS.PROCESSING, { progress: processedCount });
      }
    }

    // Save complete translated document
    const outputPath = await saveTranslatedDocument(documentId, targetLanguage, {
      document: {
        ...document,
        original_language: detectedSourceLang,
        translated_language: targetLanguage
      },
      segments: translatedSegments
    });

    // Generate download URL
    const resultUrl = `/api/translations/download/${job.id}`;

    await updateJobStatus(job.id, JOB_STATUS.COMPLETED, {
      resultPath: outputPath,
      resultUrl,
      progress: totalSegments
    });

    logger.info({
      jobId: job.id,
      documentId,
      totalSegments,
      cachedCount,
      translatedCount: totalSegments - cachedCount
    }, 'Translation job completed');

    return {
      success: true,
      resultUrl,
      stats: {
        total: totalSegments,
        cached: cachedCount,
        translated: totalSegments - cachedCount
      }
    };

  } catch (err) {
    logger.error({ jobId: job.id, err: err.message }, 'Translation job failed');
    await updateJobStatus(job.id, JOB_STATUS.FAILED, { errorMessage: err.message });
    throw err;
  }
}

/**
 * Build document context for translation prompts
 * Includes title, author, abstract, and collection info
 */
function buildDocumentContext(document) {
  const parts = [];

  if (document.title) {
    parts.push(`Title: ${document.title}`);
  }
  if (document.author) {
    parts.push(`Author: ${document.author}`);
  }
  if (document.collection) {
    parts.push(`Collection: ${document.collection}`);
  }
  if (document.abstract || document.description) {
    parts.push(`Abstract: ${document.abstract || document.description}`);
  }

  return parts.length > 0
    ? `## Document Context\n${parts.join('\n')}\n`
    : '';
}

/**
 * Organize paragraphs into staggered waves for context-rich translation
 * Wave pattern: 1, 11, 21... then 2, 12, 22... etc.
 * This allows previous paragraphs to be translated before their successors
 */
function organizeIntoWaves(paragraphs, stride = 10) {
  const waves = [];
  const totalParagraphs = paragraphs.length;

  // Generate wave order by interleaving based on array position, not paragraph_index
  // Wave pattern: positions 0, stride, 2*stride... then 1, stride+1, 2*stride+1... etc.
  // This works correctly even when paragraph_index values are non-consecutive (e.g., 97, 99, 101...)
  for (let offset = 0; offset < stride && offset < totalParagraphs; offset++) {
    const wave = [];
    for (let i = offset; i < totalParagraphs; i += stride) {
      // Access by array position, not paragraph_index
      wave.push(paragraphs[i]);
    }
    if (wave.length > 0) {
      waves.push(wave);
    }
  }

  return waves;
}

/**
 * Parse existing translation field (handles both legacy string and new JSON format)
 * Returns: { reading, study, segments, notes } or null
 */
function parseExistingTranslation(translationField) {
  if (!translationField) return null;

  try {
    const parsed = JSON.parse(translationField);
    if (typeof parsed === 'object' && parsed !== null && (parsed.reading || parsed.study)) {
      return parsed;
    }
  } catch {
    // Not JSON - legacy string format (treat as reading translation)
    return { reading: translationField, study: null, segments: null, notes: null };
  }

  return null;
}

/**
 * Auto-segment paragraphs that are missing sentence markers
 * This ensures phrase-level highlighting works in SBS mode
 *
 * @param {number} documentId - Document ID
 * @param {string} language - Document language (ar, fa, etc.)
 * @param {Array} paragraphs - Paragraphs from database
 * @returns {Promise<boolean>} True if any paragraphs were segmented
 */
async function autoSegmentMissingMarkers(documentId, language, paragraphs) {
  const paragraphsNeedingSegmentation = paragraphs.filter(p => !hasMarkers(p.text));

  if (paragraphsNeedingSegmentation.length === 0) {
    return false; // All paragraphs already have markers
  }

  logger.info({
    documentId,
    totalParagraphs: paragraphs.length,
    needingSegmentation: paragraphsNeedingSegmentation.length
  }, 'Auto-segmenting paragraphs missing sentence markers');

  let segmentedCount = 0;

  for (const para of paragraphsNeedingSegmentation) {
    try {
      // Run AI segmentation on this paragraph
      const result = await segmentText(para.text, {
        language,
        maxChunkSize: 1500
      });

      if (result && result.markedText) {
        // Update database with marked text
        await query(
          'UPDATE content SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [result.markedText, para.id]
        );

        segmentedCount++;
        logger.info({
          paragraphId: para.id,
          paragraphIndex: para.paragraph_index,
          sentences: result.segments?.length || 0
        }, 'Added sentence markers to paragraph');
      }
    } catch (err) {
      logger.warn({
        paragraphId: para.id,
        error: err.message
      }, 'Failed to segment paragraph - continuing without markers');
      // Continue with other paragraphs
    }
  }

  if (segmentedCount > 0) {
    logger.info({
      documentId,
      segmentedCount
    }, 'Auto-segmentation complete - markers added to paragraphs');
    return true;
  }

  return false;
}

/**
 * Process in-app translation (Arabic/Persian -> English)
 * Generates BOTH reading and study translations simultaneously
 * Saves to content.translation as JSON: { reading, study, segments, notes }
 *
 * Enhanced with:
 * - Document metadata context (title, author, abstract)
 * - Wave-based staggered translation for context propagation
 * - Previous paragraph context (original + translation when available)
 * - Dual translation: reading (literary) + study (literal with notes)
 * - Auto-segmentation for paragraphs missing sentence markers
 */
async function processInAppTranslation(job, document, sourceLang, contentType) {
  const documentId = job.document_id;

  // Debug: log job structure to trace undefined values
  logger.info({
    jobId: job.id,
    jobKeys: Object.keys(job),
    documentId,
    documentIdType: typeof documentId,
    hasDocumentId: documentId !== undefined
  }, 'processInAppTranslation starting (dual translation mode)');

  if (!documentId) {
    throw new Error(`document_id is ${documentId} (type: ${typeof documentId})`);
  }

  // Build document context for prompts
  const documentContext = buildDocumentContext(document);

  // Get paragraphs that need any translation
  // We'll check existing JSON to see what's missing
  let paragraphs = await queryAll(`
    SELECT id, paragraph_index, text, translation
    FROM content
    WHERE doc_id = ?
    ORDER BY paragraph_index
  `, [documentId]);

  // Auto-segment paragraphs missing sentence markers (needed for SBS phrase highlighting)
  // This happens automatically during translation to fix documents incrementally
  const markersAdded = await autoSegmentMissingMarkers(documentId, sourceLang, paragraphs);

  if (markersAdded) {
    // Write markers back to source file for persistence
    try {
      const markedParagraphs = await queryAll(`
        SELECT paragraph_index, text
        FROM content
        WHERE doc_id = ?
        ORDER BY paragraph_index
      `, [documentId]);

      await writeMarkersToSource(documentId, document.file_path, markedParagraphs);

      logger.info({ documentId }, 'Markers written to source file');
    } catch (err) {
      logger.warn({
        documentId,
        error: err.message
      }, 'Failed to write markers to source file - markers saved in database only');
      // Non-fatal - markers are in DB, translation can continue
    }

    // Reload paragraphs to get the marked text
    paragraphs = await queryAll(`
      SELECT id, paragraph_index, text, translation
      FROM content
      WHERE doc_id = ?
      ORDER BY paragraph_index
    `, [documentId]);
  }

  // Check if we're resuming from a checkpoint
  const resumeFromCheckpoint = job.last_checkpoint || 0;
  if (resumeFromCheckpoint > 0) {
    logger.info({
      jobId: job.id,
      documentId,
      resumeFromCheckpoint
    }, 'Resuming translation from checkpoint');
  }

  // Count paragraphs that already have complete translations (both reading AND study)
  // These should be reflected in progress to avoid "98% -> 0%" jumps
  const alreadyTranslatedCount = paragraphs.filter(p => {
    const existing = parseExistingTranslation(p.translation);
    return existing && existing.reading && existing.study;
  }).length;

  // Filter to paragraphs that need translation (missing reading OR study)
  // and haven't been processed in previous runs (paragraph_index > checkpoint)
  const paragraphsNeedingTranslation = paragraphs.filter(p => {
    // Skip paragraphs before the checkpoint (already processed)
    if (p.paragraph_index < resumeFromCheckpoint) {
      return false;
    }
    const existing = parseExistingTranslation(p.translation);
    return !existing || !existing.reading || !existing.study;
  });

  const totalParagraphs = paragraphs.length;  // Total paragraphs in document
  const needingTranslation = paragraphsNeedingTranslation.length;

  // Start progress at already-translated count (or checkpoint if resuming)
  const startingProgress = Math.max(resumeFromCheckpoint, alreadyTranslatedCount);

  if (needingTranslation === 0) {
    logger.info({ jobId: job.id, documentId, alreadyTranslatedCount }, 'No paragraphs need translation');
    await updateJobStatus(job.id, JOB_STATUS.COMPLETED, {
      progress: totalParagraphs,
      totalItems: totalParagraphs
    });
    return { success: true, translated: 0, alreadyComplete: alreadyTranslatedCount };
  }

  await updateJobStatus(job.id, JOB_STATUS.PROCESSING, {
    totalItems: totalParagraphs,
    progress: startingProgress  // Start from already-translated count
  });

  logger.info({
    jobId: job.id,
    documentId,
    totalParagraphs,
    alreadyTranslatedCount,
    needingTranslation,
    startingProgress
  }, 'Translation job starting with existing progress');

  // Build a map for looking up previous paragraphs (including already-translated ones)
  // Parse existing translations to get reading text for context
  const paragraphMap = new Map(paragraphs.map(p => {
    const existing = parseExistingTranslation(p.translation);
    return [p.paragraph_index, {
      ...p,
      readingTranslation: existing?.reading || null
    }];
  }));

  // Separate paragraphs into full translations vs partial resumes
  const fullTranslationParas = [];
  const partialParas = [];

  for (const para of paragraphsNeedingTranslation) {
    const existing = parseExistingTranslation(para.translation);
    const needsReading = !existing?.reading;
    const needsStudy = !existing?.study;

    if (needsReading && needsStudy) {
      fullTranslationParas.push({ ...para, existing: null });
    } else if (needsReading || needsStudy) {
      partialParas.push({ ...para, existing, needsReading, needsStudy });
    }
  }

  // Organize full translations into staggered order for better context distribution
  // With BATCH_CONCURRENCY workers, start from positions 0, N, 2N, 3N... where N = total/concurrency
  const staggeredParas = organizeIntoWaves(fullTranslationParas, BATCH_CONCURRENCY).flat();

  // Create token-based batches from staggered paragraphs
  const allBatches = createTokenBatches(staggeredParas);

  logger.info({
    jobId: job.id,
    totalParagraphs,
    fullTranslationCount: fullTranslationParas.length,
    partialCount: partialParas.length,
    batchCount: allBatches.length,
    concurrency: BATCH_CONCURRENCY
  }, 'Starting concurrent translation with rolling queue');

  let translatedCount = 0;
  let batchIndex = 0;

  // Process a single batch - shared by all concurrent workers
  async function processBatch(batch) {
    try {
      const firstPara = batch[0];
      const prevPara = paragraphMap.get(firstPara.paragraph_index - 1);
      const prevContext = prevPara ? {
        original: prevPara.text,
        translation: prevPara.readingTranslation || null
      } : null;

      const batchResults = await translateBatchCombined({
        paragraphs: batch,
        sourceLang,
        targetLang: 'en',
        contentType,
        documentContext,
        previousParagraph: prevContext
      });

      const now = new Date().toISOString();
      for (let i = 0; i < batch.length; i++) {
        const para = batch[i];
        const result = batchResults[i];

        if (result && result.reading && result.study) {
          const translationData = {
            reading: result.reading,
            study: result.study,
            segments: result.segments || null,
            notes: result.notes || null
          };

          // Segments are embedded in translationData JSON, no separate column needed
          await query(`
            UPDATE content
            SET translation = ?, synced = 0, updated_at = ?
            WHERE id = ?
          `, [JSON.stringify(translationData), now, para.id]);

          const mapEntry = paragraphMap.get(para.paragraph_index);
          if (mapEntry) {
            mapEntry.readingTranslation = result.reading;
          }

          translatedCount++;
        } else {
          logger.warn({
            paraId: para.id,
            hasReading: !!result?.reading,
            hasStudy: !!result?.study
          }, 'Incomplete translation result - missing reading or study');
        }
      }

      await updateJobCheckpoint(job.id, batch[batch.length - 1].paragraph_index, startingProgress + translatedCount);
      return true;
    } catch (err) {
      logger.warn({ batchSize: batch.length, err: err.message }, 'Batch failed, processing individually');

      // Fallback: translate each paragraph individually
      for (const para of batch) {
        try {
          const prevPara = paragraphMap.get(para.paragraph_index - 1);
          const prevContext = prevPara ? {
            original: prevPara.text,
            translation: prevPara.readingTranslation || null
          } : null;

          const result = await translateCombined({
            text: para.text,
            sourceLang,
            targetLang: 'en',
            contentType,
            documentContext,
            previousParagraph: prevContext,
            hasMarkers: hasMarkers(para.text)
          });

          logger.info({ paraId: para.id, hasReading: !!result?.reading, hasStudy: !!result?.study, hasResult: !!result }, 'Individual translation result');

          if (result && result.reading && result.study) {
            const now = new Date().toISOString();
            try {
              // Segments are embedded in result JSON, no separate column needed
              await query(`
                UPDATE content
                SET translation = ?, synced = 0, updated_at = ?
                WHERE id = ?
              `, [JSON.stringify(result), now, para.id]);
              logger.info({ paraId: para.id }, 'Translation saved successfully');
            } catch (saveErr) {
              logger.error({ paraId: para.id, err: saveErr.message }, 'Failed to save translation');
            }

            const mapEntry = paragraphMap.get(para.paragraph_index);
            if (mapEntry) {
              mapEntry.readingTranslation = result.reading;
            }

            translatedCount++;
            await updateJobCheckpoint(job.id, para.paragraph_index, startingProgress + translatedCount);
          } else {
            logger.error({ paraId: para.id, hasReading: !!result?.reading, hasStudy: !!result?.study, result: JSON.stringify(result)?.substring(0, 200) }, 'Individual translation missing required fields');
          }
        } catch (fallbackErr) {
          logger.warn({ paraId: para.id, err: fallbackErr.message }, 'Individual fallback failed');
        }
      }
      return false;
    }
  }

  // Concurrent worker that pulls batches from the queue
  async function worker(workerId) {
    while (true) {
      const idx = batchIndex++;
      if (idx >= allBatches.length) break;

      const batch = allBatches[idx];
      logger.debug({
        workerId,
        batchIdx: idx,
        batchSize: batch.length,
        progress: `${startingProgress + translatedCount}/${totalParagraphs}`
      }, 'Worker processing batch');

      await processBatch(batch);
    }
  }

  // Launch concurrent workers
  const workers = [];
  for (let i = 0; i < Math.min(BATCH_CONCURRENCY, allBatches.length); i++) {
    workers.push(worker(i));
  }
  await Promise.all(workers);

  logger.info({
    jobId: job.id,
    translatedCount,
    batchesProcessed: allBatches.length
  }, 'Concurrent batch processing complete');

  // Handle partial resumes (only reading OR only study needed) - these are sequential
  for (const para of partialParas) {
    try {
      const prevPara = paragraphMap.get(para.paragraph_index - 1);
      const prevContext = prevPara ? {
        original: prevPara.text,
        translation: prevPara.readingTranslation || null
      } : null;

      const now = new Date().toISOString();
      let translationData = para.existing || { reading: null, study: null, segments: null, notes: null };

      if (para.needsReading) {
        const readingResult = await translateWithContext({
          text: para.text,
          sourceLang,
          targetLang: 'en',
          contentType,
          documentContext,
          previousParagraph: prevContext,
          translationType: 'reading',
          hasMarkers: hasMarkers(para.text)
        });

        translationData.reading = readingResult.translation;
        translationData.segments = readingResult.segments || null;

        const mapEntry = paragraphMap.get(para.paragraph_index);
        if (mapEntry) {
          mapEntry.readingTranslation = readingResult.translation;
        }
      } else if (para.needsStudy) {
        const studyResult = await translateWithContext({
          text: para.text,
          sourceLang,
          targetLang: 'en',
          contentType,
          documentContext,
          previousParagraph: prevContext,
          translationType: 'study',
          hasMarkers: hasMarkers(para.text)
        });

        translationData.study = studyResult.translation;
        translationData.notes = studyResult.studyNotes?.segments || null;
      }

      // Segments are embedded in translationData JSON, no separate column needed
      await query(`
        UPDATE content
        SET translation = ?, synced = 0, updated_at = ?
        WHERE id = ?
      `, [JSON.stringify(translationData), now, para.id]);

      translatedCount++;
      await updateJobCheckpoint(job.id, para.paragraph_index, startingProgress + translatedCount);

      logger.debug({
        paraId: para.id,
        paragraphIndex: para.paragraph_index,
        progress: `${startingProgress + translatedCount}/${totalParagraphs}`,
        mode: 'partial'
      }, 'Paragraph translated (partial)');

    } catch (err) {
      logger.warn({ paraId: para.id, err: err.message }, 'Failed to translate partial paragraph');
    }
  }

  await updateJobStatus(job.id, JOB_STATUS.COMPLETED, {
    progress: totalParagraphs,
    totalItems: totalParagraphs
  });

  logger.info({
    jobId: job.id,
    documentId,
    translated: translatedCount,
    alreadyComplete: alreadyTranslatedCount,
    total: totalParagraphs
  }, 'Dual translation completed');

  return {
    success: true,
    translated: translatedCount,
    alreadyComplete: alreadyTranslatedCount,
    total: totalParagraphs
  };
}

/**
 * Translate a paragraph with full context
 * Includes document metadata and previous paragraph for continuity
 */
async function translateWithContext({
  text,
  sourceLang,
  targetLang,
  contentType,
  documentContext,
  previousParagraph,
  translationType,
  hasMarkers: textHasMarkers
}) {
  // Build context section for the prompt
  let contextSection = documentContext;

  if (previousParagraph) {
    contextSection += `\n## Previous Paragraph (for context)\n`;
    contextSection += `Original: ${previousParagraph.original.substring(0, 500)}${previousParagraph.original.length > 500 ? '...' : ''}\n`;
    if (previousParagraph.translation) {
      contextSection += `Translation: ${previousParagraph.translation.substring(0, 500)}${previousParagraph.translation.length > 500 ? '...' : ''}\n`;
    }
  }

  if (translationType === 'study') {
    // Study mode: literal translation with linguistic notes
    return await translateForStudy(text, sourceLang, targetLang, contentType, contextSection);
  }

  // Reading mode: use existing segment-based translation
  if (textHasMarkers) {
    const result = await translateMarkedTextWithContext(text, sourceLang, targetLang, contentType, contextSection);
    return {
      translation: result.translation,
      segments: result.segments
    };
  }

  const result = await translateTextWithSegmentsAndContext(text, sourceLang, targetLang, contentType, contextSection);
  return {
    translation: result.translation,
    segments: result.segments
  };
}

/**
 * Build prompt for combined reading + study translation (TOON format)
 * Returns BOTH translations in a single API call for 2x speedup
 */
function buildCombinedTranslationPrompt(sourceLang, contentType, contextSection = '') {
  const sourceName = SUPPORTED_LANGUAGES[sourceLang] || sourceLang;

  const styleGuide = contentType === 'scripture'
    ? `For READING: Use Shoghi Effendi's biblical style with archaic pronouns (Thou, Thee, Thine), elevated diction (perceiveth, hath, doth, verily).`
    : `For READING: Use clear modern English for narrative, but biblical style for any quoted scripture.`;

  return `You are an expert translator of ${sourceName} religious texts to English. Create BOTH a reading translation AND a study translation.

${contextSection}

## CRITICAL: Religious Terminology (Shoghi Effendi's Translations)
PREFER Shoghi Effendi's established translations - he was the most accomplished translator of Arabic religious terminology into English. Use his renderings:

TITLES & STATIONS:
- "بقية الله" → "Remnant of God (Baqiyyatu'lláh)"
- "القائم" → "He Who Shall Arise (Qá'im)"
- "المهدي" → "the Mahdí"
- "الحجة" → "the Proof of God (Ḥujjat)"
- "مظهر أمر الله" → "Manifestation of God"
- "أمر الله" → "the Cause of God"
- "نقطة أولی" → "Primal Point (Nuqṭiy-i-Úlá)"
- "حضرة أعلی" → "His Holiness the Most Exalted One"

COSMOLOGICAL TERMS:
- "سدرة المنتهی" → "the Sadratu'l-Muntahá (Tree beyond which there is no passing)"
- "جبروت" → "the Realm of Divine Command (Jabarút)"
- "ملكوت" → "the Kingdom (Malakút)"
- "لاهوت" → "the Realm of the Divine (Láhút)"
- "ناسوت" → "the Realm of Humanity (Násút)"
- "هيكل" → "Temple" or "Tabernacle (Haykal)"

CONCEPTS:
- "امر" → "Cause" (not "command" or "matter")
- "ظهور" → "Manifestation" or "Revelation"
- "مشيئة" → "the Will" or "Divine Will (Mashíyyat)"
- "قيوم" → "the Self-Subsisting (Qayyúm)"
- "بيان" → "the Bayán" (the Báb's Revelation)

## Bahá'í Transliteration (REQUIRED):
Long vowels: á, í, ú (NOT ā, ī, ū). Emphatics with dot-under: Ḥ, Ṭ, Ẓ, Ṣ, Ḍ

## READING Translation
${styleGuide}
Literary English that flows naturally for devotional reading.

## STUDY Translation (Literal but Readable)
Create a word-for-word translation that:
1. MIRRORS Arabic word order and structure as closely as possible
2. READS WELL in English - avoid excessive hyphenation
3. PRESERVES every word - never skip particles or prepositions
4. Uses natural English constructions that parallel Arabic grammar
5. INCLUDES Arabic terms INLINE in parentheses for theological/philosophical words

KEY PATTERNS (follow these exactly):
- إنّ (inna) → "Truly" or "Verily" (emphasis particle - NEVER skip)
- من عند الله → "from the presence of God" or "from the side of God" (preserve "عند")
- في سبيل الله → "in the path of God"
- يا أيها الناس → "O you the people" (preserve vocative structure)
- الحمد لله → "Praise (be) to God"
- بسم الله → "In the Name of God"
- Use parentheses sparingly for implied words: "(be)", "(is)", "(of)"
- Separate words with spaces, NOT hyphens

INLINE TERMINOLOGY - ONLY for SIGNIFICANT theological/philosophical terms:
- "the Essence (dhát)" for ذات
- "the Manifestation (maẓhar)" for مظهر
- "the Will (mashíyyat)" for مشيئة
- "contingent beings (mumkináat)" for ممكنات
- "the Unseen (ghayb)" for غيب
- "the station of servitude ('ubúdiyyat)" for عبودية
- "Divine Unity (tawḥíd)" for توحيد
- "the Primal Will (al-mashíyyat al-awwalíyya)" for المشيئة الأولية

DO NOT add Arabic transliteration for:
- Common words: book, praise, God, Lord, people, earth, heaven
- Parts of speech: particles, prepositions, conjunctions
- Simple verbs: said, descended, revealed, created
- Basic nouns: servant, path, day, night

ONLY add (transliteration) for terms with theological, philosophical, or doctrinal significance.

Example:
✓ "from the Essence (dhát) of the Unseen (ghayb)" - dhát and ghayb are philosophical terms
✗ "this is a Book (kitáb)" - kitáb is just "book", no special significance

GOAL: A scholar sees key terminology inline, not every word transliterated.

## OUTPUT FORMAT (TOON - simpler than JSON):

reading = "The complete literary translation for reading..."
study = "The literal translation that mirrors Arabic structure..."

[[segments]]
original = "first phrase in original"
translation = "English translation mirroring Arabic structure"

[[segments]]
original = "second phrase in original"
translation = "English translation mirroring Arabic structure"

[[notes]]
note = "Complete self-contained sentence explaining a term or concept."

## NOTES GUIDELINES:
Notes appear as FOOTNOTES at the end of each paragraph.
Each note MUST be a complete, self-contained sentence that:
- Names the term being explained (with transliteration if helpful)
- Provides theological, historical, or philosophical context
- Can be read independently without referring back to the text

EXAMPLES of good footnotes (use Shoghi Effendi's terminology):
- "The Qá'im (He Who Shall Arise) is the Twelfth Imám in Shí'ih eschatology, whose return the Báb claimed to fulfill."
- "Tawḥíd (Divine Unity) is the central doctrine of Islam asserting God's absolute oneness and transcendence."
- "The Sadratu'l-Muntahá (Tree beyond which there is no passing) is a Qur'ánic symbol marking the boundary of creation beyond which lies the Divine Presence."
- "The Bayán refers to both the Báb's Revelation and His principal doctrinal work, superseding the Qur'án as the 'Mother Book' of the Bábí Dispensation."
- "Jabarút (the Realm of Divine Command) is the intermediate realm between Láhút (the Divine) and Malakút (the Kingdom), in Islamic cosmology."

Include notes ONLY for:
- Theological concepts requiring doctrinal context
- Philosophical terms with technical meanings
- Historical/Qur'ánic allusions the reader may not recognize
- Terms with Shí'ih/Bábí/Bahá'í doctrinal significance

DO NOT include notes for:
- Grammar or syntax observations
- Common vocabulary (God, Lord, servant, book, etc.)
- Terms already clear from context or inline transliteration

Most paragraphs will have 0-2 notes. Many will have none.

## RULES:
- READING: Flows naturally for devotional reading
- STUDY: Mirrors Arabic structure, readable English, inline terminology for significant terms only
- SEGMENTS: MANDATORY - 2-5 phrases each, segment translations use STUDY style
- NOTES: 0-2 self-contained footnote sentences for rich terminology (most paragraphs have none)
- Concatenated segment originals MUST EXACTLY match input text (character for character)

## CRITICAL: SEGMENTS ARE REQUIRED
Every response MUST include [[segments]] blocks. Do NOT omit them.

Return ONLY the TOON format, no explanations.`;
}

/**
 * Translate paragraph with BOTH reading and study translations in ONE API call
 * 2x speedup vs separate calls. Returns { reading, study, segments, notes }
 */
async function translateCombined({
  text,
  sourceLang,
  targetLang,
  contentType,
  documentContext,
  previousParagraph,
  hasMarkers: textHasMarkers
}) {
  // Build context section
  let contextSection = documentContext || '';

  if (previousParagraph) {
    contextSection += `\n## Previous Paragraph (for context)\n`;
    contextSection += `Original: ${previousParagraph.original.substring(0, 300)}${previousParagraph.original.length > 300 ? '...' : ''}\n`;
    if (previousParagraph.translation) {
      contextSection += `Translation: ${previousParagraph.translation.substring(0, 300)}${previousParagraph.translation.length > 300 ? '...' : ''}\n`;
    }
  }

  // For marked text, use sentence batching (Phase 3 will optimize this further)
  if (textHasMarkers) {
    return await translateCombinedMarked(text, sourceLang, targetLang, contentType, contextSection);
  }

  const systemPrompt = buildCombinedTranslationPrompt(sourceLang, contentType, contextSection);

  const response = await withTimeout(
    aiService('quality').chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ], {
      temperature: 0.3,
      maxTokens: Math.min(Math.max(text.length * 6, 1500), 16000), // Cap at model limit
      caller: 'translator'
    }),
    API_TIMEOUT_MS,
    'translateCombined'
  );

  // Parse TOON/JSON response
  let result;
  try {
    result = parseAIResponse(response.content);
  } catch (parseErr) {
    logger.warn({ err: parseErr.message, response: response.content.substring(0, 200) },
      'Failed to parse combined translation, falling back to separate calls');
    // Fall back to separate translation calls
    return await translateCombinedFallback(text, sourceLang, targetLang, contentType, contextSection);
  }

  // Validate required fields
  if (!result.reading || !result.study) {
    logger.warn({ result }, 'Combined translation missing reading or study, falling back');
    return await translateCombinedFallback(text, sourceLang, targetLang, contentType, contextSection);
  }

  // Validate segments integrity if present
  if (result.segments && Array.isArray(result.segments)) {
    const normalizeText = (t) => t.replace(/\s+/g, ' ').trim();
    const originalNormalized = normalizeText(text);
    const segmentsJoined = normalizeText(result.segments.map(s => s.original).join(' '));

    if (originalNormalized !== segmentsJoined) {
      logger.warn({
        originalLength: originalNormalized.length,
        segmentsLength: segmentsJoined.length
      }, 'Segment integrity failed in combined translation, segments discarded');
      result.segments = null;
    } else {
      // Add IDs to segments
      result.segments = result.segments.map((seg, idx) => ({
        id: idx + 1,
        original: seg.original,
        translation: seg.translation
      }));
    }
  }

  return {
    reading: result.reading,
    study: result.study,
    segments: result.segments || null,
    notes: result.notes || null
  };
}

/**
 * Handle combined translation for text with sentence markers
 * Batches all sentences into single API call
 * Returns phrase-level segments for proper highlighting
 */
async function translateCombinedMarked(text, sourceLang, targetLang, contentType, contextSection) {
  const sentences = getSentences(text);

  if (sentences.length === 0) {
    // No markers found, translate as whole
    const strippedText = stripMarkers(text);
    return await translateCombined({
      text: strippedText,
      sourceLang,
      targetLang,
      contentType,
      documentContext: contextSection,
      previousParagraph: null,
      hasMarkers: false
    });
  }

  // Build batch prompt for all sentences
  const sourceName = SUPPORTED_LANGUAGES[sourceLang] || sourceLang;
  const sentenceList = sentences.map(s => `[s${s.id}] ${s.text}`).join('\n');

  const systemPrompt = `You are an expert translator of ${sourceName} religious texts to English.

${contextSection}

## TASK: Translate ALL sentences below, providing reading + study translations AND short phrase segments.

## CRITICAL TERMINOLOGY:
- "الله" → "God" (NOT "Allah" - this is a common noun meaning God, not a personal name)
- "القائم" → "Qá'im" (He Who Shall Arise)
- "بقية الله" → "Remnant of God"
- "مظهر أمر الله" → "Manifestation of God"

## OUTPUT FORMAT (TOON):
For EACH sentence, provide reading, study, and MANY short phrase segments (3-7 words each):

[s1]
reading = "Literary translation with proper punctuation. Flows naturally for devotional reading."
study = "Literal translation with punctuation. Preserves word order. Uses (parentheses) for implied words."

[[s1.segments]]
original = "بسم الله الرحمن الرحيم"
translation = "In the name of God, the Merciful, the Compassionate"

[[s1.segments]]
original = "ان هذا كتاب"
translation = "Verily, this is a Book"

[[s1.segments]]
original = "قد نزل على الارض المقدسة"
translation = "that hath been sent down upon the holy land"

## CRITICAL RULES:
1. SEGMENTS MUST BE SHORT: Each segment should be 3-7 Arabic words (one logical phrase), NOT entire sentences
2. Long sentences MUST have 5-15 segments, breaking at natural phrase boundaries
3. ALL translations MUST include proper punctuation (commas, periods, semicolons)
4. Concatenated segment "original" values MUST EXACTLY match the input sentence text
5. "الله" = "God" (never "Allah")

## STYLE:
- READING: Shoghi Effendi biblical style (Thou, Thee, hath, verily). Proper punctuation. Flows for devotional reading.
- STUDY: Literal word order with punctuation. (Implied words) in parentheses. Readable English.
- SEGMENTS: Short 3-7 word phrases. Each translates literally with punctuation as needed.

## Bahá'í Transliteration: á, í, ú (not macrons), Ḥ, Ṭ, Ẓ with dot-under

Example of breaking a long sentence into SHORT phrases:
Original: "ان اسمعوا حكم بقية الله واسئلوا من سبل الحق من ذكر اسم ربكم"
BAD: One segment with all text
GOOD:
  [[s.segments]] original = "ان اسمعوا" / translation = "Verily, hearken"
  [[s.segments]] original = "حكم بقية الله" / translation = "unto the decree of the Remnant of God,"
  [[s.segments]] original = "واسئلوا من سبل الحق" / translation = "and inquire from the paths of truth"
  [[s.segments]] original = "من ذكر اسم ربكم" / translation = "from him who hath mentioned the name of your Lord."

Return ONLY TOON format. Every sentence MUST include MANY [[sN.segments]] blocks with SHORT phrases.`;

  const response = await withTimeout(
    aiService('quality').chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: sentenceList }
    ], {
      temperature: 0.3,
      maxTokens: Math.min(Math.max(text.length * 8, 4000), 16000),  // Cap at 16000 for model limit
      caller: 'translator'
    }),
    API_TIMEOUT_MS,
    'translateCombinedMarked'
  );

  // Parse response
  let result;
  try {
    result = parseAIResponse(response.content);
  } catch (parseErr) {
    logger.warn({ err: parseErr.message }, 'Failed to parse marked text batch, falling back');
    return await translateCombinedFallback(text, sourceLang, targetLang, contentType, contextSection);
  }

  // Build phrase-level segments array from all sentences
  const allSegments = [];
  const readingParts = [];
  const studyParts = [];
  let segmentId = 1;

  for (const sentence of sentences) {
    const key = `s${sentence.id}`;
    const sentenceResult = result[key];

    if (sentenceResult && sentenceResult.reading && sentenceResult.study) {
      readingParts.push(sentenceResult.reading);
      studyParts.push(sentenceResult.study);

      // Extract phrase-level segments
      if (sentenceResult.segments && Array.isArray(sentenceResult.segments) && sentenceResult.segments.length > 0) {
        for (const seg of sentenceResult.segments) {
          allSegments.push({
            id: segmentId++,
            original: seg.original,
            translation: seg.translation
          });
        }
      } else {
        // Fallback: use whole sentence as one segment
        allSegments.push({
          id: segmentId++,
          original: sentence.text,
          translation: sentenceResult.study
        });
      }
    } else {
      // Missing translation for this sentence
      logger.warn({ sentenceId: sentence.id }, 'Missing translation in batch result');
      readingParts.push(sentence.text);
      studyParts.push(sentence.text);
      allSegments.push({
        id: segmentId++,
        original: sentence.text,
        translation: sentence.text,
        error: 'Missing in batch'
      });
    }
  }

  return {
    reading: readingParts.join(' '),
    study: studyParts.join(' '),
    segments: allSegments,  // Now an array of phrase-level segments
    notes: null
  };
}

/**
 * Fallback: use separate API calls for reading and study
 * Used when combined parsing fails
 */
async function translateCombinedFallback(text, sourceLang, targetLang, contentType, contextSection) {
  logger.info('Using fallback separate translation calls');

  // Get reading translation
  const readingResult = await translateTextWithSegmentsAndContext(text, sourceLang, targetLang, contentType, contextSection);

  // Get study translation
  const studyResult = await translateForStudy(text, sourceLang, targetLang, contentType, contextSection);

  return {
    reading: readingResult.translation,
    study: studyResult.translation,
    segments: readingResult.segments,
    notes: studyResult.studyNotes?.segments || null
  };
}

/**
 * Translate a BATCH of paragraphs in a single API call
 * 3-5x speedup vs individual paragraph calls
 * Returns array of { reading, study, segments, notes } for each paragraph
 */
async function translateBatchCombined({
  paragraphs,  // Array of { id, text, paragraph_index }
  sourceLang,
  targetLang,
  contentType,
  documentContext,
  previousParagraph  // Context from paragraph before this batch
}) {
  if (paragraphs.length === 0) return [];
  if (paragraphs.length === 1) {
    // Single paragraph - use regular combined translation
    const result = await translateCombined({
      text: paragraphs[0].text,
      sourceLang,
      targetLang,
      contentType,
      documentContext,
      previousParagraph,
      hasMarkers: hasMarkers(paragraphs[0].text)
    });
    return [result];
  }

  const sourceName = SUPPORTED_LANGUAGES[sourceLang] || sourceLang;

  // Build paragraph list for the prompt
  const paragraphList = paragraphs.map((p, idx) =>
    `[p${idx + 1}] ${p.text}`
  ).join('\n\n');

  // Build context section
  let contextSection = documentContext || '';
  if (previousParagraph) {
    contextSection += `\n## Previous Paragraph (for context)\n`;
    contextSection += `Original: ${previousParagraph.original.substring(0, 200)}...\n`;
    if (previousParagraph.translation) {
      contextSection += `Translation: ${previousParagraph.translation.substring(0, 200)}...\n`;
    }
  }

  const systemPrompt = `You are an expert translator of ${sourceName} religious texts to English.

${contextSection}

## TASK: Translate ${paragraphs.length} paragraphs below. For EACH paragraph, provide BOTH reading and study translations.

## CRITICAL: Religious Terminology
Use ESTABLISHED translations: "القائم" → "Qá'im", "بقية الله" → "Remnant of God", "مظهر أمر الله" → "Manifestation of God"

## OUTPUT FORMAT (TOON):

[p1]
reading = "Literary translation of paragraph 1..."
study = "Literal word-by-word translation of paragraph 1..."

[[p1.segments]]
original = "first phrase"
translation = "its translation"

[[p1.segments]]
original = "second phrase"
translation = "its translation"

[[p1.notes]]
note = "Self-contained footnote sentence explaining a theological term or concept."

[p2]
reading = "Literary translation of paragraph 2..."
study = "Literal word-by-word translation of paragraph 2..."

[[p2.segments]]
original = "first phrase"
translation = "its translation"

[[p2.notes]]
note = "Footnote explaining significant terminology if needed."

## STYLE:
- READING: Shoghi Effendi biblical style (Thou, Thee, hath, verily) for scripture
- STUDY: Literal, preserves word order, uses parentheses for implied words
- SEGMENTS: MANDATORY - divide each paragraph into 2-5 meaningful phrases/sentences
- NOTES: 0-2 self-contained footnote sentences for rich terminology (most paragraphs have none)

## NOTES GUIDELINES:
Notes are for theological concepts, philosophical terms, or historical allusions.
Each note MUST be a complete, self-contained sentence that names the term and provides context.
Examples: "The Qá'im (He Who Shall Arise) is the Twelfth Imám whose return the Báb claimed to fulfill."
DO NOT include notes for common vocabulary or grammar observations. Most paragraphs have 0-1 notes.

## CRITICAL RULES:
1. SEGMENTS ARE REQUIRED for every paragraph - do NOT skip them
2. Each [[pN.segments]] block must have 2-5 segments
3. Concatenated segment "original" values must EXACTLY match the input text (including punctuation)
4. Each segment "translation" uses STUDY style (literal translation)
5. NOTES are optional - only include for significant theological/philosophical terminology

## Bahá'í Transliteration: á, í, ú (not macrons), Ḥ, Ṭ, Ẓ with dot-under

Return ONLY TOON format for ALL ${paragraphs.length} paragraphs. Every paragraph MUST include segments.`;

  const response = await withTimeout(
    aiService('quality').chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: paragraphList }
    ], {
      temperature: 0.3,
      // More tokens for batch output
      maxTokens: Math.min(Math.max(paragraphs.reduce((sum, p) => sum + p.text.length, 0) * 5, 3000), 16000),
      caller: 'translator'
    }),
    API_TIMEOUT_MS * 2, // Double timeout for batch
    'translateBatchCombined'
  );

  // Parse response
  let result;
  try {
    result = parseAIResponse(response.content);
  } catch (parseErr) {
    logger.warn({ err: parseErr.message, paragraphCount: paragraphs.length },
      'Failed to parse batch translation, falling back to individual');
    // Fall back to individual translations
    return await translateBatchFallback(paragraphs, sourceLang, targetLang, contentType, documentContext, previousParagraph);
  }

  // Extract results for each paragraph
  const results = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const key = `p${i + 1}`;
    const paraResult = result[key];
    const para = paragraphs[i];

    if (paraResult && paraResult.reading && paraResult.study) {
      // Validate segments - REQUIRED
      let segments = paraResult.segments || null;
      let segmentsValid = false;

      if (segments && Array.isArray(segments) && segments.length >= 1) {
        const normalizeText = (t) => t.replace(/\s+/g, ' ').trim();
        const originalNormalized = normalizeText(para.text);
        const segmentsJoined = normalizeText(segments.map(s => s.original).join(' '));

        if (originalNormalized === segmentsJoined) {
          segments = segments.map((seg, idx) => ({
            id: idx + 1,
            original: seg.original,
            translation: seg.translation
          }));
          segmentsValid = true;
        } else {
          logger.warn({
            paragraphIndex: i,
            originalLen: originalNormalized.length,
            segmentsLen: segmentsJoined.length
          }, 'Segment integrity failed');
        }
      } else {
        logger.warn({ paragraphIndex: i }, 'Segments missing from batch result');
      }

      if (segmentsValid) {
        results.push({
          reading: paraResult.reading,
          study: paraResult.study,
          segments,
          notes: paraResult.notes || null
        });
      } else {
        // Segments invalid/missing - retry individual translation
        logger.warn({ paragraphIndex: i }, 'Retrying paragraph individually due to missing/invalid segments');
        try {
          const individual = await translateCombined({
            text: para.text,
            sourceLang,
            targetLang,
            contentType,
            documentContext,
            previousParagraph: i === 0 ? previousParagraph : {
              original: paragraphs[i - 1].text,
              translation: results[i - 1]?.reading || null
            },
            hasMarkers: hasMarkers(para.text)
          });
          // Validate individual result segments too
          if (individual.segments && Array.isArray(individual.segments) && individual.segments.length >= 1) {
            results.push(individual);
          } else {
            logger.error({ paragraphIndex: i }, 'Individual retry also missing segments');
            results.push({ reading: null, study: null, segments: null, notes: null });
          }
        } catch (err) {
          logger.warn({ paragraphIndex: i, err: err.message }, 'Individual retry failed');
          results.push({ reading: null, study: null, segments: null, notes: null });
        }
      }
    } else {
      // Missing result for this paragraph - translate individually
      logger.warn({ paragraphIndex: i }, 'Missing paragraph in batch, translating individually');
      try {
        const individual = await translateCombined({
          text: para.text,
          sourceLang,
          targetLang,
          contentType,
          documentContext,
          previousParagraph: i === 0 ? previousParagraph : {
            original: paragraphs[i - 1].text,
            translation: results[i - 1]?.reading || null
          },
          hasMarkers: hasMarkers(para.text)
        });
        results.push(individual);
      } catch (err) {
        logger.warn({ err: err.message }, 'Failed to translate missing paragraph');
        results.push({ reading: null, study: null, segments: null, notes: null });
      }
    }
  }

  return results;
}

/**
 * Fallback: translate batch one paragraph at a time
 */
async function translateBatchFallback(paragraphs, sourceLang, targetLang, contentType, documentContext, previousParagraph) {
  const results = [];
  let prevContext = previousParagraph;

  for (const para of paragraphs) {
    try {
      const result = await translateCombined({
        text: para.text,
        sourceLang,
        targetLang,
        contentType,
        documentContext,
        previousParagraph: prevContext,
        hasMarkers: hasMarkers(para.text)
      });
      results.push(result);
      prevContext = {
        original: para.text,
        translation: result.reading
      };
    } catch (err) {
      logger.warn({ paraId: para.id, err: err.message }, 'Failed in batch fallback');
      results.push({ reading: null, study: null, segments: null, notes: null });
    }
  }

  return results;
}

// Collections that contain scripture, prayers, poetry (use biblical style)
const SCRIPTURE_COLLECTIONS = [
  'Core Tablets', 'Core Tablet Translations', 'Core Publications',
  'Compilations', 'Prayers', 'Hidden Words', 'Kitab-i-Aqdas',
  'Kitab-i-Iqan', 'Seven Valleys', 'Four Valleys'
];

// Collections that are primarily historical narrative (use modern English with biblical citations)
const HISTORICAL_COLLECTIONS = [
  'Historical', 'Pilgrim Notes', 'News', 'Press', 'Administrative',
  'Letters', 'Memoirs', 'Chronicles'
];

/**
 * Detect content type from document collection
 * Returns: 'scripture' | 'historical' | 'auto'
 */
function detectContentType(collection) {
  if (!collection) return 'auto';

  const collLower = collection.toLowerCase();

  // Check for scripture/poetry collections
  for (const sc of SCRIPTURE_COLLECTIONS) {
    if (collLower.includes(sc.toLowerCase())) return 'scripture';
  }

  // Check for historical collections
  for (const hc of HISTORICAL_COLLECTIONS) {
    if (collLower.includes(hc.toLowerCase())) return 'historical';
  }

  return 'auto';
}

/**
 * Build translation prompt with content-type awareness
 * - scripture/poetry: Shoghi Effendi biblical style
 * - historical: Modern English with biblical citations
 * - auto: AI detects and applies appropriate style
 */
function buildTranslationPrompt(sourceLang, targetLang, quality, contentType = 'auto') {
  const sourceName = SUPPORTED_LANGUAGES[sourceLang] || sourceLang;
  const targetName = SUPPORTED_LANGUAGES[targetLang] || targetLang;

  // Standard quality - simple translation
  if (quality !== 'high') {
    return `Translate the following text from ${sourceName} to ${targetName}. Preserve the meaning and provide only the translation.`;
  }

  // High quality Arabic/Persian → English with content-type awareness
  if ((sourceLang === 'ar' || sourceLang === 'fa') && targetLang === 'en') {

    if (contentType === 'scripture') {
      // Pure biblical style for sacred content
      return `You are an expert translator specializing in Bahá'í sacred writings. Translate this ${sourceName} text to English using Shoghi Effendi's distinctive biblical translation style.

## CRITICAL: Preserve Religious Terminology
Use ESTABLISHED English translations for religious terms and titles. Do NOT translate literally:
- "بقية الله" → "Remnant of God (Baqiyyatu'lláh)" (NOT "God's remainder")
- "القائم" → "He Who Shall Arise (Qá'im)" or "the Qá'im"
- "المهدي" → "the Mahdí" or "the Guided One (Mahdí)"
- "الحجة" → "the Proof of God (Ḥujjat)"
- "النقطة الأولى" → "the Primal Point (Nuqṭiy-i-Úlá)"
- "مظهر أمر الله" → "Manifestation of God"
- "أهل البهاء" → "people of Bahá"
- "أمر الله" → "the Cause of God"
- "ملكوت" → "Kingdom" / "جبروت" → "Dominion" / "لاهوت" → "Godhead"

For student study, you MAY include transliterated terms in parentheses after the English translation on first occurrence.

## Bahá'í Transliteration Style (REQUIRED):
Use Bahá'í-standard transliteration with ACCENTS (not macrons), dot-unders, and Arabic-based romanization even for Persian:
- Long vowels: á, í, ú (NOT ā, ī, ū)
- Emphatics with dot-under: Ḥ, Ṭ, Ẓ, Ṣ, Ḍ
- 'ayn and hamza: ' (apostrophe)
- Examples: Bahá'u'lláh, 'Abdu'l-Bahá, Qá'im, Ḥusayn, Ṭáhirih, Shíráz
- Persian words use Arabic transliteration: Sháh (not Shāh), Íránian (not Īrānī)

## Style Guidelines:
- Use archaic pronouns for the Divine: Thou, Thee, Thine, Thy
- Employ elevated diction: perceiveth, confesseth, hath, art, doth, verily
- Render divine attributes formally: sovereignty, dominion, majesty, glory
- Use inverted word order for emphasis where appropriate
- Craft flowing sentences with parallel clauses
- Preserve metaphors, imagery, and rhetorical devices
- Maintain poetic rhythm and cadence

## Example Correspondences:
- "سُبْحانَكَ يا إِلهي" → "Glorified art Thou, O Lord my God!"
- "أَسْئَلُكَ" → "I beseech Thee" / "I entreat Thee"
- "قُلْ" (Say/Proclaim) → "Say:" or "Proclaim:"
- "لا خَوْفٌ عَلَيْهِمْ" → "on whom shall come no fear"

Provide only the translation, no explanations.`;

    } else if (contentType === 'historical') {
      // Modern English for narrative, biblical for citations
      return `You are an expert translator of ${sourceName} historical and narrative texts. Translate to clear, modern English suitable for scholarly readers.

## Style Guidelines for Narrative Text:
- Use clear, modern English prose
- Maintain historical accuracy and terminology
- Keep sentences readable and well-structured
- Preserve the author's narrative voice

## IMPORTANT: Embedded Citations
When the text quotes or cites scripture, prayers, poetry, prophecy, or tradition (hadith), render those citations in Shoghi Effendi's biblical style:
- Use: Thou, Thee, Thine, Thy for the Divine
- Use: hath, art, doth, verily, perceiveth
- Preserve the elevated, sacred tone of the original

## Example:
Historical narrative: "The Báb then recited a prayer, saying..."
→ Modern English for narrative
Citation within: "سُبْحانَكَ يا إِلهي"
→ "Glorified art Thou, O Lord my God!"

Provide only the translation, no explanations.`;

    } else {
      // Auto-detect: AI determines content type
      return `You are an expert translator of ${sourceName} religious and historical texts. Analyze the content and translate appropriately:

## CRITICAL: Preserve Religious Terminology
Use ESTABLISHED English translations for religious terms and titles. NEVER translate literally:
- "بقية الله" → "Remnant of God (Baqiyyatu'lláh)" (NOT "God's remainder")
- "القائم" → "He Who Shall Arise (Qá'im)" or "the Qá'im"
- "المهدي" → "the Mahdí" or "the Guided One (Mahdí)"
- "الحجة" → "the Proof of God (Ḥujjat)"
- "النقطة الأولى" → "the Primal Point (Nuqṭiy-i-Úlá)"
- "مظهر أمر الله" → "Manifestation of God"
- "أهل البهاء" → "people of Bahá"
- "أمر الله" → "the Cause of God"
- "ملكوت" → "Kingdom" / "جبروت" → "Dominion" / "لاهوت" → "Godhead"
- "ظهور" → "Manifestation" / "Revelation"
- "كتاب مبين" → "perspicuous Book"
- "صراط مستقيم" → "Straight Path"

For student study, you MAY include transliterated terms in parentheses after the English translation on first occurrence.

## Bahá'í Transliteration Style (REQUIRED):
Use Bahá'í-standard transliteration with ACCENTS (not macrons), dot-unders, and Arabic-based romanization even for Persian:
- Long vowels: á, í, ú (NOT ā, ī, ū)
- Emphatics with dot-under: Ḥ, Ṭ, Ẓ, Ṣ, Ḍ
- 'ayn and hamza: ' (apostrophe)
- Examples: Bahá'u'lláh, 'Abdu'l-Bahá, Qá'im, Ḥusayn, Ṭáhirih, Shíráz
- Persian words use Arabic transliteration: Sháh (not Shāh), Írán (not Īrān)

## Content Type Detection:
1. **Scripture, Prayers, Poetry, Prophecy**: Use Shoghi Effendi's biblical style
   - Archaic pronouns: Thou, Thee, Thine, Thy
   - Elevated diction: perceiveth, hath, art, doth, verily
   - Formal divine attributes: sovereignty, dominion, majesty

2. **Historical Narrative, Letters, Chronicles**: Use clear modern English
   - Readable scholarly prose
   - Historical accuracy
   - Modern sentence structure
   - But STILL use established religious terminology for titles and terms

3. **Mixed Content** (narrative with embedded citations):
   - Modern English for the narrative portions
   - Biblical style for any quoted scripture, prayers, poetry, prophecy, or hadith

## Indicators of Sacred Content:
- Invocations to God (يا الله, سبحان)
- Prayer language (أسألك, أدعوك)
- Quranic/scriptural quotations
- Poetic meter and rhyme
- Prophetic declarations

## Indicators of Historical Content:
- Third-person narrative
- Dates, places, names
- Chronicle-style reporting
- Letters and correspondence

Provide only the translation, no explanations.`;
    }
  }

  // Default high-quality prompt for other language pairs
  let prompt = `You are an expert translator specializing in religious and scholarly texts, particularly Bahá'í sacred writings. Translate the following text from ${sourceName} to ${targetName}.

## Translation Guidelines:
- Preserve the meaning, tone, and spiritual significance
- Maintain technical and theological terminology
- Use elevated, formal language appropriate to sacred texts
- Preserve parallelism and rhetorical devices
- Provide only the translation without explanations`;

  // Add guidance for English→Arabic (reverse translation)
  if (sourceLang === 'en' && targetLang === 'ar') {
    prompt += `

## Style Reference: Classical Arabic Religious Prose
When translating English Bahá'í texts to Arabic:
- Use classical Arabic (fuṣḥā) appropriate for religious texts
- Include proper diacritical marks (tashkīl) for clarity
- Employ Qur'ānic and classical Arabic rhetorical patterns
- Preserve the elevated, devotional tone`;
  }

  return prompt;
}

/**
 * Translate a single text segment with content-type awareness
 */
async function translateText(text, sourceLang, targetLang, quality = 'standard', contentType = 'auto') {
  const systemPrompt = buildTranslationPrompt(sourceLang, targetLang, quality, contentType);

  // Use 'quality' service for translation - needs good reasoning
  // Wrap with timeout to prevent hanging on slow API calls
  const response = await withTimeout(
    aiService('quality').chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ], {
      temperature: 0.3,
      maxTokens: Math.max(text.length * 3, 500), // Allow for expansion in translation
      caller: 'translator'
    }),
    API_TIMEOUT_MS,
    'translateText'
  );

  return response.content.trim();
}

/**
 * Build prompt for aligned segment translation
 * Returns JSON with original/translation pairs for phrase-level highlighting
 */
function buildAlignedTranslationPrompt(sourceLang, contentType = 'auto') {
  const sourceName = SUPPORTED_LANGUAGES[sourceLang] || sourceLang;

  const styleGuide = contentType === 'scripture'
    ? `Use Shoghi Effendi's biblical style:
- Archaic pronouns for the Divine: Thou, Thee, Thine, Thy
- Elevated diction: perceiveth, confesseth, hath, art, doth, verily
- Formal divine attributes: sovereignty, dominion, majesty`
    : `Use clear modern English for narrative, but biblical style for any quoted scripture.`;

  return `You are an expert translator of ${sourceName} religious texts to English.

TASK: Translate the text and return aligned segments for phrase-level study.

## CRITICAL: Use Established Religious Terminology
NEVER translate religious titles and terms literally. Use established translations:
- "بقية الله" → "Remnant of God (Baqiyyatu'lláh)" (NOT "God's remainder")
- "القائم" → "He Who Shall Arise (Qá'im)" or "the Qá'im"
- "المهدي" → "the Mahdí" or "the Guided One (Mahdí)"
- "الحجة" → "the Proof of God (Ḥujjat)"
- "النقطة الأولى" → "the Primal Point (Nuqṭiy-i-Úlá)"
- "مظهر أمر الله" → "Manifestation of God"
- "أمر الله" → "the Cause of God"
- "ملكوت" → "Kingdom" / "جبروت" → "Dominion" / "لاهوت" → "Godhead"

For student study, you MAY include transliterated terms in parentheses on first occurrence.

## Bahá'í Transliteration Style (REQUIRED):
Use Bahá'í-standard transliteration with ACCENTS (not macrons), dot-unders, and Arabic-based romanization even for Persian:
- Long vowels: á, í, ú (NOT ā, ī, ū)
- Emphatics with dot-under: Ḥ, Ṭ, Ẓ, Ṣ, Ḍ
- Examples: Bahá'u'lláh, 'Abdu'l-Bahá, Qá'im, Ḥusayn, Ṭáhirih

OUTPUT FORMAT (JSON only, no markdown):
{
  "segments": [
    {"original": "phrase in original language", "translation": "English translation"},
    {"original": "next phrase", "translation": "its translation"}
  ]
}

## SEGMENTATION

Divide the text into segments for side-by-side study, where each segment expresses **one main idea**.

**Core principle:** Identify the concepts, then divide between them.
- NEVER split a sentence - sentences are the atomic unit
- A segment is one or more complete sentences that support a single concept
- Split between sentences when the concept or focus shifts

**Think like a reader:** Each segment should answer "what is this about?" with a single, clear answer. If a segment is about two different things, it should be two segments.

The concatenation of all segments recreates the complete original text with every word preserved.

TRANSLATION STYLE:
${styleGuide}

Return ONLY valid JSON, no explanations or markdown code blocks.`;
}

/**
 * Translate text with aligned segments for phrase-level highlighting
 * Returns { translation: string, segments: array }
 */
async function translateTextWithSegments(text, sourceLang, targetLang, contentType = 'auto') {
  // Only supports translation to English currently
  if (targetLang !== 'en') {
    const plainTranslation = await translateText(text, sourceLang, targetLang, 'high', contentType);
    return { translation: plainTranslation, segments: null };
  }

  const systemPrompt = buildAlignedTranslationPrompt(sourceLang, contentType);

  const response = await withTimeout(
    aiService('quality').chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ], {
      temperature: 0.3,
      maxTokens: Math.max(text.length * 4, 800), // Allow for JSON overhead
      caller: 'translator'
    }),
    API_TIMEOUT_MS,
    'translateTextWithSegments'
  );

  // Parse JSON response
  let result;
  try {
    // Clean response - remove markdown code blocks if present
    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    result = JSON.parse(jsonStr);
  } catch (parseErr) {
    logger.warn({ err: parseErr.message, response: response.content.substring(0, 200) },
      'Failed to parse aligned translation JSON, falling back to plain');
    // Fallback to plain translation
    const plainTranslation = await translateText(text, sourceLang, targetLang, 'high', contentType);
    return { translation: plainTranslation, segments: null };
  }

  // Validate structure
  if (!result.segments || !Array.isArray(result.segments)) {
    logger.warn('Invalid segments structure, falling back to plain translation');
    const plainTranslation = await translateText(text, sourceLang, targetLang, 'high', contentType);
    return { translation: plainTranslation, segments: null };
  }

  // SANITY CHECK: Verify segmentation didn't modify the original text
  // Normalize whitespace for comparison (collapse multiple spaces, trim)
  const normalizeText = (t) => t.replace(/\s+/g, ' ').trim();
  const originalNormalized = normalizeText(text);
  const segmentsJoined = normalizeText(result.segments.map(s => s.original).join(' '));

  if (originalNormalized !== segmentsJoined) {
    // Log detailed diff for debugging
    const originalLen = originalNormalized.length;
    const joinedLen = segmentsJoined.length;
    const lenDiff = Math.abs(originalLen - joinedLen);

    // Find first difference position
    let diffPos = 0;
    while (diffPos < originalNormalized.length && diffPos < segmentsJoined.length &&
           originalNormalized[diffPos] === segmentsJoined[diffPos]) {
      diffPos++;
    }

    logger.error({
      originalLength: originalLen,
      segmentsLength: joinedLen,
      lengthDiff: lenDiff,
      diffPosition: diffPos,
      originalAround: originalNormalized.substring(Math.max(0, diffPos - 20), diffPos + 40),
      segmentsAround: segmentsJoined.substring(Math.max(0, diffPos - 20), diffPos + 40),
      segmentCount: result.segments.length
    }, 'SEGMENTATION INTEGRITY ERROR: Concatenated segments do not match original text');

    // Fall back to plain translation to avoid data corruption
    const plainTranslation = await translateText(text, sourceLang, targetLang, 'high', contentType);
    return { translation: plainTranslation, segments: null, integrityError: true };
  }

  // Add IDs to segments and join translations
  const segments = result.segments.map((seg, idx) => ({
    id: idx + 1,
    original: seg.original,
    translation: seg.translation
  }));

  const fullTranslation = segments.map(s => s.translation).join(' ');

  return {
    translation: fullTranslation,
    segments
  };
}

/**
 * Translate text that has sentence markers
 * Uses pre-existing ⁅s1⁆...⁅/s1⁆ markers for segment boundaries
 *
 * Returns { translation: string, segments: { s1: {...}, s2: {...} } }
 */
async function translateMarkedText(text, sourceLang, targetLang, contentType = 'auto') {
  // Extract sentences using markers
  const sentences = getSentences(text);

  if (sentences.length === 0) {
    // No sentences found - translate as whole
    const translation = await translateText(stripMarkers(text), sourceLang, targetLang, 'high', contentType);
    return { translation, segments: null };
  }

  // Translate each sentence individually
  const segments = {};
  const translatedSentences = [];

  for (const sentence of sentences) {
    const key = `s${sentence.id}`;
    try {
      const translation = await translateText(sentence.text, sourceLang, targetLang, 'high', contentType);
      segments[key] = {
        original: sentence.text,
        text: translation
      };
      translatedSentences.push(translation);
    } catch (err) {
      logger.warn({ sentenceId: sentence.id, err: err.message }, 'Failed to translate sentence');
      // Keep original on failure
      segments[key] = {
        original: sentence.text,
        text: sentence.text,
        error: err.message
      };
      translatedSentences.push(sentence.text);
    }
  }

  // Join translations for full paragraph translation
  const fullTranslation = translatedSentences.join(' ');

  return {
    translation: fullTranslation,
    segments
  };
}

/**
 * Save individual segment translation to file
 */
async function saveSegmentTranslation(documentId, segmentId, targetLanguage, text) {
  const dir = path.join(TRANSLATIONS_DIR, documentId, 'segments', targetLanguage);
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${segmentId}.txt`);
  await fs.writeFile(filePath, text, 'utf-8');

  return filePath;
}

/**
 * Save complete translated document
 */
async function saveTranslatedDocument(documentId, targetLanguage, data) {
  const dir = path.join(TRANSLATIONS_DIR, documentId);
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${targetLanguage}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

  return filePath;
}

/**
 * Get translated document by job ID
 */
export async function getTranslatedDocument(jobId) {
  const { getJob } = await import('./jobs.js');
  const job = await getJob(jobId);

  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status !== JOB_STATUS.COMPLETED) {
    throw new Error(`Job is ${job.status}, not completed`);
  }

  if (!job.result_path) {
    throw new Error('Translation result not found');
  }

  const content = await fs.readFile(job.result_path, 'utf-8');
  return JSON.parse(content);
}

/**
 * Check if translation already exists
 */
export async function translationExists(documentId, targetLanguage) {
  try {
    // Get segment count from LibSQL (source of truth)
    const totalResult = await queryOne(
      'SELECT COUNT(*) as count FROM content WHERE doc_id = ?',
      [documentId]
    );
    const totalSegments = totalResult?.count || 0;

    // Check cache
    const cachedCount = await queryOne(
      `SELECT COUNT(*) as count FROM processed_cache
       WHERE document_id = ? AND process_type = 'translation' AND target_language = ?`,
      [documentId, targetLanguage]
    );

    return {
      exists: cachedCount.count >= totalSegments,
      cachedSegments: cachedCount.count,
      totalSegments
    };
  } catch {
    return { exists: false, cachedSegments: 0, totalSegments: 0 };
  }
}

/**
 * Build prompt for study (literal) translation
 * Produces word-by-word translation with linguistic annotations
 */
function buildStudyTranslationPrompt(sourceLang, contentType, contextSection = '') {
  const sourceName = SUPPORTED_LANGUAGES[sourceLang] || sourceLang;

  return `You are an expert linguistic translator specializing in ${sourceName} religious texts. Create a LITERAL study translation with linguistic annotations.

${contextSection}

## TASK: Literal Translation for Language Study

Create a word-by-word literal translation that helps students understand the original structure and meaning. This is NOT for reading fluency - it's for studying the original language.

## OUTPUT FORMAT (JSON only, no markdown):
{
  "literal_translation": "The complete literal translation as a single string",
  "segments": [
    {
      "original": "original phrase/clause",
      "literal": "word-by-word literal translation",
      "notes": "grammatical notes, root words, linguistic observations"
    }
  ]
}

## TRANSLATION STYLE:
- Preserve word order where possible (even if awkward in English)
- Use parentheses for implied words: "the-book (of) God"
- Show verb forms: "he-wrote" (past active masculine singular)
- Preserve particles and prepositions literally
- Indicate grammatical constructs: (construct state), (definite), (emphatic)

## SEGMENTATION:
- Divide into meaningful grammatical units (clauses, phrases)
- Each segment should express one grammatical unit
- Segments should be small enough for detailed annotation (2-10 words typically)

## NOTES SHOULD INCLUDE:
- Root words in Arabic/Persian with transliteration: جمل (j-m-l, "beauty")
- Grammatical forms: verb pattern (Form II), noun pattern (maf'ūl)
- Particle meanings: ب (bi-, "in/by/with")
- Notable constructions: idāfa (genitive construct), إضافة
- Cross-references to similar usage in other texts if relevant

## Bahá'í Transliteration (REQUIRED):
- Long vowels: á, í, ú (NOT ā, ī, ū)
- Emphatics: Ḥ, Ṭ, Ẓ, Ṣ, Ḍ with dot-under
- Examples: Bahá'u'lláh, 'Abdu'l-Bahá, Qá'im

Return ONLY valid JSON, no explanations or markdown code blocks.`;
}

/**
 * Translate text for study mode with literal translation and linguistic notes
 */
async function translateForStudy(text, sourceLang, targetLang, contentType, contextSection = '') {
  // Only supports translation to English currently
  if (targetLang !== 'en') {
    const plainTranslation = await translateText(text, sourceLang, targetLang, 'high', contentType);
    return { translation: plainTranslation, studyNotes: null };
  }

  const systemPrompt = buildStudyTranslationPrompt(sourceLang, contentType, contextSection);

  const response = await withTimeout(
    aiService('quality').chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ], {
      temperature: 0.2, // Lower temperature for more consistent literal translations
      maxTokens: Math.min(Math.max(text.length * 5, 1000), 16000), // Cap at model limit
      caller: 'translator'
    }),
    API_TIMEOUT_MS,
    'translateForStudy'
  );

  // Parse JSON response
  let result;
  try {
    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    result = JSON.parse(jsonStr);
  } catch (parseErr) {
    logger.warn({ err: parseErr.message, response: response.content.substring(0, 200) },
      'Failed to parse study translation JSON, falling back to plain');
    // Fallback to plain translation
    const plainTranslation = await translateText(text, sourceLang, targetLang, 'high', contentType);
    return { translation: plainTranslation, studyNotes: null };
  }

  return {
    translation: result.literal_translation || result.translation || '',
    studyNotes: result.segments ? { segments: result.segments } : null
  };
}

/**
 * Translate marked text with document/paragraph context
 */
async function translateMarkedTextWithContext(text, sourceLang, targetLang, contentType, contextSection = '') {
  // Extract sentences using markers
  const sentences = getSentences(text);

  if (sentences.length === 0) {
    // No sentences found - translate as whole
    const translation = await translateTextWithContext(stripMarkers(text), sourceLang, targetLang, contentType, contextSection);
    return { translation, segments: null };
  }

  // Translate each sentence individually (with context only for first sentence)
  const segments = {};
  const translatedSentences = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const key = `s${sentence.id}`;
    try {
      // Only include full context for first sentence to save tokens
      const ctx = i === 0 ? contextSection : '';
      const translation = await translateTextWithContext(sentence.text, sourceLang, targetLang, contentType, ctx);
      segments[key] = {
        original: sentence.text,
        text: translation
      };
      translatedSentences.push(translation);
    } catch (err) {
      logger.warn({ sentenceId: sentence.id, err: err.message }, 'Failed to translate sentence');
      segments[key] = {
        original: sentence.text,
        text: sentence.text,
        error: err.message
      };
      translatedSentences.push(sentence.text);
    }
  }

  const fullTranslation = translatedSentences.join(' ');
  return { translation: fullTranslation, segments };
}

/**
 * Translate a single text with context (for marked text sentences)
 */
async function translateTextWithContext(text, sourceLang, targetLang, contentType, contextSection = '') {
  const basePrompt = buildTranslationPrompt(sourceLang, targetLang, 'high', contentType);
  const systemPrompt = contextSection
    ? `${contextSection}\n\n${basePrompt}`
    : basePrompt;

  const response = await withTimeout(
    aiService('quality').chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ], {
      temperature: 0.3,
      maxTokens: Math.max(text.length * 3, 500),
      caller: 'translator'
    }),
    API_TIMEOUT_MS,
    'translateTextWithContext'
  );

  return response.content.trim();
}

/**
 * Translate text with segments and context
 * Enhanced version of translateTextWithSegments that includes context
 */
async function translateTextWithSegmentsAndContext(text, sourceLang, targetLang, contentType, contextSection = '') {
  // Only supports translation to English currently
  if (targetLang !== 'en') {
    const plainTranslation = await translateTextWithContext(text, sourceLang, targetLang, contentType, contextSection);
    return { translation: plainTranslation, segments: null };
  }

  const basePrompt = buildAlignedTranslationPrompt(sourceLang, contentType);
  const systemPrompt = contextSection
    ? `${contextSection}\n\n${basePrompt}`
    : basePrompt;

  const response = await withTimeout(
    aiService('quality').chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ], {
      temperature: 0.3,
      maxTokens: Math.max(text.length * 4, 800),
      caller: 'translator'
    }),
    API_TIMEOUT_MS,
    'translateTextWithSegmentsAndContext'
  );

  // Parse JSON response
  let result;
  try {
    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    result = JSON.parse(jsonStr);
  } catch (parseErr) {
    logger.warn({ err: parseErr.message, response: response.content.substring(0, 200) },
      'Failed to parse aligned translation JSON with context, falling back to plain');
    const plainTranslation = await translateTextWithContext(text, sourceLang, targetLang, contentType, contextSection);
    return { translation: plainTranslation, segments: null };
  }

  // Validate structure
  if (!result.segments || !Array.isArray(result.segments)) {
    logger.warn('Invalid segments structure, falling back to plain translation');
    const plainTranslation = await translateTextWithContext(text, sourceLang, targetLang, contentType, contextSection);
    return { translation: plainTranslation, segments: null };
  }

  // Integrity check (same as translateTextWithSegments)
  const normalizeText = (t) => t.replace(/\s+/g, ' ').trim();
  const originalNormalized = normalizeText(text);
  const segmentsJoined = normalizeText(result.segments.map(s => s.original).join(' '));

  if (originalNormalized !== segmentsJoined) {
    logger.error({
      originalLength: originalNormalized.length,
      segmentsLength: segmentsJoined.length,
      segmentCount: result.segments.length
    }, 'SEGMENTATION INTEGRITY ERROR with context: falling back to plain');

    const plainTranslation = await translateTextWithContext(text, sourceLang, targetLang, contentType, contextSection);
    return { translation: plainTranslation, segments: null, integrityError: true };
  }

  // Add IDs to segments and join translations
  const segments = result.segments.map((seg, idx) => ({
    id: idx + 1,
    original: seg.original,
    translation: seg.translation
  }));

  const fullTranslation = segments.map(s => s.translation).join(' ');

  return { translation: fullTranslation, segments };
}

// Export the aligned translation function for scripts
export { translateTextWithSegments, translateCombined };

/**
 * Find documents with incomplete translations (missing paragraphs)
 * Returns documents that have some but not all paragraphs translated
 */
export async function findIncompleteTranslations(limit = 50) {
  const results = await queryAll(`
    SELECT
      doc_id,
      COUNT(*) as total_paragraphs,
      SUM(CASE WHEN translation IS NOT NULL AND translation != '' THEN 1 ELSE 0 END) as translated_paragraphs
    FROM content
    WHERE doc_id IN (
      SELECT DISTINCT doc_id FROM content
      WHERE translation IS NOT NULL AND translation != ''
    )
    GROUP BY doc_id
    HAVING translated_paragraphs < total_paragraphs AND translated_paragraphs > 0
    LIMIT ?
  `, [limit]);

  return results.map(r => ({
    documentId: r.doc_id,
    totalParagraphs: r.total_paragraphs,
    translatedParagraphs: r.translated_paragraphs,
    missingParagraphs: r.total_paragraphs - r.translated_paragraphs,
    completionPercent: Math.round((r.translated_paragraphs / r.total_paragraphs) * 100)
  }));
}

/**
 * Re-queue translation for a document (to complete missing paragraphs)
 * Will only translate paragraphs that don't have both reading and study translations
 */
export async function requeueIncompleteTranslation({
  userId,
  documentId,
  notifyEmail,
  priority = 0
}) {
  // Check if there's already a pending/processing job for this document
  const existingJob = await queryOne(`
    SELECT id, status FROM jobs
    WHERE document_id = ? AND type = 'translation' AND status IN ('pending', 'processing')
  `, [documentId]);

  if (existingJob) {
    logger.info({ documentId, existingJobId: existingJob.id }, 'Translation job already in progress');
    return { id: existingJob.id, status: existingJob.status, existing: true };
  }

  // Create new job - processInAppTranslation will only translate missing paragraphs
  const job = await createJob({
    type: JOB_TYPES.TRANSLATION,
    userId,
    documentId,
    params: {
      targetLanguage: 'en',
      sourceLanguage: null, // Auto-detect
      quality: 'high',
      contentType: null // Auto-detect
    },
    notifyEmail,
    priority
  });

  logger.info({ documentId, jobId: job.id }, 'Re-queued incomplete translation');
  return { ...job, existing: false };
}

export const translation = {
  SUPPORTED_LANGUAGES,
  requestTranslation,
  processTranslationJob,
  getTranslatedDocument,
  translationExists,
  translateTextWithSegments,
  findIncompleteTranslations,
  requeueIncompleteTranslation
};

export default translation;
