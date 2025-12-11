@authentication
Feature: User Authentication and Access Control
  As a user of SifterSearch
  I want to authenticate and have appropriate access
  So that I can use features based on my tier

  # ============================================
  # IMPLEMENTED - Basic Authentication
  # ============================================

  @implemented
  Scenario: User registration with email verification
    Given I am a new visitor
    When I register with email "test@example.com"
    Then I should receive a verification code
    And my account should be in "verified" tier

  @implemented
  Scenario: User login with valid credentials
    Given I am a registered user with email "user@example.com"
    When I login with correct password
    Then I should receive an access token
    And I should receive a refresh token
    And I should be authenticated

  @implemented
  Scenario: User login with invalid credentials
    Given I am a registered user with email "user@example.com"
    When I login with incorrect password
    Then I should receive an authentication error
    And I should not receive any tokens

  @implemented
  Scenario: Password hashing is secure
    Given a password "mySecurePassword123"
    When the password is hashed
    Then the hash should be different from the password
    And verifying the correct password should succeed
    And verifying a wrong password should fail

  @implemented
  Scenario: JWT token validation
    Given a valid JWT token for user "user_123"
    When the token is verified
    Then I should get the user ID "user_123"
    And I should get the user tier

  @implemented
  Scenario: Expired JWT token is rejected
    Given an expired JWT token
    When the token is verified
    Then verification should fail
    And I should receive a token expired error

  # ============================================
  # PENDING - Session Management
  # ============================================

  @pending
  Scenario: Single active session enforcement
    Given I am logged in on device A
    When I login on device B
    Then my session on device A should be invalidated
    And I should be logged in only on device B

  @pending
  Scenario: Refresh token rotation
    Given I have a valid refresh token
    When I use the refresh token to get a new access token
    Then I should receive a new access token
    And the old refresh token should be invalidated
    And I should receive a new refresh token

  @pending
  Scenario: Logout invalidates all tokens
    Given I am logged in with active tokens
    When I logout
    Then my access token should be invalidated
    And my refresh token should be revoked in the database
    And subsequent requests should fail

  # ============================================
  # PENDING - Access Tiers
  # ============================================

  @pending @tier
  Scenario: Anonymous user has limited searches
    Given I am an anonymous user
    Then I should have 5 searches allowed per IP
    And I should only have access to fast search mode
    And I should be rate limited to 1 search per 10 seconds

  @pending @tier
  Scenario: Verified user pending approval
    Given I am a verified user awaiting approval
    Then I should have 10 total searches allowed
    And I should only have access to fast search mode
    And I should see my pending approval status

  @pending @tier
  Scenario: Approved user has full access
    Given I am an approved user
    Then I should have unlimited searches
    And I should have access to fast and research modes
    And I should be able to contribute documents
    And I should have forum access
    And I should be rate limited to 60 searches per hour

  @pending @tier
  Scenario: Patron user has premium features
    Given I am a patron user
    Then I should have unlimited searches
    And I should use Claude Sonnet for orchestration
    And I should be rate limited to 100 searches per hour
    And I should have access to translation services
    And I should have access to audio conversion services

  @pending @tier
  Scenario: Admin user has no limits
    Given I am an admin user
    Then I should have no rate limits
    And I should use Claude Sonnet for all AI operations
    And I should have access to all admin features

  @pending @tier
  Scenario: Banned user gets shadow ban treatment
    Given I am a banned user
    Then I should appear to have normal access
    But my searches should return Google Custom Search results
    And I should not access the actual library
    And my tokens should be revoked

  # ============================================
  # PENDING - Rate Limiting
  # ============================================

  @pending
  Scenario: Rate limit enforcement for approved users
    Given I am an approved user
    When I exceed 60 searches in one hour
    Then I should receive a rate limit error
    And I should be told when I can search again

  @pending
  Scenario: Rate limit enforcement for verified users
    Given I am a verified user
    When I attempt my 11th search
    Then I should receive a limit exceeded error
    And I should be prompted to complete approval

  # ============================================
  # PENDING - Welcome Experience
  # ============================================

  @pending @welcome
  Scenario: New visitor welcome message
    Given I am a new visitor with no session
    When I visit the search page
    Then Sifter should greet me warmly
    And offer options to login, create account, or try as guest

  @pending @welcome
  Scenario: Returning user personalized greeting
    Given I am a returning user named "Sarah"
    When I visit the search page
    Then Sifter should greet me by name
    And show my remaining searches if limited
    And mention new documents added since last visit

  @pending @welcome
  Scenario: Guest nudge after 3 searches
    Given I am a guest user
    And I have used 3 of my 5 searches
    When I perform another search
    Then I should see a prompt to create an account
    And be told I have 2 searches remaining

  # ============================================
  # PENDING - Signup Flow
  # ============================================

  @pending
  Scenario: Email verification with 6-digit code
    Given I am registering a new account
    When I submit my email "new@example.com"
    Then I should receive a 6-digit verification code via email
    And the code should expire in 15 minutes

  @pending
  Scenario: Complete registration with usage description
    Given I have verified my email
    When I complete my profile with:
      | name        | Sarah Johnson              |
      | background  | Academic                   |
      | usage       | PhD research on mysticism  |
    Then my account should be created in verified tier
    And I should be pending admin approval

  @pending
  Scenario: Registration with referral link
    Given I visit with referral code "sarah_j47"
    When I complete registration
    Then my account should be linked to the referrer
    And the referrer should see me in their referrals list
    And admin should see I was referred by a trusted user
