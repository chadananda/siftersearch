---
title: Librarian Agent
description: Library management agent for document ingestion, metadata enrichment, and collection curation
role: Library Management
icon: book-open
order: 7
---

# Librarian Agent

**Role:** Library Management & Curation Specialist
**File:** `api/agents/agent-librarian.js`

## Overview

The Librarian agent manages the SifterSearch library collection. It handles document ingestion, metadata enrichment, duplicate detection, quality assessment, and book research. Think of it as the digital librarian who ensures the collection remains organized, high-quality, and comprehensive.

## Core Capabilities

### 1. Document Analysis & Ingestion
- Parse documents with frontmatter extraction
- Suggest metadata (title, author, religion, collection)
- Assess document quality (OCR errors, formatting issues)
- Check for duplicates using semantic search
- Generate ingestion recommendations (approve/review/reject)

### 2. ISBN & Metadata Lookup
- OpenLibrary API integration for book metadata
- Google Books fallback for additional coverage
- Cover image discovery and storage
- Author and publication information enrichment

### 3. Duplicate Detection
- Semantic similarity search via Meilisearch
- Configurable similarity threshold (default 0.85)
- Identifies exact duplicates vs. similar editions/translations
- Prevents redundant content in the library

### 4. Quality Assessment
- Heuristic checks for OCR artifacts
- Detection of broken words and formatting issues
- AI-powered deep quality analysis
- Actionable fix suggestions

### 5. Collection Research
- Analyze gaps in the library by religion/topic
- Suggest important books to acquire
- Categorize by availability (public domain vs. copyrighted)
- Prioritize recommendations

## Architecture

```
Document Input
     │
     ▼
┌─────────────────────┐
│  Parse Frontmatter  │
└──────────┬──────────┘
           │
     ┌─────┴─────┐─────────────┐
     ▼           ▼             ▼
┌─────────┐ ┌─────────┐ ┌─────────────┐
│ Suggest │ │ Assess  │ │   Check     │
│Metadata │ │ Quality │ │ Duplicates  │
└────┬────┘ └────┬────┘ └──────┬──────┘
     │           │             │
     └───────────┼─────────────┘
                 ▼
       ┌─────────────────┐
       │  Recommendation │ ──► approve/review/reject
       └─────────────────┘
```

## Database Schema

```sql
-- Librarian suggestions queue
CREATE TABLE librarian_suggestions (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,           -- new_document, quality_issue, duplicate, etc.
  data TEXT NOT NULL,           -- JSON with suggestion details
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, deferred
  admin_notes TEXT,
  created_at DATETIME,
  reviewed_at DATETIME
);

-- Document assets (originals, covers)
CREATE TABLE document_assets (
  id INTEGER PRIMARY KEY,
  document_id INTEGER,
  asset_type TEXT NOT NULL,     -- original, converted, cover, thumbnail
  storage_key TEXT NOT NULL,    -- S3/B2 key
  storage_url TEXT,
  file_name TEXT,
  content_type TEXT,
  created_at DATETIME
);

-- Ingestion queue
CREATE TABLE ingestion_queue (
  id INTEGER PRIMARY KEY,
  status TEXT DEFAULT 'pending',
  source_type TEXT NOT NULL,    -- upload, url, isbn, research
  source_data TEXT NOT NULL,    -- JSON source info
  analysis_result TEXT,         -- JSON analysis
  suggested_metadata TEXT,
  target_path TEXT,
  error_message TEXT,
  created_at DATETIME
);
```

## Usage Examples

### Analyze a Document

```javascript
import { LibrarianAgent } from './api/agents/agent-librarian.js';

const librarian = new LibrarianAgent();

// Analyze a document for potential ingestion
const analysis = await librarian.analyzeDocument(documentText, {
  title: 'Some Answered Questions',
  author: "'Abdu'l-Baha"
});

// Returns:
// {
//   content: "...",
//   suggestedMetadata: { title, author, religion, collection, confidence },
//   qualityAssessment: { overallQuality, issues, needsReview },
//   duplicateCheck: { hasDuplicates, matches, duplicateType },
//   recommendation: { action: 'approve'|'review'|'reject', reason }
// }
```

