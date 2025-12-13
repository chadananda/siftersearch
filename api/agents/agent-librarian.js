/**
 * Librarian Agent
 *
 * Library management agent responsible for:
 * - Document ingestion and conversion
 * - ISBN and cover image lookup
 * - Duplicate detection via Meilisearch
 * - Collection categorization suggestions
 * - Quality issue detection and cleanup recommendations
 * - Library research and discovery (finding books to add)
 *
 * Architecture:
 * - Uses BaseAgent for AI interactions
 * - Integrates with Meilisearch for duplicate detection
 * - Uses external APIs (OpenLibrary, Google Books) for metadata
 * - Maintains a queue of suggestions for admin review
 */

import { BaseAgent } from './base-agent.js';
import { query, queryOne, queryAll } from '../lib/db.js';
import { getMeili, INDEXES, hybridSearch } from '../lib/search.js';
import { ai } from '../lib/ai.js';
import { config } from '../lib/config.js';
import { hashContent, parseDocument, ingestDocument } from '../services/ingester.js';
import * as storage from '../lib/storage.js';
import matter from 'gray-matter';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

// Valid collections in our library
const VALID_COLLECTIONS = [
  'Pilgrim Notes',
  'Essays',
  'Tablets',
  'Administrative',
  'Prayers',
  'Translations',
  'Scripture',
  'Commentary',
  'History',
  'Biography',
  'General'
];

// Religion categories
const VALID_RELIGIONS = [
  'Baha\'i',
  'Islam',
  'Christianity',
  'Judaism',
  'Buddhism',
  'Hinduism',
  'Zoroastrianism',
  'Sikhism',
  'Interfaith',
  'Philosophy',
  'General'
];

export class LibrarianAgent extends BaseAgent {
  constructor(options = {}) {
    super('librarian', {
      model: options.model || config.ai.chat.model || 'gpt-4o',
      temperature: 0.3,
      maxTokens: 2000,
      systemPrompt: `You are the Librarian for an interfaith spiritual library called SifterSearch.
Your expertise spans religious texts, spiritual literature, and library science.

Your responsibilities:
1. Analyze documents for proper categorization (religion, collection, language)
2. Detect quality issues (OCR errors, formatting problems, incomplete texts)
3. Identify potential duplicates by comparing content similarity
4. Suggest metadata improvements (titles, authors, dates)
5. Research and recommend books to expand the library's collection

When analyzing documents:
- Be precise about religious tradition attribution
- Consider historical context and authorship
- Note translation quality and source reliability
- Flag any content integrity concerns

Always provide structured, actionable recommendations.`,
      ...options
    });

    this.similarityThreshold = options.similarityThreshold || 0.85;
  }

  /**
   * Analyze a document for ingestion
   * Returns metadata suggestions, quality assessment, and duplicate check
   */
  async analyzeDocument(text, providedMetadata = {}) {
    this.logger.info({
      textLength: text.length,
      hasMetadata: Object.keys(providedMetadata).length > 0
    }, 'Analyzing document for ingestion');

    const startTime = Date.now();

    // Parse frontmatter if present
    let content = text;
    let frontmatter = {};
    try {
      const parsed = matter(text);
      content = parsed.content;
      frontmatter = parsed.data || {};
    } catch {
      // No valid frontmatter, use full text
    }

    // Merge provided metadata with frontmatter
    const metadata = { ...frontmatter, ...providedMetadata };

    // Run analysis tasks in parallel
    const [
      suggestedMetadata,
      qualityAssessment,
      duplicateCheck
    ] = await Promise.all([
      this.suggestMetadata(content, metadata),
      this.assessQuality(content),
      this.checkDuplicates(content, metadata.title)
    ]);

    const duration = Date.now() - startTime;
    this.logger.info({ duration }, 'Document analysis complete');

    return {
      content,
      originalMetadata: metadata,
      suggestedMetadata,
      qualityAssessment,
      duplicateCheck,
      recommendation: this.generateRecommendation(suggestedMetadata, qualityAssessment, duplicateCheck)
    };
  }

