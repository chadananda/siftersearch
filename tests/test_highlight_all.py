#!/usr/bin/env python3
"""
Test highlighting on SifterSearch - expand all cards
Verifies that all search results have <mark> tags for highlighted sentences
"""

from playwright.sync_api import sync_playwright
import time
import re

def test_highlighting_all():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to siftersearch.com...")
        page.goto('https://siftersearch.com')
        page.wait_for_load_state('networkidle')

        # Wait for the search input to appear
        page.wait_for_selector('input', timeout=10000)

        # Find and fill the search input
        search_input = page.locator('input').first
        print("Found search input, typing query...")
        search_input.fill('What is the nature of the soul?')

        # Press Enter to search
        search_input.press('Enter')
        print("Submitted search, waiting for results...")

        # Wait for results to load
        time.sleep(10)

        # Expand all result cards by clicking each one
        result_cards = page.locator('.source-card').all()
        print(f"\nFound {len(result_cards)} result cards")

        # Click each card to expand it
        for i, card in enumerate(result_cards):
            try:
                card.click()
                time.sleep(0.5)
            except:
                pass

        # Wait a bit more
        time.sleep(1)

        # Take screenshot with all expanded
        page.screenshot(path='/tmp/siftersearch-screenshots/04-all-expanded.png', full_page=True)
        print("Took all-expanded screenshot")

        # Get the HTML content to check for mark tags
        html_content = page.content()

        # Check for <mark> tags in the content
        mark_count = html_content.count('<mark>')
        print(f"\nFound {mark_count} <mark> tags in the page")

        # Also check for highlighted text within mark tags
        mark_pattern = re.compile(r'<mark>(.*?)</mark>', re.DOTALL)
        matches = mark_pattern.findall(html_content)

        if matches:
            print(f"\nHighlighted passages ({len(matches)}):")
            for i, match in enumerate(matches, 1):
                # Clean up the match for display
                cleaned = re.sub(r'<[^>]+>', '', match)[:80]
                print(f"  {i}. {cleaned}...")
        else:
            print("\nWARNING: No <mark> tags found!")

        # Check for any HIGHLIGHT FAILED errors in the server logs
        print("\n" + "="*50)
        if mark_count >= len(result_cards):
            print(f"SUCCESS: All {len(result_cards)} cards have highlights! ({mark_count} total)")
        elif mark_count > 0:
            print(f"PARTIAL: {mark_count} highlights found out of {len(result_cards)} cards")
        else:
            print("FAILURE: No highlighting found!")
        print("="*50)

        browser.close()
        return mark_count >= len(result_cards)

if __name__ == '__main__':
    import os
    os.makedirs('/tmp/siftersearch-screenshots', exist_ok=True)
    success = test_highlighting_all()
    exit(0 if success else 1)
