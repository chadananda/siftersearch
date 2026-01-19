@search @authority @implemented
Feature: Search Authority Ranking
  As a user of SifterSearch
  I want authoritative religious texts to appear first in search results
  So that I receive the most reliable and sacred sources for my queries

  Background:
    Given the library contains indexed documents with authority levels
    And I am an approved user

  # ============================================
  # Authority Level Display
  # ============================================

  @critical-path
  Scenario: Search results include authority metadata
    When I search for "prayer"
    Then I should receive search results
    And each result should include an authority level
    And authority levels should be between 1 and 10

  @critical-path
  Scenario: High authority documents appear before low authority
    When I search for "unity of mankind"
    Then results with authority 10 should appear before authority 5
    And results with authority 9 should appear before authority 4
    And the ranking should follow authority descending order

  # ============================================
  # Sacred Text Priority (Authority 10)
  # ============================================

  @implemented
  Scenario: Sacred texts from Central Figures ranked highest
    When I search for "Bahá'u'lláh" with religion filter "Bahá'í"
    Then the first results should be from "Bahá'u'lláh" as author
    And these results should have authority level 10
    And they should be labeled as "Sacred Text"

  @implemented
  Scenario: Writings of the Báb appear with highest authority
    When I search for "the Báb"
    Then results authored by "The Báb" should have authority 10
    And they should rank higher than pilgrim notes

  @implemented
  Scenario: Writings of 'Abdu'l-Bahá have authority 9
    When I search for "'Abdu'l-Bahá" with religion filter "Bahá'í"
    Then results authored by "'Abdu'l-Bahá" should have authority 9
    And they should be labeled as "Authoritative"

  # ============================================
  # Institutional Documents (Authority 8)
  # ============================================

  @implemented
  Scenario: Universal House of Justice messages ranked high
    When I search for "Universal House of Justice"
    Then results from "Universal House of Justice" should have authority 8
    And they should be labeled as "Institutional"
    And they should appear before pilgrim notes

  # ============================================
  # Comparative Authority Ranking
  # ============================================

  @implemented
  Scenario: Sacred texts outrank secondary sources
    When I search for "divine civilization"
    Then results by "Bahá'u'lláh" should appear before results by other authors
    And results by "'Abdu'l-Bahá" should appear before historical accounts

  @implemented
  Scenario: Authoritative writings outrank commentary
    When I search for "Kitáb-i-Aqdas"
    Then results from the Kitáb-i-Aqdas text itself should appear first
    And commentaries about the Aqdas should appear later

  @implemented
  Scenario: Mixed religion search respects authority within each tradition
    When I search for "meditation"
    Then within each religion group, results should be ordered by authority
    And sacred texts should precede academic sources

  # ============================================
  # Authority by Collection
  # ============================================

  @implemented
  Scenario: Collection authority inherited by documents
    When I search for documents in collection "Gleanings"
    Then documents should inherit collection authority level
    And authority should match collection meta.yaml setting

  @implemented
  Scenario: Document authority overrides collection default
    When I search for documents with explicit authority metadata
    Then document-level authority should override collection defaults

  # ============================================
  # Search Speed Tests
  # ============================================

  @performance @implemented
  Scenario: Search returns results within acceptable time
    When I search for "prayer"
    Then response time should be under 500 milliseconds
    And results should include timing metadata

  @performance @implemented
  Scenario: Authority-ranked search maintains speed
    When I search for "God" with limit 100
    Then response time should be under 1000 milliseconds
    And results should still be authority-ordered

  @performance @implemented
  Scenario: Cached searches return instantly
    Given I have previously searched for "unity"
    When I search for "unity" again
    Then response should indicate cache hit
    And response time should be under 50 milliseconds

  # ============================================
  # Edge Cases
  # ============================================

  @implemented
  Scenario: Results with equal authority sorted by relevance
    When I search for a specific phrase with multiple matches at same authority
    Then results at the same authority level should be sorted by text relevance
    And keyword matches should rank higher than semantic-only matches

  @implemented
  Scenario: Authority filtering works correctly
    When I search for "peace" with minimum authority 8
    Then all results should have authority 8 or higher
    And no commentary or unofficial sources should appear

  @implemented
  Scenario: Low authority sources still appear when relevant
    When I search for a topic only covered in secondary sources
    Then lower authority sources should still be returned
    And they should be clearly marked with their authority level
