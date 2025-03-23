/**
 * R2 Storage Service
 * 
 * Provides structured access to Cloudflare R2 storage with organized prefixes
 * and object tagging for access control.
 */

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
 * R2 Storage Service for SifterSearch
 */
export class R2StorageService {
  /**
   * Initialize the storage service
   * @param {Object} r2Bucket - R2 bucket binding from Cloudflare Workers
   * @param {Object} options - Configuration options
   */
  constructor(r2Bucket, options = {}) {
    this.bucket = r2Bucket;
    this.isProduction = options.isProduction || false;
    this.defaultTags = options.defaultTags || { access: AccessTags.PRIVATE };
    this.publicUrlBase = options.publicUrlBase || '';
  }

  /**
   * Get a full object key with the appropriate prefix
   * @param {string} prefix - Storage prefix
   * @param {string} key - Object key
   * @returns {string} Full object key with prefix
   */
  getFullKey(prefix, key) {
    return `${prefix}${key}`;
  }

  /**
   * Upload a file to R2 storage
   * @param {string} prefix - Storage prefix (use StoragePrefixes constants)
   * @param {string} key - Object key
   * @param {Blob|ArrayBuffer|string} data - File data
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(prefix, key, data, options = {}) {
    const fullKey = this.getFullKey(prefix, key);
    const tags = { ...this.defaultTags, ...options.tags };
    
    // Convert tags object to R2 custom metadata format
    const customMetadata = Object.entries(tags).reduce((acc, [key, value]) => {
      acc[`tag-${key}`] = value;
      return acc;
    }, {});

    // Add any additional metadata
    if (options.metadata) {
      Object.assign(customMetadata, options.metadata);
    }

    const uploadOptions = {
      customMetadata,
      httpMetadata: options.httpMetadata || {}
    };

    // Upload to R2
    await this.bucket.put(fullKey, data, uploadOptions);
    
    // For public domain content, return a permanent URL
    if (tags.copyright === CopyrightStatus.PUBLIC_DOMAIN && 
        tags.access === AccessTags.PUBLIC_READ &&
        prefix === StoragePrefixes.DOCUMENTS_GENERATED_PUBLIC) {
      
      return {
        key: fullKey,
        tags,
        success: true,
        url: this.getPublicDocumentUrl(key.split('/')[0], key.split('/').slice(1).join('/'))
      };
    }
    
    return {
      key: fullKey,
      tags,
      success: true
    };
  }

  /**
   * Download a file from R2 storage
   * @param {string} prefix - Storage prefix
   * @param {string} key - Object key
   * @returns {Promise<Object>} Download result with file data
   */
  async downloadFile(prefix, key) {
    const fullKey = this.getFullKey(prefix, key);
    const object = await this.bucket.get(fullKey);
    
    if (!object) {
      throw new Error(`Object not found: ${fullKey}`);
    }

    // Extract tags from custom metadata
    const tags = {};
    for (const [key, value] of Object.entries(object.customMetadata || {})) {
      if (key.startsWith('tag-')) {
        tags[key.replace('tag-', '')] = value;
      }
    }

    return {
      key: fullKey,
      data: await object.arrayBuffer(),
      metadata: object.customMetadata || {},
      tags,
      httpMetadata: object.httpMetadata || {}
    };
  }

  /**
   * Generate a signed URL for temporary access to a file
   * @param {string} prefix - Storage prefix
   * @param {string} key - Object key
   * @param {Object} options - Signed URL options
   * @returns {Promise<string>} Signed URL
   */
  async getSignedUrl(prefix, key, options = {}) {
    const fullKey = this.getFullKey(prefix, key);
    
    // Check if this is public domain content in the public folder
    if (prefix === StoragePrefixes.DOCUMENTS_GENERATED_PUBLIC) {
      try {
        const object = await this.bucket.head(fullKey);
        if (object && 
            object.customMetadata?.['tag-copyright'] === CopyrightStatus.PUBLIC_DOMAIN &&
            object.customMetadata?.['tag-access'] === AccessTags.PUBLIC_READ) {
          
          // For public domain content, return a permanent URL
          return this.getPublicDocumentUrl(key.split('/')[0], key.split('/').slice(1).join('/'));
        }
      } catch (error) {
        console.error('Error checking public domain status:', error);
      }
    }
    
    // In local development, we'll just return a simulated URL
    if (!this.isProduction) {
      return `/api/storage/signed/${encodeURIComponent(fullKey)}?expires=${Date.now() + 3600000}`;
    }

    // Get the object to check its metadata
    const object = await this.bucket.head(fullKey);
    if (!object) {
      throw new Error(`Object not found: ${fullKey}`);
    }

    // Determine expiration time based on copyright status and access tag
    let expiresIn = 3600; // Default 1 hour
    
    const copyrightStatus = object.customMetadata?.['tag-copyright'] || CopyrightStatus.UNKNOWN;
    const accessTag = object.customMetadata?.['tag-access'] || AccessTags.PRIVATE;
    
    // Adjust expiration based on copyright status
    if (accessTag === AccessTags.PUBLIC_READ) {
      if (copyrightStatus === CopyrightStatus.FAIR_USE) {
        expiresIn = 43200; // 12 hours for fair use content
      } else {
        expiresIn = 86400; // 24 hours for other public-read content
      }
    }
    
    // In production, implement proper signed URL generation
    // This would typically be done via a Cloudflare Worker
    throw new Error('Signed URL generation not implemented for production');
  }

