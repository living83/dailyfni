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
import sys
import time
import random
import logging
import tempfile
import traceback
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

import undetected_chromedriver as uc
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

logger = logging.getLogger("cafe_publisher")
logger.setLevel(logging.DEBUG)

# 파일 핸들러: uvicorn reload 자식 프로세스에서도 확실히 로그 저장
_LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)
_log_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# uvicorn dictConfig가 먼저 핸들러를 추가할 수 있으므로 항상 강제 재설정
logger.handlers.clear()
_sh = logging.StreamHandler(sys.stderr)
_sh.setFormatter(_log_fmt)
logger.addHandler(_sh)
_fh = logging.FileHandler(str(_LOG_DIR / "cafe_publisher.log"), encoding="utf-8")
_fh.setFormatter(_log_fmt)
logger.addHandler(_fh)
logger.propagate = False


def _log(msg: str, level: str = "INFO"):
    """로거 + stderr 직접 출력"""
    getattr(logger, level.lower(), logger.info)(msg)
    sys.stderr.write(f"[cafe_publisher] {msg}\n")
    sys.stderr.flush()


# 스크린샷 저장 디렉토리
_SCREENSHOT_DIR = Path(__file__).resolve().parent.parent / "debug_screenshots"
_SCREENSHOT_DIR.mkdir(exist_ok=True)


def _save_debug_screenshot(driver, prefix: str = "debug"):
    """디버그용 스크린샷 저장"""
    try:
        from datetime import datetime
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = _SCREENSHOT_DIR / f"{prefix}_{ts}.png"
        driver.save_screenshot(str(path))
        _log(f"스크린샷 저장: {path}")
    except Exception as e:
        _log(f"스크린샷 저장 실패: {e}", "WARNING")

# ─── User-Agent 풀 ────────────────────────────────────────

_USER_AGENTS = [
    # Chrome (Windows)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    # Chrome (Mac)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    # Edge (Windows)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
]

# ─── 유틸 ──────────────────────────────────────────────────

def random_delay(min_sec: float = 0.5, max_sec: float = 2.0):
    """사람처럼 보이기 위한 랜덤 딜레이"""
    time.sleep(random.uniform(min_sec, max_sec))


def _strip_non_bmp(text: str) -> str:
    """ChromeDriver가 처리할 수 없는 BMP 외 문자(이모지 등)를 제거"""
    return "".join(c for c in text if ord(c) <= 0xFFFF)


def fast_type(driver, text: str):
    """텍스트 입력 — ActionChains (브라우저 네이티브 키보드 이벤트)

    SE ONE 에디터는 내부 모델을 별도 관리. execCommand, CDP Input.insertText,
    DOM 조작 모두 에디터 모델에 반영 안 됨 (DOM에만 텍스트 추가됨).
    ActionChains.send_keys()는 실제 키보드 이벤트를 보내므로
    에디터가 진짜 타이핑으로 인식하여 모델 업데이트.
    """
    text = _strip_non_bmp(text)

    # ActionChains send_keys (브라우저 네이티브 키보드 이벤트)
    try:
        ActionChains(driver).send_keys(text).perform()
        return
    except Exception as e:
        logger.warning(f"ActionChains send_keys 실패: {e}")

    # 폴백: active element send_keys
    try:
        active = driver.switch_to.active_element
        active.send_keys(text)
        logger.info("fast_type 폴백: active_element send_keys 성공")
    except Exception as e:
        logger.error(f"fast_type 모든 방법 실패: {e}")


def human_type(element, text: str, min_delay: float = 0.03, max_delay: float = 0.12):
    """한 글자씩 사람처럼 타이핑 (제목 등 짧은 텍스트용)"""
    text = _strip_non_bmp(text)
    for char in text:
        element.send_keys(char)
        time.sleep(random.uniform(min_delay, max_delay))


_PROFILE_BASE = Path(__file__).resolve().parent.parent / "data" / "chrome_profiles"


def _parse_proxy_url(proxy_address: str) -> dict:
    """프록시 URL 파싱 → {scheme, host, port, username, password}

    지원 형식:
      http://user:pass@host:port
      host:port:user:pass
      host:port
    """
    result = {"scheme": "http", "host": "", "port": "", "username": "", "password": ""}
    if not proxy_address:
        return result

    addr = proxy_address.strip()

    # http://user:pass@host:port 형식
    if "://" in addr:
        from urllib.parse import urlparse
        parsed = urlparse(addr)
        result["scheme"] = parsed.scheme or "http"
        result["host"] = parsed.hostname or ""
        result["port"] = str(parsed.port) if parsed.port else ""
        result["username"] = parsed.username or ""
        result["password"] = parsed.password or ""
    elif "@" in addr:
        # user:pass@host:port
        cred_part, server_part = addr.rsplit("@", 1)
        parts = server_part.split(":")
        result["host"] = parts[0]
        result["port"] = parts[1] if len(parts) > 1 else ""
        cred_parts = cred_part.split(":", 1)
        result["username"] = cred_parts[0]
        result["password"] = cred_parts[1] if len(cred_parts) > 1 else ""
    else:
        # host:port 또는 host:port:user:pass
        parts = addr.split(":")
        result["host"] = parts[0]
        result["port"] = parts[1] if len(parts) > 1 else ""
        if len(parts) >= 4:
            result["username"] = parts[2]
            result["password"] = parts[3]

    return result


def _create_proxy_auth_extension(proxy: dict) -> str:
    """인증이 필요한 프록시를 위한 Chrome 확장 프로그램 생성 (Manifest V3) → zip 파일 경로 반환"""
    import zipfile

    manifest = """{
        "version": "1.0.0",
        "manifest_version": 3,
        "name": "Proxy Auth",
        "permissions": ["proxy", "webRequest", "webRequestAuthProvider"],
        "host_permissions": ["<all_urls>"],
        "background": {"service_worker": "background.js"},
        "minimum_chrome_version": "108.0.0"
    }"""

    background = """chrome.proxy.settings.set({
    value: {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: "%s",
                host: "%s",
                port: parseInt(%s)
            },
            bypassList: ["localhost"]
        }
    },
    scope: "regular"
});
chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
        callback({
            authCredentials: {
                username: "%s",
                password: "%s"
            }
        });
    },
    {urls: ["<all_urls>"]},
    ["asyncBlocking"]
);""" % (proxy["scheme"], proxy["host"], proxy["port"], proxy["username"], proxy["password"])

    ext_dir = Path(tempfile.mkdtemp(prefix="proxy_ext_"))
    ext_path = ext_dir / "proxy_auth.zip"

    with zipfile.ZipFile(str(ext_path), "w") as zf:
        zf.writestr("manifest.json", manifest)
        zf.writestr("background.js", background)

    return str(ext_path)


def create_driver(headless: bool = True, account_id: int = None, proxy_address: str = None) -> uc.Chrome:
    """Chrome WebDriver 생성 (undetected-chromedriver 기반, 봇 탐지 우회)

    undetected-chromedriver는:
    - ChromeDriver 바이너리 시그니처($cdc_ 등)를 자동 패치
    - navigator.webdriver 자동 마스킹
    - 자동화 탐지 플래그 자동 제거
    """
    ua = random.choice(_USER_AGENTS)
    logger.debug(f"User-Agent: {ua}")

    proxy = _parse_proxy_url(proxy_address) if proxy_address else None
    has_proxy_auth = proxy and proxy["username"] and proxy["password"]

    options = uc.ChromeOptions()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(f"--user-agent={ua}")

    # 프록시 설정
    if proxy and proxy["host"]:
        if has_proxy_auth:
            # 인증 프록시: Chrome 확장으로 처리
            ext_path = _create_proxy_auth_extension(proxy)
            options.add_extension(ext_path)
            logger.info(f"인증 프록시 확장 적용: {proxy['host']}:{proxy['port']} (user={proxy['username']})")
            # 확장 프로그램은 headless와 호환 불가 → headless 강제 비활성화
            if headless:
                headless = False
                options.add_argument("--window-position=-9999,-9999")
                _log("인증 프록시 사용: headless 대신 창 숨김 모드")
        else:
            # 인증 없는 프록시: --proxy-server 플래그
            proxy_server = f"{proxy['scheme']}://{proxy['host']}"
            if proxy["port"]:
                proxy_server += f":{proxy['port']}"
            options.add_argument(f"--proxy-server={proxy_server}")
            logger.info(f"프록시 적용: {proxy_server}")

    # 계정별 독립 user-data-dir (쿠키/캐시/핑거프린트 분리)
    user_data_dir = None
    if account_id is not None:
        profile_dir = _PROFILE_BASE / f"account_{account_id}"
        profile_dir.mkdir(parents=True, exist_ok=True)
        user_data_dir = str(profile_dir)
        logger.debug(f"Chrome 프로파일: {profile_dir}")

    driver = uc.Chrome(
        options=options,
        headless=headless,
        user_data_dir=user_data_dir,
        use_subprocess=True,  # Windows 호환성 향상
    )

    # Chrome/ChromeDriver 버전 로그
    caps = driver.capabilities
    chrome_ver = caps.get("browserVersion", "?")
    driver_ver = caps.get("chrome", {}).get("chromedriverVersion", "?")
    _log(f"[UC] Chrome={chrome_ver}, ChromeDriver={driver_ver}, headless={headless}")

    return driver


