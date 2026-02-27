"""
cafe_publisher.py - 네이버 카페 자동 발행
Selenium 기반 카페 글쓰기 / 댓글 자동화

흐름:
1. 로그인: 기존 쿠키 우선 → ID/PW 폴백
2. 카페 이동: cafe.naver.com/{카페URL} 접속
3. 게시판 선택: 지정된 게시판(menuId) 클릭
4. 글쓰기: SE ONE 에디터에서 구조화된 콘텐츠 입력 (서식 적용)
   - 폰트: 나눔스퀘어네오
   - 강조①: 빨강(#ff0010) + 노란배경(#fff8b2) + 볼드
   - 강조②: 보라(#740060) + 밑줄 + 볼드
   - CTA 테이블: 1×1 노란배경, 24px 볼드, 링크
5. 이미지/스티커 삽입
6. 발행: 등록 버튼 클릭 → URL 확인
"""

import json
import re
import time
import random
import logging
from typing import Optional

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

from crypto import decrypt_password
from content_generator import (
    STYLE_NORMAL, STYLE_EMPTY, STYLE_HIGHLIGHT_RED, STYLE_HIGHLIGHT_PURPLE
)

logger = logging.getLogger(__name__)

# ─── 유틸 ──────────────────────────────────────────────────

def random_delay(min_sec: float = 0.5, max_sec: float = 2.0):
    """사람처럼 보이기 위한 랜덤 딜레이"""
    time.sleep(random.uniform(min_sec, max_sec))


def human_type(element, text: str, min_delay: float = 0.03, max_delay: float = 0.12):
    """한 글자씩 사람처럼 타이핑"""
    for char in text:
        element.send_keys(char)
        time.sleep(random.uniform(min_delay, max_delay))


def create_driver(headless: bool = True) -> webdriver.Chrome:
    """Chrome WebDriver 생성"""
    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    driver = webdriver.Chrome(options=options)
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"}
    )
    return driver


# ─── 로그인 ────────────────────────────────────────────────

def login_with_cookie(driver: webdriver.Chrome, cookie_data: str) -> bool:
    """저장된 쿠키로 로그인 시도"""
    try:
        driver.get("https://www.naver.com")
        random_delay(1, 2)

        cookies = json.loads(cookie_data)
        for cookie in cookies:
            # 필수 필드만 유지
            clean_cookie = {
                "name": cookie["name"],
                "value": cookie["value"],
                "domain": cookie.get("domain", ".naver.com"),
                "path": cookie.get("path", "/"),
            }
            try:
                driver.add_cookie(clean_cookie)
            except Exception:
                continue

        driver.get("https://www.naver.com")
        random_delay(2, 3)

        # 로그인 확인: 네이버 메일 또는 프로필 요소 존재 여부
        try:
            driver.find_element(By.CSS_SELECTOR, ".MyView-module__link_login___HpHMW")
            return False  # 로그인 버튼이 보이면 실패
        except NoSuchElementException:
            logger.info("쿠키 로그인 성공")
            return True
    except Exception as e:
        logger.warning(f"쿠키 로그인 실패: {e}")
        return False


def login_with_credentials(driver: webdriver.Chrome, username: str, password_enc: str) -> bool:
    """ID/PW로 네이버 로그인"""
    try:
        password = decrypt_password(password_enc)
        driver.get("https://nid.naver.com/nidlogin.login")
        random_delay(2, 3)

        wait = WebDriverWait(driver, 10)

        # 아이디 입력 (클립보드 방식으로 우회)
        id_input = wait.until(EC.presence_of_element_located((By.ID, "id")))
        driver.execute_script(
            f"document.getElementById('id').value = '{username}';"
        )
        random_delay(0.3, 0.8)

        # 비밀번호 입력
        pw_input = driver.find_element(By.ID, "pw")
        driver.execute_script(
            f"document.getElementById('pw').value = arguments[0];", password
        )
        random_delay(0.5, 1.0)

        # 로그인 버튼 클릭
        login_btn = driver.find_element(By.ID, "log.login")
        login_btn.click()
        random_delay(3, 5)

        # 캡챠/2차 인증 체크
        current_url = driver.current_url
        if "nidlogin" in current_url or "captcha" in current_url:
            logger.warning(f"로그인 실패 또는 캡챠 발생: {current_url}")
            return False

        logger.info(f"ID/PW 로그인 성공: {username}")
        return True

    except Exception as e:
        logger.error(f"로그인 중 오류: {e}")
        return False


