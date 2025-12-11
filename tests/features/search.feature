@search
Feature: Search Functionality
  As a user of SifterSearch
  I want to search the interfaith library
  So that I can find relevant religious and spiritual texts

  Background:
    Given the library contains indexed documents

  # ============================================
  # IMPLEMENTED - Basic Search
  # ============================================

  @implemented
  Scenario: Basic keyword search
    Given I am an approved user
    When I search for "divine unity"
    Then I should receive search results
    And each result should have a title
    And each result should have an author
    And each result should have a text excerpt

  @implemented
  Scenario: Search returns paragraph-level results
    Given I am an approved user
    When I search for "pilgrimage sacred journey"
    Then results should be at paragraph level
    And each result should include section context
    And each result should include the source document

  @implemented
  Scenario: Search with religion filter
    Given I am an approved user
    When I search for "prayer" filtered by religion "Bahá'í"
    Then all results should be from "Bahá'í" religion
    And I should see relevant passages about prayer

  @implemented
  Scenario: Search with language filter
    Given I am an approved user
    When I search for "الله" filtered by language "ar"
    Then all results should be in Arabic language

  @implemented
  Scenario: Search with year range filter
    Given I am an approved user
    When I search for "mysticism" with year range 1850-1900
    Then all results should be from documents published between 1850 and 1900

  @implemented
  Scenario: Paginated search results
    Given I am an approved user
    When I search for "God" with limit 10 and offset 0
    Then I should receive at most 10 results
    When I search for "God" with limit 10 and offset 10
    Then I should receive the next page of results

  @implemented
  Scenario: Search highlights matching text
    Given I am an approved user
    When I search for "divine unity"
    Then results should highlight the matching terms

  @implemented
  Scenario: Empty search returns no results
    Given I am an approved user
    When I search for ""
    Then I should receive an empty result set

  @implemented
  Scenario: Search for non-existent term
    Given I am an approved user
    When I search for "xyznonexistentterm123"
    Then I should receive an empty result set

  # ============================================
  # PENDING - AI-Powered Search (Sifter)
  # ============================================

  @pending @sifter
  Scenario: Sifter analyzes query intent
    Given I am an approved user
    When I ask Sifter "What do different religions say about the afterlife?"
    Then Sifter should detect a comparative query intent
    And Sifter should search across multiple religions
    And Sifter should synthesize themes from results

  @pending @sifter
  Scenario: Fast search mode (default)
    Given I am an approved user
    When I search for "meditation techniques"
    Then Sifter should use fast mode
    And response time should be under 3 seconds
    And I should see top 10-20 results

  @pending @sifter
  Scenario: Research mode for deep queries
    Given I am an approved user
    When I search for "research: compare pilgrimage in Islam and Christianity"
    Then Sifter should use research mode
    And Sifter should execute multiple search queries
    And Sifter should provide a synthesized analysis
    And I should see theme groupings

  @pending @sifter
  Scenario: Sifter re-ranks results by relevance
    Given I am an approved user
    When I search for "nature of the soul"
    Then Sifter should re-rank results with AI
    And each result should have a relevance score
    And results with score below 0.3 should be filtered out

  @pending @sifter
  Scenario: Sifter extracts key sentences
    Given I am an approved user
    When I search for "divine attributes"
    Then each result should include 1-3 key sentences
    And extracts should be the most relevant portions

  @pending @sifter
  Scenario: Conversation context maintained
    Given I am an approved user
    And I previously searched for "Bahá'u'lláh"
    When I ask "What did he write about unity?"
    Then Sifter should understand "he" refers to Bahá'u'lláh
    And results should be about Bahá'u'lláh's writings on unity

  @pending @sifter
  Scenario: Sifter learns user's name from conversation
    Given I am an approved user
    When I say "Hi, I'm Sarah and I'm researching mysticism"
    Then Sifter should extract my first name as "Sarah"
    And Sifter should remember my research interest in mysticism
    And future greetings should address me as Sarah

  # ============================================
  # PENDING - Search Modes
  # ============================================

  @pending
  Scenario: Hybrid search (keyword + semantic)
    Given I am an approved user
    When I search for "unity of mankind"
    Then results should include both keyword matches
    And results should include semantically similar passages

  @pending
  Scenario: Semantic-only search
    Given I am an approved user
    When I search for "how can humanity achieve peace"
    Then results should match semantic meaning
    Even if exact keywords are not present

  # ============================================
  # PENDING - Tiered AI Providers
  # ============================================

  @pending @tier
  Scenario: Admin tier uses Claude for all operations
    Given I am an admin user
    When I search for "complex theological question"
    Then the search should use Claude Sonnet for orchestration
    And the search should use Claude Sonnet for re-ranking
    And the search should use Claude Sonnet for analysis

  @pending @tier
  Scenario: Patron tier uses Claude for orchestration, Ollama for re-ranking
    Given I am a patron user
    When I search for "complex theological question"
    Then the search should use Claude Sonnet for orchestration
    And the search should use Ollama for re-ranking
    And the search should use Ollama for analysis

  @pending @tier
  Scenario: Approved tier uses Ollama for all operations
    Given I am an approved user
    When I search for "basic search query"
    Then the search should use Ollama for orchestration
    And the search should use Ollama for re-ranking
    And the search should use Ollama for analysis

  @pending @tier
  Scenario: Fallback to Ollama when Claude unavailable
    Given I am an admin user
    And the Claude API is unavailable
    When I search for "any query"
    Then the system should fallback to Ollama
    And I should still receive results
