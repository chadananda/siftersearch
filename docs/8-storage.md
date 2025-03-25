# 8. Storage Configuration

SifterSearch uses a dual-provider S3 storage strategy to optimize for both performance and cost. The storage system is designed to be flexible, allowing for different storage backends depending on the environment and use case.

## 1. Overview

The storage system is designed with the following key principles:

1. **Performance-Cost Balance**: Using faster, more expensive storage for frequently accessed data and cheaper storage for archives
2. **Redundancy**: Ensuring data is backed up across multiple providers
3. **Standardization**: Using the S3 API as a common interface for all storage operations
4. **Separation of Concerns**: Different types of data stored in different locations based on access patterns

## 2. Storage Providers

SifterSearch uses two primary S3-compatible storage providers:

### 1. Backblaze B2 (Primary Storage)

Backblaze B2 serves as the primary storage for:
- Original document files
- Processed document versions
- Public media files
- User uploads
- Frequently accessed data

**Key Features**:
- Fast access times
- Competitive pricing
- Global CDN integration
- S3-compatible API
- High durability (99.999999%)

### 2. Scaleway (Archive Storage)

Scaleway serves as the secondary storage for:
- Long-term archives
- Database backups
- Infrequently accessed files
- Disaster recovery data

**Key Features**:
- Lower cost for long-term storage
- European data centers
- S3-compatible API
- Glacier-like storage tiers

## 3. Storage Categories

The storage system organizes data into the following categories:

1. **Original Documents**: Original, unmodified files uploaded by users
2. **Processed Documents**: Extracted text, metadata, and transformed versions
3. **Media Files**: Images, audio, video, and other media assets
4. **Public Assets**: Files that need to be publicly accessible
5. **Database Backups**: Regular snapshots of the database
6. **System Backups**: Configuration and system state backups

## 4. Directory Structure

Each storage provider follows a consistent directory structure:

```
bucket-name/
├── originals/                  # Original documents
│   ├── YYYY-MM-DD/             # Organized by upload date
│   │   └── {uuid}.{extension}  # Unique filename
├── processed/                  # Processed versions
│   ├── text/                   # Extracted text
│   ├── metadata/               # Extracted metadata
│   └── thumbnails/             # Generated thumbnails
├── media/                      # Media files
│   ├── images/                 # Image files
│   ├── audio/                  # Audio files
│   └── video/                  # Video files
├── public/                     # Publicly accessible files
│   ├── assets/                 # Static assets
│   └── exports/                # Exported data
├── backups/                    # System backups
│   ├── database/               # Database snapshots
│   │   └── YYYY-MM-DD/         # Organized by date
│   └── config/                 # Configuration backups
└── archive/                    # Long-term archives
    └── YYYY/                   # Organized by year
```

## 5. Storage Configuration

Storage providers are configured through environment variables:

### Backblaze B2 Configuration

```
B2_ACCOUNT_ID=your_account_id
B2_APPLICATION_KEY=your_application_key
B2_BUCKET=your_bucket_name
B2_ENDPOINT=https://s3.us-west-002.backblazeb2.com
```

### Scaleway Configuration

```
SCALEWAY_ACCESS_KEY=your_access_key
SCALEWAY_SECRET_KEY=your_secret_key
SCALEWAY_BUCKET=your_bucket_name
SCALEWAY_ENDPOINT=https://s3.fr-par.scw.cloud
```

## 6. Storage API

The storage system provides a unified API for interacting with both storage providers:

```javascript
// Import the storage module
import { storage } from '$lib/storage';

// Upload a file to primary storage
await storage.primary.upload(fileBuffer, 'originals/2023-05-15/document.pdf');

// Download a file from primary storage
const file = await storage.primary.download('originals/2023-05-15/document.pdf');

// Check if a file exists in archive storage
const exists = await storage.archive.exists('backups/database/2023-05-15/snapshot.sql');

// List files in a directory in primary storage
const files = await storage.primary.list('processed/text/');

// Generate a temporary URL for a file in primary storage
const url = await storage.primary.getSignedUrl('media/images/photo.jpg', { expires: 3600 });

// Copy a file from primary to archive storage
await storage.copy('primary', 'archive', 'originals/2023-05-15/document.pdf', 'archive/2023/document.pdf');

// Delete a file from primary storage
await storage.primary.delete('originals/2023-05-15/document.pdf');
```

## 7. Backup Strategy

SifterSearch implements a focused backup strategy that prioritizes only the data that needs to be preserved:

1. **Manticore Search Data**:
   - Periodic backups of the Manticore search index and data
   - Stored in archive storage (Scaleway)
   - Scheduled backups via cron jobs
   - This is the only server-side data that requires explicit backup

2. **External Data (Already Redundant)**:
   - **Original Documents**: Already stored in Backblaze B2 with their own redundancy
   - **Database**: Primary copy stored in Turso with their own backup systems
   - **Processed Documents**: Can be regenerated from originals if needed

3. **Configuration Backups**:
   - System configuration backed up after changes
   - Stored in archive storage
   - Version history maintained

This approach minimizes what needs to be backed up from the host server itself, making the application more portable and easier to migrate between hosting providers.

## 8. Backup and Restore Scripts

The system includes scripts for backup and restore operations focused on the Manticore data:

### Backup Scripts

```bash
# Backup Manticore data to archive storage
npm run backup:manticore

# Full system backup (configuration and Manticore data)
npm run backup:full
```

### Restore Scripts

```bash
# Restore Manticore data from archive storage
npm run restore:manticore [backup-date]

# Restore system configuration
npm run restore:config [backup-date]

# Full system restore
npm run restore:full [backup-date]
```

