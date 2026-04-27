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

            # 아이디 입력 — 키보드 타이핑 (JS injection은 네이버가 탐지)
            await id_field.click()
            await random_delay(0.3, 0.7)
            await id_field.fill("")
            await id_field.type(naver_id, delay=random.randint(30, 80))
            await random_delay(0.5, 1.0)

            # 비밀번호 입력 - page.fill() 사용 (특수문자 안전, #pw 없으면 경고)
            pw_field = await page.query_selector("#pw")
            if pw_field:
                await pw_field.click()
                await pw_field.fill("")
                await pw_field.type(naver_password, delay=50)
                logger.debug(f"[계정 {account_id}] 비밀번호 입력 완료")
            else:
                logger.warning(f"[계정 {account_id}] #pw 필드 없음 — input[type=password] fallback")
                pw_alt = await page.query_selector("input[type=password]")
                if pw_alt:
                    await pw_alt.click()
                    await pw_alt.fill("")
                    await pw_alt.type(naver_password, delay=random.randint(30, 60))
                else:
                    logger.error(f"[계정 {account_id}] 비밀번호 필드를 찾을 수 없음")
            await random_delay(0.5, 1.0)

            # 로그인 버튼 클릭 (다양한 셀렉터 시도)
            btn = await page.query_selector(
                "#log\\.login, .btn_login, .btn_global, "
                "button[type='submit'], input[type='submit']"
            )
            if btn:
                await btn.click()
            else:
                logger.warning(f"[계정 {account_id}] 로그인 버튼을 찾지 못해 Enter로 대체")
                await page.keyboard.press("Enter")

            await page.wait_for_load_state("domcontentloaded", timeout=30000)
            await random_delay(3, 5)

            # ── 본인인증 요구 감지 ─────────────────────────────────
            page_text = await page.evaluate("() => document.body.innerText")
            if "허용하지 않은 지역" in page_text or "본인확인이 필요" in page_text or "휴대전화 번호" in page_text:
                logger.error(
                    f"[계정 {account_id}] 본인인증 요구 감지! URL: {page.url}"
                )
                await capture_debug(page, f"identity_verify_required_{account_id}")
                try:
                    from telegram_notifier import send_telegram_message
                    await send_telegram_message(
                        f"[계정 {account_id}] 네이버 본인인증 요구!\n"
                        f"네이버 보안설정에서 이 기기를 신뢰 기기로 등록하거나,\n"
                        f"쿠키를 수동으로 저장해주세요."
                    )
                except Exception:
                    pass
                await page.close()
                return False

            # ── CAPTCHA 감지 + 자동 풀이 ───────────────────────────
            has_captcha = False
            captcha = await page.query_selector(
                "#captcha, .captcha_wrap, #recaptcha, .captcha_area, "
                "#captchaimg, img[src*='captcha'], img[src*='ncaptcha'], "
                "input[name*='captcha'], input[placeholder*='정답']"
            )
            if captcha:
                has_captcha = True
            elif "자동입력 방지" in page_text or "정답을 입력" in page_text:
                has_captcha = True

            if has_captcha:
                logger.warning(f"[계정 {account_id}] CAPTCHA 감지 — 자동 풀이 시도")
                await capture_debug(page, f"captcha_account_{account_id}_attempt{attempt}")
                try:
                    from captcha_solver import detect_and_solve_captcha
                    result = await detect_and_solve_captcha(page)
                    if result == "solved":
                        logger.info(f"[계정 {account_id}] CAPTCHA 자동 풀이 성공")
                        # 비밀번호 재입력 (CAPTCHA 출현 시 비밀번호 필드가 초기화됨)
                        pw_retry = await page.query_selector("#pw")
                        if pw_retry:
                            await pw_retry.click()
                            await pw_retry.fill("")
                            await pw_retry.type(naver_password, delay=random.randint(30, 60))
                            await random_delay(0.5, 1.0)
                        # 로그인 버튼 재클릭
                        btn2 = await page.query_selector(
                            "#log\\.login, .btn_login, .btn_global, "
                            "button[type='submit']"
                        )
                        if btn2:
                            await btn2.click()
                        else:
                            await page.keyboard.press("Enter")
                        await page.wait_for_load_state("domcontentloaded", timeout=30000)
                        await random_delay(3, 5)
                        # 로그인 성공 확인
                        if "nidlogin" not in page.url:
                            cookies = await context.cookies()
                            _save_encrypted_cookies(cookie_path, cookies)
                            await _share_cookies_for_cbox(context)
                            logger.info(f"[계정 {account_id}] CAPTCHA 풀이 후 로그인 성공")
                            await page.close()
                            return True
                        logger.warning(f"[계정 {account_id}] CAPTCHA 풀이 후에도 로그인 실패")
                    else:
                        logger.error(f"[계정 {account_id}] CAPTCHA 자동 풀이 실패: {result}")
                except Exception as e:
                    logger.error(f"[계정 {account_id}] CAPTCHA 풀이 예외: {e}")
                await random_delay(3, 6)
                continue

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
            logger.info(f"[계정 {account_id}] ID/PW 로그인 성공 URL: {page.url}")
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
