#!/usr/bin/env python3
"""
Test expanding source cards to see paper background
"""

from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOTS_DIR = "/tmp/siftersearch-screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def test_expand():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        print("Loading siftersearch.com...")
        page.goto("https://siftersearch.com")
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        print("Searching for 'love'...")
        search_input = page.locator("input.search-input").first
        search_input.fill("love")
        search_input.press("Enter")

        print("Waiting for results...")
        time.sleep(10)

        # Find the first source-card (collapsed)
        source_cards = page.locator(".source-card").all()
        print(f"Found {len(source_cards)} source cards")

        if len(source_cards) > 0:
            # Click the first one to expand
            print("Clicking first source card...")
            source_cards[0].click()
            time.sleep(1)

            page.screenshot(path=f"{SCREENSHOTS_DIR}/20-expanded-card.png", full_page=False)
            print(f"  Screenshot: {SCREENSHOTS_DIR}/20-expanded-card.png")

            # Check the .source-paper element
            paper = page.locator(".source-paper").first
            if paper.count() > 0:
                bg_color = paper.evaluate("el => window.getComputedStyle(el).backgroundColor")
                print(f"  Paper background color: {bg_color}")

            # Now try reading mode - look for fullscreen/read buttons
            read_btns = page.locator("button:has-text('Read'), .read-btn").all()
            print(f"  Found {len(read_btns)} read buttons")

            # Look for any document link or fullscreen trigger
            doc_links = page.locator("a[href*='doc'], button[class*='doc'], [class*='fullscreen']").all()
            print(f"  Found {len(doc_links)} doc/fullscreen elements")

            # Click on citation to get reading mode
            citation_btns = page.locator(".citation-bar button, .citation-bar a").all()
            print(f"  Found {len(citation_btns)} citation bar buttons")

            if len(citation_btns) > 0:
                citation_btns[0].click()
                time.sleep(2)
                page.screenshot(path=f"{SCREENSHOTS_DIR}/21-reading-mode.png", full_page=False)
                print(f"  Screenshot: {SCREENSHOTS_DIR}/21-reading-mode.png")

        browser.close()
        print("\n=== Test Complete ===")

if __name__ == "__main__":
    test_expand()
