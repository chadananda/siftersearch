/**
 * Documents API Routes
 *
 * Public API for accessing processed documents and segments.
 * Supports multiple export formats for integration with other services.
 *
 * GET /api/documents - List all documents
 * GET /api/documents/:id - Get document metadata
 * GET /api/documents/:id/segments - Get document segments/chunks
 * GET /api/documents/:id/download - Download processed document
 * GET /api/documents/:id/export/:format - Export in specific format
 */

import { getMeili, INDEXES } from '../lib/search.js';
import { queryOne, queryAll } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { nanoid } from 'nanoid';

// Download token store (in production, use Redis or DB)
const downloadTokens = new Map();
const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a temporary download token
 */
function generateDownloadToken(documentId, format, options = {}) {
  const token = nanoid(32);
  downloadTokens.set(token, {
    documentId,
    format,
    options,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS
  });

  // Cleanup expired tokens periodically
  setTimeout(() => downloadTokens.delete(token), TOKEN_EXPIRY_MS + 1000);

  return token;
}

/**
 * Validate and consume a download token
 */
function validateDownloadToken(token) {
  const data = downloadTokens.get(token);
  if (!data) return null;

  if (Date.now() > data.expiresAt) {
    downloadTokens.delete(token);
    return null;
  }

  return data;
}

/**
 * Handle bulk download of multiple documents
 */
async function handleBulkDownload(documentIds, format, options, reply) {
  const allDocuments = [];

  for (const docId of documentIds) {
    try {
      const document = await queryOne('SELECT * FROM docs WHERE id = ? AND deleted_at IS NULL', [docId]);
      if (!document) { logger.warn({ docId }, 'Document not found for bulk export'); continue; }
      const segments = await queryAll(
        'SELECT id, doc_id, paragraph_index, text, heading, blocktype, translation, context, language FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index',
        [docId]
      );
      allDocuments.push({ document, segments });
    } catch (err) {
      logger.warn({ docId, err: err.message }, 'Failed to fetch document for bulk export');
    }
  }

  let content;
  let contentType;
  const filename = `bulk_export_${Date.now()}`;

  switch (format) {
    case 'json':
      content = JSON.stringify({ documents: allDocuments }, null, 2);
      contentType = 'application/json';
      break;

    case 'jsonl':
      const lines = [];
      for (const { document, segments } of allDocuments) {
        lines.push(JSON.stringify({ _type: 'document', ...document }));
        for (const seg of segments) {
          lines.push(JSON.stringify(seg));
        }
      }
      content = lines.join('\n');
      contentType = 'application/x-ndjson';
      break;

    default:
      content = JSON.stringify({ documents: allDocuments }, null, 2);
      contentType = 'application/json';
  }

  reply
    .header('Content-Type', contentType)
    .header('Content-Disposition', `attachment; filename="${filename}.${format === 'jsonl' ? 'jsonl' : 'json'}"`)
    .send(content);
}