# ─── 로그인 ────────────────────────────────────────────────

def _is_logged_in(driver: webdriver.Chrome) -> bool:
    """현재 브라우저가 네이버에 로그인되어 있는지 확인

    네이버 프론트엔드 업데이트로 CSS 해시가 변경될 수 있으므로
    여러 방법으로 로그인 상태를 판별한다.
    """
    try:
        driver.get("https://www.naver.com")
        random_delay(2, 3)

        # 방법 1: 로그인 버튼 존재 여부 (해시 무관 패턴)
        login_selectors = [
            "a[class*='link_login']",           # MyView-module__link_login___XXXX
            "a[href*='nidlogin']",              # 로그인 링크
            ".MyView-module__link_login___HpHMW",  # 기존 셀렉터 (폴백)
        ]
        for sel in login_selectors:
            try:
                driver.find_element(By.CSS_SELECTOR, sel)
                _log(f"미로그인 감지 (셀렉터: {sel})")
                return False  # 로그인 버튼이 보이면 미로그인
            except NoSuchElementException:
                continue

        # 방법 2: 로그인 후에만 나타나는 요소 확인 (양성 확인)
        logged_in_selectors = [
            "a[class*='link_logout']",          # 로그아웃 버튼
            "a[class*='btn_logout']",
            "a[href*='nidlogin.logout']",       # 로그아웃 링크
            ".MyView-module__name",             # 프로필 이름
            "a[class*='link_name']",
        ]
        for sel in logged_in_selectors:
            try:
                driver.find_element(By.CSS_SELECTOR, sel)
                _log(f"로그인 확인 (셀렉터: {sel})")
                return True
            except NoSuchElementException:
                continue

        # 방법 3: JavaScript로 쿠키 기반 확인
        has_nid = driver.execute_script(
            "return document.cookie.indexOf('NID_AUT') !== -1 "
            "|| document.cookie.indexOf('NID_SES') !== -1;"
        )
        if has_nid:
            _log("로그인 확인 (NID 쿠키 존재)")
            return True

        _log("로그인 상태 판별 불가 — 미로그인으로 처리", "WARNING")
        return False
    except Exception as e:
        _log(f"로그인 상태 확인 중 오류: {e}", "ERROR")
        return False


def check_profile_login(driver: webdriver.Chrome) -> bool:
    """user-data-dir 프로파일의 기존 세션으로 로그인 확인"""
    if _is_logged_in(driver):
        logger.info("프로파일 세션 로그인 확인 — 재로그인 불필요")
        return True
    return False


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

        # 로그인 확인: _is_logged_in 내부에서 naver.com 접속 + 대기 수행
        if not _is_logged_in(driver):
            logger.warning("쿠키 로그인 실패: _is_logged_in() 판정 미로그인")
            return False

        # 2차 검증: 카페 서비스 세션 유효성 확인
        try:
            driver.get("https://cafe.naver.com")
            random_delay(1, 2)
            current_url = driver.current_url
            if "nidlogin" in current_url or "nid.naver.com" in current_url:
                logger.warning("쿠키 로그인 실패: 카페 접근 시 로그인 리다이렉트 발생")
                return False
            logger.info("쿠키 로그인 성공 (카페 세션 확인 완료)")
            return True
        except Exception as e2:
            logger.warning(f"쿠키 로그인 2차 검증 중 오류: {e2}")
            # 1차 통과했으므로 일단 성공으로 처리
            logger.info("쿠키 로그인 성공 (1차 확인만)")
            return True
    except Exception as e:
        logger.warning(f"쿠키 로그인 실패: {e}")
        return False


def _find_login_element(driver, selectors: list, description: str, timeout: int = 15):
    """여러 셀렉터를 순서대로 시도하여 로그인 요소를 찾는다."""
    for by, value in selectors:
        try:
            el = WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((by, value))
            )
            _log(f"[credentials] {description} 셀렉터 매칭: ({by}, {value})")
            return el
        except Exception:
            _log(f"[credentials] {description} 셀렉터 실패: ({by}, {value})")
            timeout = 3  # 첫 셀렉터 이후는 짧게
    return None


