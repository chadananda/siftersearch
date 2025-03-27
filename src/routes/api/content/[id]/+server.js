// src/routes/api/content/[id]/+server.js
import { json } from '@sveltejs/kit';
import db from '$lib/server/db/index.js';
import { PUT, DELETE } from '../+server.js';

/**
 * GET /api/content/:id
 * Get content by ID
 */
export async function GET({ params }) {
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

export { PUT, DELETE };
