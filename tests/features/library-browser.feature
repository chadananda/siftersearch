@library
Feature: Library Browser
  As a user of SifterSearch
  I want to browse the document library
  So that I can explore available texts and their metadata

  Background:
    Given the library contains indexed documents

  # ============================================
  # IMPLEMENTED - Library Page Access
  # ============================================

  @implemented
  Scenario: Library page is accessible
    When I navigate to the library page
    Then I should see the library browser interface
    And I should see the tree view navigation
    And I should see the document list area

  @implemented
  Scenario: Library shows document counts
    When I navigate to the library page
    Then I should see the total number of documents
    And I should see counts by religion

  # ============================================
  # IMPLEMENTED - Tree View Navigation
  # ============================================

  @implemented
  Scenario: Tree view shows religions
    When I navigate to the library page
    Then I should see religions listed in the tree view
    And each religion should show document count

  @implemented
  Scenario: Expanding a religion shows collections
    When I navigate to the library page
    And I expand the "Bahá'í" religion node
    Then I should see collections under "Bahá'í"
    And each collection should show document count

  @implemented
  Scenario: Clicking a collection filters documents
    When I navigate to the library page
    And I expand the "Bahá'í" religion node
    And I click on the "Core Publications" collection
    Then the document list should show only documents from that collection
    And the collection should appear selected

  # ============================================
  # IMPLEMENTED - Document List
  # ============================================

  @implemented
  Scenario: Document list shows document cards
    When I navigate to the library page
    Then I should see document cards in the list
    And each card should show the document title
    And each card should show the document author
    And each card should show the indexing status

  @implemented
  Scenario: Document cards show metadata tags
    When I navigate to the library page
    Then document cards should show religion tags
    And document cards should show collection tags
    And document cards should show language tags when available

  @implemented
  Scenario: Document status indicators are visible
    When I navigate to the library page
    Then indexed documents should show a green checkmark
    And processing documents should show a yellow clock
    And unindexed documents should show a gray circle

  # ============================================
  # IMPLEMENTED - Filtering
  # ============================================

  @implemented
  Scenario: Filter panel is visible
    When I navigate to the library page
    Then I should see the filter panel
    And I should see the religion filter dropdown
    And I should see the collection filter dropdown
    And I should see the language filter dropdown
    And I should see the author filter input
    And I should see the year range inputs
    And I should see the status filter dropdown

  @implemented
  Scenario: Filtering by religion updates document list
    When I navigate to the library page
    And I select "Bahá'í" from the religion filter
    Then all visible documents should be from the "Bahá'í" religion

  @implemented
  Scenario: Filtering by collection updates document list
    When I navigate to the library page
    And I select "Core Publications" from the collection filter
    Then all visible documents should be from the "Core Publications" collection

  @implemented
  Scenario: Filtering by status shows only matching documents
    When I navigate to the library page
    And I select "Indexed" from the status filter
    Then all visible documents should have "indexed" status

  @implemented
  Scenario: Multiple filters can be combined
    When I navigate to the library page
    And I select "Bahá'í" from the religion filter
    And I select "Indexed" from the status filter
    Then all visible documents should be from the "Bahá'í" religion
    And all visible documents should have "indexed" status

  @implemented
  Scenario: Clearing filters shows all documents
    Given I have applied religion filter "Bahá'í"
    When I select "All religions" from the religion filter
    Then I should see documents from all religions

  # ============================================
  # IMPLEMENTED - Document Selection
  # ============================================

  @implemented
  Scenario: Clicking a document card selects it
    When I navigate to the library page
    And I click on a document card
    Then the document card should appear selected
    And the document detail panel should open

  # ============================================
  # IMPLEMENTED - Document Detail Panel
  # ============================================

  @implemented
  Scenario: Document detail shows metadata
    Given I have selected a document
    Then I should see the document title in the detail panel
    And I should see the document metadata
    And I should see tab options for Metadata, Content, and Assets

  @implemented
  Scenario: Document detail metadata tab
    Given I have selected a document
    When I click the "Metadata" tab
    Then I should see all document metadata fields

  @implemented
  Scenario: Document detail content tab
    Given I have selected a document
    When I click the "Content" tab
    Then I should see the document content
    And I should see the paragraph count

  @implemented
  Scenario: Document detail assets tab
    Given I have selected a document
    When I click the "Assets" tab
    Then I should see asset links

  @implemented
  Scenario: Closing document detail panel
    Given I have selected a document
    When I close the document detail panel
    Then the detail panel should close
    And the document list should be visible

  # ============================================
  # IMPLEMENTED - Pagination
  # ============================================

  @implemented
  Scenario: Pagination appears for large document sets
    Given there are 100 documents in the library
    When I navigate to the library page
    Then I should see pagination controls
    And the first page of documents should be displayed

  @implemented
  Scenario: Navigating pages
    Given there are 100 documents in the library
    When I navigate to the library page
    And I click next page
    Then the second page of documents should be displayed
    And I should be able to navigate back
    When I click previous page
    Then the first page should be displayed again

  # ============================================
  # IMPLEMENTED - Sorting
  # ============================================

  @implemented
  Scenario: Sort controls are visible
    When I navigate to the library page
    Then I should see a sort dropdown

  @implemented
  Scenario: Sorting by title
    When I navigate to the library page
    And I select sort by "title"
    Then documents should be sorted alphabetically by title

  @implemented
  Scenario: Sorting by author
    When I navigate to the library page
    And I select sort by "author"
    Then documents should be sorted alphabetically by author

  @implemented
  Scenario: Reversing sort order
    When I navigate to the library page
    And I select sort by "title"
    And I toggle sort direction
    Then documents should be sorted in reverse order

  # ============================================
  # IMPLEMENTED - Admin Features
  # ============================================

  @implemented @admin
  Scenario: Admin sees edit and compare options
    Given I am logged in as an admin on the library page
    And the library contains indexed documents
    And I have selected a document
    Then I should see an Edit button
    And I should see a Compare tab
    And I should see S3 asset links

  @implemented @admin
  Scenario: Admin can edit document metadata
    Given I am logged in as an admin on the library page
    And the library contains indexed documents
    And I have selected a document
    When I click the Edit button
    Then I should see editable metadata fields
    When I modify the document title
    And I click Save
    Then the changes should be saved
    And I should see a success message

  @implemented @admin
  Scenario: Admin can view compare tab
    Given I am logged in as an admin on the library page
    And the library contains indexed documents
    And I have selected a document
    When I click the Compare tab
    Then I should see a side-by-side comparison
    And I should see the database content on one side
    And I should see the original file content on the other side

  # ============================================
  # IMPLEMENTED - Search Within Library
  # ============================================

  @implemented
  Scenario: Searching filters documents
    When I navigate to the library page
    And I type "Hidden" in the library search
    Then I should see only documents containing "Hidden"

  @implemented
  Scenario: Search combines with filters
    Given I have applied religion filter "Bahá'í"
    When I type "prayer" in the library search
    Then I should see only Bahá'í documents containing "prayer"

  # ============================================
  # IMPLEMENTED - Responsive Design
  # ============================================

  @implemented
  Scenario: Library is responsive on tablet
    Given my viewport is 768 pixels wide
    When I navigate to the library page
    Then the tree view should be collapsible
    And the document list should be visible

  @implemented
  Scenario: Library is responsive on mobile
    Given my viewport is 375 pixels wide
    When I navigate to the library page
    Then the tree view should be hidden by default
    And I should see a button to show the tree view
    And the document list should take full width