def login_with_credentials(driver: webdriver.Chrome, username: str, password_enc: str) -> bool:
    """ID/PW로 네이버 로그인 (2FA 대기 포함)"""
    try:
        _log(f"[credentials] 로그인 시도: {username}")
        if not password_enc:
            _log("비밀번호가 설정되지 않았습니다.", "ERROR")
            return False
        try:
            password = decrypt_password(password_enc)
            _log(f"[credentials] 비밀번호 복호화 성공 (길이={len(password)})")
        except Exception as dec_err:
            _log(f"비밀번호 복호화 실패: {type(dec_err).__name__}", "ERROR")
            return False
        driver.get("https://nid.naver.com/nidlogin.login")
        random_delay(2, 3)
        current_url = driver.current_url
        _log(f"[credentials] 로그인 페이지 URL: {current_url}")

        # 로그인 페이지 로드 실패 감지
        if "nid.naver.com" not in current_url:
            _log(f"[credentials] 로그인 페이지 로드 실패 — 리다이렉트됨: {current_url}", "ERROR")
            _save_debug_screenshot(driver, "login_page_redirect")
            return False

        # 디버그: 페이지 로드 직후 스크린샷 + 페이지 정보 로깅
        _save_debug_screenshot(driver, "login_page_loaded")
        try:
            page_title = driver.title
            body_text = driver.find_element(By.TAG_NAME, "body").text[:300]
            _log(f"[credentials] 페이지 title: {page_title}")
            _log(f"[credentials] 페이지 내용 (일부): {body_text}")
            # 페이지에 있는 input 요소 목록 출력
            inputs_info = driver.execute_script(
                "return Array.from(document.querySelectorAll('input')).map(el => "
                "({id: el.id, name: el.name, type: el.type, placeholder: el.placeholder})).slice(0, 10);"
            )
            _log(f"[credentials] 페이지 input 요소: {inputs_info}")
        except Exception as diag_err:
            _log(f"[credentials] 진단 정보 수집 실패: {diag_err}")

        # 아이디 입력 — 다중 셀렉터로 탐색
        id_selectors = [
            (By.ID, "id"),
            (By.CSS_SELECTOR, "input#id"),
            (By.CSS_SELECTOR, "input[name='id']"),
            (By.CSS_SELECTOR, "input[placeholder*='아이디']"),
            (By.CSS_SELECTOR, "input[type='text'][tabindex]"),
        ]
        id_input = _find_login_element(driver, id_selectors, "아이디 필드")
        if not id_input:
            _log("[credentials] 아이디 입력 필드를 찾을 수 없음 — 페이지 구조 변경 가능", "ERROR")
            _save_debug_screenshot(driver, "login_id_field_not_found")
            return False
        id_input.click()
        random_delay(0.2, 0.4)

        # 아이디 값 입력 (JS + 이벤트 발행) — 찾은 요소에 직접 입력
        driver.execute_script(
            "var el = arguments[0];"
            "el.value = arguments[1];"
            "el.dispatchEvent(new Event('input', {bubbles: true}));"
            "el.dispatchEvent(new Event('change', {bubbles: true}));",
            id_input, username
        )
        random_delay(0.3, 0.8)

        # 비밀번호 입력 — 다중 셀렉터로 탐색
        pw_selectors = [
            (By.ID, "pw"),
            (By.CSS_SELECTOR, "input#pw"),
            (By.CSS_SELECTOR, "input[name='pw']"),
            (By.CSS_SELECTOR, "input[placeholder*='비밀번호']"),
            (By.CSS_SELECTOR, "input[type='password']"),
        ]
        pw_input = _find_login_element(driver, pw_selectors, "비밀번호 필드")
        if not pw_input:
            _log("[credentials] 비밀번호 입력 필드를 찾을 수 없음 — 페이지 구조 변경 가능", "ERROR")
            _save_debug_screenshot(driver, "login_pw_field_not_found")
            return False
        pw_input.click()
        random_delay(0.2, 0.4)
        driver.execute_script(
            "var el = arguments[0];"
            "el.value = arguments[1];"
            "el.dispatchEvent(new Event('input', {bubbles: true}));"
            "el.dispatchEvent(new Event('change', {bubbles: true}));",
            pw_input, password
        )
        random_delay(0.5, 1.0)

        # 로그인 버튼 클릭 — 다중 셀렉터
        btn_selectors = [
            (By.ID, "log.login"),
            (By.CSS_SELECTOR, "button#log\\.login"),
            (By.CSS_SELECTOR, "button[type='submit']"),
            (By.CSS_SELECTOR, ".btn_login"),
            (By.CSS_SELECTOR, "button[class*='login']"),
        ]
        login_btn = _find_login_element(driver, btn_selectors, "로그인 버튼")
        if not login_btn:
            _log("[credentials] 로그인 버튼을 찾을 수 없음 — 페이지 구조 변경 가능", "ERROR")
            _save_debug_screenshot(driver, "login_btn_not_found")
            return False
        login_btn.click()
        _log(f"[credentials] 로그인 버튼 클릭 완료, 결과 대기...")

        # 2FA/캡챠 포함 최대 90초 대기 (5초 간격 폴링)
        max_wait = 90
        poll_interval = 5
        elapsed = 0
        logged_in = False

        while elapsed < max_wait:
            time.sleep(poll_interval)
            elapsed += poll_interval
            current_url = driver.current_url
            _log(f"[credentials] {elapsed}초 경과, URL: {current_url}")

            # 로그인 성공: nidlogin/captcha 페이지를 벗어남
            if "nidlogin" not in current_url and "captcha" not in current_url:
                logged_in = True
                break

            # 2FA 페이지 감지 시 로그 출력
            if "2step" in current_url or "deviceConfirm" in current_url or "protect" in current_url:
                if elapsed == poll_interval:  # 첫 감지 시에만
                    logger.info(f"2단계 인증 대기 중... (최대 {max_wait}초): {current_url}")
            elif elapsed >= 15:
                # 15초 경과 후에도 nidlogin이면 실패 가능성 높음
                logger.warning(f"로그인 {elapsed}초 경과, 여전히 로그인 페이지: {current_url}")
                # 다만 2FA는 더 기다려야 하므로 계속 폴링

        if logged_in:
            _log(f"ID/PW 로그인 성공 ({elapsed}초): {username}")
            return True

        current_url = driver.current_url
        page_title = driver.title
        _log(f"로그인 {max_wait}초 대기 후 실패: url={current_url}, title={page_title}", "WARNING")

        # 실패 원인 분류
        if "captcha" in current_url:
            _log("로그인 실패 원인: 캡챠(CAPTCHA) 발생 — 수동 해결 필요", "ERROR")
        elif "2step" in current_url or "deviceConfirm" in current_url:
            _log("로그인 실패 원인: 2단계 인증 미완료 (90초 타임아웃)", "ERROR")
        elif "protect" in current_url:
            _log("로그인 실패 원인: 보호 모드(이상 로그인 감지)", "ERROR")
        elif "nidlogin" in current_url:
            _log("로그인 실패 원인: ID/PW 불일치 또는 입력 미감지", "ERROR")
        else:
            _log(f"로그인 실패 원인: 알 수 없음 (URL={current_url})", "ERROR")

        # 스크린샷 + 페이지 내용 저장
        _save_debug_screenshot(driver, "login_credentials_failed")
        try:
            body_text = driver.find_element(By.TAG_NAME, "body").text[:500]
            _log(f"페이지 내용 (일부): {body_text}", "WARNING")
        except Exception:
            pass
        return False

    except Exception as e:
        _log(f"로그인 중 오류 ({type(e).__name__}): {e}", "ERROR")
        logger.debug(traceback.format_exc())
        return False


def get_login_cookies(driver: webdriver.Chrome) -> str:
    """현재 세션 쿠키를 JSON 문자열로 반환"""
    cookies = driver.get_cookies()
    return json.dumps(cookies, ensure_ascii=False)


def _ensure_cafe_session(driver: webdriver.Chrome) -> bool:
    """
    cafe.naver.com 도메인에 세션을 확립한다.
    nid.naver.com 로그인 후 cafe.naver.com에 바로 접근하면 세션이 동기화되지
    않을 수 있으므로, 명시적으로 카페 메인을 방문하여 세션을 생성한다.
    """
    try:
        _log("[cafe_session] cafe.naver.com 세션 확립 시도...")
        driver.get("https://cafe.naver.com")
        random_delay(2, 3)

        current_url = driver.current_url
        _log(f"[cafe_session] 카페 메인 URL: {current_url}")

        # 로그인 페이지로 리다이렉트되면 세션 미확립
        if "nidlogin" in current_url or "nid.naver.com" in current_url:
            _log("[cafe_session] 카페 접근 시 로그인 리다이렉트 발생 — 세션 미확립", "WARNING")
            return False

        _log("[cafe_session] cafe.naver.com 세션 확립 완료")
        return True
    except Exception as e:
        _log(f"[cafe_session] 세션 확립 중 오류: {e}", "WARNING")
        return False


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
        # 방법 -1 (최최우선): Python HTTP 요청으로 숫자 ID 조회 (브라우저 무관, CORS 무관)
        for api_url in [
            f"https://apis.naver.com/cafe-web/cafe2/CafeGateInfo.json?cafeUrl={cafe_alias}",
            f"https://apis.naver.com/cafe-web/cafe-mobile/CafeMobileInfo.json?cafeUrl={cafe_alias}",
        ]:
            try:
                req = urllib.request.Request(api_url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "https://cafe.naver.com/",
                })
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    cafe_id_val = (
                        data.get("message", {}).get("result", {}).get("cafeId")
                        or data.get("message", {}).get("result", {}).get("cafe", {}).get("id")
                    )
                    if cafe_id_val and str(cafe_id_val).isdigit():
                        return _cache_and_return(str(cafe_id_val), f"Python HTTP ({api_url.split('/')[-1].split('?')[0]})")
                    logger.warning(f"[방법-1] API 응답에 cafeId 없음: {api_url} → {data.get('message', {}).get('result', {})}")
            except (urllib.error.URLError, json.JSONDecodeError, Exception) as e:
                logger.warning(f"[방법-1] Python HTTP 실패: {api_url} → {e}")

        # 방법 0: 브라우저 XHR로 Naver API 직접 조회
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
                return _cache_and_return(str(numeric_id), "Naver API (XHR)")
            else:
                logger.warning(f"[방법0] Naver API 응답에서 숫자 ID 없음: {numeric_id} (현재 페이지: {driver.current_url})")
        except Exception as e:
            logger.warning(f"[방법0] Naver API 조회 실패: {e} (현재 페이지: {driver.current_url})")

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

        current_url = driver.current_url
        logger.info(f"현재 URL: {current_url}")

        # 로그인 페이지로 리다이렉트 감지 — 세션 미확립 상태
        if "nidlogin" in current_url or "nid.naver.com" in current_url:
            logger.error(f"카페 방문 시 로그인 페이지로 리다이렉트됨 — cafe.naver.com 세션 미확립: {current_url}")
            return ""

        # 방법 1: URL에서 /cafes/숫자ID 추출
        match = re.search(r'/cafes/(\d+)', current_url)
        if match:
            return _cache_and_return(match.group(1), "URL 리다이렉트")
        else:
            logger.warning(f"[방법1] URL에서 /cafes/숫자ID 미발견: {current_url}")

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

        logger.warning(f"[방법2] 페이지 소스에서 카페 ID 패턴 미발견 (소스 길이: {len(page_source)})")

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
            else:
                logger.warning("[방법3] JS DOM에서 카페 ID 미발견")
        except Exception as e:
            logger.warning(f"[방법3] JS DOM 추출 실패: {e}")

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
            else:
                logger.warning("[방법4] XHR API에서 카페 ID 미발견")
        except Exception as e:
            logger.warning(f"[방법4] XHR API 추출 실패: {e}")

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
            _log(f"카페 숫자 ID 변환 실패! alias={cafe_alias}, 반환값={cafe_id}", "ERROR")
            return False

        if menu_id:
            write_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_id}/articles/write?boardType=L&menuId={menu_id}"
        else:
            write_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_id}/articles/write?boardType=L"
        _log(f"글쓰기 URL: {write_url}")
        driver.get(write_url)

        # 페이지 로드 + JS 리다이렉트 대기 (충분히 기다려야 JS 리다이렉트 감지 가능)
        try:
            WebDriverWait(driver, 10).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
        except TimeoutException:
            _log("글쓰기 페이지 로드 타임아웃", "WARNING")
        random_delay(2, 3)

        # 글쓰기 페이지 도달 확인 (JS 리다이렉트 후 URL 재검증)
        current_url = driver.current_url
        _log(f"글쓰기 페이지 이동 후 URL: {current_url}")

        if "articles/write" in current_url or "ArticleWrite" in current_url:
            _log(f"글쓰기 페이지 이동 성공")
        elif "nid.naver.com" in current_url:
            # 로그인 페이지로 리다이렉트됨 — 쿠키/세션 만료
            _log(f"로그인 페이지로 리다이렉트됨 — 세션 만료: {current_url}", "ERROR")
            return False
        elif "cafe.naver.com" not in current_url:
            # 네이버 메인이나 다른 페이지로 리다이렉트됨
            _log(f"글쓰기 페이지에서 이탈! 현재 URL: {current_url}", "ERROR")
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
    """CTA/스티커/이미지 삽입 후 에디터 본문에 포커스 복원 (마지막 paragraph로)"""
    try:
        # SE ONE 에디터 본문의 contenteditable 영역 클릭 — 마지막 요소 사용
        restored = driver.execute_script("""
            // 1차: se-component-content 내부의 마지막 text-paragraph
            var ps = document.querySelectorAll('.se-component-content .se-text-paragraph');
            if (ps.length > 0) { var last = ps[ps.length - 1]; last.click(); return 'se-text-paragraph(last/' + ps.length + ')'; }
            // 2차: 마지막 contenteditable 영역
            var ces = document.querySelectorAll('.se-component-content [contenteditable="true"]');
            if (ces.length > 0) { var last = ces[ces.length - 1]; last.click(); return 'contenteditable(last)'; }
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
                var focusNode = sel.focusNode || sel.anchorNode;
                if (focusNode) {
                    var range = document.createRange();
                    range.selectNodeContents(focusNode);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            """)
            logger.info(f"에디터 포커스 복원: {restored}")
        else:
            logger.warning("에디터 포커스 복원 실패: 본문 영역 못 찾음")
    except Exception as e:
        logger.warning(f"에디터 포커스 복원 오류: {e}")


