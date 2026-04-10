"""
HTML 배너 템플릿 → PNG 이미지 생성기
Playwright로 HTML을 렌더링하여 960x540 PNG 스크린샷을 생성합니다.
카테고리/제목/소제목을 동적으로 주입하고, 키워드 기반으로 배경색 테마를 결정합니다.
"""

import asyncio
import hashlib
import time
from pathlib import Path
from typing import Optional

from loguru import logger

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import settings

IMAGES_DIR = settings.IMAGES_DIR

# ── 배경 테마 (키워드 해시 기반으로 선택) ──
THEMES = [
    # bg_gradient, badge_border, badge_text, title_color, subtitle_color, bottom_gradient
    {
        "bg": "linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 30%, #b2dfdb 70%, #e0f2f1 100%)",
        "deco": "#4db6ac", "badge_border": "#80cbc4", "badge_text": "#00796b",
        "title": "#1a237e", "subtitle": "#546e7a",
        "bottom": "linear-gradient(90deg, #26a69a, #42a5f5, #7e57c2)",
    },
    {
        "bg": "linear-gradient(135deg, #e3f2fd 0%, #bbdefb 30%, #90caf9 70%, #e1f5fe 100%)",
        "deco": "#42a5f5", "badge_border": "#90caf9", "badge_text": "#1565c0",
        "title": "#0d47a1", "subtitle": "#546e7a",
        "bottom": "linear-gradient(90deg, #1e88e5, #5c6bc0, #ab47bc)",
    },
    {
        "bg": "linear-gradient(135deg, #fce4ec 0%, #f8bbd0 30%, #f48fb1 70%, #fce4ec 100%)",
        "deco": "#e91e63", "badge_border": "#f48fb1", "badge_text": "#ad1457",
        "title": "#880e4f", "subtitle": "#6d4c5e",
        "bottom": "linear-gradient(90deg, #e91e63, #ff5722, #ff9800)",
    },
    {
        "bg": "linear-gradient(135deg, #fff3e0 0%, #ffe0b2 30%, #ffcc80 70%, #fff8e1 100%)",
        "deco": "#ff9800", "badge_border": "#ffcc80", "badge_text": "#e65100",
        "title": "#bf360c", "subtitle": "#6d4c41",
        "bottom": "linear-gradient(90deg, #ff6d00, #ff9100, #ffc400)",
    },
    {
        "bg": "linear-gradient(135deg, #ede7f6 0%, #d1c4e9 30%, #b39ddb 70%, #f3e5f5 100%)",
        "deco": "#7e57c2", "badge_border": "#b39ddb", "badge_text": "#4527a0",
        "title": "#311b92", "subtitle": "#5e548e",
        "bottom": "linear-gradient(90deg, #7e57c2, #5c6bc0, #26c6da)",
    },
    {
        "bg": "linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 30%, #80deea 70%, #e0f7fa 100%)",
        "deco": "#00bcd4", "badge_border": "#80deea", "badge_text": "#00838f",
        "title": "#006064", "subtitle": "#37474f",
        "bottom": "linear-gradient(90deg, #00acc1, #26a69a, #66bb6a)",
    },
]

# ── 카테고리 자동 결정 (키워드 기반) ──
CATEGORY_KEYWORDS = {
    "금융 정보 블로그": ["대출", "금리", "회생", "파산", "신용", "투자", "보험", "연금", "적금", "예금", "카드", "은행", "금융"],
    "건강 정보 블로그": ["건강", "다이어트", "운동", "의료", "병원", "약", "질병", "영양", "비타민", "헬스"],
    "부동산 정보 블로그": ["부동산", "아파트", "전세", "월세", "분양", "매매", "임대", "주택", "토지"],
    "법률 정보 블로그": ["법률", "변호사", "소송", "이혼", "상속", "형사", "민사"],
    "IT · 테크 블로그": ["IT", "프로그래밍", "코딩", "AI", "앱", "소프트웨어", "컴퓨터"],
    "생활 정보 블로그": [],  # 기본 fallback
}


def _detect_category(keyword: str, title: str = "") -> str:
    text = f"{keyword} {title}".lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            return cat
    return "생활 정보 블로그"


