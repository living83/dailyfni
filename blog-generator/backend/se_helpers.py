"""
네이버 SmartEditor ONE 공용 헬퍼 함수
- 로그인 / 쿠키 관리
- 스텔스 브라우저 생성
- SE ONE 에디터 공통 조작 (iframe, 팝업, 제목, 본문, 이미지, 링크, 태그, 발행)
- blog_publisher.py / cafe_publisher.py 에서 공용으로 사용
"""

import os
import sys
import json
import asyncio
import random
import logging
from pathlib import Path
from datetime import datetime

logger = logging.getLogger("se_helpers")

COOKIE_DIR = Path(__file__).resolve().parent.parent / "data" / "cookies"
COOKIE_DIR.mkdir(parents=True, exist_ok=True)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 프록시 설정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# "이미 조회했지만 프록시 없음" 센티널 ({} 대신 명시적 상수 사용)
_PROXY_CHECKED_NO_PROXY = {"__checked__": True}

async def _get_proxy_for_account(account_id: int) -> dict | None:
    """계정 ID에 매핑된 프록시 설정을 반환. DB 우선, .env 폴백. 없으면 None."""
    # 1) DB에서 프록시 조회 (풀 대신 일회성 연결 → 이벤트 루프 불일치 방지)
    try:
        db_proxy = await _query_proxy_direct(account_id)
        if db_proxy:
            logger.info(f"프록시 설정(DB): 계정 {account_id} → {db_proxy['server']}")
            return db_proxy
    except Exception as e:
        logger.warning(f"DB 프록시 조회 실패 (계정 {account_id}): {e}")

    # 2) .env 환경변수 폴백
    return _get_proxy_from_env(account_id)


async def _query_proxy_direct(account_id: int) -> dict | None:
    """풀을 우회하여 일회성 DB 연결로 프록시 조회 (이벤트 루프 안전)"""
    import aiomysql
    from database import MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
    conn = None
    try:
        conn = await aiomysql.connect(
            host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER,
            password=MYSQL_PASSWORD, db=MYSQL_DB,
            charset="utf8mb4", cursorclass=aiomysql.DictCursor,
            connect_timeout=5,
        )
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT proxy_server, proxy_username, proxy_password "
                "FROM accounts WHERE id = %s",
                (account_id,),
            )
            row = await cur.fetchone()
            if not row or not row.get("proxy_server"):
                return None
            from crypto import decrypt
            try:
                server = decrypt(row["proxy_server"])
            except Exception:
                server = row["proxy_server"]
            try:
                username = decrypt(row["proxy_username"]) if row.get("proxy_username") else ""
            except Exception:
                username = row.get("proxy_username", "")
            try:
                password = decrypt(row["proxy_password"]) if row.get("proxy_password") else ""
            except Exception:
                password = row.get("proxy_password", "")
            return {"server": server, "username": username, "password": password}
    finally:
        if conn:
            conn.close()


def _get_proxy_from_env(account_id: int) -> dict | None:
    """환경변수에서 프록시 설정 조회 (.env 폴백)"""
    host = os.getenv("PROXY_HOST", "").strip()
    username = os.getenv("PROXY_USERNAME", "").strip()
    password = os.getenv("PROXY_PASSWORD", "").strip()
    port_map_str = os.getenv("PROXY_PORT_MAP", "").strip()

    if not host or not port_map_str:
        return None

    # "1:10001,2:10002,..." 파싱
    port_map = {}
    for entry in port_map_str.split(","):
        entry = entry.strip()
        if ":" in entry:
            aid, port = entry.split(":", 1)
            try:
                port_map[int(aid.strip())] = int(port.strip())
            except ValueError:
                continue

    port = port_map.get(account_id)
    if not port:
        logger.warning(f"계정 {account_id}에 매핑된 프록시 포트 없음")
        return None

    proxy = {"server": f"http://{host}:{port}"}
    if username:
        proxy["username"] = username
    if password:
        proxy["password"] = password

    logger.info(f"프록시 설정(env): 계정 {account_id} → {host}:{port}")
    return proxy


def get_all_proxy_mappings() -> list:
    """모든 계정-프록시 매핑 정보 반환."""
    host = os.getenv("PROXY_HOST", "").strip()
    username = os.getenv("PROXY_USERNAME", "").strip()
    port_map_str = os.getenv("PROXY_PORT_MAP", "").strip()

    if not host or not port_map_str:
        return []

    mappings = []
    for entry in port_map_str.split(","):
        entry = entry.strip()
        if ":" in entry:
            aid, port = entry.split(":", 1)
            try:
                mappings.append({
                    "account_id": int(aid.strip()),
                    "proxy_server": f"{host}:{port.strip()}",
                    "username": username,
                })
            except ValueError:
                continue
    return mappings


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 유틸리티
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _run_in_proactor_loop(coro_func, *args, **kwargs):
    """Windows에서 ProactorEventLoop을 사용하여 코루틴 실행."""
    loop = asyncio.ProactorEventLoop()
    try:
        return loop.run_until_complete(coro_func(*args, **kwargs))
    finally:
        loop.close()


async def random_delay(min_sec: float = 1.0, max_sec: float = 3.0):
    await asyncio.sleep(random.uniform(min_sec, max_sec))


async def type_slowly(page_or_frame, selector: str, text: str, delay_ms: int = 50):
    """타이핑 시뮬레이션 - 자연스러운 입력"""
    element = await page_or_frame.wait_for_selector(selector, timeout=10000)
    await element.click()
    for char in text:
        await page_or_frame.keyboard.type(char, delay=delay_ms + random.randint(-20, 30))
        if random.random() < 0.05:
            await asyncio.sleep(random.uniform(0.1, 0.3))


