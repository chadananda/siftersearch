/**
 * Audio Conversion Service
 *
 * Converts documents to audio using text-to-speech.
 * Supports multiple voices and caches results to prevent duplicate work.
 */

import { getMeili, INDEXES } from '../lib/search.js';
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
import OpenAI from 'openai';

// Output directory for audio files
const AUDIO_DIR = process.env.AUDIO_DIR || './data/audio';

// Supported voices (OpenAI TTS)
export const VOICES = {
  alloy: { name: 'Alloy', description: 'Neutral, balanced voice' },
  echo: { name: 'Echo', description: 'Male, clear and measured' },
  fable: { name: 'Fable', description: 'British, expressive' },
  onyx: { name: 'Onyx', description: 'Deep, authoritative male' },
  nova: { name: 'Nova', description: 'Warm, friendly female' },
  shimmer: { name: 'Shimmer', description: 'Clear, professional female' }
};

// Audio formats
export const AUDIO_FORMATS = {
  mp3: { ext: 'mp3', contentType: 'audio/mpeg' },
  opus: { ext: 'opus', contentType: 'audio/opus' },
  aac: { ext: 'aac', contentType: 'audio/aac' },
  flac: { ext: 'flac', contentType: 'audio/flac' }
};

// TTS model options
export const TTS_MODELS = {
  standard: 'tts-1',      // Faster, lower quality
  hd: 'tts-1-hd'          // Slower, higher quality
};

// Lazy-init OpenAI client
let openaiClient = null;

function getOpenAI() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

/**
 * Request audio conversion for a document
 * Returns job ID for tracking
 */
export async function requestAudioConversion({
  userId,
  documentId,
  voice = 'nova',
  format = 'mp3',
  quality = 'standard',
  notifyEmail
}) {
  if (!VOICES[voice]) {
    throw new Error(`Unsupported voice: ${voice}. Available: ${Object.keys(VOICES).join(', ')}`);
  }

  if (!AUDIO_FORMATS[format]) {
    throw new Error(`Unsupported format: ${format}. Available: ${Object.keys(AUDIO_FORMATS).join(', ')}`);
  }

  // Create job
  const job = await createJob({
    type: JOB_TYPES.AUDIO,
    userId,
    documentId,
    params: {
      voice,
      format,
      quality,
      model: quality === 'hd' ? TTS_MODELS.hd : TTS_MODELS.standard
    },
    notifyEmail
  });

  return job;
}

/**
 * Process an audio conversion job
 * Called by job worker
 */
export async function processAudioJob(job) {
  const { documentId, params } = job;
  const { voice, format, model } = params;

  logger.info({ jobId: job.id, documentId, voice, format }, 'Starting audio job');

  await updateJobStatus(job.id, JOB_STATUS.PROCESSING);

  try {
    const meili = getMeili();

    // Get document metadata
    const document = await meili.index(INDEXES.DOCUMENTS).getDocument(documentId);

    // Get all segments
    const segmentsResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
      filter: `doc_id = ${documentId}`,  // INTEGER, no quotes
      limit: 10000,
      sort: ['paragraph_index:asc']
    });

    const segments = segmentsResult.hits;
    const totalSegments = segments.length;

    await updateJobStatus(job.id, JOB_STATUS.PROCESSING, { totalItems: totalSegments });

    // Process each segment
    const audioFiles = [];
    let processedCount = 0;
    let cachedCount = 0;
    let totalSize = 0;

    for (const segment of segments) {
      const contentHash = generateContentHash(segment.text + voice);

      // Check cache first
      const cached = await checkCache({
        documentId,
        segmentId: segment.id,
        processType: 'audio',
        voiceId: voice,
        contentHash
      });

      let audioPath;

      if (cached) {
        // Check if cached file still exists
        try {
          await fs.access(cached.result_path);
          audioPath = cached.result_path;
          cachedCount++;
          totalSize += cached.file_size || 0;
        } catch {
          // Cache file missing, regenerate
          logger.warn({ segmentId: segment.id }, 'Cached audio file missing, regenerating');
          audioPath = await generateSegmentAudio(documentId, segment, voice, format, model);
          const stats = await fs.stat(audioPath);
          totalSize += stats.size;
        }
      } else {
        // Generate audio
        audioPath = await generateSegmentAudio(documentId, segment, voice, format, model);
        const stats = await fs.stat(audioPath);
        totalSize += stats.size;

        // Store in cache
        await storeInCache({
          documentId,
          segmentId: segment.id,
          processType: 'audio',
          voiceId: voice,
          contentHash,
          resultPath: audioPath,
          fileSize: stats.size
        });
      }

      audioFiles.push({
        segmentId: segment.id,
        paragraphIndex: segment.paragraph_index,
        path: audioPath,
        heading: segment.heading
      });

      processedCount++;

      // Update progress every 5 segments
      if (processedCount % 5 === 0) {
        await updateJobStatus(job.id, JOB_STATUS.PROCESSING, { progress: processedCount });
      }
    }

    // Create combined audio file or manifest
    const outputPath = await createAudioManifest(documentId, voice, format, {
      document,
      audioFiles,
      totalDuration: null // Would need to calculate from actual audio
    });

    // Generate download URL
    const resultUrl = `/api/audio/download/${job.id}`;

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
      generatedCount: totalSegments - cachedCount,
      totalSizeBytes: totalSize
    }, 'Audio job completed');

    return {
      success: true,
      resultUrl,
      stats: {
        total: totalSegments,
        cached: cachedCount,
        generated: totalSegments - cachedCount,
        totalSizeBytes: totalSize
      }
    };

  } catch (err) {
    logger.error({ jobId: job.id, err: err.message }, 'Audio job failed');
    await updateJobStatus(job.id, JOB_STATUS.FAILED, { errorMessage: err.message });
    throw err;
  }
}

