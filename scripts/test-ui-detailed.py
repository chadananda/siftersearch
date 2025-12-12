#!/usr/bin/env python3
"""
Detailed UI test for SifterSearch
"""

from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOTS_DIR = "/tmp/siftersearch-screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def test_siftersearch():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        # Test production site
        print("Loading siftersearch.com...")
        page.goto("https://siftersearch.com")
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        # Search for something
        print("Searching for 'justice'...")
        search_input = page.locator("input[type='search'], input.search-input").first
        search_input.fill("justice")
        search_input.press("Enter")

        # Wait for results
        print("Waiting for streaming response...")
        time.sleep(10)

        page.screenshot(path=f"{SCREENSHOTS_DIR}/10-results.png", full_page=False)
        print(f"  Screenshot: {SCREENSHOTS_DIR}/10-results.png")

        # Get page HTML structure to understand the components
        html = page.content()

        # Look for hit cards
        hit_cards = page.locator(".hit-card").all()
        print(f"  Found {len(hit_cards)} .hit-card elements")

        # Look for any cards with paper styling
        paper_elements = page.locator("[class*='paper']").all()
        print(f"  Found {len(paper_elements)} elements with 'paper' in class")

        # Look for result containers
        results = page.locator(".results, .result, [class*='result']").all()
        print(f"  Found {len(results)} result-like elements")

        # Try to find and click expand/read buttons
        print("\nLooking for expand buttons...")
        expand_btns = page.locator("button svg, .expand-btn, [class*='expand']").all()
        print(f"  Found {len(expand_btns)} expand-like buttons")

        # Try clicking the first chevron/expand button if found
        chevron = page.locator("button:has(svg path[d*='M19 9l-7 7-7-7'])").first
        if chevron.count() > 0:
            print("  Found chevron button, clicking...")
            chevron.click()
            time.sleep(1)
            page.screenshot(path=f"{SCREENSHOTS_DIR}/11-expanded.png", full_page=False)
            print(f"  Screenshot: {SCREENSHOTS_DIR}/11-expanded.png")

        # Check for reading mode
        reading_mode = page.locator(".reading-mode, [class*='reading'], [class*='fullscreen']").all()
        print(f"  Found {len(reading_mode)} reading mode elements")

        # Get computed styles of hit cards
        print("\nChecking hit card styles...")
        first_card = page.locator(".hit-card").first
        if first_card.count() > 0:
            bg_color = first_card.evaluate("el => window.getComputedStyle(el).backgroundColor")
            bg_image = first_card.evaluate("el => window.getComputedStyle(el).backgroundImage")
            print(f"  Background color: {bg_color}")
            print(f"  Background image: {bg_image[:100] if bg_image else 'none'}...")

        # Take a full page screenshot
        page.screenshot(path=f"{SCREENSHOTS_DIR}/12-fullpage.png", full_page=True)
        print(f"  Screenshot: {SCREENSHOTS_DIR}/12-fullpage.png")

        browser.close()
        print("\n=== Test Complete ===")

if __name__ == "__main__":
    test_siftersearch()
