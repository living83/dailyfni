"""
Image generator for blog featured images.

Primary:  Gemini REST API (multi-model fallback)
Fallback: Pillow local text-banner generation
"""

import asyncio
import base64
import hashlib
import os
import re
import time
from pathlib import Path

from loguru import logger

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import settings

IMAGES_DIR = settings.IMAGES_DIR

# ---------------------------------------------------------------------------
# Color themes (Pillow fallback)
# ---------------------------------------------------------------------------

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

AD_BANNER_THEMES = [
    {"bg": "#0D1B2A", "title": "#FFD700", "subtitle": "#FFFFFF", "accent": "#FFD700", "badge_bg": "#FFD700", "badge_text": "#0D1B2A"},
    {"bg": "#0A1628", "title": "#39FF14", "subtitle": "#E0E0E0", "accent": "#39FF14", "badge_bg": "#39FF14", "badge_text": "#0A1628"},
    {"bg": "#1B2A4A", "title": "#FFFFFF", "subtitle": "#FFD700", "accent": "#FFD700", "badge_bg": "#FFD700", "badge_text": "#1B2A4A"},
    {"bg": "#0F172A", "title": "#00E5FF", "subtitle": "#FFFFFF", "accent": "#00E5FF", "badge_bg": "#00E5FF", "badge_text": "#0F172A"},
    {"bg": "#0C1527", "title": "#FFAB00", "subtitle": "#FFFFFF", "accent": "#FFAB00", "badge_bg": "#FFAB00", "badge_text": "#0C1527"},
    {"bg": "#102040", "title": "#C6FF00", "subtitle": "#FFFFFF", "accent": "#C6FF00", "badge_bg": "#C6FF00", "badge_text": "#102040"},
]

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert a hex color string like '#FF00AA' to an (R, G, B) tuple."""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _find_font(size: int):
    """Find and return a TrueType font supporting Korean characters."""
    from PIL import ImageFont

    # Candidate font paths by platform
    candidates = [
        # Windows
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/malgun.ttf",
        # Linux (Nanum)
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/nanum/NanumGothic.ttf",
        # Linux (fallback CJK)
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc",
        # macOS
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/Library/Fonts/AppleSDGothicNeo.ttc",
        # Generic DejaVu fallback (no Korean but better than default)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]

    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue

    # Last resort: Pillow default bitmap font
    logger.warning("No TrueType font found; falling back to Pillow default font")
    return ImageFont.load_default()


def _wrap_text(text: str, font, max_width: int, draw) -> list[str]:
    """Wrap *text* by character so each line fits within *max_width* pixels."""
    lines: list[str] = []
    current_line = ""

    for char in text:
        test_line = current_line + char
        bbox = draw.textbbox((0, 0), test_line, font=font)
        line_width = bbox[2] - bbox[0]
        if line_width <= max_width:
            current_line = test_line
        else:
            if current_line:
                lines.append(current_line)
            current_line = char

    if current_line:
        lines.append(current_line)

    return lines


def _draw_rounded_rect(draw, xy, radius: int, fill=None, outline=None, width: int = 1):
    """Draw a rounded rectangle on *draw* within bounding box *xy*."""
    x1, y1, x2, y2 = xy

    # Use Pillow built-in if available (Pillow >= 8.2)
    try:
        draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)
        return
    except AttributeError:
        pass

    # Manual fallback
    diameter = radius * 2
    draw.ellipse([x1, y1, x1 + diameter, y1 + diameter], fill=fill, outline=outline, width=width)
    draw.ellipse([x2 - diameter, y1, x2, y1 + diameter], fill=fill, outline=outline, width=width)
    draw.ellipse([x1, y2 - diameter, x1 + diameter, y2], fill=fill, outline=outline, width=width)
    draw.ellipse([x2 - diameter, y2 - diameter, x2, y2], fill=fill, outline=outline, width=width)
    draw.rectangle([x1 + radius, y1, x2 - radius, y2], fill=fill, outline=outline, width=width)
    draw.rectangle([x1, y1 + radius, x2, y2 - radius], fill=fill, outline=outline, width=width)


def _draw_diagonal_stripes(draw, w: int, h: int, color, stripe_width: int = 3, gap: int = 40):
    """Draw diagonal stripe pattern across the image."""
    for offset in range(-h, w + h, gap):
        draw.line(
            [(offset, 0), (offset + h, h)],
            fill=color,
            width=stripe_width,
        )


# ---------------------------------------------------------------------------
# Local Pillow image generation
# ---------------------------------------------------------------------------


def generate_keyword_image_local(
    keyword: str,
    is_ad: bool = False,
    width: int = 960,
    height: int = 540,
) -> str | None:
    """
    Generate a text-banner featured image using Pillow.

    Returns the saved file path, or ``None`` on failure.
    """
    try:
        from PIL import Image, ImageDraw, ImageFilter
    except ImportError:
        logger.error("Pillow is not installed – cannot generate local image")
        return None

    try:
        # Clean keyword prefix (재발행:, 재시도: etc.)
        clean_keyword = re.sub(r"^(재발행|재시도|재작성|수정)\s*:\s*", "", keyword).strip()
        if not clean_keyword:
            clean_keyword = keyword

        # Deterministic theme selection via MD5 hash
        kw_hash = hashlib.md5(clean_keyword.encode("utf-8")).hexdigest()
        hash_int = int(kw_hash, 16)

        if is_ad:
            theme = AD_BANNER_THEMES[hash_int % len(AD_BANNER_THEMES)]
        else:
            theme = COLOR_THEMES[hash_int % len(COLOR_THEMES)]

        img = Image.new("RGB", (width, height), _hex_to_rgb(theme["bg"]))
        draw = ImageDraw.Draw(img)

        if is_ad:
            # --- Ad banner style ---
            accent_rgb = _hex_to_rgb(theme["accent"])
            stripe_color = tuple(c // 6 for c in accent_rgb)  # very subtle
            _draw_diagonal_stripes(draw, width, height, stripe_color, stripe_width=2, gap=30)

            # Title
            title_font = _find_font(44)
            title_lines = _wrap_text(clean_keyword, title_font, width - 160, draw)
            if len(title_lines) > 3:
                title_lines = title_lines[:3]
                title_lines[-1] = title_lines[-1][:-1] + "…"

            line_height = 56
            total_text_height = len(title_lines) * line_height
            start_y = (height - total_text_height) // 2

            # Shadow text
            shadow_offset = 2
            shadow_color = (0, 0, 0)
            for i, line in enumerate(title_lines):
                bbox = draw.textbbox((0, 0), line, font=title_font)
                tw = bbox[2] - bbox[0]
                tx = (width - tw) // 2
                ty = start_y + i * line_height
                draw.text((tx + shadow_offset, ty + shadow_offset), line, font=title_font, fill=shadow_color)
                draw.text((tx, ty), line, font=title_font, fill=_hex_to_rgb(theme["title"]))

            # Badge
            badge_font = _find_font(18)
            badge_text = "AD"
            badge_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
            bw = badge_bbox[2] - badge_bbox[0] + 24
            bh = badge_bbox[3] - badge_bbox[1] + 12
            badge_x = width - bw - 24
            badge_y = 20
            _draw_rounded_rect(
                draw,
                (badge_x, badge_y, badge_x + bw, badge_y + bh),
                radius=6,
                fill=_hex_to_rgb(theme["badge_bg"]),
            )
            draw.text(
                (badge_x + 12, badge_y + 4),
                badge_text,
                font=badge_font,
                fill=_hex_to_rgb(theme["badge_text"]),
            )

            # Accent line at bottom
            draw.rectangle(
                [0, height - 6, width, height],
                fill=_hex_to_rgb(theme["accent"]),
            )

        else:
            # --- Normal post style ---
            accent_rgb = _hex_to_rgb(theme["accent"])
            text_rgb = _hex_to_rgb(theme["text"])

            # Outer frame
            margin = 30
            _draw_rounded_rect(
                draw,
                (margin, margin, width - margin, height - margin),
                radius=12,
                outline=accent_rgb,
                width=3,
            )

            # Title text
            title_font = _find_font(40)
            lines = _wrap_text(clean_keyword, title_font, width - 160, draw)
            if len(lines) > 4:
                lines = lines[:4]
                lines[-1] = lines[-1][:-1] + "…"

            line_height = 52
            total_text_height = len(lines) * line_height
            start_y = (height - total_text_height) // 2

            for i, line in enumerate(lines):
                bbox = draw.textbbox((0, 0), line, font=title_font)
                tw = bbox[2] - bbox[0]
                tx = (width - tw) // 2
                ty = start_y + i * line_height
                draw.text((tx, ty), line, font=title_font, fill=text_rgb)

            # Small accent bar under text
            bar_y = start_y + total_text_height + 16
            bar_w = 80
            draw.rectangle(
                [(width - bar_w) // 2, bar_y, (width + bar_w) // 2, bar_y + 4],
                fill=accent_rgb,
            )

        # Save
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        short_hash = kw_hash[:10]
        ts = int(time.time())
        filename = f"local_{short_hash}_{ts}.png"
        filepath = IMAGES_DIR / filename
        img.save(str(filepath), "PNG")
        logger.info(f"Local image saved: {filepath}")
        return str(filepath)

    except Exception as e:
        logger.error(f"Failed to generate local image for '{keyword}': {e}")
        return None


# ---------------------------------------------------------------------------
# Gemini REST API image generation
# ---------------------------------------------------------------------------

_GEMINI_MODELS = [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
]


async def _gemini_generate(keyword: str, is_ad: bool) -> str | None:
    """
    Call the Gemini image-generation API.

    Tries multiple models in order until one succeeds.
    Returns the saved file path, or ``None`` on failure.
    """
    api_key = settings.GOOGLE_API_KEY
    if not api_key:
        logger.warning("GOOGLE_API_KEY is not set – skipping Gemini image generation")
        return None

    # Build the prompt
    if is_ad:
        prompt = (
            f"Create a professional, eye-catching advertisement banner image for the following topic. "
            f"Use bold, modern design with vibrant colors. Do NOT include any text in the image. "
            f"Topic: {keyword}"
        )
    else:
        prompt = (
            f"Create a clean, professional blog featured image for the following topic. "
            f"Use a modern, minimal style. Do NOT include any text in the image. "
            f"Topic: {keyword}"
        )

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                ],
            }
        ],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"],
        },
    }

    headers = {"Content-Type": "application/json"}

    for model in _GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        logger.info(f"Trying Gemini model: {model}")

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload, headers=headers)

            if resp.status_code != 200:
                logger.warning(f"Gemini {model} returned status {resp.status_code}: {resp.text[:300]}")
                continue

            data = resp.json()

            # Extract base64 image from response
            candidates = data.get("candidates", [])
            if not candidates:
                logger.warning(f"Gemini {model} returned no candidates")
                continue

            parts = candidates[0].get("content", {}).get("parts", [])
            image_data = None
            for part in parts:
                inline = part.get("inlineData")
                if inline and inline.get("data"):
                    image_data = inline["data"]
                    break

            if not image_data:
                logger.warning(f"Gemini {model} response contained no image data")
                continue

            # Decode and save
            img_bytes = base64.b64decode(image_data)
            IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            kw_hash = hashlib.md5(keyword.encode("utf-8")).hexdigest()[:10]
            ts = int(time.time())
            mime = inline.get("mimeType", "image/png")
            ext = "png" if "png" in mime else "jpg"
            filename = f"gemini_{kw_hash}_{ts}.{ext}"
            filepath = IMAGES_DIR / filename
            filepath.write_bytes(img_bytes)
            logger.info(f"Gemini image saved ({model}): {filepath}")
            return str(filepath)

        except httpx.TimeoutException:
            logger.warning(f"Gemini {model} request timed out")
            continue
        except Exception as e:
            logger.warning(f"Gemini {model} error: {e}")
            continue

    logger.warning("All Gemini models failed to generate an image")
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def generate_image_with_gemini(keyword: str, is_ad: bool = False) -> str | None:
    """
    Generate a blog featured image with a 2-step fallback:

    1. Gemini REST API (remote, high quality)
    2. Pillow local text-banner (offline, guaranteed)

    Returns the saved file path, or ``None`` if everything fails.
    """
    # Step 1: Try Gemini
    try:
        result = await _gemini_generate(keyword, is_ad)
        if result:
            return result
        logger.info("Gemini generation returned None – falling back to local")
    except Exception as e:
        logger.warning(f"Gemini generation raised an exception: {e} – falling back to local")

    # Step 2: Pillow local fallback (sync, run in executor to stay async-friendly)
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: generate_keyword_image_local(keyword, is_ad=is_ad),
        )
        if result:
            return result
    except Exception as e:
        logger.error(f"Local image generation also failed: {e}")

    return None
