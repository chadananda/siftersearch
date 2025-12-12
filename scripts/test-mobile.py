#!/usr/bin/env python3
"""
Test mobile viewport to verify library stats fit
"""

from playwright.sync_api import sync_playwright
import os

SCREENSHOTS_DIR = "/tmp/siftersearch-screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def test_mobile():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Test small mobile (iPhone SE size)
        page = browser.new_page(
            viewport={"width": 320, "height": 568}
        )

        import time

        # Collect console messages and network errors
        console_errors = []
        network_errors = []
        page.on("console", lambda msg: console_errors.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
        page.on("requestfailed", lambda req: network_errors.append(f"{req.failure}: {req.url}"))

        print("Loading siftersearch.com on small mobile (320x568)...")
        page.goto("https://siftersearch.com")
        page.wait_for_load_state("networkidle")

        # Wait for stats to load - try waiting for stats element
        try:
            page.wait_for_selector(".stats-card", timeout=10000)
            print("  ✓ Stats card appeared")
        except:
            print("  ⚠ Stats card did not appear within 10s")
            # Wait a bit more anyway
            time.sleep(2)

        # Print errors
        if console_errors:
            print("  Console errors:")
            for err in console_errors[:5]:
                print(f"    {err}")
        if network_errors:
            print("  Network failures:")
            for err in network_errors[:5]:
                print(f"    {err}")

        page.screenshot(path=f"{SCREENSHOTS_DIR}/60-mobile-small.png", full_page=False)
        print(f"  Screenshot: {SCREENSHOTS_DIR}/60-mobile-small.png")

        # Check if library stats are visible
        stats_card = page.locator(".stats-card").first
        if stats_card.count() > 0:
            bbox = stats_card.bounding_box()
            if bbox:
                print(f"  Stats card: y={bbox['y']:.0f}, height={bbox['height']:.0f}, bottom={bbox['y'] + bbox['height']:.0f}")
                if bbox['y'] + bbox['height'] > 568:
                    print("  ⚠ Stats card extends below viewport!")
                else:
                    print("  ✓ Stats card fits within viewport")
            else:
                print("  ⚠ Stats card not in viewport (null bounding box)")
        else:
            print("  ⚠ Stats card not found by locator")

        # Debug: check entire HTML for stats-related elements
        html = page.content()
        if "stats-card" in html:
            print("  ℹ Stats card IS in HTML - trying alternative locator")
            # Try using evaluate to get element info
            stats_info = page.evaluate("""() => {
                const el = document.querySelector('.stats-card');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return {
                    top: rect.top,
                    height: rect.height,
                    display: style.display,
                    visibility: style.visibility,
                    opacity: style.opacity
                };
            }""")
            if stats_info:
                print(f"  ℹ Stats card via JS: top={stats_info['top']:.0f}, height={stats_info['height']:.0f}, display={stats_info['display']}, visibility={stats_info['visibility']}")
            else:
                print("  ℹ Stats card not found via JS either")
        elif "stats-loading" in html:
            print("  ℹ Stats are still loading")
        else:
            print("  ℹ Stats not in HTML (API might be unreachable)")

        # Take full page screenshot to see everything
        page.screenshot(path=f"{SCREENSHOTS_DIR}/60-mobile-small-full.png", full_page=True)
        print(f"  Full page screenshot: {SCREENSHOTS_DIR}/60-mobile-small-full.png")

        # Scroll down to see the stats card
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1)
        page.screenshot(path=f"{SCREENSHOTS_DIR}/60-mobile-small-scrolled.png", full_page=False)
        print(f"  Scrolled screenshot: {SCREENSHOTS_DIR}/60-mobile-small-scrolled.png")

        # Test standard mobile (iPhone 12/13 size)
        page2 = browser.new_page(
            viewport={"width": 390, "height": 844}
        )

        print("\nLoading siftersearch.com on standard mobile (390x844)...")
        page2.goto("https://siftersearch.com")
        page2.wait_for_load_state("networkidle")

        page2.screenshot(path=f"{SCREENSHOTS_DIR}/61-mobile-standard.png", full_page=False)
        print(f"  Screenshot: {SCREENSHOTS_DIR}/61-mobile-standard.png")

        browser.close()
        print("\n=== Test Complete ===")

if __name__ == "__main__":
    test_mobile()