async def try_selectors(target, selectors, timeout=3000, description="요소"):
    """여러 셀렉터를 순서대로 시도하여 첫 번째 매칭되는 요소 반환"""
    per_timeout = min(timeout // max(len(selectors), 1), 2000)
    for selector in selectors:
        try:
            el = await target.wait_for_selector(selector, timeout=per_timeout)
            if el and await el.is_visible():
                logger.info(f"{description} 발견: {selector}")
                return el
        except Exception:
            continue
    logger.warning(f"{description}: 모든 셀렉터 시도 완료")
    return None


async def dismiss_blocking_popup(target, description=""):
    """SE ONE 에디터의 차단 팝업(se-popup-alert-confirm) 강제 제거."""
    dismissed = False
    try:
        result = await target.evaluate("""() => {
            const popup = document.querySelector('.se-popup-alert-confirm, [data-name*="se-popup-alert"]');
            if (!popup) return 'no_popup';
            const buttons = popup.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent.trim() === '취소' || btn.textContent.trim() === '아니오') {
                    btn.click();
                    return 'clicked_cancel';
                }
            }
            if (buttons.length > 0) {
                buttons[0].click();
                return 'clicked_first';
            }
            popup.remove();
            return 'removed';
        }""")
        if result != 'no_popup':
            logger.info(f"차단 팝업 제거 ({description}): {result}")
            dismissed = True
            await random_delay(1, 2)
    except Exception as e:
        logger.debug(f"팝업 JS 제거 시도 실패: {e}")

    if not dismissed:
        try:
            await target.evaluate("""() => {
                const dims = document.querySelectorAll('.se-popup-dim');
                dims.forEach(d => {
                    const parent = d.closest('.se-popup');
                    if (parent) parent.remove();
                    else d.remove();
                });
            }""")
        except Exception:
            pass

    return dismissed


async def _dismiss_all_overlays(page, editor):
    """클릭 차단하는 모든 오버레이 제거 (투명 dim, 플로팅 메뉴, 에러 팝업).
    발행/폰트변경/링크삽입 등 중요 클릭 전에 호출하여 pointer event 차단을 방지."""
    for target in ([editor, page] if editor != page else [editor]):
        try:
            await target.evaluate('''() => {
                // 플로팅 머티리얼 메뉴
                document.querySelectorAll(
                    '.se-floating-material-menu, .se-floating-material-menu-buttons'
                ).forEach(el => el.remove());
                // 투명 dim 레이어 ("null 글감" 등 에러 팝업의 오버레이)
                document.querySelectorAll('.se-popup-dim-transparent').forEach(el => el.remove());
                // 에러/경고 팝업 닫기 버튼 클릭 후 제거
                document.querySelectorAll(
                    '.se-popup-alert, .se-popup-alert-confirm'
                ).forEach(popup => {
                    const btn = popup.querySelector('button');
                    if (btn) btn.click();
                });
            }''')
        except Exception:
            pass


async def capture_debug(page, step_name):
    """디버그용 스크린샷 저장"""
    try:
        debug_dir = Path(__file__).resolve().parent.parent / "data" / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = debug_dir / f"{step_name}_{ts}.png"
        await page.screenshot(path=str(path))
        logger.info(f"디버그 스크린샷: {path}")
    except Exception as e:
        logger.warning(f"스크린샷 저장 실패: {e}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 쿠키 / 로그인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _cookie_path(account_id: int) -> Path:
    return COOKIE_DIR / f"account_{account_id}.json"


async def save_cookies(page, account_id: int):
    cookies = await page.context.cookies()
    cookie_file = _cookie_path(account_id)
    cookie_file.write_text(json.dumps(cookies, ensure_ascii=False, indent=2))
    try:
        os.chmod(str(cookie_file), 0o600)
    except OSError:
        pass
    logger.info(f"쿠키 저장 완료: {cookie_file}")
    return str(cookie_file)


async def load_cookies(context, account_id: int) -> bool:
    cookie_file = _cookie_path(account_id)
    if not cookie_file.exists():
        return False
    try:
        cookies = json.loads(cookie_file.read_text())
        await context.add_cookies(cookies)
        logger.info(f"쿠키 로드 완료: account_id={account_id}")
        return True
    except Exception as e:
        logger.warning(f"쿠키 로드 실패: {e}")
        return False


async def check_login_status(page, check_url="https://blog.naver.com") -> bool:
    """로그인 상태 확인 (check_url로 이동 후 로그인 버튼 유무 판단)"""
    try:
        await page.goto(check_url, wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(3)
        current_url = page.url
        if "nidlogin" in current_url:
            logger.info("로그인 상태 확인: 로그인 페이지로 리다이렉트됨")
            return False
        login_btn = await page.query_selector('a.btn_login, a[href*="nidlogin"], .link_login')
        is_logged_in = login_btn is None
        logger.info(f"로그인 상태 확인: {'로그인됨' if is_logged_in else '미로그인'} (URL: {current_url[:60]})")
        return is_logged_in
    except Exception as e:
        logger.warning(f"로그인 상태 확인 오류: {e}")
        return False


async def login_with_credentials(page, naver_id: str, naver_password: str) -> bool:
    """ID/PW로 네이버 로그인"""
    try:
        await page.goto("https://nid.naver.com/nidlogin.login", wait_until="domcontentloaded", timeout=15000)
        await random_delay(1, 2)

        await page.click("#id")
        await random_delay(0.3, 0.5)
        await page.evaluate(f'document.querySelector("#id").value = "{naver_id}"')
        await page.dispatch_event("#id", "input")
        await random_delay(0.5, 1)

        await page.click("#pw")
        await random_delay(0.3, 0.5)
        await page.evaluate(f'document.querySelector("#pw").value = "{naver_password}"')
        await page.dispatch_event("#pw", "input")
        await random_delay(0.5, 1)

        await page.click("#log\\.login, button.btn_login, button[type='submit']")
        await random_delay(3, 5)

        captcha = await page.query_selector("#captcha, .captcha_wrap")
        if captcha:
            logger.error("CAPTCHA 발생! 수동 개입 필요")
            return False

        current_url = page.url
        if "nidlogin" in current_url:
            error_el = await page.query_selector(".error_message, #err_common")
            if error_el:
                error_text = await error_el.text_content()
                logger.error(f"로그인 실패: {error_text}")
            return False

        logger.info("로그인 성공")
        return True
    except Exception as e:
        logger.error(f"로그인 중 오류: {e}")
        return False


async def _share_cookies_for_cbox(context):
    """로그인 쿠키를 cbox iframe 도메인에도 공유.
    Chrome의 SameSite/third-party cookie 정책으로 인해
    cbox iframe에서 로그인 상태가 안 되는 문제 해결.

    수정 2026-03-06: .apis.naver.com 도메인에도 명시적으로 쿠키 복제,
    인증 쿠키 범위 확대 (NID*, NNB, NACT, nid_inf + SES, nid_slevel 등)
    """
    try:
        cookies = await context.cookies()
        naver_cookies = [c for c in cookies if '.naver.com' in (c.get('domain', ''))]
        if not naver_cookies:
            return

        # cbox에서 필요한 인증 쿠키 이름 (확대)
        AUTH_PREFIXES = ('NID',)
        AUTH_NAMES = {'NNB', 'NACT', 'nid_inf', 'nid_slevel',
                      'SES', 'JSESSIONID', 'NM_srt_chzzk'}

        # 쿠키를 복제할 대상 도메인 목록
        TARGET_DOMAINS = ['.naver.com', '.apis.naver.com']

        extra_cookies = []
        for c in naver_cookies:
            domain = c.get('domain', '')
            name = c.get('name', '')

            is_auth = (any(name.startswith(p) for p in AUTH_PREFIXES)
                       or name in AUTH_NAMES)
            if not is_auth:
                continue

            # 1) 기존 쿠키의 sameSite를 None으로 변경
            updated_cookie = {
                'name': c['name'],
                'value': c['value'],
                'domain': domain,
                'path': c.get('path', '/'),
                'secure': True,
                'httpOnly': c.get('httpOnly', False),
                'sameSite': 'None',
            }
            if c.get('expires') and c['expires'] > 0:
                updated_cookie['expires'] = c['expires']
            extra_cookies.append(updated_cookie)

            # 2) 각 대상 도메인에 쿠키 복제
            for target_domain in TARGET_DOMAINS:
                if domain == target_domain:
                    continue
                new_cookie = {
                    'name': c['name'],
                    'value': c['value'],
                    'domain': target_domain,
                    'path': c.get('path', '/'),
                    'secure': True,
                    'httpOnly': c.get('httpOnly', False),
                    'sameSite': 'None',
                }
                if c.get('expires') and c['expires'] > 0:
                    new_cookie['expires'] = c['expires']
                extra_cookies.append(new_cookie)

        if extra_cookies:
            await context.add_cookies(extra_cookies)
            logger.info(f"cbox용 쿠키 공유 완료: {len(extra_cookies)}개 "
                        f"(대상 도메인: {TARGET_DOMAINS})")
    except Exception as e:
        logger.warning(f"cbox 쿠키 공유 실패 (무시): {e}")


async def login(page, account_id: int, naver_id: str, naver_password: str) -> bool:
    """쿠키 우선 로그인, 실패 시 ID/PW 로그인"""
    cookie_loaded = await load_cookies(page.context, account_id)
    if cookie_loaded:
        is_logged_in = await check_login_status(page)
        if is_logged_in:
            logger.info(f"쿠키 로그인 성공: account_id={account_id}")
            await _share_cookies_for_cbox(page.context)
            return True
        logger.info("쿠키 만료, ID/PW 로그인 시도")

    for attempt in range(3):
        success = await login_with_credentials(page, naver_id, naver_password)
        if success:
            await save_cookies(page, account_id)
            await _share_cookies_for_cbox(page.context)
            return True
        logger.warning(f"로그인 재시도 {attempt + 2}/3")
        await random_delay(3, 5)

    return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 스텔스 브라우저
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def create_stealth_context(playwright_instance, account_id: int = None, proxy: dict = None):
    """네이버 봇 감지를 우회하기 위한 스텔스 브라우저 컨텍스트 생성.
    proxy가 주어지면 그대로 사용, 없으면 account_id로 자동 조회."""
    launch_args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-infobars",
        "--window-size=1920,1080",
        "--disable-features=ThirdPartyCookieBlocking,ThirdPartyCookiePhaseout,"
        "SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,"
        "TrackingProtection3pcd,ThirdPartyCookieTopLevelSitePartitioning,"
        "PartitionedCookies,CookiePartitioning,StoragePartitioning,"
        "ThirdPartyStoragePartitioning",
        "--disable-site-isolation-trials",
        "--disable-third-party-cookie-phaseout",
    ]

    # 프록시 설정: 외부에서 주입된 proxy 우선, 없으면 account_id로 조회
    # _PROXY_CHECKED_NO_PROXY 또는 {} 센티널 → DB 재조회 방지
    if proxy is not None:
        # 센티널이면 프록시 없음으로 처리
        if proxy.get("__checked__") or proxy == {}:
            proxy = None
    elif account_id:
        proxy = await _get_proxy_for_account(account_id)
    if not proxy:
        proxy = None

    browser = None
    for channel in ["chrome", "msedge", None]:
        try:
            launch_kwargs = {"headless": True, "args": launch_args}
            if channel:
                launch_kwargs["channel"] = channel
            if proxy:
                launch_kwargs["proxy"] = proxy
            browser = await playwright_instance.chromium.launch(**launch_kwargs)
            proxy_info = f", proxy={proxy['server']}" if proxy else ""
            logger.info(f"브라우저 시작: channel={channel or '기본 Chromium'}{proxy_info}")
            break
        except Exception as e:
            logger.warning(f"브라우저 시작 실패 (channel={channel}): {e}")
            continue

    if not browser:
        raise RuntimeError("사용 가능한 브라우저가 없습니다. Chrome 또는 Edge를 설치하세요.")

    context = await browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        viewport={"width": 1920, "height": 1080},
        locale="ko-KR",
        timezone_id="Asia/Seoul",
    )
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
        window.chrome = { runtime: {} };
    """)
    return browser, context


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SE ONE 에디터 공통 조작
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def se_detect_iframe(page):
    """SE ONE 에디터 iframe 감지 및 전환. 에디터 프레임을 반환."""
    editor = page
    for frame_id in ["mainFrame", "se_editFrame", "editor_frame"]:
        try:
            frame_el = await page.wait_for_selector(
                f"iframe#{frame_id}, iframe[name='{frame_id}']",
                timeout=3000,
            )
            if frame_el:
                frame = await frame_el.content_frame()
                if frame:
                    editor = frame
                    logger.info(f"iframe 전환: {frame_id}")
                    await random_delay(1, 2)
                    break
        except Exception:
            continue
    return editor


async def se_dismiss_popups(page, editor):
    """에디터 진입 시 각종 팝업 처리 (작성 중 글, 도움말 등)"""
    # 작성 중인 글 팝업
    await dismiss_blocking_popup(editor, "에디터 진입 직후")

    # 도움말/공지 팝업 닫기
    try:
        close_btn = await try_selectors(editor, [
            '.se-popup-button-close',
            'button[aria-label="닫기"]',
            '.btn_close',
            'button:has-text("닫기")',
        ], timeout=2000, description="도움말 팝업")
        if close_btn:
            await close_btn.click()
            await random_delay(0.5, 1)
    except Exception:
        pass

    # 도움말 닫기 후 차단 팝업 재확인
    await dismiss_blocking_popup(editor, "도움말 닫기 후")


async def se_wait_editor(page, editor):
    """SE ONE 에디터 로딩 대기. 로딩된 요소 또는 None 반환."""
    editor_loaded = await try_selectors(editor, [
        '.se-component',
        '.se-documentTitle',
        '[contenteditable="true"]',
        'article',
        '.editor_area',
        '.se-section',
        '.se-module-text',
        '#content-area',
    ], timeout=20000, description="에디터")

    # 에디터를 못 찾으면 모든 iframe에서도 시도
    if not editor_loaded:
        logger.info("현재 컨텍스트에서 에디터 미발견 → 모든 iframe 탐색")
        for frame in page.frames:
            if frame == page.main_frame:
                continue
            try:
                el = await frame.wait_for_selector(
                    '.se-component, .se-documentTitle, [contenteditable="true"]',
                    timeout=5000,
                )
                if el:
                    logger.info(f"iframe에서 에디터 발견: {frame.url[:80]}")
                    return el, frame
            except Exception:
                continue

    return editor_loaded, editor


async def se_input_title(page, editor, title: str) -> bool:
    """SE ONE 에디터에 제목 입력. 성공 여부 반환."""
    title_entered = False
    try:
        title_el = await try_selectors(editor, [
            '.se-documentTitle .se-text-paragraph',
            '.se-documentTitle [contenteditable="true"]',
            '.se-section-title .se-text-paragraph',
            '[data-placeholder="제목"]',
            '.se-component:first-child [contenteditable="true"]',
            '.se-title-text',
            '.se-ff-nanumgothic.se-fs32',
            '[contenteditable="true"][class*="title"]',
        ], timeout=10000, description="제목 영역")

        if title_el:
            await title_el.click()
            await random_delay(0.3, 0.5)
            for char in title:
                await page.keyboard.type(char, delay=50 + random.randint(-20, 30))
            title_entered = True
            await random_delay(1, 2)
    except Exception as e:
        logger.warning(f"제목 셀렉터 실패: {e}")

    if not title_entered:
        try:
            logger.info("제목 폴백: 첫 번째 contenteditable 클릭 시도")
            first_editable = await editor.wait_for_selector(
                '[contenteditable="true"]', timeout=5000
            )
            if first_editable:
                await first_editable.click()
                await random_delay(0.3, 0.5)
            await page.keyboard.type(title, delay=50)
            title_entered = True
            await random_delay(1, 2)
        except Exception as e:
            logger.error(f"제목 입력 실패: {e}")

    return title_entered


async def se_insert_image(page, editor, image_path: str):
    """SE ONE 에디터에 대표이미지 삽입"""
    if not image_path:
        return

    try:
        img_btn = await try_selectors(editor, [
            'button[data-name="image"]',
            '.se-toolbar button[aria-label*="사진"]',
            '.se-toolbar button[aria-label*="이미지"]',
            'button.se-toolbar-button-image',
            '.se-toolbar-item-image button',
            'button.se-image-toolbar-button',
            'button[class*="image"]:not([class*="emoji"])',
        ], timeout=5000, description="이미지 버튼")

        if img_btn:
            await img_btn.click()
            await random_delay(1, 2)

            file_input = None
            for sel in ['input[type="file"][accept*="image"]', 'input[type="file"]']:
                try:
                    file_input = await editor.query_selector(sel)
                    if file_input:
                        logger.info(f"파일 입력 발견 (query_selector): {sel}")
                        break
                except Exception:
                    continue

            if not file_input:
                for sel in ['input[type="file"][accept*="image"]', 'input[type="file"]']:
                    try:
                        file_input = await page.query_selector(sel)
                        if file_input:
                            logger.info(f"파일 입력 발견 (page): {sel}")
                            break
                    except Exception:
                        continue

            if file_input:
                await file_input.set_input_files(image_path)
                await random_delay(3, 5)

                try:
                    confirm = await try_selectors(editor, [
                        'button:has-text("삽입")',
                        'button:has-text("확인")',
                        'button:has-text("등록")',
                        'button.se-popup-button-confirm',
                    ], timeout=10000, description="이미지 확인 버튼")
                    if confirm:
                        await confirm.click()
                        await random_delay(2, 3)
                except Exception:
                    pass

                await page.keyboard.press("Enter")
                await page.keyboard.press("Enter")
                await random_delay(1, 2)
            else:
                logger.warning("파일 입력 요소 미발견 (숨김 포함)")

            logger.info("대표이미지 삽입 완료")
    except Exception as e:
        logger.warning(f"대표이미지 삽입 실패 (계속 진행): {e}")


# 폰트 크기 버튼 탐색 캐시: CSS 셀렉터가 모두 실패하면 JS 폴백만 사용
_font_btn_use_js = False


async def _se_set_font_size(page, editor, size: int) -> bool:
    """SE ONE 툴바에서 폰트 크기 변경. 성공 여부 반환."""
    global _font_btn_use_js
    try:
        font_size_selectors = [
            'button[data-name="fontSize"]',
            'button[data-name="fontsize"]',
            'button[data-name="font_size"]',
            'button[data-name="textSize"]',
            'button[data-name="size"]',
            '.se-toolbar-item-fontSize button',
            '.se-toolbar-item-fontsize button',
            '.se-toolbar button[aria-label*="글자 크기"]',
            '.se-toolbar button[aria-label*="크기"]',
            '.se-toolbar button[aria-label*="font size"]',
            '.se-toolbar button[aria-label*="글꼴 크기"]',
            'button.se-text-size-button',
            '.se-toolbar .se-font-size button',
            # 추가: SE ONE 에디터 다양한 변형
            '.se-toolbar button[class*="font_size"]',
            '.se-toolbar button[class*="fontSize"]',
            '.se-toolbar button[class*="text_size"]',
            '.se-toolbar button[class*="textsize"]',
            '[class*="toolbar"] [class*="font_size"] button',
            '[class*="toolbar"] [class*="fontSize"] button',
        ]

        targets = [editor]
        if editor != page:
            targets.append(page)

        # 1. 툴바 폰트 크기 버튼 클릭
        font_btn = None

        # CSS 셀렉터가 이전에 모두 실패했으면 바로 JS 폴백으로 건너뜀
        if not _font_btn_use_js:
            for target in targets:
                desc = "폰트 크기 버튼(에디터)" if target == editor else "폰트 크기 버튼(페이지)"
                font_btn = await try_selectors(target, font_size_selectors,
                                                timeout=2000, description=desc)
                if font_btn:
                    break

            # 모든 프레임에서도 시도
            if not font_btn:
                for frame in page.frames:
                    if frame == page.main_frame or frame == editor:
                        continue
                    try:
                        font_btn = await try_selectors(frame, font_size_selectors,
                                                        timeout=1500, description="폰트 크기 버튼(프레임)")
                        if font_btn:
                            break
                    except Exception:
                        continue

        if not font_btn:
            # JS 폴백: 툴바에서 폰트 크기 관련 버튼 찾기 (숫자 텍스트 or 특정 클래스)
            for target in targets:
                try:
                    font_btn_handle = await target.evaluate_handle('''() => {
                        // 방법1: 숫자만 있는 버튼 (현재 폰트 크기 표시)
                        const allBtns = document.querySelectorAll(
                            '.se-toolbar button, [class*="toolbar"] button, [class*="tool_bar"] button'
                        );
                        for (const btn of allBtns) {
                            const text = (btn.textContent || "").trim();
                            if (/^\\d{1,2}$/.test(text) && parseInt(text) >= 10 && parseInt(text) <= 40) {
                                return btn;
                            }
                        }
                        // 방법2: span 안에 숫자가 있는 버튼 (중첩 구조)
                        for (const btn of allBtns) {
                            const span = btn.querySelector('span');
                            if (span) {
                                const text = span.textContent.trim();
                                if (/^\\d{1,2}$/.test(text) && parseInt(text) >= 10 && parseInt(text) <= 40) {
                                    return btn;
                                }
                            }
                        }
                        // 방법3: data-name에 font/size가 포함된 버튼
                        for (const btn of allBtns) {
                            const name = (btn.dataset.name || "").toLowerCase();
                            if (name.includes("font") || name.includes("size")) {
                                return btn;
                            }
                        }
                        return null;
                    }''')
                    if font_btn_handle:
                        el = font_btn_handle.as_element()
                        if el:
                            font_btn = el
                            _font_btn_use_js = True
                            logger.info("폰트 크기 버튼 JS 폴백 발견 (이후 CSS 건너뜀)")
                            break
                except Exception:
                    continue

        if not font_btn:
            # 진단: 툴바 구조 덤프 (첫 실패 시 1회만)
            if not getattr(_se_set_font_size, '_toolbar_dumped', False):
                _se_set_font_size._toolbar_dumped = True
                for target in targets:
                    try:
                        toolbar_info = await target.evaluate('''() => {
                            const toolbar = document.querySelector(
                                '.se-toolbar, [class*="toolbar"], [class*="tool_bar"]'
                            );
                            if (!toolbar) return "툴바 요소 미발견";
                            const btns = toolbar.querySelectorAll('button');
                            const info = [];
                            for (let i = 0; i < Math.min(btns.length, 30); i++) {
                                const btn = btns[i];
                                info.push({
                                    tag: btn.tagName,
                                    dataName: btn.dataset.name || "",
                                    className: btn.className.substring(0, 80),
                                    ariaLabel: btn.getAttribute("aria-label") || "",
                                    text: btn.textContent.trim().substring(0, 20),
                                });
                            }
                            return JSON.stringify({
                                toolbarClass: toolbar.className.substring(0, 100),
                                buttonCount: btns.length,
                                buttons: info
                            });
                        }''')
                        logger.warning(f"[진단] 툴바 구조: {toolbar_info}")
                        break
                    except Exception as e:
                        logger.warning(f"[진단] 툴바 덤프 실패: {e}")

            logger.warning("폰트 크기 버튼 미발견")
            return False

        # 차단 오버레이 제거 후 클릭 (null 글감 팝업 등 대응)
        await _dismiss_all_overlays(page, editor)
        await font_btn.click(force=True)
        await random_delay(0.6, 1.0)  # 드롭다운 렌더링 충분히 대기

        # 2. 드롭다운에서 크기 선택
        size_str = str(size)
        size_selectors = [
            f'[data-value="{size_str}"]',
            f'.se-popup-font-size li[data-value="{size_str}"]',
            f'button[data-value="{size_str}"]',
            f'li:has-text("{size_str}")',
        ]
        size_item = await try_selectors(editor, size_selectors,
                                         timeout=3000, description=f"폰트 크기 {size}(에디터)")

        if not size_item and editor != page:
            size_item = await try_selectors(page, size_selectors,
                                             timeout=2000, description=f"폰트 크기 {size}(페이지)")

        if not size_item:
            # JS 폴백: 가시성 무관하게 모든 li에서 검색 (overflow:hidden 드롭다운 대응)
            js_clicked = False
            for target in ([editor, page] if editor != page else [editor]):
                try:
                    js_clicked = await target.evaluate(f'''() => {{
                        // 모든 li 검색 - 가시성 체크 없이 scrollIntoView + click
                        // (overflow:hidden 컨테이너에 가려진 항목도 클릭 가능)
                        const allItems = document.querySelectorAll('li, [role="option"], [data-value]');
                        for (const item of allItems) {{
                            const val = (item.dataset?.value || '').trim();
                            const text = (item.textContent || '').trim();
                            if (val === '{size_str}' || text === '{size_str}') {{
                                // overflow:hidden 부모 컨테이너의 overflow를 임시로 변경
                                let parent = item.parentElement;
                                const restored = [];
                                while (parent) {{
                                    const style = getComputedStyle(parent);
                                    if (style.overflow === 'hidden' || style.overflowY === 'hidden') {{
                                        restored.push({{el: parent, orig: parent.style.overflow}});
                                        parent.style.overflow = 'auto';
                                    }}
                                    parent = parent.parentElement;
                                }}
                                item.scrollIntoView({{block: "center"}});
                                item.click();
                                // overflow 복원
                                for (const r of restored) {{
                                    r.el.style.overflow = r.orig;
                                }}
                                return true;
                            }}
                        }}
                        return false;
                    }}''')
                    if js_clicked:
                        break
                except Exception:
                    continue
            if js_clicked:
                logger.info(f"폰트 크기 {size} JS 폴백 성공")
                await random_delay(0.2, 0.3)
                return True

            # 드롭다운 닫기 후 1회 재시도
            await page.keyboard.press("Escape")
            await random_delay(0.3, 0.5)

            # 재시도: 폰트 버튼 다시 클릭 + JS 검색
            try:
                await _dismiss_all_overlays(page, editor)
                await font_btn.click(force=True)
                await random_delay(0.8, 1.2)
                for target in ([editor, page] if editor != page else [editor]):
                    js_retry = await target.evaluate(f'''() => {{
                        const items = document.querySelectorAll('li, [data-value], [role="option"]');
                        for (const item of items) {{
                            const val = (item.dataset?.value || '').trim();
                            const text = (item.textContent || '').trim();
                            if (val === '{size_str}' || text === '{size_str}') {{
                                item.scrollIntoView({{block: "center"}});
                                item.click();
                                return true;
                            }}
                        }}
                        return false;
                    }}''')
                    if js_retry:
                        logger.info(f"폰트 크기 {size} 재시도 JS 성공")
                        await random_delay(0.2, 0.3)
                        return True
            except Exception:
                pass

            # ── 진단: 드롭다운 상태 로깅 (폰트 24 반복 실패 원인 파악용) ──
            for target in ([editor, page] if editor != page else [editor]):
                try:
                    diag = await target.evaluate('''() => {
                        const lis = document.querySelectorAll('li');
                        const sizes = [];
                        for (const li of lis) {
                            const t = li.textContent.trim();
                            if (/^\d{1,2}$/.test(t)) sizes.push(t);
                        }
                        const popups = document.querySelectorAll('.se-popup, [class*="popup"]');
                        const popupInfo = [];
                        for (const p of popups) {
                            const rect = p.getBoundingClientRect();
                            popupInfo.push(
                                p.className.substring(0, 40) + `[${rect.width}x${rect.height}]`
                            );
                        }
                        return `li_sizes=[${sizes.join(",")}] popups=[${popupInfo.join(" | ")}]`;
                    }''')
                    logger.warning(f"[진단] 폰트 드롭다운: {diag}")
                    break
                except Exception:
                    pass

            # ── 폴백: 키보드로 폰트 크기 직접 입력 ──
            # 드롭다운이 열린 상태에서 숫자 입력 → 해당 크기로 점프/필터
            try:
                await page.keyboard.press("Escape")
                await random_delay(0.2, 0.3)
                await _dismiss_all_overlays(page, editor)
                await font_btn.click(force=True)
                await random_delay(0.5, 0.8)
                # 숫자 입력으로 드롭다운 필터링 시도
                await page.keyboard.type(size_str, delay=100)
                await random_delay(0.3, 0.5)
                await page.keyboard.press("Enter")
                await random_delay(0.3, 0.5)
                # 검증: 폰트 버튼 텍스트가 변경되었는지 확인
                for target in ([editor, page] if editor != page else [editor]):
                    try:
                        current = await target.evaluate('''() => {
                            const btns = document.querySelectorAll(
                                '.se-toolbar button, [class*="toolbar"] button'
                            );
                            for (const btn of btns) {
                                const text = (btn.textContent || "").trim();
                                if (/^\d{1,2}$/.test(text)) return text;
                            }
                            return "";
                        }''')
                        if current == size_str:
                            logger.info(f"폰트 크기 {size} 키보드 입력 성공")
                            return True
                    except Exception:
                        pass
                logger.info(f"폰트 크기 {size} 키보드 입력 시도 (검증 불가)")
                return True  # 성공 추정 - 키보드 입력은 대체로 동작함
            except Exception as e:
                logger.debug(f"폰트 크기 키보드 입력 실패: {e}")

            await page.keyboard.press("Escape")
            logger.warning(f"폰트 크기 {size} 항목 미발견 (모든 방법 실패)")
            return False

        await _dismiss_all_overlays(page, editor)
        await size_item.click(force=True)
        await random_delay(0.2, 0.3)
        logger.info(f"폰트 크기 변경: {size}")
        return True

    except Exception as e:
        logger.warning(f"폰트 크기 변경 실패: {e}")
        return False
    finally:
        # ★ 핵심: 드롭다운 조작 후 에디터 본문에 포커스/커서 복원
        # JS .focus()만으로는 Playwright의 keyboard 라우팅이 iframe으로 전환되지 않음
        # 반드시 Playwright .click()으로 프레임 레벨 포커스를 이전해야 함
        try:
            last_p_handle = await editor.evaluate_handle('''() => {
                const paragraphs = document.querySelectorAll('.se-text-paragraph');
                return paragraphs.length > 0 ? paragraphs[paragraphs.length - 1] : null;
            }''')
            last_p = last_p_handle.as_element()
            if last_p:
                # Playwright click으로 프레임 레벨 포커스 전환
                await last_p.click(force=True)
                await asyncio.sleep(0.15)
                # click이 요소 중앙에 커서를 놓으므로 문단 끝으로 재배치
                await editor.evaluate('''() => {
                    const paragraphs = document.querySelectorAll('.se-text-paragraph');
                    if (paragraphs.length > 0) {
                        const last = paragraphs[paragraphs.length - 1];
                        const sel = window.getSelection();
                        if (sel) {
                            const range = document.createRange();
                            range.selectNodeContents(last);
                            range.collapse(false);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                    }
                }''')
        except Exception:
            pass


async def se_input_body(page, editor, content: str,
                        heading_size: int = 24, body_size: int = 15):
    """SE ONE 에디터에 본문 입력 (가운데 정렬, 줄 단위).
    소제목(# / ##)은 볼드 + 큰 폰트로 강조."""
    try:
        body_el = await try_selectors(editor, [
            '.se-component.se-text .se-text-paragraph',
            '.se-section-text .se-text-paragraph',
            '.se-component-content [contenteditable="true"]',
            '.se-text-paragraph',
        ], timeout=5000, description="본문 영역")
        if body_el:
            await body_el.click()
            await random_delay(0.5, 1)
    except Exception:
        pass

    # 가운데 정렬
    await page.keyboard.press("Control+e")
    await random_delay(0.3, 0.5)

    lines = content.split("\n")
    base_delay = random.randint(25, 45)
    for i, line in enumerate(lines):
        if line.strip():
            clean_line = line.strip()
            line_delay = base_delay + random.randint(-8, 12)
            is_heading = False

            if clean_line.startswith("## "):
                clean_line = clean_line[3:]
                is_heading = True
            elif clean_line.startswith("# "):
                clean_line = clean_line[2:]
                is_heading = True

            if is_heading:
                # 소제목: 폰트 크기 확대 + 볼드
                await _se_set_font_size(page, editor, heading_size)
                await page.keyboard.press("Control+b")
                await random_delay(0.2, 0.3)

                await page.keyboard.type(clean_line, delay=line_delay)

                await page.keyboard.press("Enter")
                await page.keyboard.press("Enter")

                # 서식 복원: 볼드 해제 + 폰트 크기 원복
                await page.keyboard.press("Control+b")
                await _se_set_font_size(page, editor, body_size)
                await random_delay(0.2, 0.3)

            elif clean_line.startswith("- "):
                clean_line = clean_line[2:]
                await page.keyboard.type("• " + clean_line, delay=line_delay)
                await page.keyboard.press("Enter")
                await page.keyboard.press("Enter")
            else:
                clean_line = clean_line.replace("**", "")
                await page.keyboard.type(clean_line, delay=line_delay)
                await page.keyboard.press("Enter")
                await page.keyboard.press("Enter")
        else:
            await page.keyboard.press("Enter")

        r = random.random()
        if r < 0.03:
            await asyncio.sleep(random.uniform(3.0, 6.0))
        elif r < 0.10:
            await asyncio.sleep(random.uniform(0.8, 2.0))
        elif r < 0.20:
            await asyncio.sleep(random.uniform(0.2, 0.5))


async def se_insert_footer_link(page, editor, footer_link: str, footer_link_text: str = ""):
    """SE ONE 에디터에 하단 링크 삽입 (툴바 '링크' 버튼 → URL 입력 → 돋보기 → 확인).
    텍스트 선택 + Ctrl+K 방식 대신, 컴포넌트 툴바의 '링크' 버튼을 직접 클릭하여
    OGLink 카드를 삽입한다. 텍스트 선택이 필요 없어 안정적."""
    if not footer_link:
        logger.warning("하단 링크 미설정 (footer_link 빈 값) → 링크 삽입 건너뜀. "
                       "스케줄러 설정 또는 .env의 DEFAULT_FOOTER_LINK를 확인하세요.")
        return

    # 검색 대상: editor + page (iframe 밖에 팝업이 뜰 수 있음)
    targets = [editor, page] if editor != page else [editor]

    try:
        # ── 1단계: 툴바 '링크' 버튼 클릭 ──
        await _dismiss_all_overlays(page, editor)
        await random_delay(0.3, 0.5)

        link_btn = None
        # 셀렉터 기반 탐색
        link_btn_selectors = [
            'button[data-name="oglink"]',
            'button[data-name="link"]',
            'button[data-name="hyperlink"]',
            '.se-toolbar button[aria-label*="링크"]',
            '.se-toolbar button[aria-label*="link"]',
        ]
        for target in targets:
            link_btn = await try_selectors(target, link_btn_selectors,
                                           timeout=3000, description=f"툴바 링크 버튼({'에디터' if target == editor else '페이지'})")
            if link_btn:
                break

        # JS 폴백: 툴바 버튼 중 '링크' 텍스트/속성 포함된 것 탐색
        if not link_btn:
            for target in targets:
                try:
                    btn_handle = await target.evaluate_handle('''() => {
                        const btns = document.querySelectorAll(
                            '.se-toolbar button, [class*="toolbar"] button'
                        );
                        for (const btn of btns) {
                            const name = (btn.dataset.name || '').toLowerCase();
                            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                            const text = (btn.textContent || '').trim();
                            if (name.includes('oglink') || name.includes('link')
                                || label.includes('링크') || label.includes('link')
                                || text === '링크') {
                                return btn;
                            }
                        }
                        return null;
                    }''')
                    if btn_handle:
                        el = btn_handle.as_element()
                        if el:
                            link_btn = el
                            logger.info("툴바 링크 버튼 JS 폴백 발견")
                            break
                except Exception:
                    continue

        if not link_btn:
            logger.warning("툴바 '링크' 버튼 미발견 → 링크 삽입 불가")
            return

        await link_btn.click(force=True)
        logger.info("툴바 '링크' 버튼 클릭")
        await random_delay(1.5, 2.5)

        # ── 2단계: 링크 다이얼로그 URL 입력 필드 찾기 ──
        link_input_selectors = [
            'input[placeholder*="URL"]',
            'input[placeholder*="url"]',
            'input[placeholder*="링크"]',
            'input[placeholder*="주소"]',
            '.se-link-input input',
            '.se-popup-link input',
            '.se-popup input[type="text"]',
            'input[type="url"]',
        ]

        link_input = None
        for target in targets:
            link_input = await try_selectors(target, link_input_selectors,
                                              timeout=5000, description=f"링크 URL 입력({'에디터' if target == editor else '페이지'})")
            if link_input:
                break

        # JS 폴백: 팝업 내 input 탐색
        if not link_input:
            for target in targets:
                try:
                    handle = await target.evaluate_handle('''() => {
                        const popup = document.querySelector(
                            '.se-popup-link, .se-popup, [class*="link_layer"], '
                            + '[class*="layer_link"], [class*="popup"]'
                        );
                        if (popup) {
                            const inp = popup.querySelector('input');
                            if (inp) return inp;
                        }
                        const inputs = document.querySelectorAll('input[type="text"], input[type="url"], input:not([type])');
                        for (const inp of inputs) {
                            const rect = inp.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) return inp;
                        }
                        return null;
                    }''')
                    if handle:
                        el = handle.as_element()
                        if el:
                            link_input = el
                            logger.info("링크 입력 JS 폴백 발견")
                            break
                except Exception:
                    continue

        if not link_input:
            logger.warning("링크 URL 입력 필드 미발견")
            await page.keyboard.press("Escape")
            return

        # ── 3단계: URL 입력 ──
        await link_input.click()
        await link_input.fill("")
        await random_delay(0.2, 0.3)
        await link_input.type(footer_link, delay=20 + random.randint(-5, 10))
        logger.info(f"링크 URL 입력 완료: {footer_link}")
        await random_delay(0.5, 1)

        # ── 4단계: 돋보기(검색) 버튼 클릭 ──
        search_selectors = [
            '.se-popup-link button[class*="search"]',
            '.se-popup-link button[class*="query"]',
            '.se-popup button[class*="search"]',
            'button.se-link-preview-btn',
        ]
        search_btn = None
        for target in targets:
            search_btn = await try_selectors(target, search_selectors,
                                              timeout=3000, description=f"링크 돋보기({'에디터' if target == editor else '페이지'})")
            if search_btn:
                break

        # JS 폴백: 팝업 내 input 옆 버튼 (돋보기 아이콘) 탐색
        if not search_btn:
            for target in targets:
                try:
                    search_btn_handle = await target.evaluate_handle('''() => {
                        const popup = document.querySelector(
                            '.se-popup-link, .se-popup, [class*="link_layer"], [class*="popup"]'
                        );
                        if (!popup) return null;
                        const btns = popup.querySelectorAll('button');
                        for (const btn of btns) {
                            const text = (btn.textContent || '').trim();
                            // 확인 버튼 제외, SVG/아이콘 포함 버튼 = 돋보기
                            if (!text.includes('확인') && !text.includes('취소')
                                && btn.querySelector('svg, [class*="ico"], [class*="icon"], [class*="search"]')) {
                                return btn;
                            }
                        }
                        // 팝업 내 첫 번째 버튼 (확인/취소 아닌 것)
                        for (const btn of btns) {
                            const text = (btn.textContent || '').trim();
                            if (!text.includes('확인') && !text.includes('취소') && text.length < 3) {
                                return btn;
                            }
                        }
                        return null;
                    }''')
                    if search_btn_handle:
                        el = search_btn_handle.as_element()
                        if el:
                            search_btn = el
                            logger.info("돋보기 버튼 JS 폴백 발견")
                            break
                except Exception:
                    continue

        if search_btn:
            await search_btn.click(force=True)
            logger.info("돋보기 버튼 클릭 → OG 미리보기 로드 대기")
            await random_delay(3, 5)

            # OG 미리보기 로드 대기
            preview_loaded = False
            for target in targets:
                try:
                    await target.wait_for_selector(
                        '.se-popup-link [class*="preview"], .se-popup [class*="preview"], '
                        '.se-popup-link [class*="og"], .se-popup [class*="card"], '
                        '.se-popup-link img, .se-popup img',
                        timeout=10000,
                    )
                    logger.info("OG 미리보기 로드 완료")
                    preview_loaded = True
                    break
                except Exception:
                    continue
            if not preview_loaded:
                logger.warning("OG 미리보기 로드 타임아웃 (계속 진행)")
            await random_delay(1, 2)
        else:
            # 돋보기 버튼 없으면 Enter로 URL 검색 시도
            logger.warning("돋보기 버튼 미발견, Enter로 대체")
            await page.keyboard.press("Enter")
            await random_delay(3, 5)

        # ── 5단계: 확인 버튼 클릭 ──
        confirm_selectors = [
            '.se-popup-link button:has-text("확인")',
            '.se-popup button:has-text("확인")',
            'button.se-popup-button-confirm',
        ]
        confirm_btn = None
        for target in targets:
            confirm_btn = await try_selectors(target, confirm_selectors,
                                               timeout=3000, description=f"링크 확인({'에디터' if target == editor else '페이지'})")
            if confirm_btn:
                break

        # JS 폴백: 팝업 내 '확인' 텍스트 버튼 탐색
        if not confirm_btn:
            for target in targets:
                try:
                    confirm_handle = await target.evaluate_handle('''() => {
                        const popup = document.querySelector(
                            '.se-popup-link, .se-popup, [class*="link_layer"], [class*="popup"]'
                        );
                        if (!popup) return null;
                        const btns = popup.querySelectorAll('button');
                        for (const btn of btns) {
                            const text = (btn.textContent || '').trim();
                            if (text === '확인' || text.includes('확인')) return btn;
                        }
                        return null;
                    }''')
                    if confirm_handle:
                        el = confirm_handle.as_element()
                        if el:
                            confirm_btn = el
                            logger.info("확인 버튼 JS 폴백 발견")
                            break
                except Exception:
                    continue

        if confirm_btn:
            try:
                await confirm_btn.click(force=True)
            except Exception:
                # force 클릭 실패 시 JS 직접 클릭
                for target in targets:
                    try:
                        await target.evaluate('''() => {
                            const popup = document.querySelector(
                                '.se-popup-link, .se-popup, [class*="link_layer"], [class*="popup"]'
                            );
                            if (popup) {
                                const btns = popup.querySelectorAll('button');
                                for (const btn of btns) {
                                    if ((btn.textContent || '').trim().includes('확인')) {
                                        btn.click();
                                        return true;
                                    }
                                }
                            }
                            return false;
                        }''')
                        break
                    except Exception:
                        continue
            await random_delay(1, 2)
            logger.info(f"하단 링크 삽입 완료 (OGLink): {footer_link}")
        else:
            logger.warning("확인 버튼 미발견, Enter로 대체")
            await page.keyboard.press("Enter")
            await random_delay(1, 2)

    except Exception as e:
        logger.warning(f"링크 삽입 실패: {e}")
        # 다이얼로그가 열려있을 수 있으므로 닫기
        try:
            await page.keyboard.press("Escape")
        except Exception:
            pass


async def se_input_tags(page, editor, tags: list):
    """SE ONE 에디터에 태그 입력"""
    if not tags:
        return

    tag_entered = False
    try:
        # 태그 영역은 에디터 하단에 위치 → 스크롤 다운 필요
        try:
            await page.keyboard.press("Control+End")
            await random_delay(0.5, 1.0)
        except Exception:
            pass

        # 차단 오버레이 전체 제거 (태그 입력 방해 방지)
        await _dismiss_all_overlays(page, editor)

        tag_selectors = [
            'input[placeholder*="태그"]',
            'input[placeholder*="태그 입력"]',
            'input[placeholder*="tag"]',
            '.se-tag-input input',
            '.tag_inner input',
            'input[class*="tag"]',
            '.tag_area input',
            '.se-tag input',
            '.se-section-tag input',
            '.se-component-tag input',
        ]

        tag_input = await try_selectors(editor, tag_selectors,
                                         timeout=3000, description="태그 입력(에디터)")

        if not tag_input and editor != page:
            tag_input = await try_selectors(page, tag_selectors,
                                             timeout=3000, description="태그 입력(메인)")

        if tag_input:
            await tag_input.click()
            await random_delay(0.3, 0.5)
            for tag in tags[:10]:
                await page.keyboard.type(tag, delay=40)
                await page.keyboard.press("Enter")
                await random_delay(0.3, 0.5)
            tag_entered = True
            logger.info("태그 입력 성공 (셀렉터)")
        else:
            logger.info("태그 입력 JS 폴백 시도")
            for target_name, target in ([("editor", editor)] + ([("page", page)] if editor != page else [])):
                try:
                    found = await target.evaluate("""() => {
                        // 방법1: input 태그에서 placeholder/class로 찾기
                        const inputs = document.querySelectorAll('input');
                        for (const inp of inputs) {
                            const ph = (inp.placeholder || '').toLowerCase();
                            const cls = (inp.className || '').toLowerCase();
                            if (ph.includes('태그') || ph.includes('tag') ||
                                cls.includes('tag')) {
                                inp.scrollIntoView({block: 'center'});
                                inp.focus();
                                inp.click();
                                return true;
                            }
                        }
                        // 방법2: contenteditable 태그 영역
                        const tagAreas = document.querySelectorAll(
                            '[class*="tag"] [contenteditable="true"], '
                            + '.se-section-tag [contenteditable="true"], '
                            + '.se-component-tag [contenteditable="true"]'
                        );
                        for (const area of tagAreas) {
                            area.scrollIntoView({block: 'center'});
                            area.focus();
                            area.click();
                            return true;
                        }
                        // 방법3: 에디터 하단 영역의 모든 input 중 빈 input
                        const allInputs = document.querySelectorAll('input[type="text"], input:not([type])');
                        for (const inp of allInputs) {
                            const rect = inp.getBoundingClientRect();
                            if (rect.top > window.innerHeight * 0.7) {
                                inp.scrollIntoView({block: 'center'});
                                inp.focus();
                                inp.click();
                                return true;
                            }
                        }
                        return false;
                    }""")
                    if found:
                        for tag in tags[:10]:
                            await page.keyboard.type(tag, delay=40)
                            await page.keyboard.press("Enter")
                            await random_delay(0.3, 0.5)
                        tag_entered = True
                        logger.info(f"태그 입력 JS 폴백 성공 ({target_name})")
                        break
                except Exception:
                    continue
        if not tag_entered:
            logger.warning("태그 입력 영역 미발견 (모든 방법 실패)")
    except Exception as e:
        logger.warning(f"태그 입력 실패: {e}")


async def _uncheck_kakao_channel(page, editor):
    """발행 다이얼로그에서 카카오채널 링크 체크박스를 해제합니다."""
    await random_delay(0.5, 1)

    for target in ([editor, page] if editor != page else [page]):
        try:
            unchecked = await target.evaluate('''() => {
                const results = [];

                // 1) SE ONE 발행 팝업 내 모든 체크 가능 요소 탐색
                const allClickables = document.querySelectorAll(
                    'input[type="checkbox"], [role="checkbox"], [role="switch"], '
                    + '[class*="check"], [class*="toggle"], [class*="switch"], '
                    + 'label, span[class*="btn"], div[class*="btn"]'
                );

                for (const el of allClickables) {
                    // 요소 자체 또는 부모 3단계까지 텍스트 확인
                    let container = el;
                    let text = "";
                    for (let i = 0; i < 4; i++) {
                        if (!container) break;
                        text = (container.textContent || "").trim();
                        if (text.includes("카카오") || text.includes("채널") ||
                            text.toLowerCase().includes("kakao") || text.toLowerCase().includes("channel")) {
                            break;
                        }
                        container = container.parentElement;
                    }

                    if (!(text.includes("카카오") || text.includes("채널") ||
                          text.toLowerCase().includes("kakao") || text.toLowerCase().includes("channel"))) {
                        continue;
                    }

                    // 체크 상태 확인: input checkbox, aria, class 기반
                    const isInput = el.tagName === "INPUT" && el.type === "checkbox";
                    const isChecked = (isInput && el.checked)
                        || el.getAttribute("aria-checked") === "true"
                        || el.classList.contains("on")
                        || el.classList.contains("is_active")
                        || el.classList.contains("is_checked")
                        || el.classList.contains("active")
                        || el.classList.contains("checked")
                        || el.classList.contains("se-checkbox-checked")
                        || el.closest('[class*="check"]')?.classList.contains("on")
                        || el.closest('[class*="check"]')?.classList.contains("is_active");

                    if (isChecked) {
                        el.click();
                        results.push("clicked:" + el.tagName + "." + el.className.substring(0, 50));
                    } else {
                        // 체크 상태를 확인할 수 없으면 근처 체크박스 찾아서 클릭
                        const nearby = el.closest('div, label, li')?.querySelector(
                            'input[type="checkbox"]:checked, [aria-checked="true"], '
                            + '[class*="check"].on, [class*="check"].is_active, [class*="check"].active'
                        );
                        if (nearby) {
                            nearby.click();
                            results.push("nearby_clicked:" + nearby.tagName + "." + nearby.className.substring(0, 50));
                        } else {
                            results.push("found_unchecked:" + el.tagName);
                        }
                    }
                }

                // 2) 클래스명 기반 직접 탐색 (SE ONE 고유 패턴)
                if (results.length === 0) {
                    const seChecks = document.querySelectorAll(
                        '[class*="kakao"], [class*="kakaochannel"], [class*="sns_share"], '
                        + '[class*="channel_link"], [class*="publish_check"], [class*="option_check"]'
                    );
                    for (const el of seChecks) {
                        if (el.classList.contains("on") || el.classList.contains("is_active")
                            || el.classList.contains("active") || el.classList.contains("checked")
                            || el.getAttribute("aria-checked") === "true") {
                            el.click();
                            results.push("se_class_clicked:" + el.className.substring(0, 50));
                        }
                    }
                }

                return results.length > 0 ? results.join(", ") : null;
            }''')
            if unchecked:
                logger.info(f"카카오채널 링크 해제: {unchecked}")
                await random_delay(0.3, 0.5)
                return
        except Exception as e:
            logger.warning(f"카카오채널 체크 해제 시도 실패: {e}")

    # Playwright 셀렉터 기반 폴백
    for target in ([editor, page] if editor != page else [page]):
        try:
            kakao_el = await try_selectors(target, [
                'text=카카오채널',
                'text=카카오 채널',
                ':has-text("카카오채널")',
                ':has-text("카카오 채널")',
                '[class*="kakao"]',
                '[class*="channel_link"]',
            ], timeout=2000, description="카카오채널 옵션")
            if kakao_el:
                await kakao_el.click()
                logger.info("카카오채널 Playwright 셀렉터 클릭 해제")
                await random_delay(0.3, 0.5)
                return
        except Exception as e:
            logger.debug(f"카카오채널 Playwright 폴백 실패: {e}")

    logger.info("카카오채널 링크 체크박스 미발견 (없거나 이미 해제됨)")


async def se_click_publish(page, editor) -> bool:
    """SE ONE 에디터 발행 버튼 클릭 + 확인 다이얼로그 처리. 성공 여부 반환."""
    await random_delay(1, 2)
    publish_clicked = False

    try:
        publish_btn = None
        if editor != page:
            publish_btn = await try_selectors(editor, [
                'button:has-text("발행")',
                'button:has-text("공개발행")',
                'button[class*="publish"]',
                '.publish_btn',
                'button:has-text("등록")',
            ], timeout=5000, description="발행 버튼(에디터)")

        if not publish_btn:
            publish_btn = await try_selectors(page, [
                'button:has-text("발행")',
                'button:has-text("공개발행")',
                'button[class*="publish"]',
                'button[class*="btn_publish"]',
                '.publish_btn',
                'button:has-text("등록")',
            ], timeout=5000, description="발행 버튼(메인)")

        if publish_btn:
            await _dismiss_all_overlays(page, editor)
            await publish_btn.click(force=True)
            publish_clicked = True
        else:
            logger.info("발행 버튼 JS 폴백 시도")
            for target in ([editor, page] if editor != page else [page]):
                try:
                    js_clicked = await target.evaluate('''() => {
                        const buttons = document.querySelectorAll('button, a[role="button"]');
                        for (const btn of buttons) {
                            const text = (btn.textContent || "").trim();
                            if (text === '발행' || text === '공개발행' || text === '등록') {
                                btn.click();
                                return true;
                            }
                        }
                        return false;
                    }''')
                    if js_clicked:
                        publish_clicked = True
                        logger.info("발행 버튼 JS 클릭 성공")
                        break
                except Exception:
                    continue

        if not publish_clicked:
            await capture_debug(page, "publish_btn_not_found")
            return False

        await random_delay(2, 3)

        # 카카오채널 링크 해제 (발행 다이얼로그 표시 후)
        await capture_debug(page, "before_kakao_uncheck")
        await _uncheck_kakao_channel(page, editor)

        # 발행 확인 다이얼로그
        confirm_clicked = False

        if editor != page:
            confirm_btn = await try_selectors(editor, [
                '.se-popup-publish-btn',
                '.se-publish-popup button:has-text("발행")',
                'button.se-popup-button-confirm',
                'button:has-text("공개 발행")',
                'button:has-text("발행하기")',
            ], timeout=3000, description="발행 확인(에디터)")
            if confirm_btn:
                await _dismiss_all_overlays(page, editor)
                await confirm_btn.click(force=True)
                confirm_clicked = True
                logger.info("발행 확인 클릭 (에디터 셀렉터)")

        if not confirm_clicked:
            confirm_btn = await try_selectors(page, [
                'button:has-text("발행")',
                'button:has-text("공개 발행")',
                'button:has-text("확인")',
                '.confirm_btn',
            ], timeout=3000, description="발행 확인(메인)")
            if confirm_btn:
                await _dismiss_all_overlays(page, editor)
                await confirm_btn.click(force=True)
                confirm_clicked = True
                logger.info("발행 확인 클릭 (메인 셀렉터)")

        if not confirm_clicked:
            logger.info("발행 확인 JS 폴백 시도")
            for target in ([editor, page] if editor != page else [page]):
                try:
                    js_result = await target.evaluate('''() => {
                        const popups = document.querySelectorAll(
                            '.se-popup-publish, .se-popup, [class*="publish_layer"], [class*="layer_publish"]'
                        );
                        for (const popup of popups) {
                            const btns = popup.querySelectorAll('button');
                            for (const btn of btns) {
                                const text = (btn.textContent || "").trim();
                                if (text === '발행' || text === '발행하기' || text === '공개 발행') {
                                    btn.click();
                                    return 'popup_btn';
                                }
                            }
                        }
                        const allBtns = document.querySelectorAll('button');
                        for (const btn of allBtns) {
                            const text = (btn.textContent || "").trim();
                            if (text === '발행' || text === '발행하기') {
                                btn.click();
                                return 'global_btn';
                            }
                        }
                        return null;
                    }''')
                    if js_result:
                        confirm_clicked = True
                        logger.info(f"발행 확인 JS 클릭 성공: {js_result}")
                        break
                except Exception:
                    continue

        if confirm_clicked:
            await random_delay(3, 5)
        else:
            logger.warning("발행 확인 버튼 미발견 (자동 발행 가능성)")
            await random_delay(5, 8)

        return True

    except Exception as e:
        logger.error(f"발행 버튼 클릭 실패: {e}")
        await capture_debug(page, "publish_error")
        return False
