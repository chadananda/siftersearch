# LibSQL Data Directory

This directory contains the LibSQL database files when running in embedded mode.

## Purpose

- Stores the local.db SQLite database file
- Provides persistent storage for LibSQL in embedded mode
- Enables high-performance database access without network overhead

## Configuration

The LibSQL configuration in the application uses this directory via the `LIBSQL_LOCAL_PATH` environment variable, which is set to `./data/libsql/local.db` in the `.env-public` file.

## Development vs. Production

- In development: Uses a local SQLite file for maximum simplicity
- In production: Still uses embedded mode but with a mounted persistent volume
- Periodic syncing with Turso cloud ensures data durability

**Note:** This directory is included in .gitignore and should not contain any files that need to be tracked in Git, except for this README.md file which ensures the directory exists when cloning the repository.
