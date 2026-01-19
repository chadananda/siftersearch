@visual @implemented
Feature: Visual Regression Testing
  As a developer of SifterSearch
  I want to verify that UI components render correctly
  So that I can catch visual regressions before deployment

  Background:
    Given I have launched the browser
    And the application is running

  # ============================================
  # Home Page Visual Tests
  # ============================================

  @critical-path @home
  Scenario: Home page renders correctly
    When I navigate to the home page
    Then the page should load without errors
    And the search input should be visible
    And the lightning button should be visible
    And the header navigation should be visible
    And I should capture a screenshot named "home-page"

  @home
  Scenario: Home page in dark mode
    Given I navigate to the home page
    When I toggle dark mode
    Then the background should be dark
    And text should have appropriate contrast
    And I should capture a screenshot named "home-page-dark"

  @home
  Scenario: Home page on mobile viewport
    Given I am on a mobile device
    When I navigate to the home page
    Then the layout should be responsive
    And the hamburger menu should be visible
    And I should capture a screenshot named "home-page-mobile"

  # ============================================
  # Search Results Visual Tests
  # ============================================

  @critical-path @search
  Scenario: Quick search results display correctly
    Given I navigate to the home page
    And quick search mode is enabled
    When I type "prayer" in the search box
    And I wait for quick search results
    Then I should see quick search results
    And each result should have proper styling
    And highlighted terms should be visible
    And I should capture a screenshot named "quick-search-results"

  @search
  Scenario: Search results show authority indicators
    Given I navigate to the home page
    And quick search mode is enabled
    When I type "Bahá'u'lláh" in the search box
    And I wait for quick search results
    Then results should show authority badges
    And high authority results should be visually distinct
    And I should capture a screenshot named "search-authority-badges"

  @search
  Scenario: Search results pagination works
    Given I navigate to the home page
    And quick search mode is enabled
    When I type "God" in the search box
    And I wait for quick search results
    And I scroll to load more results
    Then more results should be loaded
    And I should capture a screenshot named "search-pagination"

  # ============================================
  # Library Browser Visual Tests
  # ============================================

  @critical-path @library
  Scenario: Library browser renders tree view
    Given I am logged in
    When I navigate to the library page
    Then the religion tree should be visible
    And the document list should be visible
    And I should capture a screenshot named "library-browser"

  @library
  Scenario: Library collection detail page
    Given I am logged in
    When I navigate to a collection page
    Then the collection header should be visible
    And the document grid should be displayed
    And I should capture a screenshot named "library-collection"

  @library
  Scenario: Library document reader
    Given I am logged in
    When I navigate to a document page
    Then the document title should be visible
    And the document content should be readable
    And the navigation should be visible
    And I should capture a screenshot named "library-document"

  # ============================================
  # Document Reader Visual Tests
  # ============================================

  @reader
  Scenario: Reader modal opens from search result
    Given I navigate to the home page
    And quick search mode is enabled
    When I type "prayer" in the search box
    And I wait for quick search results
    And I click Read More on the first result
    Then the document reader should open
    And the reader should show document content
    And I should capture a screenshot named "reader-modal"

  @reader
  Scenario: Reader shows paragraph numbers
    Given I am reading a document
    Then paragraph numbers should be visible
    And paragraph numbers should be styled correctly
    And I should capture a screenshot named "reader-paragraphs"

  @reader
  Scenario: Reader navigation works
    Given I am reading a document
    When I click the next section button
    Then the reader should scroll to next section
    And the current section should be highlighted
    And I should capture a screenshot named "reader-navigation"

  # ============================================
  # Authentication Visual Tests
  # ============================================

  @auth
  Scenario: Login form displays correctly
    When I navigate to the login page
    Then the email input should be visible
    And the password input should be visible
    And the login button should be visible
    And I should capture a screenshot named "login-form"

  @auth
  Scenario: Signup form displays correctly
    When I navigate to the signup page
    Then the name input should be visible
    And the email input should be visible
    And the password input should be visible
    And the signup button should be visible
    And I should capture a screenshot named "signup-form"

  @auth
  Scenario: Password reset form displays correctly
    When I navigate to the forgot password page
    Then the email input should be visible
    And the reset button should be visible
    And I should capture a screenshot named "password-reset-form"

  # ============================================
  # Navigation Visual Tests
  # ============================================

  @navigation
  Scenario: Header navigation displays all links
    Given I navigate to the home page
    Then the header should contain navigation links
    And the logo should be visible
    And the search bar should be in the header
    And I should capture a screenshot named "header-navigation"

  @navigation
  Scenario: Footer displays correctly
    Given I navigate to the home page
    When I scroll to the footer
    Then the footer should be visible
    And footer links should be present
    And I should capture a screenshot named "footer"

  @navigation
  Scenario: Mobile menu opens correctly
    Given I am on a mobile device
    When I navigate to the home page
    And I click the hamburger menu
    Then the mobile menu should slide in
    And all navigation links should be visible
    And I should capture a screenshot named "mobile-menu"

  # ============================================
  # Admin Panel Visual Tests
  # ============================================

  @admin
  Scenario: Admin dashboard displays correctly
    Given I am logged in as admin
    When I navigate to the admin dashboard
    Then the stats overview should be visible
    And the navigation sidebar should be visible
    And I should capture a screenshot named "admin-dashboard"

  @admin
  Scenario: Admin user management page
    Given I am logged in as admin
    When I navigate to the admin users page
    Then the user list should be visible
    And user actions should be available
    And I should capture a screenshot named "admin-users"

  @admin
  Scenario: Admin library management page
    Given I am logged in as admin
    When I navigate to the admin library page
    Then the pending documents should be visible
    And the ingestion queue should be visible
    And I should capture a screenshot named "admin-library"

  # ============================================
  # Accessibility Visual Tests
  # ============================================

  @a11y
  Scenario: Keyboard focus is visible
    Given I navigate to the home page
    When I press Tab to navigate
    Then focus indicators should be visible
    And focused elements should have outline
    And I should capture a screenshot named "focus-indicators"

  @a11y
  Scenario: Color contrast meets WCAG standards
    Given I navigate to the home page
    Then text should have sufficient contrast
    And interactive elements should be distinguishable
    And I should capture a screenshot named "color-contrast"

  # ============================================
  # Error State Visual Tests
  # ============================================

  @errors
  Scenario: 404 page displays correctly
    When I navigate to a non-existent page
    Then the 404 error page should display
    And the error message should be clear
    And a link to home should be present
    And I should capture a screenshot named "error-404"

  @errors
  Scenario: Search error state displays correctly
    Given I navigate to the home page
    When the search service is unavailable
    Then an error message should display
    And the error should be user-friendly
    And I should capture a screenshot named "search-error"

  # ============================================
  # Responsive Design Tests
  # ============================================

  @responsive
  Scenario: Tablet viewport displays correctly
    Given I am on a tablet device
    When I navigate to the home page
    Then the layout should adapt to tablet width
    And content should be readable
    And I should capture a screenshot named "tablet-home"

  @responsive
  Scenario: Search results on tablet
    Given I am on a tablet device
    When I navigate to the home page
    And I perform a search
    Then search results should be responsive
    And cards should stack appropriately
    And I should capture a screenshot named "tablet-search"

  @responsive
  Scenario: Library on tablet
    Given I am on a tablet device
    And I am logged in
    When I navigate to the library page
    Then the sidebar should be collapsible
    And documents should display in grid
    And I should capture a screenshot named "tablet-library"