  /**
   * Use AI to suggest metadata for a document
   */
  async suggestMetadata(content, existingMetadata = {}) {
    const excerpt = content.substring(0, 3000);

    try {
      const response = await this.chat([
        {
          role: 'user',
          content: `Analyze this document excerpt and suggest appropriate metadata.

EXISTING METADATA:
${JSON.stringify(existingMetadata, null, 2)}

DOCUMENT EXCERPT:
${excerpt}

Provide a JSON response with:
{
  "title": "suggested title if missing or could be improved",
  "author": "author name if detectable",
  "religion": "one of: ${VALID_RELIGIONS.join(', ')}",
  "collection": "one of: ${VALID_COLLECTIONS.join(', ')}",
  "language": "ISO language code (en, fa, ar, etc.)",
  "year": "publication/composition year if detectable, null if unknown",
  "description": "brief 1-2 sentence description",
  "confidence": {
    "title": 0.0-1.0,
    "author": 0.0-1.0,
    "religion": 0.0-1.0,
    "collection": 0.0-1.0
  },
  "notes": "any observations about the document"
}`
        }
      ], { maxTokens: 1000 });

      return this.parseJSON(response.content);
    } catch (err) {
      this.logger.error({ err }, 'Failed to suggest metadata');
      return {
        title: existingMetadata.title || 'Unknown',
        religion: 'General',
        collection: 'General',
        language: 'en',
        confidence: { title: 0, author: 0, religion: 0, collection: 0 },
        notes: 'Metadata suggestion failed, using defaults'
      };
    }
  }

  /**
   * Assess document quality (OCR errors, formatting, completeness)
   */
  async assessQuality(content) {
    const excerpt = content.substring(0, 2000);

    // Quick heuristic checks
    const issues = [];

    // Check for OCR artifacts
    const ocrPatterns = /[|]{2,}|[0]{2,}O|O{2,}0|\d{5,}|\[\?\]|\(\?\)/g;
    const ocrMatches = content.match(ocrPatterns);
    if (ocrMatches && ocrMatches.length > 5) {
      issues.push({ type: 'ocr_errors', severity: 'medium', count: ocrMatches.length });
    }

    // Check for broken words (common in bad OCR)
    const brokenWords = content.match(/\b\w-\s+\w/g);
    if (brokenWords && brokenWords.length > 10) {
      issues.push({ type: 'broken_words', severity: 'medium', count: brokenWords.length });
    }

    // Check for excessive whitespace
    const excessiveWhitespace = content.match(/\n{4,}|\s{10,}/g);
    if (excessiveWhitespace && excessiveWhitespace.length > 5) {
      issues.push({ type: 'formatting', severity: 'low', count: excessiveWhitespace.length });
    }

    // Check for very short content
    if (content.length < 500) {
      issues.push({ type: 'incomplete', severity: 'high', note: 'Document appears incomplete' });
    }

    // Use AI for deeper analysis if heuristics found issues
    let aiAssessment = null;
    if (issues.length > 0) {
      try {
        const response = await this.chat([
          {
            role: 'user',
            content: `Assess the quality of this document excerpt. Look for:
- OCR errors or scanning artifacts
- Missing or corrupted text
- Formatting problems
- Translation quality issues
- Incomplete or truncated content

EXCERPT:
${excerpt}

Respond with JSON:
{
  "overallQuality": "good|acceptable|poor",
  "issues": [{"type": "string", "description": "string", "severity": "high|medium|low"}],
  "canBeFixed": true/false,
  "fixSuggestions": ["suggestion1", "suggestion2"]
}`
          }
        ], { maxTokens: 500 });

        aiAssessment = this.parseJSON(response.content);
      } catch {
        // Use heuristic results only
      }
    }

    return {
      heuristicIssues: issues,
      aiAssessment,
      overallQuality: issues.length === 0 ? 'good' :
        issues.some(i => i.severity === 'high') ? 'poor' : 'acceptable',
      needsReview: issues.some(i => i.severity === 'high')
    };
  }

