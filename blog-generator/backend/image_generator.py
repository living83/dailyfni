"""
키워드 대표이미지 생성기
- Pillow를 사용하여 키워드 텍스트가 포함된 블로그 대표이미지를 생성
- 광고 대문이미지(배너) 생성 지원
- 네이버 블로그 최적 사이즈: 960x540
"""

import os
import re
import hashlib
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# 이미지 저장 디렉토리
IMAGE_DIR = Path(__file__).resolve().parent.parent / "data" / "images"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

# 색상 테마 (배경색, 텍스트색, 악센트색)
COLOR_THEMES = [
    {"bg": "#1a1a2e", "text": "#ffffff", "accent": "#e94560"},
    {"bg": "#0f3460", "text": "#ffffff", "accent": "#e94560"},
    {"bg": "#533483", "text": "#ffffff", "accent": "#e94560"},
    {"bg": "#2b2d42", "text": "#edf2f4", "accent": "#ef233c"},
    {"bg": "#264653", "text": "#ffffff", "accent": "#e9c46a"},
    {"bg": "#2d6a4f", "text": "#ffffff", "accent": "#95d5b2"},
    {"bg": "#003049", "text": "#ffffff", "accent": "#f77f00"},
    {"bg": "#3d405b", "text": "#f4f1de", "accent": "#e07a5f"},
]

# 광고 대문이미지 색상 테마 (네이비/블루 배경 + 옐로우/네온그린 강조)
AD_BANNER_THEMES = [
    # 네이비 + 옐로우 (클래식 고급)
    {"bg": "#0D1B2A", "title": "#FFD700", "subtitle": "#FFFFFF", "accent": "#FFD700", "badge_bg": "#FFD700", "badge_text": "#0D1B2A", "name": "navy_gold"},
    # 딥블루 + 네온그린 (모던 강렬)
    {"bg": "#0A1628", "title": "#39FF14", "subtitle": "#E0E0E0", "accent": "#39FF14", "badge_bg": "#39FF14", "badge_text": "#0A1628", "name": "blue_neon"},
    # 로열블루 + 화이트/옐로우 (신뢰감)
    {"bg": "#1B2A4A", "title": "#FFFFFF", "subtitle": "#FFD700", "accent": "#FFD700", "badge_bg": "#FFD700", "badge_text": "#1B2A4A", "name": "royal_white"},
    # 미드나잇 + 시안 (테크/IT 느낌)
    {"bg": "#0F172A", "title": "#00E5FF", "subtitle": "#FFFFFF", "accent": "#00E5FF", "badge_bg": "#00E5FF", "badge_text": "#0F172A", "name": "midnight_cyan"},
    # 다크네이비 + 오렌지옐로우 (에너지)
    {"bg": "#0C1527", "title": "#FFAB00", "subtitle": "#FFFFFF", "accent": "#FFAB00", "badge_bg": "#FFAB00", "badge_text": "#0C1527", "name": "navy_amber"},
    # 네이비 그라데이션 + 라임 (생동감)
    {"bg": "#102040", "title": "#C6FF00", "subtitle": "#FFFFFF", "accent": "#C6FF00", "badge_bg": "#C6FF00", "badge_text": "#102040", "name": "navy_lime"},
]

# 광고 대문이미지 템플릿 타입
AD_TEMPLATE_TYPES = [
    "product_highlight",   # 상품 강조형 (큰 제목 + 배지 + 서브텍스트)
    "ranking_style",       # 랭킹형 (TOP 5, BEST 10 등)
    "comparison",          # 비교형 (VS, 비교 분석)
    "review_summary",      # 리뷰 요약형 (별점 + 한줄평)
    "info_card",           # 정보 카드형 (깔끔한 정보 전달)
]


