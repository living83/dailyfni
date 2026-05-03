"""
HTML 배너 템플릿 → PNG 이미지 생성기
Playwright로 HTML을 렌더링하여 960x540 PNG 스크린샷을 생성합니다.
카테고리/제목/소제목을 동적으로 주입하고, 키워드 기반으로 배경색 테마를 결정합니다.
"""

import asyncio
import hashlib
import random
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


NUM_LAYOUTS = 30

def _build_html(title: str, subtitle: str = "", category: str = "금융 정보 블로그", theme: dict = None, layout: int = 0) -> str:
    if theme is None:
        theme = THEMES[0]

    title_size = "38px" if len(title) > 30 else "42px"
    title_escaped = _escape_html(title)
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

    layout_funcs = [
        _layout_center_badge, _layout_left_card, _layout_wave_bottom,
        _layout_diagonal_split, _layout_top_bar, _layout_right_panel,
        _layout_gradient_frame, _layout_split_half, _layout_dots_grid,
        _layout_corner_accent, _layout_minimal_line, _layout_magazine,
        _layout_double_frame, _layout_circle_bg, _layout_stripe_side,
        _layout_bottom_card, _layout_zigzag, _layout_spotlight,
        _layout_sidebar, _layout_floating_shapes, _layout_bold_overlay,
        _layout_banner_strip, _layout_geometric, _layout_rounded_inner,
        _layout_step_blocks, _layout_cross_lines, _layout_blob,
        _layout_gradient_text_bg, _layout_photo_frame, _layout_hexagon,
    ]
    idx = layout % len(layout_funcs)
    return layout_funcs[idx](title_html, subtitle_html, category, theme, title_size)


def _layout_center_badge(title_html, subtitle_html, category, theme, title_size):
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


