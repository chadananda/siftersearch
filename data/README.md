# SifterSearch Data Directory

This directory contains persistent data files for the SifterSearch application.

## Structure

- `manticore/` - Manticore Search data files
- `local.db` - LibSQL database file (when using embedded mode)
- `storage/` - Local storage for files when not using S3

## Development Mode

In development mode, these directories are used to store data locally:

- LibSQL uses the local.db file in this directory
- Manticore stores its index data in the manticore/ subdirectory
- Local file storage is used instead of S3 when appropriate

## Production Mode

In production:

- LibSQL still uses embedded mode with a persistent volume
- Manticore runs as a separate container with its own persistent storage
- S3 storage (Backblaze B2 and Scaleway) is used for file storage

**Note:** Most contents of this directory are included in .gitignore and should not be tracked in Git, except for README.md files which ensure the directories exist when cloning the repository.
