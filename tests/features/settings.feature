@settings
Feature: User Settings Management
  As a registered user
  I want to manage my account settings
  So that I can control my password and preferences

  # ============================================
  # IMPLEMENTED - Password Change
  # ============================================

  @implemented @api @security
  Scenario: Change password with correct current password
    Given I am logged in as an approved user
    When I change my password:
      | current_password | oldPassword123 |
      | new_password     | newPassword456 |
    Then I should receive a success response
    And I should be able to login with the new password

  @implemented @api @security
  Scenario: Cannot change password with wrong current password
    Given I am logged in as an approved user
    When I change my password with incorrect current password
    Then I should receive a 400 bad request error
    And the error message should mention "current password"

  @implemented @api @security
  Scenario: Password must meet strength requirements
    Given I am logged in as an approved user
    When I change my password to "weak"
    Then I should receive a validation error
    And the error should mention password requirements

  # ============================================
  # IMPLEMENTED - Notification Preferences
  # ============================================

  @implemented @api
  Scenario: Update email notification preferences
    Given I am logged in as an approved user
    When I update my notification preferences:
      | email_updates    | false |
      | forum_replies    | true  |
      | document_updates | true  |
    Then my preferences should be saved

  @implemented @api
  Scenario: Get current notification preferences
    Given I am logged in as an approved user
    When I request my preferences
    Then I should see my current notification settings

  # ============================================
  # IMPLEMENTED - Session Management
  # ============================================

  @implemented @api
  Scenario: View active sessions
    Given I am logged in as an approved user
    When I request my active sessions
    Then I should see at least 1 active session
    And the session should include device info

  @implemented @api
  Scenario: Logout from all devices
    Given I am logged in on multiple devices
    When I logout from all devices
    Then all my sessions should be terminated
    And I should receive a new session for current device

  # ============================================
  # IMPLEMENTED - Account Deletion
  # ============================================

  @implemented @api @security
  Scenario: Request account deletion
    Given I am logged in as an approved user
    When I request to delete my account
    Then I should receive a confirmation requirement
    And my account should not be deleted yet

  @implemented @api @security
  Scenario: Confirm account deletion
    Given I am logged in as an approved user
    And I have requested account deletion
    When I confirm deletion with my password
    Then my account should be soft-deleted
    And I should be logged out
    And I should not be able to login

  # ============================================
  # UI TESTS
  # ============================================

  @pending @ui
  Scenario: Settings page shows all sections
    Given I am logged in as an approved user
    When I navigate to the settings page
    Then I should see the password section
    And I should see the notifications section
    And I should see the danger zone section

  @pending @ui
  Scenario: Password change requires confirmation
    Given I am logged in and on the settings page
    When I enter a new password
    And the confirmation does not match
    Then I should see a mismatch error
    And the save button should be disabled

  @pending @ui
  Scenario: Delete account requires confirmation modal
    Given I am logged in and on the settings page
    When I click delete account
    Then I should see a confirmation modal
    And I should be required to type my email to confirm
