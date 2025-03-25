# Manticore Search Data Directory

This directory is used to store Manticore Search data files when running in development mode.

## Purpose

- Stores Manticore Search index data
- Persists between container restarts
- Mounted as a volume in the Manticore container

## Configuration

The Manticore configuration file references this directory via the Docker volume mount.

**Note:** This directory is included in .gitignore and should not contain any files that need to be tracked in Git, except for this README.md file which ensures the directory exists when cloning the repository.
