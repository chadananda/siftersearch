@quick-search @ui
Feature: Quick Search Mode
  As a user of SifterSearch
  I want to use quick search mode for fast keyword searches
  So that I can quickly find relevant passages without AI analysis

  # ============================================
  # Quick Search Mode (Lightning Button Toggle)
  # These are UI-only tests - uses production API
  # ============================================

  @implemented
  Scenario: Toggle quick search mode with lightning button
    Given I navigate to the home page
    When I click the lightning button
    Then quick search mode should be enabled
    And the lightning button should appear active
    And the search placeholder should say "Type to search instantly..."

  @implemented
  Scenario: Quick search returns instant results
    Given I navigate to the home page
    And quick search mode is enabled
    When I type "divine unity" in the search box
    And I wait for quick search results
    Then I should see quick search results
    And the results count should be displayed

  @implemented
  Scenario: Quick search results have proper source card styling
    Given I navigate to the home page
    And quick search mode is enabled
    When I type "antichrist" in the search box
    And I wait for quick search results
    Then quick search results should use source-card styling
    And each result should have a paragraph number
    And each result should have a citation bar
    And each result should have a "Read More" button

  @implemented
  Scenario: Quick search highlights matching terms
    Given I navigate to the home page
    And quick search mode is enabled
    When I type "divine unity" in the search box
    And I wait for quick search results
    Then search results should contain highlighted terms

  @implemented
  Scenario: Quick search Read More opens document reader
    Given I navigate to the home page
    And quick search mode is enabled
    When I type "divine" in the search box
    And I wait for quick search results
    And I click "Read More" on the first result
    Then the document reader should open
    And the reader should show document content

  @implemented
  Scenario: Toggle back to AI search mode
    Given I navigate to the home page
    And quick search mode is enabled
    When I click the lightning button
    Then quick search mode should be disabled
    And the search placeholder should say "Search sacred texts..."
