"""
manual_login.py — 웹 UI에서 스크린샷 기반 수동 로그인

플랫폼별로 다른 백엔드를 사용한다:
  - 네이버(naver) → Xvfb + 실제 Chrome + pyautogui (CAPTCHA 우회 목적)
  - 그 외(tistory 등) → 기존 Playwright (CDP 기반)

session_id 별로 세션을 보관하며, 각 조작 함수(click/type/key/navigate/save)는
세션의 kind 필드를 보고 적절한 백엔드로 분기한다.
"""

import asyncio
import base64
import io
import os
import time
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright, BrowserContext, Page
from loguru import logger

from config import settings
from browser.pyautogui_login import (
    XvfbChromeSession,
    _CDP,
    _cdp_cookie_to_playwright,
    _setup_pyautogui,
)


_sessions: dict[str, dict] = {}


# ──────────────────────────────────────────────────────────────
# 공용
# ──────────────────────────────────────────────────────────────

def _get_proxy() -> Optional[dict]:
    """발행 브라우저와 동일한 프록시 설정 반환"""
    if not settings.PROXY_SERVER:
        return None
    server = settings.PROXY_SERVER
    if not server.startswith(("http://", "https://", "socks4://", "socks5://")):
        server = f"http://{server}"
    proxy: dict = {"server": server}
    if settings.PROXY_USERNAME:
        proxy["username"] = settings.PROXY_USERNAME
        proxy["password"] = settings.PROXY_PASSWORD
    logger.info(f"[수동로그인] 프록시 사용: {server}")
    return proxy


def _resolve_target_url(platform: str, url: Optional[str]) -> str:
    if url:
        return url
    if platform == "tistory":
        return "https://accounts.kakao.com/login"
    return "https://nid.naver.com/nidlogin.login"


def _is_naver_kind(platform: str) -> bool:
    return platform == "naver"


# ──────────────────────────────────────────────────────────────
# Playwright 백엔드 (tistory 등)
# ──────────────────────────────────────────────────────────────

async def _pw_create_browser(playwright):
    launch_args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-infobars",
        "--window-size=1920,1080",
        "--disable-features=ThirdPartyCookieBlocking,ThirdPartyCookiePhaseout,"
        "SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,"
        "TrackingProtection3pcd",
        "--disable-third-party-cookie-phaseout",
    ]
    proxy = _get_proxy()
    for channel in ["chrome", "msedge", None]:
        try:
            kwargs = {"headless": True, "args": launch_args}
            if channel:
                kwargs["channel"] = channel
            if proxy:
                kwargs["proxy"] = proxy
            return await playwright.chromium.launch(**kwargs)
        except Exception:
            continue
    raise RuntimeError("브라우저를 시작할 수 없습니다.")


async def _pw_take_screenshot(page: Page) -> str:
    try:
        img_bytes = await page.screenshot(type="jpeg", quality=70)
        return base64.b64encode(img_bytes).decode()
    except Exception as e:
        logger.warning(f"[수동로그인] 스크린샷 실패: {e}")
        return ""


