@user-tracking
Feature: Anonymous User Tracking and ID Unification
  As SifterSearch
  I want to track anonymous users and unify their data on login
  So that users have a seamless experience across sessions

  Background:
    Given the database is initialized with user tracking tables

  # ============================================
  # IMPLEMENTED - Anonymous User ID Generation
  # ============================================

  @implemented
  Scenario: Generate user ID on first visit
    Given I am a new visitor with no localStorage
    When I visit the home page
    Then a user ID should be generated in localStorage
    And the user ID should match pattern "user_" followed by a UUID

  @implemented
  Scenario: Persist user ID across page reloads
    Given I have a user ID "user_abc123" in localStorage
    When I reload the page
    Then my user ID should still be "user_abc123"

  @implemented
  Scenario: Persist user ID across navigation
    Given I have a user ID in localStorage
    When I navigate to the about page
    And I navigate back to the home page
    Then my user ID should remain the same

  # ============================================
  # IMPLEMENTED - X-User-ID Header
  # ============================================

  @implemented
  Scenario: Send user ID with API requests
    Given I have a user ID "user_xyz789" in localStorage
    When I perform a search for "What is love?"
    Then the search request should include header "X-User-ID" with value "user_xyz789"

  @implemented
  Scenario: Send user ID with streaming search
    Given I have a user ID in localStorage
    When I perform a streaming search
    Then the SSE request should include the X-User-ID header

  # ============================================
  # IMPLEMENTED - Query Limits
  # ============================================

  @implemented @limits
  Scenario: Anonymous users have 10 query limit
    Given I am an anonymous user
    When I check my query allowance
    Then I should have 10 queries allowed
    And I should see "remaining" queries count

  @pending @limits
  Scenario: Anonymous user reaches query limit
    Given I am an anonymous user who has performed 10 searches
    When I attempt another search
    Then I should receive a "query limit exceeded" error
    And I should be prompted to sign in

  @implemented @limits
  Scenario: Verified users have 20 query limit
    Given I am logged in as a verified user
    When I check my query allowance
    Then I should have 20 queries allowed

  @implemented @limits
  Scenario: Approved users have unlimited queries
    Given I am logged in as an approved user
    When I check my query allowance
    Then I should have unlimited queries

  @implemented @limits
  Scenario: Admin users have unlimited queries
    Given I am logged in as an admin
    When I check my query allowance
    Then I should have unlimited queries

  # ============================================
  # IMPLEMENTED - User ID Unification
  # ============================================

  @implemented @unification
  Scenario: Unify anonymous data on login
    Given I am an anonymous user with ID "user_anon123"
    And I have performed 5 searches
    And I have stored conversation memories
    When I login with email "user@example.com"
    Then my anonymous search count should transfer to my account
    And my conversation memories should transfer to my account
    And my anonymous user record should be marked as converted

  @implemented @unification
  Scenario: Unify user profile on login
    Given I am an anonymous user with learned preferences
    When I login with email "user@example.com"
    Then my learned preferences should transfer to my profile
    And my spiritual background should be preserved

  @implemented @unification
  Scenario: Generate fresh ID on logout
    Given I am logged in as an approved user
    When I logout
    Then a new anonymous user ID should be generated
    And the old user ID should be removed from localStorage

  # ============================================
  # IMPLEMENTED - Memory Agent
  # ============================================

  @implemented @memory
  Scenario: Store conversation in memory
    Given I am a user with ID "user_mem123"
    When I search for "What is the nature of the soul?" using analyze API
    Then my query should be stored in conversation_memories
    And the memory should have an embedding for semantic search

  @implemented @memory
  Scenario: Recall relevant memories
    Given I have previous conversations about "soul" and "afterlife"
    When I search for "What happens after death?" using analyze API
    Then relevant memories should be retrieved
    And the memories should be used in context for the response

  @implemented @memory
  Scenario: Transfer memories on login
    Given I am an anonymous user with conversation memories
    When I login
    Then all my memories should be transferred to my authenticated account
    And the original memories should be updated with my user ID

  # ============================================
  # IMPLEMENTED - User Context Injection
  # ============================================

  @implemented @context
  Scenario: Inject user profile into search context
    Given I am a user with spiritual background "Baha'i"
    And I have interests in "interfaith dialogue"
    When I perform a search via the API
    Then my user profile should be included in the analyzer context
    And the response should be personalized to my background

  @implemented @context
  Scenario: Include relevant memories in search
    Given I have previous questions about "unity"
    When I search for "How do religions promote unity?" using analyze API
    Then relevant past conversations should be included in context
    And the response should reference my previous interest

  # ============================================
  # PENDING - Advanced Features
  # ============================================

  @pending
  Scenario: Detect user information during conversation
    Given Sifter is having a conversation with me
    When I mention "I'm studying comparative religion at Harvard"
    Then Sifter should extract my affiliation "Harvard"
    And update my user profile with this information

  @pending
  Scenario: Ask new users about themselves
    Given I just signed up
    When I see the onboarding flow
    Then I should be asked to tell about myself
    And my response should be used to initialize my user profile

  @pending
  Scenario: Merge multiple anonymous sessions
    Given I have used SifterSearch from two different devices
    And both devices have different anonymous user IDs
    When I login on both devices
    Then both anonymous histories should be merged
    And I should see combined search history