# ─── 하단 링크 (OGLink 카드) 삽입 ─────────────────────────

def _insert_footer_link(driver: webdriver.Chrome, footer_link: str, footer_link_text: str = ""):
    """SE ONE 에디터에 하단 링크를 삽입.

    1차: 툴바 'oglink' 버튼 → URL 입력 → 돋보기(검색) → 확인
    2차 (폴백): 하이퍼링크 텍스트로 삽입 (OGLink 실패 시에도 클릭 가능)
    """
    if not footer_link:
        return

    link_text = footer_link_text or "카카오톡 상담하기"
    _log(f"[footer_link] 링크 삽입 시작: {footer_link} (텍스트: {link_text})")

    try:
        # ── 0단계: 커서를 에디터 본문 맨 끝으로 이동 ──
        ActionChains(driver).key_down(Keys.CONTROL).send_keys(Keys.END).key_up(Keys.CONTROL).perform()
        random_delay(0.3, 0.5)

        # ── 1단계: 에디터 본문 끝에 빈 줄 추가 (분리 효과) ──
        ActionChains(driver).send_keys(Keys.ENTER).send_keys(Keys.ENTER).perform()
        random_delay(0.3, 0.5)

        # ── 2단계: 툴바 'oglink' 버튼 클릭 (hyperlink 아닌 OGLink만) ──
        oglink_btn_selectors = [
            'button[data-name="oglink"]',
            '.se-toolbar button[data-name="oglink"]',
        ]
        link_btn = None
        for sel in oglink_btn_selectors:
            try:
                link_btn = driver.find_element(By.CSS_SELECTOR, sel)
                _log(f"[footer_link] OGLink 버튼 발견: {sel}")
                break
            except NoSuchElementException:
                continue

        # JS 폴백: 툴바 버튼 중 oglink만 탐색 (hyperlink 제외)
        if not link_btn:
            try:
                link_btn = driver.execute_script("""
                    var btns = document.querySelectorAll(
                        '.se-toolbar button, [class*="toolbar"] button'
                    );
                    for (var i = 0; i < btns.length; i++) {
                        var name = (btns[i].dataset.name || '').toLowerCase();
                        if (name === 'oglink') return btns[i];
                    }
                    // aria-label로도 탐색
                    for (var i = 0; i < btns.length; i++) {
                        var label = (btns[i].getAttribute('aria-label') || '');
                        if (label.includes('링크') && !label.includes('하이퍼')) {
                            return btns[i];
                        }
                    }
                    return null;
                """)
                if link_btn:
                    _log("[footer_link] OGLink 버튼 JS 폴백 발견")
            except Exception:
                pass

        # ── OGLink 버튼 발견 시: 팝업 방식 ──
        oglink_success = False
        if link_btn:
            link_btn.click()
            _log("[footer_link] OGLink 버튼 클릭")
            random_delay(1.5, 2.5)

            # ── 3단계: 링크 다이얼로그 URL 입력 ──
            link_input = _find_link_popup_input(driver)

            if not link_input:
                _log("[footer_link] URL 입력 필드 미발견 → ESC 후 하이퍼링크 폴백", "WARNING")
                try:
                    ActionChains(driver).send_keys(Keys.ESCAPE).perform()
                except Exception:
                    pass
                random_delay(0.5, 1)
            else:
                link_input.click()
                link_input.clear()
                random_delay(0.2, 0.3)
                link_input.send_keys(footer_link)
                _log(f"[footer_link] URL 입력 완료: {footer_link}")
                random_delay(0.5, 1)

                # ── 4단계: 돋보기(검색) 버튼 클릭 → OG 미리보기 로드 ──
                _click_search_and_wait(driver, link_input)

                # ── 5단계: 확인 버튼 클릭 후 OGLink 카드 생성 확인 ──
                _click_confirm_button(driver)
                random_delay(1, 2)

                # OGLink 카드가 실제로 생성되었는지 확인
                og_count = driver.execute_script("""
                    return document.querySelectorAll(
                        '.se-oglink, [class*="oglink"], [data-name="oglink"][class*="component"]'
                    ).length;
                """)
                if og_count and og_count > 0:
                    oglink_success = True
                    _log(f"[footer_link] OGLink 삽입 성공: {footer_link}")
                else:
                    _log("[footer_link] OGLink 카드 미생성 (OG 메타데이터 fetch 실패 추정) → 하이퍼링크 폴백", "WARNING")

        if not oglink_success:
            # ── OGLink 실패/미발견 → 하이퍼링크 텍스트 삽입 ──
            _log("[footer_link] 하이퍼링크 텍스트 방식으로 삽입 시도", "WARNING")
            _insert_footer_link_as_hyperlink(driver, footer_link, link_text)

    except Exception as e:
        _log(f"[footer_link] 링크 삽입 실패: {e}", "WARNING")
        try:
            ActionChains(driver).send_keys(Keys.ESCAPE).perform()
        except Exception:
            pass
        # 최후 폴백: 하이퍼링크 시도
        try:
            _insert_footer_link_as_hyperlink(driver, footer_link, link_text)
        except Exception as e2:
            _log(f"[footer_link] 하이퍼링크 폴백도 실패: {e2}", "WARNING")


