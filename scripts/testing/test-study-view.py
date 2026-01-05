#!/usr/bin/env python3
"""Test the Study view layout on the Arabic document"""
from playwright.sync_api import sync_playwright
import os

output_dir = os.path.dirname(os.path.abspath(__file__))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1400, 'height': 900})

    # Navigate to the Arabic document
    page.goto('https://siftersearch.com/library/bahai/core-tablets/the-bab_address-to-the-believers_ar', timeout=60000)
    page.wait_for_load_state('domcontentloaded')
    page.wait_for_timeout(3000)  # Wait for any JS to settle

    # Take initial screenshot
    page.screenshot(path=f'{output_dir}/study-view-01-initial.png', full_page=False)
    print("Screenshot 1: Initial page load")

    # Click on Study button to switch to Study view
    # First find the view menu button and click it
    study_btn = page.locator('button:has-text("Study")')
    if study_btn.count() > 0:
        study_btn.first.click()
        page.wait_for_timeout(1500)
        page.screenshot(path=f'{output_dir}/study-view-02-study-mode.png', full_page=False)
        print("Screenshot 2: Study mode view")

        # Scroll down a bit to see more content
        page.evaluate('window.scrollBy(0, 300)')
        page.wait_for_timeout(500)
        page.screenshot(path=f'{output_dir}/study-view-03-scrolled.png', full_page=False)
        print("Screenshot 3: Scrolled study view")
    else:
        print("Study button not found - trying via view menu")
        # Try clicking hamburger menu if needed
        menu_btn = page.locator('.menu-toggle, .view-menu-btn, [title*="View"]')
        if menu_btn.count() > 0:
            menu_btn.first.click()
            page.wait_for_timeout(500)
            page.screenshot(path=f'{output_dir}/study-view-02-menu-open.png', full_page=False)
            print("Screenshot 2: View menu open")

            study_option = page.locator('button:has-text("Study"), .menu-item:has-text("Study")')
            if study_option.count() > 0:
                study_option.first.click()
                page.wait_for_timeout(1500)
                page.screenshot(path=f'{output_dir}/study-view-03-study-mode.png', full_page=False)
                print("Screenshot 3: Study mode view")

    browser.close()
    print(f"\nDone! Check {output_dir}/study-view-*.png")