def get_login_cookies(driver: webdriver.Chrome) -> str:
    """현재 세션 쿠키를 JSON 문자열로 반환"""
    cookies = driver.get_cookies()
    return json.dumps(cookies, ensure_ascii=False)


# ─── 카페 글쓰기 ──────────────────────────────────────────

def _extract_cafe_id(cafe_url: str) -> str:
    """
    cafe_url에서 카페 식별자(숫자 ID 또는 alias)만 추출.
    예: 'https://cafe.naver.com/smartcredit' → 'smartcredit'
        'cafe.naver.com/smartcredit'         → 'smartcredit'
        'smartcredit'                        → 'smartcredit'
        '30339285'                           → '30339285'
    """
    val = cafe_url.strip().rstrip("/")
    # 전체 URL이 들어온 경우 path의 마지막 세그먼트 추출
    if "cafe.naver.com" in val:
        # https://cafe.naver.com/smartcredit  →  smartcredit
        parts = val.split("cafe.naver.com/", 1)
        if len(parts) == 2 and parts[1]:
            val = parts[1].split("/")[0].split("?")[0]
    return val


# 카페 숫자 ID 캐시 (alias → numeric_id)
_cafe_id_cache: dict = {}


def _resolve_numeric_cafe_id(driver: webdriver.Chrome, cafe_alias: str) -> str:
    """
    카페 별칭(alias)에서 숫자 카페 ID를 추출.
    /ca-fe/ URL은 숫자 ID만 지원하므로 카페 페이지 방문 후 URL 리다이렉트에서 추출.
    """
    if cafe_alias.isdigit():
        return cafe_alias

    if cafe_alias in _cafe_id_cache:
        logger.info(f"카페 ID 캐시 히트: {cafe_alias} → {_cafe_id_cache[cafe_alias]}")
        return _cafe_id_cache[cafe_alias]

    logger.info(f"카페 숫자 ID 조회 시작: {cafe_alias}")

    try:
        driver.get(f"https://cafe.naver.com/{cafe_alias}")

        # 방법 1: SPA가 URL을 /ca-fe/cafes/숫자ID/ 로 변경할 때까지 대기
        try:
            WebDriverWait(driver, 10).until(
                lambda d: re.search(r'/cafes/(\d+)', d.current_url)
            )
            match = re.search(r'/cafes/(\d+)', driver.current_url)
            if match:
                numeric_id = match.group(1)
                _cafe_id_cache[cafe_alias] = numeric_id
                logger.info(f"카페 숫자 ID (URL): {cafe_alias} → {numeric_id}")
                return numeric_id
        except TimeoutException:
            logger.warning(f"URL 리다이렉트 타임아웃, 페이지 소스에서 시도")

        # 방법 2: 페이지 소스에서 추출
        page_source = driver.page_source
        for pattern in [r'"clubId"\s*:\s*(\d+)', r'"cafeId"\s*:\s*(\d+)', r'clubid[=:]\s*(\d+)', r'/cafes/(\d+)']:
            match = re.search(pattern, page_source, re.IGNORECASE)
            if match:
                numeric_id = match.group(1)
                _cafe_id_cache[cafe_alias] = numeric_id
                logger.info(f"카페 숫자 ID (소스): {cafe_alias} → {numeric_id}")
                return numeric_id

        # 방법 3: JavaScript로 window 객체에서 추출
        try:
            numeric_id = driver.execute_script(
                "try { return document.querySelector('a[href*=\"/cafes/\"]')"
                "?.href?.match(/\\/cafes\\/(\\d+)/)?.[1] "
                "|| window.__NEXT_DATA__?.props?.pageProps?.cafeId?.toString() "
                "|| document.body.innerHTML.match(/\"clubId\"\\s*:\\s*(\\d+)/)?.[1] "
                "|| null; } catch(e) { return null; }"
            )
            if numeric_id:
                _cafe_id_cache[cafe_alias] = numeric_id
                logger.info(f"카페 숫자 ID (JS): {cafe_alias} → {numeric_id}")
                return numeric_id
        except Exception:
            pass

        logger.warning(f"숫자 카페 ID 추출 실패, alias 그대로 사용: {cafe_alias}")
        logger.warning(f"현재 URL: {driver.current_url}")
        return cafe_alias

    except Exception as e:
        logger.warning(f"카페 ID 조회 실패: {e}, alias 사용: {cafe_alias}")
        return cafe_alias


