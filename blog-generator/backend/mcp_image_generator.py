"""
MCP(UI-Friend) 기반 일반 포스팅 대표이미지 생성기

UI-Friend-MCP 서버(Puppeteer)를 이용하여 HTML 템플릿 기반 고품질 대표이미지를 생성한다.
MCP 서버 미가동 시 Pillow 기반 image_generator로 자동 폴백.
"""

import os
import hashlib
import logging
import urllib.request
import json
from pathlib import Path

logger = logging.getLogger("mcp_image_generator")

# MCP 서버 URL
MCP_BASE_URL = os.getenv("UI_FRIEND_URL", "http://localhost:3100")

# 이미지 저장 디렉토리
IMAGE_DIR = Path(__file__).resolve().parent.parent / "data" / "images"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

# 일반 포스팅용 템플릿 목록 (3종)
GENERAL_TEMPLATES = [
    "naver_general_cover",      # 모던 다크 커버
    "naver_general_magazine",   # 매거진/에디토리얼 스타일
    "naver_general_minimal",    # 미니멀 좌우 분할
]

# 템플릿별 테마 순환 목록
TEMPLATE_THEMES = {
    "naver_general_cover": ["ocean", "warm", "forest", "sunset", "slate", "berry"],
    "naver_general_magazine": ["cream", "mint", "lavender", "sky", "peach", "sage"],
    "naver_general_minimal": ["mono", "dark", "navy", "charcoal", "ivory", "stone"],
}


def _pick_template_and_theme(keyword: str, variant: int):
    """키워드 해시 + variant로 템플릿과 테마를 결정한다."""
    base_idx = int(hashlib.md5(keyword.encode()).hexdigest(), 16)

    template_idx = (base_idx + variant) % len(GENERAL_TEMPLATES)
    template = GENERAL_TEMPLATES[template_idx]

    themes = TEMPLATE_THEMES[template]
    theme_idx = (base_idx + variant) % len(themes)
    theme = themes[theme_idx]

    return template, theme


def _call_mcp_render(template: str, data: dict, output_path: str, timeout: int = 20) -> dict:
    """MCP 서버의 /render_template 엔드포인트를 호출한다."""
    url = f"{MCP_BASE_URL}/render_template"
    payload = json.dumps({
        "template": template,
        "data": data,
        "width": 960,
        "height": 540,
        "outputPath": output_path,
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _is_mcp_available() -> bool:
    """MCP 서버 헬스체크."""
    try:
        url = f"{MCP_BASE_URL}/health"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result.get("status") == "ok"
    except Exception:
        return False


def generate_general_cover(
    keyword: str,
    variant: int = 0,
    subtitle: str = "",
    category: str = "",
) -> str:
    """
    일반 포스팅용 대표이미지를 MCP 서버로 생성한다.
    MCP 서버 미가동 시 Pillow 폴백.

    Args:
        keyword: 블로그 키워드 (제목으로 사용)
        variant: 변형 번호 (0, 1, 2 — 다른 템플릿/테마 적용)
        subtitle: 서브 제목 (선택)
        category: 카테고리 라벨 (선택)

    Returns:
        생성된 이미지 파일 경로 (절대 경로)
    """
    import re
    keyword = re.sub(r'^(재발행|재시도|retry)\s*[:：]\s*', '', keyword).strip()

    # 출력 파일명
    safe_name = hashlib.md5(keyword.encode()).hexdigest()[:12]
    suffix = f"_v{variant}" if variant > 0 else ""
    filename = f"general_{safe_name}{suffix}.png"
    output_path = str(IMAGE_DIR / filename)

    # MCP 서버 시도
    if _is_mcp_available():
        try:
            template, theme = _pick_template_and_theme(keyword, variant)
            data = {
                "title": keyword,
                "theme": theme,
            }
            if subtitle:
                data["subtitle"] = subtitle
            if category:
                data["category"] = category

            result = _call_mcp_render(template, data, output_path)
            logger.info(f"MCP 이미지 생성 완료: {template}/{theme} → {result.get('filePath')}")
            return result.get("filePath", output_path)
        except Exception as e:
            logger.warning(f"MCP 이미지 생성 실패, Pillow 폴백: {e}")

    # Pillow 폴백
    from image_generator import generate_keyword_image
    logger.info("MCP 서버 미가동 → Pillow 폴백으로 이미지 생성")
    return generate_keyword_image(keyword, variant=variant)


def generate_general_cover_variants(
    keyword: str,
    count: int = 3,
    subtitle: str = "",
    category: str = "",
) -> list:
    """
    같은 키워드로 다른 디자인의 대표이미지 여러 장을 생성한다.

    Args:
        keyword: 블로그 키워드
        count: 생성할 이미지 수 (기본 3)
        subtitle: 서브 제목 (선택)
        category: 카테고리 라벨 (선택)

    Returns:
        생성된 이미지 파일 경로 리스트
    """
    return [
        generate_general_cover(keyword, variant=i, subtitle=subtitle, category=category)
        for i in range(count)
    ]
