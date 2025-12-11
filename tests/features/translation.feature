@translation @patron
Feature: Translation Services
  As a patron user
  I want to translate documents and search results
  So that I can read content in my preferred language

  # ============================================
  # IMPLEMENTED - Translation Utilities
  # ============================================

  @implemented
  Scenario: List supported languages
    When I request supported languages
    Then I should receive a list of language codes and names
    And the list should include major languages like English, Arabic, Farsi

  @implemented
  Scenario: Translation exists check
    Given a document "doc_123" translated to "es"
    When I check if translation exists
    Then I should receive exists=true
    And I should see the count of cached segments

  @implemented
  Scenario: Translation does not exist check
    Given a document "doc_456" not translated to "fr"
    When I check if translation exists to French
    Then I should receive exists=false

  # ============================================
  # PENDING - Translation Request
  # ============================================

  @pending @patron
  Scenario: Request document translation (patron+)
    Given I am a patron user
    And a document "doc_123" in Arabic
    When I request translation to English
    Then a translation job should be queued
    And I should receive a job ID
    And I should be notified when complete

  @pending @patron
  Scenario: Non-patron cannot request translation
    Given I am an approved user (not patron)
    When I request document translation
    Then I should receive a forbidden error
    And be shown patron upgrade options

  @pending @patron
  Scenario: Cached translation returned immediately
    Given a document "doc_123" already translated to English
    When I request translation to English
    Then I should receive "already_exists" status
    And I should see the cached segment count

  @pending
  Scenario: Shoghi Effendi style translation
    Given a classical Arabic religious text
    When translation is generated
    Then the translation should use dignified language
    And maintain reverence and precision
    And be consistent with established translation conventions

  # ============================================
  # PENDING - Side-by-Side Display
  # ============================================

  @pending
  Scenario: Search results with translation display
    Given I am a user with preferred language English
    And search results include Arabic passages
    When I view the results
    Then Arabic passages should show side-by-side translation
    And the table should be broken by sentences
    And original text should be on the left

  @pending
  Scenario: Sentence-level translation caching
    Given a translated paragraph with 5 sentences
    When I request the same translation again
    Then cached translations should be returned
    And cache should be keyed by content hash per sentence

  # ============================================
  # PENDING - Dynamic Language Switching
  # ============================================

  @pending
  Scenario: User changes preferred language mid-conversation
    Given I am a user with preferred language English
    When I say "Please respond in Spanish"
    Then Sifter should switch to Spanish responses
    And future search results should be translated to Spanish
    And my preference should be saved to my profile

  @pending
  Scenario: Detect query language and respond accordingly
    Given I am a user with no set language preference
    When I search using Arabic text "ما هو معنى الحياة"
    Then Sifter should detect Arabic query
    And respond in Arabic
    And update my inferred language preference
