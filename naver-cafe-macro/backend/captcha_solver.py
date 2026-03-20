"""
captcha_solver.py - Claude API Vision 기반 네이버 캡차 자동 풀이

네이버 로그인 캡차(영수증 이미지 기반 문제)를 Claude Vision으로 분석하여
정답을 추출하고 자동 입력한다.

흐름:
1. 캡차 이미지 요소 스크린샷 캡처
2. 질문 텍스트 추출
3. Claude API에 이미지 + 질문 전송 → 정답 추출
4. 정답을 입력란에 입력
"""

import base64
import logging
import re
import sys
import time
from pathlib import Path

from selenium.webdriver.common.by import By
from selenium.common.exceptions import NoSuchElementException

logger = logging.getLogger("captcha_solver")
logger.setLevel(logging.DEBUG)

# 로그 핸들러 설정
_LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)

if not logger.handlers:
    _sh = logging.StreamHandler(sys.stderr)
    _sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(_sh)
    _fh = logging.FileHandler(str(_LOG_DIR / "captcha_solver.log"), encoding="utf-8")
    _fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(_fh)
logger.propagate = False

# 스크린샷 디렉토리
_SCREENSHOT_DIR = Path(__file__).resolve().parent.parent / "debug_screenshots"
_SCREENSHOT_DIR.mkdir(exist_ok=True)


def _get_api_config() -> dict:
    """DB에서 Claude API 설정을 가져온다."""
    try:
        import database as db
        conn = db.get_connection()
        row = conn.execute(
            "SELECT api_key, captcha_auto_solve FROM api_config WHERE id = 1"
        ).fetchone()
        conn.close()
        if row:
            return {"api_key": row["api_key"] or "", "captcha_auto_solve": row["captcha_auto_solve"]}
    except Exception as e:
        logger.warning(f"API 설정 조회 실패: {e}")
    return {"api_key": "", "captcha_auto_solve": 1}


def _get_api_key() -> str | None:
    """DB에서 Claude API 키를 가져온다."""
    config = _get_api_config()
    return config["api_key"] if config["api_key"] else None


def _capture_captcha_image(driver) -> bytes | None:
    """캡차 이미지 요소를 찾아 PNG 바이트로 캡처한다."""
    # 캡차 이미지 셀렉터 (네이버 영수증 캡차)
    image_selectors = [
        "#captchaimg",
        "img[src*='captcha']",
        "img[src*='ncaptcha']",
        ".captcha_area img",
        "#captcha img",
        # 네이버 영수증 캡차: 큰 이미지 요소
        "img[width]",
    ]

    for sel in image_selectors:
        try:
            elements = driver.find_elements(By.CSS_SELECTOR, sel)
            for el in elements:
                if not el.is_displayed():
                    continue
                # 너무 작은 이미지는 스킵 (아이콘 등)
                width = el.size.get("width", 0)
                height = el.size.get("height", 0)
                if width < 100 or height < 100:
                    continue
                png_bytes = el.screenshot_as_png
                logger.info(f"캡차 이미지 캡처 성공: selector={sel}, size={width}x{height}")
                return png_bytes
        except Exception:
            continue

    # 폴백: 페이지 전체 스크린샷
    logger.warning("캡차 이미지 요소를 찾지 못함 — 전체 페이지 스크린샷 사용")
    try:
        return driver.get_screenshot_as_png()
    except Exception as e:
        logger.error(f"전체 스크린샷 캡처 실패: {e}")
        return None


def _extract_question_text(driver) -> str:
    """캡차 질문 텍스트를 추출한다."""
    # 질문 텍스트가 포함된 요소 탐색
    question_selectors = [
        ".captcha_question",
        "#captcha_question",
        "span[class*='question']",
        "p[class*='question']",
        "strong[style*='color']",  # 네이버 영수증 캡차: 빨간/강조색 질문
    ]

    for sel in question_selectors:
        try:
            elements = driver.find_elements(By.CSS_SELECTOR, sel)
            for el in elements:
                text = el.text.strip()
                if text and len(text) > 5:
                    logger.info(f"캡차 질문 추출: '{text}' (selector={sel})")
                    return text
        except Exception:
            continue

    # 폴백: body 텍스트에서 질문 패턴 찾기
    try:
        body_text = driver.find_element(By.TAG_NAME, "body").text
        # "~무엇입니까?" 패턴 찾기
        patterns = [
            r'[가-힣\s\d]+무엇입니까\?',
            r'[가-힣\s\d]+입력해[가-힣]*',
            r'[가-힣\s\d]+몇[가-힣]*\?',
        ]
        for pat in patterns:
            match = re.search(pat, body_text)
            if match:
                question = match.group(0).strip()
                logger.info(f"캡차 질문 (패턴 매칭): '{question}'")
                return question
    except Exception:
        pass

    return ""