def navigate_to_write_page(driver: webdriver.Chrome, cafe_url: str, menu_id: str) -> bool:
    """카페 글쓰기 페이지로 이동"""
    try:
        cafe_alias = _extract_cafe_id(cafe_url)
        cafe_id = _resolve_numeric_cafe_id(driver, cafe_alias)

        if menu_id:
            write_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_id}/articles/write?boardType=L&menuId={menu_id}"
        else:
            write_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_id}/articles/write?boardType=L"
        logger.info(f"글쓰기 URL: {write_url}")
        driver.get(write_url)
        random_delay(3, 5)

        # 글쓰기 페이지 도달 확인
        current_url = driver.current_url
        if "articles/write" not in current_url and "ArticleWrite" not in current_url:
            logger.warning(f"글쓰기 페이지 아닌 곳으로 이동됨: {current_url}")

        try:
            driver.switch_to.frame("cafe_main")
            random_delay(1, 2)
        except Exception:
            pass

        logger.info(f"글쓰기 페이지 이동 완료: cafe={cafe_id}, menuId={menu_id}, url={driver.current_url}")
        return True

    except Exception as e:
        logger.error(f"글쓰기 페이지 이동 실패: {e}")
        return False


# ─── SE ONE 에디터 서식 헬퍼 ──────────────────────────────

def _click_toolbar_button(driver, selectors: list) -> bool:
    """여러 CSS 셀렉터를 순서대로 시도하여 툴바 버튼 클릭"""
    for sel in selectors:
        try:
            btn = driver.find_element(By.CSS_SELECTOR, sel)
            btn.click()
            random_delay(0.15, 0.3)
            return True
        except NoSuchElementException:
            continue
    return False


def _is_toolbar_active(driver, selectors: list) -> bool:
    """툴바 버튼이 활성(active) 상태인지 확인"""
    for sel in selectors:
        try:
            btn = driver.find_element(By.CSS_SELECTOR, sel)
            cls = btn.get_attribute("class") or ""
            aria = btn.get_attribute("aria-pressed") or ""
            return "active" in cls or "on" in cls or aria == "true"
        except NoSuchElementException:
            continue
    return False


def _set_bold(driver, on: bool = True):
    """볼드 설정/해제"""
    sels = [
        "button[data-command='bold']",
        "button.se-text-style-button-bold",
        ".se-toolbar button[data-style='bold']",
    ]
    is_active = _is_toolbar_active(driver, sels)
    if on != is_active:
        if not _click_toolbar_button(driver, sels):
            ActionChains(driver).key_down(Keys.CONTROL).send_keys("b").key_up(Keys.CONTROL).perform()
            random_delay(0.1, 0.2)


def _set_underline(driver, on: bool = True):
    """밑줄 설정/해제"""
    sels = [
        "button[data-command='underline']",
        "button.se-text-style-button-underline",
        ".se-toolbar button[data-style='underline']",
    ]
    is_active = _is_toolbar_active(driver, sels)
    if on != is_active:
        if not _click_toolbar_button(driver, sels):
            ActionChains(driver).key_down(Keys.CONTROL).send_keys("u").key_up(Keys.CONTROL).perform()
            random_delay(0.1, 0.2)


