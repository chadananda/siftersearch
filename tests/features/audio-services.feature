@audio @patron
Feature: Audio Conversion Services
  As a patron user
  I want to convert documents to audio
  So that I can listen to religious texts

  # ============================================
  # IMPLEMENTED - Audio Utilities
  # ============================================

  @implemented
  Scenario: List available voices
    When I request available voices
    Then I should receive a list of TTS voices
    And voices should include various languages and styles

  @implemented
  Scenario: List available audio formats
    When I request available audio formats
    Then I should receive supported formats like mp3, wav

  @implemented
  Scenario: Audio exists check
    Given a document "doc_123" converted to audio with voice "nova"
    When I check if audio exists
    Then I should receive exists=true
    And I should see the count of cached segments

  # ============================================
  # PENDING - Audio Conversion Request
  # ============================================

  @pending @patron
  Scenario: Request document audio conversion (patron+)
    Given I am a patron user
    And a document "doc_123" exists
    When I request audio conversion with voice "nova"
    Then an audio job should be queued
    And I should receive a job ID
    And I should be notified when complete

  @pending @patron
  Scenario: Non-patron cannot request audio conversion
    Given I am an approved user (not patron)
    When I request audio conversion
    Then I should receive a forbidden error
    And be shown patron upgrade options

  @pending @patron
  Scenario: Cached audio returned immediately
    Given a document "doc_123" already has audio with voice "nova"
    When I request audio with same voice
    Then I should receive "already_exists" status
    And I should see the cached segment count

  @pending
  Scenario: Audio segments match paragraphs
    Given a document with 10 paragraphs
    When audio conversion completes
    Then there should be 10 audio segments
    And each segment should map to a paragraph

  @pending
  Scenario: Choose voice for audio
    Given available voices include "nova", "alloy", "shimmer"
    When I request audio with voice "shimmer"
    Then the audio should use the selected voice

  @pending
  Scenario: HD quality audio option
    Given I am a patron user
    When I request audio with quality "hd"
    Then the generated audio should be higher bitrate
    And file sizes should be larger

  # ============================================
  # PENDING - Audio Playback
  # ============================================

  @pending
  Scenario: Download audio manifest (M3U playlist)
    Given audio conversion is complete for document "doc_123"
    When I download the audio manifest
    Then I should receive an M3U playlist file
    And playlist should list all segments in order

  @pending
  Scenario: Stream individual audio segment
    Given audio exists for document "doc_123"
    When I request segment "p5" audio
    Then I should receive MP3 audio data
    And audio should play correctly

  @pending
  Scenario: Audio player in search results
    Given I am a patron user
    And search result has audio available
    When I view the search result
    Then I should see a play button
    And clicking play should stream the relevant segment
