#!/usr/bin/env python3
"""Test line-height on production site with a document that has SBS."""

from playwright.sync_api import sync_playwright
import time

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Test on production with Arabic document (has translations)
        # The Mysterious Forces of Civilization has Arabic + English
        url = "https://62b0e5fe.siftersearch.pages.dev/library/bahai/core-tablets/001-address-to-believers_ar"
        print(f"Testing: {url}")

        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        time.sleep(3)

        # Take screenshot to see current state
        page.screenshot(path="test-output/test1_initial.png")
        print("Screenshot saved: test1_initial.png")

        # Check for document content
        content = page.locator('.document-content, .prose-container, article')
        print(f"Content areas found: {content.count()}")

        # Find toolbar buttons
        buttons = page.evaluate('''() => {
            const btns = document.querySelectorAll('button');
            return Array.from(btns).map(b => ({
                class: b.className,
                tooltip: b.getAttribute('data-tooltip'),
                ariaLabel: b.getAttribute('aria-label'),
                svg: b.querySelector('svg') ? 'has-svg' : ''
            })).filter(b => b.tooltip || b.ariaLabel);
        }''')

        print("\n=== TOOLBAR BUTTONS ===")
        for b in buttons:
            print(f"  class='{b['class']}' tooltip='{b['tooltip']}' aria='{b['ariaLabel']}'")

        # Try to find and click SBS/bilingual toggle
        sbs_button = page.locator('button[data-tooltip*="Side"], button[aria-label*="Side"], button[data-tooltip*="SBS"], button[data-tooltip*="side"]')
        if sbs_button.count() > 0:
            print(f"\n✓ Found {sbs_button.count()} SBS button(s)")
            sbs_button.first.click()
            time.sleep(2)
            page.screenshot(path="test-output/test2_sbs_mode.png")
            print("Screenshot saved: test2_sbs_mode.png")

            # Now check line heights
            line_heights = page.evaluate('''() => {
                const results = [];
                const translationCols = document.querySelectorAll('.translation-col');
                translationCols.forEach((col, colIdx) => {
                    const paragraphs = col.querySelectorAll('.paragraph-text');
                    paragraphs.forEach((para, paraIdx) => {
                        const computed = window.getComputedStyle(para);
                        const lineHeight = computed.lineHeight;
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

            print(f"\n=== LINE HEIGHT RESULTS ({len(line_heights)} paragraphs) ===")
            for r in line_heights[:5]:
                print(f"Para {r['para']}: container={r['containerLineHeight']}, <p>={r['pTagLineHeight']}, inline={r['hasInlineStyle']}")

            # Verify all are correct
            if line_heights:
                all_good = True
                for r in line_heights:
                    try:
                        p_px = float(r['pTagLineHeight'].replace('px', ''))
                        if p_px > 24:  # Should be ~18px for 1.15 line-height at 16px font
                            print(f"❌ Para {r['para']}: <p> line-height {p_px}px is too large!")
                            all_good = False
                    except:
                        pass
                if all_good:
                    print("\n✅ All line-heights look correct!")
            else:
                print("No translation paragraphs found in translation-col")
        else:
            print("\n✗ No SBS button found")
            # Check what's visible
            page.screenshot(path="test-output/test_no_sbs.png")

        browser.close()

if __name__ == "__main__":
    main()
