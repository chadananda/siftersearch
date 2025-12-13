/**
 * S3-Compatible Object Storage
 *
 * Supports Backblaze B2 and Scaleway as S3-compatible backends.
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

/**
 * Initialize S3 client based on available credentials
 * Priority: Backblaze B2 → Scaleway → Local filesystem fallback
 */
export function initStorage() {
  // Try Backblaze B2 first
  if (process.env.B2_APPLICATION_KEY_ID && process.env.B2_APPLICATION_KEY) {
    const region = process.env.B2_REGION || 'us-west-004';
    s3Client = new S3Client({
      region,
      endpoint: `https://s3.${region}.backblazeb2.com`,
      credentials: {
        accessKeyId: process.env.B2_APPLICATION_KEY_ID,
        secretAccessKey: process.env.B2_APPLICATION_KEY
      }
    });
    bucketName = process.env.B2_BUCKET_NAME || 'siftersearch';
    publicBaseUrl = process.env.B2_PUBLIC_URL || `https://${bucketName}.s3.${region}.backblazeb2.com`;
    logger.info({ provider: 'backblaze', bucket: bucketName }, 'Storage initialized');
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

  logger.warn('No cloud storage configured, using local filesystem fallback');
  return false;
}

/**
 * Check if cloud storage is available
 */
export function hasCloudStorage() {
  return s3Client !== null;
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
  if (!s3Client) {
    throw new Error('Cloud storage not initialized');
  }

  const {
    contentType = 'application/octet-stream',
    metadata = {},
    acl = 'public-read'
  } = options;

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
      ACL: acl
    });

    await s3Client.send(command);

    const url = `${publicBaseUrl}/${key}`;
    logger.info({ key, size: body.length, contentType }, 'File uploaded');

    return {
      key,
      url,
      size: body.length,
      contentType
    };
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
