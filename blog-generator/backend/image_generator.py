"""
키워드 대표이미지 생성기
- Pillow를 사용하여 키워드 텍스트가 포함된 블로그 대표이미지를 생성
- 네이버 블로그 최적 사이즈: 960x540
"""

import os
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

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


def _hex_to_rgb(hex_color: str) -> tuple:
    """HEX 색상을 RGB 튜플로 변환"""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


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

    # 하단 서브텍스트
    sub_font = _find_font(18)
    sub_text = "DAILY FNI BLOG"
    sub_bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
    sub_width = sub_bbox[2] - sub_bbox[0]
    draw.text(
        ((width - sub_width) // 2, height - margin - 30),
        sub_text,
        fill=accent_color,
        font=sub_font,
    )

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
