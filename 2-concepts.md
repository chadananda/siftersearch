# 2. Core Concepts

## Project Overview

SifterSearch is a comprehensive, multi-domain knowledge management system designed to efficiently store, process, and retrieve information from various sources including books, documents, and websites. The platform serves multiple purposes:

1. **Intelligent Content Library**: Building and maintaining high-quality document collections across multiple knowledge domains
2. **Research Tool**: Providing advanced search and retrieval capabilities for scholars and researchers
3. **Knowledge Graph**: Visualizing relationships between topics, authors, and concepts
4. **Agent-Friendly API Platform**: Serving as a backend for AI assistants like SifterChat
5. **Content Improvement Environment**: Providing tools for librarians to enhance and organize information

The system is designed with an emphasis on:
- Content quality and accuracy
- Efficient search and retrieval
- Scalability across knowledge domains
- Comprehensive multilingual support, especially for Arabic/Farsi classical texts
- Cost-effective storage and processing
- Simple backup and restoration
- Collaborative improvement
- Straightforward, maintainable code

## Multi-Library Architecture

The core architectural concept of SifterSearch is the separation of content into distinct "libraries," each representing a specific knowledge domain.

### Domain-Based Separation

Each library:
- Has its own subdomain (e.g., `ocean.siftersearch.com`, `javascript.siftersearch.com`)
- Maintains separate databases, users, and configurations
- Contains its own content, crawled websites, and metadata
- Has library-specific tools and search parameters
- Operates as an isolated instance while sharing core code

This approach allows for:
- Content specialization for different domains
- Customized search algorithms per knowledge area
- Separate user management for different communities
- Independent scaling based on library size and usage
- Isolation of concerns and storage

SuperAdmin users are the only role that spans across libraries, with all other roles being library-specific.

### Library Configuration

Each library has configuration settings defining:
```javascript
{
  // Basic information
  id: "ocean",
  displayName: "Ocean Library",
  description: "Interfaith religious and philosophical texts",
  domain: "ocean.siftersearch.com",

  // Search configuration
  search: {
    defaultLanguage: "en",
    vectorWeight: 0.6,
    bm25Weight: 0.4,
    minScore: 0.65,
    maxResults: 50
  },

  // Content settings
  content: {
    allowedTypes: ["book", "document", "webpage", "video"],
    defaultLicense: "research-only",
    customMetadataFields: [
      {name: "scriptureType", type: "string", options: ["primary", "commentary", "academic"]},
      {name: "religiousTradition", type: "string"},
      {name: "historicalPeriod", type: "string"}
    ]
  },

  // Chat configuration
  chat: {
    botName: "Scholar",
    personality: "helpful, knowledgeable, scholarly",
    defaultPrompt: "I am a research assistant specializing in interfaith studies..."
  }
}
```

## Unicode and Multilingual Support

SifterSearch is designed from the ground up for robust multilingual support:

### Text Processing Principles

1. **UTF-8 Throughout**
   - All text storage uses UTF-8 encoding
   - All processing maintains UTF-8 character integrity
   - Database fields configured for proper Unicode storage

2. **Bidirectional Text Handling**
   - Full RTL support for Arabic, Farsi, Hebrew, etc.
   - Proper bidirectional text markup
   - Directional isolation where needed
   - Mixed-direction content handling

3. **Multilingual Search**
   - Language-specific analyzers
   - Script-aware tokenization
   - Cross-language querying capabilities
   - Transliteration support

4. **Language Detection**
   - Automatic language identification
   - Script detection
   - Dialect differentiation
   - Mixed-language content handling

### Arabic/Farsi Specific Support

Special attention is given to classical Arabic and Farsi texts:
- Semantic segmentation preserving contextual meaning
- Historical linguistic pattern recognition
- Cultural context preservation
- Specialized embedding models
- Expert-verified processing rules

## RAG (Retrieval-Augmented Generation)

SifterSearch implements a sophisticated RAG system to enhance AI capabilities and search relevance.

### Implementation Approach

1. **Content Processing**:
   - Documents are processed into paragraphs (minimum ~200 words)
   - Each paragraph is analyzed for language, topic, and entities
   - Metadata is extracted and associated with content
   - Duplicate content is detected and linked via reference counting