def _set_font_color(driver, hex_color: str):
    """글자색 변경 (SE ONE 컬러피커)"""
    sels = [
        "button[data-command='fontColor']",
        "button.se-toolbar-button-fontcolor",
        ".se-toolbar button[data-name='fontColor']",
    ]
    try:
        _click_toolbar_button(driver, sels)
        random_delay(0.3, 0.5)
        # 컬러피커 HEX 입력
        hex_input = driver.find_element(
            By.CSS_SELECTOR, ".se-palette .se-palette-hex-input, "
                             ".se-color-picker input[type='text'], "
                             ".se-palette input.se-input-text"
        )
        hex_input.clear()
        hex_input.send_keys(hex_color.lstrip("#"))
        random_delay(0.1, 0.2)
        # 적용 버튼
        _click_toolbar_button(driver, [
            ".se-palette .se-palette-confirm",
            ".se-color-picker .se-confirm-button",
            ".se-palette button.se-button-confirm",
        ])
        random_delay(0.2, 0.3)
    except Exception as e:
        logger.warning(f"글자색 변경 실패({hex_color}): {e}")


def _set_bg_color(driver, hex_color: str):
    """배경색 변경 (SE ONE 컬러피커)"""
    sels = [
        "button[data-command='backgroundColor']",
        "button.se-toolbar-button-bgcolor",
        ".se-toolbar button[data-name='backgroundColor']",
    ]
    try:
        _click_toolbar_button(driver, sels)
        random_delay(0.3, 0.5)
        hex_input = driver.find_element(
            By.CSS_SELECTOR, ".se-palette .se-palette-hex-input, "
                             ".se-color-picker input[type='text'], "
                             ".se-palette input.se-input-text"
        )
        hex_input.clear()
        hex_input.send_keys(hex_color.lstrip("#"))
        random_delay(0.1, 0.2)
        _click_toolbar_button(driver, [
            ".se-palette .se-palette-confirm",
            ".se-color-picker .se-confirm-button",
            ".se-palette button.se-button-confirm",
        ])
        random_delay(0.2, 0.3)
    except Exception as e:
        logger.warning(f"배경색 변경 실패({hex_color}): {e}")


def _set_font_family(driver, font_name: str = "나눔스퀘어네오"):
    """폰트 변경"""
    sels = [
        "button[data-command='fontFamily']",
        ".se-toolbar .se-font-family-button",
        "button.se-toolbar-button-font",
    ]
    try:
        _click_toolbar_button(driver, sels)
        random_delay(0.3, 0.5)
        # 폰트 목록에서 선택
        font_item = driver.find_element(
            By.XPATH,
            f"//li[contains(@class,'se-font-family-item')]//button[contains(text(),'{font_name}')]"
            f" | //div[contains(@class,'se-font-family')]//button[contains(text(),'{font_name}')]"
        )
        font_item.click()
        random_delay(0.2, 0.4)
        logger.info(f"폰트 변경: {font_name}")
    except Exception as e:
        logger.warning(f"폰트 변경 실패({font_name}): {e}")


def _set_font_size(driver, size: str = "13"):
    """폰트 사이즈 변경"""
    sels = [
        "button[data-command='fontSize']",
        ".se-toolbar .se-font-size-button",
        "button.se-toolbar-button-fontsize",
    ]
    try:
        _click_toolbar_button(driver, sels)
        random_delay(0.3, 0.5)
        size_item = driver.find_element(
            By.XPATH,
            f"//li[contains(@class,'se-font-size-item')]//button[contains(text(),'{size}')]"
            f" | //div[contains(@class,'se-font-size')]//button[@data-value='{size}']"
        )
        size_item.click()
        random_delay(0.2, 0.4)
    except Exception as e:
        logger.warning(f"폰트 사이즈 변경 실패({size}): {e}")


def _set_alignment_center(driver):
    """가운데 정렬"""
    try:
        _click_toolbar_button(driver, [
            "button[data-command='align']",
            ".se-toolbar button[data-name='align']",
        ])
        random_delay(0.2, 0.4)
        _click_toolbar_button(driver, [
            "[data-value='center']",
            "button[data-command='alignCenter']",
            ".se-toolbar button[data-align='center']",
        ])
        random_delay(0.2, 0.4)
    except Exception:
        logger.info("정렬 버튼 없음, 기본 정렬 사용")


def _reset_formatting(driver):
    """서식 초기화 (볼드/밑줄 해제, 색상 기본값)"""
    _set_bold(driver, on=False)
    _set_underline(driver, on=False)
    _set_font_color(driver, "000000")


