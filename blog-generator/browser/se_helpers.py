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

async def _cookies_still_valid(cookies: list) -> bool:
    """
    저장 쿠키가 로그인 상태인지 '무프록시'로 빠르게 검증.
    레지던셜 프록시로 www.naver.com 렌더가 20s+ 걸려 유효 쿠키도 만료로 오판되므로
    검증만 무프록시로 분리한다(세션 유효성은 IP보안 OFF라 IP 무관). 로그인 상태에서만
    렌더되는 로그아웃 요소 존재로 판정.
    """
    try:
        async with async_playwright() as pw:
            browser, ctx = await create_stealth_context(pw, proxy=None, headless=True)
            try:
                await ctx.add_cookies(cookies)
                page = await ctx.new_page()
                await page.goto("https://www.naver.com/", wait_until="commit", timeout=30000)
                try:
                    el = await page.wait_for_selector(
                        "[class*='MyView'][class*='logout'], a[href*='nidlogin.logout']",
                        timeout=10000, state="attached",
                    )
                except Exception:
                    el = None
                return bool(el)
            finally:
                await browser.close()
    except Exception as e:
        logger.warning(f"쿠키 유효성 검증 오류: {e}")
        return False


async def _playwright_login(context, naver_id: str, naver_password: str, account_id) -> bool:
    """
    프록시 context에서 직접 Playwright로 ID/PW 로그인.
    핵심: 느린 프록시에선 로그인 JS(dynamicEcKey = 비번 암호화 키)가 다 로드되기 전
    '다음'을 누르면 제출이 무시되어 로그인 페이지에 머문다. #id 등장 후 networkidle까지
    기다린 뒤 입력·클릭한다. (깨끗한 IP + 스텔스면 캡차 안 뜸 — 2026-06 재검증.)
    성공 시 쿠키를 .enc로 저장하고 context에 유지한다.
    """
    page = await context.new_page()
    try:
        await page.goto("https://nid.naver.com/nidlogin.login", wait_until="commit", timeout=30000)
        await page.wait_for_selector("#id", timeout=40000)
        try:
            await page.wait_for_load_state("networkidle", timeout=25000)
        except Exception:
            pass
        await page.wait_for_timeout(1500)
        await page.click("#id")
        await page.type("#id", naver_id, delay=50)
        await page.click("#pw")
        await page.type("#pw", naver_password, delay=50)
        await page.wait_for_timeout(400)
        btn = await page.query_selector("#log\\.login, .btn_login, button[type='submit']")
        if btn:
            await btn.click()
        else:
            await page.keyboard.press("Enter")
        ok = False
        for _ in range(25):
            await page.wait_for_timeout(1000)
            u = page.url
            if "nidlogin" not in u and "nid.naver.com" not in u:
                ok = True
                break
        if not ok:
            logger.warning(f"[계정 {account_id}] Playwright 로그인 미완료 (URL: {page.url[:55]})")
            return False
        cookies = await context.cookies()
        _save_encrypted_cookies(settings.COOKIES_DIR / f"account_{account_id}.enc", cookies)
        await _share_cookies_for_cbox(context)
        logger.info(f"[계정 {account_id}] ✅ Playwright 로그인 성공 — 쿠키 {len(cookies)}개 저장")
        return True
    except Exception as e:
        logger.warning(f"[계정 {account_id}] Playwright 로그인 오류: {e}")
        return False
    finally:
        try:
            await page.close()
        except Exception:
            pass