/**
 * Generate audio for a single segment
 */
async function generateSegmentAudio(documentId, segment, voice, format, model) {
  const openai = getOpenAI();

  // Ensure directory exists
  const dir = path.join(AUDIO_DIR, documentId, 'segments', voice);
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${segment.id}.${AUDIO_FORMATS[format].ext}`);

  // Generate speech
  const mp3 = await openai.audio.speech.create({
    model,
    voice,
    input: segment.text,
    response_format: format
  });

  // Save to file
  const buffer = Buffer.from(await mp3.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return filePath;
}

/**
 * Create audio manifest (playlist) for a document
 */
async function createAudioManifest(documentId, voice, format, data) {
  const dir = path.join(AUDIO_DIR, documentId);
  await fs.mkdir(dir, { recursive: true });

  // Create M3U playlist
  const playlistPath = path.join(dir, `${voice}.m3u`);
  const playlistContent = [
    '#EXTM3U',
    `#PLAYLIST:${data.document.title}`,
    ...data.audioFiles.map(f => {
      const heading = f.heading ? ` - ${f.heading}` : '';
      return [
        `#EXTINF:-1,Segment ${f.paragraphIndex + 1}${heading}`,
        f.path
      ].join('\n');
    })
  ].join('\n');

  await fs.writeFile(playlistPath, playlistContent, 'utf-8');

  // Also save JSON manifest
  const manifestPath = path.join(dir, `${voice}.json`);
  await fs.writeFile(manifestPath, JSON.stringify({
    document: data.document,
    voice,
    format,
    segments: data.audioFiles.map(f => ({
      segmentId: f.segmentId,
      paragraphIndex: f.paragraphIndex,
      heading: f.heading,
      audioFile: path.basename(f.path)
    }))
  }, null, 2), 'utf-8');

  return manifestPath;
}

/**
 * Get audio manifest by job ID
 */
export async function getAudioManifest(jobId) {
  const { getJob } = await import('./jobs.js');
  const job = await getJob(jobId);

  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status !== JOB_STATUS.COMPLETED) {
    throw new Error(`Job is ${job.status}, not completed`);
  }

  if (!job.result_path) {
    throw new Error('Audio result not found');
  }

  const content = await fs.readFile(job.result_path, 'utf-8');
  return JSON.parse(content);
}

/**
 * Get a specific audio segment file
 */
export async function getAudioSegment(documentId, segmentId, voice) {
  const filePath = path.join(AUDIO_DIR, documentId, 'segments', voice, `${segmentId}.mp3`);

  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    throw new Error('Audio segment not found');
  }
}

/**
 * Check if audio already exists for document/voice
 */
export async function audioExists(documentId, voice) {
  const meili = getMeili();

  try {
    // Get segment count
    const result = await meili.index(INDEXES.PARAGRAPHS).search('', {
      filter: `doc_id = ${documentId}`,  // INTEGER, no quotes
      limit: 0
    });

    const totalSegments = result.estimatedTotalHits;

    // Check cache
    const { queryOne } = await import('../lib/db.js');
    const cachedCount = await queryOne(
      `SELECT COUNT(*) as count FROM processed_cache
       WHERE document_id = ? AND process_type = 'audio' AND voice_id = ?`,
      [documentId, voice]
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
 * Get estimated audio duration (rough estimate: 150 words per minute)
 */
export function estimateAudioDuration(text) {
  const words = text.split(/\s+/).length;
  const minutes = words / 150;
  return Math.ceil(minutes * 60); // Return seconds
}

export const audio = {
  VOICES,
  AUDIO_FORMATS,
  TTS_MODELS,
  requestAudioConversion,
  processAudioJob,
  getAudioManifest,
  getAudioSegment,
  audioExists,
  estimateAudioDuration
};

export default audio;
