"""
manual_login.py — 웹 UI에서 스크린샷 기반 수동 로그인
브라우저를 서버에서 열고, 스크린샷을 전송하여 사용자가 CAPTCHA를 직접 풀 수 있게 함
"""

import asyncio
import base64
import time
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from loguru import logger

from config import settings

_sessions: dict[str, dict] = {}


async def _create_browser(playwright):
    launch_args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-infobars",
        "--window-size=1280,900",
        "--disable-features=ThirdPartyCookieBlocking,ThirdPartyCookiePhaseout,"
        "SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,"
        "TrackingProtection3pcd",
        "--disable-third-party-cookie-phaseout",
    ]

    for channel in ["chrome", "msedge", None]:
        try:
            kwargs = {"headless": True, "args": launch_args}
            if channel:
                kwargs["channel"] = channel
            browser = await playwright.chromium.launch(**kwargs)
            return browser
        except Exception:
            continue
    raise RuntimeError("브라우저를 시작�� 수 없습니다.")


async def start_session(session_id: str, platform: str = "naver", url: str = None) -> dict:
    """수동 로그인 세션 시작"""
    if session_id in _sessions:
        await close_session(session_id)

    pw = await async_playwright().start()
    browser = await _create_browser(pw)
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/134.0.0.0 Safari/537.36"
        ),
        locale="ko-KR",
        timezone_id="Asia/Seoul",
        viewport={"width": 1280, "height": 900},
    )
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
    """)

    page = await context.new_page()

    if url:
        target_url = url
    elif platform == "naver":
        target_url = "https://nid.naver.com/nidlogin.login"
    elif platform == "tistory":
        target_url = "https://accounts.kakao.com/login"
    else:
        target_url = "https://nid.naver.com/nidlogin.login"

    await page.goto(target_url, timeout=30000)
    await page.wait_for_load_state("domcontentloaded")
    await asyncio.sleep(1)

    _sessions[session_id] = {
        "pw": pw,
        "browser": browser,
        "context": context,
        "page": page,
        "platform": platform,
        "created_at": time.time(),
    }

    screenshot = await _take_screenshot(page)
    return {"success": True, "screenshot": screenshot, "url": page.url}


async def get_screenshot(session_id: str) -> dict:
    """현재 페이지 스크린샷 반환"""
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}

    screenshot = await _take_screenshot(session["page"])
    return {"success": True, "screenshot": screenshot, "url": session["page"].url}


async def send_click(session_id: str, x: int, y: int) -> dict:
    """좌표에 클릭"""
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}

    page = session["page"]
    await page.mouse.click(x, y)
    await asyncio.sleep(1)

    screenshot = await _take_screenshot(page)
    return {"success": True, "screenshot": screenshot, "url": page.url}


async def send_type(session_id: str, text: str) -> dict:
    """텍스트 입력"""
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}

    page = session["page"]
    await page.keyboard.type(text, delay=50)
    await asyncio.sleep(0.5)

    screenshot = await _take_screenshot(page)
    return {"success": True, "screenshot": screenshot, "url": page.url}


async def send_key(session_id: str, key: str) -> dict:
    """키 입력 (Enter, Tab, Backspace 등)"""
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}

    page = session["page"]
    await page.keyboard.press(key)
    await asyncio.sleep(1)

    screenshot = await _take_screenshot(page)
    return {"success": True, "screenshot": screenshot, "url": page.url}


async def navigate(session_id: str, url: str) -> dict:
    """URL로 이동"""
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}

    page = session["page"]
    await page.goto(url, timeout=30000)
    await page.wait_for_load_state("domcontentloaded")
    await asyncio.sleep(1)

    screenshot = await _take_screenshot(page)
    return {"success": True, "screenshot": screenshot, "url": page.url}


async def save_cookies(session_id: str, account_id: str, platform: str = "naver") -> dict:
    """현재 세션 쿠키를 계정에 저장"""
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}

    try:
        from browser.se_helpers import _save_encrypted_cookies

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
    """세션 종료"""
    session = _sessions.pop(session_id, None)
    if not session:
        return {"success": True}

    try:
        await session["browser"].close()
        await session["pw"].stop()
    except Exception:
        pass

    return {"success": True}


async def _take_screenshot(page: Page) -> str:
    """스크린샷을 base64로 반환"""
    try:
        img_bytes = await page.screenshot(type="jpeg", quality=70)
        return base64.b64encode(img_bytes).decode()
    except Exception as e:
        logger.warning(f"스크린샷 실패: {e}")
        return ""


def list_sessions() -> list:
    """활성 세�� 목록"""
    return [
        {"session_id": sid, "platform": s["platform"], "created_at": s["created_at"]}
        for sid, s in _sessions.items()
    ]
