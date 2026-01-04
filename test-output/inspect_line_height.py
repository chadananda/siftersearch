#!/usr/bin/env python3
"""Inspect line-height on SBS mode translation column"""
from playwright.sync_api import sync_playwright
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to a document with translation in SBS mode
    page.goto('https://siftersearch.com/library/view?doc=baha_i_core_tablets_the_b_b_001_address_to_believers&mode=sbs', timeout=60000)
    page.wait_for_load_state('domcontentloaded')
    page.wait_for_timeout(3000)  # Wait for dynamic content

    # Check for available buttons
    all_buttons = page.locator('button').all()
    print(f"Found {len(all_buttons)} buttons")
    for btn in all_buttons[:10]:
        try:
            text = btn.text_content()
            print(f"  Button: {text[:50] if text else '(no text)'}")
        except:
            pass

    # Try to click SBS button if available
    try:
        sbs_btn = page.locator('button:has-text("SBS")')
        if sbs_btn.count() > 0:
            print("Found SBS button, clicking...")
            sbs_btn.click()
            page.wait_for_timeout(2000)
        else:
            print("No SBS button found")
    except Exception as e:
        print(f"Error clicking SBS: {e}")

    # Take screenshot
    page.screenshot(path=f'{OUT_DIR}/sbs_view.png', full_page=False)

    # Check what's on the page
    html = page.content()
    print(f"Page title: {page.title()}")
    print(f"Has translation-col: {'.translation-col' in html or 'translation-col' in html}")
    print(f"Has paragraph-text: {'paragraph-text' in html}")
    print(f"Has bilingual-row: {'bilingual-row' in html}")
    print(f"Page URL: {page.url}")
    # Save full HTML for inspection
    with open(f'{OUT_DIR}/page.html', 'w') as f:
        f.write(html)

    # Get computed styles for translation column elements
    styles = page.evaluate('''() => {
        const results = [];

        // Find translation column
        const translationCols = document.querySelectorAll('.translation-col');
        results.push(`Found ${translationCols.length} translation columns`);

        if (translationCols.length > 0) {
            const col = translationCols[0];
            const colStyles = window.getComputedStyle(col);
            results.push(`translation-col line-height: ${colStyles.lineHeight}`);
            results.push(`translation-col font-size: ${colStyles.fontSize}`);

            // Find paragraph-text inside
            const paraTexts = col.querySelectorAll('.paragraph-text');
            results.push(`Found ${paraTexts.length} .paragraph-text elements in translation-col`);

            if (paraTexts.length > 0) {
                const pt = paraTexts[0];
                const ptStyles = window.getComputedStyle(pt);
                results.push(`paragraph-text line-height: ${ptStyles.lineHeight}`);
                results.push(`paragraph-text font-size: ${ptStyles.fontSize}`);

                // Check inner p tags
                const pTags = pt.querySelectorAll('p');
                results.push(`Found ${pTags.length} p tags inside paragraph-text`);

                if (pTags.length > 0) {
                    const pStyles = window.getComputedStyle(pTags[0]);
                    results.push(`p tag line-height: ${pStyles.lineHeight}`);
                    results.push(`p tag font-size: ${pStyles.fontSize}`);
                }

                // Get the HTML content
                results.push(`HTML content preview: ${pt.innerHTML.substring(0, 300)}`);
            }
        }

        // Also check original column for comparison
        const originalCols = document.querySelectorAll('.original-col');
        if (originalCols.length > 0) {
            const origPt = originalCols[0].querySelector('.paragraph-text');
            if (origPt) {
                const origStyles = window.getComputedStyle(origPt);
                results.push(`original-col paragraph-text line-height: ${origStyles.lineHeight}`);
                results.push(`original-col paragraph-text font-size: ${origStyles.fontSize}`);
            }
        }

        return results;
    }''')

    print("=== Computed Styles ===")
    for line in styles:
        print(line)

    browser.close()
