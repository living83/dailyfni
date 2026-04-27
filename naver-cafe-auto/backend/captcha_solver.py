"""
captcha_solver.py - Claude API Vision 기반 네이버 캡차 자동 풀이 (Playwright 버전)

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


async def _capture_captcha_image(page) -> bytes | None:
    """캡차 이미지 요소를 찾아 PNG 바이트로 캡처한다.

    네이버 영수증 캡차는 로그인 폼 내에 큰 이미지로 표시된다.
    다양한 셀렉터를 시도하고, 실패 시 전체 페이지 스크린샷을 사용한다.
    """
    # 캡차 이미지 셀렉터 (네이버 영수증 캡차 — 우선순위 순)
    image_selectors = [
        "#captchaimg",
        "img[src*='captcha']",
        "img[src*='ncaptcha']",
        ".captcha_area img",
        "#captcha img",
        ".img_captcha",
        "div[class*='captcha'] img",
        "span[class*='captcha'] img",
        "#content img",
        ".login_content img",
        "form img",
        "img[width]",
        "img[src*='nid']",
        "img[src*='receipt']",
    ]

    for sel in image_selectors:
        try:
            elements = await page.query_selector_all(sel)
            for el in elements:
                if not await el.is_visible():
                    continue
                box = await el.bounding_box()
                if not box or box["width"] < 150 or box["height"] < 100:
                    continue
                png_bytes = await el.screenshot()
                logger.info(f"캡차 이미지 캡처 성공: selector={sel}, size={box['width']:.0f}x{box['height']:.0f}")
                return png_bytes
        except Exception as e:
            logger.debug(f"셀렉터 {sel} 캡처 실패: {e}")
            continue

    # 폴백 2: JS로 큰 이미지 요소 직접 탐색
    try:
        large_images = await page.evaluate("""() => {
            var imgs = document.querySelectorAll('img');
            var result = [];
            for (var i = 0; i < imgs.length; i++) {
                var rect = imgs[i].getBoundingClientRect();
                if (rect.width >= 200 && rect.height >= 150 && imgs[i].offsetParent !== null) {
                    result.push({index: i, width: rect.width, height: rect.height, src: imgs[i].src.substring(0, 100)});
                }
            }
            return result;
        }""")
        if large_images:
            logger.info(f"JS로 큰 이미지 {len(large_images)}개 발견: {large_images}")
            largest = max(large_images, key=lambda x: x["width"] * x["height"])
            all_imgs = await page.query_selector_all("img")
            if largest["index"] < len(all_imgs):
                img_el = all_imgs[largest["index"]]
                png_bytes = await img_el.screenshot()
                logger.info(f"JS 큰 이미지 캡처 성공: size={largest['width']}x{largest['height']}, src={largest['src']}")
                return png_bytes
    except Exception as e:
        logger.warning(f"JS 이미지 탐색 실패: {e}")

    # 폴백 3: 페이지 전체 스크린샷
    logger.warning("캡차 이미지 요소를 찾지 못함 — 전체 페이지 스크린샷 사용")
    try:
        return await page.screenshot()
    except Exception as e:
        logger.error(f"전체 스크린샷 캡처 실패: {e}")
        return None


async def _extract_question_text(page) -> str:
    """캡차 질문 텍스트를 추출한다."""
    question_selectors = [
        ".captcha_question",
        "#captcha_question",
        "span[class*='question']",
        "p[class*='question']",
        "strong[style*='color']",
        "strong[class*='color']",
        "em[style*='color']",
        "b[style*='color']",
        "p[style*='color']",
        "span[style*='color']",
        "div[class*='captcha'] p",
        "div[class*='captcha'] span",
        ".captcha_info",
    ]

    for sel in question_selectors:
        try:
            elements = await page.query_selector_all(sel)
            for el in elements:
                text = (await el.text_content() or "").strip()
                if text and len(text) > 5:
                    logger.info(f"캡차 질문 추출: '{text}' (selector={sel})")
                    return text
        except Exception:
            continue

    # 폴백: body 텍스트에서 질문 패턴 찾기
    try:
        body_el = await page.query_selector("body")
        body_text = await body_el.text_content() if body_el else ""
        patterns = [
            r'영수증[가-힣\s\d\[\]\?\.\,\(\)]+(?:입니다|주세요|입력해|무엇입니까)',
            r'[가-힣\s\d\[\]\?]+빈\s*칸[가-힣\s\d\[\]\?\.\,\(\)]*채워주세요[.\)]*',
            r'[가-힣\s\d\[\]\?]+무엇입니까\??',
            r'[가-힣\s\d\[\]\?]+입력해[가-힣]*',
            r'[가-힣\s\d\[\]\?]+채워주세요[가-힣\.\)]*',
            r'[가-힣\s\d\[\]\?]+몇[가-힣]*\??',
        ]
        for pat in patterns:
            match = re.search(pat, body_text)
            if match:
                question = match.group(0).strip()
                logger.info(f"캡차 질문 (패턴 매칭): '{question}'")
                return question
    except Exception:
        pass

    # 폴백 2: JS로 빨간/강조 텍스트 추출
    try:
        colored_text = await page.evaluate("""() => {
            var elements = document.querySelectorAll('*');
            for (var i = 0; i < elements.length; i++) {
                var style = window.getComputedStyle(elements[i]);
                var color = style.color;
                var text = elements[i].textContent.trim();
                if (color && (color.indexOf('255, 0') !== -1 || color.indexOf('red') !== -1 ||
                    color.indexOf('239,') !== -1 || color.indexOf('200, 0') !== -1) &&
                    text.length > 10 && text.length < 200) {
                    return text;
                }
            }
            return '';
        }""")
        if colored_text:
            logger.info(f"캡차 질문 (JS 색상 감지): '{colored_text}'")
            return colored_text
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

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    prompt_text = (
        "이 이미지는 네이버 로그인 보안 인증용 영수증 이미지입니다.\n"
        "영수증에는 가게 이름, 주소, 전화번호, 제품명, 가격, 개수, 총 합 등의 정보가 있습니다.\n\n"
    )
    if question_text:
        prompt_text += f"질문: {question_text}\n\n"
    else:
        prompt_text += (
            "이 영수증 이미지와 함께 표시된 질문에 답해주세요.\n"
            "질문이 보이지 않으면, 영수증의 모든 정보를 읽어주세요.\n\n"
        )

    prompt_text += (
        "영수증 이미지를 매우 주의 깊게 읽어주세요.\n"
        "- 주소의 숫자(길 번호, 건물 번호)\n"
        "- 전화번호\n"
        "- 제품 가격, 개수, 총 합\n"
        "- 가게 이름\n"
        "이 중 질문에서 묻는 정보를 정확히 찾아 정답만 출력하세요.\n"
        "[?] 또는 빈 칸에 들어갈 값을 답해주세요.\n"
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

        if len(answer) <= 10:
            clean = re.sub(r'[^\d가-힣a-zA-Z]', '', answer)
            if clean:
                logger.info(f"캡차 정답 (짧은 응답): '{clean}'")
                return clean
            return answer

        numbers = re.findall(r'\d+', answer)
        if numbers:
            if len(numbers) == 1:
                logger.info(f"캡차 정답 추출: '{numbers[0]}' (원본: '{answer}')")
                return numbers[0]
            if question_text and "[?" in question_text:
                q_numbers = set(re.findall(r'\d+', question_text))
                new_numbers = [n for n in numbers if n not in q_numbers]
                if new_numbers:
                    logger.info(f"캡차 정답 추출 (질문 제외): '{new_numbers[0]}' (원본: '{answer}')")
                    return new_numbers[0]
            logger.info(f"캡차 정답 추출 (첫 번째): '{numbers[0]}' (원본: '{answer}')")
            return numbers[0]

        return answer

    except Exception as e:
        logger.error(f"Claude API 호출 실패: {type(e).__name__}: {e}")
        return None


async def solve_captcha(page) -> bool:
    """캡차를 감지하고 자동으로 풀이한다.

    Returns:
        True: 캡차 풀이 성공 (또는 캡차 없음)
        False: 캡차 풀이 실패
    """
    api_key = _get_api_key()
    if not api_key:
        logger.warning("Claude API 키가 설정되지 않음 — 캡차 자동 풀이 불가")
        return False

    # 1. 캡차 이미지 캡처
    image_bytes = await _capture_captcha_image(page)
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
    question_text = await _extract_question_text(page)
    if not question_text:
        logger.warning("캡차 질문 텍스트를 추출하지 못함 — 전체 페이지 스크린샷으로 재시도")
        try:
            image_bytes = await page.screenshot()
            debug_path2 = _SCREENSHOT_DIR / f"captcha_fullpage_{ts}.png"
            debug_path2.write_bytes(image_bytes)
            logger.info(f"전체 페이지 스크린샷 저장: {debug_path2}")
        except Exception:
            pass

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
        "input[type='text'][maxlength]",
    ]

    captcha_input = None
    for sel in input_selectors:
        try:
            elements = await page.query_selector_all(sel)
            for el in elements:
                if await el.is_visible():
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
        await captcha_input.click()
        import asyncio
        await asyncio.sleep(0.3)

        await captcha_input.fill("")
        await captcha_input.type(answer, delay=50)
        logger.info(f"캡차 정답 입력 완료: '{answer}'")

        # 디버그 스크린샷
        try:
            from datetime import datetime
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            debug_path = _SCREENSHOT_DIR / f"captcha_answered_{ts}.png"
            await page.screenshot(path=str(debug_path))
        except Exception:
            pass

        return True

    except Exception as e:
        logger.error(f"캡차 정답 입력 실패: {type(e).__name__}: {e}")
        return False


async def detect_and_solve_captcha(page) -> str:
    """캡차 감지 + 풀이 통합 함수.

    Returns:
        "no_captcha": 캡차 없음
        "solved": 캡차 풀이 성공
        "failed": 캡차 풀이 실패
        "no_api_key": API 키 미설정
    """
    current_url = page.url
    has_captcha = "captcha" in current_url

    if not has_captcha:
        captcha_indicators = [
            "#captchaimg",
            "img[src*='captcha']",
            "img[src*='ncaptcha']",
            "iframe[src*='captcha']",
            "#captcha",
            ".captcha_area",
            "input[name*='captcha']",
            "input[placeholder*='정답']",
            "input[placeholder*='입력해주세요']",
        ]
        for sel in captcha_indicators:
            try:
                el = await page.query_selector(sel)
                if el and await el.is_visible():
                    has_captcha = True
                    logger.info(f"캡차 요소 감지: {sel}")
                    break
            except Exception:
                continue

    # 폴백: 페이지 텍스트에서 캡차 질문 패턴 탐색
    if not has_captcha:
        try:
            body_el = await page.query_selector("body")
            body_text = await body_el.text_content() if body_el else ""
            captcha_keywords = ["영수증", "빈 칸을 채워주세요", "정답을 입력", "자동입력 방지"]
            for kw in captcha_keywords:
                if kw in body_text:
                    has_captcha = True
                    logger.info(f"캡차 텍스트 감지: '{kw}'")
                    break
        except Exception:
            pass

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

    if await solve_captcha(page):
        return "solved"
    return "failed"
