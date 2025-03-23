# 2. Core Concepts

## 1. Overview

SifterSearch is a modern document management and search system built on a simplified architecture with the following core components:

1. **SvelteKit Application**: Provides both the user interface and API endpoints
2. **Manticore Search Engine**: Powers both keyword (BM25) and vector search capabilities
3. **SQLite/Cloudflare D1 Database**: Stores document metadata and application data
4. **Cloudflare R2 Storage**: Manages document files and backups

The system is designed to be deployed as a single Docker container that includes both the SvelteKit application and Manticore search engine.

---

## 2. Architecture Design

### Simplified Architecture

SifterSearch uses a streamlined architecture where:

1. **SvelteKit** handles both UI routes and API endpoints
2. **Manticore Search** provides powerful search capabilities
3. **Drizzle ORM** provides database access with compatibility for both SQLite and Cloudflare D1
4. **Cloudflare R2** provides S3-compatible storage for documents and backups

This approach eliminates the need for a separate backend framework (previously Fastify) and simplifies deployment and maintenance.

### Key Components

```
┌─────────────────────────────────────────────┐
│                Docker Container              │
│                                             │
│  ┌─────────────┐          ┌──────────────┐  │
│  │  SvelteKit  │◄────────►│   Manticore  │  │
│  │  (UI + API) │          │    Search    │  │
│  └─────┬───────┘          └──────────────┘  │
│        │                                    │
└────────┼────────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Cloudflare D1  │     │   Cloudflare    │
│   (Database)    │     │  R2 (Storage)   │
└─────────────────┘     └─────────────────┘
```

---

## 3. Search Technology

SifterSearch leverages Manticore Search for both keyword-based and vector search capabilities:

### BM25 Search

- Traditional keyword-based search using the BM25 algorithm
- Provides fast and accurate results for exact and partial matches
- Supports advanced query syntax including boolean operators, phrase matching, and field-specific searches

### Vector Search

- Uses embeddings to capture semantic meaning of documents
- Allows for natural language queries and similarity search
- Embeddings are generated during document indexing
- Supports hybrid search combining BM25 and vector search results

### Advanced Search Features

1. **Hybrid Search**:
   - Combines BM25 and vector search for optimal results
   - Adjustable weights for keyword vs semantic relevance
   - Role-based filtering ensures appropriate access

2. **Faceted Search**:
   - Filter by document attributes
   - Dynamic facet generation based on metadata
   - Hierarchical facet navigation

3. **Highlighting**:
   - Context-aware highlighting that respects text direction
   - Phrase-based highlighting for better result presentation

### Multilingual Support

- Automatic language detection during document processing
- Support for Arabic, Farsi, English, and other languages
- Manticore's built-in support for multiple languages
- Vector search eliminates the need for language-specific stemming
- Proper handling of RTL text and mixed-direction content

### Language Detection

- Automatic language detection during document processing
- Support for Arabic, Farsi, English, and other languages
- Language-specific processing pipelines
- Proper handling of mixed-language documents

### RTL Support

- Bidirectional text handling throughout the interface
- Proper text alignment based on language
- Correct cursor behavior in text editors
- Font selection optimized for each script

### Multilingual Search

- Manticore's built-in support for multiple languages
- Vector search eliminates the need for language-specific stemming
- Proper handling of RTL text and mixed-direction content
- Language-aware highlighting and snippet generation

### Unicode Handling

- UTF-8 encoding used throughout the system
- Proper handling of combining characters and diacritics
- Normalization of text for consistent search results
- Grapheme-aware string operations

### Translation Support

- Optional machine translation for search queries
- Cross-language search capabilities
- Translation of interface elements
- Language preference settings for users

The multilingual capabilities are integrated at all levels of the application, from document processing to search and display.

### Search Implementation

```js
// src/lib/services/search.js
export async function searchDocuments(query, options = {}) {
  const { filters = {}, limit = 10, offset = 0, useVector = true } = options;
  
  // Determine if this is a vector search query
  const isNaturalLanguageQuery = determineQueryType(query);
  
  if (useVector && isNaturalLanguageQuery) {
    // Generate embedding for the query
    const embedding = await generateEmbedding(query);
    
    // Perform vector search
    return performVectorSearch(embedding, filters, limit, offset);
  } else {
    // Perform BM25 search
    return performBM25Search(query, filters, limit, offset);
  }
}
```

---

## 4. Document Processing

SifterSearch processes documents through several stages:

### 1. Document Upload

- Documents are uploaded through the UI or API
- Original files are stored in Cloudflare R2
- Supported formats include PDF, DOCX, TXT, HTML, and more

### 2. Text Extraction

- Text is extracted from documents using appropriate libraries:
  - PDF: pdf-parse or pdf.js
  - DOCX: mammoth.js
  - Images with text: tesseract.js for OCR

### 3. Content Processing

- Text is cleaned and normalized
- Documents are split into chunks for better search results
- Metadata is extracted (title, author, date, etc.)

### 4. Indexing

- Text and metadata are stored in the database
- Documents are indexed in Manticore for search
- Embeddings are generated for vector search
- Manticore stores documents directly to Cloudflare R2 for efficient retrieval

### Document Indexing Process

- Documents are broken into blocks during indexing
- Each block is processed for both keyword and semantic search
- Phrases are extracted for highlighting
- Vector embeddings are calculated during indexing - no need to store them separately

### Processing Pipeline

```js
// src/lib/services/document_processing.js
export async function processDocument(file, metadata = {}) {
  // 1. Store original file
  const fileKey = await uploadToStorage(file);
  
  // 2. Extract text based on file type
  const text = await extractText(file);
  
  // 3. Process content
  const { chunks, extractedMetadata } = await processContent(text);
  
  // 4. Store document metadata
  const docId = await storeDocumentMetadata({
    ...metadata,
    ...extractedMetadata,
    fileKey,
  });
  
  // 5. Index document chunks
  await indexDocumentChunks(docId, chunks);
  
  return { docId, chunks: chunks.length };
}
```