def _hex_to_rgb(hex_color: str) -> tuple:
    """HEX 색상을 RGB 튜플로 변환"""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def _find_ad_font(style: str, size: int):
    """
    광고 대문이미지용 폰트를 스타일별로 반환

    Args:
        style: "gothic" (고딕/정보전달), "bold" (두꺼운 강조체), "brush" (붓글씨/캘리그래피)
        size: 폰트 크기
    """
    font_map = {
        "gothic": [
            "/usr/share/fonts/truetype/nanum/NanumSquareEB.ttf",
            "/usr/share/fonts/truetype/nanum/NanumSquareB.ttf",
            "/usr/share/fonts/truetype/nanum/NanumGothicExtraBold.ttf",
            "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        ],
        "bold": [
            "/usr/share/fonts/truetype/nanum/NanumSquareEB.ttf",
            "/usr/share/fonts/truetype/nanum/NanumGothicExtraBold.ttf",
            "/usr/share/fonts/truetype/nanum/NanumSquareB.ttf",
            "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        ],
        "brush": [
            "/usr/share/fonts/truetype/nanum/NanumBrush.ttf",
            "/usr/share/fonts/truetype/nanum/NanumPen.ttf",
            "/usr/share/fonts/truetype/nanum/NanumSquareEB.ttf",
        ],
    }
    paths = font_map.get(style, font_map["gothic"])
    for path in paths:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return _find_font(size)


def _draw_rounded_rect(draw: ImageDraw.Draw, xy, radius: int, fill=None, outline=None, width=1):
    """둥근 모서리 사각형 그리기"""
    x1, y1 = xy[0]
    x2, y2 = xy[1]
    r = min(radius, (x2 - x1) // 2, (y2 - y1) // 2)
    draw.rounded_rectangle([x1, y1, x2, y2], radius=r, fill=fill, outline=outline, width=width)


def _draw_glow_text(draw: ImageDraw.Draw, position, text, font, fill, glow_color=None, glow_radius=2):
    """발광 효과가 있는 텍스트 그리기 (가시성 향상)"""
    x, y = position
    if glow_color:
        for dx in range(-glow_radius, glow_radius + 1):
            for dy in range(-glow_radius, glow_radius + 1):
                if dx * dx + dy * dy <= glow_radius * glow_radius:
                    draw.text((x + dx, y + dy), text, fill=glow_color, font=font)
    draw.text((x, y), text, fill=fill, font=font)


def _draw_diagonal_stripes(draw: ImageDraw.Draw, width: int, height: int, color, stripe_width=3, gap=30):
    """대각선 스트라이프 패턴 (배경 장식)"""
    for offset in range(-height, width + height, gap):
        draw.line(
            [(offset, 0), (offset - height, height)],
            fill=color, width=stripe_width
        )


def _get_theme(keyword: str) -> dict:
    """키워드 기반으로 일관된 색상 테마 선택"""
    idx = int(hashlib.md5(keyword.encode()).hexdigest(), 16) % len(COLOR_THEMES)
    return COLOR_THEMES[idx]


def _find_font(size: int):
    """시스템에서 사용 가능한 한글 폰트를 찾아 반환"""
    font_paths = [
        # Linux 한글 폰트
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
        # macOS 한글 폰트
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/Library/Fonts/NanumGothicBold.ttf",
        # Windows 한글 폰트
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/malgun.ttf",
    ]
    for path in font_paths:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    # 기본 폰트 폴백
    return ImageFont.load_default()


def _wrap_text(text: str, font, max_width: int, draw: ImageDraw.Draw) -> list:
    """텍스트를 지정 너비에 맞게 줄바꿈"""
    words = list(text)
    lines = []
    current_line = ""

    for char in words:
        test_line = current_line + char
        bbox = draw.textbbox((0, 0), test_line, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current_line = test_line
        else:
            if current_line:
                lines.append(current_line)
            current_line = char

    if current_line:
        lines.append(current_line)

    return lines


def generate_keyword_image(keyword: str, variant: int = 0, width: int = 960, height: int = 540) -> str:
    """
    키워드 텍스트가 포함된 대표이미지를 생성합니다.

    Args:
        keyword: 블로그 키워드
        variant: 색상 변형 번호 (0, 1, 2). 같은 키워드도 variant가 다르면 다른 색상 테마 적용
        width: 이미지 너비 (기본 960px)
        height: 이미지 높이 (기본 540px)

    Returns:
        생성된 이미지 파일 경로 (절대 경로)
    """
    # 제목에서 불필요한 접두사 제거 (재발행:, 재시도: 등)
    import re
    keyword = re.sub(r'^(재발행|재시도|retry)\s*[:：]\s*', '', keyword).strip()

    # variant별로 다른 색상 테마 선택 (동일 키워드라도 variant가 다르면 다른 색상)
    base_idx = int(hashlib.md5(keyword.encode()).hexdigest(), 16)
    theme_idx = (base_idx + variant) % len(COLOR_THEMES)
    theme = COLOR_THEMES[theme_idx]

    bg_color = _hex_to_rgb(theme["bg"])
    text_color = _hex_to_rgb(theme["text"])
    accent_color = _hex_to_rgb(theme["accent"])

    # 이미지 생성
    img = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # 장식 요소: 상단/하단 악센트 라인
    draw.rectangle([(0, 0), (width, 6)], fill=accent_color)
    draw.rectangle([(0, height - 6), (width, height)], fill=accent_color)

    # 중앙 장식 프레임
    margin = 60
    frame_rect = [(margin, margin), (width - margin, height - margin)]
    draw.rectangle(frame_rect, outline=accent_color, width=2)

    # 키워드 텍스트 (메인)
    font_size = 56
    font = _find_font(font_size)
    max_text_width = width - margin * 2 - 80

    lines = _wrap_text(keyword, font, max_text_width, draw)

    # 폰트 크기가 너무 크면 줄이기
    while len(lines) > 3 and font_size > 28:
        font_size -= 4
        font = _find_font(font_size)
        lines = _wrap_text(keyword, font, max_text_width, draw)

    # 텍스트 전체 높이 계산
    line_height = font_size + 12
    total_text_height = len(lines) * line_height

    # 중앙 정렬 Y 시작 위치
    start_y = (height - total_text_height) // 2

    # 텍스트 그리기
    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        text_width = bbox[2] - bbox[0]
        x = (width - text_width) // 2
        y = start_y + i * line_height
        draw.text((x, y), line, fill=text_color, font=font)

    # 파일 저장 (variant별로 다른 파일명)
    safe_name = hashlib.md5(keyword.encode()).hexdigest()[:12]
    suffix = f"_v{variant}" if variant > 0 else ""
    filename = f"keyword_{safe_name}{suffix}.png"
    filepath = IMAGE_DIR / filename
    img.save(str(filepath), "PNG", quality=95)

    return str(filepath)


def generate_keyword_image_variants(keyword: str, count: int = 3, width: int = 960, height: int = 540) -> list:
    """
    같은 키워드로 색상이 다른 대표이미지 여러 장을 생성합니다.
    저품질 방지를 위해 계정별로 다른 이미지를 사용할 수 있습니다.

    Args:
        keyword: 블로그 키워드
        count: 생성할 이미지 수 (기본 3)
        width: 이미지 너비
        height: 이미지 높이

    Returns:
        생성된 이미지 파일 경로 리스트
    """
    return [generate_keyword_image(keyword, variant=i, width=width, height=height) for i in range(count)]


# ─────────────────────────────────────────────
# 광고 대문이미지 (Ad Banner) 생성
# ─────────────────────────────────────────────

def generate_ad_banner(
    title: str,
    subtitle: str = "",
    badge_text: str = "",
    template: str = "product_highlight",
    theme_index: int = -1,
    variant: int = 0,
    width: int = 960,
    height: int = 540,
) -> str:
    """
    네이버 블로그 광고 대문이미지를 생성합니다.

    디자인 특징:
    - 고딕체(NanumSquare ExtraBold) 중심의 정보 전달
    - 강렬한 캘리그래피(NanumBrush) 또는 두꺼운 강조체 혼용
    - 네이비/블루 배경 + 옐로우/네온그린 강조색

    Args:
        title: 메인 제목 (예: "2026 공기청정기 추천 TOP 5")
        subtitle: 서브 제목 (예: "가성비부터 프리미엄까지 완벽 비교")
        badge_text: 배지 텍스트 (예: "추천", "BEST", "비교분석", "후기")
        template: 템플릿 타입 (product_highlight, ranking_style, comparison, review_summary, info_card)
        theme_index: 색상 테마 인덱스 (-1이면 title 기반 자동 선택)
        variant: 변형 번호 (같은 설정이라도 다른 디자인)
        width: 이미지 너비 (기본 960px)
        height: 이미지 높이 (기본 540px)

    Returns:
        생성된 이미지 파일 경로 (절대 경로)
    """
    title = re.sub(r'^(재발행|재시도|retry)\s*[:：]\s*', '', title).strip()

    # 테마 선택
    if theme_index < 0:
        base_idx = int(hashlib.md5(title.encode()).hexdigest(), 16)
        theme_index = (base_idx + variant) % len(AD_BANNER_THEMES)
    theme = AD_BANNER_THEMES[theme_index % len(AD_BANNER_THEMES)]

    bg_color = _hex_to_rgb(theme["bg"])
    title_color = _hex_to_rgb(theme["title"])
    subtitle_color = _hex_to_rgb(theme["subtitle"])
    accent_color = _hex_to_rgb(theme["accent"])
    badge_bg = _hex_to_rgb(theme["badge_bg"])
    badge_text_color = _hex_to_rgb(theme["badge_text"])

    # 반투명 악센트 (배경 장식용)
    accent_dim = tuple(max(0, c - 180) for c in accent_color)

    img = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # 템플릿별 렌더링
    renderer = _AD_TEMPLATE_RENDERERS.get(template, _render_product_highlight)
    renderer(
        draw=draw,
        img=img,
        width=width,
        height=height,
        title=title,
        subtitle=subtitle,
        badge_text=badge_text,
        title_color=title_color,
        subtitle_color=subtitle_color,
        accent_color=accent_color,
        accent_dim=accent_dim,
        badge_bg=badge_bg,
        badge_text_color=badge_text_color,
        bg_color=bg_color,
        variant=variant,
    )

    # 파일 저장
    safe_name = hashlib.md5(f"ad_{title}_{template}".encode()).hexdigest()[:12]
    suffix = f"_v{variant}" if variant > 0 else ""
    filename = f"ad_banner_{safe_name}{suffix}.png"
    filepath = IMAGE_DIR / filename
    img.save(str(filepath), "PNG", quality=95)

    return str(filepath)


def _render_product_highlight(draw, img, width, height, title, subtitle, badge_text, title_color, subtitle_color, accent_color, accent_dim, badge_bg, badge_text_color, bg_color, variant, **kw):
    """상품 강조형 템플릿: 큰 제목 + 배지 + 서브텍스트"""

    # 배경 대각선 스트라이프 패턴
    _draw_diagonal_stripes(draw, width, height, accent_dim, stripe_width=1, gap=40)

    # 상단 악센트 바
    draw.rectangle([(0, 0), (width, 8)], fill=accent_color)
    # 하단 악센트 바
    draw.rectangle([(0, height - 8), (width, height)], fill=accent_color)

    # 좌측 세로 악센트 라인
    draw.rectangle([(0, 0), (6, height)], fill=accent_color)

    y_cursor = 80

    # 배지 (있으면)
    if badge_text:
        badge_font = _find_ad_font("gothic", 24)
        badge_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
        bw = badge_bbox[2] - badge_bbox[0] + 36
        bh = badge_bbox[3] - badge_bbox[1] + 20
        bx = (width - bw) // 2
        _draw_rounded_rect(draw, [(bx, y_cursor), (bx + bw, y_cursor + bh)], radius=6, fill=badge_bg)
        draw.text(
            (bx + 18, y_cursor + 7),
            badge_text, fill=badge_text_color, font=badge_font
        )
        y_cursor += bh + 30

    # 메인 제목 (고딕 ExtraBold)
    title_font_size = 52
    title_font = _find_ad_font("bold", title_font_size)
    max_text_width = width - 120
    title_lines = _wrap_text(title, title_font, max_text_width, draw)

    while len(title_lines) > 3 and title_font_size > 30:
        title_font_size -= 4
        title_font = _find_ad_font("bold", title_font_size)
        title_lines = _wrap_text(title, title_font, max_text_width, draw)

    line_height = title_font_size + 16
    total_title_h = len(title_lines) * line_height

    # 제목 영역이 이미지 중앙에 오도록 조정
    if not subtitle:
        y_cursor = (height - total_title_h) // 2 - 10

    for i, line in enumerate(title_lines):
        bbox = draw.textbbox((0, 0), line, font=title_font)
        tw = bbox[2] - bbox[0]
        x = (width - tw) // 2
        y = y_cursor + i * line_height
        _draw_glow_text(draw, (x, y), line, title_font, fill=title_color, glow_color=accent_dim, glow_radius=3)

    y_cursor += total_title_h + 20

    # 서브 제목 (고딕 보통)
    if subtitle:
        sub_font = _find_ad_font("gothic", 26)
        sub_lines = _wrap_text(subtitle, sub_font, max_text_width, draw)
        for i, line in enumerate(sub_lines):
            bbox = draw.textbbox((0, 0), line, font=sub_font)
            sw = bbox[2] - bbox[0]
            x = (width - sw) // 2
            draw.text((x, y_cursor + i * 38), line, fill=subtitle_color, font=sub_font)
        y_cursor += len(sub_lines) * 38 + 20

    # 하단 구분선
    line_y = height - 60
    line_margin = 100
    draw.line([(line_margin, line_y), (width - line_margin, line_y)], fill=accent_color, width=1)


def _render_ranking_style(draw, img, width, height, title, subtitle, badge_text, title_color, subtitle_color, accent_color, accent_dim, badge_bg, badge_text_color, bg_color, variant, **kw):
    """랭킹형 템플릿: TOP N, BEST N 강조"""

    # 배경 장식 - 큰 숫자 워터마크
    rank_match = re.search(r'(\d+)', title)
    rank_num = rank_match.group(1) if rank_match else "5"

    watermark_font = _find_ad_font("bold", 280)
    wm_bbox = draw.textbbox((0, 0), rank_num, font=watermark_font)
    wm_w = wm_bbox[2] - wm_bbox[0]
    wm_h = wm_bbox[3] - wm_bbox[1]
    draw.text(
        (width - wm_w - 30, (height - wm_h) // 2 - 40),
        rank_num, fill=accent_dim, font=watermark_font
    )

    # 상단 풀폭 악센트
    draw.rectangle([(0, 0), (width, 10)], fill=accent_color)

    y_cursor = 60

    # 배지 (예: "TOP", "BEST")
    if badge_text:
        badge_font = _find_ad_font("bold", 36)
        badge_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
        bw = badge_bbox[2] - badge_bbox[0] + 48
        bh = badge_bbox[3] - badge_bbox[1] + 24
        bx = 60
        _draw_rounded_rect(draw, [(bx, y_cursor), (bx + bw, y_cursor + bh)], radius=8, fill=badge_bg)
        draw.text((bx + 24, y_cursor + 8), badge_text, fill=badge_text_color, font=badge_font)
        y_cursor += bh + 25

    # 메인 제목 (왼쪽 정렬, 붓글씨)
    title_font_size = 54
    title_font = _find_ad_font("brush", title_font_size)
    max_text_width = width - 160
    title_lines = _wrap_text(title, title_font, max_text_width, draw)

    while len(title_lines) > 3 and title_font_size > 32:
        title_font_size -= 4
        title_font = _find_ad_font("brush", title_font_size)
        title_lines = _wrap_text(title, title_font, max_text_width, draw)

    line_height = title_font_size + 18
    for i, line in enumerate(title_lines):
        _draw_glow_text(
            draw, (70, y_cursor + i * line_height),
            line, title_font, fill=title_color, glow_color=accent_dim, glow_radius=2
        )
    y_cursor += len(title_lines) * line_height + 15

    # 서브 제목
    if subtitle:
        sub_font = _find_ad_font("gothic", 24)
        draw.text((70, y_cursor), subtitle, fill=subtitle_color, font=sub_font)

    # 하단 악센트 바
    draw.rectangle([(0, height - 10), (width, height)], fill=accent_color)

    # 하단 악센트 바만 유지


def _render_comparison(draw, img, width, height, title, subtitle, badge_text, title_color, subtitle_color, accent_color, accent_dim, badge_bg, badge_text_color, bg_color, variant, **kw):
    """비교형 템플릿: VS 스타일, 중앙 분할"""

    # 중앙 세로 분할선
    center_x = width // 2
    draw.line([(center_x, 60), (center_x, height - 60)], fill=accent_color, width=3)

    # VS 원형 배지 (중앙)
    vs_text = badge_text if badge_text else "VS"
    vs_font = _find_ad_font("bold", 32)
    vs_bbox = draw.textbbox((0, 0), vs_text, font=vs_font)
    vs_w = vs_bbox[2] - vs_bbox[0]
    vs_h = vs_bbox[3] - vs_bbox[1]
    circle_r = max(vs_w, vs_h) // 2 + 20
    circle_y = height // 2
    draw.ellipse(
        [(center_x - circle_r, circle_y - circle_r),
         (center_x + circle_r, circle_y + circle_r)],
        fill=badge_bg
    )
    draw.text(
        (center_x - vs_w // 2, circle_y - vs_h // 2 - 4),
        vs_text, fill=badge_text_color, font=vs_font
    )

    # 상단 악센트
    draw.rectangle([(0, 0), (width, 6)], fill=accent_color)
    draw.rectangle([(0, height - 6), (width, height)], fill=accent_color)

    # 메인 제목 (상단 중앙, 고딕)
    title_font = _find_ad_font("bold", 44)
    max_tw = width - 120
    title_lines = _wrap_text(title, title_font, max_tw, draw)
    if len(title_lines) > 2:
        title_font = _find_ad_font("bold", 36)
        title_lines = _wrap_text(title, title_font, max_tw, draw)

    y_start = 40
    for i, line in enumerate(title_lines):
        bbox = draw.textbbox((0, 0), line, font=title_font)
        tw = bbox[2] - bbox[0]
        draw.text(((width - tw) // 2, y_start + i * 52), line, fill=title_color, font=title_font)

    # 서브 제목 (하단)
    if subtitle:
        sub_font = _find_ad_font("gothic", 22)
        sub_bbox = draw.textbbox((0, 0), subtitle, font=sub_font)
        sw = sub_bbox[2] - sub_bbox[0]
        draw.text(((width - sw) // 2, height - 55), subtitle, fill=subtitle_color, font=sub_font)

    # 좌우에 장식 사각형
    deco_size = 60
    # 좌측
    _draw_rounded_rect(draw, [(30, height // 2 - deco_size), (30 + deco_size, height // 2 + deco_size)], radius=10, outline=accent_color, width=2)
    # 우측
    _draw_rounded_rect(draw, [(width - 30 - deco_size, height // 2 - deco_size), (width - 30, height // 2 + deco_size)], radius=10, outline=accent_color, width=2)


def _render_review_summary(draw, img, width, height, title, subtitle, badge_text, title_color, subtitle_color, accent_color, accent_dim, badge_bg, badge_text_color, bg_color, variant, **kw):
    """리뷰 요약형 템플릿: 별점 아이콘 + 한줄 리뷰"""

    # 배경 하단 그라데이션 효과
    for y in range(height // 2, height):
        alpha = (y - height // 2) / (height // 2)
        overlay_color = tuple(int(bg_color[i] * (1 - alpha * 0.3)) for i in range(3))
        draw.line([(0, y), (width, y)], fill=overlay_color)

    # 상단 악센트
    draw.rectangle([(0, 0), (width, 5)], fill=accent_color)

    y_cursor = 55

    # 배지
    if badge_text:
        badge_font = _find_ad_font("gothic", 20)
        badge_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
        bw = badge_bbox[2] - badge_bbox[0] + 30
        bh = badge_bbox[3] - badge_bbox[1] + 16
        bx = (width - bw) // 2
        _draw_rounded_rect(draw, [(bx, y_cursor), (bx + bw, y_cursor + bh)], radius=4, fill=badge_bg)
        draw.text((bx + 15, y_cursor + 5), badge_text, fill=badge_text_color, font=badge_font)
        y_cursor += bh + 25

    # 별점 표시 (★★★★★)
    star_font = _find_ad_font("gothic", 40)
    stars = "★★★★★"
    star_bbox = draw.textbbox((0, 0), stars, font=star_font)
    star_w = star_bbox[2] - star_bbox[0]
    draw.text(((width - star_w) // 2, y_cursor), stars, fill=accent_color, font=star_font)
    y_cursor += 60

    # 메인 제목 (붓글씨 캘리그래피)
    title_font_size = 48
    title_font = _find_ad_font("brush", title_font_size)
    max_tw = width - 140
    title_lines = _wrap_text(title, title_font, max_tw, draw)

    while len(title_lines) > 3 and title_font_size > 30:
        title_font_size -= 4
        title_font = _find_ad_font("brush", title_font_size)
        title_lines = _wrap_text(title, title_font, max_tw, draw)

    line_height = title_font_size + 16
    for i, line in enumerate(title_lines):
        bbox = draw.textbbox((0, 0), line, font=title_font)
        tw = bbox[2] - bbox[0]
        x = (width - tw) // 2
        _draw_glow_text(draw, (x, y_cursor + i * line_height), line, title_font, fill=title_color, glow_color=accent_dim, glow_radius=2)
    y_cursor += len(title_lines) * line_height + 15

    # 서브 제목
    if subtitle:
        sub_font = _find_ad_font("gothic", 24)
        sub_lines = _wrap_text(subtitle, sub_font, max_tw, draw)
        for i, line in enumerate(sub_lines):
            bbox = draw.textbbox((0, 0), line, font=sub_font)
            sw = bbox[2] - bbox[0]
            draw.text(((width - sw) // 2, y_cursor + i * 36), line, fill=subtitle_color, font=sub_font)

    # 하단 악센트
    draw.rectangle([(0, height - 5), (width, height)], fill=accent_color)


def _render_info_card(draw, img, width, height, title, subtitle, badge_text, title_color, subtitle_color, accent_color, accent_dim, badge_bg, badge_text_color, bg_color, variant, **kw):
    """정보 카드형 템플릿: 깔끔한 카드 스타일 정보 전달"""

    # 카드 프레임
    margin = 40
    card_margin = 25
    _draw_rounded_rect(
        draw,
        [(margin, margin), (width - margin, height - margin)],
        radius=16, outline=accent_color, width=3
    )

    # 내부 얇은 프레임
    inner_m = margin + 12
    _draw_rounded_rect(
        draw,
        [(inner_m, inner_m), (width - inner_m, height - inner_m)],
        radius=12, outline=accent_dim, width=1
    )

    y_cursor = margin + 50

    # 배지 (좌상단)
    if badge_text:
        badge_font = _find_ad_font("gothic", 18)
        badge_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
        bw = badge_bbox[2] - badge_bbox[0] + 24
        bh = badge_bbox[3] - badge_bbox[1] + 14
        bx = margin + card_margin
        _draw_rounded_rect(draw, [(bx, y_cursor), (bx + bw, y_cursor + bh)], radius=4, fill=badge_bg)
        draw.text((bx + 12, y_cursor + 4), badge_text, fill=badge_text_color, font=badge_font)
        y_cursor += bh + 30

    # 메인 제목 (고딕 중앙 정렬)
    title_font_size = 46
    title_font = _find_ad_font("gothic", title_font_size)
    max_tw = width - (margin + card_margin) * 2
    title_lines = _wrap_text(title, title_font, max_tw, draw)

    while len(title_lines) > 3 and title_font_size > 28:
        title_font_size -= 4
        title_font = _find_ad_font("gothic", title_font_size)
        title_lines = _wrap_text(title, title_font, max_tw, draw)

    line_height = title_font_size + 14
    total_h = len(title_lines) * line_height
    # 제목이 카드 중앙에 오도록
    if not badge_text:
        y_cursor = (height - total_h) // 2 - 20

    for i, line in enumerate(title_lines):
        bbox = draw.textbbox((0, 0), line, font=title_font)
        tw = bbox[2] - bbox[0]
        x = (width - tw) // 2
        draw.text((x, y_cursor + i * line_height), line, fill=title_color, font=title_font)
    y_cursor += total_h + 20

    # 구분선
    sep_w = min(300, max_tw)
    sep_x = (width - sep_w) // 2
    draw.line([(sep_x, y_cursor), (sep_x + sep_w, y_cursor)], fill=accent_color, width=2)
    y_cursor += 20

    # 서브 제목
    if subtitle:
        sub_font = _find_ad_font("gothic", 22)
        sub_lines = _wrap_text(subtitle, sub_font, max_tw, draw)
        for i, line in enumerate(sub_lines):
            bbox = draw.textbbox((0, 0), line, font=sub_font)
            sw = bbox[2] - bbox[0]
            draw.text(((width - sw) // 2, y_cursor + i * 34), line, fill=subtitle_color, font=sub_font)



# 템플릿 렌더러 매핑
_AD_TEMPLATE_RENDERERS = {
    "product_highlight": _render_product_highlight,
    "ranking_style": _render_ranking_style,
    "comparison": _render_comparison,
    "review_summary": _render_review_summary,
    "info_card": _render_info_card,
}


def generate_ad_banner_variants(
    title: str,
    subtitle: str = "",
    badge_text: str = "",
    template: str = "product_highlight",
    count: int = 3,
    width: int = 960,
    height: int = 540,
) -> list:
    """
    같은 설정으로 색상 테마가 다른 광고 대문이미지를 여러 장 생성합니다.

    Args:
        title: 메인 제목
        subtitle: 서브 제목
        badge_text: 배지 텍스트
        template: 템플릿 타입
        count: 생성할 이미지 수 (기본 3)
        width: 이미지 너비
        height: 이미지 높이

    Returns:
        생성된 이미지 파일 경로 리스트
    """
    return [
        generate_ad_banner(title, subtitle, badge_text, template, variant=i, width=width, height=height)
        for i in range(count)
    ]


def generate_ad_banner_all_templates(
    title: str,
    subtitle: str = "",
    badge_text: str = "",
    width: int = 960,
    height: int = 540,
) -> dict:
    """
    모든 템플릿 타입으로 광고 대문이미지를 생성합니다.

    Returns:
        {template_name: file_path} 딕셔너리
    """
    results = {}
    for tpl in AD_TEMPLATE_TYPES:
        results[tpl] = generate_ad_banner(title, subtitle, badge_text, template=tpl, width=width, height=height)
    return results
