/**
 * Services API Routes
 *
 * Translation and audio conversion services for patron+ users.
 * All routes require patron tier or higher.
 *
 * Translation:
 * POST /api/services/translate - Request document translation
 * GET /api/services/translate/languages - Get supported languages
 * GET /api/services/translate/status/:jobId - Get translation job status
 * GET /api/services/translate/check/:documentId - Check if translation exists
 *
 * Audio:
 * POST /api/services/audio - Request audio conversion
 * GET /api/services/audio/voices - Get available voices
 * GET /api/services/audio/status/:jobId - Get audio job status
 * GET /api/services/audio/check/:documentId - Check if audio exists
 *
 * Downloads:
 * GET /api/services/download/:jobId - Download completed job result
 *
 * Jobs:
 * GET /api/services/jobs - Get user's jobs
 */

import { ApiError } from '../lib/errors.js';
import { requireTier, authenticate } from '../lib/auth.js';
import { queryOne } from '../lib/db.js';
import {
  requestTranslation,
  getTranslatedDocument,
  translationExists,
  SUPPORTED_LANGUAGES
} from '../services/translation.js';
import {
  requestAudioConversion,
  getAudioManifest,
  getAudioSegment,
  audioExists,
  VOICES,
  AUDIO_FORMATS
} from '../services/audio.js';
import {
  getJob,
  getUserJobs,
  JOB_TYPES,
  JOB_STATUS
} from '../services/jobs.js';
import fs from 'fs/promises';
import path from 'path';

// Patron tiers that can access services
const PATRON_TIERS = ['patron', 'institutional', 'admin'];

