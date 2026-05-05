"""
manual_login.py — 웹 UI에서 스크린샷 기반 수동 로그인

Playwright 대신 Xvfb + 실제 Chrome + pyautogui 방식을 사용한다.
사용자가 보는 스크린샷은 Xvfb 화면 캡처(JPEG, base64), 클릭/타이핑은
pyautogui로 OS 레벨 X 이벤트로 전달한다.

NOTE: pyautogui/PyScreeze는 X 연결을 프로세스 전역으로 캐시하므로
동시에 여러 디스플레이 세션을 다루기 어렵다. 수동 로그인 UX는 한 번에
한 세션만 다루는 것을 전제로 하며, start_session() 시 기존 세션은
자동으로 종료된다.
"""

import asyncio
import base64
import io
import os
import time
from pathlib import Path
from typing import Optional

from loguru import logger

from config import settings
from browser.pyautogui_login import (
    XvfbChromeSession,
    _CDP,
    _cdp_cookie_to_playwright,
    _setup_pyautogui,
)


_sessions: dict[str, dict] = {}


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


async def _take_screenshot_jpeg_b64(width: int, height: int) -> str:
    """
    현재 DISPLAY의 화면을 JPEG로 캡처하여 base64로 반환.
    pyautogui.screenshot()은 PIL.Image를 반환한다.
    """
    pg = _setup_pyautogui()
    try:
        img = pg.screenshot()
    except Exception as e:
        logger.warning(f"[수동로그인] 스크린샷 실패: {e}")
        return ""
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=70)
    return base64.b64encode(buf.getvalue()).decode()


def _activate_session_display(session: dict):
    """이 세션의 DISPLAY를 process-wide로 설정 (pyautogui 호출 직전마다)."""
    os.environ["DISPLAY"] = session["display_var"]


# ──────────────────────────────────────────────────────────────
# 공개 API
# ──────────────────────────────────────────────────────────────

async def start_session(session_id: str, platform: str = "naver", url: str = None) -> dict:
    """수동 로그인 세션 시작 — Xvfb + Chrome 기동"""
    # 기존 동일 ID 세션 정리
    if session_id in _sessions:
        await close_session(session_id)
    # pyautogui X 연결 충돌 방지 — 다른 모든 세션도 정리
    for sid in list(_sessions.keys()):
        await close_session(sid)

    width, height = 1920, 1080
    proxy = _get_proxy()

    # account_id 자리에 세션 식별자(해시) 사용 — 포트 분기용
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

        target_url = _resolve_target_url(platform, url)
        await cdp.navigate(target_url)
        await asyncio.sleep(1.5)
    except Exception as e:
        sess_ctx.__exit__(None, None, None)
        return {"success": False, "error": f"세션 시작 실패: {e}"}

    _sessions[session_id] = {
        "ctx": sess_ctx,
        "cdp": cdp,
        "platform": platform,
        "display_var": sess_ctx._display.new_display_var,
        "width": width,
        "height": height,
        "created_at": time.time(),
    }

    _activate_session_display(_sessions[session_id])
    screenshot = await _take_screenshot_jpeg_b64(width, height)
    return {"success": True, "screenshot": screenshot, "url": await cdp.current_url()}


async def get_screenshot(session_id: str) -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    _activate_session_display(session)
    screenshot = await _take_screenshot_jpeg_b64(session["width"], session["height"])
    return {"success": True, "screenshot": screenshot, "url": await session["cdp"].current_url()}


async def send_click(session_id: str, x: int, y: int) -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    _activate_session_display(session)
    pg = _setup_pyautogui()
    pg.moveTo(x, y, duration=0.1)
    await asyncio.sleep(0.05)
    pg.click(x, y)
    await asyncio.sleep(0.5)
    screenshot = await _take_screenshot_jpeg_b64(session["width"], session["height"])
    return {"success": True, "screenshot": screenshot, "url": await session["cdp"].current_url()}


async def send_type(session_id: str, text: str) -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    _activate_session_display(session)
    pg = _setup_pyautogui()
    # ASCII만 안전하게 typewrite → 한글이면 클립보드 paste fallback
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
    screenshot = await _take_screenshot_jpeg_b64(session["width"], session["height"])
    return {"success": True, "screenshot": screenshot, "url": await session["cdp"].current_url()}


async def send_key(session_id: str, key: str) -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    _activate_session_display(session)
    pg = _setup_pyautogui()
    # 흔히 쓰는 키 매핑
    key_map = {
        "Enter": "enter", "Tab": "tab", "Backspace": "backspace",
        "Escape": "escape", "Delete": "delete",
        "ArrowLeft": "left", "ArrowRight": "right",
        "ArrowUp": "up", "ArrowDown": "down",
    }
    pg.press(key_map.get(key, key.lower()))
    await asyncio.sleep(0.5)
    screenshot = await _take_screenshot_jpeg_b64(session["width"], session["height"])
    return {"success": True, "screenshot": screenshot, "url": await session["cdp"].current_url()}


async def navigate(session_id: str, url: str) -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    _activate_session_display(session)
    await session["cdp"].navigate(url)
    await asyncio.sleep(1.5)
    screenshot = await _take_screenshot_jpeg_b64(session["width"], session["height"])
    return {"success": True, "screenshot": screenshot, "url": await session["cdp"].current_url()}


async def save_cookies(session_id: str, account_id: str, platform: str = "naver") -> dict:
    session = _sessions.get(session_id)
    if not session:
        return {"success": False, "error": "세션이 없습니다."}
    try:
        from browser.se_helpers import _save_encrypted_cookies

        cdp_cookies = await session["cdp"].get_cookies()
        cookies = [_cdp_cookie_to_playwright(c) for c in cdp_cookies if c.get("name")]
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
        session["ctx"].__exit__(None, None, None)
    except Exception as e:
        logger.warning(f"[수동로그인] 세션 종료 중 예외: {e}")
    return {"success": True}


def list_sessions() -> list:
    return [
        {"session_id": sid, "platform": s["platform"], "created_at": s["created_at"]}
        for sid, s in _sessions.items()
    ]