def _solve_with_claude(image_bytes: bytes, question_text: str, api_key: str) -> str | None:
    """Claude API Vision으로 캡차 이미지를 분석하여 정답을 반환한다."""
    try:
        import anthropic
    except ImportError:
        logger.error("anthropic 패키지가 설치되지 않음. pip install anthropic 필요")
        return None

    client = anthropic.Anthropic(api_key=api_key)

    # 이미지를 base64로 인코딩
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    prompt_text = (
        "이 이미지는 네이버 로그인 캡차입니다. "
        "영수증 이미지가 포함되어 있고, 이미지 아래에 질문이 있습니다.\n\n"
    )
    if question_text:
        prompt_text += f"질문: {question_text}\n\n"
    else:
        prompt_text += "이미지에 보이는 질문에 답해주세요.\n\n"

    prompt_text += (
        "영수증 이미지를 주의 깊게 읽고, 질문에 대한 정답을 숫자나 텍스트로만 답해주세요. "
        "정답만 출력하세요. 다른 설명은 필요 없습니다."
    )

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=100,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": image_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": prompt_text,
                        },
                    ],
                }
            ],
        )

        answer = response.content[0].text.strip()
        logger.info(f"Claude 캡차 분석 결과: '{answer}'")

        # 숫자만 추출 (정답이 숫자인 경우)
        numbers = re.findall(r'\d+', answer)
        if numbers:
            # 가장 짧은 숫자 (보통 한 자리 또는 두 자리)
            result = min(numbers, key=len) if any(len(n) <= 2 for n in numbers) else numbers[0]
            # 한두 자리 숫자 우선
            short_numbers = [n for n in numbers if len(n) <= 2]
            if short_numbers:
                result = short_numbers[0]
            else:
                result = numbers[0]
            logger.info(f"캡차 정답 추출: '{result}' (원본: '{answer}')")
            return result

        # 숫자가 아닌 경우 원본 텍스트 반환
        return answer

    except Exception as e:
        logger.error(f"Claude API 호출 실패: {type(e).__name__}: {e}")
        return None


def solve_captcha(driver) -> bool:
    """
    캡차를 감지하고 자동으로 풀이한다.

    Returns:
        True: 캡차 풀이 성공 (또는 캡차 없음)
        False: 캡차 풀이 실패
    """
    api_key = _get_api_key()
    if not api_key:
        logger.warning("Claude API 키가 설정되지 않음 — 캡차 자동 풀이 불가")
        return False

    # 1. 캡차 이미지 캡처
    image_bytes = _capture_captcha_image(driver)
    if not image_bytes:
        logger.error("캡차 이미지 캡처 실패")
        return False

    # 디버그용 이미지 저장
    try:
        from datetime import datetime
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        debug_path = _SCREENSHOT_DIR / f"captcha_image_{ts}.png"
        debug_path.write_bytes(image_bytes)
        logger.info(f"캡차 이미지 저장: {debug_path}")
    except Exception:
        pass

    # 2. 질문 텍스트 추출
    question_text = _extract_question_text(driver)

    # 3. Claude API로 풀이
    answer = _solve_with_claude(image_bytes, question_text, api_key)
    if not answer:
        logger.error("Claude API 캡차 풀이 실패 — 정답을 얻지 못함")
        return False

    # 4. 정답 입력
    input_selectors = [
        "input[name*='captcha']",
        "input[placeholder*='정답']",
        "input[placeholder*='입력']",
        "#captcha_input",
        ".captcha_area input[type='text']",
        "#captcha input[type='text']",
        # 캡차 영역 근처의 텍스트 입력 필드
        "input[type='text'][maxlength]",
    ]

    captcha_input = None
    for sel in input_selectors:
        try:
            elements = driver.find_elements(By.CSS_SELECTOR, sel)
            for el in elements:
                if el.is_displayed():
                    captcha_input = el
                    logger.info(f"캡차 입력 필드 발견: selector={sel}")
                    break
            if captcha_input:
                break
        except Exception:
            continue

    if not captcha_input:
        logger.error("캡차 입력 필드를 찾지 못함")
        return False

    try:
        captcha_input.clear()
        captcha_input.click()
        time.sleep(0.3)

        # JS로 값 설정 + 이벤트 발행
        driver.execute_script(
            "var el = arguments[0];"
            "el.value = arguments[1];"
            "el.dispatchEvent(new Event('input', {bubbles: true}));"
            "el.dispatchEvent(new Event('change', {bubbles: true}));",
            captcha_input, answer
        )
        logger.info(f"캡차 정답 입력 완료: '{answer}'")

        # 디버그 스크린샷
        try:
            from datetime import datetime
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            debug_path = _SCREENSHOT_DIR / f"captcha_answered_{ts}.png"
            driver.save_screenshot(str(debug_path))
        except Exception:
            pass

        return True

    except Exception as e:
        logger.error(f"캡차 정답 입력 실패: {type(e).__name__}: {e}")
        return False


def detect_and_solve_captcha(driver) -> str:
    """
    캡차 감지 + 풀이 통합 함수.

    Returns:
        "no_captcha": 캡차 없음
        "solved": 캡차 풀이 성공
        "failed": 캡차 풀이 실패
        "no_api_key": API 키 미설정
    """
    # 캡차 존재 여부 확인
    current_url = driver.current_url
    has_captcha = "captcha" in current_url

    if not has_captcha:
        # URL에 captcha가 없어도 페이지 내 캡차 요소 확인
        captcha_indicators = [
            "#captchaimg",
            "img[src*='captcha']",
            "img[src*='ncaptcha']",
            "iframe[src*='captcha']",
            "#captcha",
            ".captcha_area",
            "input[name*='captcha']",
            "input[placeholder*='정답']",
        ]
        for sel in captcha_indicators:
            try:
                el = driver.find_element(By.CSS_SELECTOR, sel)
                if el.is_displayed():
                    has_captcha = True
                    logger.info(f"캡차 요소 감지: {sel}")
                    break
            except NoSuchElementException:
                continue

    if not has_captcha:
        return "no_captcha"

    logger.info("캡차 감지됨 — 자동 풀이 시도")

    config = _get_api_config()
    if not config.get("captcha_auto_solve", 1):
        logger.info("캡차 자동 풀이가 비활성화되어 있습니다.")
        return "failed"

    api_key = config.get("api_key")
    if not api_key:
        logger.warning("Claude API 키 미설정 — 캡차 자동 풀이 불가. 설정 > API 설정에서 키를 입력하세요.")
        return "no_api_key"

    if solve_captcha(driver):
        return "solved"
    return "failed"