def _find_link_popup_input(driver):
    """OGLink 팝업에서 URL 입력 필드 탐색"""
    link_input_selectors = [
        'input[placeholder*="URL"]',
        'input[placeholder*="url"]',
        'input[placeholder*="링크"]',
        'input[placeholder*="주소"]',
        '.se-popup-link input',
        '.se-popup input[type="text"]',
        'input[type="url"]',
    ]
    for sel in link_input_selectors:
        try:
            el = driver.find_element(By.CSS_SELECTOR, sel)
            _log(f"[footer_link] URL 입력 필드 발견: {sel}")
            return el
        except NoSuchElementException:
            continue

    # JS 폴백: 팝업 내 input 탐색
    try:
        el = driver.execute_script("""
            var popup = document.querySelector(
                '.se-popup-link, .se-popup, [class*="link_layer"], [class*="popup"]'
            );
            if (popup) {
                var inp = popup.querySelector('input');
                if (inp) return inp;
            }
            var inputs = document.querySelectorAll('input[type="text"], input[type="url"], input:not([type])');
            for (var i = 0; i < inputs.length; i++) {
                var rect = inputs[i].getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) return inputs[i];
            }
            return null;
        """)
        if el:
            _log("[footer_link] URL 입력 JS 폴백 발견")
            return el
    except Exception:
        pass
    return None


def _click_search_and_wait(driver, link_input):
    """OGLink 팝업에서 돋보기 버튼 클릭 + OG 미리보기 대기"""
    search_btn = None
    search_selectors = [
        '.se-popup-link button[class*="search"]',
        '.se-popup-link button[class*="query"]',
        '.se-popup button[class*="search"]',
        'button.se-link-preview-btn',
    ]
    for sel in search_selectors:
        try:
            search_btn = driver.find_element(By.CSS_SELECTOR, sel)
            break
        except NoSuchElementException:
            continue

    if not search_btn:
        try:
            search_btn = driver.execute_script("""
                var popup = document.querySelector(
                    '.se-popup-link, .se-popup, [class*="link_layer"], [class*="popup"]'
                );
                if (!popup) return null;
                var btns = popup.querySelectorAll('button');
                for (var i = 0; i < btns.length; i++) {
                    var text = (btns[i].textContent || '').trim();
                    if (!text.includes('확인') && !text.includes('취소')
                        && btns[i].querySelector('svg, [class*="ico"], [class*="icon"], [class*="search"]')) {
                        return btns[i];
                    }
                }
                for (var i = 0; i < btns.length; i++) {
                    var text = (btns[i].textContent || '').trim();
                    if (!text.includes('확인') && !text.includes('취소') && text.length < 3) {
                        return btns[i];
                    }
                }
                return null;
            """)
        except Exception:
            pass

    if search_btn:
        search_btn.click()
        _log("[footer_link] 돋보기 버튼 클릭 → OG 미리보기 대기")
        random_delay(3, 5)

        try:
            WebDriverWait(driver, 10).until(
                lambda d: d.find_element(By.CSS_SELECTOR,
                    '.se-popup-link [class*="preview"], .se-popup [class*="preview"], '
                    '.se-popup-link [class*="og"], .se-popup [class*="card"], '
                    '.se-popup-link img, .se-popup img'
                )
            )
            _log("[footer_link] OG 미리보기 로드 완료")
        except (TimeoutException, NoSuchElementException):
            _log("[footer_link] OG 미리보기 로드 타임아웃 (계속 진행)", "WARNING")
        random_delay(1, 2)
    else:
        _log("[footer_link] 돋보기 버튼 미발견, Enter로 대체", "WARNING")
        link_input.send_keys(Keys.ENTER)
        random_delay(3, 5)


def _click_confirm_button(driver):
    """OGLink 팝업에서 확인 버튼 클릭"""
    confirm_btn = None
    try:
        confirm_btn = driver.execute_script("""
            var popup = document.querySelector(
                '.se-popup-link, .se-popup, [class*="link_layer"], [class*="popup"]'
            );
            if (!popup) return null;
            var btns = popup.querySelectorAll('button');
            for (var i = 0; i < btns.length; i++) {
                var text = (btns[i].textContent || '').trim();
                if (text === '확인' || text.includes('확인')) return btns[i];
            }
            return null;
        """)
    except Exception:
        pass

    if confirm_btn:
        try:
            confirm_btn.click()
        except Exception:
            driver.execute_script("arguments[0].click();", confirm_btn)
        random_delay(1, 2)
    else:
        _log("[footer_link] 확인 버튼 미발견, Enter로 대체", "WARNING")
        ActionChains(driver).send_keys(Keys.ENTER).perform()
        random_delay(1, 2)


def _insert_footer_link_as_hyperlink(driver, footer_link: str, link_text: str = "카카오톡 상담하기"):
    """하이퍼링크 방식으로 텍스트에 URL을 걸어 삽입.

    OGLink가 실패하는 경우(카카오 등 OG 메타데이터 차단 사이트)에도
    클릭 가능한 링크를 삽입할 수 있음.

    방식: 텍스트 입력 → 전체 선택 → 하이퍼링크 버튼 → URL 입력 → 확인
    """
    _log(f"[footer_link] 하이퍼링크 삽입 시도: {link_text} → {footer_link}")
    try:
        # 커서를 본문 끝으로
        ActionChains(driver).key_down(Keys.CONTROL).send_keys(Keys.END).key_up(Keys.CONTROL).perform()
        random_delay(0.3, 0.5)
        ActionChains(driver).send_keys(Keys.ENTER).perform()
        random_delay(0.3, 0.5)

        # 링크 텍스트 입력
        fast_type(driver, link_text)
        random_delay(0.3, 0.5)

        # 방금 입력한 텍스트만 선택 (Shift+Home)
        ActionChains(driver).key_down(Keys.SHIFT).send_keys(Keys.HOME).key_up(Keys.SHIFT).perform()
        random_delay(0.3, 0.5)

        # 하이퍼링크 버튼 찾기 (Ctrl+K 단축키 또는 toolbar 버튼)
        hyperlink_opened = False

        # 방법 1: Ctrl+K 단축키 (SE ONE 에디터 표준)
        try:
            ActionChains(driver).key_down(Keys.CONTROL).send_keys('k').key_up(Keys.CONTROL).perform()
            random_delay(1, 1.5)
            # 팝업이 열렸는지 확인
            popup_input = _find_hyperlink_popup_input(driver)
            if popup_input:
                hyperlink_opened = True
                _log("[footer_link] Ctrl+K로 하이퍼링크 팝업 열림")
        except Exception:
            pass

        # 방법 2: 툴바 hyperlink 버튼 클릭
        if not hyperlink_opened:
            try:
                hl_btn = driver.execute_script("""
                    var btns = document.querySelectorAll(
                        '.se-toolbar button, [class*="toolbar"] button'
                    );
                    for (var i = 0; i < btns.length; i++) {
                        var name = (btns[i].dataset.name || '').toLowerCase();
                        if (name === 'hyperlink' || name === 'link') return btns[i];
                    }
                    for (var i = 0; i < btns.length; i++) {
                        var label = (btns[i].getAttribute('aria-label') || '');
                        if (label.includes('하이퍼') || label.includes('hyperlink')) {
                            return btns[i];
                        }
                    }
                    return null;
                """)
                if hl_btn:
                    hl_btn.click()
                    _log("[footer_link] 하이퍼링크 버튼 클릭")
                    random_delay(1, 1.5)
                    popup_input = _find_hyperlink_popup_input(driver)
                    if popup_input:
                        hyperlink_opened = True
            except Exception:
                pass

        if hyperlink_opened and popup_input:
            # URL 입력
            popup_input.click()
            popup_input.clear()
            random_delay(0.2, 0.3)
            popup_input.send_keys(footer_link)
            _log(f"[footer_link] 하이퍼링크 URL 입력: {footer_link}")
            random_delay(0.5, 1)

            # 확인 버튼 클릭
            _click_confirm_button(driver)
            _log(f"[footer_link] 하이퍼링크 삽입 완료: '{link_text}' → {footer_link}")
        else:
            # 최후 폴백: URL을 텍스트로라도 남김
            _log("[footer_link] 하이퍼링크 팝업 실패 → URL 텍스트로 삽입", "WARNING")
            # 선택 해제
            ActionChains(driver).send_keys(Keys.END).perform()
            random_delay(0.2, 0.3)
            ActionChains(driver).send_keys(Keys.ENTER).perform()
            fast_type(driver, footer_link)
            random_delay(0.3, 0.5)

    except Exception as e:
        _log(f"[footer_link] 하이퍼링크 삽입 실패: {e}", "WARNING")