def _apply_style_for_line(driver, style: str):
    """라인 스타일에 따라 서식 적용 (타이핑 전 호출)"""
    if style == STYLE_HIGHLIGHT_RED:
        # bold + color:#ff0010 + bg:#fff8b2
        _set_bold(driver, on=True)
        _set_font_color(driver, "ff0010")
        _set_bg_color(driver, "fff8b2")
    elif style == STYLE_HIGHLIGHT_PURPLE:
        # bold + color:#740060 + underline
        _set_bold(driver, on=True)
        _set_font_color(driver, "740060")
        _set_underline(driver, on=True)


def _reset_style_after_line(driver, style: str):
    """라인 서식 해제 (타이핑 후 호출)"""
    if style == STYLE_HIGHLIGHT_RED:
        _set_bold(driver, on=False)
        _set_font_color(driver, "000000")
        _set_bg_color(driver, "ffffff")
    elif style == STYLE_HIGHLIGHT_PURPLE:
        _set_bold(driver, on=False)
        _set_font_color(driver, "000000")
        _set_underline(driver, on=False)


# ─── CTA 테이블 삽입 ─────────────────────────────────────

def _insert_cta_table(driver, cta_text: str, cta_link: str = ""):
    """CTA 테이블 삽입 (1×1, 노란배경, 24px 볼드)"""
    try:
        # 테이블 삽입 버튼
        _click_toolbar_button(driver, [
            "button[data-command='table']",
            ".se-toolbar button[data-name='table']",
            "button.se-toolbar-button-table",
        ])
        random_delay(0.5, 1.0)

        # 1×1 셀 선택 (첫 번째 셀 클릭)
        try:
            cell = driver.find_element(
                By.CSS_SELECTOR, ".se-table-size-picker td:first-child, "
                                 ".se-table-picker .se-table-cell:first-child"
            )
            cell.click()
            random_delay(0.5, 1.0)
        except NoSuchElementException:
            # 직접 크기 입력 시도
            pass

        # 삽입 확인
        _click_toolbar_button(driver, [
            ".se-table-size-confirm",
            ".se-popup-button-confirm",
        ])
        random_delay(0.5, 1.0)

        # 테이블 셀에 서식 적용
        # 셀 배경색: 노란색
        _set_bg_color(driver, "fff8b2")
        # 폰트 사이즈 24px
        _set_font_size(driver, "24")
        # 볼드
        _set_bold(driver, on=True)
        # 가운데 정렬
        _set_alignment_center(driver)

        # CTA 텍스트 타이핑
        actions = ActionChains(driver)
        human_type(driver.switch_to.active_element, cta_text)
        random_delay(0.3, 0.5)

        # 링크 적용
        if cta_link:
            # 텍스트 전체 선택
            ActionChains(driver).key_down(Keys.CONTROL).send_keys("a").key_up(Keys.CONTROL).perform()
            random_delay(0.2, 0.3)
            # 링크 버튼
            _click_toolbar_button(driver, [
                "button[data-command='link']",
                ".se-toolbar button[data-name='link']",
                "button.se-toolbar-button-link",
            ])
            random_delay(0.5, 0.8)
            # URL 입력
            try:
                link_input = driver.find_element(
                    By.CSS_SELECTOR, ".se-link-input input, "
                                     ".se-popup-link input[type='text']"
                )
                link_input.clear()
                link_input.send_keys(cta_link)
                random_delay(0.2, 0.3)
                _click_toolbar_button(driver, [
                    ".se-link-confirm",
                    ".se-popup-button-confirm",
                ])
            except Exception as e:
                logger.warning(f"CTA 링크 적용 실패: {e}")

        # 서식 초기화
        _set_bold(driver, on=False)
        random_delay(0.3, 0.5)

        # 테이블 밖으로 나가기 (아래로 이동)
        ActionChains(driver).send_keys(Keys.ESCAPE).perform()
        random_delay(0.2, 0.3)
        ActionChains(driver).send_keys(Keys.ARROW_DOWN).perform()
        random_delay(0.2, 0.3)

        logger.info(f"CTA 테이블 삽입 완료: {cta_text}")

    except Exception as e:
        # 테이블 실패 시 폴백: 일반 텍스트로 CTA 작성
        logger.warning(f"CTA 테이블 삽입 실패, 텍스트 폴백: {e}")
        active = driver.switch_to.active_element
        active.send_keys(Keys.ENTER)
        _set_bold(driver, on=True)
        _set_font_size(driver, "24")
        human_type(active, cta_text)
        _set_bold(driver, on=False)
        active.send_keys(Keys.ENTER)


