"""Discovery probe — open encar, perform K7 2014 search, capture network.

Logs every request to api.encar.com so we can learn the current URL/query
shape. Run once when porting the scraper to a new encar revision.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from playwright.async_api import async_playwright  # noqa: E402


SEARCH_URLS = [
    # Try several known/likely entry points.
    'https://www.encar.com/dc/dc_carsearchlist.do?carType=kor#!{"action":"(And.Hidden.N._.ModelGroup.K7._.Year.range(201401..201412).)","sort":"ModifiedDate","page":1,"limit":20}',
    "https://www.encar.com/cars/search?type=kor&modelGroup=K7&yearFrom=2014&yearTo=2014",
    "https://www.encar.com/dc/dc_carsearchlist.do?carType=kor",
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
            if "encar.com" in url and ("api." in url or "/api" in url or "search" in url):
                captured.append(f"[{req.method}] {url}")
                print(f"REQ: [{req.method}] {url[:200]}")

        page.on("request", on_request)

        for url in SEARCH_URLS:
            print(f"\n=== NAVIGATING ===\n{url[:140]}")
            try:
                await page.goto(url, wait_until="networkidle", timeout=60_000)
            except Exception as e:  # noqa: BLE001
                print(f"  nav error: {e}")
            await asyncio.sleep(4)

        print("\n\n--- final URL ---")
        print(page.url)
        print(f"\n--- captured {len(captured)} requests ---")
        for r in captured:
            print(r)

        # Keep open briefly so a human can confirm
        await asyncio.sleep(3)
        await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