---

## 5. User Management

SifterSearch uses Clerk for authentication and role-based access control:

### User Roles

1. **SuperUser**: Full system access, can manage all libraries and users
2. **Librarian**: Can manage content and users within assigned libraries
3. **Editor**: Can edit and upload content but cannot manage users
4. **AuthUser**: Can view content and use search features
5. **AnonUser**: Limited access to public content only

### Authentication and Authorization

- Clerk provides user authentication and JWT tokens
- API keys for programmatic access
- Role-based access control for different user levels
- Authentication implemented at the application level using SvelteKit hooks

### Security Implementation

```js
// src/hooks.server.js
import { sequence } from '@sveltejs/kit/hooks';
import { clerkClient, getAuth } from '@clerk/svelte-kit';

async function authHook({ event, resolve }) {
  // Check for API key in header
  const apiKey = event.request.headers.get('x-api-key');
  if (apiKey) {
    const validApiKey = await validateApiKey(apiKey);
    if (validApiKey) {
      event.locals.user = validApiKey.user;
      event.locals.role = validApiKey.role;
      return resolve(event);
    }
  }
  
  // Check for Clerk session
  const { userId } = getAuth(event.request);
  if (userId) {
    const user = await clerkClient.users.getUser(userId);
    event.locals.user = user;
    event.locals.role = determineUserRole(user);
  } else {
    event.locals.role = 'AnonUser';
  }
  
  return resolve(event);
}
```

### Role-Based Access Control

```js
// src/lib/services/user_management.js
export function hasPermission(user, permission) {
  if (!user) return false;
  
  const rolePermissions = {
    superuser: ['*'],
    librarian: [
      'content:*',
      'users:view',
      'users:edit',
      'tools:*',
      'analytics:view'
    ],
    editor: [
      'content:view',
      'content:edit',
      'content:create',
      'tools:search',
      'tools:analyze'
    ],
    authuser: [
      'content:view',
      'tools:search'
    ]
  };
  
  const userRole = user.role || 'authuser';
  const permissions = rolePermissions[userRole] || [];
  
  // Check for wildcard permission
  if (permissions.includes('*')) return true;
  
  // Check for category wildcard (e.g., content:*)
  const category = permission.split(':')[0];
  if (permissions.includes(`${category}:*`)) return true;
  
  // Check for specific permission
  return permissions.includes(permission);
}
```

---

## 6. API Design

SifterSearch provides a comprehensive API through SvelteKit API routes:

### API Categories

1. **Content API**: Document management and editing
2. **Search API**: Search functionality with various options
3. **User API**: User management and authentication
4. **Tools API**: Agentic tools for AI-assisted tasks
5. **Chat API**: Conversational interface for document interaction

### API Implementation

API routes are implemented as SvelteKit server endpoints:

```js
// src/routes/api/content/[id]/+server.js
export async function GET({ params, locals }) {
  const { id } = params;
  const user = locals.user;
  
  // Check permissions
  if (!hasPermission(user, 'content:view')) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Retrieve document
  const document = await getDocument(id);
  
  if (!document) {
    return new Response(JSON.stringify({ error: 'Document not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify(document), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

---

## 7. Agentic Tools

SifterSearch includes a set of agentic tools that leverage AI to enhance document management and search:

### Tool Categories

1. **Search Tools**: Enhanced search with context and summarization
2. **Content Tools**: AI-assisted document creation and editing
3. **Analysis Tools**: Document analysis and insights
4. **Chat Tools**: Conversational interfaces for document interaction

### Tool Implementation

```js
// src/lib/tools/registry.js
export const toolRegistry = {
  search: {
    name: 'search',
    description: 'Search documents with natural language queries',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      filters: { type: 'object', description: 'Optional filters' },
      limit: { type: 'number', description: 'Result limit' }
    },
    execute: async (params, userId) => {
      const results = await searchDocuments(params.query, {
        filters: params.filters,
        limit: params.limit || 10
      });
      
      return { results };
    }
  },
  
  summarize: {
    name: 'summarize',
    description: 'Generate a summary of a document',
    parameters: {
      documentId: { type: 'string', description: 'Document ID' }
    },
    execute: async (params, userId) => {
      const document = await getDocument(params.documentId);
      const summary = await generateSummary(document.content);
      
      return { summary };
    }
  },
  
  // Additional tools...
};
```

---

## 8. Deployment

SifterSearch is designed for simple deployment using Docker and Cloudflare:

### Docker Deployment

- Single Docker container with both SvelteKit and Manticore
- Configured for easy scaling and management
- Includes health checks and monitoring

### Cloudflare Integration

- Cloudflare D1 for database (production)
- Cloudflare R2 for document storage
- Cloudflare for DNS and CDN

### Local Development

- Docker Compose for local development environment
- SQLite for local database
- Hot reloading for rapid development

---

## 9. Summary

SifterSearch's core concepts revolve around:

1. **Simplified Architecture**: SvelteKit for both UI and API, Manticore for search
2. **Powerful Search**: Combined BM25 and vector search capabilities
3. **Document Processing**: Comprehensive pipeline for document handling
4. **User Management**: Role-based access control with Clerk
5. **API Design**: Clean, consistent API through SvelteKit routes
6. **Agentic Tools**: AI-powered tools for enhanced functionality
7. **Easy Deployment**: Docker-based deployment with Cloudflare integration

This architecture provides a powerful, flexible, and maintainable system for document management and search.