# ─── 스티커 삽입 ─────────────────────────────────────────

def _insert_sticker(driver, pack: str, seq: str):
    """SE ONE 스티커 삽입"""
    try:
        _click_toolbar_button(driver, [
            "button[data-command='sticker']",
            ".se-toolbar button[data-name='sticker']",
            "button.se-toolbar-button-sticker",
        ])
        random_delay(0.8, 1.5)

        # 스티커 팩 선택
        try:
            pack_tab = driver.find_element(
                By.CSS_SELECTOR, f"[data-pack-id='{pack}'], "
                                  f"[data-id='{pack}']"
            )
            pack_tab.click()
            random_delay(0.5, 0.8)
        except NoSuchElementException:
            pass  # 기본 팩이 이미 선택

        # 스티커 선택
        sticker_el = driver.find_element(
            By.CSS_SELECTOR, f"[data-seq='{seq}'], "
                              f"[data-sticker-id='{seq}']"
        )
        sticker_el.click()
        random_delay(0.5, 1.0)
        logger.info(f"스티커 삽입: {pack}/{seq}")

    except Exception as e:
        logger.warning(f"스티커 삽입 실패({pack}/{seq}): {e}")


# ─── 이미지 삽입 ─────────────────────────────────────────

def _insert_image(driver, image_path: str):
    """이미지 파일 삽입"""
    try:
        _click_toolbar_button(driver, [
            "button[data-command='image']",
            ".se-toolbar button[data-name='image']",
            "button.se-toolbar-button-image",
        ])
        random_delay(1, 2)

        file_input = driver.find_element(By.CSS_SELECTOR, "input[type='file']")
        file_input.send_keys(image_path)
        random_delay(3, 5)
        logger.info(f"이미지 삽입 완료: {image_path}")
    except Exception as e:
        logger.warning(f"이미지 삽입 실패: {e}")


# ─── 글 작성 (구조화된 콘텐츠) ────────────────────────────

def write_post(
    driver: webdriver.Chrome,
    title: str,
    content: str = "",
    image_path: Optional[str] = None,
    structured_content: Optional[dict] = None
) -> Optional[str]:
    """
    SE ONE 에디터에서 글 작성 후 발행

    structured_content가 있으면 서식 적용, 없으면 content를 plain text로 입력

    Args:
        title: 글 제목
        content: 단순 텍스트 본문 (폴백용)
        image_path: 이미지 파일 경로
        structured_content: content_generator에서 생성한 구조화된 콘텐츠

    Returns: 발행된 글 URL 또는 None
    """
    try:
        wait = WebDriverWait(driver, 15)

        # ── 제목 입력 ──
        title_area = wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, ".se-ff-system.se-fs28.se-placeholder.__se_title, "
                               ".se-title-text .se-text-paragraph")
        ))
        title_area.click()
        random_delay(0.3, 0.6)
        human_type(title_area, title)
        random_delay(0.5, 1.0)

        # ── 본문 영역 진입 ──
        body_area = wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, ".se-component-content .se-text-paragraph")
        ))
        body_area.click()
        random_delay(0.3, 0.6)

        if structured_content and structured_content.get("sections"):
            # ── 구조화된 콘텐츠로 서식 적용 ──
            _write_structured_body(driver, body_area, structured_content, image_path)
        else:
            # ── 폴백: 단순 텍스트 입력 ──
            _write_plain_body(driver, body_area, content, image_path)

        # ── 등록 버튼 클릭 ──
        random_delay(1, 2)
        submit_btn = wait.until(EC.element_to_be_clickable(
            (By.CSS_SELECTOR, ".BaseButton.BaseButton--skinGreen.BaseButton--sizeM")
        ))
        submit_btn.click()
        random_delay(3, 5)

        # ── 발행 확인 ──
        current_url = driver.current_url
        if "articles" in current_url or "ArticleRead" in current_url:
            logger.info(f"글 발행 성공: {current_url}")
            return current_url

        # 확인 다이얼로그 처리
        try:
            confirm_btn = driver.find_element(
                By.CSS_SELECTOR, ".BaseButton.BaseButton--skinGreen"
            )
            confirm_btn.click()
            random_delay(3, 5)
            current_url = driver.current_url
            if "articles" in current_url:
                return current_url
        except NoSuchElementException:
            pass

        logger.warning(f"발행 후 URL 확인 실패: {current_url}")
        return None

    except TimeoutException as e:
        logger.error(f"글 작성 타임아웃: {e}")
        # 디버깅: 현재 페이지 URL과 스크린샷 저장
        try:
            logger.error(f"타임아웃 시 URL: {driver.current_url}")
            screenshot_path = f"debug_timeout_{int(time.time())}.png"
            driver.save_screenshot(screenshot_path)
            logger.error(f"디버그 스크린샷 저장: {screenshot_path}")
        except Exception:
            pass
        return None
    except Exception as e:
        logger.error(f"글 작성 중 오류: {e}")
        return None


