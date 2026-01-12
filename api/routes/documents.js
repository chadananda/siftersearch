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
async function handleBulkDownload(meili, documentIds, format, options, reply) {
  const allDocuments = [];

  for (const docId of documentIds) {
    try {
      const [document, segmentsResult] = await Promise.all([
        meili.index(INDEXES.DOCUMENTS).getDocument(docId),
        meili.index(INDEXES.PARAGRAPHS).search('', {
          filter: `doc_id = ${docId}`,
          limit: 10000,
          sort: ['paragraph_index:asc']
        })
      ]);

      const segments = segmentsResult.hits.map(hit => {
        if (!options.includeEmbeddings) {
          const { _vectors, ...rest } = hit;
          return rest;
        }
        return hit;
      });

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
    const meili = getMeili();
    const index = meili.index(INDEXES.DOCUMENTS);

    // Build filter
    const filters = [];
    if (religion) filters.push(`religion = "${religion}"`);
    if (collection) filters.push(`collection = "${collection}"`);
    if (language) filters.push(`language = "${language}"`);

    const searchParams = {
      limit,
      offset,
      filter: filters.length > 0 ? filters.join(' AND ') : undefined
    };

    let results;
    if (search) {
      results = await index.search(search, searchParams);
    } else {
      // Get all documents (empty search)
      results = await index.search('', searchParams);
    }

    return {
      documents: results.hits,
      total: results.estimatedTotalHits,
      limit,
      offset
    };
  });

  // Get document metadata by ID
  fastify.get('/:id', async (request) => {
    const { id } = request.params;
    const meili = getMeili();

    try {
      const document = await meili.index(INDEXES.DOCUMENTS).getDocument(id);
      return { document };
    } catch (err) {
      if (err.code === 'document_not_found') {
        throw ApiError.notFound('Document not found');
      }
      throw err;
    }
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
    const { limit = 100, offset = 0, includeEmbeddings = false } = request.query;
    const meili = getMeili();

    // Verify document exists
    try {
      await meili.index(INDEXES.DOCUMENTS).getDocument(id);
    } catch (err) {
      if (err.code === 'document_not_found') {
        throw ApiError.notFound('Document not found');
      }
      throw err;
    }

    // Get segments for this document
    const results = await meili.index(INDEXES.PARAGRAPHS).search('', {
      filter: `doc_id = ${id}`,
      limit,
      offset,
      sort: ['paragraph_index:asc']
    });

    // Optionally strip embeddings to reduce payload
    const segments = results.hits.map(hit => {
      if (!includeEmbeddings) {
        const { _vectors, ...rest } = hit;
        return rest;
      }
      return hit;
    });

    return {
      documentId: id,
      segments,
      total: results.estimatedTotalHits,
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
    const meili = getMeili();

    // Verify document exists
    try {
      await meili.index(INDEXES.DOCUMENTS).getDocument(id);
    } catch (err) {
      if (err.code === 'document_not_found') {
        throw ApiError.notFound('Document not found');
      }
      throw err;
    }

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
    const meili = getMeili();

    // Handle bulk download
    if (documentId === 'bulk' && options.documentIds) {
      return handleBulkDownload(meili, options.documentIds, format, options, reply);
    }

    // Get document and all segments
    const [document, segmentsResult] = await Promise.all([
      meili.index(INDEXES.DOCUMENTS).getDocument(documentId),
      meili.index(INDEXES.PARAGRAPHS).search('', {
        filter: `doc_id = ${documentId}`,
        limit: 10000,
        sort: ['paragraph_index:asc']
      })
    ]);

    const segments = segmentsResult.hits.map(hit => {
      if (!options.includeEmbeddings) {
        const { _vectors, ...rest } = hit;
        return rest;
      }
      return hit;
    });

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

  // Get available filters (for UI dropdowns)
  fastify.get('/filters', async () => {
    const meili = getMeili();
    const index = meili.index(INDEXES.DOCUMENTS);

    // Get facet distribution
    const results = await index.search('', {
      limit: 0,
      facets: ['religion', 'collection', 'language']
    });

    return {
      filters: {
        religions: Object.keys(results.facetDistribution?.religion || {}),
        collections: Object.keys(results.facetDistribution?.collection || {}),
        languages: Object.keys(results.facetDistribution?.language || {})
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
