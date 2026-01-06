@links @accessibility
Feature: All Links and Pages Work Correctly
  As a user of SifterSearch
  I want all clickable links to navigate to valid pages
  So that I never encounter broken screens or 404 errors

  # ============================================
  # PUBLIC PAGE ACCESSIBILITY
  # ============================================

  @implemented @critical
  Scenario Outline: Public pages load successfully
    When I navigate to "<path>"
    Then the page should load without errors
    And the page should have visible content
    And the page should not show a 404 error
    And the page should not show a 500 error

    Examples:
      | path                      |
      | /                         |
      | /about                    |
      | /library                  |
      | /community                |
      | /contribute               |
      | /docs                     |
      | /docs/api                 |
      | /docs/library             |
      | /docs/agents              |
      | /docs/agents/analyzer     |
      | /docs/agents/librarian    |
      | /docs/agents/memory       |
      | /docs/agents/narrator     |
      | /docs/agents/researcher   |
      | /docs/agents/sifter       |
      | /docs/agents/transcriber  |
      | /docs/agents/translator   |
      | /support                  |

  # ============================================
  # NAVIGATION BAR LINKS
  # ============================================

  @implemented
  Scenario: Chat/Search link navigates to home page
    Given I am on the library page
    When I click the "Chat" link in the navigation
    Then I should be on the home page

  @implemented
  Scenario: Library link navigates to library page
    Given I am on the home page
    When I click the "Library" link in the navigation
    Then I should be on the library page

  @implemented
  Scenario: Community link navigates to community page
    Given I am on the home page
    When I click the "Community" link in the navigation
    Then I should be on the community page

  @implemented
  Scenario: Docs link navigates to docs page
    Given I am on the home page
    When I click the "Docs" link in the navigation
    Then I should be on the docs page

  @implemented
  Scenario: About link navigates to about page
    Given I am on the home page
    When I click the hamburger menu
    And I click the "About" link in the dropdown
    Then I should be on the about page

  # ============================================
  # SUPPORT PAGE LINKS
  # ============================================

  @implemented
  Scenario: Contribute link on support page works
    Given I am on the support page
    When I click the "Contribute Texts" link
    Then I should be on the contribute page

  @implemented
  Scenario: Referrals link on support page works
    Given I am on the support page
    When I click the "Refer Friends" link
    Then I should be redirected to referrals or login

  @implemented
  Scenario: Community link on support page works
    Given I am on the support page
    When I click the "Join the Community" link
    Then I should be on the community page

  # ============================================
  # AUTH-REQUIRED PAGES
  # ============================================

  @implemented
  Scenario Outline: Auth-required pages handle unauthenticated users
    Given I am not authenticated
    When I navigate to "<path>"
    Then I should see a login prompt or access denied message

    Examples:
      | path       |
      | /profile   |
      | /settings  |
      | /referrals |

  # ============================================
  # ADMIN PAGES
  # ============================================

  @implemented
  Scenario Outline: Admin pages restrict non-admin access
    Given I am not authenticated
    When I navigate to "<path>"
    Then I should see an access denied message

    Examples:
      | path              |
      | /admin            |
      | /admin/pending    |
      | /admin/documents  |
      | /admin/users      |
      | /admin/ai-usage   |
      | /admin/raw-search |

  # ============================================
  # MOBILE NAVIGATION
  # ============================================

  @implemented
  Scenario: Mobile hamburger menu opens and contains all links
    Given my viewport is 375 pixels wide
    And I am on the home page
    When I click the hamburger menu
    Then I should see all navigation links in the dropdown
    And I should see "Library" in the dropdown
    And I should see "Community" in the dropdown
    And I should see "Docs" in the dropdown
    And I should see "About" in the dropdown

  @implemented
  Scenario: Mobile navigation links work correctly
    Given my viewport is 375 pixels wide
    And I am on the home page
    When I click the hamburger menu
    And I click "Library" in the dropdown
    Then I should be on the library page

  # ============================================
  # ACCESSIBILITY
  # ============================================

  @implemented @a11y
  Scenario: Navigation has proper ARIA landmarks
    Given I am on the home page
    Then there should be a navigation landmark
    And there should be a main content landmark

  @implemented @a11y
  Scenario: Interactive elements are keyboard accessible
    Given I am on the home page
    When I tab through the page
    Then focusable elements should receive focus
    And focus should be visible

  @implemented @a11y
  Scenario: Buttons have accessible names
    Given I am on the home page
    Then all buttons should have accessible names

  # ============================================
  # PAGE CONTENT VALIDATION
  # ============================================

  @implemented
  Scenario: Home page has search functionality
    Given I am on the home page
    Then I should see a search input
    And I should see a submit button

  @implemented
  Scenario: Library page shows library content
    Given I am on the library page
    Then I should see library content or collections

  @implemented
  Scenario: Docs page shows documentation
    Given I am on the docs page
    Then I should see documentation content

  @implemented
  Scenario: Support page shows donation options
    Given I am on the support page
    Then I should see support or donation options