2. **Context Enhancement**:
   - Each paragraph receives AI-generated contextual information
   - This "context layer" provides additional information not explicitly stated
   - Historical context, terminology explanations, and important references are added
   - Implementation uses Anthropic's "Contextual Retrieval" technique

3. **Dual-Index Search**:
   ```javascript
   export const searchContent = async (query, options = {}) => {
     // Get vector embedding for query
     const embedding = await getEmbedding(query);

     // Perform parallel searches
     const [vectorResults, textResults] = await Promise.all([
       searchByVector(embedding, options),
       searchByBM25(query, options)
     ]);

     // Combine and deduplicate results
     return combineSearchResults(
       vectorResults,
       textResults,
       options.vectorWeight ?? 0.6,
       options.textWeight ?? 0.4
     );
   };
   ```

4. **LLM Integration**:
   - Search results formatted for LLM context windows
   - Citation information preserved
   - Context included alongside raw content
   - Response generation guided by retrieved information

### Benefits of this Approach

- Better handling of implicit knowledge and context
- Improved search results, especially for complex queries
- More accurate answers from AI agents using the system
- Enhanced cross-referencing across documents
- Ability to infer relationships not explicitly stated

## Deduplication Strategy

Content deduplication is critical for efficiency and storage optimization, implemented at multiple levels:

### Paragraph-Level Fingerprinting

1. **Generation Process**:
   ```javascript
   export const generateFingerprint = (text) => {
     // Normalize text (whitespace, punctuation, case)
     const normalized = normalizeText(text);

     // Calculate fingerprint hash
     return crypto.createHash('xxhash64')
       .update(normalized, 'utf8')
       .digest('hex');
   };
   ```

2. **Reference Counting**:
   - Instead of storing duplicates, references are tracked
   - Each paragraph stores its sources in a references array
   - Format: `[{docId, parNum, range}, ...]`
   - Statistics maintained for usage patterns

3. **Update Handling**:
   ```javascript
   export const updateParagraph = async (docId, parNum, newText) => {
     const paragraph = await getParagraph(docId, parNum);
     const newFingerprint = generateFingerprint(newText);

     // If multiple references exist, create new paragraph
     if (paragraph.references.length > 1) {
       // Create new paragraph
       const newParagraphId = await createParagraph(newText);

       // Update reference in current document
       await updateDocumentReference(docId, parNum, newParagraphId);

       // Remove reference from old paragraph
       await removeReference(paragraph.id, docId, parNum);
     } else {
       // Direct update if this is the only reference
       await directUpdateParagraph(paragraph.id, newText, newFingerprint);
     }
   };
   ```

### Asset Deduplication

1. **Content-Addressed Storage**:
   - Assets stored by content hash rather than filename
   - Identical files stored only once regardless of source
   - Metadata preserves original filenames and contexts
   - Directory structure: `/assets/{hash_id}/{filename}`

2. **Reference Tracking**:
   ```javascript
   export const storeAsset = async (fileBuffer, originalFilename, metadata = {}) => {
     // Generate content hash
     const contentHash = crypto.createHash('sha256')
       .update(fileBuffer)
       .digest('hex');

     // Check if asset already exists
     const existingAsset = await getAssetByHash(contentHash);
     if (existingAsset) {
       // Add new reference to existing asset
       return addAssetReference(existingAsset.id, metadata);
     }

     // Store new asset
     return createNewAsset(fileBuffer, contentHash, originalFilename, metadata);
   };
   ```

## User Roles and Permissions

SifterSearch implements a comprehensive role-based access control system:

### Role Hierarchy

1. **SuperAdmin**
   - Scope: Cross-library access
   - Responsibilities:
     - Creating and configuring libraries
     - Managing all users across libraries
     - System-wide settings and monitoring
     - Infrastructure management
     - Global analytics review

2. **Librarian**
   - Scope: Library-specific
   - Responsibilities:
     - Adding/removing documents and websites
     - Managing editors
     - Approving significant changes
     - Monitoring library health
     - Setting library policies

3. **Editor**
   - Scope: Content-focused
   - Responsibilities:
     - Adding and editing documents
     - Running improvement tools
     - Tagging and organizing content
     - Quality assessment

4. **AuthUser**
   - Scope: API usage
   - Capabilities:
     - Full search functionality
     - Document access
     - Limited tool usage
     - API access with rate limits

