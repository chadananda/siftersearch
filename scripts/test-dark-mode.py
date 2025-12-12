#!/usr/bin/env python3
"""
Test dark mode paper color
"""

from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOTS_DIR = "/tmp/siftersearch-screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def test_dark_mode():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Force dark mode
        page = browser.new_page(
            viewport={"width": 1400, "height": 900},
            color_scheme="dark"
        )

        print("Loading siftersearch.com in DARK mode...")
        page.goto("https://siftersearch.com")
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        page.screenshot(path=f"{SCREENSHOTS_DIR}/30-dark-homepage.png", full_page=False)

        print("Searching for 'love'...")
        search_input = page.locator("input.search-input").first
        search_input.fill("love")
        search_input.press("Enter")

        print("Waiting for results...")
        time.sleep(10)

        # Find and click first source card
        source_cards = page.locator(".source-card").all()
        print(f"Found {len(source_cards)} source cards")

        if len(source_cards) > 0:
            print("Clicking first source card...")
            source_cards[0].click()
            time.sleep(1)

            page.screenshot(path=f"{SCREENSHOTS_DIR}/31-dark-expanded-card.png", full_page=False)

            # Check the .source-paper element colors
            paper = page.locator(".source-paper").first
            if paper.count() > 0:
                bg_color = paper.evaluate("el => window.getComputedStyle(el).backgroundColor")
                print(f"  DARK MODE Paper background color: {bg_color}")

        browser.close()
        print("\n=== Test Complete ===")

if __name__ == "__main__":
    test_dark_mode()
