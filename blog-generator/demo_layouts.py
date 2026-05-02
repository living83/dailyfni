"""3가지 레이아웃 데모 이미지 생성"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ai.html_banner import _build_html, _pick_theme, _detect_category, IMAGES_DIR

async def main():
    from playwright.async_api import async_playwright

    title = "회생후반기자금론 최대 7000만원, 10%대 금리로 대환받는 방법"
    category = "금융 정보 블로그"
    theme = _pick_theme("회생후반기자금론")

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        for i in range(3):
            html = _build_html(title, "", category, theme, layout=i)
            html_path = IMAGES_DIR / f"_demo_{i}.html"
            png_path = IMAGES_DIR / f"demo_layout_{i}.png"
            html_path.write_text(html, encoding="utf-8")

            page = await browser.new_page(viewport={"width": 960, "height": 540})
            await page.goto(f"file:///{html_path.resolve()}", wait_until="networkidle")
            await asyncio.sleep(1.5)
            await page.screenshot(path=str(png_path), type="png")
            await page.close()
            html_path.unlink(missing_ok=True)
            print(f"Layout {i}: {png_path}")

        await browser.close()

asyncio.run(main())