def _find_hyperlink_popup_input(driver):
    """하이퍼링크 팝업에서 URL 입력 필드 탐색"""
    selectors = [
        '.se-popup-hyperlink input[type="text"]',
        '.se-popup-hyperlink input',
        '.se-popup input[placeholder*="URL"]',
        '.se-popup input[placeholder*="url"]',
        '.se-popup input[placeholder*="링크"]',
        '.se-popup input[placeholder*="주소"]',
        '.se-popup input[placeholder*="http"]',
    ]
    for sel in selectors:
        try:
            el = driver.find_element(By.CSS_SELECTOR, sel)
            if el.is_displayed():
                _log(f"[footer_link] 하이퍼링크 입력 필드 발견: {sel}")
                return el
        except NoSuchElementException:
            continue

    # JS 폴백
    try:
        el = driver.execute_script("""
            var popups = document.querySelectorAll(
                '.se-popup-hyperlink, .se-popup, [class*="hyperlink"], [class*="link_popup"]'
            );
            for (var p = 0; p < popups.length; p++) {
                var popup = popups[p];
                if (popup.offsetWidth === 0) continue;
                var inp = popup.querySelector('input[type="text"], input[type="url"], input:not([type])');
                if (inp && inp.offsetWidth > 0) return inp;
            }
            return null;
        """)
        if el:
            _log("[footer_link] 하이퍼링크 입력 JS 폴백 발견")
            return el
    except Exception:
        pass
    return None


# ─── CTA 테이블 삽입 ─────────────────────────────────────

def _insert_cta_table(driver, cta_text: str, cta_link: str = ""):
    """CTA 삽입 — 구분선 + CTA 텍스트(하이퍼링크) + 구분선 형태로 강조.

    cta_link가 있으면 CTA 텍스트에 하이퍼링크를 걸어 클릭 가능하게 만든다.
    ActionChains로 실제 키보드 이벤트 전송 (에디터 모델 반영).
    """
    try:
        actions = ActionChains(driver)
        # 빈 줄 + 구분선
        actions.send_keys(Keys.ENTER)
        actions.send_keys('━━━━━━━━━━━━━━━━━━━━')
        actions.send_keys(Keys.ENTER)
        # CTA 텍스트
        cta_display = f'▶ {cta_text} ◀'
        actions.send_keys(cta_display)
        actions.perform()
        random_delay(0.3, 0.5)

        # CTA 텍스트에 하이퍼링크 적용
        if cta_link:
            _apply_hyperlink_to_cta(driver, cta_display, cta_link)

        actions2 = ActionChains(driver)
        actions2.send_keys(Keys.END)  # 선택 해제, 커서 끝으로
        actions2.send_keys(Keys.ENTER)
        # 하단 구분선
        actions2.send_keys('━━━━━━━━━━━━━━━━━━━━')
        actions2.send_keys(Keys.ENTER)
        actions2.perform()
        random_delay(0.3, 0.5)

        logger.info(f"CTA 텍스트 삽입 완료: {cta_text} (링크: {cta_link or '없음'})")

    except Exception as e:
        logger.warning(f"CTA 삽입 실패: {e}")
        try:
            fast_type(driver, f'\n━━━━━━━━━━━━━━━━━━━━\n▶ {cta_text} ◀\n━━━━━━━━━━━━━━━━━━━━\n')
        except Exception:
            pass


