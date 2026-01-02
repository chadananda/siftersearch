"""Inspect the document presentation page to see dark mode styling issues."""
from playwright.sync_api import sync_playwright
import os

# Output directory for screenshots - use project root
PROJECT_DIR = '/Users/chad/Dropbox/Public/JS/Projects/websites/siftersearch.com'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    # Simulate dark mode preference
    page = browser.new_page(
        viewport={'width': 1280, 'height': 900},
        color_scheme='dark'
    )

    # Navigate to a document page on the live site
    # Doc: 'Abdu'l-Baha -- The Centre of the Covenant of Baha'u'llah (Baha'i Books)
    page.goto('https://siftersearch.com/library/bahai/bahai-books/abdul-baha-the-centre-of-the-covenant-of-bahaullah')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)  # Extra wait for any animations

    # Take full page screenshot
    page.screenshot(path=f'{PROJECT_DIR}/doc-page-full.png', full_page=True)
    print(f"Full page screenshot saved to {PROJECT_DIR}/doc-page-full.png")

    # Take viewport screenshot
    page.screenshot(path=f'{PROJECT_DIR}/doc-page-viewport.png')
    print(f"Viewport screenshot saved to {PROJECT_DIR}/doc-page-viewport.png")

    # Get the computed styles of key elements
    print("\n=== Computed Styles ===")

    # Check document content background
    doc_content = page.locator('.document-content').first
    if doc_content.count() > 0:
        bg = page.evaluate('''() => {
            const el = document.querySelector('.document-content');
            if (el) {
                const style = window.getComputedStyle(el);
                return {
                    background: style.backgroundColor,
                    color: style.color,
                    class: el.className
                };
            }
            return null;
        }''')
        print(f"Document content: {bg}")

    # Check paragraph text color
    para_text = page.locator('.paragraph-text').first
    if para_text.count() > 0:
        text_style = page.evaluate('''() => {
            const el = document.querySelector('.paragraph-text');
            if (el) {
                const style = window.getComputedStyle(el);
                return {
                    color: style.color,
                    background: style.backgroundColor
                };
            }
            return null;
        }''')
        print(f"Paragraph text: {text_style}")

    # Check presentation container
    container_style = page.evaluate('''() => {
        const el = document.querySelector('.presentation-container');
        if (el) {
            const style = window.getComputedStyle(el);
            return {
                background: style.backgroundColor,
                color: style.color
            };
        }
        return null;
    }''')
    print(f"Presentation container: {container_style}")

    # Check header
    header_style = page.evaluate('''() => {
        const el = document.querySelector('.document-header');
        if (el) {
            const style = window.getComputedStyle(el);
            return {
                background: style.backgroundColor,
                color: style.color
            };
        }
        return null;
    }''')
    print(f"Document header: {header_style}")

    # Get body styles
    body_style = page.evaluate('''() => {
        const style = window.getComputedStyle(document.body);
        return {
            background: style.backgroundColor,
            color: style.color
        };
    }''')
    print(f"Body: {body_style}")

    # Check if dark mode class is present
    dark_mode = page.evaluate('''() => {
        return {
            htmlClass: document.documentElement.className,
            bodyClass: document.body.className,
            hasDarkClass: document.documentElement.classList.contains('dark') ||
                          document.body.classList.contains('dark')
        };
    }''')
    print(f"Dark mode check: {dark_mode}")

    browser.close()
