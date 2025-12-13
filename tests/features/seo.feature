@seo @pending
Feature: SEO On-Page Optimization
  As a search engine crawler or site owner
  I want pages to follow SEO best practices
  So that the site ranks well in search results and provides good social sharing

  Background:
    Given the site is accessible

  # =============================================================================
  # CRITICAL SEO REQUIREMENTS
  # =============================================================================

  @critical @h1-tags
  Scenario: Page has exactly one H1 tag
    When I visit the homepage
    Then I should see exactly 1 H1 tag
    And the H1 tag should contain relevant keywords

  @critical @h1-tags
  Scenario Outline: Each page has exactly one H1 tag
    When I visit "<page>"
    Then I should see exactly 1 H1 tag
    And the H1 tag should be unique to that page

    Examples:
      | page   |
      | /      |
      | /about |

  @critical @canonical
  Scenario: Pages have canonical link tags
    When I visit the homepage
    Then I should see a canonical link tag
    And the canonical URL should be "https://siftersearch.com/"

  @critical @canonical
  Scenario Outline: All pages have appropriate canonical URLs
    When I visit "<page>"
    Then I should see a canonical link tag
    And the canonical URL should match the current page URL

    Examples:
      | page   |
      | /      |
      | /about |

  @critical @robots-txt
  Scenario: Site has robots.txt file
    When I request "/robots.txt"
    Then the response status should be 200
    And the response should contain "User-agent"
    And the response should contain "Sitemap"

  @critical @robots-txt
  Scenario: Robots.txt allows search engine crawling
    When I request "/robots.txt"
    Then the response should contain "Allow: /"
    And the response should not block important pages

  @critical @open-graph
  Scenario: Homepage has Open Graph meta tags
    When I visit the homepage
    Then I should see an "og:title" meta tag
    And I should see an "og:type" meta tag with value "website"
    And I should see an "og:url" meta tag
    And I should see an "og:image" meta tag
    And I should see an "og:description" meta tag

  @critical @open-graph
  Scenario Outline: All pages have Open Graph tags
    When I visit "<page>"
    Then I should see an "og:title" meta tag
    And I should see an "og:url" meta tag matching the current page
    And I should see an "og:description" meta tag

    Examples:
      | page   |
      | /      |
      | /about |

  @critical @twitter-cards
  Scenario: Pages have Twitter Card meta tags
    When I visit the homepage
    Then I should see a "twitter:card" meta tag with value "summary_large_image"
    And I should see a "twitter:title" meta tag
    And I should see a "twitter:description" meta tag
    And I should see a "twitter:image" meta tag

  @critical @schema-markup
  Scenario: Homepage has Schema.org structured data
    When I visit the homepage
    Then I should see a JSON-LD script tag
    And the structured data should have "@type" of "WebApplication" or "WebSite"
    And the structured data should include "name"
    And the structured data should include "description"
    And the structured data should include "url"

  @critical @schema-markup
  Scenario: Search functionality has SearchAction schema
    When I visit the homepage
    Then the structured data should include a "potentialAction" with "@type" "SearchAction"
    And the SearchAction should have a valid "target" URL template

  # =============================================================================
  # META TAGS & HEAD ELEMENTS
  # =============================================================================

  @meta-tags @title
  Scenario: Page title follows SEO best practices
    When I visit the homepage
    Then the page title should be between 30 and 60 characters
    And the page title should contain primary keywords
    And the page title should include the brand name

  @meta-tags @description
  Scenario: Meta description is optimized
    When I visit the homepage
    Then the meta description should be between 150 and 160 characters
    And the meta description should contain primary keywords
    And the meta description should be compelling and action-oriented

  @meta-tags @viewport
  Scenario: Pages have viewport meta tag for mobile
    When I visit the homepage
    Then I should see a viewport meta tag
    And the viewport should include "width=device-width"
    And the viewport should include "initial-scale=1"

  @meta-tags @charset
  Scenario: Pages declare character encoding
    When I visit the homepage
    Then I should see a charset meta tag with value "UTF-8"
    And the charset should be declared before the title tag

  @meta-tags @language
  Scenario: HTML lang attribute is set
    When I visit the homepage
    Then the html element should have a "lang" attribute
    And the lang attribute should be "en" or appropriate language code

  # =============================================================================
  # HEADING STRUCTURE
  # =============================================================================

  @headings @hierarchy
  Scenario: Heading hierarchy is properly structured
    When I visit the homepage
    Then headings should follow a logical hierarchy
    And there should be no skipped heading levels
    And H2 tags should follow H1 tags
    And H3 tags should follow H2 tags

  @headings @keywords
  Scenario: Headings contain relevant keywords
    When I visit the homepage
    Then the H1 should contain primary keywords like "search" or "library"
    And H2 tags should contain secondary keywords

  # =============================================================================
  # LINKS
  # =============================================================================

  @links @internal
  Scenario: Page has internal navigation links
    When I visit the homepage
    Then I should see at least 1 internal link
    And internal links should have descriptive anchor text
    And internal links should not be broken

  @links @external
  Scenario: External links have proper attributes
    When I visit a page with external links
    Then external links should have rel="noopener noreferrer"
    And external links should open in new tab when appropriate

  @links @descriptive
  Scenario: Links have descriptive anchor text
    When I visit the homepage
    Then no links should have anchor text "click here" or "read more"
    And link text should describe the destination

  # =============================================================================
  # IMAGES
  # =============================================================================

  @images @alt-text
  Scenario: All images have alt attributes
    When I visit the homepage
    Then all img elements should have alt attributes
    And alt text should be descriptive
    And decorative images should have empty alt=""

  @images @optimization
  Scenario: Images are optimized for web
    When I visit the homepage
    Then images should have explicit width and height attributes
    And images should use modern formats when supported
    And images should be appropriately sized for their display context

  @images @lazy-loading
  Scenario: Below-fold images use lazy loading
    When I visit the homepage
    Then below-fold images should have loading="lazy"
    And above-fold images should not have loading="lazy"

  # =============================================================================
  # SITEMAP
  # =============================================================================

  @sitemap
  Scenario: Site has XML sitemap
    When I request "/sitemap.xml"
    Then the response status should be 200
    And the response content-type should be "application/xml" or "text/xml"
    And the sitemap should contain valid XML

  @sitemap
  Scenario: Sitemap includes all important pages
    When I request "/sitemap.xml"
    Then the sitemap should include "/"
    And the sitemap should include "/about"
    And each URL should have a lastmod date

  @sitemap
  Scenario: Robots.txt references the sitemap
    When I request "/robots.txt"
    Then the response should contain "Sitemap: https://siftersearch.com/sitemap.xml"

  # =============================================================================
  # PERFORMANCE (SEO-RELATED)
  # =============================================================================

  @performance @response-time
  Scenario: Pages load quickly
    When I visit the homepage
    Then the server response time should be under 200ms
    And the page should start rendering within 1 second

  @performance @html-size
  Scenario: HTML is reasonably sized
    When I visit the homepage
    Then the HTML size should be under 100KB
    And there should be minimal inline CSS
    And there should be minimal inline JavaScript

  @performance @compression
  Scenario: Responses are compressed
    When I request the homepage with gzip support
    Then the response should be gzip compressed
    And the Content-Encoding header should be "gzip" or "br"

  @performance @caching
  Scenario: Static assets have cache headers
    When I request a static asset
    Then the response should have Cache-Control headers
    And images should have appropriate expires headers

  # =============================================================================
  # HTTPS & SECURITY
  # =============================================================================

  @security @https
  Scenario: Site uses HTTPS
    When I visit the homepage
    Then the connection should use HTTPS
    And there should be no mixed content warnings

  @security @hsts
  Scenario: HSTS header is set
    When I request the homepage
    Then the response should have Strict-Transport-Security header
    And HSTS max-age should be at least 31536000

  # =============================================================================
  # MOBILE SEO
  # =============================================================================

  @mobile @responsive
  Scenario: Site is mobile-friendly
    When I visit the homepage on a mobile device
    Then content should be readable without zooming
    And tap targets should be appropriately sized
    And there should be no horizontal scrolling

  @mobile @touch
  Scenario: Touch targets are accessible
    When I visit the homepage on a mobile device
    Then clickable elements should be at least 44x44 pixels
    And there should be adequate spacing between touch targets

  # =============================================================================
  # INTERNATIONALIZATION (i18n)
  # =============================================================================

  @i18n @hreflang
  Scenario: Multi-language pages have hreflang tags
    Given the site supports multiple languages
    When I visit the homepage
    Then I should see appropriate hreflang link tags
    And there should be a default hreflang="x-default"

  # =============================================================================
  # CONTENT QUALITY
  # =============================================================================

  @content @readability
  Scenario: Content is readable and well-structured
    When I visit the homepage
    Then paragraphs should be reasonably sized
    And there should be adequate whitespace
    And font sizes should be readable (at least 16px for body)

  @content @fresh
  Scenario: Content appears current
    When I visit the homepage
    Then dates should not appear stale
    And copyright year should be current or recent

  # =============================================================================
  # STRUCTURED DATA TYPES
  # =============================================================================

  @schema @organization
  Scenario: Organization schema is present
    When I visit the homepage
    Then the structured data should include Organization or WebSite schema
    And it should include "name" property
    And it should include "url" property
    And it should optionally include "logo" property

  @schema @breadcrumbs
  Scenario Outline: Pages have breadcrumb schema where appropriate
    When I visit "<page>"
    And the page has navigation breadcrumbs
    Then the structured data should include BreadcrumbList schema
    And breadcrumbs should have proper itemListElement structure

    Examples:
      | page         |
      | /about       |

  @schema @searchbox
  Scenario: Homepage has sitelinks searchbox schema
    When I visit the homepage
    Then the structured data should include WebSite schema
    And it should have a potentialAction with SearchAction type
    And the SearchAction should have query-input parameter

  # =============================================================================
  # ERROR PAGES
  # =============================================================================

  @errors @404
  Scenario: 404 page is SEO-friendly
    When I visit a non-existent page "/this-page-does-not-exist"
    Then the response status should be 404
    And the page should have a proper title
    And the page should have navigation back to home
    And the page should have a search functionality or suggestions

  @errors @noindex
  Scenario: Error pages are not indexed
    When I visit a non-existent page
    Then I should see a "robots" meta tag with "noindex"

  # =============================================================================
  # SOCIAL SHARING
  # =============================================================================

  @social @facebook
  Scenario: Facebook sharing works correctly
    When I analyze the homepage for Facebook sharing
    Then og:title should be appropriate for sharing
    And og:description should be compelling
    And og:image should be at least 1200x630 pixels
    And og:image should have absolute URL

  @social @twitter
  Scenario: Twitter sharing works correctly
    When I analyze the homepage for Twitter sharing
    Then twitter:card should be "summary_large_image"
    And twitter:image should be at least 800x418 pixels
    And twitter:title should be under 70 characters

  # =============================================================================
  # DUPLICATE CONTENT
  # =============================================================================

  @duplicates @trailing-slash
  Scenario: URLs handle trailing slashes consistently
    When I visit "/" and "/index.html"
    Then one should redirect to the other or both serve same canonical

  @duplicates @www
  Scenario: www and non-www URLs are handled
    When I visit "https://siftersearch.com"
    And I visit "https://www.siftersearch.com"
    Then one should redirect to the other as canonical

  # =============================================================================
  # ACCESSIBILITY (SEO-RELATED)
  # =============================================================================

  @a11y @skip-links
  Scenario: Page has skip navigation link
    When I visit the homepage
    Then I should find a skip-to-content link
    And the link should be visible on focus

  @a11y @focus
  Scenario: Focus states are visible
    When I tab through the homepage
    Then focused elements should have visible focus indicators
    And focus order should be logical

  # =============================================================================
  # CORE WEB VITALS (BASIC CHECKS)
  # =============================================================================

  @cwv @cls
  Scenario: Layout shift is minimized
    When I visit the homepage
    Then images and embeds should have explicit dimensions
    And fonts should not cause layout shift
    And dynamic content should have reserved space

  @cwv @lcp
  Scenario: Largest contentful paint element is optimized
    When I visit the homepage
    Then the main hero image or content should load quickly
    And critical CSS should be inlined or preloaded
    And render-blocking resources should be minimized
