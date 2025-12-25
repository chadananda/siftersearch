@profile
Feature: User Profile Management
  As a registered user
  I want to view and edit my profile
  So that I can manage my account information

  # ============================================
  # IMPLEMENTED - View Profile
  # ============================================

  @implemented @api
  Scenario: View my profile when authenticated
    Given I am logged in as an approved user
    When I request my profile
    Then I should see my user information:
      | field         |
      | id            |
      | email         |
      | name          |
      | tier          |
      | created_at    |

  @implemented @api
  Scenario: Cannot view profile when not authenticated
    Given I am not authenticated
    When I request my profile
    Then I should receive a 401 unauthorized error

  @implemented @api
  Scenario: Profile shows correct tier information
    Given I am logged in as a "patron" user
    When I request my profile
    Then my tier should be "patron"
    And I should see tier-specific limits

  # ============================================
  # IMPLEMENTED - Edit Profile
  # ============================================

  @implemented @api
  Scenario: Update my display name
    Given I am logged in as an approved user
    When I update my profile with name "New Display Name"
    Then my profile should show name "New Display Name"

  @implemented @api
  Scenario: Update preferred language
    Given I am logged in as an approved user
    When I update my profile with preferred_language "fa"
    Then my profile should show preferred_language "fa"

  @implemented @api
  Scenario: Cannot update protected fields
    Given I am logged in as an approved user
    When I try to update my tier to "admin"
    Then the tier should remain unchanged
    And I should not be an admin

  # ============================================
  # IMPLEMENTED - Profile Stats
  # ============================================

  @implemented @api
  Scenario: View my search count
    Given I am logged in as an approved user
    And I have performed 15 searches
    When I request my profile stats
    Then I should see search_count of 15

  @implemented @api
  Scenario: View my referral count
    Given I am logged in as an approved user
    And I have referred 3 users
    When I request my profile
    Then I should see referral_count of 3

  # ============================================
  # UI TESTS
  # ============================================

  @pending @ui
  Scenario: Profile page displays user info
    Given I am logged in as an approved user
    When I navigate to the profile page
    Then I should see my email displayed
    And I should see my tier badge
    And I should see member since date

  @pending @ui
  Scenario: Edit profile form validation
    Given I am logged in and on the profile page
    When I clear the name field
    And I click save
    Then I should see a validation error
    And my profile should not be updated

  @pending @ui
  Scenario: Profile changes are saved
    Given I am logged in and on the profile page
    When I change my name to "Updated Name"
    And I click save
    Then I should see a success message
    And my name should be "Updated Name"
