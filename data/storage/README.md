# Local Storage Directory

This directory is used for local file storage in development mode when not using S3-compatible storage.

## Purpose

- Stores uploaded files, documents, and other assets
- Provides a local alternative to S3 storage
- Simplifies development without requiring cloud storage credentials

## Configuration

The storage configuration in `config/storage.js` will use this directory when:
- Running in development mode
- S3 storage is not configured or unavailable

## Structure

Files are organized in subdirectories based on their purpose:
- `documents/` - Uploaded documents for indexing
- `media/` - Images and other media files
- `backups/` - Local backups of important data

**Note:** This directory is included in .gitignore and should not contain any files that need to be tracked in Git, except for this README.md file which ensures the directory exists when cloning the repository.