export default async function documentsRoutes(fastify) {

  // List all documents with pagination and filtering
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          religion: { type: 'string' },
          collection: { type: 'string' },
          language: { type: 'string' },
          search: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { limit = 20, offset = 0, religion, collection, language, search } = request.query;

    if (search) {
      // Text search — Meilisearch is appropriate here
      const meili = getMeili();
      const index = meili.index(INDEXES.DOCUMENTS);
      const filters = [];
      if (religion) filters.push(`religion = "${religion}"`);
      if (collection) filters.push(`collection = "${collection}"`);
      if (language) filters.push(`language = "${language}"`);
      const results = await index.search(search, {
        limit, offset,
        filter: filters.length > 0 ? filters.join(' AND ') : undefined
      });
      return { documents: results.hits, total: results.estimatedTotalHits, limit, offset };
    }

    // Listing/browsing — read from SQLite
    const conditions = ['deleted_at IS NULL'];
    const params = [];
    if (religion) { conditions.push('religion = ?'); params.push(religion); }
    if (collection) { conditions.push('collection = ?'); params.push(collection); }
    if (language) { conditions.push('language = ?'); params.push(language); }
    const where = conditions.join(' AND ');
    const [countRow, documents] = await Promise.all([
      queryOne(`SELECT COUNT(*) as total FROM docs WHERE ${where}`, params),
      queryAll(`SELECT id, title, author, religion, collection, language, year, description, paragraph_count, cover_url, created_at, updated_at FROM docs WHERE ${where} ORDER BY title LIMIT ? OFFSET ?`, [...params, limit, offset])
    ]);
    return { documents, total: countRow?.total || 0, limit, offset };
  });

  // Get document metadata by ID
  fastify.get('/:id', async (request) => {
    const { id } = request.params;
    const document = await queryOne('SELECT * FROM docs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!document) throw ApiError.notFound('Document not found');
    return { document };
  });

  // Get document segments/chunks
  fastify.get('/:id/segments', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 10000, default: 100 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          includeEmbeddings: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { limit = 100, offset = 0 } = request.query;

    // Read directly from SQLite — Meilisearch is for search, not document viewing
    const doc = await queryOne('SELECT id FROM docs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!doc) throw ApiError.notFound('Document not found');

    const segments = await queryAll(`
      SELECT id, doc_id, paragraph_index, text, heading, blocktype,
             translation, translation_segments, context, language
      FROM content
      WHERE doc_id = ? AND deleted_at IS NULL
      ORDER BY paragraph_index
      LIMIT ? OFFSET ?
    `, [id, limit, offset]);

    const countRow = await queryOne(
      'SELECT COUNT(*) as total FROM content WHERE doc_id = ? AND deleted_at IS NULL', [id]
    );

    return {
      documentId: id,
      segments,
      total: countRow?.total || 0,
      limit,
      offset
    };
  });

  // Generate download link for a document
  fastify.get('/:id/download', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['json', 'jsonl', 'csv', 'txt', 'md'],
            default: 'json'
          },
          includeEmbeddings: { type: 'boolean', default: false },
          includeMetadata: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { format = 'json', includeEmbeddings = false, includeMetadata = true } = request.query;

    // Verify document exists in SQLite
    const docExists = await queryOne('SELECT id FROM docs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!docExists) throw ApiError.notFound('Document not found');

    // Generate download token
    const token = generateDownloadToken(id, format, { includeEmbeddings, includeMetadata });

    // Build download URL
    const baseUrl = request.headers['x-forwarded-host']
      ? `https://${request.headers['x-forwarded-host']}`
      : `${request.protocol}://${request.hostname}`;

    return {
      documentId: id,
      format,
      downloadUrl: `${baseUrl}/api/documents/download/${token}`,
      expiresIn: '15 minutes'
    };
  });

  // Actual download endpoint (uses token)
  fastify.get('/download/:token', async (request, reply) => {
    const { token } = request.params;

    const tokenData = validateDownloadToken(token);
    if (!tokenData) {
      throw ApiError.unauthorized('Download link expired or invalid');
    }

    const { documentId, format, options } = tokenData;

    // Handle bulk download
    if (documentId === 'bulk' && options.documentIds) {
      return handleBulkDownload(options.documentIds, format, options, reply);
    }

    // Get document and all segments from SQLite
    const document = await queryOne('SELECT * FROM docs WHERE id = ? AND deleted_at IS NULL', [documentId]);
    if (!document) throw ApiError.notFound('Document not found');
    const segmentCols = options.includeEmbeddings
      ? 'id, doc_id, paragraph_index, text, heading, blocktype, translation, context, language, embedding'
      : 'id, doc_id, paragraph_index, text, heading, blocktype, translation, context, language';
    const segments = await queryAll(
      `SELECT ${segmentCols} FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index`,
      [documentId]
    );

    // Format the response based on requested format
    let content;
    let contentType;
    let filename;

    switch (format) {
      case 'json':
        content = JSON.stringify({
          document: options.includeMetadata ? document : undefined,
          segments
        }, null, 2);
        contentType = 'application/json';
        filename = `${documentId}.json`;
        break;

      case 'jsonl':
        // JSON Lines format - one segment per line
        const lines = segments.map(s => JSON.stringify(s));
        if (options.includeMetadata) {
          lines.unshift(JSON.stringify({ _type: 'document', ...document }));
        }
        content = lines.join('\n');
        contentType = 'application/x-ndjson';
        filename = `${documentId}.jsonl`;
        break;

      case 'csv':
        // CSV format for segments
        const headers = ['paragraph_index', 'text', 'heading', 'title', 'author', 'religion', 'language'];
        const csvRows = [headers.join(',')];
        for (const seg of segments) {
          const row = headers.map(h => {
            const val = seg[h] ?? '';
            // Escape quotes and wrap in quotes if contains comma
            const escaped = String(val).replace(/"/g, '""');
            return escaped.includes(',') || escaped.includes('\n') ? `"${escaped}"` : escaped;
          });
          csvRows.push(row.join(','));
        }
        content = csvRows.join('\n');
        contentType = 'text/csv';
        filename = `${documentId}.csv`;
        break;

      case 'txt':
        // Plain text - just the text content
        const textParts = [];
        if (options.includeMetadata) {
          textParts.push(`Title: ${document.title}`);
          textParts.push(`Author: ${document.author}`);
          textParts.push(`Language: ${document.language}`);
          textParts.push('---\n');
        }
        for (const seg of segments) {
          if (seg.heading) {
            textParts.push(`\n## ${seg.heading}\n`);
          }
          textParts.push(seg.text);
          textParts.push('');
        }
        content = textParts.join('\n');
        contentType = 'text/plain; charset=utf-8';
        filename = `${documentId}.txt`;
        break;

      case 'md':
        // Markdown format
        const mdParts = [];
        if (options.includeMetadata) {
          mdParts.push('---');
          mdParts.push(`title: "${document.title}"`);
          mdParts.push(`author: "${document.author}"`);
          mdParts.push(`language: ${document.language}`);
          mdParts.push(`religion: ${document.religion}`);
          if (document.year) mdParts.push(`year: ${document.year}`);
          mdParts.push('---\n');
        }
        mdParts.push(`# ${document.title}\n`);
        let lastHeading = '';
        for (const seg of segments) {
          if (seg.heading && seg.heading !== lastHeading) {
            mdParts.push(`\n## ${seg.heading}\n`);
            lastHeading = seg.heading;
          }
          mdParts.push(seg.text);
          mdParts.push('');
        }
        content = mdParts.join('\n');
        contentType = 'text/markdown; charset=utf-8';
        filename = `${documentId}.md`;
        break;

      default:
        throw ApiError.badRequest(`Unsupported format: ${format}`);
    }

    reply
      .header('Content-Type', contentType)
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(content);
  });

  // Export in specific format (direct, no token needed for small docs)
  fastify.get('/:id/export/:format', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          format: { type: 'string', enum: ['json', 'jsonl', 'csv', 'txt', 'md'] }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          includeEmbeddings: { type: 'boolean', default: false },
          includeMetadata: { type: 'boolean', default: true },
          segmentsOnly: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request, reply) => {
    const { id, format } = request.params;
    const { includeEmbeddings = false, includeMetadata = true, segmentsOnly = false } = request.query;

    // Generate token and redirect to download
    const token = generateDownloadToken(id, format, { includeEmbeddings, includeMetadata, segmentsOnly });

    // Build download URL
    const baseUrl = request.headers['x-forwarded-host']
      ? `https://${request.headers['x-forwarded-host']}`
      : `${request.protocol}://${request.hostname}`;

    return reply.redirect(`${baseUrl}/api/documents/download/${token}`);
  });

  // Get available filters (for UI dropdowns) — read from SQLite, not Meilisearch
  fastify.get('/filters', async () => {
    const [religions, collections, languages] = await Promise.all([
      queryAll('SELECT DISTINCT religion FROM docs WHERE religion IS NOT NULL AND deleted_at IS NULL ORDER BY religion'),
      queryAll('SELECT DISTINCT collection FROM docs WHERE collection IS NOT NULL AND deleted_at IS NULL ORDER BY collection'),
      queryAll('SELECT DISTINCT language FROM docs WHERE language IS NOT NULL AND deleted_at IS NULL ORDER BY language')
    ]);
    return {
      filters: {
        religions: religions.map(r => r.religion),
        collections: collections.map(c => c.collection),
        languages: languages.map(l => l.language)
      }
    };
  });

  // Bulk export multiple documents
  fastify.post('/bulk-export', {
    schema: {
      body: {
        type: 'object',
        required: ['documentIds'],
        properties: {
          documentIds: { type: 'array', items: { type: 'string' }, maxItems: 50 },
          format: { type: 'string', enum: ['json', 'jsonl'], default: 'json' },
          includeEmbeddings: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request) => {
    const { documentIds, format = 'json', includeEmbeddings = false } = request.body;

    // Generate a bulk download token
    const token = generateDownloadToken('bulk', format, {
      documentIds,
      includeEmbeddings
    });

    const baseUrl = request.headers['x-forwarded-host']
      ? `https://${request.headers['x-forwarded-host']}`
      : `${request.protocol}://${request.hostname}`;

    return {
      documentCount: documentIds.length,
      format,
      downloadUrl: `${baseUrl}/api/documents/download/${token}`,
      expiresIn: '15 minutes'
    };
  });
}