def _write_structured_body(driver, body_area, structured_content: dict, image_path: Optional[str]):
    """구조화된 콘텐츠로 SE ONE 에디터 본문 작성 (서식 적용)"""

    # 가운데 정렬
    _set_alignment_center(driver)

    for section in structured_content["sections"]:
        s_type = section["type"]

        if s_type == "text":
            # 폰트 설정
            font = section.get("font", "")
            if font:
                _set_font_family(driver, _font_display_name(font))

            for line in section["lines"]:
                style = line["style"]
                text = line["text"]

                if style == STYLE_EMPTY:
                    body_area.send_keys(Keys.ENTER)
                    random_delay(0.2, 0.4)
                    continue

                # 강조 스타일 적용 (타이핑 전)
                if style in (STYLE_HIGHLIGHT_RED, STYLE_HIGHLIGHT_PURPLE):
                    _apply_style_for_line(driver, style)

                # 텍스트 타이핑
                active = driver.switch_to.active_element
                human_type(active, text)
                random_delay(0.1, 0.3)

                # 강조 스타일 해제 (타이핑 후)
                if style in (STYLE_HIGHLIGHT_RED, STYLE_HIGHLIGHT_PURPLE):
                    _reset_style_after_line(driver, style)

                # 줄바꿈
                active.send_keys(Keys.ENTER)
                random_delay(0.15, 0.35)

        elif s_type == "cta_table":
            _insert_cta_table(driver, section["text"], section.get("link", ""))

        elif s_type == "sticker":
            _insert_sticker(driver, section["pack"], section["seq"])

        elif s_type == "image":
            if image_path:
                _insert_image(driver, image_path)

    random_delay(1, 2)


def _write_plain_body(driver, body_area, content: str, image_path: Optional[str]):
    """단순 텍스트로 본문 작성 (폴백)"""
    # 가운데 정렬
    _set_alignment_center(driver)

    paragraphs = content.split("\n\n")
    for i, paragraph in enumerate(paragraphs):
        if paragraph.strip():
            human_type(body_area, paragraph.strip())
            if i < len(paragraphs) - 1:
                body_area.send_keys(Keys.ENTER)
                body_area.send_keys(Keys.ENTER)
                random_delay(0.3, 0.8)

    random_delay(1, 2)

    if image_path:
        _insert_image(driver, image_path)


def _font_display_name(font_key: str) -> str:
    """폰트 키를 SE ONE 표시명으로 변환"""
    mapping = {
        "nanumsquareneo": "나눔스퀘어네오",
        "nanumgothic": "나눔고딕",
        "nanummyeongjo": "나눔명조",
        "maruburiregular": "마루 부리",
    }
    return mapping.get(font_key, font_key)


# ─── 댓글 작성 ─────────────────────────────────────────────

