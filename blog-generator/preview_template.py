"""HTML 배너 템플릿 미리보기 — Playwright로 스크린샷 생성"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

TEMPLATE = Path(__file__).parent / "data" / "images" / "template_preview.html"
OUTPUT = Path(__file__).parent / "data" / "images" / "template_preview.png"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 960, "height": 540})
        await page.goto(f"file://{TEMPLATE.resolve()}", wait_until="networkidle")
        # 폰트 로딩 대기
        await asyncio.sleep(2)
        await page.screenshot(path=str(OUTPUT), type="png")
        await browser.close()
        print(f"미리보기 저장: {OUTPUT}")

asyncio.run(main())
