"""
se_helpers.py — 공용 브라우저 유틸리티 (Stealth, 로그인, 쿠키 등)
engagement-logic-guide.md §12 기반 이식
"""

import asyncio
import random
import sys
import json
import socket
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from playwright.async_api import BrowserContext, Page, Playwright, async_playwright
from loguru import logger

from config import settings

# 프록시 없음을 나타내는 센티널 값
_PROXY_CHECKED_NO_PROXY = object()

# ──────────────────────────────────────────────────────────────
# 1. 스텔스 브라우저 컨텍스트 생성
# ──────────────────────────────────────────────────────────────

async def create_stealth_context(
    playwright: Playwright,
    proxy: Optional[dict] = None,
    headless: bool = True,
) -> tuple:
    """
    봇 탐지 우회 설정이 적용된 Playwright 브라우저 + 컨텍스트를 생성합니다.
    실제 Chrome/Edge 채널 우선 사용 — 기본 Chromium은 네이버에 봇으로 탐지됨.
    Third-Party Cookie 차단 플래그 비활성화로 로그인 세션 안정화.
    """
    launch_args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-infobars",
        "--window-size=1920,1080",
        # Third-Party Cookie 차단 완전 비활성화 (네이버 로그인 세션 유지)
        "--disable-features=ThirdPartyCookieBlocking,ThirdPartyCookiePhaseout,"
        "SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,"
        "TrackingProtection3pcd,ThirdPartyCookieTopLevelSitePartitioning,"
        "PartitionedCookies,CookiePartitioning,StoragePartitioning,"
        "ThirdPartyStoragePartitioning",
        "--disable-site-isolation-trials",
        "--disable-third-party-cookie-phaseout",
    ]

    # Chrome → Edge → 기본 Chromium 순서로 fallback 시도
    # 실제 Chrome/Edge는 네이버가 정상 브라우저로 인식 — 봇 탐지 우회 핵심
    browser = None
    for channel in ["chrome", "msedge", None]:
        try:
            launch_kwargs = {
                "headless": headless,
                "args": launch_args,
            }
            if channel:
                launch_kwargs["channel"] = channel
            if proxy:
                launch_kwargs["proxy"] = proxy

            browser = await playwright.chromium.launch(**launch_kwargs)
            channel_name = channel or "기본 Chromium"
            proxy_info = f", proxy={proxy['server']}" if proxy else ""
            logger.info(f"브라우저 시작: channel={channel_name}{proxy_info}")
            break
        except Exception as e:
            logger.warning(f"브라우저 시작 실패 (channel={channel}): {e}")
            continue

    if not browser:
        raise RuntimeError("사용 가능한 브라우저가 없습니다. Chrome 또는 Edge를 설치하세요.")

    context_kwargs = dict(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/134.0.0.0 Safari/537.36"
        ),
        locale="ko-KR",
        timezone_id="Asia/Seoul",
        viewport={"width": 1920, "height": 1080},
        permissions=["clipboard-read", "clipboard-write"],
    )

    if proxy and "server" not in (launch_kwargs if browser else {}):
        # per-context proxy (launch 시 주입 안 한 경우 context에 추가)
        context_kwargs["proxy"] = proxy

    context = await browser.new_context(**context_kwargs)

    # navigator.webdriver 위장 + Chrome 객체 주입
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR','ko','en-US','en'] });
        window.chrome = { runtime: {} };
    """)

    return browser, context


# ──────────────────────────────────────────────────────────────
# 2. 네이버 로그인
# ──────────────────────────────────────────────────────────────

async def login(
    context: BrowserContext,
    naver_id: str,
    naver_password: str,
    account_id: int,
) -> bool:
    """
    쿠키 → ID/PW 2단계 로그인 전략 (guide §3-2, §3-3)
    성공 시 True, 실패 시 False 반환

    개선 사항:
    - 네이버 메인 warm-up 방문으로 IP 봇 차단 우회
    - 타임아웃 30초로 증가
    - networkidle 대기 추가로 JS 로딩 완료 보장
    - 실패 시 매 시도마다 스크린샷 캡처
    - 로그인 버튼 셀렉터 다양화
    """
    page = await context.new_page()

    # ── Step 1: 쿠키 로그인 시도 ─────────────────────────────
    cookie_path = settings.COOKIES_DIR / f"account_{account_id}.enc"
    if cookie_path.exists():
        try:
            cookies = _load_encrypted_cookies(cookie_path)
            await context.add_cookies(cookies)
            await page.goto("https://www.naver.com/", timeout=30000)
            await page.wait_for_load_state("domcontentloaded")

            # 로그인 버튼이 없으면 이미 로그인 상태
            login_btn = await page.query_selector("a.link_login, a[href*='nidlogin']")
            if not login_btn:
                logger.info(f"[계정 {account_id}] 쿠키 로그인 성공")
                await _share_cookies_for_cbox(context)
                await page.close()
                return True
            logger.debug(f"[계정 {account_id}] 쿠키 만료 → ID/PW 로그인으로 전환")
        except Exception as e:
            logger.warning(f"[계정 {account_id}] 쿠키 로드 실패: {e}")

    # ── Step 2: 네이버 메인 warm-up (봇 탐지 우회) ────────────
    try:
        logger.debug(f"[계정 {account_id}] warm-up: 네이버 메인 방문 중...")
        await page.goto("https://www.naver.com/", timeout=30000)
        await page.wait_for_load_state("domcontentloaded")
        await random_delay(1.5, 3.0)
    except Exception as e:
        logger.warning(f"[계정 {account_id}] warm-up 실패 (계속 진행): {e}")

    # ── Step 3: ID/PW 로그인 ─────────────────────────────────
    for attempt in range(1, 4):
        try:
            logger.info(f"[계정 {account_id}] 로그인 시도 {attempt}/3...")
            await page.goto("https://nid.naver.com/nidlogin.login", timeout=30000)

            # domcontentloaded 후 networkidle까지 대기 (JS 로딩 완료 보장)
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=30000)
                await page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                # networkidle 타임아웃은 무시하고 진행
                pass

            await random_delay(1.0, 2.0)

            # 입력 필드 존재 확인
            id_field = await page.query_selector("#id")
            if not id_field:
                logger.warning(f"[계정 {account_id}] #id 입력 필드를 찾지 못함 (시도 {attempt}/3)")
                await capture_debug(page, f"login_no_id_field_{account_id}_attempt{attempt}")
                await random_delay(2, 4)
                continue

            # JS로 값 설정 + input 이벤트 dispatch (guide §3-3)
            await page.evaluate(f"""
                const idField = document.querySelector('#id');
                if (idField) {{
                    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(idField, '{naver_id}');
                    idField.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    idField.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            """)
            await random_delay(0.5, 1.0)
            await page.evaluate(f"""
                const pwField = document.querySelector('#pw');
                if (pwField) {{
                    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(pwField, '{naver_password}');
                    pwField.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    pwField.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            """)
            await random_delay(0.5, 1.0)

            # 로그인 버튼 클릭 (다양한 셀렉터 시도)
            btn = await page.query_selector(
                "#log\\.login, .btn_login, button[type='submit'], input[type='submit']"
            )
            if btn:
                await btn.click()
            else:
                # 버튼을 못 찾으면 Enter 키 대체
                logger.warning(f"[계정 {account_id}] 로그인 버튼을 찾지 못해 Enter로 대체")
                await page.keyboard.press("Enter")

            await page.wait_for_load_state("domcontentloaded", timeout=30000)
            await random_delay(3, 5)

            # ── 본인인증 요구 감지 (허용되지 않은 지역 로그인) ─────
            # 스크린샷: "회원님이 로그인을 허용하지 않은 지역에서 로그인 되었습니다."
            page_text = await page.evaluate("() => document.body.innerText")
            if "허용하지 않은 지역" in page_text or "본인확인이 필요" in page_text or "휴대전화 번호" in page_text:
                logger.error(
                    f"[계정 {account_id}] ❌ 본인인증 요구 감지! "
                    f"네이버가 이 IP를 낯선 지역으로 차단했습니다. "
                    f"URL: {page.url}"
                )
                await capture_debug(page, f"identity_verify_required_{account_id}")
                await page.close()
                return False

            # CAPTCHA 감지
            captcha = await page.query_selector("#captcha, .captcha_wrap, #recaptcha")
            if captcha:
                logger.error(f"[계정 {account_id}] CAPTCHA 감지 — 수동 개입 필요")
                await capture_debug(page, f"captcha_account_{account_id}")
                await page.close()
                return False

            # 로그인 실패 감지 (아직 로그인 페이지에 머무는 경우)
            if "nidlogin" in page.url:
                logger.warning(f"[계정 {account_id}] 로그인 실패 (시도 {attempt}/3) - URL: {page.url}")
                await capture_debug(page, f"login_fail_{account_id}_attempt{attempt}")
                await random_delay(3, 6)
                continue

            # 성공 — 쿠키 저장
            cookies = await context.cookies()
            _save_encrypted_cookies(cookie_path, cookies)
            await _share_cookies_for_cbox(context)
            logger.info(f"[계정 {account_id}] ID/PW 로그인 성공 ✅ URL: {page.url}")
            await page.close()
            return True

        except Exception as e:
            logger.error(f"[계정 {account_id}] 로그인 시도 {attempt} 예외: {e}")
            await capture_debug(page, f"login_exception_{account_id}_attempt{attempt}")
            await random_delay(3, 6)

    await page.close()
    return False


# ──────────────────────────────────────────────────────────────
# 3. 쿠키 암호화 저장/로드 (guide §보안 §1)
# ──────────────────────────────────────────────────────────────

def _save_encrypted_cookies(path: Path, cookies: list):
    """쿠키를 AES256으로 암호화하여 .enc 파일로 저장"""
    from cryptography.fernet import Fernet
    import base64, hashlib

    key = base64.urlsafe_b64encode(
        hashlib.sha256(settings.MASTER_KEY.encode()).digest()
    )
    f = Fernet(key)
    raw = json.dumps(cookies).encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(f.encrypt(raw))


def _load_encrypted_cookies(path: Path) -> list:
    """암호화된 .enc 쿠키 파일을 복호화하여 반환"""
    from cryptography.fernet import Fernet
    import base64, hashlib

    key = base64.urlsafe_b64encode(
        hashlib.sha256(settings.MASTER_KEY.encode()).digest()
    )
    f = Fernet(key)
    return json.loads(f.decrypt(path.read_bytes()).decode())


# ──────────────────────────────────────────────────────────────
# 4. cbox 도메인 쿠키 공유 (댓글 iframe 호환용)
# ──────────────────────────────────────────────────────────────

async def _share_cookies_for_cbox(context: BrowserContext):
    """네이버 로그인 쿠키를 apis.naver.com 도메인에도 공유 (guide §3-2)"""
    try:
        naver_cookies = await context.cookies(["https://www.naver.com"])
        for cookie in naver_cookies:
            try:
                await context.add_cookies([{**cookie, "domain": ".apis.naver.com"}])
            except Exception:
                pass
        logger.debug("cbox 도메인 쿠키 공유 완료")
    except Exception as e:
        logger.warning(f"쿠키 공유 실패: {e}")


# ──────────────────────────────────────────────────────────────
# 5. 공용 유틸리티
# ──────────────────────────────────────────────────────────────

async def random_delay(min_sec: float = 1.0, max_sec: float = 3.0):
    """랜덤 대기 (봇 탐지 회피용, guide §11)"""
    delay = random.uniform(min_sec, max_sec)
    await asyncio.sleep(delay)


async def try_selectors(target, selectors: list[str], timeout: int = 5000):
    """여러 셀렉터를 순서대로 시도하여 첫 번째로 찾은 요소를 반환 (guide §12)"""
    for sel in selectors:
        try:
            el = target.locator(sel).first
            await el.wait_for(state="visible", timeout=timeout)
            return el
        except Exception:
            continue
    return None


async def capture_debug(page: Page, label: str):
    """실패 시 디버그 스크린샷 저장 (guide §11)"""
    try:
        debug_dir = settings.DATA_DIR / "debug_screenshots"
        debug_dir.mkdir(parents=True, exist_ok=True)
        path = debug_dir / f"{label}.png"
        # 타임아웃을 5초로 제한 — 페이지가 응답 불능일 때 30초 낭비 방지
        await page.screenshot(path=str(path), full_page=False, timeout=5000)
        logger.debug(f"디버그 스크린샷 저장: {path}")
    except Exception as e:
        logger.warning(f"스크린샷 저장 실패: {e}")


def _check_proxy_alive(proxy_server: str, timeout: float = 5.0) -> bool:
    """프록시 서버가 실제로 연결 가능한지 TCP 소켓으로 사전 검증"""
    try:
        parsed = urlparse(proxy_server if "://" in proxy_server else f"http://{proxy_server}")
        host = parsed.hostname
        port = parsed.port or 8080
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.close()
        return True
    except Exception as e:
        logger.warning(f"프록시 연결 테스트 실패 ({proxy_server}): {e}")
        return False


async def _get_proxy_for_account(account_id: int) -> Optional[dict]:
    """
    계정별 프록시 설정 조회 (DB 없음 — .env 글로벌만 사용)
    우선순위: ① .env PROXY_SERVER (모든 계정 공통 글로벌 프록시)
             ② None → 직접 연결
    """

    def _build_proxy(server: str, username: str = "", password: str = "") -> Optional[dict]:
        """프록시 dict 생성 + 프로토콜 자동 보완 + 연결 테스트"""
        if not server:
            return None
        if not server.startswith(("http://", "https://", "socks4://", "socks5://")):
            server = f"http://{server}"
        if not _check_proxy_alive(server):
            logger.error(f"[계정 {account_id}] ❌ 프록시 연결 불가: {server}")
            return None
        proxy: dict = {"server": server}
        if username:
            proxy["username"] = username
            proxy["password"] = password
        logger.info(f"[계정 {account_id}] ✅ 프록시 연결 확인: {server}")
        return proxy

    # ── ① .env 글로벌 프록시: 모든 계정 공통 적용 ───────────────
    if settings.PROXY_SERVER:
        logger.info(f"[계정 {account_id}] .env 글로벌 프록시 사용 시도: {settings.PROXY_SERVER}")
        proxy = _build_proxy(
            settings.PROXY_SERVER,
            settings.PROXY_USERNAME,
            settings.PROXY_PASSWORD,
        )
        if proxy:
            return proxy

    # ── ② 직접 연결 ─────────────────────────────────────────────
    logger.debug(f"[계정 {account_id}] 프록시 없음 — 직접 연결")
    return None


def _run_in_proactor_loop(coro_fn, *args, **kwargs):
    """Windows ProactorEventLoop 호환 실행 (guide §4)"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro_fn(*args, **kwargs))
    finally:
        loop.close()