## 9. Vendor-Agnostic Storage Strategy

SifterSearch's storage strategy is designed to be vendor-agnostic while leveraging the strengths of different storage providers:

1. **S3-Compatible API**: All storage interactions use the standard S3 API, allowing you to switch providers easily
2. **Configurable Providers**: Both primary and archive storage providers can be changed by updating environment variables
3. **No Vendor-Specific Features**: The application avoids using features specific to any one provider
4. **Separation of Concerns**: Different types of data are stored in different locations based on access patterns

This approach gives you the flexibility to:
- Switch storage providers if pricing or features change
- Use different providers in different regions for improved performance
- Implement a multi-cloud strategy for additional redundancy
- Self-host storage using S3-compatible solutions like MinIO if desired

### Alternative Storage Providers

While the default configuration uses Backblaze B2 and Scaleway, you can easily substitute other S3-compatible providers:

- **Primary Storage Alternatives**: AWS S3, Google Cloud Storage, DigitalOcean Spaces, Wasabi, MinIO
- **Archive Storage Alternatives**: AWS S3 Glacier, Google Cloud Archive Storage, Azure Archive Storage

To switch providers, simply update the corresponding environment variables in your `.env` file.

## 10. Monitoring and Maintenance

The storage system includes monitoring and maintenance tools:

1. **Storage Metrics**:
   - Total storage used by category
   - Growth rate over time
   - Cost projections

2. **Integrity Checks**:
   - Regular checksum verification of critical files
   - Automatic repair from redundant storage

3. **Cleanup Operations**:
   - Identify and remove orphaned files
   - Consolidate fragmented storage
   - Enforce naming and organization standards

## 11. Implementation Details

### S3 Client Configuration

The storage system uses the AWS SDK for JavaScript v3 to interact with S3-compatible storage:

```javascript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Configure the primary storage client (Backblaze B2)
const primaryClient = new S3Client({
  region: 'us-west-002',
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_ACCOUNT_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY
  }
});

// Configure the archive storage client (Scaleway)
const archiveClient = new S3Client({
  region: 'fr-par',
  endpoint: process.env.SCALEWAY_ENDPOINT,
  credentials: {
    accessKeyId: process.env.SCALEWAY_ACCESS_KEY,
    secretAccessKey: process.env.SCALEWAY_SECRET_KEY
  }
});
```

### File Upload Implementation

```javascript
/**
 * Upload a file to storage
 * @param {Buffer|Blob|ReadableStream} data - The file data
 * @param {string} key - The storage key (path)
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
async function uploadFile(data, key, options = {}) {
  const { contentType = 'application/octet-stream', metadata = {}, storage = 'primary' } = options;
  
  const client = storage === 'primary' ? primaryClient : archiveClient;
  const bucket = storage === 'primary' ? process.env.B2_BUCKET : process.env.SCALEWAY_BUCKET;
  
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
    Metadata: metadata
  });
  
  return client.send(command);
}
```

### File Download Implementation

```javascript
/**
 * Download a file from storage
 * @param {string} key - The storage key (path)
 * @param {Object} options - Download options
 * @returns {Promise<Buffer>} File data
 */
async function downloadFile(key, options = {}) {
  const { storage = 'primary' } = options;
  
  const client = storage === 'primary' ? primaryClient : archiveClient;
  const bucket = storage === 'primary' ? process.env.B2_BUCKET : process.env.SCALEWAY_BUCKET;
  
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });
  
  const response = await client.send(command);
  return streamToBuffer(response.Body);
}

/**
 * Convert a stream to a buffer
 * @param {ReadableStream} stream - The input stream
 * @returns {Promise<Buffer>} The buffer
 */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
```

## 12. Security Considerations

The storage system implements several security measures:

1. **Access Control**:
   - Restrictive IAM policies for storage access
   - Separate credentials for primary and archive storage
   - Principle of least privilege for service accounts

2. **Data Protection**:
   - Server-side encryption for all stored data
   - Secure transfer using HTTPS
   - Content validation before storage

3. **Access Logging**:
   - Comprehensive logging of all storage operations
   - Audit trail for sensitive operations
   - Anomaly detection for unusual access patterns

4. **Credential Management**:
   - Storage credentials managed through environment variables
   - Regular credential rotation
   - No hardcoded credentials in the codebase

## 13. Disaster Recovery

In case of a catastrophic failure, the system can be restored following these steps:

1. **Infrastructure Setup**:
   - Deploy new Docker containers on DigitalOcean or Vultr
   - Configure networking and security

2. **Database Restoration**:
   - Restore the most recent database backup from archive storage
   - Verify database integrity

3. **Application Restoration**:
   - Deploy the application code
   - Restore configuration files

4. **Storage Reconnection**:
   - Configure storage credentials
   - Verify access to both primary and archive storage

5. **Verification**:
   - Run system health checks
   - Verify data integrity
   - Test critical functionality

## 14. Best Practices

When working with the storage system, follow these best practices:

1. **File Organization**:
   - Follow the established directory structure
   - Use consistent naming conventions
   - Include appropriate metadata

2. **Error Handling**:
   - Implement proper error handling for storage operations
   - Retry failed operations with exponential backoff
   - Log detailed error information

3. **Performance Optimization**:
   - Use streaming for large files
   - Implement caching for frequently accessed files
   - Batch operations when possible

4. **Cost Management**:
   - Monitor storage usage and costs
   - Use appropriate storage tiers based on access patterns
   - Clean up temporary and unnecessary files
