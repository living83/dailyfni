"""Capture KB search using actual maker/model codes via the filter API."""
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
        page = await ctx.new_page()

        # 1) Hit carMaker.json to discover maker codes
        page_response = await page.goto(
            "https://www.kbchachacha.com/public/search/carMaker.json?page=1",
            wait_until="domcontentloaded",
            timeout=30_000,
        )
        body = await page.content()
        # The JSON is in <pre> by Chrome's default JSON renderer
        import re
        json_match = re.search(r"\{.*\}", body, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            print(f"carMaker.json top-level keys: {list(data.keys())}")
            # KB returns {result: {... maker list ...}, ...}
            for k, v in data.items():
                if isinstance(v, list):
                    print(f"\n--- {k} (list of {len(v)}) ---")
                    for item in v[:5]:
                        print(f"  {item}")
                elif isinstance(v, dict):
                    print(f"\n--- {k} (dict) ---")
                    for sk, sv in list(v.items())[:8]:
                        if isinstance(sv, list):
                            print(f"  {sk}: list of {len(sv)}")
                            for it in sv[:5]:
                                print(f"    {it}")
                        else:
                            print(f"  {sk}: {sv}")

        # 2) Now navigate to search page and listen for the model-list API
        api_calls: list[tuple[str, str]] = []

        async def on_response(resp):
            url = resp.url
            if "kbchachacha.com" in url and (".json" in url or "/list" in url):
                try:
                    body = await resp.text()
                    if 50 < len(body) < 8000:
                        api_calls.append((url, body[:2000]))
                except Exception:
                    pass

        page.on("response", on_response)

        # try search with simple makerCode=01 (Hyundai is usually 01)? maker codes are likely
        # encoded — KB shows them in filter. Try several known codes for Kia.
        test_urls = [
            "https://www.kbchachacha.com/public/search/list.empty?page=1&sort=-orderDate&makerCode=003",
            "https://www.kbchachacha.com/public/search/list.empty?page=1&makerCode=003&classCode=2110",
            "https://www.kbchachacha.com/public/search/carClass.json?makerCode=003",
            "https://www.kbchachacha.com/public/search/carModel.json?makerCode=003&classCode=2110",
        ]
        for u in test_urls:
            print(f"\n>>> {u}")
            try:
                await page.goto(u, wait_until="domcontentloaded", timeout=30_000)
                await asyncio.sleep(1.5)
                html = await page.content()
                pre = re.search(r"<pre[^>]*>(.*?)</pre>", html, re.DOTALL)
                if pre:
                    snippet = pre.group(1)[:1500]
                    print(f"  RESPONSE: {snippet}")
                else:
                    print(f"  (HTML page, len={len(html)})")
            except Exception as e:  # noqa: BLE001
                print(f"  error: {e}")

        print(f"\n--- captured {len(api_calls)} api responses ---")
        for u, b in api_calls[:5]:
            print(f"{u}\n  {b[:600]}\n")

        await ctx.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
