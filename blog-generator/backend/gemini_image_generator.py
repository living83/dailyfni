"""
Gemini API 기반 블로그 포스팅 이미지 생성기
- Google Gemini API를 사용하여 키워드/본문과 관련된 이미지를 생성
- 포스팅당 최대 3장까지 랜덤 개수로 생성
- 네이버 블로그 최적 사이즈: 960x540
"""

import os
import random
import hashlib
import logging
import base64
from pathlib import Path

logger = logging.getLogger("gemini_image")

# 이미지 저장 디렉토리
IMAGE_DIR = Path(__file__).resolve().parent.parent / "data" / "images" / "gemini"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)


def _get_api_key() -> str:
    """환경변수에서 Gemini API 키를 가져옴"""
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise ValueError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")
    return key


def _build_image_prompt(keyword: str, content: str = "", image_index: int = 0) -> str:
    """키워드와 본문 내용을 기반으로 이미지 생성 프롬프트를 구성"""

    # 본문에서 핵심 문장 추출 (너무 길면 요약)
    content_summary = ""
    if content:
        # 본문에서 첫 500자를 사용
        clean_content = content.replace("#", "").replace("*", "").strip()
        content_summary = clean_content[:500]

    # 이미지 스타일 변형 (같은 키워드라도 다른 스타일의 이미지 생성)
    styles = [
        "clean and modern digital illustration style, soft colors, minimalist design",
        "warm and inviting photograph style, natural lighting, lifestyle aesthetic",
        "professional infographic style, clean layout, informative visual design",
    ]
    style = styles[image_index % len(styles)]

    prompt = f"""Create a blog post image for the following topic.

Topic/Keyword: {keyword}

{f'Article context: {content_summary}' if content_summary else ''}

Requirements:
- Style: {style}
- The image should visually represent the topic
- Do NOT include any text, letters, words, or characters in the image
- Professional quality suitable for a blog post
- Aspect ratio: 16:9 (landscape orientation)
- Clean, visually appealing composition"""

    return prompt


def generate_gemini_image(keyword: str, content: str = "", image_index: int = 0) -> str:
    """
    Gemini API를 사용하여 키워드/본문 관련 이미지를 생성합니다.

    Args:
        keyword: 블로그 키워드
        content: 블로그 본문 내용 (선택)
        image_index: 이미지 인덱스 (스타일 변형용, 0~2)

    Returns:
        생성된 이미지 파일 경로 (절대 경로)
    """
    import re
    keyword = re.sub(r'^(재발행|재시도|retry)\s*[:：]\s*', '', keyword).strip()

    api_key = _get_api_key()
    prompt = _build_image_prompt(keyword, content, image_index)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        # 모델 우선순위: imagen-4.0-fast (저렴/빠름) → imagen-4.0 (고품질)
        model_name = os.getenv("GEMINI_IMAGE_MODEL", "imagen-4.0-fast-generate-001")

        # safety_filter_level: SDK enum 사용 (문자열은 일부 버전에서 매핑 오류 발생)
        try:
            safety_level = types.SafetyFilterLevel.BLOCK_LOW_AND_ABOVE
        except (AttributeError, Exception):
            safety_level = "block_low_and_above"

        response = client.models.generate_images(
            model=model_name,
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio="16:9",
                safety_filter_level=safety_level,
            ),
        )

        if not response.generated_images:
            raise ValueError("Gemini API가 이미지를 생성하지 못했습니다.")

        image_data = response.generated_images[0].image.image_bytes

        # 파일 저장
        safe_name = hashlib.md5(keyword.encode()).hexdigest()[:12]
        filename = f"gemini_{safe_name}_v{image_index}.png"
        filepath = IMAGE_DIR / filename
        filepath.write_bytes(image_data)

        # 이미지 리사이즈 (960x540)
        try:
            from PIL import Image
            img = Image.open(filepath)
            if img.size != (960, 540):
                img = img.resize((960, 540), Image.LANCZOS)
                img.save(str(filepath), "PNG", quality=95)
        except Exception as e:
            logger.warning(f"이미지 리사이즈 실패 (원본 사용): {e}")

        logger.info(f"Gemini 이미지 생성 완료: {filepath}")
        return str(filepath)

    except ImportError:
        raise ImportError(
            "google-genai 패키지가 설치되지 않았습니다. "
            "'pip install google-genai' 를 실행하세요."
        )
    except Exception as e:
        logger.error(f"Gemini 이미지 생성 실패: {e}")
        raise


def generate_gemini_images(keyword: str, content: str = "", max_count: int = 3) -> list:
    """
    Gemini API로 키워드/본문 관련 이미지를 최대 max_count장까지 랜덤 개수로 생성합니다.

    Args:
        keyword: 블로그 키워드
        content: 블로그 본문 내용 (선택)
        max_count: 최대 생성 이미지 수 (기본 3)

    Returns:
        생성된 이미지 파일 경로 리스트 (1~max_count개)
    """
    # 1~max_count 사이 랜덤 개수
    count = random.randint(1, max_count)
    logger.info(f"Gemini 이미지 {count}장 생성 시작 (키워드: {keyword})")

    paths = []
    for i in range(count):
        try:
            path = generate_gemini_image(keyword, content, image_index=i)
            paths.append(path)
        except Exception as e:
            logger.error(f"Gemini 이미지 {i+1}번째 생성 실패: {e}")
            # 하나라도 생성되었으면 계속 진행
            if paths:
                break
            # 첫 이미지도 실패하면 예외 전파
            raise

    logger.info(f"Gemini 이미지 총 {len(paths)}장 생성 완료")
    return paths
