@critical-path
Feature: Critical Path Tests
  Essential user flows that MUST pass before every deployment.
  These tests verify the core functionality works end-to-end.

  All selectors use ARIA roles/labels for accessibility compliance.

  # ============================================
  # Home Page & Navigation
  # ============================================

  @critical-path @smoke
  Scenario: Home page loads successfully
    Given I am on the home page
    Then I should see the navigation bar
    And I should see the search interface
    And the page should have no critical console errors

  @critical-path @smoke
  Scenario: Navigation links work
    Given I am on the home page
    When I click on the "Docs" navigation link
    Then I should be on the docs page
    When I click on the "Chat" navigation link
    Then I should be on the home page

  # ============================================
  # Search Functionality
  # ============================================

  @critical-path @search
  Scenario: Basic search returns results
    Given I am on the home page
    When I enter "prayer" in the search box
    And I submit the search
    Then I should see search results
    And results should contain relevant passages

  @critical-path @search
  Scenario: Empty search is handled gracefully
    Given I am on the home page
    When I submit the search without entering text
    Then I should see a helpful message or remain on search
    And the page should not show an error

  # ============================================
  # Library Browser
  # ============================================

  @critical-path @library
  Scenario: Library page loads with documents
    Given I am on the library page
    Then I should see the library interface
    And I should see document cards or a document list
    And I should see the document count

  @critical-path @library
  Scenario: Library filtering works
    Given I am on the library page
    When I filter by a religion
    Then the document list should update
    And filtered results should reflect the filter

  # ============================================
  # Authentication Flow
  # ============================================

  @critical-path @auth
  Scenario: Sign in modal opens
    Given I am not authenticated
    And I am on the home page
    When I click the "Sign In" button
    Then I should see the sign in form
    And I should see the email input
    And I should see the password input

  @critical-path @auth
  Scenario: Sign in with valid credentials
    Given I am not authenticated
    And I am on the home page
    When I click the "Sign In" button
    And I enter valid test credentials
    And I submit the sign in form
    Then I should be authenticated
    And I should see the user menu

  @critical-path @auth
  Scenario: Sign out works
    Given I am authenticated as a test user
    And I am on the home page
    When I open the user menu
    And I click "Sign Out"
    Then I should be signed out
    And I should see the "Sign In" button

  # ============================================
  # Theme & Accessibility
  # ============================================

  @critical-path @a11y
  Scenario: Theme toggle works
    Given I am on the home page
    When I click the theme toggle button
    Then the theme should change
    And the preference should be remembered on reload

  @critical-path @a11y
  Scenario: Page is keyboard navigable
    Given I am on the home page
    When I press Tab repeatedly
    Then focus should move through interactive elements
    And focus should be visible

  # ============================================
  # Stats & Ingestion Progress
  # ============================================

  @critical-path @stats
  Scenario: Library stats are displayed
    Given I am on the home page
    Then I should see the "Library Contents" stats panel
    And I should see a religions count greater than 0
    And I should see a documents count greater than 0
    And I should see a paragraphs count greater than 0

  @critical-path @stats @ingestion
  Scenario: Ingestion progress bar displays correctly
    Given I am on the home page
    Then I should see the ingestion progress section
    And I should see "Content indexed" label
    And I should see a percentage value
    And I should see the progress bar
    And the progress bar fill should be visible with color
    And I should see document counts in format "X / Y documents"

  # ============================================
  # Error Handling
  # ============================================

  @critical-path @errors
  Scenario: 404 page displays correctly
    When I navigate to a non-existent page "/this-page-does-not-exist"
    Then I should see the 404 error page
    And I should see a way to return home

  @critical-path @errors
  Scenario: API errors are handled gracefully
    Given the API returns an error
    When I perform a UI search
    Then I should see a user-friendly error message
    And the page should remain functional
