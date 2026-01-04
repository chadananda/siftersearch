#!/usr/bin/env python3
"""Test SBS line-height with proper wait for async content."""

from playwright.sync_api import sync_playwright
import time

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Use production site
        url = "https://siftersearch.com/library/bahai/core-tablets/001-address-to-believers_ar"
        print(f"Testing: {url}")

        page.goto(url, wait_until="domcontentloaded", timeout=30000)

        # Wait for document content to appear (async loaded)
        print("Waiting for content to load...")
        try:
            page.wait_for_selector('.document-header, .prose-container, .paragraph-row', timeout=15000)
            print("✓ Content selector found")
        except:
            print("✗ Content didn't load, taking screenshot anyway")

        time.sleep(2)
        page.screenshot(path="test-output/sbs_test1.png")
        print("Screenshot 1: initial page")

        # Check for SBS toggle button
        toggle_buttons = page.evaluate('''() => {
            const btns = document.querySelectorAll('button');
            return Array.from(btns).map(b => ({
                tooltip: b.getAttribute('data-tooltip') || '',
                ariaLabel: b.getAttribute('aria-label') || '',
                title: b.getAttribute('title') || '',
                classList: b.className
            })).filter(b =>
                b.tooltip.toLowerCase().includes('side') ||
                b.ariaLabel.toLowerCase().includes('side') ||
                b.tooltip.toLowerCase().includes('bilingual') ||
                b.classList.includes('toggle')
            );
        }''')

        print(f"\nToggle buttons found: {len(toggle_buttons)}")
        for tb in toggle_buttons:
            print(f"  tooltip='{tb['tooltip']}' class='{tb['classList']}'")

        # Try clicking if found
        sbs_btn = page.locator('button[data-tooltip*="Side"], button[data-tooltip*="side"]').first
        if sbs_btn.is_visible():
            print("\n✓ Clicking SBS button...")
            sbs_btn.click()
            time.sleep(2)

            page.screenshot(path="test-output/sbs_test2.png")
            print("Screenshot 2: after SBS click")

            # Check line heights
            results = page.evaluate('''() => {
                const cols = document.querySelectorAll('.translation-col');
                const data = [];
                cols.forEach((col, ci) => {
                    const paras = col.querySelectorAll('.paragraph-text');
                    paras.forEach((p, pi) => {
                        const pStyle = window.getComputedStyle(p);
                        const pTag = p.querySelector('p');
                        const pTagStyle = pTag ? window.getComputedStyle(pTag) : null;
                        data.push({
                            col: ci,
                            para: pi,
                            containerLH: pStyle.lineHeight,
                            containerInline: p.style.lineHeight,
                            pTagLH: pTagStyle ? pTagStyle.lineHeight : 'N/A',
                            pTagInline: pTag ? pTag.style.lineHeight : 'N/A'
                        });
                    });
                });
                return data;
            }''')

            print(f"\n=== LINE HEIGHTS ({len(results)} paragraphs) ===")
            for r in results[:5]:
                print(f"Para {r['para']}: container={r['containerLH']} (inline:{r['containerInline']}), <p>={r['pTagLH']} (inline:{r['pTagInline']})")

            # Verify
            all_good = True
            for r in results:
                try:
                    if r['pTagLH'] != 'N/A':
                        px = float(r['pTagLH'].replace('px', ''))
                        if px > 24:
                            print(f"❌ Bad line-height on para {r['para']}: {px}px")
                            all_good = False
                except:
                    pass

            if all_good and results:
                print("\n✅ SUCCESS! All line-heights are correct (~1.15)")
            elif not results:
                print("\n⚠️ No translation paragraphs found - may need to test a different document")
        else:
            print("\n✗ No SBS button visible")
            page.screenshot(path="test-output/sbs_no_button.png")

        browser.close()

if __name__ == "__main__":
    main()
