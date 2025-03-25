/**
 * B2 Storage Service
 * 
 * Provides structured access to Backblaze B2 storage with organized prefixes
 * and object tagging for access control.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, 
         ListObjectsV2Command, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';

// Storage prefixes for different content types
export const StoragePrefixes = {
  MANTICORE_INDEXES: 'manticore/indexes/',
  MANTICORE_SNAPSHOTS: 'manticore/snapshots/',
  DOCUMENTS_ORIGINALS: 'documents/originals/',
  DOCUMENTS_GENERATED: 'documents/generated/',
  DOCUMENTS_GENERATED_PUBLIC: 'documents/generated/public/',
  DOCUMENTS_GENERATED_RESTRICTED: 'documents/generated/restricted/',
  BACKUPS: 'backups/'
};

// Access control tags
export const AccessTags = {
  PRIVATE: 'private',
  PUBLIC_READ: 'public-read',
  BACKUP: 'backup'
};

// Copyright status tags
export const CopyrightStatus = {
  PUBLIC_DOMAIN: 'public-domain',
  FAIR_USE: 'fair-use',
  COPYRIGHTED: 'copyrighted',
  UNKNOWN: 'unknown'
};

/**
 * B2 Storage Service for SifterSearch
 */
export class B2StorageService {
  /**
   * Initialize the storage service
   * @param {Object} options - Configuration options
   * @param {string} options.endpoint - B2 endpoint URL
   * @param {string} options.region - B2 region
   * @param {string} options.bucket - B2 bucket name
   * @param {string} options.keyId - B2 application key ID
   * @param {string} options.applicationKey - B2 application key
   */
  constructor(options) {
    this.bucket = options.bucket;
    this.endpoint = options.endpoint;
    this.region = options.region || '';
    
    // Create S3 client for B2
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: this.region,
      credentials: {
        accessKeyId: options.keyId,
        secretAccessKey: options.applicationKey
      },
      forcePathStyle: true // Required for B2
    });
  }

  /**
   * Upload a file to storage
   * @param {string} key - Object key (path in bucket)
   * @param {Buffer|Blob|string} data - File data to upload
   * @param {Object} metadata - Optional metadata
   * @param {string} contentType - MIME type of the content
   * @param {string} access - Access level (private, public-read)
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(key, data, metadata = {}, contentType = 'application/octet-stream', access = AccessTags.PRIVATE) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
      Metadata: metadata,
      ACL: access
    });

    try {
      const result = await this.client.send(command);
      return {
        success: true,
        key: key,
        etag: result.ETag,
        url: this.getObjectUrl(key, access === AccessTags.PUBLIC_READ)
      };
    } catch (error) {
      console.error(`Error uploading file to B2: ${key}`, error);
      throw error;
    }
  }

  /**
   * Get a file from storage
   * @param {string} key - Object key (path in bucket)
   * @returns {Promise<Object>} Object data and metadata
   */
  async getFile(key) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    try {
      const response = await this.client.send(command);
      
      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      
      return {
        data: Buffer.concat(chunks),
        metadata: response.Metadata || {},
        contentType: response.ContentType,
        lastModified: response.LastModified,
        size: response.ContentLength
      };
    } catch (error) {
      console.error(`Error getting file from B2: ${key}`, error);
      throw error;
    }
  }

  /**
   * Delete a file from storage
   * @param {string} key - Object key (path in bucket)
   * @returns {Promise<boolean>} Success indicator
   */
  async deleteFile(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    try {
      await this.client.send(command);
      return true;
    } catch (error) {
      console.error(`Error deleting file from B2: ${key}`, error);
      throw error;
    }
  }

  /**
   * List files in a directory (prefix)
   * @param {string} prefix - Directory prefix
   * @param {number} maxItems - Maximum number of items to return
   * @returns {Promise<Array>} List of objects
   */
  async listFiles(prefix, maxItems = 1000) {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: maxItems
    });

    try {
      const response = await this.client.send(command);
      return (response.Contents || []).map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        etag: item.ETag
      }));
    } catch (error) {
      console.error(`Error listing files from B2: ${prefix}`, error);
      throw error;
    }
  }

  /**
   * Check if a file exists
   * @param {string} key - Object key (path in bucket)
   * @returns {Promise<boolean>} True if exists
   */
  async fileExists(key) {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    try {
      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      console.error(`Error checking file existence in B2: ${key}`, error);
      throw error;
    }
  }

  /**
   * Copy a file within the storage
   * @param {string} sourceKey - Source object key
   * @param {string} destinationKey - Destination object key
   * @param {string} access - Access level for the new object
   * @returns {Promise<Object>} Copy result
   */
  async copyFile(sourceKey, destinationKey, access = AccessTags.PRIVATE) {
    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destinationKey,
      ACL: access
    });

    try {
      const result = await this.client.send(command);
      return {
        success: true,
        key: destinationKey,
        etag: result.CopyObjectResult?.ETag,
        url: this.getObjectUrl(destinationKey, access === AccessTags.PUBLIC_READ)
      };
    } catch (error) {
      console.error(`Error copying file in B2: ${sourceKey} to ${destinationKey}`, error);
      throw error;
    }
  }

  /**
   * Get a direct URL to an object (public or private)
   * @param {string} key - Object key
   * @param {boolean} isPublic - Whether the object has public access
   * @returns {string} URL to the object
   */
  getObjectUrl(key, isPublic = false) {
    if (isPublic) {
      // For public objects, return the CDN URL if configured, otherwise direct B2 URL
      return this.cdnUrl 
        ? `${this.cdnUrl}/${key}`
        : `${this.endpoint}/${this.bucket}/${key}`;
    } else {
      // For private objects, return the direct B2 URL (will require authentication)
      return `${this.endpoint}/${this.bucket}/${key}`;
    }
  }

  /**
   * Update metadata for an existing object
   * @param {string} key - Object key
   * @param {Object} metadata - New metadata
   * @returns {Promise<boolean>} Success indicator
   */
  async updateMetadata(key, metadata) {
    // B2 doesn't support direct metadata updates, so we need to copy the object to itself
    try {
      // First, get the current object to preserve its content type and other attributes
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      
      const headResponse = await this.client.send(headCommand);
      
      // Now copy the object to itself with new metadata
      const copyCommand = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${key}`,
        Key: key,
        Metadata: metadata,
        MetadataDirective: 'REPLACE',
        ContentType: headResponse.ContentType
      });
      
      await this.client.send(copyCommand);
      return true;
    } catch (error) {
      console.error(`Error updating metadata in B2: ${key}`, error);
      throw error;
    }
  }
}

/**
 * Create a B2 storage service instance
 * @param {Object} options - Configuration options
 * @returns {B2StorageService} Storage service instance
 */
export function createB2StorageService(options = {}) {
  const config = {
    endpoint: options.endpoint || process.env.B2_ENDPOINT || 'https://s3.us-west-001.backblazeb2.com',
    region: options.region || process.env.B2_REGION || '',
    bucket: options.bucket || process.env.B2_BUCKET || 'siftersearch-dev',
    keyId: options.keyId || process.env.B2_ACCOUNT_ID || process.env.BACKBLAZE_KEY_ID,
    applicationKey: options.applicationKey || process.env.B2_APPLICATION_KEY || process.env.BACKBLAZE_APP_KEY
  };

  return new B2StorageService(config);
}

export default createB2StorageService;
