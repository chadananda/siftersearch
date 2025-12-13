/**
 * Librarian Routes
 *
 * Admin endpoints for the Librarian agent - library management and document ingestion.
 *
 * GET /api/librarian/queue - List ingestion queue items
 * GET /api/librarian/queue/:id - Get queue item details
 * POST /api/librarian/queue - Add item to ingestion queue
 * PUT /api/librarian/queue/:id - Update queue item (approve/reject)
 * DELETE /api/librarian/queue/:id - Remove from queue
 *
 * GET /api/librarian/suggestions - List suggestions
 * PUT /api/librarian/suggestions/:id - Update suggestion (approve/reject)
 *
 * POST /api/librarian/analyze - Analyze a document
 * POST /api/librarian/lookup-isbn - Look up ISBN information
 * POST /api/librarian/check-duplicates - Check for duplicates
 * POST /api/librarian/research - Research books to add
 */

import { query, queryOne, queryAll } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { requireTier } from '../lib/auth.js';
import { LibrarianAgent } from '../agents/agent-librarian.js';

const librarian = new LibrarianAgent();

export default async function librarianRoutes(fastify) {
  // All routes require admin tier
  fastify.addHook('preHandler', requireTier('admin'));

  // ===== Ingestion Queue Routes =====

  // List queue items
  fastify.get('/queue', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'analyzing', 'awaiting_review', 'approved', 'processing', 'completed', 'rejected', 'failed'] },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { status, limit = 20, offset = 0 } = request.query;

    let sql = 'SELECT * FROM ingestion_queue WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const items = await queryAll(sql, params);

    // Parse JSON fields
    const parsed = items.map(item => ({
      ...item,
      source_data: JSON.parse(item.source_data || '{}'),
      analysis_result: item.analysis_result ? JSON.parse(item.analysis_result) : null,
      suggested_metadata: item.suggested_metadata ? JSON.parse(item.suggested_metadata) : null
    }));

    // Get total count
    const countResult = await queryOne(
      'SELECT COUNT(*) as count FROM ingestion_queue' + (status ? ' WHERE status = ?' : ''),
      status ? [status] : []
    );

    return {
      items: parsed,
      total: countResult.count,
      limit,
      offset
    };
  });

  // Get queue item details
  fastify.get('/queue/:id', async (request) => {
    const { id } = request.params;

    const item = await queryOne('SELECT * FROM ingestion_queue WHERE id = ?', [id]);
    if (!item) {
      throw ApiError.notFound('Queue item not found');
    }

    return {
      ...item,
      source_data: JSON.parse(item.source_data || '{}'),
      analysis_result: item.analysis_result ? JSON.parse(item.analysis_result) : null,
      suggested_metadata: item.suggested_metadata ? JSON.parse(item.suggested_metadata) : null
    };
  });

  // Add to queue (upload, URL, or ISBN)
  fastify.post('/queue', {
    schema: {
      body: {
        type: 'object',
        required: ['source_type'],
        properties: {
          source_type: { type: 'string', enum: ['upload', 'url', 'isbn', 'research'] },
          // For URL source
          url: { type: 'string', format: 'uri' },
          // For ISBN source
          isbn: { type: 'string' },
          // For upload source - expects base64 encoded file
          file_data: { type: 'string' },
          file_name: { type: 'string' },
          content_type: { type: 'string' },
          // Optional metadata hints
          religion: { type: 'string' },
          collection: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { source_type, url, isbn, file_data, file_name, content_type, religion, collection } = request.body;

    let sourceData = {};

    switch (source_type) {
      case 'url':
        if (!url) throw ApiError.badRequest('URL required for url source type');
        sourceData = { url };
        break;
      case 'isbn':
        if (!isbn) throw ApiError.badRequest('ISBN required for isbn source type');
        sourceData = { isbn };
        break;
      case 'upload':
        if (!file_data || !file_name) throw ApiError.badRequest('file_data and file_name required for upload source type');
        sourceData = { file_data, file_name, content_type };
        break;
      case 'research':
        sourceData = { religion, collection };
        break;
    }

    // Add metadata hints if provided
    if (religion) sourceData.religion = religion;
    if (collection) sourceData.collection = collection;

    const result = await query(
      `INSERT INTO ingestion_queue (source_type, source_data, status, created_by)
       VALUES (?, ?, 'pending', ?)`,
      [source_type, JSON.stringify(sourceData), request.user.sub]
    );

    return {
      id: result.lastInsertRowid,
      status: 'pending',
      source_type,
      message: 'Item added to queue'
    };
  });

  // Update queue item (approve/reject/analyze)
  fastify.put('/queue/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' }
        }
      },
      body: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['approve', 'reject', 'analyze', 'process'] },
          metadata: { type: 'object' },
          target_path: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { action, metadata, target_path } = request.body;

    const item = await queryOne('SELECT * FROM ingestion_queue WHERE id = ?', [id]);
    if (!item) {
      throw ApiError.notFound('Queue item not found');
    }

    switch (action) {
      case 'analyze': {
        // Run librarian analysis
        await query('UPDATE ingestion_queue SET status = ? WHERE id = ?', ['analyzing', id]);

        const sourceData = JSON.parse(item.source_data || '{}');
        let analysisResult;

        try {
          // Get content based on source type
          let content = '';
          if (sourceData.url) {
            // Fetch URL content
            const response = await fetch(sourceData.url);
            content = await response.text();
          } else if (sourceData.file_data) {
            content = Buffer.from(sourceData.file_data, 'base64').toString('utf-8');
          }

          // Run analysis
          analysisResult = await librarian.analyzeDocument(content, {
            filename: sourceData.file_name,
            source: sourceData.url || sourceData.isbn
          });

          // Get metadata suggestions
          const suggestedMetadata = await librarian.suggestMetadata(content, {
            religion: sourceData.religion
          });

          // Suggest collection placement
          const collectionSuggestion = await librarian.suggestCollection(
            suggestedMetadata.title || 'Unknown',
            suggestedMetadata.author || 'Unknown',
            sourceData.religion || suggestedMetadata.religion
          );

          await query(
            `UPDATE ingestion_queue
             SET status = 'awaiting_review',
                 analysis_result = ?,
                 suggested_metadata = ?,
                 target_path = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              JSON.stringify(analysisResult),
              JSON.stringify(suggestedMetadata),
              collectionSuggestion.suggestedPath,
              id
            ]
          );

          return {
            status: 'awaiting_review',
            analysis: analysisResult,
            metadata: suggestedMetadata,
            suggested_path: collectionSuggestion.suggestedPath
          };
        } catch (err) {
          await query(
            `UPDATE ingestion_queue SET status = 'failed', error_message = ? WHERE id = ?`,
            [err.message, id]
          );
          throw ApiError.internal(`Analysis failed: ${err.message}`);
        }
      }

      case 'approve': {
        if (item.status !== 'awaiting_review') {
          throw ApiError.badRequest('Item must be in awaiting_review status to approve');
        }

        const finalMetadata = metadata || JSON.parse(item.suggested_metadata || '{}');
        const finalPath = target_path || item.target_path;

        await query(
          `UPDATE ingestion_queue
           SET status = 'approved',
               suggested_metadata = ?,
               target_path = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [JSON.stringify(finalMetadata), finalPath, id]
        );

        return { status: 'approved', message: 'Item approved for processing' };
      }

      case 'reject': {
        await query(
          `UPDATE ingestion_queue SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [id]
        );
        return { status: 'rejected', message: 'Item rejected' };
      }

      case 'process': {
        if (item.status !== 'approved') {
          throw ApiError.badRequest('Item must be approved before processing');
        }

        try {
          await query('UPDATE ingestion_queue SET status = ? WHERE id = ?', ['processing', id]);

          const sourceData = JSON.parse(item.source_data || '{}');
          const metadata = JSON.parse(item.suggested_metadata || '{}');

          // Process the approved document
          const result = await librarian.processApprovedDocument({
            sourceData,
            metadata,
            targetPath: item.target_path
          });

          await query(
            `UPDATE ingestion_queue
             SET status = 'completed',
                 target_document_id = ?,
                 processed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [result.documentId, id]
          );

          return { status: 'completed', documentId: result.documentId };
        } catch (err) {
          await query(
            `UPDATE ingestion_queue SET status = 'failed', error_message = ? WHERE id = ?`,
            [err.message, id]
          );
          throw ApiError.internal(`Processing failed: ${err.message}`);
        }
      }

      default:
        throw ApiError.badRequest('Invalid action');
    }
  });

  // Delete queue item
  fastify.delete('/queue/:id', async (request) => {
    const { id } = request.params;

    const result = await query('DELETE FROM ingestion_queue WHERE id = ?', [id]);
    if (result.changes === 0) {
      throw ApiError.notFound('Queue item not found');
    }

    return { success: true };
  });

  // ===== Suggestions Routes =====

  // List suggestions
  fastify.get('/suggestions', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'deferred'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const { type, status, priority, limit = 20, offset = 0 } = request.query;

    let sql = 'SELECT * FROM librarian_suggestions WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (priority) {
      sql += ' AND priority = ?';
      params.push(priority);
    }

    sql += ' ORDER BY CASE priority WHEN \'urgent\' THEN 1 WHEN \'high\' THEN 2 WHEN \'medium\' THEN 3 ELSE 4 END, created_at DESC';
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const items = await queryAll(sql, params);

    const parsed = items.map(item => ({
      ...item,
      data: JSON.parse(item.data || '{}')
    }));

    return {
      suggestions: parsed,
      limit,
      offset
    };
  });

  // Update suggestion
  fastify.put('/suggestions/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' }
        }
      },
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['approved', 'rejected', 'deferred'] },
          admin_notes: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { status, admin_notes } = request.body;

    const suggestion = await queryOne('SELECT * FROM librarian_suggestions WHERE id = ?', [id]);
    if (!suggestion) {
      throw ApiError.notFound('Suggestion not found');
    }

    await query(
      `UPDATE librarian_suggestions
       SET status = ?, admin_notes = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
       WHERE id = ?`,
      [status, admin_notes, request.user.sub, id]
    );

    return { success: true, status };
  });

  // ===== Librarian Agent Actions =====

  // Analyze a document
  fastify.post('/analyze', {
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 100 },
          filename: { type: 'string' },
          source: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { content, filename, source } = request.body;

    const analysis = await librarian.analyzeDocument(content, { filename, source });
    const metadata = await librarian.suggestMetadata(content);
    const quality = await librarian.assessQuality(content, metadata);

    return { analysis, metadata, quality };
  });

  // Look up ISBN
  fastify.post('/lookup-isbn', {
    schema: {
      body: {
        type: 'object',
        required: ['isbn'],
        properties: {
          isbn: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { isbn } = request.body;

    const info = await librarian.lookupISBN(isbn);
    if (!info) {
      throw ApiError.notFound('ISBN not found');
    }

    return info;
  });

  // Check for duplicates
  fastify.post('/check-duplicates', {
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 100 },
          threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.85 }
        }
      }
    }
  }, async (request) => {
    const { content, threshold = 0.85 } = request.body;

    const duplicates = await librarian.checkDuplicates(content, { threshold });
    return { duplicates };
  });

  // Research books to add
  fastify.post('/research', {
    schema: {
      body: {
        type: 'object',
        required: ['religion'],
        properties: {
          religion: { type: 'string' },
          topic: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 }
        }
      }
    }
  }, async (request) => {
    const { religion, topic, limit = 10 } = request.body;

    const suggestions = await librarian.researchBooksToAdd(religion, { topic, limit });
    return { suggestions };
  });

  // Find quality issues in library
  fastify.get('/quality-issues', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          religion: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    }
  }, async (request) => {
    const { religion, limit = 20 } = request.query;

    const issues = await librarian.findQualityIssues({ religion, limit });
    return { issues };
  });

  // Get queue stats
  fastify.get('/stats', async () => {
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'analyzing' THEN 1 ELSE 0 END) as analyzing,
        SUM(CASE WHEN status = 'awaiting_review' THEN 1 ELSE 0 END) as awaiting_review,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM ingestion_queue
    `);

    const suggestionStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN priority = 'urgent' AND status = 'pending' THEN 1 ELSE 0 END) as urgent
      FROM librarian_suggestions
    `);

    return {
      queue: stats,
      suggestions: suggestionStats
    };
  });
}
