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
import os
from dotenv import load_dotenv
from pathlib import Path

# .env 로드 (backend 상위 폴더 기준)
_BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BASE_DIR / "config" / ".env")


class _Settings:
    MASTER_KEY: str = os.getenv("MASTER_KEY", "change-me-in-production")
    COOKIES_DIR: Path = _BASE_DIR / "data" / "cookies"
    DATA_DIR: Path = _BASE_DIR / "data"
    PROXY_SERVER: str = os.getenv("PROXY_SERVER", "")
    PROXY_USERNAME: str = os.getenv("PROXY_USERNAME", "")
    PROXY_PASSWORD: str = os.getenv("PROXY_PASSWORD", "")


settings = _Settings()

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

    # 봇 탐지 우회 — 포괄적 스텔스 주입
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                const arr = [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer',
                      description: 'Portable Document Format',
                      length: 1, item: () => null, namedItem: () => null },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                      description: '', length: 1, item: () => null, namedItem: () => null },
                    { name: 'Native Client', filename: 'internal-nacl-plugin',
                      description: '', length: 1, item: () => null, namedItem: () => null }
                ];
                arr.item = (i) => arr[i] || null;
                arr.namedItem = (n) => arr.find(p => p.name === n) || null;
                arr.refresh = () => {};
                return arr;
            }
        });

        Object.defineProperty(navigator, 'languages', {
            get: () => Object.freeze(['ko-KR', 'ko', 'en-US', 'en'])
        });

        window.chrome = {
            runtime: {
                onMessage: { addListener: function(){}, removeListener: function(){} },
                sendMessage: function(){},
                connect: function() {
                    return { onMessage: { addListener: function(){} }, postMessage: function(){} };
                },
                PlatformOs: { MAC:'mac', WIN:'win', ANDROID:'android', CROS:'cros', LINUX:'linux', OPENBSD:'openbsd' },
                PlatformArch: { ARM:'arm', X86_32:'x86-32', X86_64:'x86-64', MIPS:'mips', MIPS64:'mips64' },
            },
            csi: function() {
                return { startE: Date.now(), onloadT: Date.now() + 281, pageT: 3947.235, tran: 15 };
            },
            loadTimes: function() {
                return {
                    commitLoadTime: Date.now() / 1000,
                    connectionInfo: 'h2',
                    finishDocumentLoadTime: Date.now() / 1000 + 0.357,
                    finishLoadTime: Date.now() / 1000 + 1.2,
                    firstPaintAfterLoadTime: 0,
                    firstPaintTime: Date.now() / 1000 + 0.45,
                    navigationType: 'Other',
                    npnNegotiatedProtocol: 'h2',
                    requestTime: Date.now() / 1000 - 0.5,
                    startLoadTime: Date.now() / 1000 - 0.3,
                    wasAlternateProtocolAvailable: false,
                    wasFetchedViaSpdy: true,
                    wasNpnNegotiated: true,
                };
            },
        };

        if (typeof Permissions !== 'undefined' && Permissions.prototype.query) {
            const origQuery = Permissions.prototype.query;
            Permissions.prototype.query = function(params) {
                if (params && params.name === 'notifications') {
                    return Promise.resolve({ state: Notification.permission });
                }
                return origQuery.call(this, params);
            };
        }

        try {
            const getParam = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(p) {
                if (p === 37445) return 'Google Inc. (NVIDIA)';
                if (p === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 SUPER, OpenGL 4.5)';
                return getParam.call(this, p);
            };
        } catch(e) {}

        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });

        if (typeof navigator.connection === 'undefined') {
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    effectiveType: '4g', rtt: 50, downlink: 10, saveData: false,
                    addEventListener: function(){}, removeEventListener: function(){}
                })
            });
        }

        delete window.__playwright;
        delete window.__pw_manual;
    """)

    return browser, context


# ──────────────────────────────────────────────────────────────
# 2. 네이버 로그인
# ──────────────────────────────────────────────────────────────

async def login(
    context: BrowserContext,
    naver_id: str,
    naver_password: str,
    account_id,
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
            logger.debug(f"[계정 {account_id}] 쿠키 만료 → pyautogui 로그인으로 전환")
        except Exception as e:
            logger.warning(f"[계정 {account_id}] 쿠키 로드 실패: {e}")

    await page.close()

    # ── Step 2: Xvfb + pyautogui로 ID/PW 로그인 ──────────────
    try:
        from pyautogui_login import login_naver_with_pyautogui

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


async def _get_proxy_for_account(account_id: int) -> Optional[dict]:
    """
    계정별 프록시 설정 조회
    우선순위: ① DB accounts.proxy_server (계정별 개별 설정)
             ② .env PROXY_SERVER (모든 계정 공통 글로벌 프록시)
             ③ None → 직접 연결
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

    # ── ① DB 계정 테이블: 계정별 개별 프록시 ────────────────────
    try:
        from database import get_account_proxy
        row = get_account_proxy(account_id)
        if row and row.get("server"):
            logger.info(f"[계정 {account_id}] DB 프록시 사용 시도: {row['server']}")
            proxy = _build_proxy(
                row["server"],
                row.get("username", ""),
                row.get("password", ""),
            )
            if proxy:
                return proxy
            logger.warning(f"[계정 {account_id}] DB 프록시 실패 → .env 글로벌 프록시로 fallback")
    except Exception as e:
        logger.warning(f"[계정 {account_id}] DB 프록시 조회 오류: {e}")

    # ── ② .env 글로벌 프록시: DB에 설정 없는 계정에 공통 적용 ───
    if settings.PROXY_SERVER:
        logger.info(f"[계정 {account_id}] .env 글로벌 프록시 사용 시도: {settings.PROXY_SERVER}")
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