def _layout_left_card(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:960px;height:540px;font-family:'Noto Sans KR',sans-serif;overflow:hidden}}
.wrap{{width:960px;height:540px;background:{theme['bg']};position:relative;display:flex;align-items:center;padding:0 70px}}
.card{{background:rgba(255,255,255,0.85);border-radius:20px;padding:45px 50px;max-width:560px;box-shadow:0 8px 32px rgba(0,0,0,0.08);position:relative;z-index:2}}
.cat{{display:inline-block;background:{theme['badge_text']};color:#fff;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:20px;text-transform:uppercase}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:16px;word-break:keep-all}}
.line{{width:50px;height:4px;background:{theme['bottom']};border-radius:2px;margin-bottom:16px}}
.s{{font-size:17px;font-weight:400;color:{theme['subtitle']};line-height:1.6}}
.side{{position:absolute;right:0;top:0;width:340px;height:540px;display:flex;align-items:center;justify-content:center}}
.ring{{border:3px solid {theme['badge_border']};border-radius:50%;opacity:0.25;position:absolute}}
.r1{{width:260px;height:260px}}
.r2{{width:180px;height:180px}}
.r3{{width:100px;height:100px}}
.dot{{width:12px;height:12px;border-radius:50%;background:{theme['deco']};opacity:0.3;position:absolute}}
.dot1{{top:80px;right:100px}}.dot2{{top:200px;right:50px}}.dot3{{bottom:100px;right:150px}}.dot4{{top:140px;right:250px}}
</style></head><body>
<div class="wrap">
<div class="card">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
<div class="line"></div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="side">
<div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div>
<div class="dot dot1"></div><div class="dot dot2"></div><div class="dot dot3"></div><div class="dot dot4"></div>
</div>
</div></body></html>"""


def _layout_wave_bottom(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:960px;height:540px;font-family:'Noto Sans KR',sans-serif;overflow:hidden}}
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;justify-content:center;padding:50px 80px}}
.cat{{display:inline-flex;align-items:center;gap:8px;margin-bottom:28px}}
.cat-dot{{width:8px;height:8px;border-radius:50%;background:{theme['deco']}}}
.cat-text{{font-size:14px;font-weight:600;color:{theme['badge_text']};letter-spacing:1px}}
.t{{font-size:{title_size};font-weight:900;color:#1a1a2e;line-height:1.4;margin-bottom:20px;word-break:keep-all}}
.t span{{background:linear-gradient(transparent 60%,{theme['badge_border']}50 40%);padding:0 4px}}
.s{{font-size:18px;font-weight:400;color:#666;line-height:1.6;max-width:500px}}
.wave{{position:absolute;bottom:0;left:0;right:0;height:160px;overflow:hidden}}
.wave svg{{position:absolute;bottom:0;width:100%}}
.accent{{position:absolute;top:40px;right:60px;width:120px;height:120px;border-radius:50%;background:{theme['bg']};opacity:0.6}}
.accent2{{position:absolute;top:120px;right:20px;width:60px;height:60px;border-radius:50%;background:{theme['deco']};opacity:0.15}}
.stripe{{position:absolute;right:80px;bottom:180px;display:flex;gap:6px}}
.stripe div{{width:4px;height:30px;background:{theme['deco']};opacity:0.2;border-radius:2px}}
</style></head><body>
<div class="wrap">
<div class="cat"><div class="cat-dot"></div><div class="cat-text">{_escape_html(category)}</div></div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="accent"></div>
<div class="accent2"></div>
<div class="stripe"><div></div><div style="height:22px"></div><div style="height:36px"></div><div style="height:18px"></div></div>
<div class="wave">
<svg viewBox="0 0 960 160" preserveAspectRatio="none">
<path d="M0,80 C200,20 400,140 600,60 C750,10 880,90 960,50 L960,160 L0,160 Z" fill="{theme['deco']}" opacity="0.12"/>
<path d="M0,110 C150,60 350,150 550,80 C700,30 850,100 960,70 L960,160 L0,160 Z" fill="{theme['deco']}" opacity="0.08"/>
</svg>
</div>
</div></body></html>"""


def _common_head():
    return """<meta charset="UTF-8">
<style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{width:960px;height:540px;font-family:'Noto Sans KR',sans-serif;overflow:hidden}</style>"""


def _layout_diagonal_split(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;position:relative;background:#fff;overflow:hidden}}
.bg-diag{{position:absolute;top:0;left:0;width:100%;height:100%;background:{theme['bg']};clip-path:polygon(0 0,70% 0,50% 100%,0 100%)}}
.content{{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;height:100%}}
.cat{{font-size:13px;font-weight:700;color:{theme['badge_text']};letter-spacing:2px;margin-bottom:24px;text-transform:uppercase}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:480px}}
.s{{font-size:17px;color:{theme['subtitle']};max-width:420px;line-height:1.6}}
.deco{{position:absolute;right:60px;top:50%;transform:translateY(-50%);width:160px;height:160px;border:4px solid {theme['badge_border']};border-radius:50%;opacity:0.3}}
.deco2{{position:absolute;right:120px;top:50%;transform:translateY(-50%);width:80px;height:80px;background:{theme['deco']};border-radius:50%;opacity:0.15}}
.line{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']}}}
</style></head><body><div class="wrap">
<div class="bg-diag"></div>
<div class="content">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="deco"></div><div class="deco2"></div>
<div class="line"></div>
</div></body></html>"""


def _layout_top_bar(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fafafa;position:relative;display:flex;flex-direction:column}}
.bar{{height:80px;background:{theme['bottom']};display:flex;align-items:center;padding:0 60px}}
.bar-text{{color:#fff;font-size:14px;font-weight:700;letter-spacing:2px}}
.main{{flex:1;display:flex;flex-direction:column;justify-content:center;padding:50px 60px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:20px;word-break:keep-all}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:600px}}
.sq{{position:absolute;right:50px;bottom:50px;width:100px;height:100px;background:{theme['deco']};opacity:0.08;border-radius:12px;transform:rotate(15deg)}}
.sq2{{position:absolute;right:120px;bottom:100px;width:60px;height:60px;background:{theme['deco']};opacity:0.12;border-radius:8px;transform:rotate(-10deg)}}
</style></head><body><div class="wrap">
<div class="bar"><span class="bar-text">{_escape_html(category)}</span></div>
<div class="main">
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="sq"></div><div class="sq2"></div>
</div></body></html>"""


def _layout_right_panel(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;display:flex;position:relative;overflow:hidden}}
.left{{flex:1;background:{theme['bg']};display:flex;align-items:center;justify-content:center}}
.icon{{width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,0.5);display:flex;align-items:center;justify-content:center;font-size:60px;color:{theme['deco']};box-shadow:0 10px 40px rgba(0,0,0,0.06)}}
.right{{width:560px;background:#fff;display:flex;flex-direction:column;justify-content:center;padding:50px 55px}}
.cat{{display:inline-block;padding:6px 16px;border-radius:4px;background:{theme['deco']};color:#fff;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:24px;width:fit-content}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']}}}
</style></head><body><div class="wrap">
<div class="left"><div class="icon">&#9679;</div></div>
<div class="right">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="bl"></div>
</div></body></html>"""


def _layout_gradient_frame(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:{theme['bg']};display:flex;align-items:center;justify-content:center;position:relative}}
.frame{{width:860px;height:440px;border:3px solid rgba(255,255,255,0.6);border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 60px;position:relative}}
.cat{{font-size:13px;font-weight:600;color:{theme['badge_text']};letter-spacing:2px;margin-bottom:28px}}
.t{{text-align:center;font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:20px;word-break:keep-all}}
.s{{text-align:center;font-size:17px;color:{theme['subtitle']};line-height:1.6}}
.corner{{position:absolute;width:40px;height:40px;border-color:{theme['deco']};border-style:solid}}
.c1{{top:-2px;left:-2px;border-width:4px 0 0 4px;border-radius:8px 0 0 0}}
.c2{{top:-2px;right:-2px;border-width:4px 4px 0 0;border-radius:0 8px 0 0}}
.c3{{bottom:-2px;left:-2px;border-width:0 0 4px 4px;border-radius:0 0 0 8px}}
.c4{{bottom:-2px;right:-2px;border-width:0 4px 4px 0;border-radius:0 0 8px 0}}
</style></head><body><div class="wrap"><div class="frame">
<div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div></div></body></html>"""


def _layout_split_half(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;display:flex;position:relative;overflow:hidden}}
.left{{width:480px;height:540px;background:{theme['bg']};display:flex;align-items:center;justify-content:center;position:relative}}
.left-inner{{width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.35);position:relative}}
.left-inner2{{width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.3);position:absolute;top:40px;left:40px}}
.right{{width:480px;height:540px;background:#fff;display:flex;flex-direction:column;justify-content:center;padding:50px 50px}}
.cat{{display:inline-flex;align-items:center;gap:8px;margin-bottom:24px}}
.cat-bar{{width:4px;height:18px;background:{theme['deco']};border-radius:2px}}
.cat-text{{font-size:13px;font-weight:700;color:{theme['badge_text']};letter-spacing:1.5px}}
.t{{font-size:36px;font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:16px;word-break:keep-all}}
.s{{font-size:16px;color:{theme['subtitle']};line-height:1.6}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']}}}
</style></head><body><div class="wrap">
<div class="left"><div class="left-inner"><div class="left-inner2"></div></div></div>
<div class="right">
<div class="cat"><div class="cat-bar"></div><div class="cat-text">{_escape_html(category)}</div></div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="bl"></div>
</div></body></html>"""


def _layout_dots_grid(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;
background-image:radial-gradient({theme['deco']}15 1.5px,transparent 1.5px);background-size:30px 30px}}
.cat{{display:inline-block;background:{theme['bg']};border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;color:{theme['badge_text']};margin-bottom:28px;width:fit-content}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:620px}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:500px}}
.accent{{position:absolute;right:40px;top:40px;width:140px;height:140px;background:{theme['bg']};border-radius:20px;opacity:0.6}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']}}}
</style></head><body><div class="wrap">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="accent"></div>
<div class="bl"></div>
</div></body></html>"""


def _layout_corner_accent(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;justify-content:center;padding:70px 80px;overflow:hidden}}
.tl{{position:absolute;top:0;left:0;width:300px;height:250px;background:{theme['bg']};border-radius:0 0 60% 0}}
.br{{position:absolute;bottom:0;right:0;width:250px;height:200px;background:{theme['bg']};border-radius:60% 0 0 0}}
.content{{position:relative;z-index:2}}
.cat{{font-size:12px;font-weight:700;color:#fff;background:{theme['deco']};display:inline-block;padding:5px 16px;border-radius:20px;margin-bottom:26px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:600px}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:500px}}
</style></head><body><div class="wrap">
<div class="tl"></div><div class="br"></div>
<div class="content">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
</div></body></html>"""


def _layout_minimal_line(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;display:flex;align-items:center;justify-content:center;position:relative}}
.content{{text-align:center;max-width:680px}}
.line1{{width:60px;height:3px;background:{theme['bottom']};margin:0 auto 28px;border-radius:2px}}
.cat{{font-size:12px;font-weight:600;color:{theme['badge_text']};letter-spacing:3px;text-transform:uppercase;margin-bottom:20px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.4;margin-bottom:20px;word-break:keep-all}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6}}
.line2{{width:60px;height:3px;background:{theme['bottom']};margin:28px auto 0;border-radius:2px}}
.bl{{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:200px;height:4px;background:{theme['bottom']};border-radius:2px}}
</style></head><body><div class="wrap"><div class="content">
<div class="line1"></div>
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="line2"></div>
</div><div class="bl"></div></div></body></html>"""


def _layout_magazine(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#f8f8f8;position:relative;display:flex;overflow:hidden}}
.col-left{{width:8px;background:{theme['bottom']};flex-shrink:0}}
.col-main{{flex:1;display:flex;flex-direction:column;justify-content:center;padding:50px 60px}}
.cat{{font-size:11px;font-weight:700;color:{theme['badge_text']};letter-spacing:3px;text-transform:uppercase;margin-bottom:8px}}
.divider{{width:80px;height:2px;background:{theme['deco']};margin-bottom:28px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:500px;border-left:3px solid {theme['badge_border']};padding-left:16px}}
.col-right{{width:200px;background:{theme['bg']};flex-shrink:0;position:relative}}
.num{{position:absolute;bottom:30px;right:30px;font-size:80px;font-weight:900;color:{theme['deco']};opacity:0.1}}
</style></head><body><div class="wrap">
<div class="col-left"></div>
<div class="col-main">
<div class="cat">{_escape_html(category)}</div>
<div class="divider"></div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="col-right"><div class="num">&#9733;</div></div>
</div></body></html>"""


def _layout_double_frame(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:{theme['bg']};display:flex;align-items:center;justify-content:center;position:relative}}
.outer{{width:880px;height:460px;border:2px solid {theme['badge_border']};border-radius:12px;display:flex;align-items:center;justify-content:center}}
.inner{{width:820px;height:400px;border:1px solid {theme['badge_border']};border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 50px;background:rgba(255,255,255,0.3)}}
.cat{{font-size:14px;font-weight:500;color:{theme['badge_text']};letter-spacing:3px;margin-bottom:24px;padding:6px 20px;border:1px solid {theme['badge_border']};border-radius:4px}}
.t{{text-align:center;font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:16px;word-break:keep-all}}
.s{{text-align:center;font-size:17px;color:{theme['subtitle']};line-height:1.6}}
</style></head><body><div class="wrap"><div class="outer"><div class="inner">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div></div></div></body></html>"""


def _layout_circle_bg(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;overflow:hidden}}
.big-circle{{position:absolute;right:-100px;top:-100px;width:500px;height:500px;border-radius:50%;background:{theme['bg']};opacity:0.7}}
.small-circle{{position:absolute;left:50px;bottom:-60px;width:200px;height:200px;border-radius:50%;background:{theme['bg']};opacity:0.4}}
.content{{position:relative;z-index:2}}
.cat{{display:inline-block;border-bottom:2px solid {theme['deco']};padding-bottom:4px;font-size:13px;font-weight:600;color:{theme['badge_text']};margin-bottom:26px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:580px}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:480px}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']};z-index:3}}
</style></head><body><div class="wrap">
<div class="big-circle"></div><div class="small-circle"></div>
<div class="content">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="bl"></div>
</div></body></html>"""


def _layout_stripe_side(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;overflow:hidden}}
.stripes{{width:60px;height:540px;display:flex;flex-direction:column;gap:0;flex-shrink:0}}
.stripes div{{flex:1}}
.s1{{background:{theme['deco']};opacity:0.15}}.s2{{background:{theme['deco']};opacity:0.25}}.s3{{background:{theme['deco']};opacity:0.35}}
.s4{{background:{theme['deco']};opacity:0.45}}.s5{{background:{theme['deco']};opacity:0.55}}.s6{{background:{theme['deco']};opacity:0.45}}
.s7{{background:{theme['deco']};opacity:0.35}}.s8{{background:{theme['deco']};opacity:0.25}}
.main{{flex:1;display:flex;flex-direction:column;justify-content:center;padding:50px 60px}}
.cat{{font-size:13px;font-weight:700;color:{theme['badge_text']};letter-spacing:2px;margin-bottom:24px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all}}
.sub{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:550px}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']}}}
</style></head><body><div class="wrap">
<div class="stripes"><div class="s1"></div><div class="s2"></div><div class="s3"></div><div class="s4"></div><div class="s5"></div><div class="s6"></div><div class="s7"></div><div class="s8"></div></div>
<div class="main">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='sub'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="bl"></div>
</div></body></html>"""


def _layout_bottom_card(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:{theme['bg']};position:relative;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden}}
.top-deco{{position:absolute;top:30px;left:50%;transform:translateX(-50%);display:flex;gap:12px}}
.top-deco div{{width:10px;height:10px;border-radius:50%;background:{theme['deco']};opacity:0.25}}
.card{{background:#fff;border-radius:24px 24px 0 0;padding:45px 60px 50px;box-shadow:0 -4px 30px rgba(0,0,0,0.06)}}
.cat{{display:inline-block;background:{theme['deco']};color:#fff;padding:5px 14px;border-radius:6px;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:20px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:16px;word-break:keep-all}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6}}
</style></head><body><div class="wrap">
<div class="top-deco"><div></div><div></div><div></div><div></div><div></div></div>
<div class="card">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
</div></body></html>"""


def _layout_zigzag(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;justify-content:center;padding:50px 80px;overflow:hidden}}
.cat{{font-size:13px;font-weight:700;color:{theme['badge_text']};letter-spacing:2px;margin-bottom:24px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:600px}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:500px}}
.zz{{position:absolute;bottom:0;left:0;right:0;height:60px;overflow:hidden}}
.zz svg{{width:100%;height:100%}}
.zt{{position:absolute;top:0;left:0;right:0;height:40px;overflow:hidden}}
.zt svg{{width:100%;height:100%}}
.side-bar{{position:absolute;right:0;top:0;bottom:0;width:120px;background:{theme['bg']};opacity:0.5}}
</style></head><body><div class="wrap">
<div class="zt"><svg viewBox="0 0 960 40" preserveAspectRatio="none"><path d="M0,40 L40,0 L80,40 L120,0 L160,40 L200,0 L240,40 L280,0 L320,40 L360,0 L400,40 L440,0 L480,40 L520,0 L560,40 L600,0 L640,40 L680,0 L720,40 L760,0 L800,40 L840,0 L880,40 L920,0 L960,40 Z" fill="{theme['deco']}" opacity="0.08"/></svg></div>
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="side-bar"></div>
<div class="zz"><svg viewBox="0 0 960 60" preserveAspectRatio="none"><path d="M0,0 L30,60 L60,0 L90,60 L120,0 L150,60 L180,0 L210,60 L240,0 L270,60 L300,0 L330,60 L360,0 L390,60 L420,0 L450,60 L480,0 L510,60 L540,0 L570,60 L600,0 L630,60 L660,0 L690,60 L720,0 L750,60 L780,0 L810,60 L840,0 L870,60 L900,0 L930,60 L960,0 L960,60 L0,60 Z" fill="{theme['deco']}" opacity="0.1"/></svg></div>
</div></body></html>"""


def _layout_spotlight(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:radial-gradient(ellipse at 30% 50%,{theme['bg']} 0%,#fff 70%);position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;overflow:hidden}}
.cat{{display:inline-flex;align-items:center;gap:10px;margin-bottom:26px}}
.cat-icon{{width:24px;height:24px;border-radius:50%;background:{theme['deco']};opacity:0.6}}
.cat-text{{font-size:14px;font-weight:600;color:{theme['badge_text']};letter-spacing:1.5px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:620px}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:500px}}
.glow{{position:absolute;right:80px;top:50%;transform:translateY(-50%);width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,{theme['deco']}20 0%,transparent 70%)}}
.bl{{position:absolute;bottom:0;left:0;width:300px;height:5px;background:{theme['bottom']};border-radius:0 2px 0 0}}
</style></head><body><div class="wrap">
<div class="cat"><div class="cat-icon"></div><div class="cat-text">{_escape_html(category)}</div></div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="glow"></div>
<div class="bl"></div>
</div></body></html>"""


def _layout_sidebar(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;display:flex;position:relative;overflow:hidden}}
.side{{width:100px;background:{theme['bottom']};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:15px;flex-shrink:0}}
.side-dot{{width:8px;height:8px;border-radius:50%;background:#fff;opacity:0.4}}
.side-dot.active{{opacity:1;width:12px;height:12px}}
.main{{flex:1;background:#fff;display:flex;flex-direction:column;justify-content:center;padding:50px 60px}}
.cat{{font-size:11px;font-weight:700;color:{theme['badge_text']};letter-spacing:3px;text-transform:uppercase;margin-bottom:12px}}
.line{{width:40px;height:3px;background:{theme['deco']};margin-bottom:28px;border-radius:2px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:550px}}
</style></head><body><div class="wrap">
<div class="side"><div class="side-dot"></div><div class="side-dot"></div><div class="side-dot active"></div><div class="side-dot"></div><div class="side-dot"></div></div>
<div class="main">
<div class="cat">{_escape_html(category)}</div>
<div class="line"></div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
</div></body></html>"""


def _layout_floating_shapes(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:{theme['bg']};position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 80px;overflow:hidden}}
.shape{{position:absolute;opacity:0.15}}
.sh1{{width:100px;height:100px;background:{theme['deco']};border-radius:20px;top:40px;left:60px;transform:rotate(25deg)}}
.sh2{{width:70px;height:70px;border:3px solid {theme['deco']};border-radius:50%;top:60px;right:120px}}
.sh3{{width:120px;height:60px;background:{theme['deco']};border-radius:30px;bottom:80px;left:150px;transform:rotate(-15deg)}}
.sh4{{width:50px;height:50px;background:{theme['deco']};top:200px;right:60px;transform:rotate(45deg)}}
.sh5{{width:80px;height:80px;border:3px solid {theme['deco']};border-radius:16px;bottom:40px;right:200px;transform:rotate(20deg)}}
.sh6{{width:16px;height:16px;background:{theme['deco']};border-radius:50%;top:150px;left:300px;opacity:0.25}}
.content{{position:relative;z-index:2;text-align:center}}
.cat{{display:inline-block;background:rgba(255,255,255,0.6);padding:6px 20px;border-radius:20px;font-size:13px;font-weight:600;color:{theme['badge_text']};margin-bottom:26px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']}}}
</style></head><body><div class="wrap">
<div class="shape sh1"></div><div class="shape sh2"></div><div class="shape sh3"></div><div class="shape sh4"></div><div class="shape sh5"></div><div class="shape sh6"></div>
<div class="content">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="bl"></div>
</div></body></html>"""


def _layout_bold_overlay(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:{theme['bg']};position:relative;display:flex;align-items:center;overflow:hidden}}
.bg-text{{position:absolute;right:-20px;top:50%;transform:translateY(-50%);font-size:200px;font-weight:900;color:{theme['deco']};opacity:0.06;white-space:nowrap;letter-spacing:-5px}}
.content{{position:relative;z-index:2;padding:0 80px;max-width:650px}}
.cat{{font-size:13px;font-weight:600;color:{theme['badge_text']};letter-spacing:2px;margin-bottom:24px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:6px;background:{theme['bottom']}}}
</style></head><body><div class="wrap">
<div class="bg-text">BLOG</div>
<div class="content">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="bl"></div>
</div></body></html>"""


def _layout_banner_strip(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;overflow:hidden}}
.top{{flex:1;display:flex;align-items:flex-end;padding:0 60px 20px;position:relative}}
.top-bg{{position:absolute;top:0;left:0;right:0;bottom:0;background:{theme['bg']};opacity:0.3}}
.cat-wrap{{position:relative;z-index:2}}
.cat{{font-size:13px;font-weight:600;color:{theme['badge_text']};letter-spacing:2px}}
.strip{{background:{theme['bottom']};padding:28px 60px;position:relative}}
.t{{font-size:36px;font-weight:900;color:#fff;line-height:1.35;word-break:keep-all;text-shadow:0 1px 3px rgba(0,0,0,0.15)}}
.bottom{{flex:1;display:flex;align-items:flex-start;padding:20px 60px;position:relative}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6}}
.deco{{position:absolute;right:40px;top:20px;bottom:20px;width:3px;background:{theme['deco']};opacity:0.2}}
</style></head><body><div class="wrap">
<div class="top"><div class="top-bg"></div><div class="cat-wrap"><div class="cat">{_escape_html(category)}</div></div></div>
<div class="strip"><div class="t">{title_html}</div></div>
<div class="bottom">{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}<div class="deco"></div></div>
</div></body></html>"""


def _layout_geometric(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;overflow:hidden}}
.geo{{position:absolute;opacity:0.08}}
.g1{{width:300px;height:300px;border:4px solid {theme['deco']};top:-80px;right:-80px;transform:rotate(45deg)}}
.g2{{width:200px;height:200px;border:3px solid {theme['deco']};bottom:-60px;right:100px;transform:rotate(30deg)}}
.g3{{width:150px;height:150px;background:{theme['deco']};bottom:-40px;left:-40px;transform:rotate(60deg);opacity:0.06}}
.cat{{display:inline-block;border:1.5px solid {theme['deco']};padding:6px 18px;border-radius:4px;font-size:12px;font-weight:700;color:{theme['badge_text']};letter-spacing:1.5px;margin-bottom:26px;width:fit-content;position:relative;z-index:2}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:620px;position:relative;z-index:2}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:500px;position:relative;z-index:2}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']}}}
</style></head><body><div class="wrap">
<div class="geo g1"></div><div class="geo g2"></div><div class="geo g3"></div>
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="bl"></div>
</div></body></html>"""


def _layout_rounded_inner(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:{theme['bg']};display:flex;align-items:center;justify-content:center;position:relative}}
.card{{width:840px;height:420px;background:#fff;border-radius:30px;display:flex;flex-direction:column;justify-content:center;padding:50px 60px;box-shadow:0 10px 40px rgba(0,0,0,0.06);position:relative;overflow:hidden}}
.accent{{position:absolute;top:0;left:0;width:6px;height:100%;background:{theme['bottom']};border-radius:30px 0 0 30px}}
.cat{{font-size:12px;font-weight:700;color:{theme['badge_text']};letter-spacing:2px;margin-bottom:24px;margin-left:14px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;margin-left:14px}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:550px;margin-left:14px}}
.deco{{position:absolute;right:30px;bottom:30px;display:flex;gap:8px}}
.deco div{{width:8px;height:8px;border-radius:50%;background:{theme['deco']};opacity:0.2}}
</style></head><body><div class="wrap"><div class="card">
<div class="accent"></div>
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="deco"><div></div><div></div><div></div></div>
</div></div></body></html>"""


def _layout_step_blocks(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;overflow:hidden}}
.steps{{position:absolute;right:0;bottom:0;display:flex;align-items:flex-end;gap:0}}
.step{{background:{theme['deco']};opacity:0.08;width:60px}}
.st1{{height:100px}}.st2{{height:180px}}.st3{{height:260px}}.st4{{height:340px}}.st5{{height:420px}}.st6{{height:500px}}
.cat{{display:inline-flex;align-items:center;gap:10px;margin-bottom:24px;position:relative;z-index:2}}
.cat-sq{{width:14px;height:14px;background:{theme['deco']};border-radius:3px}}
.cat-text{{font-size:13px;font-weight:700;color:{theme['badge_text']};letter-spacing:1.5px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:580px;position:relative;z-index:2}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:480px;position:relative;z-index:2}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']};z-index:3}}
</style></head><body><div class="wrap">
<div class="steps"><div class="step st1"></div><div class="step st2"></div><div class="step st3"></div><div class="step st4"></div><div class="step st5"></div><div class="step st6"></div></div>
<div class="cat"><div class="cat-sq"></div><div class="cat-text">{_escape_html(category)}</div></div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="bl"></div>
</div></body></html>"""


def _layout_cross_lines(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;overflow:hidden}}
.hline,.vline{{position:absolute;background:{theme['deco']};opacity:0.06}}
.hline{{width:100%;height:1px;left:0}}
.h1{{top:100px}}.h2{{top:220px}}.h3{{top:340px}}.h4{{top:440px}}
.vline{{height:100%;width:1px;top:0}}
.v1{{left:200px}}.v2{{left:400px}}.v3{{left:650px}}.v4{{left:850px}}
.content{{position:relative;z-index:2}}
.cat{{display:inline-block;background:{theme['bg']};padding:6px 18px;border-radius:6px;font-size:13px;font-weight:600;color:{theme['badge_text']};margin-bottom:26px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:600px}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:500px}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']};z-index:3}}
</style></head><body><div class="wrap">
<div class="hline h1"></div><div class="hline h2"></div><div class="hline h3"></div><div class="hline h4"></div>
<div class="vline v1"></div><div class="vline v2"></div><div class="vline v3"></div><div class="vline v4"></div>
<div class="content">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="bl"></div>
</div></body></html>"""


def _layout_blob(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;overflow:hidden}}
.blob{{position:absolute;opacity:0.12}}
.b1{{right:-60px;top:-40px;width:350px;height:350px;background:{theme['deco']};border-radius:60% 40% 55% 45%/55% 60% 40% 45%}}
.b2{{left:-80px;bottom:-60px;width:280px;height:280px;background:{theme['deco']};border-radius:45% 55% 40% 60%/60% 45% 55% 40%}}
.content{{position:relative;z-index:2}}
.cat{{display:inline-block;padding:7px 20px;background:{theme['deco']};color:#fff;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:26px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:600px}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:500px}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']};z-index:3}}
</style></head><body><div class="wrap">
<div class="blob b1"></div><div class="blob b2"></div>
<div class="content">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
<div class="bl"></div>
</div></body></html>"""


def _layout_gradient_text_bg(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:{theme['bg']};position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;overflow:hidden}}
.bg-strip{{position:absolute;top:0;left:0;right:0;height:200px;background:linear-gradient(180deg,rgba(255,255,255,0.5) 0%,transparent 100%)}}
.cat{{font-size:13px;font-weight:600;color:{theme['badge_text']};letter-spacing:2px;margin-bottom:28px;position:relative;z-index:2}}
.t{{font-size:44px;font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:640px;position:relative;z-index:2}}
.t-shadow{{position:absolute;font-size:44px;font-weight:900;color:{theme['deco']};opacity:0.06;line-height:1.35;word-break:keep-all;max-width:640px;transform:translate(4px,4px);z-index:1}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:500px;position:relative;z-index:2}}
.pill{{position:absolute;right:60px;bottom:50px;display:flex;gap:8px;z-index:2}}
.pill div{{width:40px;height:6px;border-radius:3px;background:{theme['deco']};opacity:0.2}}
.pill div:first-child{{opacity:0.5;width:60px}}
</style></head><body><div class="wrap">
<div class="bg-strip"></div>
<div class="cat">{_escape_html(category)}</div>
<div class="t-shadow">{title_html}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="pill"><div></div><div></div><div></div></div>
</div></body></html>"""


def _layout_photo_frame(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;position:relative}}
.frame{{width:880px;height:470px;background:#fff;border-radius:4px;box-shadow:0 4px 20px rgba(0,0,0,0.1);display:flex;overflow:hidden}}
.left-panel{{width:320px;height:100%;background:{theme['bg']};display:flex;align-items:center;justify-content:center;position:relative}}
.left-icon{{width:120px;height:120px;border-radius:24px;background:rgba(255,255,255,0.4);display:flex;align-items:center;justify-content:center}}
.left-icon-inner{{width:60px;height:60px;border-radius:50%;background:{theme['deco']};opacity:0.3}}
.right-panel{{flex:1;display:flex;flex-direction:column;justify-content:center;padding:40px 45px}}
.cat{{font-size:12px;font-weight:700;color:{theme['badge_text']};letter-spacing:2px;margin-bottom:20px}}
.t{{font-size:36px;font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:16px;word-break:keep-all}}
.s{{font-size:16px;color:{theme['subtitle']};line-height:1.6}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:4px;background:{theme['bottom']}}}
</style></head><body><div class="wrap"><div class="frame">
<div class="left-panel"><div class="left-icon"><div class="left-icon-inner"></div></div></div>
<div class="right-panel">
<div class="cat">{_escape_html(category)}</div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
<div class="bl"></div>
</div>
</div></div></body></html>"""


def _layout_hexagon(title_html, subtitle_html, category, theme, title_size):
    return f"""<!DOCTYPE html><html><head>{_common_head()}
<style>
.wrap{{width:960px;height:540px;background:#fff;position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;overflow:hidden}}
.hex-wrap{{position:absolute;right:20px;top:50%;transform:translateY(-50%)}}
.hex{{position:absolute;opacity:0.08}}
.hex svg{{fill:{theme['deco']}}}
.hx1{{right:20px;top:-60px}}.hx2{{right:100px;top:30px}}.hx3{{right:30px;top:120px}}.hx4{{right:110px;top:200px}}
.content{{position:relative;z-index:2}}
.cat{{display:inline-flex;align-items:center;gap:8px;margin-bottom:26px}}
.cat-hex{{width:20px;height:20px}}
.cat-hex svg{{fill:{theme['deco']}}}
.cat-text{{font-size:13px;font-weight:700;color:{theme['badge_text']};letter-spacing:1.5px}}
.t{{font-size:{title_size};font-weight:900;color:{theme['title']};line-height:1.35;margin-bottom:18px;word-break:keep-all;max-width:600px}}
.s{{font-size:17px;color:{theme['subtitle']};line-height:1.6;max-width:500px}}
.bl{{position:absolute;bottom:0;left:0;right:0;height:5px;background:{theme['bottom']};z-index:3}}
</style></head><body><div class="wrap">
<div class="hex hx1"><svg width="80" height="90" viewBox="0 0 80 90"><polygon points="40,0 80,22 80,68 40,90 0,68 0,22"/></svg></div>
<div class="hex hx2"><svg width="60" height="68" viewBox="0 0 60 68"><polygon points="30,0 60,17 60,51 30,68 0,51 0,17"/></svg></div>
<div class="hex hx3"><svg width="100" height="114" viewBox="0 0 100 114"><polygon points="50,0 100,28 100,86 50,114 0,86 0,28"/></svg></div>
<div class="hex hx4"><svg width="50" height="57" viewBox="0 0 50 57"><polygon points="25,0 50,14 50,43 25,57 0,43 0,14"/></svg></div>
<div class="content">
<div class="cat"><div class="cat-hex"><svg viewBox="0 0 20 23"><polygon points="10,0 20,6 20,17 10,23 0,17 0,6"/></svg></div><div class="cat-text">{_escape_html(category)}</div></div>
<div class="t">{title_html}</div>
{"<div class='s'>" + subtitle_html + "</div>" if subtitle_html else ""}
</div>
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

    layout = random.randint(0, NUM_LAYOUTS - 1)
    html = _build_html(display_title, subtitle, category, theme, layout)
    logger.info(f"배너 레이아웃: {layout}, 테마: {THEMES.index(theme)}")

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
