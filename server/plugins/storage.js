// server/plugins/storage.js
import fp from 'fastify-plugin';
import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Storage plugin for Fastify
 * Supports S3-compatible storage providers (Backblaze B2, Scaleway, etc.)
 */
async function storagePlugin(fastify, options) {
  // Determine if we're using local storage or cloud storage
  const useCloudStorage = process.env.NODE_ENV === 'production' && process.env.USE_LOCAL_STORAGE !== 'true';
  
  let s3Client = null;
  
  if (useCloudStorage) {
    // Create S3 client for cloud storage
    s3Client = new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'
    });
    
    fastify.log.info('Connected to S3-compatible storage');
  } else {
    // For local development, we'll use local file system
    // We'll implement this as needed
    fastify.log.info('Using local file system for storage');
  }

  // Decorate Fastify instance with storage client
  fastify.decorate('storage', {
    s3Client,
    bucket: process.env.S3_BUCKET,
    isCloud: useCloudStorage,
    
    // Helper methods for storage operations
    async uploadFile(key, data, contentType) {
      // Implementation will be added as needed
    },
    
    async getFile(key) {
      // Implementation will be added as needed
    },
    
    async deleteFile(key) {
      // Implementation will be added as needed
    },
    
    getPublicUrl(key) {
      // Implementation will be added as needed
    }
  });

  // Close storage connections when Fastify closes
  fastify.addHook('onClose', async (instance) => {
    if (s3Client) {
      try {
        // No explicit close method for S3Client
        fastify.log.info('S3 client connection released');
      } catch (err) {
        fastify.log.error(`Error releasing S3 client: ${err.message}`);
      }
    }
  });
}

export default fp(storagePlugin, {
  name: 'storage',
  fastify: '4.x'
});
