#!/usr/bin/env python3
"""
Test paper color fix - should be light even in dark mode
"""

from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOTS_DIR = "/tmp/siftersearch-screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def test_paper_fix():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Test LOCAL dev server in DARK mode
        page = browser.new_page(
            viewport={"width": 1400, "height": 900},
            color_scheme="dark"
        )

        print("Loading localhost:5173 in DARK mode...")
        page.goto("http://localhost:5173")
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        print("Searching for 'love'...")
        search_input = page.locator("input.search-input").first
        search_input.fill("love")
        search_input.press("Enter")

        print("Waiting for results...")
        time.sleep(10)

        source_cards = page.locator(".source-card").all()
        print(f"Found {len(source_cards)} source cards")

        if len(source_cards) > 0:
            print("Clicking first source card...")
            source_cards[0].click()
            time.sleep(1)

            page.screenshot(path=f"{SCREENSHOTS_DIR}/40-paper-fix-dark.png", full_page=False)
            print(f"  Screenshot: {SCREENSHOTS_DIR}/40-paper-fix-dark.png")

            paper = page.locator(".source-paper").first
            if paper.count() > 0:
                bg_color = paper.evaluate("el => window.getComputedStyle(el).backgroundColor")
                text_color = page.locator(".source-text").first.evaluate("el => window.getComputedStyle(el).color")
                print(f"  Paper background: {bg_color}")
                print(f"  Text color: {text_color}")

                # Expected: background should be light (#faf8f3 = rgb(250, 248, 243))
                if "250" in bg_color and "248" in bg_color:
                    print("  ✓ Paper background is LIGHT as expected!")
                else:
                    print("  ✗ Paper background is NOT light - fix didn't work")

        browser.close()
        print("\n=== Test Complete ===")

if __name__ == "__main__":
    test_paper_fix()
