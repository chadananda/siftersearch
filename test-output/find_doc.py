#!/usr/bin/env python3
"""Find a working document URL with SBS support."""

from playwright.sync_api import sync_playwright
import time

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to library page
        url = "https://siftersearch.com/library"
        print(f"Loading: {url}")

        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)

        page.screenshot(path="test-output/library_page.png")

        # Find document links
        links = page.evaluate('''() => {
            const anchors = document.querySelectorAll('a[href*="/library/"]');
            return Array.from(anchors).slice(0, 20).map(a => ({
                href: a.href,
                text: a.textContent.substring(0, 60)
            }));
        }''')

        print(f"\n=== LIBRARY LINKS ({len(links)}) ===")
        for l in links[:15]:
            print(f"  {l['href']}")
            print(f"    -> {l['text']}")

        browser.close()

if __name__ == "__main__":
    main()