### ISBN Lookup

```javascript
// Look up book by ISBN
const bookInfo = await librarian.lookupISBN('978-0877432968');

// Returns:
// {
//   source: 'openlibrary',
//   title: 'The Seven Valleys',
//   authors: ["Baha'u'llah"],
//   coverUrl: 'https://covers.openlibrary.org/...',
//   publishDate: '1991',
//   subjects: ['Bahai Faith', 'Mysticism']
// }
```

### Find Cover Images

```javascript
// Search for cover image by title/author
const cover = await librarian.findCoverImage(
  'The Hidden Words',
  "Baha'u'llah"
);

// Returns:
// {
//   source: 'openlibrary',
//   url: 'https://covers.openlibrary.org/b/id/...-L.jpg',
//   thumbnailUrl: 'https://covers.openlibrary.org/b/id/...-M.jpg'
// }
```

### Research Books to Add

```javascript
// Get book suggestions for a religion
const research = await librarian.researchBooksToAdd('Buddhism', 'meditation', {
  limit: 10
});

// Returns:
// {
//   suggestions: [
//     { title, author, year, importance, category, availability, priority },
//     ...
//   ],
//   gaps: ['Early Theravada texts', 'Modern scholarly works'],
//   notes: 'Collection strong in Zen, needs more Tibetan texts'
// }
```

### Find Quality Issues

```javascript
// Scan library for documents with issues
const issues = await librarian.findQualityIssues({ limit: 20 });

// Returns documents with:
// - embedding_errors
// - low_paragraph_count
// - missing_author
// - uncategorized_religion
```

### Queue Document for Ingestion

```javascript
// Add document to ingestion queue
const result = await librarian.queueDocument('upload', {
  content: documentText,
  metadata: { title: 'New Document' }
});

// Returns:
// {
//   queueId: 42,
//   analysis: { ... },
//   status: 'awaiting_review'
// }
```

## Integration with Admin Interface

The Librarian agent is exposed via admin API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/librarian/queue` | GET | Get ingestion queue items |
| `/api/librarian/queue` | POST | Add document to queue |
| `/api/librarian/queue/:id/approve` | POST | Approve queued document |
| `/api/librarian/queue/:id/reject` | POST | Reject queued document |
| `/api/librarian/suggestions` | GET | Get librarian suggestions |
| `/api/librarian/suggestions/:id` | PATCH | Update suggestion status |
| `/api/librarian/analyze` | POST | Analyze document |
| `/api/librarian/lookup-isbn` | GET | Look up ISBN metadata |
| `/api/librarian/check-duplicates` | POST | Check for duplicates |
| `/api/librarian/research` | POST | Research books to add |
| `/api/librarian/stats` | GET | Get library statistics |

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `model` | gpt-4o | AI model for analysis |
| `temperature` | 0.3 | Lower temperature for consistent categorization |
| `similarityThreshold` | 0.85 | Minimum similarity for duplicate detection |

## Cloud Storage Integration

The Librarian supports S3-compatible storage (Backblaze B2, Scaleway) for:

- Original document files (PDFs, EPUBs)
- Converted markdown documents
- Cover images and thumbnails

```javascript
// Store original document
await librarian.storeOriginalDocument(
  documentId,
  fileBuffer,
  'book.pdf',
  'application/pdf'
);

// Store and download cover image
await librarian.storeCoverImage(documentId, coverUrl);
```

## Valid Categories

### Collections
- Pilgrim Notes
- Essays
- Tablets
- Administrative
- Prayers
- Translations
- Scripture
- Commentary
- History
- Biography
- General

### Religions
- Baha'i
- Islam
- Christianity
- Judaism
- Buddhism
- Hinduism
- Zoroastrianism
- Sikhism
- Interfaith
- Philosophy
- General

## Future Enhancements

- [ ] Automated OCR text cleanup
- [ ] Multi-language content detection
- [ ] Citation and reference extraction
- [ ] Automated collection expansion recommendations
- [ ] Integration with archive.org and public domain sources