async def _pw_start(session_id: str, platform: str, url: Optional[str]) -> dict:
    pw = await async_playwright().start()
    browser = await _pw_create_browser(pw)
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/134.0.0.0 Safari/537.36"
        ),
        locale="ko-KR",
        timezone_id="Asia/Seoul",
        viewport={"width": 1920, "height": 1080},
    )
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
    """)

    page = await context.new_page()
    target_url = _resolve_target_url(platform, url)
    await page.goto(target_url, timeout=30000)
    await page.wait_for_load_state("domcontentloaded")
    await asyncio.sleep(1)

    _sessions[session_id] = {
        "kind": "playwright",
        "pw": pw,
        "browser": browser,
        "context": context,
        "page": page,
        "platform": platform,
        "created_at": time.time(),
    }
    return {"success": True, "screenshot": await _pw_take_screenshot(page), "url": page.url}


# ──────────────────────────────────────────────────────────────
# pyautogui 백엔드 (naver)
# ──────────────────────────────────────────────────────────────

async def _pg_take_screenshot(width: int, height: int) -> str:
    pg = _setup_pyautogui()
    try:
        img = pg.screenshot()
    except Exception as e:
        logger.warning(f"[수동로그인] pyautogui 스크린샷 실패: {e}")
        return ""
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=70)
    return base64.b64encode(buf.getvalue()).decode()


def _pg_activate_display(session: dict):
    """이 세션의 DISPLAY를 process-wide로 설정 (pyautogui 호출 직전마다)."""
    os.environ["DISPLAY"] = session["display_var"]


async def _pg_start(session_id: str, platform: str, url: Optional[str]) -> dict:
    # pyautogui/PyScreeze는 X 연결을 프로세스 전역으로 캐시하므로,
    # 동시에 여러 디스플레이 세션을 다루기 어렵다 → 기존 pyautogui 세션 정리
    for sid, s in list(_sessions.items()):
        if s.get("kind") == "pyautogui":
            await close_session(sid)

    width, height = 1920, 1080
    proxy = _get_proxy()
    port_seed = abs(hash(session_id)) % 1000

    sess_ctx = XvfbChromeSession(
        account_id=port_seed,
        proxy=proxy,
        size=(width, height),
        keep_user_data=False,
    )
    sess_ctx.__enter__()
    try:
        cdp = _CDP(sess_ctx.debug_port)
        await cdp.wait_ready(timeout=30.0)
        await cdp.navigate(_resolve_target_url(platform, url))
        await asyncio.sleep(1.5)
    except Exception as e:
        sess_ctx.__exit__(None, None, None)
        return {"success": False, "error": f"세션 시작 실패: {e}"}

    _sessions[session_id] = {
        "kind": "pyautogui",
        "ctx": sess_ctx,
        "cdp": cdp,
        "platform": platform,
        "display_var": sess_ctx._display.new_display_var,
        "width": width,
        "height": height,
        "created_at": time.time(),
    }
    _pg_activate_display(_sessions[session_id])
    return {
        "success": True,
        "screenshot": await _pg_take_screenshot(width, height),
        "url": await cdp.current_url(),
    }


# ──────────────────────────────────────────────────────────────
# 공개 API — kind에 따라 분기
# ──────────────────────────────────────────────────────────────

async def start_session(session_id: str, platform: str = "naver", url: str = None) -> dict:
    """수동 로그인 세션 시작 — 네이버는 pyautogui, 그 외는 Playwright"""
    if session_id in _sessions:
        await close_session(session_id)

    if _is_naver_kind(platform):
        return await _pg_start(session_id, platform, url)
    return await _pw_start(session_id, platform, url)


async def get_screenshot(session_id: str) -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    if session["kind"] == "pyautogui":
        _pg_activate_display(session)
        return {
            "success": True,
            "screenshot": await _pg_take_screenshot(session["width"], session["height"]),
            "url": await session["cdp"].current_url(),
        }
    page = session["page"]
    return {"success": True, "screenshot": await _pw_take_screenshot(page), "url": page.url}


async def send_click(session_id: str, x: int, y: int) -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    if session["kind"] == "pyautogui":
        _pg_activate_display(session)
        pg = _setup_pyautogui()
        pg.moveTo(x, y, duration=0.1)
        await asyncio.sleep(0.05)
        pg.click(x, y)
        await asyncio.sleep(0.5)
        return {
            "success": True,
            "screenshot": await _pg_take_screenshot(session["width"], session["height"]),
            "url": await session["cdp"].current_url(),
        }
    page = session["page"]
    await page.mouse.click(x, y)
    await asyncio.sleep(1)
    return {"success": True, "screenshot": await _pw_take_screenshot(page), "url": page.url}


async def send_type(session_id: str, text: str) -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    if session["kind"] == "pyautogui":
        _pg_activate_display(session)
        pg = _setup_pyautogui()
        if all(ord(c) < 128 for c in text):
            pg.write(text, interval=0.05)
        else:
            try:
                import pyperclip
                pyperclip.copy(text)
                pg.hotkey("ctrl", "v")
            except Exception as e:
                logger.warning(f"[수동로그인] 한글 입력 실패: {e}")
        await asyncio.sleep(0.3)
        return {
            "success": True,
            "screenshot": await _pg_take_screenshot(session["width"], session["height"]),
            "url": await session["cdp"].current_url(),
        }
    page = session["page"]
    await page.keyboard.type(text, delay=50)
    await asyncio.sleep(0.5)
    return {"success": True, "screenshot": await _pw_take_screenshot(page), "url": page.url}


async def send_key(session_id: str, key: str) -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    if session["kind"] == "pyautogui":
        _pg_activate_display(session)
        pg = _setup_pyautogui()
        key_map = {
            "Enter": "enter", "Tab": "tab", "Backspace": "backspace",
            "Escape": "escape", "Delete": "delete",
            "ArrowLeft": "left", "ArrowRight": "right",
            "ArrowUp": "up", "ArrowDown": "down",
        }
        pg.press(key_map.get(key, key.lower()))
        await asyncio.sleep(0.5)
        return {
            "success": True,
            "screenshot": await _pg_take_screenshot(session["width"], session["height"]),
            "url": await session["cdp"].current_url(),
        }
    page = session["page"]
    await page.keyboard.press(key)
    await asyncio.sleep(1)
    return {"success": True, "screenshot": await _pw_take_screenshot(page), "url": page.url}


async def navigate(session_id: str, url: str) -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    if session["kind"] == "pyautogui":
        _pg_activate_display(session)
        await session["cdp"].navigate(url)
        await asyncio.sleep(1.5)
        return {
            "success": True,
            "screenshot": await _pg_take_screenshot(session["width"], session["height"]),
            "url": await session["cdp"].current_url(),
        }
    page = session["page"]
    await page.goto(url, timeout=30000)
    await page.wait_for_load_state("domcontentloaded")
    await asyncio.sleep(1)
    return {"success": True, "screenshot": await _pw_take_screenshot(page), "url": page.url}


async def save_cookies(session_id: str, account_id: str, platform: str = "naver") -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    try:
        from browser.se_helpers import _save_encrypted_cookies

        if session["kind"] == "pyautogui":
            cdp_cookies = await session["cdp"].get_cookies()
            cookies = [_cdp_cookie_to_playwright(c) for c in cdp_cookies if c.get("name")]
        else:
            cookies = await session["context"].cookies()

        if not cookies:
            return {"success": False, "error": "쿠키가 비어있습니다."}

        if platform == "tistory":
            cookie_path = settings.COOKIES_DIR / f"tistory_{account_id}.enc"
        else:
            cookie_path = settings.COOKIES_DIR / f"account_{account_id}.enc"

        _save_encrypted_cookies(cookie_path, cookies)
        logger.info(f"[수동로그인] 쿠키 저장 완료: {cookie_path.name} ({len(cookies)}개)")
        return {"success": True, "message": f"쿠키 {len(cookies)}개 저장 완료", "cookie_count": len(cookies)}
    except Exception as e:
        logger.error(f"[수동로그인] 쿠키 저장 실패: {e}")
        return {"success": False, "error": str(e)}


async def close_session(session_id: str) -> dict:
    session = _sessions.pop(session_id, None)
    if not session:
        return {"success": True}
    try:
        if session["kind"] == "pyautogui":
            session["ctx"].__exit__(None, None, None)
        else:
            await session["browser"].close()
            await session["pw"].stop()
    except Exception as e:
        logger.warning(f"[수동로그인] 세션 종료 중 예외: {e}")
    return {"success": True}


def list_sessions() -> list:
    return [
        {"session_id": sid, "platform": s["platform"], "created_at": s["created_at"], "kind": s.get("kind")}
        for sid, s in _sessions.items()
    ]
