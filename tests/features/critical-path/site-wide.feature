@critical-path @implemented
Feature: Site-Wide Critical Path Tests
  Comprehensive tests for all pages and links across the entire SifterSearch application.
  These tests verify that all pages load, all links work, and core functionality is operational.

  Background:
    Given the application is running

  # ============================================
  # Public Pages - Must Always Work
  # ============================================

  @smoke
  Scenario: Home page loads successfully
    When I visit the home page
    Then the page should load without errors
    And I should see the SifterSearch logo
    And I should see the search input
    And I should see the version number

  @smoke
  Scenario: Quick search mode works
    Given I am on the home page
    When I click the lightning button
    And I type "prayer" in the search box
    And I wait for quick search results
    Then I should see quick search results
    And each result should have a paragraph number
    And each result should have a "Read More" button

  @smoke
  Scenario: Quick search Read More opens document
    Given I am on the home page
    And quick search mode is enabled
    When I type "prayer" in the search box
    And I wait for quick search results
    And I click "Read More" on the first result
    Then the document reader should open
    And the reader should show document content

  @smoke
  Scenario: About page loads
    When I navigate to "/about"
    Then the page should load without errors
    And the page title should be set

  @smoke
  Scenario: Library page loads
    When I navigate to "/library"
    Then the page should load without errors
    And I should see religion categories

  @smoke
  Scenario: Docs index page loads
    When I navigate to "/docs"
    Then the page should load without errors

  @smoke
  Scenario: Docs API page loads
    When I navigate to "/docs/api"
    Then the page should load without errors

  @smoke
  Scenario: Docs library page loads
    When I navigate to "/docs/library"
    Then the page should load without errors

  @smoke
  Scenario: Docs agents page loads
    When I navigate to "/docs/agents"
    Then the page should load without errors

  @smoke
  Scenario: Support page loads
    When I navigate to "/support"
    Then the page should load without errors

  @smoke
  Scenario: Contribute page loads
    When I navigate to "/contribute"
    Then the page should load without errors

  # ============================================
  # Quick Search - Extended Tests
  # ============================================

  @smoke
  Scenario: Quick search shows highlighted terms
    Given I am on the home page
    And quick search mode is enabled
    When I type "justice" in the search box
    And I wait for quick search results
    Then I should see quick search results
    And search results should contain highlighted terms

  # ============================================
  # Navigation Links (needs step implementation)
  # ============================================

  @pending
  Scenario: All header navigation links work
    Given I am on the home page
    Then all visible navigation links should be valid

  # ============================================
  # Library Navigation (needs step implementation)
  # ============================================

  @pending
  Scenario: Library religion pages load
    When I navigate to "/library"
    And I click on a religion category
    Then the religion page should load
    And I should see collections for that religion

  @pending
  Scenario: Library collection pages load
    Given I am on a religion page
    When I click on a collection
    Then the collection page should load
    And I should see documents in the collection

  @pending
  Scenario: Library document pages load
    Given I am on a collection page
    When I click on a document
    Then the document page should load
    And I should see the document content

  # ============================================
  # Authenticated Features (skipped - no auth)
  # ============================================

  @auth @pending
  Scenario: Profile page accessible when logged in
    Given I am logged in as an approved user
    When I navigate to "/profile"
    Then the page should load without errors

  @auth @pending
  Scenario: Settings page accessible when logged in
    Given I am logged in as an approved user
    When I navigate to "/settings"
    Then the page should load without errors

  # ============================================
  # Admin Features (skipped - no auth)
  # ============================================

  @admin @pending
  Scenario: Admin dashboard accessible
    Given I am logged in as an admin user
    When I navigate to "/admin"
    Then the page should load without errors

  # ============================================
  # Error Handling
  # ============================================

  @smoke
  Scenario: 404 page displays for invalid URLs
    When I navigate to "/this-page-does-not-exist-12345"
    Then the page should show a 404 error
    And there should be a link back to home
