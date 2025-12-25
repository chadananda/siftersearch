@navigation
Feature: Navigation Bar
  As a user of SifterSearch
  I want a consistent navigation bar across all pages
  So that I can easily access different sections of the application

  Background:
    Given I am on the home page

  # ============================================
  # IMPLEMENTED - Basic Navigation
  # ============================================

  @implemented
  Scenario: Navigation bar is visible on home page
    Then I should see the navigation bar
    And I should see the SifterSearch logo
    And I should see the theme toggle button

  @implemented
  Scenario: Navigation links are visible on desktop
    Given my viewport is 1200 pixels wide
    Then I should see the "Search" navigation link
    And I should see the "Library" navigation link
    And I should see the "Community" navigation link
    And I should see the "Docs" navigation link

  @implemented
  Scenario: Navigation links progressively collapse on smaller screens
    Given my viewport is 800 pixels wide
    Then I should see the "Search" navigation link
    And I should see the "Library" navigation link
    And I should see the "Community" navigation link
    But I should not see the "Docs" navigation link in the main nav
    And I should see the hamburger menu button

  @implemented
  Scenario: Hamburger menu contains collapsed links
    Given my viewport is 800 pixels wide
    When I click the hamburger menu button
    Then I should see "Docs" in the dropdown menu
    And I should see "About" in the dropdown menu

  @implemented
  Scenario: All navigation links collapse on mobile
    Given my viewport is 500 pixels wide
    Then I should not see any navigation links in the main nav
    And I should see the hamburger menu button

  @implemented
  Scenario: Mobile hamburger menu contains all links
    Given my viewport is 500 pixels wide
    When I click the hamburger menu button
    Then I should see "Search" in the dropdown menu
    And I should see "Library" in the dropdown menu
    And I should see "Community" in the dropdown menu
    And I should see "Docs" in the dropdown menu
    And I should see "About" in the dropdown menu

  # ============================================
  # IMPLEMENTED - User Menu
  # ============================================

  @implemented
  Scenario: Sign In button visible when not authenticated
    Given I am not authenticated
    Then I should see the "Sign In" button

  @implemented
  Scenario: User menu visible when authenticated
    Given I am logged in as an approved user
    When I navigate to the home page
    Then I should see my user avatar
    And I should not see the "Sign In" button

  @implemented
  Scenario: User menu dropdown contains account links
    Given I am logged in as an approved user
    When I navigate to the home page
    And I click on my user avatar
    Then I should see "Profile" in the user dropdown
    And I should see "Settings" in the user dropdown
    And I should see "Referrals" in the user dropdown
    And I should see "Support" in the user dropdown
    And I should see "Sign Out" in the user dropdown

  @implemented
  Scenario: Admin users see Admin link in dropdown
    Given I am logged in as an admin
    When I navigate to the home page
    And I click on my user avatar
    Then I should see "Admin" in the user dropdown

  @implemented
  Scenario: Non-admin users do not see Admin link
    Given I am logged in as an approved user
    When I navigate to the home page
    And I click on my user avatar
    Then I should not see "Admin" in the user dropdown

  # ============================================
  # IMPLEMENTED - Navigation Actions
  # ============================================

  @implemented
  Scenario: Clicking Search navigates to home page
    When I click on the "Search" navigation link
    Then I should be on the home page
    And the "Search" link should be active

  @implemented
  Scenario: Clicking Library navigates to library page
    When I click on the "Library" navigation link
    Then I should be on the library page
    And the "Library" link should be active

  @implemented
  Scenario: Clicking theme toggle changes theme
    Given the current theme is "light"
    When I click the theme toggle button
    Then the current theme should be "dark"
    When I click the theme toggle button again
    Then the current theme should be "light"

  # ============================================
  # IMPLEMENTED - Cross-Page Consistency
  # ============================================

  @implemented
  Scenario: NavBar is consistent across Search page
    Given I am on the search page
    Then I should see the navigation bar
    And the "Search" link should be active

  @implemented
  Scenario: NavBar is consistent across Library page
    Given I am on the library page
    Then I should see the navigation bar
    And the "Library" link should be active

  @implemented
  Scenario: NavBar is consistent across Docs page
    Given I am on the docs page
    Then I should see the navigation bar
    And the "Docs" link should be active