def _apply_hyperlink_to_cta(driver, cta_display: str, cta_link: str):
    """CTA 텍스트에 하이퍼링크를 적용 (Shift+Home으로 선택 → Ctrl+K → URL 입력)"""
    try:
        # 방금 입력한 CTA 텍스트 전체 선택 (Shift+Home)
        ActionChains(driver).key_down(Keys.SHIFT).send_keys(Keys.HOME).key_up(Keys.SHIFT).perform()
        random_delay(0.3, 0.5)

        # Ctrl+K로 하이퍼링크 팝업 열기
        hyperlink_opened = False

        # 방법 1: Ctrl+K 단축키
        try:
            ActionChains(driver).key_down(Keys.CONTROL).send_keys('k').key_up(Keys.CONTROL).perform()
            random_delay(1, 1.5)
            popup_input = _find_hyperlink_popup_input(driver)
            if popup_input:
                hyperlink_opened = True
                _log("[CTA] Ctrl+K로 하이퍼링크 팝업 열림")
        except Exception:
            pass

        # 방법 2: 툴바 hyperlink 버튼
        if not hyperlink_opened:
            try:
                hl_btn = driver.execute_script("""
                    var btns = document.querySelectorAll(
                        '.se-toolbar button, [class*="toolbar"] button'
                    );
                    for (var i = 0; i < btns.length; i++) {
                        var name = (btns[i].dataset.name || '').toLowerCase();
                        if (name === 'hyperlink' || name === 'link') return btns[i];
                    }
                    return null;
                """)
                if hl_btn:
                    hl_btn.click()
                    random_delay(1, 1.5)
                    popup_input = _find_hyperlink_popup_input(driver)
                    if popup_input:
                        hyperlink_opened = True
                        _log("[CTA] 툴바 버튼으로 하이퍼링크 팝업 열림")
            except Exception:
                pass

        if hyperlink_opened and popup_input:
            popup_input.click()
            popup_input.clear()
            random_delay(0.2, 0.3)
            popup_input.send_keys(cta_link)
            random_delay(0.5, 1)
            _click_confirm_button(driver)
            _log(f"[CTA] 하이퍼링크 적용 완료: {cta_link}")
        else:
            _log("[CTA] 하이퍼링크 팝업 열기 실패 — 링크 없이 텍스트만 유지", "WARNING")
            # 선택 해제
            ActionChains(driver).send_keys(Keys.END).perform()

    except Exception as e:
        _log(f"[CTA] 하이퍼링크 적용 실패: {e}", "WARNING")
        try:
            ActionChains(driver).send_keys(Keys.END).perform()
        except Exception:
            pass


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

            # 클릭 전: 현재 보이는 모든 li 요소의 ID 수집 (비교용)
            before_ids = driver.execute_script("""
                var ids = new Set();
                document.querySelectorAll('li').forEach(function(li) {
                    ids.add(li);
                });
                window.__board_before_li_count = ids.size;
                return ids.size;
            """)

            try:
                board_btn.click()
            except Exception:
                driver.execute_script("arguments[0].click();", board_btn)
            random_delay(0.8, 1.2)

            target_id = str(target_menu_id) if target_menu_id else ""

            # 드롭다운 찾기: 버튼 클릭 후 나타난 새로운 visible 요소 탐색
            # Vue 포탈(teleport) 대응: 전체 DOM에서 탐색하되, 드롭다운 특성으로 필터링
            matched = driver.execute_script("""
                var targetId = arguments[0];
                var targetName = arguments[1];
                var btn = arguments[2];

                // 전략 1: 게시판 버튼과 같은 Vue 컴포넌트 스코프의 드롭다운
                // data-v-* 속성이 버튼과 동일한 요소 찾기
                var btnVueAttrs = [];
                for (var i = 0; i < btn.attributes.length; i++) {
                    var attrName = btn.attributes[i].name;
                    if (attrName.startsWith('data-v-')) {
                        btnVueAttrs.push(attrName);
                    }
                }

                // 모든 visible ul 중 드롭다운 후보 찾기
                var allULs = document.querySelectorAll('ul');
                var candidateLists = [];

                for (var u = 0; u < allULs.length; u++) {
                    var ul = allULs[u];
                    // 보이지 않는 ul 제외
                    var rect = ul.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) continue;
                    var style = window.getComputedStyle(ul);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;

                    var items = ul.querySelectorAll(':scope > li');
                    if (items.length < 2) continue;

                    // 알림 목록 제외: cc_mynews_item 포함 여부
                    var hasNews = ul.querySelector('.cc_mynews_item');
                    if (hasNews) continue;

                    // 사이드바 메뉴 제외: 카페 메뉴는 보통 많은 항목 + 특정 클래스
                    var isMenu = ul.closest('.cafe-menu, .gnb, #menuList, .sidebar, nav');
                    if (isMenu) continue;
                    // gnb_lst (네이버 상단바) 제외
                    if (ul.classList.contains('gnb_lst') || ul.id === 'gnb_lst') continue;
                    // 에디터 툴바 제외
                    if (ul.classList.contains('se-toolbar') || ul.classList.contains('se-cell-controlbar')) continue;
                    // 설정 리스트 제외
                    if (ul.classList.contains('set_list')) continue;

                    // option_list 클래스 = 게시판 드롭다운 (최우선)
                    var isOptionList = ul.classList.contains('option_list');

                    // Vue 스코프 매칭: 버튼과 같은 data-v-* 속성 가진 ul 우선
                    var vueMatch = false;
                    for (var v = 0; v < btnVueAttrs.length; v++) {
                        if (ul.hasAttribute(btnVueAttrs[v])) {
                            vueMatch = true;
                            break;
                        }
                    }

                    candidateLists.push({ul: ul, items: items, vueMatch: vueMatch, isOptionList: isOptionList});
                }

                // option_list 최우선, Vue 매칭 그 다음
                candidateLists.sort(function(a, b) {
                    var aScore = (a.isOptionList ? 10 : 0) + (a.vueMatch ? 1 : 0);
                    var bScore = (b.isOptionList ? 10 : 0) + (b.vueMatch ? 1 : 0);
                    return bScore - aScore;
                });

                // 진단: 후보 리스트 로깅용 데이터 수집
                var diagData = [];
                for (var c = 0; c < candidateLists.length; c++) {
                    var cand = candidateLists[c];
                    var itemTexts = [];
                    for (var t = 0; t < Math.min(cand.items.length, 5); t++) {
                        itemTexts.push((cand.items[t].textContent || '').trim().substring(0, 30));
                    }
                    diagData.push({
                        count: cand.items.length,
                        vue: cand.vueMatch,
                        texts: itemTexts,
                        cls: (cand.ul.className || '').substring(0, 50),
                        html: cand.ul.outerHTML.substring(0, 150)
                    });
                }

                // li 안의 클릭 가능한 요소 찾기 헬퍼
                // option_list: button.option, 일반: a 또는 li 자체
                function clickItem(li) {
                    // 1순위: button.option (Naver 게시판 드롭다운)
                    var btn = li.querySelector('button.option');
                    if (btn) { btn.click(); return; }
                    // 2순위: a 태그
                    var a = li.querySelector('a');
                    if (a) { a.click(); return; }
                    // 3순위: 아무 button
                    var anyBtn = li.querySelector('button');
                    if (anyBtn) { anyBtn.click(); return; }
                    // 최종: li 자체
                    li.click();
                }

                // 각 후보에서 매칭 시도
                for (var d = 0; d < candidateLists.length; d++) {
                    var list = candidateLists[d];

                    // 1차: menuId 매칭
                    if (targetId) {
                        for (var j = 0; j < list.items.length; j++) {
                            var li = list.items[j];
                            var a = li.querySelector('a');
                            var menuId = li.getAttribute('data-menuid') ||
                                         li.getAttribute('data-menu-id') ||
                                         li.getAttribute('data-id') || '';
                            var href = a ? (a.getAttribute('href') || '') : '';
                            if (a) {
                                menuId = menuId || a.getAttribute('data-menuid') ||
                                         a.getAttribute('data-menu-id') || '';
                            }
                            if (menuId === targetId ||
                                href.indexOf('menuId=' + targetId) >= 0) {
                                clickItem(li);
                                return {method: 'menuId', text: (li.textContent||'').trim(), diag: diagData};
                            }
                        }
                    }

                    // 2차: board_name 텍스트 매칭
                    if (targetName) {
                        for (var k = 0; k < list.items.length; k++) {
                            var txt = (list.items[k].textContent || '').trim();
                            if (txt === targetName || txt.indexOf(targetName) >= 0) {
                                clickItem(list.items[k]);
                                return {method: 'name', text: txt, diag: diagData};
                            }
                        }
                    }
                }

                // 3차: 폴백 — 첫 번째 후보 리스트의 첫 항목 (전체/공지 제외)
                if (candidateLists.length > 0) {
                    var first = candidateLists[0];
                    for (var m = 0; m < first.items.length; m++) {
                        var ft = (first.items[m].textContent || '').trim();
                        if (ft && ft.indexOf('전체') < 0 && ft.indexOf('선택') < 0) {
                            clickItem(first.items[m]);
                            return {method: 'fallback', text: ft, diag: diagData};
                        }
                    }
                }

                return {method: 'none', text: '', diag: diagData};
            """, target_id, board_name, board_btn)

            if matched:
                # 진단 로깅
                for i, d in enumerate(matched.get('diag', [])):
                    logger.info(f"[드롭다운 후보 {i}] vue={d['vue']} items={d['count']} cls='{d['cls']}' texts={d['texts']}")
                    logger.info(f"  html: {d['html']}")

                if matched['method'] != 'none':
                    logger.info(f"게시판 선택 완료 ({matched['method']}): '{matched['text']}'")
                    random_delay(0.5, 1.0)

                    # 선택 후 버튼 텍스트 확인
                    btn_after = (board_btn.text or "").strip()
                    if "선택" in btn_after:
                        logger.warning(f"선택 후에도 버튼 텍스트 변경 안 됨: '{btn_after}' — 클릭이 잘못된 요소에 갔을 수 있음")
                    else:
                        logger.info(f"선택 후 버튼 텍스트: '{btn_after}'")
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
    board_name: str = "",
    footer_link: str = "",
    footer_link_text: str = ""
) -> Optional[str]:
    """
    SE ONE 에디터에서 글 작성 후 발행

    structured_content가 있으면 서식 적용, 없으면 content를 plain text로 입력

    Args:
        title: 글 제목
        content: 단순 텍스트 본문 (폴백용)
        image_path: 이미지 파일 경로
        structured_content: content_generator에서 생성한 구조화된 콘텐츠
        footer_link: 글 하단에 OGLink 카드로 삽입할 URL

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

        # ── 하단 링크 삽입 (OGLink 카드 → 실패 시 하이퍼링크) ──
        if footer_link:
            _restore_editor_focus(driver)
            _insert_footer_link(driver, footer_link, footer_link_text)

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
        logger.info(f"[발행확인] 등록 버튼 클릭 후 URL: {current_url}")

        def _is_published_url(url):
            """발행된 글 URL인지 확인 (write 페이지 제외)"""
            if "articles/write" in url or "ArticleWrite" in url:
                return False
            import re
            # /articles/숫자 (신형 URL)
            if re.search(r'/articles/\d+', url):
                return True
            # ArticleRead (iframe 형식 포함, URL 인코딩된 경우도)
            if "ArticleRead" in url:
                return True
            # articleid= query parameter (iframe_url_utf8 등에 인코딩된 경우)
            if "articleid" in url.lower():
                return True
            # cafe.naver.com/alias/숫자 (구형 URL)
            if re.search(r'cafe\.naver\.com/\w+/\d+', url):
                return True
            return False

        if _is_published_url(current_url):
            logger.info(f"글 발행 성공: {current_url}")
            return current_url

        # 발행 URL이 아니면 → 페이지 전환 대기 (프록시 등 느린 네트워크 대비)
        if not _is_published_url(current_url):
            is_write_page = "articles/write" in current_url or "ArticleWrite" in current_url
            logger.info(f"[발행확인] 발행 URL 아님 — 추가 대기 (최대 15초), write페이지={is_write_page}")
            for i in range(5):
                random_delay(2, 3)
                current_url = driver.current_url
                logger.info(f"[발행확인] {(i+1)*3}초 대기 후 URL: {current_url}")
                if _is_published_url(current_url):
                    logger.info(f"글 발행 성공 (추가 대기 후): {current_url}")
                    return current_url

        # 확인 다이얼로그 처리
        try:
            confirm_btn = driver.find_element(
                By.XPATH, "//button[contains(text(),'등록') or contains(text(),'확인')]"
            )
            logger.info(f"[발행확인] 확인 다이얼로그 버튼 발견 — 클릭")
            confirm_btn.click()
            random_delay(3, 5)
            current_url = driver.current_url
            logger.info(f"[발행확인] 확인 버튼 클릭 후 URL: {current_url}")
            if _is_published_url(current_url):
                return current_url
        except NoSuchElementException:
            pass

        # 최종: 현재 URL이 발행 URL인지 한번 더 확인
        current_url = driver.current_url
        if _is_published_url(current_url):
            logger.info(f"글 발행 성공 (최종 확인): {current_url}")
            return current_url

        logger.warning(f"발행 후 URL 확인 실패: {current_url}")
        _save_debug_screenshot(driver, "publish_url_check_failed")
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

    # 에디터 포커스: ActionChains 클릭 (실제 마우스 이벤트로 에디터 활성화)
    try:
        ActionChains(driver).click(body_area).perform()
        logger.info("본문 ActionChains 클릭 포커스 완료")
    except Exception:
        try:
            body_area.click()
        except Exception:
            driver.execute_script("arguments[0].click();", body_area)
        logger.info("본문 click 포커스 완료 (폴백)")
    random_delay(0.3, 0.5)

    for section in structured_content["sections"]:
        s_type = section["type"]

        if s_type == "text":
            for line in section["lines"]:
                style = line["style"]
                text = line["text"]

                if style == STYLE_EMPTY:
                    ActionChains(driver).send_keys(Keys.ENTER).perform()
                    random_delay(0.2, 0.4)
                    continue

                # 텍스트 입력 (ActionChains 키보드 이벤트)
                fast_type(driver, text)
                random_delay(0.3, 0.8)

                # 줄바꿈
                ActionChains(driver).send_keys(Keys.ENTER).perform()
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

    # 내용 입력 검증: 에디터 본문에 실제로 텍스트가 있는지 확인
    try:
        body_text = driver.execute_script("""
            var bodies = document.querySelectorAll(
                '.se-component-content .se-text-paragraph, [contenteditable="true"]'
            );
            var allText = '';
            bodies.forEach(function(b) { allText += (b.textContent || ''); });
            return allText.trim();
        """)
        text_len = len(body_text) if body_text else 0
        if text_len > 0:
            logger.info(f"본문 내용 검증 OK: {text_len}자 (처음 50자: '{body_text[:50]}')")
        else:
            logger.error("본문 내용 검증 실패: 에디터에 텍스트가 없음!")
    except Exception as e:
        logger.warning(f"본문 내용 검증 오류: {e}")


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
    board_name: str = "",
    footer_link: str = "",
    footer_link_text: str = ""
) -> dict:
    """
    전체 카페 글 발행 프로세스

    Args:
        structured_content: content_generator.generate_content() 결과.
            있으면 SE ONE 서식 적용, 없으면 content를 plain text로 입력.
        footer_link: 글 하단에 삽입할 URL (OGLink → 하이퍼링크 폴백)
        footer_link_text: 하이퍼링크 표시 텍스트 (기본: '카카오톡 상담하기')

    Returns: {"success": bool, "url": str|None, "error": str|None, "cookies": str|None}
    """
    driver = None
    result = {"success": False, "url": None, "error": None, "cookies": None}

    try:
        if on_progress:
            on_progress("driver", "브라우저 시작 중...")
        # 프록시: DB에서 복호화하여 가져오기
        from database import get_account_proxy
        proxy_addr = get_account_proxy(account["id"]) if account.get("id") else account.get("proxy_address")
        driver = create_driver(headless=headless, account_id=account.get("id"), proxy_address=proxy_addr)

        # 1. 로그인 (프로파일 세션 → DB 쿠키 → ID/PW 순)
        _log(f"[발행] 계정={account.get('username')}, 카페={cafe_url}, 게시판={menu_id}")
        if on_progress:
            on_progress("login", "로그인 시도 중...")

        logged_in = check_profile_login(driver)
        _log(f"[로그인] 프로파일 세션: {'성공' if logged_in else '실패'}")
        if on_progress:
            on_progress("login", f"프로파일 세션: {'성공' if logged_in else '실패'}")

        if not logged_in and account.get("cookie_data"):
            if on_progress:
                on_progress("login", "쿠키 로그인 시도 중...")
            logged_in = login_with_cookie(driver, account["cookie_data"])
            _log(f"[로그인] 쿠키: {'성공' if logged_in else '실패'}")
            if on_progress:
                on_progress("login", f"쿠키 로그인: {'성공' if logged_in else '실패'}")

        if not logged_in:
            if on_progress:
                on_progress("login", f"ID/PW 로그인 시도: {account['username']}")
            _log(f"[로그인] ID/PW 시도: {account['username']}")
            logged_in = login_with_credentials(
                driver, account["username"], account["password_enc"]
            )
            _log(f"[로그인] ID/PW: {'성공' if logged_in else '실패'}")
            if on_progress:
                on_progress("login", f"ID/PW 로그인: {'성공' if logged_in else '실패'}")

        if not logged_in:
            _save_debug_screenshot(driver, "login_failed")
            result["error"] = "로그인 실패"
            if on_progress:
                on_progress("error", "로그인 실패 (프로파일/쿠키/ID-PW 모두 실패)")
            return result

        # 쿠키 저장
        result["cookies"] = get_login_cookies(driver)

        # 1.5. cafe.naver.com 세션 확립 (로그인 후 카페 도메인 세션 동기화)
        if on_progress:
            on_progress("navigate", "카페 세션 확립 중...")
        _ensure_cafe_session(driver)

        # 2. 카페 글쓰기 페이지 이동
        if on_progress:
            on_progress("navigate", f"카페 이동 중... ({cafe_url})")

        if not navigate_to_write_page(driver, cafe_url, menu_id):
            # 세션 만료일 수 있으므로 ID/PW 재로그인 후 재시도
            _log("글쓰기 페이지 이동 실패 — 현재 URL 확인 중...")
            _log(f"현재 URL: {driver.current_url}")
            _save_debug_screenshot(driver, "navigate_failed")
            if on_progress:
                on_progress("login", "세션 만료, 재로그인 중...")
            _log("ID/PW 재로그인 시도...")
            re_logged_in = login_with_credentials(
                driver, account["username"], account["password_enc"]
            )
            if re_logged_in:
                _log("재로그인 성공 — 카페 세션 확립 후 재시도")
                result["cookies"] = get_login_cookies(driver)
                # 재로그인 후에도 cafe.naver.com 세션 확립 필수
                _ensure_cafe_session(driver)
                if on_progress:
                    on_progress("navigate", f"카페 재이동 중... ({cafe_url})")
                if not navigate_to_write_page(driver, cafe_url, menu_id):
                    _save_debug_screenshot(driver, "navigate_failed_after_relogin")
                    result["error"] = "글쓰기 페이지 이동 실패 (재로그인 후에도)"
                    return result
            else:
                current_url = driver.current_url
                _log(f"재로그인 실패! URL: {current_url}")
                _save_debug_screenshot(driver, "relogin_failed")
                # 실패 원인을 에러 메시지에 포함
                if "captcha" in current_url:
                    result["error"] = "재로그인 실패: 캡챠 발생 (수동 로그인 필요)"
                elif "2step" in current_url or "deviceConfirm" in current_url:
                    result["error"] = "재로그인 실패: 2단계 인증 필요"
                elif "protect" in current_url:
                    result["error"] = "재로그인 실패: 보호 모드 (이상 로그인 감지)"
                elif "nidlogin" in current_url:
                    result["error"] = "재로그인 실패: ID/PW 불일치 또는 입력 미감지"
                else:
                    result["error"] = f"재로그인 실패: 알 수 없는 URL ({current_url[:80]})"
                if on_progress:
                    on_progress("error", result["error"])
                return result

        # 3. 글 작성 & 발행
        if on_progress:
            on_progress("writing", "글 작성 중...")

        published_url = write_post(
            driver, title, content, image_path,
            structured_content=structured_content,
            menu_id=menu_id,
            board_name=board_name,
            footer_link=footer_link,
            footer_link_text=footer_link_text
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
        # 프록시: DB에서 복호화하여 가져오기
        from database import get_account_proxy
        proxy_addr = get_account_proxy(account["id"]) if account.get("id") else account.get("proxy_address")
        driver = create_driver(headless=headless, account_id=account.get("id"), proxy_address=proxy_addr)

        # 로그인 (프로파일 세션 → DB 쿠키 → ID/PW 순)
        logged_in = check_profile_login(driver)

        if not logged_in and account.get("cookie_data"):
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
