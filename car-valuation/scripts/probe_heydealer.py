"""Discovery probe — figure out what heydealer exposes for per-model market price."""
from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from playwright.async_api import async_playwright  # noqa: E402


CANDIDATES = [
    "https://heydealer.com/",
    "https://www.heydealer.com/",
    "https://heydealer.com/cars",
    "https://heydealer.com/market",
    "https://heydealer.com/price",
    "https://heydealer.com/used-cars",
    "https://heydealer.com/used-cars/K7",
    "https://heydealer.com/cars/K7",
    "https://heydealer.com/market_price",
    "https://heydealer.com/sigae",
    "https://m.heydealer.com/",
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

        api_calls: list[str] = []

        def on_request(req):
            url = req.url
            if "heydealer.com" in url and req.method in ("GET", "POST"):
                if any(k in url for k in (".json", "/api", "/price", "/quote", "/cars", "/market")):
                    api_calls.append(f"[{req.method}] {url}")

        page.on("request", on_request)

        for url in CANDIDATES:
            print(f"\n=== {url}")
            try:
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
                if resp:
                    print(f"  status={resp.status}  final={page.url}")
                    html = await page.content()
                    # peek at price-like and link patterns
                    prices = re.findall(r"(\d{1,4},\d{3})\s*만", html)[:5]
                    if prices:
                        print(f"  prices: {prices}")
                    # links pointing to car/model pages
                    links = re.findall(r'href="(/[^"]+)"', html)
                    interesting = [l for l in links if any(k in l for k in ("car", "model", "price", "market", "K7"))][:10]
                    if interesting:
                        print(f"  links: {interesting}")
                await asyncio.sleep(1.0)
            except Exception as e:  # noqa: BLE001
                print(f"  error: {type(e).__name__}: {e}")

        print(f"\n--- captured {len(api_calls)} api-ish requests ---")
        for c in api_calls:
            print(c)

        await asyncio.sleep(2)
        await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
