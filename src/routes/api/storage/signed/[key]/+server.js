/**
 * Signed URL Generator for B2 Storage
 * 
 * This endpoint generates signed URLs for accessing objects in B2 storage
 * with appropriate permissions based on object tags and user authentication.
 * For public domain content, it redirects to the public content endpoint.
 */

import { json } from '@sveltejs/kit';
import { CopyrightStatus, AccessTags } from '$lib/server/storage/b2-storage.js';

/**
 * Generate a signed URL for accessing an object in B2 storage
 */
export async function GET({ params, platform, request, locals }) {
  try {
    const { key } = params;
    const decodedKey = decodeURIComponent(key);
    
    // Get user from locals (set by authentication hook)
    const user = locals.user;
    
    // Check if user is authenticated for restricted resources
    const isPublicPath = decodedKey.startsWith('documents/generated/public/');
    const isRestrictedPath = decodedKey.startsWith('documents/generated/restricted/');
    const isOriginalDocument = decodedKey.startsWith('documents/originals/');
    const isManticoreData = decodedKey.startsWith('manticore/');
    const isBackup = decodedKey.startsWith('backups/');
    
    // Determine authentication requirements based on path
    let requiresAuth = true;
    let requiresAdmin = false;
    
    if (isPublicPath) {
      // Public path might not require auth depending on copyright status
      requiresAuth = false;
    } else if (isRestrictedPath) {
      // Restricted path always requires auth
      requiresAuth = true;
    } else if (isOriginalDocument) {
      // Original documents always require auth
      requiresAuth = true;
    } else if (isManticoreData || isBackup) {
      // Manticore data and backups require admin privileges
      requiresAuth = true;
      requiresAdmin = true;
    }
    
    // Check authentication if required
    if (requiresAuth && !user) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Check admin privileges if required
    if (requiresAdmin && (!user || !user.roles.includes('admin'))) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // Get the object from B2 to check its metadata and tags
    const b2 = platform.env.STORAGE;
    const object = await b2.head(decodedKey);
    
    if (!object) {
      return new Response('Not Found', { status: 404 });
    }
    
    // Extract access tag and copyright status
    const accessTag = object.customMetadata?.['tag-access'] || AccessTags.PRIVATE;
    const copyrightStatus = object.customMetadata?.['tag-copyright'] || CopyrightStatus.UNKNOWN;
    
    // Additional permission checks based on metadata
    if (accessTag === AccessTags.PRIVATE && !user) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    if (accessTag === AccessTags.BACKUP && (!user || !user.roles.includes('admin'))) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // For public domain content in the public path, redirect to public endpoint
    if (isPublicPath && 
        accessTag === AccessTags.PUBLIC_READ && 
        copyrightStatus === CopyrightStatus.PUBLIC_DOMAIN) {
      
      // Extract document ID and filename from the key
      const parts = decodedKey.replace('documents/generated/public/', '').split('/');
      const documentId = parts[0];
      const filename = parts.slice(1).join('/');
      
      return json({
        url: `/content/${encodeURIComponent(decodedKey)}`,
        permanent: true, // This is a permanent URL that never expires
        isPublicDomain: true
      });
    }
    
    // Generate URL options based on content type and copyright status
    const urlOptions = {
      expiresIn: 3600 // Default 1 hour
    };
    
    // Adjust expiration based on copyright status and access tag
    if (accessTag === AccessTags.PUBLIC_READ) {
      if (copyrightStatus === CopyrightStatus.FAIR_USE) {
        urlOptions.expiresIn = 43200; // 12 hours for fair use content
      } else {
        urlOptions.expiresIn = 86400; // 24 hours for other public-read content
      }
    }
    
    // Generate signed URL
    const signedUrl = await b2.createSignedUrl(decodedKey, urlOptions);
    
    // Return the signed URL
    return json({
      url: signedUrl,
      expires: new Date(Date.now() + (urlOptions.expiresIn * 1000)).toISOString(),
      permanent: false,
      isPublicDomain: copyrightStatus === CopyrightStatus.PUBLIC_DOMAIN,
      copyrightStatus
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