def write_comment(driver: webdriver.Chrome, post_url: str, comment_text: str) -> bool:
    """게시글에 댓글 작성"""
    try:
        driver.get(post_url)
        random_delay(2, 4)

        # iframe 전환
        try:
            driver.switch_to.frame("cafe_main")
            random_delay(1, 2)
        except Exception:
            pass

        wait = WebDriverWait(driver, 10)

        # 댓글 입력 영역 클릭
        comment_area = wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, ".comment_inbox .comment_textarea textarea, "
                              ".CommentWriter .comment_inbox textarea")
        ))
        comment_area.click()
        random_delay(0.5, 1.0)

        # 댓글 입력
        human_type(comment_area, comment_text)
        random_delay(0.5, 1.5)

        # 등록 버튼 클릭
        submit_btn = driver.find_element(
            By.CSS_SELECTOR, ".comment_inbox .btn_register, .CommentWriter .btn_register"
        )
        submit_btn.click()
        random_delay(2, 3)

        logger.info(f"댓글 작성 성공: {comment_text[:20]}...")
        return True

    except Exception as e:
        logger.error(f"댓글 작성 실패: {e}")
        return False


# ─── 통합 발행 프로세스 ────────────────────────────────────

def publish_to_cafe(
    account: dict,
    cafe_url: str,
    menu_id: str,
    title: str,
    content: str = "",
    image_path: Optional[str] = None,
    headless: bool = True,
    on_progress=None,
    structured_content: Optional[dict] = None
) -> dict:
    """
    전체 카페 글 발행 프로세스

    Args:
        structured_content: content_generator.generate_content() 결과.
            있으면 SE ONE 서식 적용, 없으면 content를 plain text로 입력.

    Returns: {"success": bool, "url": str|None, "error": str|None, "cookies": str|None}
    """
    driver = None
    result = {"success": False, "url": None, "error": None, "cookies": None}

    try:
        if on_progress:
            on_progress("driver", "브라우저 시작 중...")
        driver = create_driver(headless=headless)

        # 1. 로그인
        if on_progress:
            on_progress("login", "로그인 시도 중...")

        logged_in = False
        if account.get("cookie_data"):
            logged_in = login_with_cookie(driver, account["cookie_data"])

        if not logged_in:
            logged_in = login_with_credentials(
                driver, account["username"], account["password_enc"]
            )

        if not logged_in:
            result["error"] = "로그인 실패"
            return result

        # 쿠키 저장
        result["cookies"] = get_login_cookies(driver)

        # 2. 카페 글쓰기 페이지 이동
        if on_progress:
            on_progress("navigate", f"카페 이동 중... ({cafe_url})")

        if not navigate_to_write_page(driver, cafe_url, menu_id):
            result["error"] = "글쓰기 페이지 이동 실패"
            return result

        # 3. 글 작성 & 발행
        if on_progress:
            on_progress("writing", "글 작성 중...")

        published_url = write_post(
            driver, title, content, image_path,
            structured_content=structured_content
        )

        if published_url:
            result["success"] = True
            result["url"] = published_url
            if on_progress:
                on_progress("done", f"발행 완료: {published_url}")
        else:
            result["error"] = "글 발행 실패 (URL 확인 불가)"

        return result

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"발행 프로세스 오류: {e}")
        return result

    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


def post_comment(
    account: dict,
    post_url: str,
    comment_text: str,
    headless: bool = True
) -> dict:
    """
    댓글 작성 프로세스
    Returns: {"success": bool, "error": str|None, "cookies": str|None}
    """
    driver = None
    result = {"success": False, "error": None, "cookies": None}

    try:
        driver = create_driver(headless=headless)

        # 로그인
        logged_in = False
        if account.get("cookie_data"):
            logged_in = login_with_cookie(driver, account["cookie_data"])

        if not logged_in:
            logged_in = login_with_credentials(
                driver, account["username"], account["password_enc"]
            )

        if not logged_in:
            result["error"] = "로그인 실패"
            return result

        result["cookies"] = get_login_cookies(driver)

        # 댓글 작성
        success = write_comment(driver, post_url, comment_text)
        if success:
            result["success"] = True
        else:
            result["error"] = "댓글 작성 실패"

        return result

    except Exception as e:
        result["error"] = str(e)
        return result

    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