  /**
   * Check for duplicate content in the library using Meilisearch
   */
  async checkDuplicates(content, title = '') {
    // Extract representative sentences for comparison
    const sentences = content
      .split(/[.!?]\s+/)
      .filter(s => s.length > 50 && s.length < 300)
      .slice(0, 5);

    if (sentences.length === 0) {
      return { hasDuplicates: false, matches: [] };
    }

    const matches = [];

    // Search for each sentence
    for (const sentence of sentences) {
      try {
        const results = await hybridSearch(sentence, {
          limit: 3,
          semanticRatio: 0.8, // Favor semantic matching
          attributesToRetrieve: ['document_id', 'title', 'author', 'text', 'paragraph_index']
        });

        for (const hit of results.hits || []) {
          // Calculate text similarity
          const similarity = this.textSimilarity(sentence, hit.text);
          if (similarity > this.similarityThreshold) {
            matches.push({
              documentId: hit.document_id,
              title: hit.title,
              author: hit.author,
              matchedText: hit.text.substring(0, 200),
              similarity,
              paragraphIndex: hit.paragraph_index
            });
          }
        }
      } catch (err) {
        this.logger.warn({ err, sentence: sentence.substring(0, 50) }, 'Duplicate search failed');
      }
    }

    // Deduplicate by document_id
    const uniqueMatches = [];
    const seenDocs = new Set();
    for (const match of matches.sort((a, b) => b.similarity - a.similarity)) {
      if (!seenDocs.has(match.documentId)) {
        seenDocs.add(match.documentId);
        uniqueMatches.push(match);
      }
    }

    return {
      hasDuplicates: uniqueMatches.length > 0,
      matches: uniqueMatches.slice(0, 5),
      duplicateType: uniqueMatches.length > 0
        ? (uniqueMatches[0].similarity > 0.95 ? 'exact' : 'similar')
        : null
    };
  }

  /**
   * Calculate text similarity using Jaccard index
   */
  textSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Generate ingestion recommendation based on analysis
   */
  generateRecommendation(metadata, quality, duplicates) {
    if (duplicates.hasDuplicates && duplicates.duplicateType === 'exact') {
      return {
        action: 'reject',
        reason: 'Exact duplicate already exists in library',
        duplicateOf: duplicates.matches[0]
      };
    }

    if (quality.overallQuality === 'poor') {
      return {
        action: 'review',
        reason: 'Document has significant quality issues',
        issues: quality.heuristicIssues
      };
    }

    if (duplicates.hasDuplicates && duplicates.duplicateType === 'similar') {
      return {
        action: 'review',
        reason: 'Similar content already exists - may be different translation or edition',
        similarTo: duplicates.matches
      };
    }

    if (metadata.confidence?.religion < 0.5 || metadata.confidence?.collection < 0.5) {
      return {
        action: 'review',
        reason: 'Low confidence in categorization - needs manual review',
        suggestedMetadata: metadata
      };
    }

    return {
      action: 'approve',
      reason: 'Document appears suitable for ingestion',
      suggestedMetadata: metadata
    };
  }

