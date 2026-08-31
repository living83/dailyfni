"""Drill down Kia → K7 class code → list.empty filter URL."""
from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from playwright.async_api import async_playwright  # noqa: E402


async def get_json(page, url: str) -> dict:
    await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
    html = await page.content()
    m = re.search(r"\{.*\}", html, re.DOTALL)
    return json.loads(m.group(0)) if m else {}


async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        page = await ctx.new_page()

        # Class codes for Kia
        cls = await get_json(page, "https://www.kbchachacha.com/public/search/carClass.json?makerCode=102")
        print("carClass.json keys:", list(cls.get("result", {}).keys()))
        hits = cls.get("result", {}).get("code", [])
        print(f"code list length: {len(hits)}")
        if hits:
            print("sample classes:")
            for h in hits[:25]:
                print(f"  {h}")
        else:
            # KB sometimes returns the classes nested under another key
            print("dumping result:")
            print(json.dumps(cls.get("result", {}), ensure_ascii=False, indent=2)[:3000])

        # Try to find K7
        k7_class = None
        for h in hits:
            if isinstance(h, dict) and "K7" in (h.get("className", "") or ""):
                k7_class = h
                break
        print(f"\nK7 class found: {k7_class}")

        # Try carModel.json with what we know
        cm = await get_json(page, "https://www.kbchachacha.com/public/search/carModel.json?makerCode=102")
        print(f"\ncarModel.json (no classCode) top keys: {list(cm.get('result', {}).keys())}")
        print(json.dumps(cm.get("result", {}), ensure_ascii=False)[:2000])

        # Try the list.empty with maker only
        await page.goto(
            "https://www.kbchachacha.com/public/search/list.empty?page=1&makerCode=102&yearFrom=201401&yearTo=201412",
            wait_until="networkidle",
            timeout=45_000,
        )
        html = await page.content()
        prices = re.findall(r'class="price"\s*>\s*([\d,]+)\s*<', html, re.DOTALL)
        titles = re.findall(r'<strong class="tit">\s*(.+?)\s*</strong>', html)
        print(f"\nlist.empty (makerCode=102, year=201401-201412): {len(prices)} prices")
        for t, p in zip(titles[:15], prices[:15]):
            print(f"  {t[:50]:50s}  {p}만원")

        await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