5. **AnonUser**
   - Scope: Basic access
   - Capabilities:
     - Basic search
     - Preview of content
     - Limited API usage

### Permission Implementation

```javascript
export const checkPermission = async (userId, action, resourceType, resourceId = null) => {
  // Get user and role
  const user = await getUser(userId);
  const role = user.role;

  // SuperAdmin override
  if (user.isSuperAdmin) return true;

  // Get permissions matrix
  const permissions = await getPermissionsMatrix(user.libraryId);

  // Check basic role permission
  if (!permissions[role]?.[resourceType]?.[action]) return false;

  // Resource-specific checks if needed
  if (resourceId && needsResourceCheck(action, resourceType)) {
    return checkResourcePermission(userId, role, action, resourceType, resourceId);
  }

  return true;
};
```

## Document Processing Concepts

The document processing pipeline is designed to handle various formats and languages with high accuracy and efficiency.

### Processing Flow

1. **Input Stage**
   - Format detection (PDF, DOCX, TXT, MD, etc.)
   - Initial language identification
   - Structure analysis
   - Quality assessment

2. **Extraction Stage**
   ```javascript
   export const extractContent = async (fileBuffer, fileType, options = {}) => {
     // Select appropriate extractor based on file type
     const extract = extractors[fileType] || extractors.fallback;

     // Run extraction with appropriate options
     const extracted = await extract(fileBuffer, options);

     // Run OCR if needed
     if (options.runOcr && needsOcr(extracted)) {
       return performOcr(fileBuffer, {
         language: extracted.detectedLanguage,
         ...options.ocrOptions
       });
     }

     return extracted;
   };
   ```

3. **Language Processing**
   - Detailed language detection
   - Script identification
   - Special handling for RTL languages
   - AI-powered semantic segmentation for Arabic/Farsi

4. **Content Transformation**
   - Conversion to normalized Markdown
   - Paragraph chunking (minimum ~200 words)
   - Header grouping with content
   - Special handling for non-text elements

5. **Enhancement Stage**
   - Context generation with AI
   - Entity extraction
   - Relationship identification
   - Quality scoring

6. **Indexing Stage**
   ```javascript
   export const indexDocument = async (document) => {
     // Process paragraphs
     const paragraphs = await Promise.all(
       document.paragraphs.map(async (paragraph) => {
         // Generate fingerprint for deduplication
         const fingerprint = generateFingerprint(paragraph.text);

         // Check for existing paragraph
         const existing = await findByFingerprint(fingerprint);
         if (existing) {
           // Add reference to existing paragraph
           return addReferenceToExisting(existing.id, document.id, paragraph.index);
         }

         // Create new paragraph with vector embedding
         const vector = await generateEmbedding(paragraph.text);
         return createNewParagraph(paragraph, fingerprint, vector, document.id);
       })
     );

     // Update document metadata
     return finalizeDocumentIndexing(document, paragraphs);
   };
   ```

## Website Crawling Approach

The website crawling system efficiently discovers, extracts, and processes content from configured websites.

### Crawling Philosophy

1. **Ethical Crawling**
   - Strict robots.txt compliance
   - Respect for crawl-delay directives
   - Conditional GET with ETag/Last-Modified
   - Proper user-agent identification

2. **Efficient Processing**
   ```javascript
   export const processSitemapUrl = async (sitemapUrl, options = {}) => {
     // Get sitemap
     const sitemap = await fetchSitemap(sitemapUrl);

     // Process URLs in parallel with concurrency limit
     return Promise.all(
       sitemap.urls.map(async (urlData) => {
         // Skip if not modified since last crawl
         const lastCrawled = await getLastCrawlDate(urlData.url);
         if (lastCrawled && new Date(urlData.lastmod) <= new Date(lastCrawled)) {
           return { url: urlData.url, status: 'not_modified' };
         }

         // Process URL with appropriate rate limiting
         return processUrl(urlData.url, options);
       })
     );
   };
   ```

3. **Change Detection System**
   - Multi-level detection: HTTP headers → content hash → structural diff
   - Minimal reprocessing of unchanged content
   - Selective paragraph updates
   - Reference management for shared content

