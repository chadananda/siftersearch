#!/usr/bin/env python3
"""
Test Read More full-screen reader functionality
"""

from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOTS_DIR = "/tmp/siftersearch-screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def test_read_more():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1400, "height": 900}
        )

        print("Loading siftersearch.com...")
        page.goto("https://siftersearch.com")
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        page.screenshot(path=f"{SCREENSHOTS_DIR}/50-initial.png", full_page=False)

        print("Searching for 'love'...")
        search_input = page.locator("input.search-input").first
        search_input.fill("love")
        search_input.press("Enter")

        print("Waiting for results...")
        time.sleep(3)
        page.screenshot(path=f"{SCREENSHOTS_DIR}/51-after-search.png", full_page=False)

        # Give it more time
        time.sleep(15)
        page.screenshot(path=f"{SCREENSHOTS_DIR}/52-after-wait.png", full_page=False)

        # Find source cards
        source_cards = page.locator(".source-card").all()
        print(f"Found {len(source_cards)} source cards")

        # Also try looking for any results
        results = page.locator(".results-container").all()
        print(f"Found {len(results)} results containers")

        messages = page.locator(".message-row").all()
        print(f"Found {len(messages)} message rows")

        if len(source_cards) > 0:
            print("Expanding first source card...")
            source_cards[0].click()
            time.sleep(1)

            page.screenshot(path=f"{SCREENSHOTS_DIR}/53-expanded.png", full_page=False)
            print(f"  Screenshot: {SCREENSHOTS_DIR}/53-expanded.png")

            # Click Read More button
            read_more_btn = page.locator(".read-more-btn").first
            if read_more_btn.count() > 0:
                print("Clicking Read More button...")
                read_more_btn.click()
                time.sleep(2)

                page.screenshot(path=f"{SCREENSHOTS_DIR}/54-reader-modal.png", full_page=False)
                print(f"  Screenshot: {SCREENSHOTS_DIR}/54-reader-modal.png")

                # Check if reader modal opened
                reader_modal = page.locator(".reader-modal").first
                if reader_modal.count() > 0:
                    print("  ✓ Reader modal opened!")

                    # Check for content
                    paragraphs = page.locator(".reader-paragraph").all()
                    print(f"  ✓ Found {len(paragraphs)} paragraphs in reader")

                    # Check for loading or error state
                    loading = page.locator(".reader-loading").first
                    if loading.count() > 0:
                        print("  ! Reader is still loading...")

                    empty = page.locator(".reader-empty").first
                    if empty.count() > 0:
                        print("  ! Reader shows empty state")

                    # Test navigation
                    next_btn = page.locator(".reader-nav-btn").last
                    if next_btn.count() > 0 and not next_btn.is_disabled():
                        print("Clicking next button...")
                        next_btn.click()
                        time.sleep(0.5)
                        page.screenshot(path=f"{SCREENSHOTS_DIR}/55-reader-nav.png", full_page=False)
                        print(f"  Screenshot: {SCREENSHOTS_DIR}/55-reader-nav.png")

                    # Close reader with Escape key
                    print("Closing reader with Escape...")
                    page.keyboard.press("Escape")
                    time.sleep(0.5)

                    reader_after = page.locator(".reader-modal").first
                    if reader_after.count() == 0:
                        print("  ✓ Reader closed successfully!")
                    else:
                        print("  ✗ Reader did not close")
                else:
                    print("  ✗ Reader modal did not open")
            else:
                print("  ✗ Read More button not found")
        else:
            print("No source cards found. Check screenshots for errors.")

        browser.close()
        print("\n=== Test Complete ===")

if __name__ == "__main__":
    test_read_more()
