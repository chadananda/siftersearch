@search-quality
Feature: Search Result Quality Battery
  As a researcher using OceanLibrary.com
  I want relevant passages from authoritative sources
  To appear in the top results for any well-formed query

  Adapted from the ocean-search-testing framework (dnotes/ocean-search-testing).
  Scoring: primary source (authority ≥7) > secondary (≥5) > commentary.
  Pass: expected doc/author in top 10 AND expected text present AND anti-tests pass.

  Background:
    Given the search API is reachable

  # ── Bahá'í phrase-match ───────────────────────────────────────────────────

  @phrase-match @critical-path
  Scenario Outline: Bahá'í phrase-match: <id>
    When I search for "<query>" filtered by religion "<religion>"
    Then document <doc_id> should appear in the top 10 results
    And the matching passage should contain "<text_check>"

    Examples:
      | id                                  | query                                             | religion | doc_id | text_check    |
      | tablet-of-wisdom-philosophy         | philosophy emanated from the prophets             | Baha'i   | 8270   | Prophets      |
      | tablet-of-wisdom-nature             | nature is the embodiment of the maker the creator | Baha'i   | 8270   | embodiment    |
      | tablet-of-wisdom-greek-philosophers | Empedocles Pythagoras Greek philosophers          | Baha'i   | 8270   | Pythagoras    |
      | seven-valleys-law-secret-path       | secret of the path obedience to the law           | Baha'i   | 8241   | secret        |
      | hidden-words-cleanse-heart          | cleanse thy heart from envy and from grudge       | Baha'i   | 8230   | envy          |
      | long-healing-prayer-opening         | Inaccessible Most High Most Holy Most Glorious    | Baha'i   | 16597  | Inaccessible  |
      | tablet-of-ahmad-nightingale         | Tablet of Ahmad nightingale of paradise           | Baha'i   | 1616   | Nightingale   |
      | aqdas-obligatory-prayer             | obligatory prayer command from age of maturity    | Baha'i   | 16712  | obligatory    |

  # ── Bahá'í concept-match ──────────────────────────────────────────────────

  @concept-match
  Scenario Outline: Bahá'í concept-match: <id>
    When I search for "<query>" filtered by religion "<religion>"
    Then document <doc_id> should appear in the top 10 results
    And the matching passage should contain "<text_check>"

    Examples:
      | id                   | query                                        | religion | doc_id | text_check |
      | iqan-justice         | purity of heart chastity of spirit justice   | Baha'i   | 8300   | chastity   |
      | saq-immortality-soul | soul is immortal continues progress after death | Baha'i | 8346   | soul       |

  @concept-match
  Scenario Outline: Bahá'í author-level concept-match: <id>
    When I search for "<query>" filtered by religion "<religion>"
    Then the top result author should contain "<author_check>"

    Examples:
      | id                                | query                                          | religion | author_check |
      | shoghi-effendi-progressive-revelation | progressive revelation successive manifestations | Baha'i | Shoghi    |
      | bahai-daily-obligatory-prayer     | daily obligatory prayer                        | Baha'i   | Bahá         |
      | bahai-detachment                  | detachment from this world                     | Baha'i   | Bahá         |

  # ── Authority-ranking anti-tests ─────────────────────────────────────────

  @authority-ranking @critical-path
  Scenario: Primary source beats secondary for Bahá'u'lláh on science
    When I search for "Bahá'u'lláh on materialism science" filtered by religion "Baha'i"
    Then the top result author should contain "Bahá"
    And the top result author should not contain "Esslemont"

  @authority-ranking
  Scenario: Covenant primary source outranks commentary
    When I search for "covenant of Baha'u'llah" filtered by religion "Baha'i"
    Then the top result author should not contain "Esslemont"
    And the top result authority should be at least 7

  @authority-ranking
  Scenario: Healing prayer — sacred text outranks commentary
    When I search for "prayer for healing and protection" filtered by religion "Baha'i"
    Then the top result authority should be at least 7

  @authority-ranking
  Scenario: Bismillah — Quran primary text must rank first
    When I search for "In the name of God the compassionate the merciful" filtered by religion "Islam"
    Then the top result authority should be at least 7
    And the top result text should contain "merciful"

  # ── Islamic ───────────────────────────────────────────────────────────────

  @concept-match @cross-tradition
  Scenario Outline: Islamic concept-match: <id>
    When I search for "<query>" filtered by religion "Islam"
    Then I should receive at least 1 search result
    And the top result text should contain "<text_check>"

    Examples:
      | id                     | query                                     | text_check |
      | islamic-ablution       | ablution ritual purity before prayer      | prayer     |
      | islamic-daily-prayers  | five daily prayers salat                  | prayer     |
      | islamic-fasting-ramadan | fasting during Ramadan                   | fast       |
      | islamic-zakat-charity  | charity giving to the poor zakat          | poor       |

  # ── Buddhist ─────────────────────────────────────────────────────────────

  @phrase-match @cross-tradition
  Scenario Outline: Buddhist canonical text: <id>
    When I search for "<query>" filtered by religion "Buddhism"
    Then I should receive at least 1 search result
    And the top result text should contain "<text_check>"

    Examples:
      | id                         | query                                           | text_check  |
      | buddhist-four-noble-truths | Four Noble Truths suffering cessation           | suffering   |
      | buddhist-eightfold-path    | Eightfold Path right action right speech        | right       |
      | buddhist-compassion        | compassion loving-kindness Karuna Metta         | compassion  |
      | buddhist-mindfulness       | mindfulness meditation awareness present moment | mind        |
      | buddhist-enlightenment     | achieving enlightenment liberation Nirvana      | enlighten   |

  # ── Christian ────────────────────────────────────────────────────────────

  @phrase-match @cross-tradition
  Scenario Outline: Christian canonical text: <id>
    When I search for "<query>" filtered by religion "Christianity"
    Then I should receive at least 1 search result
    And the top result text should contain "<text_check>"

    Examples:
      | id                         | query                                                | text_check |
      | christian-lords-prayer     | Our Father who art in heaven hallowed be thy name    | heaven     |
      | christian-beatitudes-meek  | Blessed are the meek for they shall inherit the earth | meek      |
      | christian-love-neighbor    | Love thy neighbor as thyself                         | neighbor   |
      | christian-golden-rule      | do unto others as you would have them do to you      | others     |

  # ── Hindu ────────────────────────────────────────────────────────────────

  @concept-match @cross-tradition
  Scenario Outline: Hindu canonical text: <id>
    When I search for "<query>" filtered by religion "Hinduism"
    Then I should receive at least 1 search result
    And the top result text should contain "<text_check>"

    Examples:
      | id                          | query                                      | text_check |
      | hindu-dharma                | dharma duty righteous action               | dharma     |
      | hindu-bhagavad-gita-action  | action without attachment to results       | action     |
      | hindu-devotion-bhakti       | devotion to God Bhakti path                | devotion   |

  # ── Cross-tradition ───────────────────────────────────────────────────────

  @concept-match @cross-tradition
  Scenario Outline: Cross-tradition concept is present in the library: <id>
    When I search for "<query>"
    Then I should receive at least 3 search results
    And the top result authority should be at least 5

    Examples:
      | id                     | query                                        |
      | cross-love-universal   | love is the foundation of all religion       |
      | cross-justice-universal | justice equity fairness                     |
      | cross-forgiveness      | forgiveness mercy pardon sins               |
      | cross-prayer-meditation | prayer and meditation communion with the divine |
      | cross-afterlife        | life after death immortality of the soul     |

  # ── Entity-aware ─────────────────────────────────────────────────────────

  @entity-aware @critical-path
  Scenario: Entity alias — First Letter of the Living resolves to Mullá Ḥusayn
    When I search for "first Letter of the Living" filtered by religion "Baha'i"
    Then document 21308 should appear in the top 10 results
    And the matching passage should contain "Husayn"

  @entity-aware
  Scenario: Entity alias — Bábul-Báb resolves to Mullá Ḥusayn
    When I search for "Babul-Bab gate of the gate Dawn-Breakers" filtered by religion "Baha'i"
    Then document 21308 should appear in the top 10 results

  @entity-aware
  Scenario: Entity alias — Poetess of Qazvín resolves to Ṭáhirih
    When I search for "poetess of Qazvin Tahirih Qurratul-Ayn unveiled" filtered by religion "Baha'i"
    Then document 21308 should appear in the top 10 results

  @entity-aware
  Scenario: Event entity — Declaration of the Báb 1844
    When I search for "Declaration of the Bab May 1844 Shiraz" filtered by religion "Baha'i"
    Then document 21308 should appear in the top 10 results
    And the matching passage should contain "Báb"

  @entity-aware
  Scenario: Character tracking — Quddús in the Dawn-Breakers
    When I search for "Quddus Letters of the Living Dawn-Breakers" filtered by religion "Baha'i"
    Then document 21308 should appear in the top 10 results

  @entity-aware
  Scenario: Event entity — martyrdom of the Báb in Tabriz
    When I search for "martyrdom of the Bab Tabriz 1850" filtered by religion "Baha'i"
    Then document 21308 should appear in the top 10 results
    And the matching passage should contain "Báb"