  /**
   * List objects in a prefix
   * @param {string} prefix - Storage prefix
   * @param {Object} options - List options
   * @returns {Promise<Array>} List of objects
   */
  async listFiles(prefix, options = {}) {
    const listOptions = {
      prefix,
      delimiter: options.delimiter || '/',
      limit: options.limit || 1000,
      cursor: options.cursor
    };

    const result = await this.bucket.list(listOptions);
    
    return {
      objects: result.objects.map(obj => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        etag: obj.etag,
        httpMetadata: obj.httpMetadata || {}
      })),
      truncated: result.truncated,
      cursor: result.cursor
    };
  }

  /**
   * Delete a file from R2 storage
   * @param {string} prefix - Storage prefix
   * @param {string} key - Object key
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(prefix, key) {
    const fullKey = this.getFullKey(prefix, key);
    await this.bucket.delete(fullKey);
    return true;
  }

  /**
   * Create a backup of Manticore indexes
   * @param {string} backupName - Name of the backup
   * @param {ArrayBuffer} data - Backup data
   * @returns {Promise<Object>} Backup result
   */
  async createManticoreBackup(backupName, data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `${backupName}-${timestamp}.snapshot`;
    
    return this.uploadFile(
      StoragePrefixes.MANTICORE_SNAPSHOTS,
      key,
      data,
      {
        tags: { access: AccessTags.BACKUP, type: 'manticore-snapshot' },
        metadata: {
          'created-at': timestamp,
          'backup-name': backupName
        }
      }
    );
  }

  /**
   * Store an original document
   * @param {string} documentId - Document ID
   * @param {string} filename - Original filename
   * @param {Blob|ArrayBuffer} data - Document data
   * @param {Object} metadata - Document metadata
   * @returns {Promise<Object>} Upload result
   */
  async storeOriginalDocument(documentId, filename, data, metadata = {}) {
    const key = `${documentId}/${filename}`;
    
    return this.uploadFile(
      StoragePrefixes.DOCUMENTS_ORIGINALS,
      key,
      data,
      {
        tags: { 
          access: AccessTags.PRIVATE, 
          type: 'original-document',
          copyright: metadata.copyrightStatus || CopyrightStatus.UNKNOWN
        },
        metadata: {
          'document-id': documentId,
          'original-filename': filename,
          ...metadata
        }
      }
    );
  }

  /**
   * Store a generated document
   * @param {string} documentId - Document ID
   * @param {string} filename - Generated filename
   * @param {Blob|ArrayBuffer} data - Document data
   * @param {Object} metadata - Document metadata
   * @returns {Promise<Object>} Upload result with URL for public domain content
   */
  async storeGeneratedDocument(documentId, filename, data, metadata = {}) {
    const copyrightStatus = metadata.copyrightStatus || CopyrightStatus.UNKNOWN;
    const isPublic = metadata.isPublic || copyrightStatus === CopyrightStatus.PUBLIC_DOMAIN;
    
    // Choose the appropriate prefix based on copyright status
    const prefix = isPublic 
      ? StoragePrefixes.DOCUMENTS_GENERATED_PUBLIC
      : StoragePrefixes.DOCUMENTS_GENERATED_RESTRICTED;
    
    const key = `${documentId}/${filename}`;
    
    return this.uploadFile(
      prefix,
      key,
      data,
      {
        tags: { 
          access: isPublic ? AccessTags.PUBLIC_READ : AccessTags.PRIVATE,
          type: 'generated-document',
          copyright: copyrightStatus
        },
        metadata: {
          'document-id': documentId,
          'generated-filename': filename,
          ...metadata
        }
      }
    );
  }

  /**
   * Get a public URL for a document (only for public domain content)
   * @param {string} documentId - Document ID
   * @param {string} filename - Filename
   * @returns {Promise<string|null>} Public URL or null if not public
   */
  async getPublicDocumentUrl(documentId, filename) {
    const key = `${documentId}/${filename}`;
    const fullKey = this.getFullKey(StoragePrefixes.DOCUMENTS_GENERATED_PUBLIC, key);
    
    // Check if the file exists and is public domain
    try {
      const object = await this.bucket.head(fullKey);
      if (!object) {
        return null;
      }
      
      const copyrightStatus = object.customMetadata?.['tag-copyright'];
      const accessTag = object.customMetadata?.['tag-access'];
      
      if (copyrightStatus === CopyrightStatus.PUBLIC_DOMAIN && accessTag === AccessTags.PUBLIC_READ) {
        // For Cloudflare R2, we can use a public URL pattern if configured
        if (this.isProduction && this.publicUrlBase) {
          // Use the configured public URL base
          return `${this.publicUrlBase}/${encodeURIComponent(documentId)}/${encodeURIComponent(filename)}`;
        } else {
          // For local development or if no public URL base is configured
          return `/content/${encodeURIComponent(fullKey)}`;
        }
      }
    } catch (error) {
      console.error('Error checking document public status:', error);
    }
    
    return null;
  }

  /**
   * Create a system backup
   * @param {string} backupName - Name of the backup
   * @param {Blob|ArrayBuffer} data - Backup data
   * @returns {Promise<Object>} Backup result
   */
  async createSystemBackup(backupName, data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `${backupName}-${timestamp}.zip`;
    
    return this.uploadFile(
      StoragePrefixes.BACKUPS,
      key,
      data,
      {
        tags: { access: AccessTags.BACKUP, type: 'system-backup' },
        metadata: {
          'created-at': timestamp,
          'backup-name': backupName
        }
      }
    );
  }
}

/**
 * Create an R2 storage service instance
 * @param {Object} env - Environment with R2 bucket binding
 * @returns {R2StorageService} Storage service instance
 */
export function createR2StorageService(env) {
  const isProduction = env.NODE_ENV === 'production';
  const publicUrlBase = env.PUBLIC_R2_URL || '';
  
  return new R2StorageService(env.STORAGE, { 
    isProduction,
    publicUrlBase
  });
}

export default createR2StorageService;