4. **YouTube Integration**
   - Channel treated as a "website"
   - Video metadata extraction
   - Transcript fetching and processing
   - Timeline marker preservation
   ```javascript
   export const processYoutubeTranscript = async (transcript, videoId) => {
     // Parse transcript with timing information
     const segments = parseTranscriptWithTimings(transcript);

     // Group by speaker and semantic boundaries
     const paragraphs = createSemanticParagraphs(segments);

     // Store with timing metadata preserved
     return paragraphs.map(paragraph => ({
       ...paragraph,
       metadata: {
         videoId,
         startTime: paragraph.segments[0].start,
         endTime: paragraph.segments[paragraph.segments.length - 1].end,
         speakers: extractSpeakers(paragraph.segments)
       }
     }));
   };
   ```

## Search Methodology

The search system combines multiple approaches for optimal results.

### Hybrid Search Implementation

1. **Combined Search Approach**
   ```javascript
   export const search = async (query, options = {}) => {
     // Detect language and handle potential RTL
     const queryLanguage = detectLanguage(query);
     const isRTL = isRightToLeft(queryLanguage);

     // Get appropriate parameters based on language
     const params = getSearchParams(queryLanguage, isRTL, options);

     // Parallel search execution
     const [vectorResults, textResults] = await Promise.all([
       vectorSearch(query, params),
       textSearch(query, params)
     ]);

     // Smart result combination with appropriate weights
     const combinedResults = combineResults(
       vectorResults,
       textResults,
       params.vectorWeight,
       params.textWeight
     );

     // Apply post-processing and formatting
     return formatResults(combinedResults, {
       highlightRTL: isRTL,
       ...options
     });
   };
   ```

2. **Language-Aware Processing**
   - Script-specific tokenization
   - Language-specific analyzers
   - Bidirectional text handling
   - Cross-language matching capabilities

3. **Result Presentation**
   - Contextually relevant snippets
   - Proper RTL/LTR text rendering
   - Source attribution
   - Confidence scoring

## Chatbot Integration

SifterSearch integrates with two distinct chat interfaces:

### 1. SifterChat (Web Component)

A prebuilt Svelte component that compiles to a web component for embedding on websites:
```javascript
// Example web component usage
<sifter-chat
  name="Scholar"
  avatar="/avatar.png"
  accent-color="#4a90e2"
  greeting="How can I help with your research?"
  library="ocean"
></sifter-chat>
```

Key features:
- Connects to Ultravox.ai for LLM coordination
- Provides voice and text interface
- Accesses SifterSearch API for knowledge retrieval
- Customizable via component attributes
- Tracks usage analytics
- Deployed across multiple websites

### 2. Librarian Chat Console

An admin-focused chat interface for library management:
- Powered by Claude or GPT-4
- Access to all internal tools
- Knowledge graph integration
- Document management capabilities

### Agent-Accessible Tools

Both chat systems have access to agentic tools that follow this pattern:
```javascript
export const toolRegistry = {
  search: {
    name: "search",
    description: "Search the library for information",
    parameters: {
      query: {
        type: "string",
        description: "The search query"
      },
      filters: {
        type: "object",
        description: "Optional filters to apply"
      },
      limit: {
        type: "number",
        description: "Maximum number of results",
        default: 10
      }
    },
    execute: async (params) => await searchContent(params.query, params)
  },

  // Additional tools follow the same pattern
  summarize: { ... },
  extract_entities: { ... },
  analyze_gaps: { ... }
};
```

## Knowledge Graph Visualization

The system includes a visual representation of library content and relationships:

### Implementation

```javascript
export const buildKnowledgeGraph = async (libraryId, options = {}) => {
  // Get nodes (documents, authors, topics)
  const [documents, authors, topics] = await Promise.all([
    getDocumentNodes(libraryId, options),
    getAuthorNodes(libraryId, options),
    getTopicNodes(libraryId, options)
  ]);

  // Build edges (relationships)
  const edges = await buildRelationshipEdges(
    documents, authors, topics, options
  );

  // Create graph structure
  return {
    nodes: [...documents, ...authors, ...topics],
    edges,
    metadata: {
      graphDensity: calculateDensity(edges.length, documents.length),
      centralNodes: findCentralNodes(edges),
      clusters: detectCommunities(edges)
    }
  };
};
```

### Visualization Capabilities

- Interactive D3.js visualization
- Filtering by type, period, importance
- Zooming and exploration capabilities
- Path finding between concepts
- Export for presentations

The knowledge graph serves as both a research tool and a visualization aid for understanding library composition and relationships.