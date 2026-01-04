#!/usr/bin/env python3
"""Test user-provided URL."""

from playwright.sync_api import sync_playwright
import time

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        url = "https://bdd99a27.siftersearch.pages.dev/library/bahai/core-tablets/the-bab_address-to-the-believers_ar"
        print(f"Testing: {url}")

        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(5)

        page.screenshot(path="test-output/user_url_1.png")
        print("Screenshot 1 saved")

        # Look for SBS button
        sbs = page.locator('button:has-text("SBS")')
        if sbs.count() > 0:
            print("Found SBS button, clicking...")
            sbs.first.click()
            time.sleep(2)
            page.screenshot(path="test-output/user_url_2_sbs.png")
            print("Screenshot 2 (SBS) saved")

            # Check line heights
            results = page.evaluate('''() => {
                const paras = document.querySelectorAll('.translation-col .paragraph-text');
                return Array.from(paras).slice(0, 5).map((p, i) => {
                    const cs = window.getComputedStyle(p);
                    const pTag = p.querySelector('p');
                    const pCs = pTag ? window.getComputedStyle(pTag) : null;
                    return {
                        i,
                        containerLH: cs.lineHeight,
                        containerInline: p.style.lineHeight,
                        pLH: pCs ? pCs.lineHeight : 'none',
                        pInline: pTag ? pTag.style.lineHeight : 'none'
                    };
                });
            }''')

            print(f"\n=== LINE HEIGHTS ({len(results)} shown) ===")
            for r in results:
                print(f"  {r['i']}: container={r['containerLH']}(i:{r['containerInline']}) <p>={r['pLH']}(i:{r['pInline']})")

            # Check if correct
            good = True
            for r in results:
                try:
                    if r['pLH'] != 'none':
                        px = float(r['pLH'].replace('px',''))
                        if px > 24:
                            good = False
                except: pass

            if good and results:
                print("\n✅ Line heights look correct!")
            elif not results:
                print("\n⚠️ No translation paragraphs found")
        else:
            print("No SBS button")

        browser.close()

if __name__ == "__main__":
    main()
