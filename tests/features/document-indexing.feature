@document @indexing
Feature: Document Indexing and Processing
  As a library administrator
  I want to index documents into the search system
  So that users can find relevant content

  # ============================================
  # IMPLEMENTED - Ingestion Pipeline
  # ============================================

  @implemented
  Scenario: Parse markdown document with frontmatter
    Given a markdown document with YAML frontmatter
    When the document is parsed
    Then metadata should be extracted from frontmatter
    And content should be separated from frontmatter
    And title, author, year should be available

  @implemented
  Scenario: Parse document into paragraphs
    Given a document with multiple paragraphs
    When the document is chunked
    Then each paragraph should be a separate chunk
    And chunks shorter than 100 characters should be filtered
    And long paragraphs should be split at sentence boundaries

  @implemented
  Scenario: Generate content hash for change detection
    Given document content "test content"
    When a hash is generated
    Then the hash should be SHA256
    And the hash should be 64 hexadecimal characters
    And identical content should produce identical hash

  @implemented
  Scenario: Handle Unicode content (Arabic)
    Given a document with Arabic content
    When the document is parsed and hashed
    Then Arabic text should be preserved correctly
    And hash should be generated successfully

  @implemented
  Scenario: Handle documents with no frontmatter
    Given a plain text document without frontmatter
    When the document is parsed
    Then content should be returned as-is
    And metadata should be empty

  @implemented
  Scenario: Incremental document updates
    Given a document was previously indexed
    And the document content has changed
    When the document is re-indexed
    Then only changed paragraphs should be re-processed
    And unchanged paragraphs should keep their embeddings

  # ============================================
  # IMPLEMENTED - Document Export
  # ============================================

  @implemented
  Scenario: Export documents as JSON
    Given indexed documents in the library
    When I request JSON export
    Then I should receive valid JSON array
    And each document should have title, author, content

  @implemented
  Scenario: Export documents as CSV
    Given indexed documents in the library
    When I request CSV export
    Then I should receive valid CSV with headers
    And each row should represent a document

  @implemented
  Scenario: Export documents as Markdown
    Given indexed documents in the library
    When I request Markdown export
    Then I should receive formatted markdown
    And documents should be separated by headings

  # ============================================
  # PENDING - Three-Phase Pipeline
  # ============================================

  @pending
  Scenario: Phase 1 - Ingest documents to SQLite
    Given markdown files in the library folder
    When the ingestion phase runs
    Then documents should be stored in indexed_documents table
    And paragraphs should be stored in indexed_paragraphs table
    And paragraphs should have embedded=0 status

  @pending
  Scenario: Phase 2 - Batch embedding generation
    Given paragraphs with embedded=0 status
    When the embedding worker runs with batch size 100
    Then embeddings should be generated for each paragraph
    And embeddings should be stored in paragraph_embeddings table
    And paragraph status should change to embedded=1

  @pending
  Scenario: Phase 3 - Sync to Meilisearch
    Given paragraphs with embedded=1 and synced=0 status
    When the sync phase runs
    Then paragraphs should be pushed to Meilisearch
    And paragraph status should change to synced=1
    And temporary embeddings should be cleaned up

  @pending
  Scenario: Resumable indexing on failure
    Given indexing was interrupted mid-process
    When indexing resumes
    Then processing should continue from last checkpoint
    And no duplicate paragraphs should be created
    And previously embedded paragraphs should not be re-embedded

  @pending
  Scenario: Embedding error handling with retry
    Given a paragraph that fails embedding generation
    When embedding is retried 3 times
    Then retry_count should increment each attempt
    And after 3 failures, paragraph should be marked with error
    And other paragraphs should continue processing

  # ============================================
  # PENDING - Classical Text Segmentation
  # ============================================

  @pending
  Scenario: Detect unpunctuated classical text
    Given a document with Arabic text and low punctuation ratio
    When the document is analyzed
    Then the system should detect it needs segmentation
    And segmentation_required should be flagged

  @pending
  Scenario: AI segments classical text into paragraphs
    Given an unpunctuated classical Arabic text
    When AI segmentation runs
    Then text should be divided into logical paragraphs
    And segmentation should be cached for reuse

  # ============================================
  # PENDING - Cover Image Management
  # ============================================

  @pending
  Scenario: Fetch cover from Open Library by ISBN
    Given a document with ISBN "0877431612"
    When cover fetching runs during idle time
    Then a cover image should be downloaded from Open Library
    And the cover should be stored alongside the document

  @pending
  Scenario: Fetch cover by title and author
    Given a document with title "The Book of Certitude" and author "Bahá'u'lláh"
    And no ISBN is available
    When cover fetching runs
    Then a cover should be searched by title and author
    And if found with high confidence, it should be downloaded

  @pending
  Scenario: Rate limit cover API requests
    Given multiple documents need cover images
    When cover fetching runs
    Then requests should be limited to 100 per day per service
    And a delay of 1 second should be between requests

  # ============================================
  # PENDING - Website Scraping
  # ============================================

  @pending
  Scenario: Polite website scraping with rate limits
    Given a website configured for scraping
    When the scraper runs
    Then it should respect 1-2 second delay between requests
    And it should have max 3 concurrent requests to same domain
    And it should honor robots.txt

  @pending
  Scenario: Download and localize assets
    Given a scraped page with images
    When assets are processed
    Then images should be downloaded to local storage
    And markdown links should be rewritten to local paths

  @pending
  Scenario: Adaptive update frequency
    Given a website with no changes in 3 months
    When update frequency is recalculated
    Then checks should be reduced to monthly
    And after 6 months unchanged, checks should be quarterly
