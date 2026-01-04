#!/usr/bin/env python3
"""Debug SBS button detection."""

from playwright.sync_api import sync_playwright
import time

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        url = "https://62b0e5fe.siftersearch.pages.dev/library/bahai/writings-of-abdul-baha/paris-talks?doc=5c8b4d2b-50a1-4ba0-b91b-2e69dbd5ddfc"
        print(f"Testing: {url}")

        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(5)

        # Take screenshot
        page.screenshot(path="test-output/page_debug.png")
        print("Screenshot saved to test-output/page_debug.png")

        # Find all buttons and their attributes
        buttons = page.evaluate('''() => {
            const btns = document.querySelectorAll('button');
            return Array.from(btns).map(b => ({
                class: b.className,
                tooltip: b.getAttribute('data-tooltip'),
                title: b.getAttribute('title'),
                text: b.textContent.substring(0, 50),
                ariaLabel: b.getAttribute('aria-label')
            }));
        }''')

        print("\n=== ALL BUTTONS ===")
        for b in buttons[:20]:
            print(f"  class='{b['class']}' tooltip='{b['tooltip']}' title='{b['title']}' aria='{b['ariaLabel']}' text='{b['text']}'")

        # Check if there's a translate option or bilingual toggle
        toggle = page.locator('button:has-text("SBS"), button:has-text("Bilingual"), button:has-text("Side")')
        print(f"\nButtons with SBS/Bilingual text: {toggle.count()}")

        browser.close()

if __name__ == "__main__":
    main()