  /**
   * Look up book metadata by ISBN using OpenLibrary API
   */
  async lookupISBN(isbn) {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');

    try {
      const response = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`
      );

      if (!response.ok) {
        throw new Error(`OpenLibrary API error: ${response.status}`);
      }

      const data = await response.json();
      const book = data[`ISBN:${cleanIsbn}`];

      if (!book) {
        // Try Google Books as fallback
        return this.lookupGoogleBooks(cleanIsbn);
      }

      return {
        source: 'openlibrary',
        title: book.title,
        authors: book.authors?.map(a => a.name) || [],
        publishers: book.publishers?.map(p => p.name) || [],
        publishDate: book.publish_date,
        subjects: book.subjects?.map(s => s.name) || [],
        coverUrl: book.cover?.large || book.cover?.medium || book.cover?.small,
        isbn: cleanIsbn,
        numberOfPages: book.number_of_pages
      };
    } catch (err) {
      this.logger.error({ err, isbn }, 'ISBN lookup failed');
      return null;
    }
  }

  /**
   * Fallback ISBN lookup using Google Books API
   */
  async lookupGoogleBooks(isbn) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
      );

      if (!response.ok) {
        throw new Error(`Google Books API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        return null;
      }

      const book = data.items[0].volumeInfo;

      return {
        source: 'googlebooks',
        title: book.title,
        authors: book.authors || [],
        publishers: [book.publisher].filter(Boolean),
        publishDate: book.publishedDate,
        subjects: book.categories || [],
        coverUrl: book.imageLinks?.thumbnail?.replace('http:', 'https:'),
        isbn,
        numberOfPages: book.pageCount,
        description: book.description
      };
    } catch (err) {
      this.logger.error({ err, isbn }, 'Google Books lookup failed');
      return null;
    }
  }

  /**
   * Search for cover images for a document
   */
  async findCoverImage(title, author = '') {
    const query = `${title} ${author}`.trim();

    // Try OpenLibrary first
    try {
      const response = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`
      );

      if (response.ok) {
        const data = await response.json();
        for (const doc of data.docs || []) {
          if (doc.cover_i) {
            return {
              source: 'openlibrary',
              url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
              thumbnailUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
            };
          }
        }
      }
    } catch (err) {
      this.logger.warn({ err }, 'OpenLibrary cover search failed');
    }

    // Fallback to Google Books
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`
      );

      if (response.ok) {
        const data = await response.json();
        for (const item of data.items || []) {
          const images = item.volumeInfo?.imageLinks;
          if (images?.thumbnail) {
            return {
              source: 'googlebooks',
              url: images.large || images.medium || images.thumbnail,
              thumbnailUrl: images.thumbnail
            };
          }
        }
      }
    } catch (err) {
      this.logger.warn({ err }, 'Google Books cover search failed');
    }

    return null;
  }

  /**
   * Suggest collection placement for a document
   */
  async suggestCollection(content, metadata = {}) {
    const excerpt = content.substring(0, 2000);

    try {
      const response = await this.chat([
        {
          role: 'user',
          content: `Based on this document, suggest the most appropriate collection category.

METADATA:
${JSON.stringify(metadata, null, 2)}

CONTENT EXCERPT:
${excerpt}

Choose from these collections:
${VALID_COLLECTIONS.map(c => `- ${c}`).join('\n')}

Respond with JSON:
{
  "primaryCollection": "collection name",
  "secondaryCollection": "alternative if applicable, null otherwise",
  "reasoning": "brief explanation",
  "confidence": 0.0-1.0
}`
        }
      ], { maxTokens: 300 });

      return this.parseJSON(response.content);
    } catch (err) {
      this.logger.error({ err }, 'Collection suggestion failed');
      return {
        primaryCollection: 'General',
        secondaryCollection: null,
        reasoning: 'Failed to analyze - defaulting to General',
        confidence: 0
      };
    }
  }

  /**
   * Find documents with quality issues in the library
   */
  async findQualityIssues(options = {}) {
    const { limit = 20, minParagraphs = 1 } = options;

    try {
      // Find documents with potential issues
      const documents = await queryAll(`
        SELECT
          d.id, d.title, d.author, d.religion, d.collection,
          d.paragraph_count, d.created_at,
          (SELECT COUNT(*) FROM indexed_paragraphs p
           WHERE p.document_id = d.id AND p.embedding_error IS NOT NULL) as error_count
        FROM indexed_documents d
        WHERE d.paragraph_count >= ?
        ORDER BY error_count DESC, d.created_at DESC
        LIMIT ?
      `, [minParagraphs, limit * 2]);

      const issues = [];

      for (const doc of documents) {
        const docIssues = [];

        // Check for embedding errors
        if (doc.error_count > 0) {
          docIssues.push({
            type: 'embedding_errors',
            severity: doc.error_count > 5 ? 'high' : 'medium',
            count: doc.error_count
          });
        }

        // Check for very few paragraphs (might be incomplete)
        if (doc.paragraph_count < 3) {
          docIssues.push({
            type: 'low_paragraph_count',
            severity: 'medium',
            count: doc.paragraph_count
          });
        }

        // Check for missing metadata
        if (!doc.author || doc.author === 'Unknown') {
          docIssues.push({ type: 'missing_author', severity: 'low' });
        }

        if (!doc.religion || doc.religion === 'General') {
          docIssues.push({ type: 'uncategorized_religion', severity: 'low' });
        }

        if (docIssues.length > 0) {
          issues.push({
            documentId: doc.id,
            title: doc.title,
            author: doc.author,
            religion: doc.religion,
            collection: doc.collection,
            paragraphCount: doc.paragraph_count,
            issues: docIssues,
            severity: docIssues.some(i => i.severity === 'high') ? 'high' :
              docIssues.some(i => i.severity === 'medium') ? 'medium' : 'low'
          });
        }

        if (issues.length >= limit) break;
      }

      return issues.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
    } catch (err) {
      this.logger.error({ err }, 'Failed to find quality issues');
      return [];
    }
  }

  /**
   * Research books to add to the library for a specific religion/topic
   */
  async researchBooksToAdd(religion, topic = '', options = {}) {
    const { limit = 10 } = options;

    this.logger.info({ religion, topic }, 'Researching books to add');

    try {
      // Get current library stats for this religion
      const currentBooks = await queryAll(`
        SELECT DISTINCT title, author
        FROM indexed_documents
        WHERE religion = ?
        LIMIT 100
      `, [religion]);

      const currentTitles = currentBooks.map(b => b.title).join('\n- ');

      const response = await this.chat([
        {
          role: 'user',
          content: `You are helping build an interfaith spiritual library. Research and suggest books to add.

RELIGION/TRADITION: ${religion}
${topic ? `SPECIFIC TOPIC: ${topic}` : ''}

BOOKS ALREADY IN LIBRARY:
${currentTitles ? `- ${currentTitles}` : '(none yet)'}

Suggest ${limit} important books that should be in a comprehensive ${religion} collection.
Focus on:
- Foundational scriptures and texts
- Key commentaries and interpretations
- Influential historical works
- Well-regarded translations
- Important scholarly works

Respond with JSON:
{
  "suggestions": [
    {
      "title": "book title",
      "author": "author name",
      "year": "publication year or era",
      "importance": "why this book is essential",
      "category": "scripture|commentary|history|theology|biography|prayers",
      "availability": "public_domain|copyrighted|unknown",
      "priority": "high|medium|low"
    }
  ],
  "gaps": ["areas where the library needs more coverage"],
  "notes": "any additional observations"
}`
        }
      ], { maxTokens: 2000 });

      return this.parseJSON(response.content);
    } catch (err) {
      this.logger.error({ err, religion, topic }, 'Book research failed');
      return { suggestions: [], gaps: [], notes: 'Research failed' };
    }
  }

  /**
   * Get library statistics by religion/collection
   */
  async getLibraryStats() {
    try {
      const religionStats = await queryAll(`
        SELECT religion, COUNT(*) as document_count,
               SUM(paragraph_count) as total_paragraphs
        FROM indexed_documents
        GROUP BY religion
        ORDER BY document_count DESC
      `);

      const collectionStats = await queryAll(`
        SELECT collection, COUNT(*) as document_count
        FROM indexed_documents
        GROUP BY collection
        ORDER BY document_count DESC
      `);

      const totals = await queryOne(`
        SELECT
          COUNT(*) as total_documents,
          SUM(paragraph_count) as total_paragraphs,
          COUNT(DISTINCT author) as unique_authors
        FROM indexed_documents
      `);

      return {
        totals,
        byReligion: religionStats,
        byCollection: collectionStats
      };
    } catch (err) {
      this.logger.error({ err }, 'Failed to get library stats');
      return null;
    }
  }

  /**
   * Create an ingestion suggestion for admin review
   */
  async createSuggestion(type, data, priority = 'medium') {
    try {
      const result = await query(`
        INSERT INTO librarian_suggestions
        (type, data, priority, status, created_at)
        VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
        RETURNING id
      `, [type, JSON.stringify(data), priority]);

      this.logger.info({
        suggestionId: result.lastInsertRowid,
        type,
        priority
      }, 'Created librarian suggestion');

      return result.lastInsertRowid;
    } catch (err) {
      this.logger.error({ err, type }, 'Failed to create suggestion');
      return null;
    }
  }

  /**
   * Get pending suggestions for admin review
   */
  async getPendingSuggestions(options = {}) {
    const { type, limit = 20 } = options;

    try {
      let sql = `
        SELECT id, type, data, priority, status, created_at
        FROM librarian_suggestions
        WHERE status = 'pending'
      `;
      const params = [];

      if (type) {
        sql += ' AND type = ?';
        params.push(type);
      }

      sql += ' ORDER BY priority DESC, created_at DESC LIMIT ?';
      params.push(limit);

      const suggestions = await queryAll(sql, params);

      return suggestions.map(s => ({
        ...s,
        data: JSON.parse(s.data)
      }));
    } catch (err) {
      this.logger.error({ err }, 'Failed to get suggestions');
      return [];
    }
  }

  /**
   * Update suggestion status (approve/reject)
   */
  async updateSuggestion(id, status, adminNotes = '') {
    try {
      await query(`
        UPDATE librarian_suggestions
        SET status = ?, admin_notes = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [status, adminNotes, id]);

      this.logger.info({ id, status }, 'Updated suggestion status');
      return true;
    } catch (err) {
      this.logger.error({ err, id }, 'Failed to update suggestion');
      return false;
    }
  }

  // ============================================
  // Storage and Library Integration
  // ============================================

  /**
   * Store document original (PDF, etc.) in cloud storage
   */
  async storeOriginalDocument(documentId, fileBuffer, filename, contentType) {
    if (!storage.hasCloudStorage()) {
      this.logger.warn('Cloud storage not available, skipping original storage');
      return null;
    }

    try {
      const key = storage.generateDocumentKey(documentId, 'original', filename);
      const result = await storage.uploadFile(key, fileBuffer, { contentType });

      // Record in document_assets table
      await query(`
        INSERT INTO document_assets
        (document_id, asset_type, storage_key, storage_url, file_name, file_size, content_type, content_hash, created_at)
        VALUES (?, 'original', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [documentId, key, result.url, filename, fileBuffer.length, contentType, storage.hashContent(fileBuffer)]);

      this.logger.info({ documentId, key, size: fileBuffer.length }, 'Stored original document');
      return result;
    } catch (err) {
      this.logger.error({ err, documentId, filename }, 'Failed to store original document');
      return null;
    }
  }

  /**
   * Store converted markdown in cloud storage and optionally in library path
   */
  async storeConvertedDocument(documentId, markdownContent, metadata = {}, libraryPath = null) {
    const results = { cloud: null, local: null };

    // Store in cloud storage if available
    if (storage.hasCloudStorage()) {
      try {
        const key = storage.generateDocumentKey(documentId, 'converted', 'document.md');
        results.cloud = await storage.uploadFile(key, Buffer.from(markdownContent, 'utf-8'), {
          contentType: 'text/markdown',
          metadata: {
            title: metadata.title || '',
            author: metadata.author || '',
            religion: metadata.religion || ''
          }
        });

        // Record in document_assets table
        await query(`
          INSERT INTO document_assets
          (document_id, asset_type, storage_key, storage_url, file_name, content_type, created_at)
          VALUES (?, 'converted', ?, ?, 'document.md', 'text/markdown', CURRENT_TIMESTAMP)
        `, [documentId, key, results.cloud.url]);
      } catch (err) {
        this.logger.error({ err, documentId }, 'Failed to store converted document in cloud');
      }
    }

    // Store in local library path if specified
    if (libraryPath) {
      try {
        // Add frontmatter to markdown
        const frontmatter = matter.stringify(markdownContent, metadata);
        const fullPath = join(process.cwd(), libraryPath);

        // Ensure directory exists
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, frontmatter, 'utf-8');

        // Update document record with source file
        await query(`
          UPDATE indexed_documents SET source_file = ? WHERE id = ?
        `, [libraryPath, documentId]);

        results.local = { path: libraryPath };
        this.logger.info({ documentId, libraryPath }, 'Stored converted document locally');
      } catch (err) {
        this.logger.error({ err, documentId, libraryPath }, 'Failed to store converted document locally');
      }
    }

    return results;
  }

  /**
   * Download and store cover image
   */
  async storeCoverImage(documentId, imageUrl) {
    if (!storage.hasCloudStorage()) {
      // Just update the cover_url directly
      await query(`UPDATE indexed_documents SET cover_url = ? WHERE id = ?`, [imageUrl, documentId]);
      return { url: imageUrl, stored: false };
    }

    try {
      // Determine file extension from URL
      const ext = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
      const key = storage.generateDocumentKey(documentId, 'cover', `cover.${ext}`);

      const result = await storage.uploadImageFromUrl(imageUrl, key);

      // Update document with stored cover URL
      await query(`UPDATE indexed_documents SET cover_url = ? WHERE id = ?`, [result.url, documentId]);

      // Record in document_assets
      await query(`
        INSERT INTO document_assets
        (document_id, asset_type, storage_key, storage_url, content_type, created_at)
        VALUES (?, 'cover', ?, ?, ?, CURRENT_TIMESTAMP)
      `, [documentId, key, result.url, result.contentType]);

      this.logger.info({ documentId, originalUrl: imageUrl, storedUrl: result.url }, 'Stored cover image');
      return { url: result.url, stored: true };
    } catch (err) {
      this.logger.error({ err, documentId, imageUrl }, 'Failed to store cover image');
      // Fall back to using the original URL
      await query(`UPDATE indexed_documents SET cover_url = ? WHERE id = ?`, [imageUrl, documentId]);
      return { url: imageUrl, stored: false };
    }
  }

  /**
   * Generate library path for a document based on metadata
   */
  generateLibraryPath(metadata) {
    const { religion = 'General', collection = 'General', author = 'Unknown', title = 'Untitled' } = metadata;

    // Sanitize path components
    const sanitize = (str) => str
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50)
      .toLowerCase();

    const religionDir = sanitize(religion);
    const collectionDir = sanitize(collection);
    const authorDir = sanitize(author);
    const filename = sanitize(title) + '.md';

    return `library/${religionDir}/${collectionDir}/${authorDir}/${filename}`;
  }

  /**
   * Process and ingest an approved document
   */
  async processApprovedDocument(queueItemId) {
    const queueItem = await queryOne(`
      SELECT * FROM ingestion_queue WHERE id = ? AND status = 'approved'
    `, [queueItemId]);

    if (!queueItem) {
      throw new Error('Queue item not found or not approved');
    }

    try {
      await query(`UPDATE ingestion_queue SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [queueItemId]);

      const sourceData = JSON.parse(queueItem.source_data);
      const suggestedMetadata = JSON.parse(queueItem.suggested_metadata || '{}');

      // Read content based on source type
      let content;
      if (sourceData.content) {
        content = sourceData.content;
      } else if (sourceData.filePath) {
        content = await readFile(sourceData.filePath, 'utf-8');
      } else {
        throw new Error('No content source available');
      }

      // Generate library path
      const libraryPath = queueItem.target_path || this.generateLibraryPath(suggestedMetadata);

      // Ingest the document
      const result = await ingestDocument(content, suggestedMetadata, libraryPath);

      if (!result.documentId) {
        throw new Error('Ingestion failed - no document ID returned');
      }

      // Store the converted markdown
      await this.storeConvertedDocument(result.documentId, content, suggestedMetadata, libraryPath);

      // Try to find and store a cover image
      if (suggestedMetadata.title) {
        const cover = await this.findCoverImage(suggestedMetadata.title, suggestedMetadata.author);
        if (cover) {
          await this.storeCoverImage(result.documentId, cover.url);
        }
      }

      // Update queue item
      await query(`
        UPDATE ingestion_queue
        SET status = 'completed', target_document_id = ?, target_path = ?, processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [result.documentId, libraryPath, queueItemId]);

      this.logger.info({ queueItemId, documentId: result.documentId, libraryPath }, 'Document processed successfully');
      return result;
    } catch (err) {
      await query(`
        UPDATE ingestion_queue
        SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [err.message, queueItemId]);

      this.logger.error({ err, queueItemId }, 'Document processing failed');
      throw err;
    }
  }

  /**
   * Add a document to the ingestion queue
   */
  async queueDocument(sourceType, sourceData, options = {}) {
    const { createdBy } = options;

    try {
      // Analyze the document first
      let content = sourceData.content;
      if (sourceData.filePath && !content) {
        content = await readFile(sourceData.filePath, 'utf-8');
      }

      const analysis = content ? await this.analyzeDocument(content, sourceData.metadata || {}) : null;

      const result = await query(`
        INSERT INTO ingestion_queue
        (source_type, source_data, analysis_result, suggested_metadata, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        sourceType,
        JSON.stringify(sourceData),
        analysis ? JSON.stringify(analysis) : null,
        analysis ? JSON.stringify(analysis.suggestedMetadata) : null,
        analysis?.recommendation?.action === 'reject' ? 'rejected' : 'awaiting_review',
        createdBy || null
      ]);

      const queueId = result.lastInsertRowid;
      this.logger.info({ queueId, sourceType, status: analysis?.recommendation?.action }, 'Document queued');

      return {
        queueId,
        analysis,
        status: analysis?.recommendation?.action === 'reject' ? 'rejected' : 'awaiting_review'
      };
    } catch (err) {
      this.logger.error({ err, sourceType }, 'Failed to queue document');
      throw err;
    }
  }

  /**
   * Get ingestion queue status
   */
  async getQueueStatus(options = {}) {
    const { status, limit = 20 } = options;

    try {
      let sql = 'SELECT * FROM ingestion_queue';
      const params = [];

      if (status) {
        sql += ' WHERE status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const items = await queryAll(sql, params);

      return items.map(item => ({
        ...item,
        source_data: JSON.parse(item.source_data || '{}'),
        analysis_result: item.analysis_result ? JSON.parse(item.analysis_result) : null,
        suggested_metadata: item.suggested_metadata ? JSON.parse(item.suggested_metadata) : null
      }));
    } catch (err) {
      this.logger.error({ err }, 'Failed to get queue status');
      return [];
    }
  }
}

export default LibrarianAgent;
