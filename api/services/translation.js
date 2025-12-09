/**
 * Translation Service
 *
 * Handles document translation with caching to prevent duplicate work.
 * Uses AI providers for translation with quality options.
 */

import { getMeili, INDEXES } from '../lib/search.js';
import { chatCompletion } from '../lib/ai.js';
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
 */
export async function requestTranslation({
  userId,
  documentId,
  targetLanguage,
  sourceLanguage = null,
  notifyEmail,
  quality = 'standard' // standard, high
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
      quality
    },
    notifyEmail
  });

  return job;
}

/**
 * Process a translation job
 * Called by job worker
 */
export async function processTranslationJob(job) {
  const { documentId, params } = job;
  const { targetLanguage, sourceLanguage, quality } = params;

  logger.info({ jobId: job.id, documentId, targetLanguage }, 'Starting translation job');

  await updateJobStatus(job.id, JOB_STATUS.PROCESSING);

  try {
    const meili = getMeili();

    // Get document metadata
    const document = await meili.index(INDEXES.DOCUMENTS).getDocument(documentId);
    const detectedSourceLang = sourceLanguage || document.language || 'en';

    // Skip if already in target language
    if (detectedSourceLang === targetLanguage) {
      throw new Error('Document is already in target language');
    }

    // Get all segments
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
          translatedText = await translateText(segment.text, detectedSourceLang, targetLanguage, quality);
        }
      } else {
        // Translate
        translatedText = await translateText(segment.text, detectedSourceLang, targetLanguage, quality);

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
 * Build translation prompt with style examples for Bahá'í texts
 */
function buildTranslationPrompt(sourceLang, targetLang, quality) {
  const sourceName = SUPPORTED_LANGUAGES[sourceLang] || sourceLang;
  const targetName = SUPPORTED_LANGUAGES[targetLang] || targetLang;

  // Standard quality - simple translation
  if (quality !== 'high') {
    return `Translate the following text from ${sourceName} to ${targetName}. Preserve the meaning and provide only the translation.`;
  }

  // High quality - detailed guidance for scholarly/religious texts
  let prompt = `You are an expert translator specializing in religious and scholarly texts, particularly Bahá'í sacred writings. Translate the following text from ${sourceName} to ${targetName}.

## Translation Guidelines:
- Preserve the meaning, tone, and spiritual significance
- Maintain technical and theological terminology
- Use elevated, formal language appropriate to sacred texts
- Preserve parallelism and rhetorical devices
- Provide only the translation without explanations`;

  // Add Shoghi Effendi style guidance for Arabic→English translations
  if (sourceLang === 'ar' && targetLang === 'en') {
    prompt += `

## Style Reference: Shoghi Effendi's Translation Style
When translating Arabic Bahá'í texts to English, emulate the Guardian's distinctive style:

### Vocabulary:
- Use archaic pronouns for the Divine: Thou, Thee, Thine, Thy
- Employ elevated diction: perceiveth, confesseth, hath, art, doth
- Render divine attributes formally: sovereignty, dominion, majesty

### Syntax:
- Use inverted word order for emphasis where appropriate
- Craft flowing sentences with parallel clauses
- Link subordinate clauses with "and" and "that"

### Rhetorical Devices:
- Preserve parallelism (e.g., "The winds of tests... the tempests of trials")
- Maintain metaphors (e.g., "lamp of Thy love", "ocean of Thy nearness")
- Repeat divine attributes for emphasis

### Example Correspondences:
- "سُبْحانَكَ يا إِلهي" → "Glorified art Thou, O Lord my God!"
- "أَسْئَلُكَ" → "I beseech Thee" / "I entreat Thee"
- "بِأَنْ تَحْفَظَهُمْ" → "to keep them safe"
- "لا خَوْفٌ عَلَيْهِمْ وَلا هُمْ يَحْزَنُونَ" → "on whom shall come no fear and who shall not be put to grief"`;
  }

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
 * Translate a single text segment
 */
async function translateText(text, sourceLang, targetLang, quality = 'standard') {
  const systemPrompt = buildTranslationPrompt(sourceLang, targetLang, quality);

  const response = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text }
  ], {
    temperature: 0.3,
    maxTokens: text.length * 3 // Allow for expansion in translation
  });

  return response.content.trim();
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

export const translation = {
  SUPPORTED_LANGUAGES,
  requestTranslation,
  processTranslationJob,
  getTranslatedDocument,
  translationExists
};

export default translation;
