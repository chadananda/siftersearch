@document-viewing @library
Feature: Document Viewing and Presentation
  As a user of SifterSearch
  I want to view documents in different modes with all features working
  So that I can read and study texts effectively

  Background:
    Given the library contains documents with translations
    And I am on the library page

  # ============================================
  # DOCUMENT ACCESS VIA SEMANTIC URLS
  # ============================================

  @implemented @critical
  Scenario: Document loads via semantic URL
    When I navigate to "/library/bahai/core-tablets/the-bab-a-ifiy-i-baynil-aramayn-ar"
    Then the page should load without errors
    And I should see the document presentation interface
    And I should see the document title
    And I should not see a 404 error

  @implemented @critical
  Scenario: Document slug redirects work
    When I navigate to an old document slug URL
    Then I should be redirected to the canonical URL with HTTP 301
    And the document should load correctly

  @implemented
  Scenario: Invalid document path shows 404
    When I navigate to "/library/invalid/invalid/invalid"
    Then I should see the 404 error page

  # ============================================
  # DEFAULT VIEW MODE
  # ============================================

  @implemented @critical
  Scenario: Document opens in default view mode
    When I open a document from the library
    Then I should see the default reading view
    And I should see the document title with curly quotes
    And I should see document tags (language, category)
    And I should see the document description as an abstract
    And I should see the full document content
    And the view mode should be "default"

  @implemented
  Scenario: Document title uses curly smart quotes
    When I open a document with quotes in the title
    Then straight quotes should be converted to curly quotes
    And I should see " instead of "
    And I should see ' instead of '

  @implemented
  Scenario: Document abstract displays correctly
    When I open a document with a description
    Then I should see the description as an abstract
    And the abstract should be centered
    And the abstract should be italic
    And the abstract should be 80% width
    And the abstract should have readable font size
    And the abstract should not have a background color

  @implemented
  Scenario: Document without description shows no abstract
    When I open a document without a description
    Then I should not see an abstract section

  # ============================================
  # SIDE-BY-SIDE (SBS) VIEW MODE
  # ============================================

  @implemented @critical
  Scenario: Switch to side-by-side view
    Given I have opened a document with translation
    When I click the "Side-by-Side" view mode button
    Then the view mode should change to "sbs"
    And I should see original text on the right
    And I should see translation on the left
    And paragraphs should be aligned side-by-side

  @implemented @critical
  Scenario: SBS mode shows phrase-level highlighting
    Given I have opened a document in SBS mode
    And the document has sentence markers
    When I hover over a phrase in the original text
    Then the corresponding phrase in the translation should highlight
    When I hover over a phrase in the translation
    Then the corresponding phrase in the original should highlight

  @implemented
  Scenario: SBS mode handles documents with missing markers
    Given I have opened a document without sentence markers in SBS mode
    Then the document should still display correctly
    But phrase-level highlighting should not be available
    And I should see paragraph-level alignment only

  @implemented
  Scenario: SBS mode respects RTL text direction
    Given I have opened an Arabic document in SBS mode
    Then the original text column should use RTL direction
    And the translation column should use LTR direction
    And the layout should be appropriate for RTL content

  # ============================================
  # STUDY VIEW MODE
  # ============================================

  @implemented @critical
  Scenario: Switch to study view mode
    Given I have opened a document with translation
    When I click the "Study" view mode button
    Then the view mode should change to "study"
    And I should see literal translation with grammatical notes
    And I should see word-by-word breakdown
    And I should see linguistic annotations

  @implemented
  Scenario: Study mode shows detailed grammatical information
    Given I have opened a document in study mode
    Then I should see part-of-speech tags
    And I should see morphological analysis
    And I should see grammatical notes

  # ============================================
  # VIEW MODE URL PARAMETERS (SHAREABILITY)
  # ============================================

  @implemented @critical
  Scenario: Default view mode has no URL parameter
    When I open a document in default mode
    Then the URL should not contain a "view" parameter
    And the URL should be the canonical document URL

  @implemented @critical
  Scenario: SBS view mode adds URL parameter
    Given I have opened a document
    When I switch to SBS mode
    Then the URL should contain "?view=sbs"
    And the page should not reload
    And the URL should update via history.replaceState

  @implemented @critical
  Scenario: Study view mode adds URL parameter
    Given I have opened a document
    When I switch to study mode
    Then the URL should contain "?view=study"
    And the page should not reload

  @implemented @critical
  Scenario: Direct link to SBS mode opens in SBS
    When I navigate to a document URL with "?view=sbs"
    Then the document should open directly in SBS mode
    And I should not see the default view first

  @implemented @critical
  Scenario: Direct link to study mode opens in study mode
    When I navigate to a document URL with "?view=study"
    Then the document should open directly in study mode

  @implemented
  Scenario: Invalid view parameter defaults to standard view
    When I navigate to a document URL with "?view=invalid"
    Then the document should open in default mode
    And the URL should be cleaned to remove invalid parameter

  @implemented @critical
  Scenario: Switching view modes updates URL for sharing
    Given I have opened a document in default mode
    When I switch to SBS mode
    And I copy the URL
    And I share it with another user
    Then the shared URL should open in SBS mode
    And the recipient should see the same view

  # ============================================
  # QR CODE GENERATION
  # ============================================

  @implemented @critical
  Scenario: Document shows QR code for sharing
    When I open a document
    Then I should see a QR code
    And the QR code should be visible
    And the QR code should be scannable

  @implemented @critical
  Scenario: QR code includes current view mode
    Given I have opened a document in default mode
    Then the QR code should encode the default URL
    When I switch to SBS mode
    Then the QR code should update automatically
    And the QR code should encode the SBS URL with "?view=sbs"

  @implemented @critical
  Scenario: QR code works in logged-out state
    Given I am not authenticated
    When I scan a document QR code on mobile
    Then I should be able to view the document
    And I should not see a login error
    And the document should load in the correct view mode

  @implemented
  Scenario: QR code updates when switching to study mode
    Given I have opened a document
    When I switch to study mode
    Then the QR code should update
    And the QR code should encode the study URL with "?view=study"

  # ============================================
  # VIEW MODE PERSISTENCE AND STATE
  # ============================================

  @implemented
  Scenario: View mode persists during navigation within document
    Given I have opened a document in SBS mode
    When I scroll through the document
    Then the view mode should remain SBS
    And the URL parameter should remain "?view=sbs"

  @implemented
  Scenario: View mode resets when navigating to different document
    Given I have opened Document A in SBS mode
    When I navigate to Document B
    Then Document B should open in default mode
    # Note: Unless Document B URL has a view parameter

  @implemented
  Scenario: Browser back button preserves view mode
    Given I opened Document A in default mode
    And I switched to SBS mode
    And I navigated to Document B
    When I click browser back button
    Then I should return to Document A
    And Document A should be in SBS mode

  # ============================================
  # DOCUMENT METADATA DISPLAY
  # ============================================

  @implemented
  Scenario: Document shows all metadata tags
    When I open a document
    Then I should see the language tag
    And I should see the category/collection tag
    And I should see the religion tag
    And tags should use appropriate styling

  @implemented
  Scenario: Document shows author information
    When I open a document with an author
    Then I should see the author name
    And the author should be displayed prominently

  @implemented
  Scenario: Document shows translation status
    When I open a document with translation
    Then I should see translation indicators
    And I should see which languages are available

  # ============================================
  # DOCUMENT CONTENT RENDERING
  # ============================================

  @implemented
  Scenario: Document paragraphs render correctly
    When I open a document
    Then paragraphs should be properly separated
    And paragraph spacing should be appropriate
    And text should be readable

  @implemented
  Scenario: Arabic/Persian text displays with correct font
    When I open an Arabic or Persian document
    Then the text should use an appropriate RTL font
    And diacritics should render correctly
    And ligatures should be preserved

  @implemented
  Scenario: Markdown formatting is preserved in content
    When I open a document with markdown formatting
    Then bold text should be rendered bold
    And italic text should be rendered italic
    And headings should be appropriately sized

  # ============================================
  # TRANSLATION INTEGRATION
  # ============================================

  @implemented
  Scenario: Request translation button appears for untranslated documents
    Given I have opened a document without translation
    When I switch to SBS mode
    Then I should see a "Request Translation" button
    And the button should be clearly visible

  @implemented @patron
  Scenario: Requesting translation queues a job
    Given I am a patron user
    And I have opened a document without translation in SBS mode
    When I click "Request Translation"
    Then a translation job should be queued
    And I should see a progress indicator
    And the translation should auto-segment missing markers

  @implemented
  Scenario: Translation progress displays correctly
    Given I have requested a translation
    When the translation is processing
    Then I should see a progress bar or indicator
    And I should see percentage complete
    And I should see estimated time remaining

  @implemented
  Scenario: Translation completion updates the view
    Given I have requested a translation
    When the translation completes
    Then the SBS view should update automatically
    And I should see the translated text
    And phrase highlighting should work if markers were added

  # ============================================
  # RESPONSIVE DESIGN
  # ============================================

  @implemented
  Scenario: Document viewing is responsive on tablet
    Given my viewport is 768 pixels wide
    When I open a document
    Then the layout should adapt to tablet size
    And content should remain readable
    And view mode buttons should be accessible

  @implemented
  Scenario: Document viewing is responsive on mobile
    Given my viewport is 375 pixels wide
    When I open a document
    Then the layout should adapt to mobile size
    And SBS view should stack vertically on mobile
    And text should remain readable without horizontal scroll

  @implemented
  Scenario: Mobile SBS view stacks original and translation
    Given my viewport is 375 pixels wide
    And I have opened a document in SBS mode
    Then original and translation should stack vertically
    And both should be full width
    And phrase highlighting should still work

  # ============================================
  # ACCESSIBILITY
  # ============================================

  @implemented @a11y
  Scenario: Document viewing is keyboard navigable
    When I open a document
    Then I should be able to tab through view mode buttons
    And I should be able to activate buttons with Enter/Space
    And focus should be visible

  @implemented @a11y
  Scenario: Document has proper heading structure
    When I open a document
    Then the document title should be an h1
    And section headings should be properly nested
    And screen readers should navigate correctly

  @implemented @a11y
  Scenario: View mode buttons have accessible labels
    When I open a document
    Then view mode buttons should have aria-labels
    And the current view mode should be indicated to screen readers

  # ============================================
  # ERROR HANDLING
  # ============================================

  @implemented
  Scenario: Missing document shows helpful error
    When I navigate to a document that doesn't exist
    Then I should see a user-friendly error message
    And I should see a link back to the library
    And I should not see a technical error

  @implemented
  Scenario: Document loading error is handled gracefully
    Given the API returns an error for a document
    When I try to open the document
    Then I should see an error message
    And the page should not crash
    And I should be able to retry or go back

  @implemented
  Scenario: Translation error is handled gracefully
    Given a translation request fails
    When I am waiting for translation
    Then I should see an error message
    And I should be able to retry
    And the document should remain viewable in default mode

  # ============================================
  # PERFORMANCE
  # ============================================

  @implemented
  Scenario: Large documents load efficiently
    When I open a document with 1000+ paragraphs
    Then the initial view should load within 2 seconds
    And scrolling should be smooth
    And memory usage should be reasonable

  @implemented
  Scenario: Switching view modes is instant
    Given I have opened a large document
    When I switch between view modes
    Then the switch should happen within 500ms
    And there should be no visible lag
    And the document should not reload

  # ============================================
  # INTEGRATION WITH LIBRARY BROWSER
  # ============================================

  @implemented
  Scenario: Opening document from library preserves context
    Given I have filtered the library to show Arabic documents
    When I open a document
    And I navigate back to the library
    Then my filters should be preserved
    And my scroll position should be restored

  @implemented
  Scenario: Document breadcrumb navigation works
    When I open a document
    Then I should see breadcrumb navigation
    And I should see Library > Religion > Collection > Document
    When I click on a breadcrumb
    Then I should navigate to that level

  # ============================================
  # SEO AND METADATA
  # ============================================

  @implemented @seo
  Scenario: Document page has proper meta tags
    When I open a document
    Then the page title should include the document title
    And the page should have meta description
    And the page should have Open Graph tags
    And the page should have canonical URL

  @implemented @seo
  Scenario: View mode is reflected in page title
    Given I have opened a document in SBS mode
    Then the page title should include "(Side-by-Side)"
    When I switch to study mode
    Then the page title should include "(Study Mode)"

  @implemented @seo
  Scenario: Document has structured data for breadcrumbs
    When I open a document
    Then the page should have JSON-LD breadcrumb markup
    And search engines should understand the hierarchy
