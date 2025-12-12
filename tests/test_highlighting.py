#!/usr/bin/env python3
"""
Test highlighting on SifterSearch
Verifies that search results have <mark> tags for highlighted sentences
"""

from playwright.sync_api import sync_playwright
import time
import re

def test_highlighting():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to siftersearch.com...")
        page.goto('https://siftersearch.com')
        page.wait_for_load_state('networkidle')

        # Take initial screenshot
        page.screenshot(path='/tmp/siftersearch-screenshots/01-initial.png', full_page=True)
        print("Took initial screenshot")

        # Wait for the search input to appear
        page.wait_for_selector('input[type="search"], input[placeholder*="search" i], input', timeout=10000)

        # Find and fill the search input
        search_input = page.locator('input').first
        print("Found search input, typing query...")
        search_input.fill('What is the nature of the soul?')

        # Press Enter to search
        search_input.press('Enter')
        print("Submitted search, waiting for results...")

        # Wait for the API response and results to load
        # Wait for the search to complete - look for result cards or loading indicator to disappear
        time.sleep(8)  # Give time for API call to complete

        # Take screenshot after search
        page.screenshot(path='/tmp/siftersearch-screenshots/02-search-results.png', full_page=True)
        print("Took search results screenshot")

        # Get the HTML content to check for mark tags
        html_content = page.content()

        # Check for <mark> tags in the content
        mark_count = html_content.count('<mark>')
        print(f"Found {mark_count} <mark> tags in the page")

        # Also check for highlighted text within mark tags
        mark_pattern = re.compile(r'<mark>(.*?)</mark>', re.DOTALL)
        matches = mark_pattern.findall(html_content)

        if matches:
            print(f"\nFound {len(matches)} highlighted passages:")
            for i, match in enumerate(matches[:5], 1):
                # Clean up the match for display
                cleaned = re.sub(r'<[^>]+>', '', match)[:100]
                print(f"  {i}. {cleaned}...")
        else:
            print("\nWARNING: No <mark> tags found - highlighting may not be working!")

        # Click on the first result card to expand it
        try:
            result_cards = page.locator('.source-card, .hit-card, [class*="result"]').all()
            if result_cards:
                print(f"\nFound {len(result_cards)} result cards")
                # Click first card to expand
                result_cards[0].click()
                time.sleep(1)
                page.screenshot(path='/tmp/siftersearch-screenshots/03-expanded-result.png', full_page=True)
                print("Took expanded result screenshot")
        except Exception as e:
            print(f"Could not expand result card: {e}")

        # Final summary
        print("\n" + "="*50)
        if mark_count > 0:
            print(f"SUCCESS: Highlighting is working! Found {mark_count} highlighted sections.")
        else:
            print("FAILURE: No highlighting found. Check the API response.")
        print("="*50)

        browser.close()
        return mark_count > 0

if __name__ == '__main__':
    import os
    os.makedirs('/tmp/siftersearch-screenshots', exist_ok=True)
    success = test_highlighting()
    exit(0 if success else 1)
