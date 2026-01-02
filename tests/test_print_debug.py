#!/usr/bin/env python3
"""Debug test for print study view"""

from playwright.sync_api import sync_playwright
import json

def test_print_study_debug():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console logs
        console_logs = []
        def on_console(msg):
            console_logs.append(f"[{msg.type}] {msg.text}")
        page.on("console", on_console)

        # Capture network requests
        api_responses = []
        def on_response(response):
            if "/api/" in response.url:
                try:
                    body = response.text()
                    api_responses.append({
                        "url": response.url,
                        "status": response.status,
                        "body_preview": body[:500] if body else None
                    })
                except:
                    api_responses.append({
                        "url": response.url,
                        "status": response.status,
                        "body_preview": "Could not read body"
                    })
        page.on("response", on_response)

        url = "http://localhost:5173/print/study?doc=067_excellence_of_knowledge"
        print(f"\n=== Debug Print Study View ===")
        print(f"URL: {url}\n")

        page.goto(url)
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(3000)

        # Screenshot
        page.screenshot(path="tests/print_study_debug.png", full_page=True)

        # Print console logs
        print("=== Console Logs ===")
        for log in console_logs:
            print(f"  {log}")

        # Print API responses
        print("\n=== API Responses ===")
        for resp in api_responses:
            print(f"  URL: {resp['url']}")
            print(f"  Status: {resp['status']}")
            if resp['body_preview']:
                # Check if it has segments
                if 'segments' in resp['body_preview']:
                    print(f"  Has segments: YES")
                else:
                    print(f"  Has segments: NO")
                print(f"  Preview: {resp['body_preview'][:200]}...")
            print()

        # Check page content
        print("=== Page Analysis ===")

        # Check for segments
        segment_rows = page.locator('.segment-row')
        print(f"Segment rows found: {segment_rows.count()}")

        # Check for the no-segments notice
        no_segments = page.locator('.no-segments-notice')
        if no_segments.count() > 0:
            print(f"No-segments notice: VISIBLE")
        else:
            print(f"No-segments notice: not visible")

        # Check paragraphs container
        para_blocks = page.locator('.paragraph-block')
        print(f"Paragraph blocks: {para_blocks.count()}")

        browser.close()
        print("\n=== Debug Complete ===")

if __name__ == "__main__":
    test_print_study_debug()
