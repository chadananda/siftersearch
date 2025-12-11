@admin
Feature: Admin Dashboard and Management
  As an admin user
  I want to manage users, content, and system settings
  So that I can maintain the library effectively

  # ============================================
  # PENDING - Dashboard Statistics
  # ============================================

  @pending
  Scenario: View dashboard statistics
    Given I am an admin user
    When I view the admin dashboard
    Then I should see user statistics:
      | total     |
      | verified  |
      | approved  |
      | patron    |
      | banned    |
      | pending   |
    And I should see library statistics:
      | documents  |
      | paragraphs |
    And I should see analytics for last 30 days:
      | total events |
      | total cost   |
      | unique users |

  # ============================================
  # PENDING - User Management
  # ============================================

  @pending
  Scenario: List users with filtering
    Given I am an admin user
    When I list users filtered by tier "verified"
    Then I should see only verified users
    And results should be paginated

  @pending
  Scenario: Search users by email or name
    Given I am an admin user
    When I search users for "sarah"
    Then I should see users matching "sarah" in email or name

  @pending
  Scenario: Update user tier
    Given I am an admin user
    And user "user_123" is in "verified" tier
    When I update their tier to "approved"
    Then the user should be in "approved" tier
    And approved_at should be set

  @pending
  Scenario: Approve pending user
    Given I am an admin user
    And user "user_123" is pending approval
    When I approve them
    Then their tier should change to "approved"
    And approved_at should be set
    And they should be notified

  @pending
  Scenario: Ban user
    Given I am an admin user
    And user "user_456" is causing issues
    When I ban them
    Then their tier should change to "banned"
    And their tokens should be revoked
    And they should experience shadow ban behavior

  @pending
  Scenario: Prevent self-ban
    Given I am an admin user
    When I try to ban myself
    Then I should receive an error
    And my tier should remain admin

  # ============================================
  # PENDING - Content Management
  # ============================================

  @pending
  Scenario: Index single document via API
    Given I am an admin user
    And I have document text and metadata
    When I POST to /api/admin/index
    Then the document should be indexed
    And I should receive indexing results

  @pending
  Scenario: Batch index documents
    Given I am an admin user
    And I have a JSON array of documents
    When I POST to /api/admin/index/batch
    Then all documents should be indexed
    And I should see success/failure counts

  @pending
  Scenario: Remove document from index
    Given I am an admin user
    And document "doc_123" exists in the index
    When I DELETE /api/admin/index/doc_123
    Then the document should be removed from Meilisearch
    And associated paragraphs should be deleted

  @pending
  Scenario: View indexing queue status
    Given I am an admin user
    When I GET /api/admin/index/status
    Then I should see pending, processing, completed counts
    And I should see any failed items

  # ============================================
  # PENDING - Analytics
  # ============================================

  @pending
  Scenario: View recent analytics events
    Given I am an admin user
    When I GET /api/admin/analytics
    Then I should see recent events
    And events should include user email if available
    And events should be sorted by recency

  @pending
  Scenario: Filter analytics by event type
    Given I am an admin user
    When I GET /api/admin/analytics?eventType=search
    Then I should see only search events

  # ============================================
  # PENDING - System Configuration
  # ============================================

  @pending
  Scenario: View AI provider configuration
    Given I am an admin user
    When I view system configuration
    Then I should see current AI provider settings per tier
    And I should see cost estimates

  @pending
  Scenario: Switch AI provider for tier
    Given I am an admin user
    When I change approved tier orchestration to "local:qwen2.5:70b"
    Then the configuration should be updated
    And new searches by approved users should use qwen2.5:70b

  @pending
  Scenario: View API cost summary
    Given I am an admin user
    When I view the cost summary
    Then I should see costs broken down by:
      | embeddings    |
      | orchestration |
      | translation   |
      | audio         |
    And I should see monthly projections
