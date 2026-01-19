@api @implemented
Feature: API Endpoint Coverage
  As a developer of SifterSearch
  I want all API endpoints tested
  So that I can ensure the API is robust and reliable

  # ============================================
  # Health & Status Endpoints
  # ============================================

  @critical-path @health
  Scenario: Health endpoint returns OK
    When I call GET /health
    Then the response status should be 200
    And the response should contain status "ok"

  @critical-path @health
  Scenario: Search health endpoint returns OK
    When I call GET /api/search/health
    Then the response status should be 200

  @health
  Scenario: Search stats endpoint returns index info
    When I call GET /api/search/stats
    Then the response status should be 200
    And the response should contain indexed document count

  # ============================================
  # Search Endpoints
  # ============================================

  @critical-path @search
  Scenario: Quick search returns results
    When I call GET /api/search/quick with query "prayer"
    Then the response status should be 200
    And the response should contain hits array
    And processing time should be included

  @search
  Scenario: Quick search respects limit parameter
    When I call GET /api/search/quick with query "God" and limit 5
    Then the response status should be 200
    And the response should have at most 5 hits

  @search
  Scenario: Quick search with offset for pagination
    When I call GET /api/search/quick with query "love" and offset 10
    Then the response status should be 200
    And the response should return paginated results

  @search
  Scenario: POST search with filters
    Given I am authenticated
    When I call POST /api/search with query "unity" and religion filter "Bahá'í"
    Then the response status should be 200
    And all results should be from religion "Bahá'í"

  @search
  Scenario: Search with year range filter
    Given I am authenticated
    When I call POST /api/search with query "meditation" and year range 1850 to 1950
    Then the response status should be 200

  @search
  Scenario: Search analyze endpoint returns AI analysis
    Given I am authenticated
    When I call POST /api/search/analyze with query "divine unity"
    Then the response status should be 200
    And the response should contain analysis text

  # ============================================
  # Library Endpoints
  # ============================================

  @critical-path @library
  Scenario: Library tree returns religion hierarchy
    When I call GET /api/library/tree
    Then the response status should be 200
    And the response should contain religions array

  @library
  Scenario: Library stats returns document count
    When I call GET /api/library/stats
    Then the response status should be 200
    And the response should contain total documents
    And the response should contain religions count

  @library
  Scenario: Library documents list with pagination
    When I call GET /api/library/documents with limit 20
    Then the response status should be 200
    And the response should contain documents array
    And each document should have id and title

  @library
  Scenario: Library documents filtered by religion
    When I call GET /api/library/documents with religion "Bahá'í"
    Then the response status should be 200
    And all documents should be from religion "Bahá'í"

  @library
  Scenario: Library recent documents endpoint
    When I call GET /api/library/recent with type "all"
    Then the response status should be 200
    And the response should contain documents array

  @library
  Scenario: Library recent added documents
    When I call GET /api/library/recent with type "added"
    Then the response status should be 200

  @library
  Scenario: Library recent modified documents
    When I call GET /api/library/recent with type "modified"
    Then the response status should be 200

  @library @admin
  Scenario: Library pending documents requires admin
    Given I am not authenticated
    When I call GET /api/library/pending
    Then the response status should be 401

  @library @admin
  Scenario: Library pending documents for admin
    Given I am authenticated as admin
    When I call GET /api/library/pending
    Then the response status should be 200

  # ============================================
  # Document Endpoints
  # ============================================

  @documents
  Scenario: Get document by ID
    Given a document exists
    When I call GET /api/documents/:id
    Then the response status should be 200
    And the response should contain document metadata

  @documents
  Scenario: Get document segments
    Given a document exists
    When I call GET /api/documents/:id/segments
    Then the response status should be 200
    And the response should contain segments array

  @documents
  Scenario: Document filters endpoint
    When I call GET /api/documents/filters
    Then the response status should be 200
    And the response should contain filter options

  @documents
  Scenario: Document download generates token
    Given a document exists
    When I call GET /api/documents/:id/download with format "json"
    Then the response status should be 200
    And the response should contain download URL

  # ============================================
  # Authentication Endpoints
  # ============================================

  @critical-path @auth
  Scenario: Login with valid credentials
    When I call POST /api/auth/login with valid credentials
    Then the response status should be 200
    And the response should contain access token

  @auth
  Scenario: Login with invalid credentials
    When I call POST /api/auth/login with invalid credentials
    Then the response status should be 401

  @auth
  Scenario: Signup creates new user
    When I call POST /api/auth/signup with new user data
    Then the response status should be 201
    And the response should contain user data

  @auth
  Scenario: Signup with existing email fails
    When I call POST /api/auth/signup with existing email
    Then the response status should be 409

  @auth
  Scenario: Token refresh endpoint
    Given I have a valid refresh token
    When I call POST /api/auth/refresh
    Then the response status should be 200
    And the response should contain new access token

  @auth
  Scenario: Get current user profile
    Given I am authenticated
    When I call GET /api/auth/me
    Then the response status should be 200
    And the response should contain user profile

  @auth
  Scenario: Forgot password sends reset email
    When I call POST /api/auth/forgot-password with valid email
    Then the response status should be 200

  # ============================================
  # User Endpoints
  # ============================================

  @user
  Scenario: Get user profile
    Given I am authenticated
    When I call GET /api/user/profile
    Then the response status should be 200
    And the response should contain user details

  @user
  Scenario: Update user profile
    Given I am authenticated
    When I call PUT /api/user/profile with new name
    Then the response status should be 200
    And the user name should be updated

  @user
  Scenario: Change password
    Given I am authenticated
    When I call PUT /api/user/password with valid current password
    Then the response status should be 200

  @user
  Scenario: Get user conversations
    Given I am authenticated
    When I call GET /api/user/conversations
    Then the response status should be 200
    And the response should contain conversations array

  @user
  Scenario: Get user referrals
    Given I am authenticated
    When I call GET /api/user/referrals
    Then the response status should be 200
    And the response should contain referral code

  # ============================================
  # Admin Endpoints
  # ============================================

  @admin
  Scenario: Admin stats require admin role
    Given I am authenticated as patron
    When I call GET /api/admin/stats
    Then the response status should be 403

  @admin
  Scenario: Admin stats for admin user
    Given I am authenticated as admin
    When I call GET /api/admin/stats
    Then the response status should be 200
    And the response should contain statistics

  @admin
  Scenario: Admin users list
    Given I am authenticated as admin
    When I call GET /api/admin/users
    Then the response status should be 200
    And the response should contain users array

  @admin
  Scenario: Admin pending users
    Given I am authenticated as admin
    When I call GET /api/admin/pending
    Then the response status should be 200

  @admin
  Scenario: Admin index status
    Given I am authenticated as admin
    When I call GET /api/admin/index/status
    Then the response status should be 200

  # ============================================
  # Forum Endpoints
  # ============================================

  @forum
  Scenario: Get forum posts
    When I call GET /api/forum/posts
    Then the response status should be 200
    And the response should contain posts array

  @forum
  Scenario: Get forum categories
    When I call GET /api/forum/categories
    Then the response status should be 200
    And the response should contain categories array

  @forum
  Scenario: Create forum post requires auth
    Given I am not authenticated
    When I call POST /api/forum/posts with post data
    Then the response status should be 401

  @forum
  Scenario: Create forum post as verified user
    Given I am authenticated as verified
    When I call POST /api/forum/posts with valid post data
    Then the response status should be 201

  # ============================================
  # Services Endpoints
  # ============================================

  @services
  Scenario: Get translation languages
    When I call GET /api/services/translate/languages
    Then the response status should be 200
    And the response should contain languages array

  @services
  Scenario: Get audio voices
    When I call GET /api/services/audio/voices
    Then the response status should be 200
    And the response should contain voices array

  @services
  Scenario: Translation requires patron tier
    Given I am authenticated as approved
    When I call POST /api/services/translate with valid request
    Then the response status should be 403

  # ============================================
  # Anonymous Endpoints
  # ============================================

  @anonymous
  Scenario: Anonymous profile with user ID header
    When I call GET /api/anonymous/profile with X-User-ID header
    Then the response status should be 200

  @anonymous
  Scenario: Anonymous track event
    When I call POST /api/anonymous/track with search event
    Then the response status should be 200

  @anonymous
  Scenario: Anonymous conversations
    When I call GET /api/anonymous/conversations with X-User-ID header
    Then the response status should be 200

  # ============================================
  # Session Endpoints
  # ============================================

  @session
  Scenario: Initialize new session
    When I call POST /api/session/init with new session
    Then the response status should be 200
    And the response should contain session ID

  @session
  Scenario: Resume existing session
    Given I have an existing session
    When I call POST /api/session/init with existing session ID
    Then the response status should be 200

  # ============================================
  # Donations Endpoints
  # ============================================

  @donations
  Scenario: Get donation tiers
    When I call GET /api/donations/tiers
    Then the response status should be 200
    And the response should contain tiers array

  @donations
  Scenario: Create checkout session
    Given I am authenticated
    When I call POST /api/donations/create-checkout with tier
    Then the response status should be 200
    And the response should contain checkout URL

  # ============================================
  # Rate Limiting
  # ============================================

  @rate-limiting
  Scenario: Anonymous search has rate limits
    When I make 100 quick search requests
    Then some requests should be rate limited
    And rate limit headers should be present

  @rate-limiting
  Scenario: Authenticated search has higher limits
    Given I am authenticated
    When I make 50 search requests
    Then all requests should succeed

  # ============================================
  # Error Handling
  # ============================================

  @errors
  Scenario: Invalid JSON returns 400
    When I call POST /api/search with invalid JSON
    Then the response status should be 400

  @errors
  Scenario: Missing required field returns validation error
    When I call POST /api/auth/login without password
    Then the response status should be 400
    And the error should mention "password"

  @errors
  Scenario: Non-existent endpoint returns 404
    When I call GET /api/nonexistent
    Then the response status should be 404
