#!/usr/bin/env python3
"""Test the print study view with Playwright"""

from playwright.sync_api import sync_playwright
import sys
import os

def test_print_study_view():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Test the print study view
        url = "http://localhost:5173/print/study?doc=067_excellence_of_knowledge"
        print(f"\n=== Testing Print Study View ===")
        print(f"URL: {url}\n")

        page.goto(url)
        page.wait_for_load_state('networkidle')

        # Wait for content to load (the component fetches data on mount)
        page.wait_for_timeout(3000)

        # Take screenshot
        screenshot_path = "tests/print_study_view.png"
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot saved: {screenshot_path}")

        # Check for content
        content = page.content()

        # Check for error states
        if "Error" in content and "error-state" in content:
            print("ERROR: Page shows error state")
            error_msg = page.locator('.error-message').text_content()
            print(f"Error message: {error_msg}")
            browser.close()
            return False

        # Check for loading state still showing
        if "Loading document" in content:
            print("WARNING: Page still in loading state after 3s")

        # Check for document title
        title_el = page.locator('.document-title')
        if title_el.count() > 0:
            title = title_el.first.text_content()
            print(f"Document title: {title}")
        else:
            print("WARNING: Document title not found")

        # Check for segment table
        segment_table = page.locator('.segment-table')
        if segment_table.count() > 0:
            print(f"Segment tables found: {segment_table.count()}")

            # Check for segment rows
            segment_rows = page.locator('.segment-row')
            print(f"Total segment rows: {segment_rows.count()}")

            # Show first few segments
            if segment_rows.count() > 0:
                print("\nFirst 3 segments:")
                for i in range(min(3, segment_rows.count())):
                    row = segment_rows.nth(i)
                    num = row.locator('.segment-num').text_content()
                    orig = row.locator('.segment-original').text_content()[:50]
                    trans = row.locator('.segment-translation').text_content()[:50]
                    print(f"  [{num}] {orig}... -> {trans}...")
        else:
            print("WARNING: No segment tables found")

            # Check if fallback content is shown
            fallback = page.locator('.fallback-content')
            if fallback.count() > 0:
                print(f"Fallback content blocks: {fallback.count()}")

        # Check for QR code
        qr = page.locator('.qr-image')
        if qr.count() > 0:
            print("\nQR code present: Yes")
        else:
            print("\nQR code present: No")

        browser.close()
        print("\n=== Test Complete ===")
        return True

if __name__ == "__main__":
    success = test_print_study_view()
    sys.exit(0 if success else 1)
