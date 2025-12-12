#!/usr/bin/env python3
"""
Test SifterSearch UI with Playwright
Takes screenshots to verify:
1. Chat streaming works
2. Paper color on hit cards
3. Reading mode
"""

from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOTS_DIR = "/tmp/siftersearch-screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def test_siftersearch():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        # Test production site
        print("Loading siftersearch.com...")
        page.goto("https://siftersearch.com")
        page.wait_for_load_state("networkidle")
        page.screenshot(path=f"{SCREENSHOTS_DIR}/01-homepage.png", full_page=False)
        print(f"  Screenshot saved: {SCREENSHOTS_DIR}/01-homepage.png")

        # Check if library stats loaded
        stats_text = page.text_content("body")
        if "passages" in stats_text.lower() or "document" in stats_text.lower():
            print("  ✓ Library stats appear to be loaded")

        # Search for something
        print("Searching for 'love'...")
        search_input = page.locator("input[type='search'], input.search-input")
        search_input.fill("love")
        search_input.press("Enter")

        # Wait for results
        time.sleep(8)  # Wait for streaming response
        page.screenshot(path=f"{SCREENSHOTS_DIR}/02-search-results.png", full_page=False)
        print(f"  Screenshot saved: {SCREENSHOTS_DIR}/02-search-results.png")

        # Check for hit cards
        hit_cards = page.locator(".hit-card, [class*='hit'], [class*='result']").count()
        print(f"  Found {hit_cards} result cards")

        # Check for paper background
        page.screenshot(path=f"{SCREENSHOTS_DIR}/03-hit-cards-detail.png", full_page=True)
        print(f"  Screenshot saved: {SCREENSHOTS_DIR}/03-hit-cards-detail.png")

        # Try clicking on a result to open reading mode
        print("Trying to open reading mode...")
        expandable = page.locator("button:has-text('Read'), [class*='expand'], [class*='read']").first
        if expandable.count() > 0:
            expandable.click()
            time.sleep(1)
            page.screenshot(path=f"{SCREENSHOTS_DIR}/04-reading-mode.png", full_page=False)
            print(f"  Screenshot saved: {SCREENSHOTS_DIR}/04-reading-mode.png")
        else:
            print("  No expand/read button found")

        # Get console logs
        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"{msg.type}: {msg.text}"))

        browser.close()

        print("\n=== Test Complete ===")
        print(f"Screenshots saved to: {SCREENSHOTS_DIR}")
        if console_logs:
            print("\nConsole logs:")
            for log in console_logs[:10]:
                print(f"  {log}")

if __name__ == "__main__":
    test_siftersearch()
