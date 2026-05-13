"""Wait for SPA + dump rendered text from heydealer pages to find usable data."""
from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from playwright.async_api import async_playwright  # noqa: E402


TARGETS = [
    "https://www.heydealer.com/cars",          # could be dealer marketplace
    "https://www.heydealer.com/used-cars",
    "https://www.heydealer.com/market_price",
    "https://www.heydealer.com/cars/K7",
    "https://www.heydealer.com/",
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

        api_responses: list[tuple[str, int, str]] = []

        async def on_response(resp):
            url = resp.url
            if "api.heydealer.com" in url or "heydealer.com/v2" in url:
                try:
                    body = await resp.text()
                    api_responses.append((url, resp.status, body[:1500]))
                except Exception:
                    pass

        page.on("response", on_response)

        for url in TARGETS:
            print(f"\n\n=== {url} ===")
            try:
                await page.goto(url, wait_until="networkidle", timeout=45_000)
                await asyncio.sleep(3.5)
            except Exception as e:  # noqa: BLE001
                print(f"  nav error: {e}")
                continue

            # Get rendered body text (SPA-aware)
            try:
                body_text = await page.evaluate("document.body.innerText")
            except Exception:
                body_text = ""
            print(f"  final URL: {page.url}")
            print(f"  body text len: {len(body_text)}")
            # Print first 500 chars
            print(f"  body[:500]:\n{body_text[:500]}")

            # Search for price-like strings
            prices = re.findall(r"(\d{1,4},\d{3})\s*만", body_text)[:8]
            if prices:
                print(f"  prices: {prices}")

            # Search for navigation hints
            links = await page.evaluate(
                "Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(h => h && (h.includes('car') || h.includes('K7') || h.includes('model') || h.includes('price') || h.includes('market')))"
            )
            if links:
                print(f"  links ({len(links)}): {links[:15]}")

        print(f"\n\n--- captured {len(api_responses)} api.heydealer responses ---")
        for u, status, body in api_responses[:20]:
            print(f"\n[{status}] {u}")
            print(f"  {body[:400]}")

        await asyncio.sleep(2)
        await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
