/**
 * Transcriber Agent - Audio/Video to Markdown Transcription
 *
 * Transcribes audio and video content using Whisper (local or API)
 * and formats the output as clean Markdown suitable for indexing.
 *
 * Supports:
 * - Direct audio/video file uploads
 * - URL downloads (YouTube, Vimeo, direct links)
 * - Local Whisper for production (faster, no API costs)
 * - OpenAI Whisper API for development (simpler setup)
 */

import { BaseAgent } from './base-agent.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import OpenAI from 'openai';

// Transcription output directory
const TRANSCRIPTION_DIR = process.env.TRANSCRIPTION_DIR || './data/transcriptions';

// Supported audio/video formats
const SUPPORTED_FORMATS = [
  'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'
];

// Max file size for OpenAI API (25MB)
const MAX_API_FILE_SIZE = 25 * 1024 * 1024;

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

const TRANSCRIBER_SYSTEM_PROMPT = `You are a transcription editor and formatter. Your job is to clean up and format transcribed audio/video content into well-structured Markdown.

TASKS:
1. Fix obvious transcription errors (misheard words, especially proper nouns)
2. Add appropriate punctuation and paragraph breaks
3. Insert section headings where topic shifts occur
4. Format speaker changes if multiple speakers are detected
5. Add a metadata header with title, speaker(s), date if mentioned
6. Clean up filler words (um, uh, like) while preserving natural speech patterns
7. For religious/spiritual content, ensure proper spelling of sacred terms

OUTPUT FORMAT:
---
title: [Descriptive Title]
speaker: [Speaker Name if known]
date: [Date if mentioned]
source: [URL or description]
duration: [HH:MM:SS]
---

# [Title]

[Formatted transcript content with headings and paragraphs]

IMPORTANT:
- Preserve the speaker's voice and style
- Don't add content that wasn't in the original
- Mark unclear portions with [inaudible] or [unclear]
- For Bahá'í content, use proper diacriticals (Bahá'u'lláh, 'Abdu'l-Bahá, etc.)`;

export class TranscriberAgent extends BaseAgent {
  constructor(options = {}) {
    super('transcriber', {
      service: options.service || 'quality',
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens || 4000,
      systemPrompt: TRANSCRIBER_SYSTEM_PROMPT,
      ...options
    });

    this.useLocalWhisper = !config.devMode && this.isWhisperInstalled();
    this.logger.info({ useLocalWhisper: this.useLocalWhisper }, 'Transcriber initialized');
  }

