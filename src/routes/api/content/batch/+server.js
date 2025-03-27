// src/routes/api/content/batch/+server.js
import { json } from '@sveltejs/kit';
import db from '$lib/server/db/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/content/batch
 * Create multiple content blocks
 */
export async function POST({ request }) {
  try {
    const { document_id, content } = await request.json();
    
    // Validate required fields
    if (!document_id) {
      return json({ error: 'Document ID is required' }, { status: 400 });
    }
    
    if (!content || !Array.isArray(content) || content.length === 0) {
      return json({ error: 'Content array is required and must not be empty' }, { status: 400 });
    }
    
    // Check if document exists
    const document = await db.getDocumentById(document_id);
    if (!document) {
      return json({ error: 'Document not found' }, { status: 404 });
    }
    
    // Create content blocks
    const createdBlocks = [];
    const timestamp = new Date().toISOString();
    
    for (const block of content) {
      // Validate required fields for each block
      if (!block.block_type || !block.block) {
        return json({ 
          error: 'Each content block must have block_type and block fields',
          invalid_block: block
        }, { status: 400 });
      }
      
      // Create content block
      const contentBlock = {
        id: uuidv4(),
        document_id,
        block_type: block.block_type,
        block: block.block,
        sequence: block.sequence || null,
        pdf_page: block.pdf_page || null,
        book_page: block.book_page || null,
        context: block.context || null,
        created_at: timestamp,
        updated_at: timestamp
      };
      
      await db.createContent(contentBlock);
      createdBlocks.push(contentBlock);
    }
    
    return json({ 
      message: `Created ${createdBlocks.length} content blocks`,
      content: createdBlocks
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating batch content:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
