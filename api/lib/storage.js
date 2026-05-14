/**
 * S3-Compatible Object Storage
 *
 * Supports Cloudflare R2 and Scaleway as S3-compatible backends.
 * Used for storing:
 * - Document originals (PDFs, etc.)
 * - Cover images
 * - Converted markdown files
 *
 * Structure:
 * - /documents/originals/{document_id}/{filename}
 * - /documents/converted/{document_id}/document.md
 * - /documents/covers/{document_id}/cover.{ext}
 * - /assets/images/{type}/{id}.{ext}
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import { logger } from './logger.js';

let s3Client = null;
let bucketName = null;
let publicBaseUrl = null;
// Cloudflare REST API mode — used when S3 credentials are unavailable
let cfApiToken = null;
let cfAccountId = null;
let cfBucketName = null;
let cfPublicUrl = null;

/**
 * Initialize storage based on available credentials.
 * Priority: Cloudflare R2 (S3 keys) → Scaleway → Cloudflare REST API → none
 */
export function initStorage() {
  // Try Cloudflare R2 via S3-compatible credentials
  if (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_ACCOUNT_ID) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    });
    bucketName = process.env.R2_BUCKET_NAME || 'siftersearch';
    publicBaseUrl = process.env.R2_PUBLIC_URL || `https://pub-e57ab96621a24ba18bcce728b4c51de2.r2.dev`;
    logger.info({ provider: 'cloudflare-r2', bucket: bucketName }, 'Storage initialized');
    return true;
  }

  // Try Scaleway
  if (process.env.SCALEWAY_ACCESS_KEY && process.env.SCALEWAY_SECRET_KEY) {
    const region = process.env.SCALEWAY_REGION || 'fr-par';
    s3Client = new S3Client({
      region,
      endpoint: `https://s3.${region}.scw.cloud`,
      credentials: {
        accessKeyId: process.env.SCALEWAY_ACCESS_KEY,
        secretAccessKey: process.env.SCALEWAY_SECRET_KEY
      }
    });
    bucketName = process.env.SCALEWAY_BUCKET_NAME || 'siftersearch';
    publicBaseUrl = process.env.SCALEWAY_PUBLIC_URL || `https://${bucketName}.s3.${region}.scw.cloud`;
    logger.info({ provider: 'scaleway', bucket: bucketName }, 'Storage initialized');
    return true;
  }

  // Fallback: Cloudflare REST API (uses CLOUDFLARE_API_TOKEN — no S3 creds needed)
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    cfApiToken = process.env.CLOUDFLARE_API_TOKEN;
    cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    cfBucketName = process.env.R2_BUCKET_NAME || 'siftersearch';
    cfPublicUrl = process.env.R2_PUBLIC_URL || 'https://pub-e57ab96621a24ba18bcce728b4c51de2.r2.dev';
    logger.info({ provider: 'cloudflare-rest-api', bucket: cfBucketName }, 'Storage initialized');
    return true;
  }

  logger.warn('No cloud storage configured, using local filesystem fallback');
  return false;
}

/**
 * Check if cloud storage is available
 */
export function hasCloudStorage() {
  return s3Client !== null || cfApiToken !== null;
}

/**
 * Generate a unique storage key for a document
 */
export function generateDocumentKey(documentId, type, filename) {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  switch (type) {
    case 'original':
      return `documents/originals/${documentId}/${sanitizedFilename}`;
    case 'converted':
      return `documents/converted/${documentId}/document.md`;
    case 'cover':
      const ext = filename.split('.').pop() || 'jpg';
      return `documents/covers/${documentId}/cover.${ext}`;
    default:
      return `documents/${type}/${documentId}/${sanitizedFilename}`;
  }
}

/**
 * Generate a key for assets (images, etc.)
 */
export function generateAssetKey(type, id, extension) {
  return `assets/${type}/${id}.${extension}`;
}

/**
 * Upload a file to storage
 * @param {string} key - Storage key/path
 * @param {Buffer|string} body - File content
 * @param {object} options - Upload options
 * @returns {object} Upload result with url
 */
export async function uploadFile(key, body, options = {}) {
  const { contentType = 'application/octet-stream', metadata = {} } = options;

  // Cloudflare REST API path (when no S3 credentials)
  if (!s3Client && cfApiToken) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/r2/buckets/${cfBucketName}/objects/${encodeURIComponent(key)}`;
    const headers = {
      'Authorization': `Bearer ${cfApiToken}`,
      'Content-Type': contentType,
    };
    for (const [k, v] of Object.entries(metadata)) headers[`x-amz-meta-${k}`] = v;
    const resp = await fetch(url, { method: 'PUT', headers, body });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`CF R2 upload failed: ${resp.status} ${txt.slice(0, 200)}`);
    }
    const publicUrl = `${cfPublicUrl}/${key}`;
    logger.info({ key, size: body.length, contentType }, 'File uploaded via CF REST API');
    return { key, url: publicUrl, size: body.length, contentType };
  }

  if (!s3Client) throw new Error('Cloud storage not initialized');

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });
    await s3Client.send(command);
    const url = `${publicBaseUrl}/${key}`;
    logger.info({ key, size: body.length, contentType }, 'File uploaded');
    return { key, url, size: body.length, contentType };
  } catch (err) {
    logger.error({ err, key }, 'Upload failed');
    throw err;
  }
}

/**
 * Download a file from storage
 */
export async function downloadFile(key) {
  if (!s3Client) {
    throw new Error('Cloud storage not initialized');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    const response = await s3Client.send(command);
    const body = await response.Body.transformToByteArray();

    return {
      body: Buffer.from(body),
      contentType: response.ContentType,
      metadata: response.Metadata
    };
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return null;
    }
    logger.error({ err, key }, 'Download failed');
    throw err;
  }
}

/**
 * Delete a file from storage
 */
export async function deleteFile(key) {
  if (!s3Client) {
    throw new Error('Cloud storage not initialized');
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    await s3Client.send(command);
    logger.info({ key }, 'File deleted');
    return true;
  } catch (err) {
    logger.error({ err, key }, 'Delete failed');
    throw err;
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(key) {
  if (!s3Client) {
    return false;
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    await s3Client.send(command);
    return true;
  } catch (err) {
    if (err.name === 'NotFound') {
      return false;
    }
    throw err;
  }
}

/**
 * Get a signed URL for temporary access
 */
export async function getSignedDownloadUrl(key, expiresIn = 3600) {
  if (!s3Client) {
    throw new Error('Cloud storage not initialized');
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get public URL for a key
 */
export function getPublicUrl(key) {
  if (!publicBaseUrl) {
    return null;
  }
  return `${publicBaseUrl}/${key}`;
}

/**
 * Upload an image from URL
 */
export async function uploadImageFromUrl(imageUrl, key) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());

    return uploadFile(key, buffer, { contentType });
  } catch (err) {
    logger.error({ err, imageUrl, key }, 'Failed to upload image from URL');
    throw err;
  }
}

/**
 * Generate content hash for deduplication
 */
export function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

export default {
  initStorage,
  hasCloudStorage,
  generateDocumentKey,
  generateAssetKey,
  uploadFile,
  downloadFile,
  deleteFile,
  fileExists,
  getSignedDownloadUrl,
  getPublicUrl,
  uploadImageFromUrl,
  hashContent
};
