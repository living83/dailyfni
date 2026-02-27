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
from content_generator import STYLE_EMPTY

logger = logging.getLogger(__name__)

# ─── 유틸 ──────────────────────────────────────────────────

def random_delay(min_sec: float = 0.5, max_sec: float = 2.0):
    """사람처럼 보이기 위한 랜덤 딜레이"""
    time.sleep(random.uniform(min_sec, max_sec))


def _strip_non_bmp(text: str) -> str:
    """ChromeDriver가 처리할 수 없는 BMP 외 문자(이모지 등)를 제거"""
    return "".join(c for c in text if ord(c) <= 0xFFFF)


def fast_type(driver, text: str):
    """JavaScript insertText로 빠른 텍스트 입력 (현재 포커스된 요소에 입력)"""
    text = _strip_non_bmp(text)
    driver.execute_script(
        "document.execCommand('insertText', false, arguments[0]);",
        text
    )


def human_type(element, text: str, min_delay: float = 0.03, max_delay: float = 0.12):
    """한 글자씩 사람처럼 타이핑 (제목 등 짧은 텍스트용)"""
    text = _strip_non_bmp(text)
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
    /ca-fe/ URL은 숫자 ID만 지원하므로 반드시 숫자 ID가 필요.

    전략:
    1. 카페 페이지 방문 → URL 리다이렉트 감지
    2. 페이지 소스에서 clubId 패턴 추출
    3. JavaScript 동기 XHR로 Naver API 직접 호출
    """
    if cafe_alias.isdigit():
        return cafe_alias

    if cafe_alias in _cafe_id_cache:
        logger.info(f"카페 ID 캐시 히트: {cafe_alias} → {_cafe_id_cache[cafe_alias]}")
        return _cafe_id_cache[cafe_alias]

    logger.info(f"========== 카페 숫자 ID 조회 시작: {cafe_alias} ==========")

    def _cache_and_return(numeric_id: str, method: str) -> str:
        _cafe_id_cache[cafe_alias] = numeric_id
        logger.info(f"카페 숫자 ID 성공 ({method}): {cafe_alias} → {numeric_id}")
        return numeric_id

    try:
        # 방법 0 (최우선): Naver API로 숫자 ID 직접 조회 (페이지 이동 불필요)
        try:
            numeric_id = driver.execute_script("""
                var alias = arguments[0];
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', 'https://apis.naver.com/cafe-web/cafe2/CafeGateInfo.json?cafeUrl=' + alias, false);
                    xhr.send();
                    if (xhr.status === 200) {
                        var data = JSON.parse(xhr.responseText);
                        var id = data?.message?.result?.cafeId || data?.message?.result?.cafe?.id;
                        if (id) return String(id);
                    }
                } catch(e) {}
                try {
                    var xhr2 = new XMLHttpRequest();
                    xhr2.open('GET', 'https://apis.naver.com/cafe-web/cafe-mobile/CafeMobileInfo.json?cafeUrl=' + alias, false);
                    xhr2.send();
                    if (xhr2.status === 200) {
                        var data2 = JSON.parse(xhr2.responseText);
                        var id2 = data2?.message?.result?.cafeId;
                        if (id2) return String(id2);
                    }
                } catch(e2) {}
                return null;
            """, cafe_alias)
            if numeric_id and str(numeric_id).isdigit():
                return _cache_and_return(str(numeric_id), "Naver API")
            else:
                logger.warning(f"Naver API 응답에서 숫자 ID 없음: {numeric_id}")
        except Exception as e:
            logger.warning(f"Naver API 조회 실패: {e}")

        # 카페 메인 페이지 방문
        driver.get(f"https://cafe.naver.com/{cafe_alias}")
        logger.info(f"카페 페이지 방문: https://cafe.naver.com/{cafe_alias}")

        # 페이지 로드 대기
        try:
            WebDriverWait(driver, 10).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
        except TimeoutException:
            logger.warning("페이지 로드 타임아웃")
        random_delay(2, 3)

        logger.info(f"현재 URL: {driver.current_url}")

        # 방법 1: URL에서 /cafes/숫자ID 추출
        match = re.search(r'/cafes/(\d+)', driver.current_url)
        if match:
            return _cache_and_return(match.group(1), "URL 리다이렉트")

        # 방법 2: 페이지 소스에서 추출
        page_source = driver.page_source
        logger.info(f"페이지 소스 길이: {len(page_source)}")
        for pattern in [
            r'"clubId"\s*:\s*(\d+)',
            r'"cafeId"\s*:\s*(\d+)',
            r"'clubId'\s*:\s*(\d+)",
            r'clubid[=:]\s*["\']?(\d+)',
            r'/cafes/(\d+)',
            r'cafeId=(\d+)',
            r'club_id["\s:=]+(\d+)',
        ]:
            match = re.search(pattern, page_source, re.IGNORECASE)
            if match:
                return _cache_and_return(match.group(1), f"소스 패턴 {pattern}")

        # 방법 3: JavaScript로 다양한 방법 시도
        try:
            numeric_id = driver.execute_script("""
                try {
                    // __NEXT_DATA__ 에서 추출
                    if (window.__NEXT_DATA__) {
                        var pp = window.__NEXT_DATA__.props?.pageProps;
                        if (pp?.cafeId) return String(pp.cafeId);
                        if (pp?.cafe?.id) return String(pp.cafe.id);
                        if (pp?.clubId) return String(pp.clubId);
                        // __NEXT_DATA__ 전체에서 검색
                        var txt = JSON.stringify(window.__NEXT_DATA__);
                        var m = txt.match(/"(?:cafeId|clubId)"\\s*:\\s*(\\d+)/);
                        if (m) return m[1];
                    }
                    // URL에서 추출
                    var m2 = window.location.href.match(/\\/cafes\\/(\\d+)/);
                    if (m2) return m2[1];
                    // 페이지 내 링크에서 추출
                    var links = document.querySelectorAll('a[href*="/cafes/"]');
                    for (var i = 0; i < links.length; i++) {
                        var m3 = links[i].href.match(/\\/cafes\\/(\\d+)/);
                        if (m3) return m3[1];
                    }
                    return null;
                } catch(e) { return null; }
            """)
            if numeric_id:
                return _cache_and_return(str(numeric_id), "JS DOM")
        except Exception as e:
            logger.warning(f"JS DOM 추출 실패: {e}")

        # 방법 4: 동기 XHR로 Naver 내부 API 호출 (브라우저 쿠키 자동 포함)
        try:
            numeric_id = driver.execute_script("""
                var alias = arguments[0];
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', 'https://cafe.naver.com/' + alias, false);
                    xhr.send();
                    if (xhr.status === 200) {
                        var patterns = [
                            /"clubId"\\s*:\\s*(\\d+)/,
                            /"cafeId"\\s*:\\s*(\\d+)/,
                            /clubid[=:]\\s*(\\d+)/i,
                            /\\/cafes\\/(\\d+)/
                        ];
                        for (var i = 0; i < patterns.length; i++) {
                            var m = xhr.responseText.match(patterns[i]);
                            if (m) return m[1];
                        }
                    }
                } catch(e) {}
                // API 2차 시도
                try {
                    var xhr2 = new XMLHttpRequest();
                    xhr2.open('GET', 'https://cafe.naver.com/CafeProfileView.nhn?cluburl=' + alias, false);
                    xhr2.send();
                    if (xhr2.status === 200) {
                        var m2 = xhr2.responseText.match(/clubid[=:"\\s]+(\\d+)/i);
                        if (m2) return m2[1];
                    }
                } catch(e2) {}
                return null;
            """, cafe_alias)
            if numeric_id:
                return _cache_and_return(str(numeric_id), "XHR API")
        except Exception as e:
            logger.warning(f"XHR API 추출 실패: {e}")

        logger.error(f"========== 숫자 카페 ID 추출 실패: {cafe_alias} ==========")
        logger.error(f"최종 URL: {driver.current_url}")
        logger.error(f"페이지 제목: {driver.title}")
        # 디버그: 페이지 소스 일부 로깅
        try:
            if len(page_source) > 500:
                logger.error(f"소스 앞부분: {page_source[:500]}")
        except Exception:
            pass
        # 절대 alias를 반환하지 않음 — 빈 문자열 반환하여 isdigit 체크에서 걸리게 함
        return ""

    except Exception as e:
        logger.error(f"카페 ID 조회 중 예외: {e}")
        return ""


def navigate_to_write_page(driver: webdriver.Chrome, cafe_url: str, menu_id: str) -> bool:
    """카페 글쓰기 페이지로 이동"""
    try:
        cafe_alias = _extract_cafe_id(cafe_url)
        cafe_id = _resolve_numeric_cafe_id(driver, cafe_alias)

        if not cafe_id.isdigit():
            logger.error(f"카페 숫자 ID 변환 실패! alias={cafe_alias}, 반환값={cafe_id}")
            logger.error("숫자 ID 없이는 /ca-fe/ URL 접근 불가")
            return False

        if menu_id:
            write_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_id}/articles/write?boardType=L&menuId={menu_id}"
        else:
            write_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_id}/articles/write?boardType=L"
        logger.info(f"글쓰기 URL: {write_url}")
        driver.get(write_url)

        # 페이지 로드 + JS 리다이렉트 대기 (충분히 기다려야 JS 리다이렉트 감지 가능)
        try:
            WebDriverWait(driver, 10).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
        except TimeoutException:
            logger.warning("글쓰기 페이지 로드 타임아웃")
        random_delay(2, 3)

        # 글쓰기 페이지 도달 확인 (JS 리다이렉트 후 URL 재검증)
        current_url = driver.current_url
        logger.info(f"글쓰기 페이지 이동 후 URL: {current_url}")

        if "articles/write" in current_url or "ArticleWrite" in current_url:
            logger.info(f"글쓰기 페이지 이동 성공: url={current_url}")
        elif "cafe.naver.com" not in current_url:
            # 네이버 메인이나 다른 페이지로 리다이렉트됨
            logger.error(f"글쓰기 페이지에서 이탈! 현재 URL: {current_url}")
            logger.error(f"cafe_id={cafe_id} 가 유효하지 않거나 세션 만료")
            # 캐시 무효화
            if cafe_alias in _cafe_id_cache:
                del _cafe_id_cache[cafe_alias]
            return False
        else:
            logger.warning(f"예상과 다른 URL로 이동됨: {current_url}")

        try:
            driver.switch_to.frame("cafe_main")
            random_delay(1, 2)
        except Exception:
            pass

        logger.info(f"글쓰기 페이지 이동 완료: cafe={cafe_id}, menuId={menu_id}")
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


# ─── 에디터 포커스 복원 ───────────────────────────────────

def _restore_editor_focus(driver):
    """CTA/스티커/이미지 삽입 후 에디터 본문에 포커스 복원"""
    try:
        # SE ONE 에디터 본문의 contenteditable 영역 클릭
        restored = driver.execute_script("""
            // 1차: se-component-content 내부의 text-paragraph
            var p = document.querySelector('.se-component-content .se-text-paragraph');
            if (p) { p.click(); return 'se-text-paragraph'; }
            // 2차: contenteditable 영역
            var ce = document.querySelector('.se-component-content [contenteditable="true"]');
            if (ce) { ce.click(); return 'contenteditable'; }
            // 3차: 에디터 본문 영역
            var body = document.querySelector('.se-content, .se-section-text');
            if (body) { body.click(); return 'se-content'; }
            return null;
        """)
        if restored:
            random_delay(0.2, 0.3)
            # 포커스 복원 후 커서를 본문 끝으로 이동
            driver.execute_script("""
                var sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    var range = sel.getRangeAt(0);
                    range.collapse(false);
                }
            """)
            logger.info(f"에디터 포커스 복원: {restored}")
        else:
            logger.warning("에디터 포커스 복원 실패: 본문 영역 못 찾음")
    except Exception as e:
        logger.warning(f"에디터 포커스 복원 오류: {e}")


# ─── CTA 테이블 삽입 ─────────────────────────────────────

def _insert_cta_table(driver, cta_text: str, cta_link: str = ""):
    """CTA 테이블 삽입 (기본 셋팅, 서식 없음)"""
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

        # CTA 텍스트 입력
        fast_type(driver, cta_text)
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
        fast_type(driver, cta_text)
        active = driver.switch_to.active_element
        active.send_keys(Keys.ENTER)


# ─── 스티커 삽입 ─────────────────────────────────────────

def _insert_sticker(driver, pack: str, seq: str):
    """SE ONE 스티커 삽입"""
    try:
        _click_toolbar_button(driver, [
            "button[data-command='sticker']",
            ".se-toolbar button[data-name='sticker']",
            "button.se-toolbar-button-sticker",
            "button.se-sticker-toolbar-button",
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
    finally:
        # 스티커 팝업 강제 닫기: JS로 selected 클래스 제거 + 팝업 요소 숨김
        try:
            driver.execute_script("""
                // 스티커 버튼 selected 해제 후 클릭
                var btn = document.querySelector('button.se-sticker-toolbar-button.se-is-selected');
                if (btn) { btn.click(); }
                // 스티커 팝업 패널 숨기기
                // se-layer는 에디터 콘텐츠 레이어와 충돌 가능하므로 제외
                var panels = document.querySelectorAll('.se-sticker-panel, .se-popup-sticker');
                panels.forEach(function(p) { p.style.display = 'none'; });
            """)
            random_delay(0.3, 0.5)
        except Exception:
            pass
        # 에디터 본문 클릭으로 포커스 복원
        try:
            body = driver.find_element(By.CSS_SELECTOR, "[contenteditable='true']")
            body.click()
            random_delay(0.2, 0.3)
        except Exception:
            pass


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


# ─── 에디터 진단 & 게시판 선택 ─────────────────────────────

def _log_editor_diagnostics(driver):
    """에디터 요소 찾기 실패 시 진단 정보 로깅"""
    try:
        logger.error(f"[진단] 현재 URL: {driver.current_url}")
        logger.error(f"[진단] 페이지 제목: {driver.title}")

        # iframe 목록
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        logger.error(f"[진단] iframe 수: {len(iframes)}")
        for i, iframe in enumerate(iframes):
            fid = iframe.get_attribute("id") or ""
            fcls = iframe.get_attribute("class") or ""
            fsrc = (iframe.get_attribute("src") or "")[:100]
            logger.error(f"  iframe[{i}]: id={fid}, class={fcls}, src={fsrc}")

        # SE 관련 요소 확인
        se_elements = driver.find_elements(By.CSS_SELECTOR, "[class*='se-']")
        logger.error(f"[진단] 'se-' 클래스 요소 수: {len(se_elements)}")
        seen_classes = set()
        for el in se_elements[:30]:
            cls = el.get_attribute("class") or ""
            tag = el.tag_name
            key = f"{tag}.{cls}"
            if key not in seen_classes:
                seen_classes.add(key)
                logger.error(f"  {key}")

        # contenteditable 요소
        editables = driver.find_elements(By.CSS_SELECTOR, "[contenteditable='true']")
        logger.error(f"[진단] contenteditable 요소 수: {len(editables)}")
        for i, el in enumerate(editables[:5]):
            cls = el.get_attribute("class") or ""
            logger.error(f"  editable[{i}]: {el.tag_name}.{cls}")

        # se-text-paragraph 요소 (제목/본문 핵심 요소)
        paragraphs = driver.find_elements(By.CSS_SELECTOR, ".se-text-paragraph")
        logger.error(f"[진단] .se-text-paragraph 수: {len(paragraphs)}")
        for i, p in enumerate(paragraphs[:5]):
            cls = p.get_attribute("class") or ""
            txt = (p.text or "")[:50]
            parent_cls = ""
            try:
                parent = p.find_element(By.XPATH, "./..")
                parent_cls = parent.get_attribute("class") or ""
            except Exception:
                pass
            logger.error(f"  paragraph[{i}]: class={cls}, parent_class={parent_cls}, text='{txt}'")

        # placeholder 속성 가진 요소
        ph_els = driver.find_elements(By.CSS_SELECTOR, "[data-placeholder]")
        logger.error(f"[진단] data-placeholder 요소 수: {len(ph_els)}")
        for i, el in enumerate(ph_els[:5]):
            ph = el.get_attribute("data-placeholder") or ""
            cls = el.get_attribute("class") or ""
            logger.error(f"  placeholder[{i}]: '{ph}', tag={el.tag_name}.{cls}")

        # 게시판 선택 상태
        try:
            board_btn = driver.find_element(
                By.CSS_SELECTOR,
                ".board_select, .btn_board, [class*='board'], "
                "[class*='Board'], [class*='select_board']"
            )
            logger.error(f"[진단] 게시판 버튼 텍스트: {board_btn.text}")
        except NoSuchElementException:
            logger.error("[진단] 게시판 버튼 요소 못 찾음")

    except Exception as e:
        logger.error(f"[진단] 진단 정보 수집 실패: {e}")


def _try_switch_to_editor_iframe(driver) -> bool:
    """SE ONE 에디터가 iframe 안에 있는 경우 진입 시도"""
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    for iframe in iframes:
        fid = iframe.get_attribute("id") or ""
        fcls = iframe.get_attribute("class") or ""
        fsrc = iframe.get_attribute("src") or ""
        # SE ONE 에디터 관련 iframe 식별
        if any(k in fid.lower() + fcls.lower() + fsrc.lower()
               for k in ["editor", "se_", "se-", "smarteditor", "write"]):
            try:
                driver.switch_to.frame(iframe)
                logger.info(f"에디터 iframe 진입: id={fid}")
                return True
            except Exception:
                continue
    return False


def _find_element_multi_selector(driver, selectors: list, timeout: int = 5):
    """여러 CSS 셀렉터를 순차적으로 시도하여 요소 찾기"""
    for sel in selectors:
        try:
            el = WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, sel))
            )
            logger.info(f"요소 발견: {sel}")
            return el
        except TimeoutException:
            continue
    return None


def _dismiss_popups(driver):
    """네이버 알림/관리 팝업 다이얼로그 닫기 — 콘텐츠 작성 전에 호출"""
    random_delay(0.5, 1.0)
    try:
        dismissed = driver.execute_script("""
            var dismissed = [];
            // '닫기' 버튼 클릭
            var closeBtns = document.querySelectorAll('button.BaseButton--gray, button.BaseButton');
            closeBtns.forEach(function(btn) {
                var txt = (btn.textContent || '').trim();
                if (txt === '닫기' || txt === 'X') {
                    btn.click();
                    dismissed.push(txt);
                }
            });
            // 오버레이/모달 닫기
            var overlays = document.querySelectorAll('.modal_dimmed, .Layer__overlay');
            overlays.forEach(function(o) { o.click(); });
            return dismissed;
        """)
        if dismissed:
            logger.info(f"팝업 다이얼로그 닫기: {dismissed}")
            random_delay(0.5, 1.0)
            # 팝업이 여러 개일 수 있으므로 한 번 더 시도
            try:
                dismissed2 = driver.execute_script("""
                    var dismissed = [];
                    var closeBtns = document.querySelectorAll('button.BaseButton--gray, button.BaseButton');
                    closeBtns.forEach(function(btn) {
                        var txt = (btn.textContent || '').trim();
                        if (txt === '닫기' || txt === 'X') {
                            btn.click();
                            dismissed.push(txt);
                        }
                    });
                    return dismissed;
                """)
                if dismissed2:
                    logger.info(f"팝업 다이얼로그 추가 닫기: {dismissed2}")
                    random_delay(0.3, 0.5)
            except Exception:
                pass
    except Exception:
        pass


def _ensure_board_selected(driver, target_menu_id=None, board_name=""):
    """게시판이 선택되지 않았으면 드롭다운에서 target_menu_id 또는 board_name으로 게시판 선택"""
    try:
        # 게시판 선택 버튼 찾기 — JS로 '선택' 텍스트 포함 버튼 직접 탐색
        board_btn = driver.execute_script("""
            var btns = document.querySelectorAll('button, a.select_component');
            for (var i = 0; i < btns.length; i++) {
                var txt = (btns[i].textContent || '').trim();
                if (txt.indexOf('게시판') >= 0 && txt.indexOf('선택') >= 0) {
                    return btns[i];
                }
            }
            return null;
        """)

        if not board_btn:
            # CSS 셀렉터 폴백
            board_selectors = [
                "button.select_component",
                ".board_select button",
                "button[class*='Board']",
                "button[class*='board']",
                ".select_area button",
                "a.select_component",
            ]
            for sel in board_selectors:
                try:
                    candidate = driver.find_element(By.CSS_SELECTOR, sel)
                    btn_text = (candidate.text or "").strip()
                    if "선택" in btn_text or "게시판" in btn_text:
                        board_btn = candidate
                        break
                except NoSuchElementException:
                    continue

        if not board_btn:
            logger.info("게시판 선택 버튼 없음 (이미 선택되었거나 UI 다름)")
            return

        btn_text = (board_btn.text or "").strip()
        if "선택" in btn_text:
            logger.warning(f"게시판 미선택 감지: '{btn_text}' — 드롭다운 클릭 시도 (target_menu_id={target_menu_id})")
            try:
                board_btn.click()
            except Exception:
                driver.execute_script("arguments[0].click();", board_btn)
            random_delay(0.5, 1.0)

            # 드롭다운 항목 탐색: 버튼의 부모 컨테이너 기준으로 li 항목 검색
            # (알림 목록 등 관계없는 li를 잡지 않도록 board_btn 기준 스코핑)
            target_id = str(target_menu_id) if target_menu_id else ""

            matched = driver.execute_script("""
                var btn = arguments[0];
                var targetId = arguments[1];
                var targetName = arguments[2];

                // 버튼의 부모를 5단계까지 올라가며 드롭다운 리스트(ul > li) 찾기
                var container = btn.parentElement;
                for (var level = 0; level < 8 && container; level++) {
                    var listItems = container.querySelectorAll('ul li');
                    // 유효한 게시판 항목인지 확인: cc_mynews_item(알림) 제외
                    var boardItems = [];
                    for (var i = 0; i < listItems.length; i++) {
                        var li = listItems[i];
                        var a = li.querySelector('a');
                        // 알림 항목 제외
                        if (a && a.classList.contains('cc_mynews_item')) continue;
                        if (li.classList.contains('unread')) continue;
                        var txt = (li.textContent || '').trim();
                        if (!txt || txt.indexOf('선택') >= 0) continue;
                        boardItems.push(li);
                    }
                    // 최소 2개 이상의 게시판 항목이 있어야 유효한 드롭다운
                    if (boardItems.length >= 2) {
                        // 1차: menuId 매칭
                        if (targetId) {
                            for (var j = 0; j < boardItems.length; j++) {
                                var el = boardItems[j];
                                var a2 = el.querySelector('a');
                                var menuId = el.getAttribute('data-menuid') ||
                                             el.getAttribute('data-menu-id') ||
                                             el.getAttribute('data-id') || '';
                                var href = a2 ? (a2.getAttribute('href') || '') : '';
                                if (a2) {
                                    menuId = menuId || a2.getAttribute('data-menuid') ||
                                             a2.getAttribute('data-menu-id') || '';
                                }
                                if (menuId === targetId ||
                                    href.indexOf('menuId=' + targetId) >= 0 ||
                                    href.indexOf('menuid=' + targetId) >= 0) {
                                    (a2 || el).click();
                                    return {method: 'menuId', text: (el.textContent || '').trim()};
                                }
                            }
                        }
                        // 2차: board_name 텍스트 매칭
                        if (targetName) {
                            for (var k = 0; k < boardItems.length; k++) {
                                var txt2 = (boardItems[k].textContent || '').trim();
                                if (txt2 === targetName || txt2.indexOf(targetName) >= 0) {
                                    var a3 = boardItems[k].querySelector('a');
                                    (a3 || boardItems[k]).click();
                                    return {method: 'name', text: txt2};
                                }
                            }
                        }
                        // 3차: 폴백 — 첫 번째 항목 (전체 제외)
                        for (var m = 0; m < boardItems.length; m++) {
                            var txt3 = (boardItems[m].textContent || '').trim();
                            if (txt3.indexOf('전체') < 0) {
                                var a4 = boardItems[m].querySelector('a');
                                (a4 || boardItems[m]).click();
                                return {method: 'fallback', text: txt3};
                            }
                        }
                    }
                    container = container.parentElement;
                }

                // 부모 탐색 실패 시: 페이지 전체에서 드롭다운 찾기 (열려있는 select_list)
                var globalLists = document.querySelectorAll(
                    'ul.select_list, .layer_select ul, .select_box ul'
                );
                for (var g = 0; g < globalLists.length; g++) {
                    var gItems = globalLists[g].querySelectorAll('li');
                    if (gItems.length < 2) continue;
                    // 알림 항목 제외
                    var hasNews = globalLists[g].querySelector('.cc_mynews_item');
                    if (hasNews) continue;
                    if (targetName) {
                        for (var n = 0; n < gItems.length; n++) {
                            var gt = (gItems[n].textContent || '').trim();
                            if (gt === targetName || gt.indexOf(targetName) >= 0) {
                                var ga = gItems[n].querySelector('a');
                                (ga || gItems[n]).click();
                                return {method: 'global_name', text: gt};
                            }
                        }
                    }
                    // 폴백
                    for (var p = 0; p < gItems.length; p++) {
                        var ft = (gItems[p].textContent || '').trim();
                        if (ft && ft.indexOf('전체') < 0 && ft.indexOf('선택') < 0) {
                            var fa = gItems[p].querySelector('a');
                            (fa || gItems[p]).click();
                            return {method: 'global_fallback', text: ft};
                        }
                    }
                }
                return null;
            """, board_btn, target_id, board_name)

            if matched:
                logger.info(f"게시판 선택 완료 ({matched['method']}): '{matched['text']}'")
                random_delay(0.5, 1.0)
                return

            logger.warning("게시판 드롭다운 항목을 찾을 수 없음")
        else:
            logger.info(f"게시판 이미 선택됨: '{btn_text}'")

    except Exception as e:
        logger.warning(f"게시판 선택 확인 중 오류: {e}")


# ─── 에디터 요소 탐색 ───────────────────────────────────

def _find_title_element(driver):
    """SE ONE 에디터에서 제목 입력 영역 찾기 (다중 전략)"""

    # 전략 1: CSS 셀렉터 (textarea 최우선 + SE ONE 클래스)
    title_selectors = [
        "textarea.textarea_input",                          # 네이버 카페 글쓰기 textarea
        ".se-ff-system.se-fs28.se-placeholder.__se_title",
        ".se-title-text .se-text-paragraph",
        ".__se_title",
        ".se-documentTitle .se-text-paragraph",
        ".se-title .se-text-paragraph",
        ".se-section-title .se-text-paragraph",
        "span.se-ff-system.se-fs28",
    ]
    el = _find_element_multi_selector(driver, title_selectors, timeout=3)
    if el:
        return el

    # 전략 2: JavaScript DOM 탐색 (텍스트/속성 기반)
    logger.info("CSS 셀렉터 실패 → JS DOM 탐색 시도")
    try:
        el = driver.execute_script("""
            // 1. se-text-paragraph 중 제목 영역 찾기
            var paragraphs = document.querySelectorAll('.se-text-paragraph');
            for (var p of paragraphs) {
                var parent = p.closest('.se-section-title, .se-title-text, .se-documentTitle');
                if (parent) return p;
            }

            // 2. __se_title 클래스 포함 요소
            var titleEl = document.querySelector('[class*="__se_title"]');
            if (titleEl) return titleEl;

            // 3. placeholder에 "제목" 포함 요소
            var allEls = document.querySelectorAll('[data-placeholder], [placeholder]');
            for (var el of allEls) {
                var ph = (el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || '');
                if (ph.includes('제목')) return el;
            }

            // 4. "제목을 입력" 텍스트를 포함하는 se-text-paragraph
            for (var p of paragraphs) {
                if (p.textContent.includes('제목을 입력') || p.textContent.includes('제목')) {
                    return p;
                }
            }

            // 5. 첫 번째 se-text-paragraph (보통 제목)
            if (paragraphs.length > 0) return paragraphs[0];

            return null;
        """)
        if el:
            logger.info(f"JS DOM 탐색으로 제목 발견: tag={el.tag_name}, class={el.get_attribute('class')}")
            return el
    except Exception as e:
        logger.warning(f"JS DOM 탐색 실패: {e}")

    # 전략 3: contenteditable div 직접 클릭 (최종 폴백)
    logger.warning("JS DOM 탐색도 실패 → contenteditable 직접 사용")
    try:
        editor_div = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div[contenteditable='true']"))
        )
        logger.info("contenteditable div를 제목 영역으로 사용 (커서는 상단=제목에 위치)")
        return editor_div
    except TimeoutException:
        pass

    return None


def _find_body_element(driver, title_area):
    """SE ONE 에디터에서 본문 입력 영역 찾기 (다중 전략)"""

    # 전략 1: CSS 셀렉터
    body_selectors = [
        ".se-component-content .se-text-paragraph",
        ".se-main-container .se-text-paragraph",
        ".se-section-content .se-text-paragraph",
        ".se-component .se-text-paragraph",
        ".se-section-text .se-text-paragraph",
    ]
    el = _find_element_multi_selector(driver, body_selectors, timeout=3)
    if el:
        return el

    # 전략 2: JavaScript DOM 탐색
    logger.info("CSS 셀렉터 실패 → JS DOM 탐색으로 본문 찾기")
    try:
        el = driver.execute_script("""
            // 1. se-text-paragraph 중 본문 영역 찾기 (제목이 아닌 것)
            var paragraphs = document.querySelectorAll('.se-text-paragraph');
            for (var p of paragraphs) {
                var parent = p.closest('.se-section-title, .se-title-text, .se-documentTitle');
                if (!parent) {
                    // 제목이 아닌 se-text-paragraph = 본문
                    return p;
                }
            }

            // 2. placeholder에 "내용" 포함 요소
            var allEls = document.querySelectorAll('[data-placeholder], [placeholder]');
            for (var el of allEls) {
                var ph = (el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || '');
                if (ph.includes('내용')) return el;
            }

            // 3. "내용을 입력" 텍스트 포함 요소
            for (var p of paragraphs) {
                if (p.textContent.includes('내용을 입력')) return p;
            }

            // 4. 두 번째 se-text-paragraph (첫 번째=제목, 두 번째=본문)
            if (paragraphs.length > 1) return paragraphs[1];

            return null;
        """)
        if el:
            logger.info(f"JS DOM 탐색으로 본문 발견: tag={el.tag_name}, class={el.get_attribute('class')}")
            return el
    except Exception as e:
        logger.warning(f"JS 본문 탐색 실패: {e}")

    # 전략 3: 제목에서 Tab 키로 본문 이동 (최종 폴백)
    logger.warning("본문 요소 못 찾음 → Tab 키로 본문 이동 시도")
    try:
        title_area.send_keys(Keys.TAB)
        random_delay(0.5, 1.0)
        body = driver.switch_to.active_element
        if body:
            logger.info("Tab 키로 본문 영역 이동 성공")
            return body
    except Exception as e:
        logger.warning(f"Tab 키 본문 이동 실패: {e}")

    return None


# ─── 글 작성 (구조화된 콘텐츠) ────────────────────────────

def write_post(
    driver: webdriver.Chrome,
    title: str,
    content: str = "",
    image_path: Optional[str] = None,
    structured_content: Optional[dict] = None,
    menu_id: Optional[str] = None,
    board_name: str = ""
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
        # ── URL 사전 검증: 글쓰기 페이지가 맞는지 확인 ──
        current_url = driver.current_url
        if "articles/write" not in current_url and "ArticleWrite" not in current_url:
            logger.error(f"글 작성 시작 전 URL이 글쓰기 페이지가 아님: {current_url}")
            return None

        # ── 게시판 선택 확인 ──
        _ensure_board_selected(driver, target_menu_id=menu_id, board_name=board_name)
        random_delay(1, 2)

        # ── 팝업 다이얼로그 닫기 (네이버 알림 등) — 콘텐츠 작성 전에 반드시 닫기 ──
        _dismiss_popups(driver)

        # ── 제목 입력 ──
        title_area = _find_title_element(driver)
        if not title_area:
            logger.error("제목 영역을 찾을 수 없음 — 진단 정보 출력")
            _log_editor_diagnostics(driver)
            return None

        title_area.click()
        random_delay(0.3, 0.6)
        human_type(title_area, title)
        random_delay(0.5, 1.0)

        # ── 본문 영역 진입 ──
        body_area = _find_body_element(driver, title_area)
        if not body_area:
            logger.error("본문 영역을 찾을 수 없음 — 진단 정보 출력")
            _log_editor_diagnostics(driver)
            return None

        # 클릭 후 active element 사용 (p 태그는 직접 send_keys 불가)
        try:
            body_area.click()
        except Exception:
            # element not interactable 시 JS 클릭 폴백
            logger.warning("body_area.click() 실패 → JS 클릭 시도")
            driver.execute_script("arguments[0].click();", body_area)
        random_delay(0.3, 0.6)
        active_body = driver.switch_to.active_element

        if structured_content and structured_content.get("sections"):
            # ── 구조화된 콘텐츠로 서식 적용 ──
            _write_structured_body(driver, active_body, structured_content, image_path)
        else:
            # ── 폴백: 단순 텍스트 입력 ──
            _write_plain_body(driver, active_body, content, image_path)

        # ── 등록 전 팝업 재확인 ──
        _dismiss_popups(driver)

        # ── 등록 버튼 클릭 ──

        # JS로 페이지 내 모든 클릭 가능 요소 진단 로깅
        try:
            btn_info = driver.execute_script("""
                var info = [];
                // button, a, [role=button] 모두 탐색
                var els = document.querySelectorAll('button, a, [role="button"]');
                els.forEach(function(b) {
                    var txt = (b.textContent || '').trim().substring(0, 40);
                    var cls = (b.className || '').substring(0, 100);
                    var tag = b.tagName;
                    if (txt.indexOf('등록') >= 0 || txt.indexOf('발행') >= 0 ||
                        txt.indexOf('게시') >= 0 || txt.indexOf('작성') >= 0 ||
                        cls.indexOf('publish') >= 0 || cls.indexOf('submit') >= 0 ||
                        cls.indexOf('register') >= 0 || cls.indexOf('btn_') >= 0 ||
                        cls.indexOf('BaseButton') >= 0) {
                        info.push(tag + ': ' + txt + ' | class=' + cls);
                    }
                });
                return info;
            """)
            for bi in btn_info:
                logger.info(f"[버튼 진단] {bi}")
        except Exception:
            pass

        submit_btn = None

        # 1단계: 다양한 CSS 셀렉터 시도
        submit_selectors = [
            "button.BaseButton--skinGreen",
            "button.BaseButton--skinRed",
            "button[class*='BaseButton--skin']",
            "button[class*='btn_publish']",
            "button[class*='publish']",
            "a[class*='btn_publish']",
            "a[class*='publish']",
        ]
        for sel in submit_selectors:
            try:
                candidates = driver.find_elements(By.CSS_SELECTOR, sel)
                for btn in candidates:
                    txt = (btn.text or "").strip()
                    if ("등록" in txt or "발행" in txt or "게시" in txt) and "임시" not in txt:
                        submit_btn = btn
                        logger.info(f"등록 버튼 발견 (CSS): {sel}, text={txt}")
                        break
                if submit_btn:
                    break
            except Exception:
                continue

        # 2단계: XPATH로 하위 요소 텍스트까지 검색 (button + a)
        if not submit_btn:
            xpath_patterns = [
                "//button[.//text()[contains(.,'등록')] and not(.//text()[contains(.,'임시')])]",
                "//a[.//text()[contains(.,'등록')] and not(.//text()[contains(.,'임시')])]",
                "//button[.//text()[contains(.,'발행')]]",
                "//*[@role='button'][.//text()[contains(.,'등록')]]",
            ]
            for xp in xpath_patterns:
                try:
                    submit_btn = driver.find_element(By.XPATH, xp)
                    logger.info(f"등록 버튼 발견 (XPATH): {xp}")
                    break
                except NoSuchElementException:
                    continue

        # 3단계: JS로 모든 요소에서 직접 찾기
        if not submit_btn:
            try:
                submit_btn = driver.execute_script("""
                    var els = document.querySelectorAll('button, a, [role="button"]');
                    for (var i = 0; i < els.length; i++) {
                        var txt = (els[i].textContent || '').trim();
                        if ((txt.indexOf('등록') >= 0 || txt.indexOf('발행') >= 0) &&
                            txt.indexOf('임시') < 0 && txt.length < 10) {
                            return els[i];
                        }
                    }
                    return null;
                """)
                if submit_btn:
                    logger.info("등록 버튼 발견 (JS textContent)")
            except Exception:
                pass

        if not submit_btn:
            logger.error("등록 버튼을 찾을 수 없음")
            _log_editor_diagnostics(driver)
            return None

        # 클릭 (JS 폴백 포함)
        try:
            submit_btn.click()
        except Exception:
            driver.execute_script("arguments[0].click();", submit_btn)

        # JS alert 처리 (게시판 미선택 등)
        random_delay(1, 2)
        try:
            alert = driver.switch_to.alert
            alert_text = alert.text
            logger.warning(f"등록 후 alert 발생: '{alert_text}'")
            alert.accept()
            random_delay(0.5, 1.0)
            # 게시판 미선택 alert면 게시판 다시 선택 후 재시도
            if "게시판" in alert_text:
                logger.info("게시판 재선택 후 등록 재시도")
                _ensure_board_selected(driver, target_menu_id=menu_id, board_name=board_name)
                random_delay(1, 2)
                try:
                    submit_btn.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", submit_btn)
                random_delay(1, 2)
                # 두 번째 alert 확인
                try:
                    alert2 = driver.switch_to.alert
                    logger.warning(f"재시도 후 alert: '{alert2.text}'")
                    alert2.accept()
                except Exception:
                    pass
        except Exception:
            pass  # alert 없으면 정상

        random_delay(3, 5)

        # ── 발행 확인 ──
        current_url = driver.current_url
        if "articles" in current_url or "ArticleRead" in current_url:
            logger.info(f"글 발행 성공: {current_url}")
            return current_url

        # 확인 다이얼로그 처리
        try:
            confirm_btn = driver.find_element(
                By.XPATH, "//button[contains(text(),'등록') or contains(text(),'확인')]"
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
        try:
            logger.error(f"타임아웃 시 URL: {driver.current_url}")
            _log_editor_diagnostics(driver)
            screenshot_path = f"debug_timeout_{int(time.time())}.png"
            driver.save_screenshot(screenshot_path)
            logger.error(f"디버그 스크린샷 저장: {screenshot_path}")
        except Exception:
            pass
        return None
    except Exception as e:
        logger.error(f"글 작성 중 오류: {e}")
        try:
            _log_editor_diagnostics(driver)
        except Exception:
            pass
        return None


def _write_structured_body(driver, body_area, structured_content: dict, image_path: Optional[str]):
    """구조화된 콘텐츠로 SE ONE 에디터 본문 작성 (기본 셋팅, 서식 없음)

    body_area: 본문 영역의 활성 요소 (contenteditable div 또는 active element)
    """

    # 에디터 포커스
    try:
        body_area.click()
    except Exception:
        driver.execute_script("arguments[0].click();", body_area)
    random_delay(0.2, 0.3)

    for section in structured_content["sections"]:
        s_type = section["type"]

        if s_type == "text":
            for line in section["lines"]:
                style = line["style"]
                text = line["text"]

                if style == STYLE_EMPTY:
                    active = driver.switch_to.active_element
                    active.send_keys(Keys.ENTER)
                    random_delay(0.2, 0.4)
                    continue

                # 텍스트 입력 (JS insertText로 빠르게)
                fast_type(driver, text)
                random_delay(0.3, 0.8)

                # 줄바꿈
                active = driver.switch_to.active_element
                active.send_keys(Keys.ENTER)
                random_delay(0.15, 0.35)

        elif s_type == "cta_table":
            _insert_cta_table(driver, section["text"], section.get("link", ""))
            # CTA 테이블 삽입 후 에디터 본문 포커스 복원
            _restore_editor_focus(driver)

        elif s_type == "sticker":
            _insert_sticker(driver, section["pack"], section["seq"])
            # 스티커 삽입 후 에디터 본문 포커스 복원
            _restore_editor_focus(driver)

        elif s_type == "image":
            if image_path:
                _insert_image(driver, image_path)
                # 이미지 삽입 후 에디터 본문 포커스 복원
                _restore_editor_focus(driver)

    random_delay(1, 2)


def _write_plain_body(driver, body_area, content: str, image_path: Optional[str]):
    """단순 텍스트로 본문 작성 (폴백, 기본 셋팅)"""
    try:
        body_area.click()
    except Exception:
        pass
    random_delay(0.2, 0.3)

    paragraphs = content.split("\n\n")
    for i, paragraph in enumerate(paragraphs):
        if paragraph.strip():
            fast_type(driver, paragraph.strip())
            random_delay(0.3, 0.8)
            if i < len(paragraphs) - 1:
                active = driver.switch_to.active_element
                active.send_keys(Keys.ENTER)
                active.send_keys(Keys.ENTER)
                random_delay(0.3, 0.8)

    random_delay(1, 2)

    if image_path:
        _insert_image(driver, image_path)


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
    structured_content: Optional[dict] = None,
    board_name: str = ""
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
            structured_content=structured_content,
            menu_id=menu_id,
            board_name=board_name
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
