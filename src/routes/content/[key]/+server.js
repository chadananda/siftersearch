/**
 * Public Content Endpoint
 * 
 * This endpoint serves public domain content directly without requiring authentication.
 * It only serves content that is explicitly tagged as public domain and public-read.
 */

import { error } from '@sveltejs/kit';
import { CopyrightStatus, AccessTags } from '$lib/server/storage/b2-storage.js';

/**
 * Serve public domain content
 */
export async function GET({ params, platform, request }) {
  try {
    const { key } = params;
    const decodedKey = decodeURIComponent(key);
    
    // Only allow access to public generated documents
    if (!decodedKey.startsWith('documents/generated/public/')) {
      throw error(404, 'Not found');
    }
    
    // Get the object from B2
    const b2 = platform.env.STORAGE;
    const object = await b2.get(decodedKey);
    
    if (!object) {
      throw error(404, 'Not found');
    }
    
    // Verify this is public domain content
    const copyrightStatus = object.customMetadata?.['tag-copyright'];
    const accessTag = object.customMetadata?.['tag-access'];
    
    if (copyrightStatus !== CopyrightStatus.PUBLIC_DOMAIN || accessTag !== AccessTags.PUBLIC_READ) {
      throw error(403, 'Forbidden');
    }
    
    // Determine content type
    const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
    
    // Set cache control headers for public content - permanent caching for public domain
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year, mark as immutable
      'Content-Disposition': `inline; filename="${object.customMetadata?.['generated-filename'] || 'document'}"`,
      'ETag': object.etag
    });
    
    // Return the content
    return new Response(object.body, {
      headers
    });
  } catch (err) {
    console.error('Error serving public content:', err);
    
    if (err.status) {
      throw err;
    }
    
    throw error(500, 'Internal server error');
  }
}
