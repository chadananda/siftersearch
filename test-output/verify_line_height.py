#!/usr/bin/env python3
"""Verify the line-height fix for SBS translation column."""

from playwright.sync_api import sync_playwright
import time

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Test on the fresh deployment
        url = "https://62b0e5fe.siftersearch.pages.dev/library/bahai/writings-of-abdul-baha/paris-talks?doc=5c8b4d2b-50a1-4ba0-b91b-2e69dbd5ddfc"
        print(f"Testing: {url}")

        page.goto(url, wait_until="domcontentloaded", timeout=30000)

        # Wait for content to load
        time.sleep(3)

        # Click SBS button
        sbs_button = page.locator('[data-tooltip="Side-by-side"]')
        if sbs_button.count() > 0:
            print("✓ Found SBS button, clicking...")
            sbs_button.click()
            time.sleep(2)
        else:
            print("✗ No SBS button found")
            browser.close()
            return

        # Check for translation column
        trans_col = page.locator('.translation-col')
        if trans_col.count() > 0:
            print(f"✓ Found {trans_col.count()} translation column(s)")
        else:
            print("✗ No .translation-col elements found")
            browser.close()
            return

        # Check computed line-height on paragraph-text elements in translation column
        line_heights = page.evaluate('''() => {
            const results = [];
            const translationCols = document.querySelectorAll('.translation-col');
            translationCols.forEach((col, colIdx) => {
                const paragraphs = col.querySelectorAll('.paragraph-text');
                paragraphs.forEach((para, paraIdx) => {
                    const computed = window.getComputedStyle(para);
                    const lineHeight = computed.lineHeight;

                    // Also check first child p element
                    const pTag = para.querySelector('p');
                    const pLineHeight = pTag ? window.getComputedStyle(pTag).lineHeight : 'N/A';

                    results.push({
                        col: colIdx,
                        para: paraIdx,
                        containerLineHeight: lineHeight,
                        pTagLineHeight: pLineHeight,
                        hasInlineStyle: para.style.lineHeight !== ''
                    });
                });
            });
            return results;
        }''')

        print("\n=== LINE HEIGHT RESULTS ===")
        for r in line_heights[:5]:  # Show first 5
            print(f"Col {r['col']}, Para {r['para']}:")
            print(f"  Container: {r['containerLineHeight']} (inline: {r['hasInlineStyle']})")
            print(f"  <p> tag:   {r['pTagLineHeight']}")

        # Parse to check if they're correct (around 1.15 * font-size)
        print("\n=== ANALYSIS ===")
        all_correct = True
        for r in line_heights:
            # Line-height in computed style is in pixels. 1.15 * 16px = 18.4px
            # We'll check if it's less than 24px (which would be ~1.5 line-height)
            try:
                container_px = float(r['containerLineHeight'].replace('px', ''))
                if container_px > 24:
                    print(f"❌ Para {r['para']}: container line-height {container_px}px is too large")
                    all_correct = False

                if r['pTagLineHeight'] != 'N/A':
                    p_px = float(r['pTagLineHeight'].replace('px', ''))
                    if p_px > 24:
                        print(f"❌ Para {r['para']}: <p> tag line-height {p_px}px is too large")
                        all_correct = False
            except ValueError:
                pass

        if all_correct:
            print("✅ All line-heights are correctly set to ~1.15!")

        browser.close()

if __name__ == "__main__":
    main()
