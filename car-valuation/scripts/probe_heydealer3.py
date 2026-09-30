"""Discover heydealer market-api filter params and car data shape."""
from __future__ import annotations

import asyncio
import json
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

        # Warm session — main page mints auth token
        page = await ctx.new_page()
        await page.goto("https://www.heydealer.com/", wait_until="networkidle", timeout=45_000)
        await asyncio.sleep(2)

        async def get_json(url: str):
            r = await ctx.request.get(url, headers={
                "Referer": "https://www.heydealer.com/",
                "Origin": "https://www.heydealer.com",
                "Accept": "application/json",
            })
            return r.status, await r.text()

        targets = [
            "https://market-api.heydealer.com/v2/customers/web/market/car_meta/brands/",
            "https://market-api.heydealer.com/v2/customers/web/market/filters/",
            # Try a sample listing call without filters first
            "https://market-api.heydealer.com/v2/customers/web/market/cars/?order=recommendation&page=1",
        ]
        for url in targets:
            status, body = await get_json(url)
            print(f"\n=== {url}")
            print(f"  status: {status}")
            print(f"  body[:1500]: {body[:1500]}")

        # Get Kia hash_id from brands list
        _, brands_body = await get_json(
            "https://market-api.heydealer.com/v2/customers/web/market/car_meta/brands/"
        )
        brands = json.loads(brands_body)
        kia = next((b for b in brands if b["name"] == "기아"), None)
        print(f"\n기아: {kia}")
        if not kia:
            return
        kia_hash = kia["hash_id"]

        # Try to fetch Kia's models
        model_urls = [
            f"https://market-api.heydealer.com/v2/customers/web/market/car_meta/brands/{kia_hash}/",
            f"https://market-api.heydealer.com/v2/customers/web/market/car_meta/brands/{kia_hash}/models/",
            f"https://market-api.heydealer.com/v2/customers/web/market/car_meta/models/?brand={kia_hash}",
        ]
        for url in model_urls:
            status, body = await get_json(url)
            print(f"\n=== {url}")
            print(f"  status: {status}, body[:800]: {body[:800]}")

        # Try cars list with brand filter
        list_urls = [
            f"https://market-api.heydealer.com/v2/customers/web/market/cars/?brands={kia_hash}&page=1",
            f"https://market-api.heydealer.com/v2/customers/web/market/cars/?brand={kia_hash}&page=1",
            f"https://market-api.heydealer.com/v2/customers/web/market/cars/?brand_id={kia_hash}&page=1",
            f"https://market-api.heydealer.com/v2/customers/web/market/cars/?manufacturer={kia_hash}&page=1",
        ]
        for url in list_urls:
            status, body = await get_json(url)
            count = body.count('"hash_id"')
            print(f"\n=== {url}\n  status={status}, hash_id count={count}")
            if count > 1:
                # Find structure of first car
                data = json.loads(body)
                if isinstance(data, list) and data:
                    first = data[0]
                    print(f"  first car keys: {list(first.keys())}")
                    print(f"  first car preview: {json.dumps(first, ensure_ascii=False)[:1500]}")
                    break

        await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
