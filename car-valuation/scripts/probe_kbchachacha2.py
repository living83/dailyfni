"""Deeper probe — render search page, scroll, capture full result count + price list."""
from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from playwright.async_api import async_playwright  # noqa: E402


async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        page = await ctx.new_page()

        api_calls: list[tuple[str, str]] = []

        async def on_response(resp):
            url = resp.url
            if "kbchachacha.com" in url and resp.request.method in ("GET", "POST"):
                if any(k in url for k in (".json", "/list", "/search")):
                    try:
                        body = await resp.text()
                        if body and len(body) < 5000:
                            api_calls.append((url, body[:1200]))
                    except Exception:
                        pass

        page.on("response", on_response)

        url = "https://www.kbchachacha.com/public/search/list.empty?keyword=K7&yearFrom=2014&yearTo=2014"
        print(f"NAV: {url}")
        await page.goto(url, wait_until="networkidle", timeout=60_000)
        await asyncio.sleep(3)

        # try scrolling to trigger any infinite-scroll
        for _ in range(3):
            await page.mouse.wheel(0, 2000)
            await asyncio.sleep(1.5)

        html = await page.content()
        prices = re.findall(r"(\d{1,4},\d{3})\s*만", html)
        print(f"\nprice-like strings count: {len(prices)}, sample: {prices[:25]}")

        # Look for total count text e.g. "총 N건"
        total_match = re.search(r"(\d{1,5})\s*건", html)
        print(f"total text: {total_match.group(0) if total_match else 'N/A'}")

        # Save full HTML for inspection
        Path("logs/kb_search.html").write_text(html, encoding="utf-8")
        print(f"saved DOM -> logs/kb_search.html ({len(html)} bytes)")

        # Find listing card containers - common KB patterns
        for selector in [".list-1", ".search-result", "[data-car-seq]", ".car-list",
                         ".list-area", "ul.list-1 li", ".item"]:
            try:
                cnt = await page.locator(selector).count()
                if cnt:
                    print(f"selector {selector!r}: {cnt} elements")
            except Exception:
                pass

        print(f"\n--- captured {len(api_calls)} JSON-ish responses ---")
        for u, body in api_calls[:6]:
            print(f"\nURL: {u[:160]}")
            print(f"BODY: {body[:400]}")

        await asyncio.sleep(2)
        await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
