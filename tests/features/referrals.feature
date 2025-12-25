@referrals
Feature: Referral System
  As a registered user
  I want to refer new users to SifterSearch
  So that I can help grow the community and track my impact

  # ============================================
  # IMPLEMENTED - Referral Code Generation
  # ============================================

  @implemented @api
  Scenario: Get my referral code
    Given I am logged in as an approved user
    When I request my referral information
    Then I should receive my unique referral code
    And the code should be based on my user ID

  @implemented @api
  Scenario: Get referral link
    Given I am logged in as an approved user
    When I request my referral information
    Then I should receive a full referral URL
    And the URL should include my referral code

  # ============================================
  # IMPLEMENTED - Referral Stats
  # ============================================

  @implemented @api
  Scenario: View my referral statistics
    Given I am logged in as an approved user
    And I have referred 5 users
    And 3 of them have been approved
    When I request my referral stats
    Then I should see:
      | stat            | value |
      | total_referrals | 5     |
      | approved_count  | 3     |
      | pending_count   | 2     |

  @implemented @api
  Scenario: View my referred users list
    Given I am logged in as an approved user
    And I have referred users:
      | name    | tier     | joined_at  |
      | Alice   | approved | 2024-01-15 |
      | Bob     | verified | 2024-02-01 |
    When I request my referral list
    Then I should see 2 referred users
    And I should see their names and tiers

  @implemented @api
  Scenario: No referrals shows empty stats
    Given I am logged in as an approved user
    And I have not referred anyone
    When I request my referral stats
    Then total_referrals should be 0
    And the referral list should be empty

  # ============================================
  # IMPLEMENTED - Referral Tracking
  # ============================================

  @implemented @api
  Scenario: Track referral on signup
    Given user "referrer_123" has referral code "ref_abc"
    When a new user signs up with referral code "ref_abc"
    Then the new user should be linked to "referrer_123"
    And "referrer_123" should see the new referral in their list

  @implemented @api
  Scenario: Invalid referral code is handled gracefully
    When a new user signs up with referral code "invalid_code"
    Then the signup should still succeed
    And the user should not be linked to any referrer

  @implemented @api
  Scenario: Self-referral is prevented
    Given I am logged in as user "user_123"
    When I try to use my own referral code
    Then the referral should not be counted
    And I should not appear in my own referral list

  # ============================================
  # IMPLEMENTED - Referral Requirements
  # ============================================

  @implemented @api
  Scenario: Only verified+ users can see referral dashboard
    Given I am logged in as a verified user
    When I request my referral information
    Then I should receive referral data

  @implemented @api
  Scenario: Anonymous users cannot access referral data
    Given I am an anonymous user
    When I request referral information
    Then I should receive a 401 unauthorized error

  # ============================================
  # UI TESTS
  # ============================================

  @pending @ui
  Scenario: Referral dashboard shows stats
    Given I am logged in as an approved user
    And I have referred 5 users
    When I navigate to the referrals page
    Then I should see my total referral count
    And I should see approved and pending counts

  @pending @ui
  Scenario: Copy referral link button works
    Given I am logged in and on the referrals page
    When I click the copy link button
    Then my referral link should be copied to clipboard
    And I should see a success message

  @pending @ui
  Scenario: QR code is displayed
    Given I am logged in and on the referrals page
    Then I should see a QR code for my referral link
    And the QR code should be scannable

  @pending @ui
  Scenario: Share buttons are functional
    Given I am logged in and on the referrals page
    Then I should see share buttons for email and social
    And clicking email should open email client with pre-filled message

  @pending @ui
  Scenario: Referral list shows user details
    Given I am logged in and on the referrals page
    And I have referred users
    Then I should see a list of my referred users
    And each entry should show name, tier, and join date