export default async function servicesRoutes(fastify) {

  // ===== Translation Routes =====

  // Get supported languages
  fastify.get('/translate/languages', async () => {
    return { languages: SUPPORTED_LANGUAGES };
  });

  // Request document translation (patron+ only)
  fastify.post('/translate', {
    preHandler: requireTier(...PATRON_TIERS),
    schema: {
      body: {
        type: 'object',
        required: ['documentId', 'targetLanguage'],
        properties: {
          documentId: { type: 'string' },
          targetLanguage: { type: 'string' },
          sourceLanguage: { type: 'string' },
          quality: { type: 'string', enum: ['standard', 'high'], default: 'standard' },
          notifyEmail: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request) => {
    const { documentId, targetLanguage, sourceLanguage, quality, notifyEmail } = request.body;
    const userId = request.user.sub;

    // Validate target language
    if (!SUPPORTED_LANGUAGES[targetLanguage]) {
      throw ApiError.badRequest(`Unsupported language: ${targetLanguage}`);
    }

    // Check if translation already exists
    const existing = await translationExists(documentId, targetLanguage);
    if (existing.exists) {
      return {
        status: 'already_exists',
        message: 'Translation already exists for this document',
        cachedSegments: existing.cachedSegments
      };
    }

    // Get user email for notification if not provided
    let email = notifyEmail;
    if (!email) {
      const user = await queryOne('SELECT email FROM users WHERE id = ?', [userId]);
      email = user?.email;
    }

    // Create translation job
    const job = await requestTranslation({
      userId,
      documentId,
      targetLanguage,
      sourceLanguage,
      quality,
      notifyEmail: email
    });

    return {
      status: 'queued',
      jobId: job.id,
      message: `Translation to ${SUPPORTED_LANGUAGES[targetLanguage]} queued. You will receive an email when complete.`
    };
  });

  // Check translation status
  fastify.get('/translate/status/:jobId', {
    preHandler: authenticate
  }, async (request) => {
    const { jobId } = request.params;
    const job = await getJob(jobId);

    if (!job) {
      throw ApiError.notFound('Job not found');
    }

    // Verify ownership
    if (job.user_id !== request.user.sub && request.user.tier !== 'admin') {
      throw ApiError.forbidden('Not authorized to view this job');
    }

    return {
      jobId: job.id,
      status: job.status,
      type: job.type,
      documentId: job.document_id,
      params: job.params,
      progress: job.progress,
      totalItems: job.total_items,
      resultUrl: job.status === JOB_STATUS.COMPLETED ? job.result_url : null,
      error: job.status === JOB_STATUS.FAILED ? job.error_message : null,
      createdAt: job.created_at,
      completedAt: job.completed_at
    };
  });

  // Check if translation exists for document
  fastify.get('/translate/check/:documentId', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          documentId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          targetLanguage: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { documentId } = request.params;
    const { targetLanguage } = request.query;

    if (!targetLanguage) {
      throw ApiError.badRequest('targetLanguage query parameter required');
    }

    const result = await translationExists(documentId, targetLanguage);
    return result;
  });

  // ===== Audio Routes =====

  // Get available voices
  fastify.get('/audio/voices', async () => {
    return {
      voices: VOICES,
      formats: Object.keys(AUDIO_FORMATS)
    };
  });

  // Request audio conversion (patron+ only)
  fastify.post('/audio', {
    preHandler: requireTier(...PATRON_TIERS),
    schema: {
      body: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string' },
          voice: { type: 'string', enum: Object.keys(VOICES), default: 'nova' },
          format: { type: 'string', enum: Object.keys(AUDIO_FORMATS), default: 'mp3' },
          quality: { type: 'string', enum: ['standard', 'hd'], default: 'standard' },
          notifyEmail: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request) => {
    const { documentId, voice = 'nova', format = 'mp3', quality, notifyEmail } = request.body;
    const userId = request.user.sub;

    // Check if audio already exists
    const existing = await audioExists(documentId, voice);
    if (existing.exists) {
      return {
        status: 'already_exists',
        message: `Audio with ${voice} voice already exists for this document`,
        cachedSegments: existing.cachedSegments
      };
    }

    // Get user email for notification if not provided
    let email = notifyEmail;
    if (!email) {
      const user = await queryOne('SELECT email FROM users WHERE id = ?', [userId]);
      email = user?.email;
    }

    // Create audio job
    const job = await requestAudioConversion({
      userId,
      documentId,
      voice,
      format,
      quality,
      notifyEmail: email
    });

    return {
      status: 'queued',
      jobId: job.id,
      message: `Audio conversion with ${VOICES[voice].name} voice queued. You will receive an email when complete.`
    };
  });

  // Check audio status
  fastify.get('/audio/status/:jobId', {
    preHandler: authenticate
  }, async (request) => {
    const { jobId } = request.params;
    const job = await getJob(jobId);

    if (!job) {
      throw ApiError.notFound('Job not found');
    }

    // Verify ownership
    if (job.user_id !== request.user.sub && request.user.tier !== 'admin') {
      throw ApiError.forbidden('Not authorized to view this job');
    }

    return {
      jobId: job.id,
      status: job.status,
      type: job.type,
      documentId: job.document_id,
      params: job.params,
      progress: job.progress,
      totalItems: job.total_items,
      resultUrl: job.status === JOB_STATUS.COMPLETED ? job.result_url : null,
      error: job.status === JOB_STATUS.FAILED ? job.error_message : null,
      createdAt: job.created_at,
      completedAt: job.completed_at
    };
  });

  // Check if audio exists for document
  fastify.get('/audio/check/:documentId', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          documentId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          voice: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { documentId } = request.params;
    const { voice = 'nova' } = request.query;

    const result = await audioExists(documentId, voice);
    return result;
  });

  // ===== Download Routes =====

  // Download job result
  fastify.get('/download/:jobId', {
    preHandler: authenticate
  }, async (request, reply) => {
    const { jobId } = request.params;
    const job = await getJob(jobId);

    if (!job) {
      throw ApiError.notFound('Job not found');
    }

    // Verify ownership
    if (job.user_id !== request.user.sub && request.user.tier !== 'admin') {
      throw ApiError.forbidden('Not authorized to download this job');
    }

    if (job.status !== JOB_STATUS.COMPLETED) {
      throw ApiError.badRequest(`Job is ${job.status}, not completed`);
    }

    if (!job.result_path) {
      throw ApiError.notFound('Result file not found');
    }

    // Read and send file
    try {
      const content = await fs.readFile(job.result_path, 'utf-8');
      const filename = path.basename(job.result_path);
      const ext = path.extname(filename);

      let contentType = 'application/json';
      if (ext === '.m3u') contentType = 'audio/x-mpegurl';
      else if (ext === '.txt') contentType = 'text/plain';

      reply
        .header('Content-Type', contentType)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(content);
    } catch (err) {
      throw ApiError.notFound('Result file not found');
    }
  });

  // Download audio segment
  fastify.get('/audio/segment/:documentId/:segmentId', {
    preHandler: authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          documentId: { type: 'string' },
          segmentId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          voice: { type: 'string', default: 'nova' }
        }
      }
    }
  }, async (request, reply) => {
    const { documentId, segmentId } = request.params;
    const { voice = 'nova' } = request.query;

    try {
      const filePath = await getAudioSegment(documentId, segmentId, voice);
      const stream = await fs.readFile(filePath);

      reply
        .header('Content-Type', 'audio/mpeg')
        .header('Content-Disposition', `inline; filename="${segmentId}.mp3"`)
        .send(stream);
    } catch (err) {
      throw ApiError.notFound('Audio segment not found');
    }
  });

  // ===== Job Management =====

  // Get user's jobs
  fastify.get('/jobs', {
    preHandler: authenticate,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: Object.values(JOB_TYPES) },
          status: { type: 'string', enum: Object.values(JOB_STATUS) },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { type, status, limit = 20, offset = 0 } = request.query;
    const userId = request.user.sub;

    const jobs = await getUserJobs(userId, { type, status, limit, offset });

    return {
      jobs: jobs.map(job => ({
        jobId: job.id,
        type: job.type,
        status: job.status,
        documentId: job.document_id,
        params: job.params,
        progress: job.progress,
        totalItems: job.total_items,
        resultUrl: job.status === JOB_STATUS.COMPLETED ? job.result_url : null,
        createdAt: job.created_at,
        completedAt: job.completed_at
      })),
      limit,
      offset
    };
  });
}
