// src/routes/api/content/+server.js
import { json } from '@sveltejs/kit';
import db from '$lib/server/db/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * @swagger
 * /api/content:
 *   get:
 *     summary: Get content
 *     description: Retrieves content with optional filtering
 *     tags:
 *       - Content
 *     parameters:
 *       - in: query
 *         name: document_id
 *         schema:
 *           type: string
 *         description: Filter by document ID
 *       - in: query
 *         name: block_type
 *         schema:
 *           type: string
 *         description: Filter by block type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of content
 *       500:
 *         description: Internal Server Error
 */
export async function GET({ url }) {
  try {
    const documentId = url.searchParams.get('document_id');
    const blockType = url.searchParams.get('block_type');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    const filters = {};
    if (documentId) {
      filters.document_id = documentId;
    }
    
    if (blockType) {
      filters.block_type = blockType;
    }
    
    const options = {
      limit,
      offset,
      orderBy: 'sequence ASC, created_at ASC'
    };
    
    const content = await db.queryRecords('content', filters, options);
    
    return json({ 
      content,
      total: content.length,
      limit,
      offset
    });
  } catch (err) {
    console.error('Error fetching content:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/content:
 *   post:
 *     summary: Create new content
 *     description: Creates a new content block
 *     tags:
 *       - Content
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - document_id
 *               - block
 *               - block_type
 *             properties:
 *               document_id:
 *                 type: string
 *                 description: Document ID
 *               block:
 *                 type: string
 *                 description: Content block text
 *               block_type:
 *                 type: string
 *                 enum: [heading, paragraph, list, quote, code, image, table, other]
 *                 description: Block type
 *               sequence:
 *                 type: integer
 *                 description: Block sequence
 *               pdf_page:
 *                 type: integer
 *                 description: PDF page number
 *               book_page:
 *                 type: string
 *                 description: Book page reference
 *               context:
 *                 type: string
 *                 description: Additional context
 *     responses:
 *       201:
 *         description: Content created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal Server Error
 */
export async function POST({ request }) {
  try {
    const {
      document_id,
      block,
      block_type,
      sequence,
      pdf_page,
      book_page,
      context
    } = await request.json();
    
    if (!document_id) {
      return json({ error: 'Document ID is required' }, { status: 400 });
    }
    
    if (!block) {
      return json({ error: 'Block content is required' }, { status: 400 });
    }
    
    if (!block_type) {
      return json({ error: 'Block type is required' }, { status: 400 });
    }
    
    // Verify document exists
    const document = await db.getDocumentById(document_id);
    if (!document) {
      return json({ error: 'Document not found' }, { status: 404 });
    }
    
    // Determine sequence if not provided
    let blockSequence = sequence;
    if (blockSequence === undefined) {
      // Get highest sequence number for this document and add 1
      const existingContent = await db.getContentByDocument(document_id);
      blockSequence = existingContent.length > 0 
        ? Math.max(...existingContent.map(c => c.sequence || 0)) + 1 
        : 0;
    }
    
    // Create content
    const contentData = {
      id: uuidv4(),
      document_id,
      block,
      block_type,
      sequence: blockSequence,
      pdf_page,
      book_page,
      context: context || block.substring(0, 255), // Use first 255 chars as context if not provided
      indexed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const content = await db.createContent(contentData);
    
    return json({ 
      content,
      message: 'Content created successfully' 
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating content:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/content/{id}:
 *   get:
 *     summary: Get content by ID
 *     description: Retrieves content by ID
 *     tags:
 *       - Content
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Content ID
 *     responses:
 *       200:
 *         description: Content details
 *       404:
 *         description: Content not found
 *       500:
 *         description: Internal Server Error
 */
async function getContentById({ params }) {
  try {
    const { id } = params;
    
    const content = await db.getContentById(id);
    
    if (!content) {
      return json({ error: 'Content not found' }, { status: 404 });
    }
    
    // Parse metadata
    if (typeof content.metadata === 'string') {
      try {
        content.metadata = JSON.parse(content.metadata);
      } catch (e) {
        content.metadata = {};
      }
    }
    
    return json({ content });
  } catch (err) {
    console.error('Error fetching content:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/content/{id}:
 *   put:
 *     summary: Update content
 *     description: Updates a content block
 *     tags:
 *       - Content
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Content ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               block:
 *                 type: string
 *                 description: Content block text
 *               block_type:
 *                 type: string
 *                 enum: [heading, paragraph, list, quote, code, image, table, other]
 *                 description: Block type
 *               sequence:
 *                 type: integer
 *                 description: Block sequence
 *               pdf_page:
 *                 type: integer
 *                 description: PDF page number
 *               book_page:
 *                 type: string
 *                 description: Book page reference
 *               context:
 *                 type: string
 *                 description: Additional context
 *     responses:
 *       200:
 *         description: Content updated successfully
 *       404:
 *         description: Content not found
 *       500:
 *         description: Internal Server Error
 */
export async function PUT({ params, request }) {
  try {
    const { id } = params;
    const updates = await request.json();
    
    // Check if content exists
    const content = await db.getContentById(id);
    if (!content) {
      return json({ error: 'Content not found' }, { status: 404 });
    }
    
    // If block content is updated, update context if not explicitly provided
    if (updates.block && !updates.context) {
      updates.context = updates.block.substring(0, 255);
    }
    
    // Mark as unindexed if content changed
    if (updates.block) {
      updates.indexed = false;
    }
    
    // Update timestamp
    updates.updated_at = new Date().toISOString();
    
    // Update content
    const updatedContent = await db.updateContent(id, updates);
    
    return json({ 
      content: updatedContent,
      message: 'Content updated successfully' 
    });
  } catch (err) {
    console.error('Error updating content:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/content/{id}:
 *   delete:
 *     summary: Delete content
 *     description: Deletes a content block
 *     tags:
 *       - Content
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Content ID
 *     responses:
 *       200:
 *         description: Content deleted successfully
 *       404:
 *         description: Content not found
 *       500:
 *         description: Internal Server Error
 */
export async function DELETE({ params }) {
  try {
    const { id } = params;
    
    // Check if content exists
    const content = await db.getContentById(id);
    if (!content) {
      return json({ error: 'Content not found' }, { status: 404 });
    }
    
    // Delete content
    await db.deleteContent(id);
    
    return json({ 
      message: 'Content deleted successfully' 
    });
  } catch (err) {
    console.error('Error deleting content:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/content/batch:
 *   post:
 *     summary: Create multiple content blocks
 *     description: Creates multiple content blocks for a document
 *     tags:
 *       - Content
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - document_id
 *               - content
 *             properties:
 *               document_id:
 *                 type: string
 *                 description: Document ID
 *               content:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - block_type
 *                     - block
 *                   properties:
 *                     block_type:
 *                       type: string
 *                       description: Type of content block
 *                     block:
 *                       type: string
 *                       description: Content text
 *                     sequence:
 *                       type: integer
 *                       description: Block sequence
 *                     pdf_page:
 *                       type: integer
 *                       description: PDF page number
 *                     book_page:
 *                       type: string
 *                       description: Book page reference
 *                     context:
 *                       type: string
 *                       description: Additional context
 *     responses:
 *       201:
 *         description: Content blocks created successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal Server Error
 */
// This function is now moved to batch/+server.js
async function postBatchContent({ request, url }) {
  if (url.pathname.endsWith('/batch')) {
    try {
      const { document_id, content } = await request.json();
      
      if (!document_id) {
        return json({ error: 'Document ID is required' }, { status: 400 });
      }
      
      if (!content || !Array.isArray(content) || content.length === 0) {
        return json({ error: 'Content array is required and must not be empty' }, { status: 400 });
      }
      
      // Verify document exists
      const document = await db.getDocumentById(document_id);
      if (!document) {
        return json({ error: 'Document not found' }, { status: 404 });
      }
      
      // Get highest sequence number for this document
      const existingContent = await db.getContentByDocument(document_id);
      let maxSequence = existingContent.length > 0 
        ? Math.max(...existingContent.map(c => c.sequence || 0)) 
        : -1;
      
      // Create content blocks
      const createdContent = [];
      for (const block of content) {
        if (!block.block) {
          return json({ error: 'Block content is required for all blocks' }, { status: 400 });
        }
        
        if (!block.block_type) {
          return json({ error: 'Block type is required for all blocks' }, { status: 400 });
        }
        
        // Determine sequence if not provided
        const sequence = block.sequence !== undefined ? block.sequence : ++maxSequence;
        
        // Create content
        const contentData = {
          id: uuidv4(),
          document_id,
          block: block.block,
          block_type: block.block_type,
          sequence,
          pdf_page: block.pdf_page,
          book_page: block.book_page,
          context: block.context || block.block.substring(0, 255),
          indexed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const createdBlock = await db.createContent(contentData);
        createdContent.push(createdBlock);
      }
      
      return json({ 
        content: createdContent,
        count: createdContent.length,
        message: 'Content created successfully' 
      }, { status: 201 });
    } catch (err) {
      console.error('Error creating batch content:', err);
      return json({ error: err.message }, { status: 500 });
    }
  }
}
