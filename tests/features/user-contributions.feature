@contributions
Feature: User Document Contributions
  As an approved user
  I want to contribute documents to the library
  So that the collection can grow with community help

  # ============================================
  # PENDING - Document Upload
  # ============================================

  @pending
  Scenario: Upload single document
    Given I am an approved user
    When I upload a PDF document "theology-paper.pdf"
    Then the document should be saved to staging
    And AI should analyze and extract metadata
    And I should see a preview of extracted metadata

  @pending
  Scenario: AI extracts metadata from document
    Given I upload a document with title page
    When AI analyzes the first pages
    Then title should be extracted with confidence score
    And author should be extracted with confidence score
    And year should be extracted if found
    And suggested religion and collection should be provided

  @pending
  Scenario: User confirms or edits AI-extracted metadata
    Given AI extracted metadata for my upload
    When I review the metadata
    Then I can confirm high-confidence fields
    And I can edit low-confidence fields
    And I must provide values for missing required fields

  @pending
  Scenario: Duplicate detection by file hash
    Given a document with identical content already exists
    When I upload the same file
    Then I should be warned of exact duplicate
    And upload should be blocked

  @pending
  Scenario: Duplicate detection by fuzzy metadata match
    Given a document with similar title/author/year exists
    When I upload a potentially duplicate document
    Then I should be shown the possible match
    And I can choose:
      | Yes, different edition  |
      | No, same document       |
      | Not sure, let admin decide |

  @pending
  Scenario: Batch upload via ZIP file
    Given I have a ZIP file with 5 documents
    When I upload the ZIP
    Then all documents should be extracted
    And each should be analyzed separately
    And I should see a review page for each document

  @pending
  Scenario: Submitted contribution awaits admin approval
    Given I completed metadata for my upload
    When I submit the contribution
    Then status should be "pending approval"
    And admin should see it in pending queue
    And I should receive confirmation message

  # ============================================
  # PENDING - Admin Approval Workflow
  # ============================================

  @pending @admin
  Scenario: Admin views pending contributions
    Given I am an admin user
    When I view the contributions queue
    Then I should see all pending uploads
    And each should show contributor name
    And each should show proposed metadata
    And each should show duplicate warnings if any

  @pending @admin
  Scenario: Admin approves contribution
    Given a pending contribution with good metadata
    When admin clicks approve
    Then document should move to library folder
    And YAML metadata file should be created
    And document should be processed and indexed
    And contributor should be notified

  @pending @admin
  Scenario: Admin rejects contribution
    Given a pending contribution
    When admin rejects with reason "Duplicate content"
    Then document should be removed from staging
    And contributor should be notified with reason

  @pending @admin
  Scenario: Admin requests more information
    Given a pending contribution with unclear metadata
    When admin asks contributor for clarification
    Then contributor should receive message
    And contribution status should be "awaiting response"

  # ============================================
  # PENDING - Metadata Corrections
  # ============================================

  @pending
  Scenario: User suggests metadata correction
    Given an existing document with incorrect year
    When I submit a correction suggestion with:
      | field       | year                    |
      | current     | 1858                    |
      | suggested   | 1857                    |
      | explanation | Based on Taherzadeh... |
    Then the suggestion should be queued for admin review

  @pending @admin
  Scenario: Admin reviews correction suggestion
    Given a pending correction suggestion
    When admin views the suggestion
    Then they should see current and suggested values
    And they should see the explanation
    And they should see contributor trust score
    And they can approve or reject

  @pending
  Scenario: Trusted contributor auto-approve
    Given I am a contributor with high trust score
    And I have 10+ approved corrections
    When I submit a minor metadata correction
    Then it may be auto-approved without admin review

  # ============================================
  # PENDING - OCR Quality Feedback
  # ============================================

  @pending
  Scenario: User reports OCR quality issues
    Given a document with poor OCR quality
    When I report OCR issues with examples:
      | error type      | example               |
      | frequent errors | "rhe" instead of "the"|
      | missing chars   | diacritics missing    |
    Then the report should be logged
    And admin should see it in quality issues queue

  @pending @admin
  Scenario: Admin prioritizes documents for re-OCR
    Given multiple OCR quality reports
    When admin views the queue
    Then documents should be sorted by report count
    And admin can mark for re-processing with better tools
