/**
 * Translation Service
 *
 * Handles document translation with caching to prevent duplicate work.
 * Uses AI providers for translation with quality options.
 */

import { getMeili, INDEXES } from '../lib/search.js';
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
import { chatCompletion } from '../lib/ai.js';
import fs from 'fs/promises';
import path from 'path';
import { getSentences, stripMarkers, hasMarkers } from '../lib/markers.js';

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
    const meili = getMeili();

    // Get document metadata
    const document = await meili.index(INDEXES.DOCUMENTS).getDocument(documentId);
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
    // Get all segments from Meilisearch
    const segmentsResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
      filter: `document_id = "${documentId}"`,
      limit: 10000,
      sort: ['paragraph_index:asc']
    });

    const segments = segmentsResult.hits;
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

  // Create index map for quick lookup by paragraph_index
  const indexMap = new Map(paragraphs.map(p => [p.paragraph_index, p]));

  // Generate wave order
  for (let offset = 0; offset < stride; offset++) {
    const wave = [];
    for (let i = offset; i < totalParagraphs; i += stride) {
      // Find paragraph at this position
      const para = paragraphs.find(p => p.paragraph_index === i + 1);
      if (para) {
        wave.push(para);
      }
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
 * Process in-app translation (Arabic/Persian -> English)
 * Generates BOTH reading and study translations simultaneously
 * Saves to content.translation as JSON: { reading, study, segments, notes }
 *
 * Enhanced with:
 * - Document metadata context (title, author, abstract)
 * - Wave-based staggered translation for context propagation
 * - Previous paragraph context (original + translation when available)
 * - Dual translation: reading (literary) + study (literal with notes)
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
  const paragraphs = await queryAll(`
    SELECT id, paragraph_index, text, translation
    FROM content
    WHERE doc_id = ?
    ORDER BY paragraph_index
  `, [documentId]);

  // Check if we're resuming from a checkpoint
  const resumeFromCheckpoint = job.last_checkpoint || 0;
  if (resumeFromCheckpoint > 0) {
    logger.info({
      jobId: job.id,
      documentId,
      resumeFromCheckpoint
    }, 'Resuming translation from checkpoint');
  }

  // Filter to paragraphs that need translation (missing reading OR study)
  // and haven't been processed in previous runs (paragraph_index > checkpoint)
  const paragraphsNeedingTranslation = paragraphs.filter(p => {
    // Skip paragraphs before the checkpoint (already processed)
    if (p.paragraph_index <= resumeFromCheckpoint) {
      return false;
    }
    const existing = parseExistingTranslation(p.translation);
    return !existing || !existing.reading || !existing.study;
  });

  const totalParagraphs = paragraphsNeedingTranslation.length;
  const totalWithPrevious = resumeFromCheckpoint + totalParagraphs;

  if (totalParagraphs === 0) {
    logger.info({ jobId: job.id, documentId, resumeFromCheckpoint }, 'No paragraphs need translation');
    await updateJobStatus(job.id, JOB_STATUS.COMPLETED, {
      progress: resumeFromCheckpoint,
      totalItems: resumeFromCheckpoint
    });
    return { success: true, translated: 0, resumed: resumeFromCheckpoint };
  }

  await updateJobStatus(job.id, JOB_STATUS.PROCESSING, {
    totalItems: totalWithPrevious,
    progress: resumeFromCheckpoint  // Start from where we left off
  });

  // Build a map for looking up previous paragraphs (including already-translated ones)
  // Parse existing translations to get reading text for context
  const paragraphMap = new Map(paragraphs.map(p => {
    const existing = parseExistingTranslation(p.translation);
    return [p.paragraph_index, {
      ...p,
      readingTranslation: existing?.reading || null
    }];
  }));

  // Organize into staggered waves (1,11,21... then 2,12,22...)
  const waves = organizeIntoWaves(paragraphsNeedingTranslation, 10);

  logger.info({
    jobId: job.id,
    totalParagraphs,
    waveCount: waves.length
  }, 'Organized paragraphs into waves (dual translation)');

  let translatedCount = 0;
  let waveNumber = 0;

  for (const wave of waves) {
    waveNumber++;

    // Process wave sequentially to ensure context propagates
    for (const para of wave) {
      try {
        // Get previous paragraph context
        const prevPara = paragraphMap.get(para.paragraph_index - 1);
        const prevContext = prevPara ? {
          original: prevPara.text,
          translation: prevPara.readingTranslation || null
        } : null;

        const now = new Date().toISOString();
        const textHasMarkers = hasMarkers(para.text);

        // Parse existing translation to see what's needed
        const existing = parseExistingTranslation(para.translation);
        const needsReading = !existing?.reading;
        const needsStudy = !existing?.study;

        // Start with existing data or empty object
        const translationData = existing || { reading: null, study: null, segments: null, notes: null };

        // Generate reading translation if needed
        if (needsReading) {
          const readingResult = await translateWithContext({
            text: para.text,
            sourceLang,
            targetLang: 'en',
            contentType,
            documentContext,
            previousParagraph: prevContext,
            translationType: 'reading',
            hasMarkers: textHasMarkers
          });

          translationData.reading = readingResult.translation;
          translationData.segments = readingResult.segments || null;

          // Update map for future paragraphs
          const mapEntry = paragraphMap.get(para.paragraph_index);
          if (mapEntry) {
            mapEntry.readingTranslation = readingResult.translation;
          }
        }

        // Generate study translation if needed
        if (needsStudy) {
          const studyResult = await translateWithContext({
            text: para.text,
            sourceLang,
            targetLang: 'en',
            contentType,
            documentContext,
            previousParagraph: prevContext,
            translationType: 'study',
            hasMarkers: textHasMarkers
          });

          translationData.study = studyResult.translation;
          translationData.notes = studyResult.studyNotes?.segments || null;
        }

        // Save as single JSON object in translation field
        const translationJson = JSON.stringify(translationData);
        await query(`
          UPDATE content
          SET translation = ?, synced = 0, updated_at = ?
          WHERE id = ?
        `, [translationJson, now, para.id]);

        translatedCount++;

        // Save checkpoint after EACH paragraph for resume capability
        // This also updates heartbeat and progress
        await updateJobCheckpoint(
          job.id,
          para.paragraph_index,  // checkpoint = last successfully translated paragraph
          resumeFromCheckpoint + translatedCount  // total progress including resumed work
        );

        logger.debug({
          paraId: para.id,
          paragraphIndex: para.paragraph_index,
          progress: `${translatedCount}/${totalParagraphs}`,
          reading: needsReading ? 'generated' : 'skipped',
          study: needsStudy ? 'generated' : 'skipped'
        }, 'Paragraph translated');

      } catch (err) {
        logger.warn({
          paraId: para.id,
          paragraphIndex: para.paragraph_index,
          err: err.message
        }, 'Failed to translate paragraph');
      }
    }

    logger.info({
      jobId: job.id,
      wave: waveNumber,
      waveSize: wave.length,
      totalProgress: translatedCount
    }, 'Wave completed');
  }

  await updateJobStatus(job.id, JOB_STATUS.COMPLETED, {
    progress: totalWithPrevious,
    totalItems: totalWithPrevious
  });

  logger.info({
    jobId: job.id,
    documentId,
    translated: translatedCount,
    resumed: resumeFromCheckpoint,
    total: totalWithPrevious
  }, 'Dual translation completed');

  return {
    success: true,
    translated: translatedCount,
    resumed: resumeFromCheckpoint,
    total: totalWithPrevious
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
      maxTokens: Math.max(text.length * 3, 500) // Allow for expansion in translation
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
      maxTokens: Math.max(text.length * 4, 800) // Allow for JSON overhead
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
  // Check if we have all segments cached
  const meili = getMeili();

  try {
    // Get segment count
    const result = await meili.index(INDEXES.PARAGRAPHS).search('', {
      filter: `document_id = "${documentId}"`,
      limit: 0
    });

    const totalSegments = result.estimatedTotalHits;

    // Check cache
    const { queryOne } = await import('../lib/db.js');
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
      maxTokens: Math.max(text.length * 5, 1000) // More tokens for detailed annotations
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
      maxTokens: Math.max(text.length * 3, 500)
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
      maxTokens: Math.max(text.length * 4, 800)
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
export { translateTextWithSegments };

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