def _pick_theme(keyword: str) -> dict:
    idx = int(hashlib.md5(keyword.encode()).hexdigest(), 16) % len(THEMES)
    return THEMES[idx]


def _escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _build_html(title: str, subtitle: str = "", category: str = "금융 정보 블로그", theme: dict = None) -> str:
    if theme is None:
        theme = THEMES[0]

    # 제목이 30자 이상이면 폰트 살짝 줄임
    title_size = "38px" if len(title) > 30 else "42px"
    title_escaped = _escape_html(title)
    # <br> 삽입: 쉼표 뒤 또는 중간 지점
    if "," in title_escaped:
        title_html = title_escaped.replace(",", ",<br>", 1)
    elif len(title_escaped) > 20:
        mid = len(title_escaped) // 2
        space_pos = title_escaped.rfind(" ", 0, mid + 5)
        if space_pos > 5:
            title_html = title_escaped[:space_pos] + "<br>" + title_escaped[space_pos:]
        else:
            title_html = title_escaped
    else:
        title_html = title_escaped

    subtitle_html = _escape_html(subtitle) if subtitle else ""

    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:960px;height:540px;font-family:'Noto Sans KR',sans-serif;overflow:hidden}}
.b{{width:960px;height:540px;background:{theme['bg']};position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 60px}}
.badge{{display:inline-block;background:rgba(255,255,255,0.7);border:1.5px solid {theme['badge_border']};border-radius:20px;padding:7px 22px;font-size:14px;color:{theme['badge_text']};font-weight:500;letter-spacing:1.5px;margin-bottom:32px}}
.t{{text-align:center;font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:24px;text-shadow:0 1px 3px rgba(0,0,0,0.06);word-break:keep-all}}
.s{{text-align:center;font-size:20px;font-weight:500;color:{theme['subtitle']};line-height:1.5}}
.d{{position:absolute;border-radius:50%;opacity:0.12}}
.d1{{width:220px;height:220px;background:{theme['deco']};top:-50px;right:-40px}}
.d2{{width:140px;height:140px;background:{theme['deco']};bottom:-30px;left:-30px}}
.d3{{width:100px;height:100px;background:{theme['deco']};bottom:60px;right:60px}}
.d4{{width:70px;height:70px;background:{theme['deco']};top:80px;left:50px}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:6px;background:{theme['bottom']}}}
</style></head><body>
<div class="b">
<div class="d d1"></div><div class="d d2"></div><div class="d d3"></div><div class="d d4"></div>
<div class="badge">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="bl"></div>
</div></body></html>"""


async def generate_html_banner(
    keyword: str,
    title: str = "",
    subtitle: str = "",
    is_ad: bool = False,
) -> Optional[str]:
    """
    HTML 템플릿 기반 블로그 배너 이미지 생성.

    Args:
        keyword: 포스팅 키워드
        title: 블로그 글 제목 (배너 메인 텍스트)
        subtitle: 소제목 (배너 하단 텍스트, 빈 문자열이면 생략)
        is_ad: 광고글 여부 (카테고리 판단에 사용)

    Returns:
        생성된 PNG 파일 경로, 실패 시 None
    """
    from playwright.async_api import async_playwright

    display_title = title or keyword
    category = _detect_category(keyword, title)
    theme = _pick_theme(keyword)

    html = _build_html(display_title, subtitle, category, theme)

    # 임시 HTML 파일 저장
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    ts = int(time.time() * 1000)
    h = hashlib.md5(keyword.encode()).hexdigest()[:8]
    html_path = IMAGES_DIR / f"_tmp_banner_{h}_{ts}.html"
    png_path = IMAGES_DIR / f"banner_{h}_{ts}.png"

    html_path.write_text(html, encoding="utf-8")

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 960, "height": 540})
            await page.goto(f"file:///{html_path.resolve()}", wait_until="networkidle")
            # 웹폰트 로딩 대기
            await asyncio.sleep(1.5)
            await page.screenshot(path=str(png_path), type="png")
            await browser.close()

        logger.info(f"HTML 배너 생성 완료: {png_path}")
        return str(png_path)

    except Exception as e:
        logger.error(f"HTML 배너 생성 실패: {e}")
        return None
    finally:
        # 임시 HTML 삭제
        try:
            html_path.unlink(missing_ok=True)
        except Exception:
            pass
