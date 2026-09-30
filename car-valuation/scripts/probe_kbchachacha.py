"""Discovery probe — open KB차차차, find K7 2014 listings, capture network."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from playwright.async_api import async_playwright  # noqa: E402


SEARCH_URLS = [
    "https://www.kbchachacha.com/public/search/main.kbc",
    "https://www.kbchachacha.com/public/search/list.empty",
]


async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        page = await ctx.new_page()

        captured: list[str] = []

        def on_request(req):
            url = req.url
            if "kbchachacha.com" in url and any(
                k in url for k in ("search", "list", "api", "json", "data")
            ):
                line = f"[{req.method}] {url}"
                captured.append(line)
                print(f"REQ: {line[:200]}")

        page.on("request", on_request)

        for url in SEARCH_URLS:
            print(f"\n=== NAVIGATING ===\n{url}")
            try:
                await page.goto(url, wait_until="networkidle", timeout=60_000)
            except Exception as e:  # noqa: BLE001
                print(f"  nav error: {e}")
            await asyncio.sleep(3)

        # Try executing the site's search via the search page UI
        try:
            print("\n=== Trying URL-param search ===")
            url = "https://www.kbchachacha.com/public/search/list.empty?makerCode=&classCode=&modelCode=&yearFrom=2014&yearTo=2014&keyword=K7"
            await page.goto(url, wait_until="networkidle", timeout=60_000)
            await asyncio.sleep(4)
        except Exception as e:  # noqa: BLE001
            print(f"  search nav error: {e}")

        print(f"\n--- final URL: {page.url}")
        print(f"--- captured {len(captured)} requests ---")
        for r in captured:
            print(r)

        # peek at first listing card if any
        try:
            html = await page.content()
            # find price-ish strings
            import re
            prices = re.findall(r"(\d{1,4},\d{3})\s*만", html)[:15]
            print(f"\nprice-like strings in DOM: {prices}")
        except Exception as e:  # noqa: BLE001
            print(f"  dom error: {e}")

        await asyncio.sleep(3)
        await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
