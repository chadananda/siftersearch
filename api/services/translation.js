/**
 * Translation Service
 *
 * Handles document translation with caching to prevent duplicate work.
 * Uses AI providers for translation with quality options.
 */

import { getMeili, INDEXES } from '../lib/search.js';
import { query, queryAll } from '../lib/db.js';
import { aiService } from '../lib/ai-services.js';
import { logger } from '../lib/logger.js';
import {
  JOB_TYPES,
  JOB_STATUS,
  createJob,
  updateJobStatus,
  generateContentHash,
  checkCache,
  storeInCache
} from './jobs.js';
import { chatCompletion } from '../lib/ai.js';
import fs from 'fs/promises';
import path from 'path';

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
 * Request a document translation
 * Returns job ID for tracking
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
 * Process in-app translation (Arabic/Persian -> English)
 * Saves translations directly to content.translation column
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
  }, 'processInAppTranslation starting');

  if (!documentId) {
    throw new Error(`document_id is ${documentId} (type: ${typeof documentId})`);
  }

  // Get untranslated paragraphs from content table
  const paragraphs = await queryAll(`
    SELECT id, paragraph_index, text
    FROM content
    WHERE doc_id = ? AND (translation IS NULL OR translation = '')
    ORDER BY paragraph_index
  `, [documentId]);

  const totalParagraphs = paragraphs.length;

  if (totalParagraphs === 0) {
    logger.info({ jobId: job.id, documentId }, 'No paragraphs need translation');
    await updateJobStatus(job.id, JOB_STATUS.COMPLETED, {
      progress: 0,
      totalItems: 0
    });
    return { success: true, translated: 0 };
  }

  await updateJobStatus(job.id, JOB_STATUS.PROCESSING, { totalItems: totalParagraphs });

  let translatedCount = 0;
  const batchSize = 5; // Translate in batches of 5

  for (let i = 0; i < paragraphs.length; i += batchSize) {
    const batch = paragraphs.slice(i, i + batchSize);

    // Translate batch in parallel with aligned segments
    const translations = await Promise.all(
      batch.map(async (para) => {
        try {
          const result = await translateTextWithSegments(
            para.text,
            sourceLang,
            'en',
            contentType
          );
          return {
            id: para.id,
            translation: result.translation,
            segments: result.segments,
            success: true
          };
        } catch (err) {
          logger.warn({ paraId: para.id, err: err.message }, 'Failed to translate paragraph');
          return { id: para.id, success: false, error: err.message };
        }
      })
    );

    // Save translations to content table (including segments for phrase-level alignment)
    const now = new Date().toISOString();
    for (const result of translations) {
      if (result.success && result.translation) {
        const segmentsJson = result.segments ? JSON.stringify(result.segments) : null;
        await query(`
          UPDATE content
          SET translation = ?, translation_segments = ?, synced = 0, updated_at = ?
          WHERE id = ?
        `, [result.translation, segmentsJson, now, result.id]);
        translatedCount++;
      }
    }

    // Update job progress
    await updateJobStatus(job.id, JOB_STATUS.PROCESSING, {
      progress: i + batch.length,
      totalItems: totalParagraphs
    });

    logger.info({
      jobId: job.id,
      progress: i + batch.length,
      total: totalParagraphs
    }, 'Translation batch completed');
  }

  await updateJobStatus(job.id, JOB_STATUS.COMPLETED, {
    progress: totalParagraphs,
    totalItems: totalParagraphs
  });

  logger.info({
    jobId: job.id,
    documentId,
    translated: translatedCount,
    total: totalParagraphs
  }, 'In-app translation completed');

  return {
    success: true,
    translated: translatedCount,
    total: totalParagraphs
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

## Content Type Detection:
1. **Scripture, Prayers, Poetry, Prophecy**: Use Shoghi Effendi's biblical style
   - Archaic pronouns: Thou, Thee, Thine, Thy
   - Elevated diction: perceiveth, hath, art, doth, verily
   - Formal divine attributes: sovereignty, dominion, majesty

2. **Historical Narrative, Letters, Chronicles**: Use clear modern English
   - Readable scholarly prose
   - Historical accuracy
   - Modern sentence structure

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
  const response = await aiService('quality').chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text }
  ], {
    temperature: 0.3,
    maxTokens: Math.max(text.length * 3, 500) // Allow for expansion in translation
  });

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

OUTPUT FORMAT (JSON only, no markdown):
{
  "segments": [
    {"original": "phrase in original language", "translation": "English translation"},
    {"original": "next phrase", "translation": "its translation"}
  ]
}

SEGMENTATION RULES:
- Break at natural phrase boundaries (sentences, clauses, or logical units)
- Keep segments short enough for easy comparison (1-3 sentences max)
- Ensure each original phrase maps to exactly one translation phrase
- Preserve the complete text - every word must be in a segment

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

  const response = await aiService('quality').chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text }
  ], {
    temperature: 0.3,
    maxTokens: Math.max(text.length * 4, 800) // Allow for JSON overhead
  });

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

// Export the aligned translation function for scripts
export { translateTextWithSegments };

export const translation = {
  SUPPORTED_LANGUAGES,
  requestTranslation,
  processTranslationJob,
  getTranslatedDocument,
  translationExists,
  translateTextWithSegments
};

export default translation;