async def login(
    context: BrowserContext,
    naver_id: str,
    naver_password: str,
    account_id: int,
) -> bool:
    """
    네이버 로그인 — 2단계:
      1) 저장된 쿠키 재사용 (Playwright context)
      2) 만료/없음 → Xvfb + 실제 Chrome + pyautogui로 ID/PW 로그인
         (Playwright ID/PW 입력은 navigator.webdriver 위장에도 무조건
         CAPTCHA로 차단되어 완전히 폐기)

    pyautogui 로그인이 성공하면 추출된 쿠키를 현재 Playwright context에
    주입하여 호출자가 그대로 발행/엔게이지 작업을 이어가도록 한다.
    """
    page = await context.new_page()

    # ── Step 1: 쿠키 로그인 시도 ─────────────────────────────
    cookie_path = settings.COOKIES_DIR / f"account_{account_id}.enc"
    if cookie_path.exists():
        try:
            cookies = _load_encrypted_cookies(cookie_path)
            # 쿠키 유효성은 '무프록시'로 검증한다(레지던셜 프록시로 www.naver.com 렌더가
            # 20s+라 유효 쿠키도 만료로 오판 → 불필요 풀로그인). 실제 발행은 프록시 context.
            if await _cookies_still_valid(cookies):
                await context.add_cookies(cookies)
                logger.info(f"[계정 {account_id}] 쿠키 로그인 성공")
                await _share_cookies_for_cbox(context)
                await page.close()
                return True
            logger.debug(f"[계정 {account_id}] 쿠키 만료 → 로그인으로 전환")
        except Exception as e:
            logger.warning(f"[계정 {account_id}] 쿠키 로드 실패: {e}")

    await page.close()

    # ── Step 2a: 프록시 context에서 Playwright로 직접 로그인 ──
    # (networkidle 대기로 dynamicEcKey 로드 후 클릭 — 깨끗한 IP면 캡차 없이 성공)
    logger.info(f"[계정 {account_id}] Playwright 로그인 시작")
    if await _playwright_login(context, naver_id, naver_password, account_id):
        return True
    logger.warning(f"[계정 {account_id}] Playwright 로그인 실패 → pyautogui 폴백")

    # ── Step 2b: Xvfb + pyautogui로 ID/PW 로그인 (폴백) ──────
    try:
        from browser.pyautogui_login import login_naver_with_pyautogui

        proxy = await _get_proxy_for_account(account_id)
        logger.info(f"[계정 {account_id}] pyautogui 로그인 시작")
        ok = await login_naver_with_pyautogui(
            naver_id=naver_id,
            naver_password=naver_password,
            account_id=account_id,
            proxy=proxy,
        )
        if not ok:
            logger.error(f"[계정 {account_id}] pyautogui 로그인 실패")
            return False
    except Exception as e:
        logger.error(f"[계정 {account_id}] pyautogui 로그인 자체 실패: {e}")
        return False

    # pyautogui가 저장한 쿠키를 현재 Playwright context에 주입
    if not cookie_path.exists():
        logger.error(f"[계정 {account_id}] pyautogui 성공 후 쿠키 파일 없음")
        return False
    try:
        cookies = _load_encrypted_cookies(cookie_path)
        await context.add_cookies(cookies)
        await _share_cookies_for_cbox(context)
        logger.info(
            f"[계정 {account_id}] ✅ pyautogui 쿠키를 Playwright context에 주입 완료"
        )
        return True
    except Exception as e:
        logger.error(f"[계정 {account_id}] pyautogui 쿠키 주입 실패: {e}")
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


def _get_db_path() -> Optional[Path]:
    """공용 dailyfni.db 경로 — Node 측과 동일 (../../data/dailyfni.db 기준)."""
    candidates = [
        settings.DATA_DIR / "dailyfni.db",                # blog-generator/data/dailyfni.db (없을 수도)
        Path("/opt/dailyfni-blog/data/dailyfni.db"),      # Node 와 공유하는 실제 경로
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _lookup_account_proxy_from_db(account_id) -> Optional[dict]:
    """
    공용 SQLite DB 에서 계정별 proxy 정보 조회.
    네이버(accounts) → 티스토리(tistory_accounts) 순으로 lookup.
    account_id 가 UUID 문자열이어야 매칭됨.
    """
    import sqlite3
    db_path = _get_db_path()
    if not db_path:
        return None
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=2.0)
        try:
            row = conn.execute(
                """SELECT p.ip, p.port, p.username, p.password, a.proxyServer
                   FROM accounts a LEFT JOIN proxies p ON a.proxyId = p.id
                   WHERE a.id = ?""",
                (str(account_id),),
            ).fetchone()
            if not row:
                # 티스토리 계정 fallback
                row = conn.execute(
                    """SELECT p.ip, p.port, p.username, p.password, t.proxyServer
                       FROM tistory_accounts t LEFT JOIN proxies p ON t.proxyId = p.id
                       WHERE t.id = ?""",
                    (str(account_id),),
                ).fetchone()
        finally:
            conn.close()
        if not row:
            return None
        ip, port, username, password, proxy_server = row
        if ip and port:
            return {
                "server": f"http://{ip}:{port}",
                "username": username or "",
                "password": password or "",
            }
        if proxy_server:
            return {"server": f"http://{proxy_server}"}
        return None
    except Exception as e:
        logger.warning(f"[계정 {account_id}] DB 프록시 조회 실패: {e}")
        return None


async def _get_proxy_for_account(account_id) -> Optional[dict]:
    """
    계정별 프록시 설정 조회.
    우선순위:
      ① DB(accounts.proxyId → proxies) — 계정별 sticky proxy (CAPTCHA 회피 핵심)
      ② .env PROXY_SERVER — 글로벌 fallback (per-account 매칭 실패 시)
      ③ None → 직접 연결
    """

    def _build_proxy(server: str, username: str = "", password: str = "") -> Optional[dict]:
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

    # ── ① DB 의 계정별 proxy 우선 (각 계정마다 다른 sticky 출구 IP 보장) ──
    db_proxy = _lookup_account_proxy_from_db(account_id)
    if db_proxy and db_proxy.get("server"):
        logger.info(f"[계정 {account_id}] DB 계정별 프록시 사용 시도: {db_proxy['server']}")
        proxy = _build_proxy(
            db_proxy["server"],
            db_proxy.get("username", ""),
            db_proxy.get("password", ""),
        )
        if proxy:
            return proxy

    # ── ② .env 글로벌 프록시 fallback ─────────────────────────
    if settings.PROXY_SERVER:
        logger.info(f"[계정 {account_id}] .env 글로벌 프록시 fallback: {settings.PROXY_SERVER}")
        proxy = _build_proxy(
            settings.PROXY_SERVER,
            settings.PROXY_USERNAME,
            settings.PROXY_PASSWORD,
        )
        if proxy:
            return proxy

    # ── ③ 직접 연결 ─────────────────────────────────────────────
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
