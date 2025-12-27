#!/usr/bin/env python3
"""Test library religion and collection headers visually."""

from playwright.sync_api import sync_playwright
import os

SCREENSHOTS_DIR = '/Users/chad/Dropbox/Public/JS/Projects/websites/siftersearch.com/screenshots'
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})

        # Navigate to library page (use local for testing)
        print("Navigating to library page...")
        page.goto('http://localhost:4321/library')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        # Screenshot initial state
        page.screenshot(path=f'{SCREENSHOTS_DIR}/01_library_initial.png', full_page=False)
        print(f"Screenshot: 01_library_initial.png")

        # Debug: print the sidebar HTML
        sidebar = page.locator('aside')
        print(f"Sidebar found: {sidebar.count()}")

        # Look for religion buttons in sidebar - these are direct buttons
        religion_buttons = page.locator('aside button').all()
        print(f"Found {len(religion_buttons)} buttons in sidebar")

        if len(religion_buttons) > 0:
            # Click on first religion button (Baha'i)
            first_button = religion_buttons[0]
            button_text = first_button.text_content()
            print(f"Clicking on: {button_text}")
            first_button.click()
            page.wait_for_timeout(2000)

            # Screenshot after clicking religion
            page.screenshot(path=f'{SCREENSHOTS_DIR}/02_religion_clicked.png', full_page=False)
            print(f"Screenshot: 02_religion_clicked.png")

            # Check if religion header appeared in main content
            religion_header = page.locator('.religion-header')
            print(f"Religion header count: {religion_header.count()}")
            if religion_header.count() > 0:
                print("✓ Religion header IS visible")
            else:
                print("✗ Religion header NOT visible - checking main content...")
                main_html = page.locator('main').inner_html()[:500]
                print(f"Main content preview: {main_html}")

            # Now look for collection buttons (pills) that appeared
            page.wait_for_timeout(500)
            collection_buttons = page.locator('aside button.rounded-full').all()
            print(f"Found {len(collection_buttons)} collection buttons")

            if len(collection_buttons) > 0:
                # Click first collection
                first_coll = collection_buttons[0]
                coll_text = first_coll.text_content()
                print(f"Clicking on collection: {coll_text}")
                first_coll.click()
                page.wait_for_timeout(2000)

                # Screenshot collection view
                page.screenshot(path=f'{SCREENSHOTS_DIR}/03_collection_clicked.png', full_page=False)
                print(f"Screenshot: 03_collection_clicked.png")

                # Check for collection header
                coll_header = page.locator('header h1')
                if coll_header.count() > 0:
                    print(f"✓ Collection header: {coll_header.text_content()}")
                else:
                    print("✗ Collection header NOT found")

        browser.close()
        print(f"\nScreenshots saved to: {SCREENSHOTS_DIR}")

if __name__ == '__main__':
    main()