  /**
   * Check if local Whisper is installed
   */
  isWhisperInstalled() {
    try {
      execSync('which whisper', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download media from URL
   * Uses yt-dlp for YouTube/Vimeo, direct download for others
   */
  async downloadMedia(url, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });

    // Check if it's a YouTube/Vimeo URL
    const isYouTube = /youtu\.?be|youtube\.com/i.test(url);
    const isVimeo = /vimeo\.com/i.test(url);

    if (isYouTube || isVimeo) {
      return this.downloadWithYtDlp(url, outputDir);
    } else {
      return this.downloadDirect(url, outputDir);
    }
  }

  /**
   * Download using yt-dlp (YouTube, Vimeo, many other sites)
   */
  async downloadWithYtDlp(url, outputDir) {
    return new Promise((resolve, reject) => {
      const outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');

      // Extract audio only in best quality
      const args = [
        '-x',                    // Extract audio
        '--audio-format', 'mp3', // Convert to mp3
        '--audio-quality', '0',  // Best quality
        '-o', outputTemplate,
        '--no-playlist',         // Don't download playlists
        '--write-info-json',     // Save metadata
        url
      ];

      this.logger.info({ url }, 'Downloading with yt-dlp');

      const proc = spawn('yt-dlp', args, { cwd: outputDir });
      let stderr = '';
      let stdout = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        if (code !== 0) {
          this.logger.error({ code, stderr }, 'yt-dlp failed');
          reject(new Error(`yt-dlp failed: ${stderr}`));
          return;
        }

        // Find the downloaded file
        const files = await fs.readdir(outputDir);
        const audioFile = files.find(f => f.endsWith('.mp3'));
        const infoFile = files.find(f => f.endsWith('.info.json'));

        if (!audioFile) {
          reject(new Error('Downloaded audio file not found'));
          return;
        }

        let metadata = {};
        if (infoFile) {
          try {
            const infoContent = await fs.readFile(path.join(outputDir, infoFile), 'utf-8');
            metadata = JSON.parse(infoContent);
          } catch {
            // Ignore metadata errors
          }
        }

        resolve({
          filePath: path.join(outputDir, audioFile),
          metadata: {
            title: metadata.title || audioFile.replace('.mp3', ''),
            duration: metadata.duration,
            uploader: metadata.uploader || metadata.channel,
            uploadDate: metadata.upload_date,
            description: metadata.description,
            url
          }
        });
      });
    });
  }

  /**
   * Direct download for non-YouTube URLs
   */
  async downloadDirect(url, outputDir) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    // Get filename from URL or content-disposition
    let filename = path.basename(new URL(url).pathname);
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
      if (match) filename = match[1];
    }

    // Ensure it has a valid extension
    const ext = path.extname(filename).slice(1).toLowerCase();
    if (!SUPPORTED_FORMATS.includes(ext)) {
      filename = filename + '.mp3'; // Assume mp3 if unknown
    }

    const filePath = path.join(outputDir, filename);
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body, fileStream);

    return {
      filePath,
      metadata: {
        title: path.basename(filename, path.extname(filename)),
        url
      }
    };
  }

  /**
   * Transcribe audio file using local Whisper
   */
  async transcribeLocal(filePath, options = {}) {
    const { language = 'en', model = 'medium' } = options;

    return new Promise((resolve, reject) => {
      const outputDir = path.dirname(filePath);
      const baseName = path.basename(filePath, path.extname(filePath));

      const args = [
        filePath,
        '--model', model,
        '--language', language,
        '--output_format', 'json',
        '--output_dir', outputDir
      ];

      this.logger.info({ filePath, model, language }, 'Transcribing with local Whisper');

      const proc = spawn('whisper', args);
      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log progress
        if (stderr.includes('%')) {
          const match = stderr.match(/(\d+)%/);
          if (match) {
            this.logger.debug({ progress: match[1] }, 'Transcription progress');
          }
        }
      });

      proc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`Whisper failed: ${stderr}`));
          return;
        }

        // Read the JSON output
        const jsonPath = path.join(outputDir, `${baseName}.json`);
        try {
          const content = await fs.readFile(jsonPath, 'utf-8');
          const result = JSON.parse(content);
          resolve({
            text: result.text,
            segments: result.segments,
            language: result.language
          });
        } catch (err) {
          reject(new Error(`Failed to read transcription output: ${err.message}`));
        }
      });
    });
  }

  /**
   * Transcribe audio file using OpenAI Whisper API
   */
  async transcribeAPI(filePath, options = {}) {
    const { language } = options;
    const openai = getOpenAI();

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_API_FILE_SIZE) {
      throw new Error(`File too large for API (${Math.round(stats.size / 1024 / 1024)}MB > 25MB). Use local Whisper.`);
    }

    this.logger.info({ filePath, size: stats.size }, 'Transcribing with OpenAI API');

    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(filePath),
      model: 'whisper-1',
      language,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment']
    });

    return {
      text: transcription.text,
      segments: transcription.segments,
      language: transcription.language,
      duration: transcription.duration
    };
  }

  /**
   * Format raw transcription into clean Markdown
   */
  async formatTranscription(rawText, metadata = {}) {
    const formatPrompt = `Format this transcription into clean Markdown:

METADATA:
- Title: ${metadata.title || 'Unknown'}
- Speaker: ${metadata.uploader || metadata.speaker || 'Unknown'}
- Duration: ${metadata.duration ? this.formatDuration(metadata.duration) : 'Unknown'}
- Source: ${metadata.url || 'Unknown'}
- Date: ${metadata.uploadDate || metadata.date || 'Unknown'}

RAW TRANSCRIPTION:
${rawText}

Please format this into well-structured Markdown with:
1. YAML frontmatter header
2. Proper headings for topic sections
3. Clean paragraphs with punctuation
4. Speaker labels if multiple speakers
5. Fixed spelling/grammar errors`;

    const response = await this.chat([
      { role: 'user', content: formatPrompt }
    ], { maxTokens: this.maxTokens });

    return response.content;
  }

  /**
   * Format seconds to HH:MM:SS
   */
  formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * Main transcription method
   * @param {string} source - URL or file path
   * @param {Object} options - Transcription options
   * @returns {Object} { markdown, metadata, rawText }
   */
  async transcribe(source, options = {}) {
    const {
      language = 'en',
      whisperModel = 'medium',
      format = true,  // Whether to format with AI
      outputPath = null
    } = options;

    const startTime = Date.now();
    const isUrl = source.startsWith('http://') || source.startsWith('https://');

    // Create temp directory for this job
    const jobId = `transcribe-${Date.now()}`;
    const tempDir = path.join(TRANSCRIPTION_DIR, 'temp', jobId);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Step 1: Get the audio file
      let filePath, metadata;

      if (isUrl) {
        this.logger.info({ url: source }, 'Downloading media from URL');
        const download = await this.downloadMedia(source, tempDir);
        filePath = download.filePath;
        metadata = download.metadata;
      } else {
        // Local file
        filePath = source;
        metadata = {
          title: path.basename(source, path.extname(source)),
          source: 'local file'
        };
      }

      // Step 2: Transcribe
      this.logger.info({ filePath, useLocalWhisper: this.useLocalWhisper }, 'Starting transcription');

      let transcription;
      if (this.useLocalWhisper) {
        transcription = await this.transcribeLocal(filePath, { language, model: whisperModel });
      } else {
        transcription = await this.transcribeAPI(filePath, { language });
      }

      const rawText = transcription.text;
      metadata.duration = metadata.duration || transcription.duration;
      metadata.language = transcription.language || language;

      // Step 3: Format with AI (optional)
      let markdown = rawText;
      if (format) {
        this.logger.info('Formatting transcription with AI');
        markdown = await this.formatTranscription(rawText, metadata);
      } else {
        // Create basic markdown without AI
        markdown = this.createBasicMarkdown(rawText, metadata);
      }

      // Step 4: Save output
      const finalOutputPath = outputPath || path.join(
        TRANSCRIPTION_DIR,
        `${this.sanitizeFilename(metadata.title)}.md`
      );
      await fs.mkdir(path.dirname(finalOutputPath), { recursive: true });
      await fs.writeFile(finalOutputPath, markdown, 'utf-8');

      const duration = Date.now() - startTime;
      this.logger.info({
        source,
        outputPath: finalOutputPath,
        rawLength: rawText.length,
        formattedLength: markdown.length,
        durationMs: duration
      }, 'Transcription complete');

      return {
        markdown,
        rawText,
        metadata,
        outputPath: finalOutputPath,
        segments: transcription.segments
      };

    } finally {
      // Cleanup temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Create basic markdown without AI formatting
   */
  createBasicMarkdown(text, metadata) {
    return `---
title: "${metadata.title || 'Untitled'}"
speaker: "${metadata.uploader || metadata.speaker || 'Unknown'}"
date: "${metadata.uploadDate || metadata.date || 'Unknown'}"
source: "${metadata.url || 'Unknown'}"
duration: "${metadata.duration ? this.formatDuration(metadata.duration) : 'Unknown'}"
---

# ${metadata.title || 'Untitled'}

${text}
`;
  }

  /**
   * Sanitize filename for filesystem
   */
  sanitizeFilename(name) {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 100);
  }

  /**
   * Get transcription status (for long-running jobs)
   */
  async getStatus(jobId) {
    // TODO: Implement job tracking for long transcriptions
    return { status: 'unknown', jobId };
  }
}

export default TranscriberAgent;
