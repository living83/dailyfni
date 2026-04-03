"""
Stealth browser automation helpers for Naver login.
Ported from naver-auto project, adapted for the dailyfni project structure.
"""

import asyncio
import base64
import hashlib
import json
import os
import random
from pathlib import Path

from cryptography.fernet import Fernet
from loguru import logger
from playwright.async_api import async_playwright

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_BASE_DIR = Path(__file__).resolve().parent.parent
COOKIE_DIR = _BASE_DIR / "data" / "cookies"
DEBUG_DIR = _BASE_DIR / "data" / "debug_screenshots"

# ---------------------------------------------------------------------------
# Encryption
# ---------------------------------------------------------------------------
MASTER_KEY = os.getenv("MASTER_KEY", "CHANGEME_PLEASE_USE_32_CHARACTERS!")


def _get_fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(MASTER_KEY.encode()).digest())
    return Fernet(key)


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

async def random_delay(min_sec: float, max_sec: float) -> None:
    """Sleep for a random duration between *min_sec* and *max_sec*."""
    delay = random.uniform(min_sec, max_sec)
    await asyncio.sleep(delay)


async def try_selectors(page_or_frame, selectors: list[str], timeout: int = 5000):
    """Try multiple CSS selectors and return the first element found, or None."""
    for selector in selectors:
        try:
            element = await page_or_frame.wait_for_selector(selector, timeout=timeout)
            if element:
                return element
        except Exception:
            continue
    return None


async def capture_debug(page, name: str) -> None:
    """Save a debug screenshot to data/debug_screenshots/{name}.png."""
    try:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        path = DEBUG_DIR / f"{name}.png"
        await page.screenshot(path=str(path), full_page=True)
        logger.debug(f"Debug screenshot saved: {path}")
    except Exception as exc:
        logger.warning(f"Failed to capture debug screenshot '{name}': {exc}")


def _get_proxy_for_account(account_id: str) -> dict | None:
    """Read proxy settings from environment variables for a given account.

    Looks for:
        PROXY_{ACCOUNT_ID}_SERVER   – e.g. http://host:port
        PROXY_{ACCOUNT_ID}_USERNAME – optional
        PROXY_{ACCOUNT_ID}_PASSWORD – optional

    Falls back to global PROXY_SERVER / PROXY_USERNAME / PROXY_PASSWORD.
    Returns a dict suitable for Playwright's proxy option, or None.
    """
    prefix = account_id.upper() if account_id else ""

    server = os.getenv(f"PROXY_{prefix}_SERVER") if prefix else None
    server = server or os.getenv("PROXY_SERVER")

    if not server:
        return None

    proxy: dict = {"server": server}

    username = (
        os.getenv(f"PROXY_{prefix}_USERNAME") if prefix else None
    ) or os.getenv("PROXY_USERNAME")
    password = (
        os.getenv(f"PROXY_{prefix}_PASSWORD") if prefix else None
    ) or os.getenv("PROXY_PASSWORD")

    if username:
        proxy["username"] = username
    if password:
        proxy["password"] = password

    return proxy


# ---------------------------------------------------------------------------
# Cookie encryption helpers
# ---------------------------------------------------------------------------

async def _save_encrypted_cookies(context, account_id: str) -> None:
    """Save browser cookies encrypted with Fernet to data/cookies/{account_id}.enc."""
    try:
        COOKIE_DIR.mkdir(parents=True, exist_ok=True)
        cookies = await context.cookies()
        raw = json.dumps(cookies).encode("utf-8")
        encrypted = _get_fernet().encrypt(raw)
        cookie_path = COOKIE_DIR / f"{account_id}.enc"
        cookie_path.write_bytes(encrypted)
        logger.info(f"Cookies saved for account '{account_id}'")
    except Exception as exc:
        logger.error(f"Failed to save cookies for '{account_id}': {exc}")


async def _load_encrypted_cookies(context, account_id: str) -> bool:
    """Load encrypted cookies and add them to the context. Returns True on success."""
    cookie_path = COOKIE_DIR / f"{account_id}.enc"
    if not cookie_path.exists():
        logger.debug(f"No cookie file found for '{account_id}'")
        return False
    try:
        encrypted = cookie_path.read_bytes()
        raw = _get_fernet().decrypt(encrypted)
        cookies = json.loads(raw.decode("utf-8"))
        await context.add_cookies(cookies)
        logger.info(f"Cookies loaded for account '{account_id}'")
        return True
    except Exception as exc:
        logger.warning(f"Failed to load cookies for '{account_id}': {exc}")
        return False


# ---------------------------------------------------------------------------
# Stealth browser context
# ---------------------------------------------------------------------------

async def create_stealth_context(
    playwright_instance,
    proxy: dict | None = None,
    headless: bool = True,
):
    """Launch Chromium with stealth settings and return (browser, context).

    Parameters
    ----------
    playwright_instance : Playwright
        An active Playwright instance (from ``async_playwright().start()``).
    proxy : dict | None
        Optional proxy config: ``{"server": "...", "username": "...", "password": "..."}``.
    headless : bool
        Whether to run the browser in headless mode.

    Returns
    -------
    tuple[Browser, BrowserContext]
    """

    launch_kwargs: dict = {
        "headless": headless,
        "args": [
            "--disable-blink-features=AutomationControlled",
            "--disable-features=IsolateOrigins,site-per-process",
            "--disable-site-isolation-trials",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-infobars",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
        ],
    }

    if proxy:
        launch_kwargs["proxy"] = proxy

    # Try Chrome channel first, fallback to plain Chromium
    browser = None
    for channel in ("chrome", None):
        try:
            kw = {**launch_kwargs}
            if channel:
                kw["channel"] = channel
            browser = await playwright_instance.chromium.launch(**kw)
            logger.info(f"Browser launched (channel={channel or 'chromium'})")
            break
        except Exception as exc:
            logger.debug(f"Channel '{channel}' unavailable: {exc}")

    if browser is None:
        raise RuntimeError("Failed to launch any Chromium-based browser")

    context = await browser.new_context(
        viewport={"width": 1280, "height": 720},
        locale="ko-KR",
        timezone_id="Asia/Seoul",
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        ignore_https_errors=True,
        java_script_enabled=True,
    )

    # Disable navigator.webdriver flag
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        Object.defineProperty(navigator, 'languages', {
            get: () => ['ko-KR', 'ko', 'en-US', 'en'],
        });
        window.chrome = { runtime: {} };
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(parameters);
    """)

    # Disable third-party cookie blocking
    await context.add_init_script("""
        try {
            document.cookie;
        } catch(e) {}
    """)

    return browser, context


# ---------------------------------------------------------------------------
# Naver login
# ---------------------------------------------------------------------------

async def _check_logged_in(page) -> bool:
    """Navigate to naver.com and check if we are logged in."""
    try:
        await page.goto("https://www.naver.com", wait_until="domcontentloaded", timeout=15000)
        await random_delay(1.0, 2.0)

        # Look for login-status indicators
        logged_in = await try_selectors(
            page,
            [
                "a.MyView-module__link_login__NIaBT",
                "#account_area .MyView-module__link_login__NIaBT",
                "a[href*='nid.naver.com/nidlogin.logout']",
                ".MyView-module__my_area___OBGQ",
                "a.link_logout",
            ],
            timeout=5000,
        )
        if logged_in:
            logger.info("Cookie login verified – already logged in")
            return True

        # Also check for a "login" button that appears only when logged out
        login_btn = await try_selectors(
            page,
            [
                "a.MyView-module__link_login__",
                "a[href*='nid.naver.com/nidlogin.login']",
            ],
            timeout=3000,
        )
        if login_btn:
            text = await login_btn.inner_text()
            if "로그인" in text:
                logger.debug("Login button found – not logged in")
                return False

        return False
    except Exception as exc:
        logger.warning(f"Login check failed: {exc}")
        return False


async def login(
    context,
    naver_id: str,
    naver_password: str,
    account_id: str | None = None,
) -> bool:
    """Log in to Naver using the given context.

    1. Attempt cookie-based login.
    2. Fall back to ID/PW login (up to 3 retries).
    3. Save cookies on success.

    Returns True if login succeeds.
    """
    effective_account_id = account_id or naver_id

    page = await context.new_page()

    # ------ Step 1: Cookie login ------
    cookie_loaded = await _load_encrypted_cookies(context, effective_account_id)
    if cookie_loaded:
        if await _check_logged_in(page):
            await page.close()
            return True
        logger.info("Cookie login failed, falling back to ID/PW login")

    # ------ Step 2: ID/PW login with retries ------
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        logger.info(f"Login attempt {attempt}/{max_retries} for '{effective_account_id}'")
        try:
            await page.goto(
                "https://nid.naver.com/nidlogin.login",
                wait_until="domcontentloaded",
                timeout=20000,
            )
            await random_delay(1.0, 2.0)

            # ---- Type ID ----
            id_field = await try_selectors(
                page,
                ["#id", "input[name='id']", "#id_line input"],
                timeout=8000,
            )
            if not id_field:
                logger.error("Could not find ID input field")
                await capture_debug(page, f"login_no_id_field_attempt{attempt}")
                continue

            await id_field.click()
            await random_delay(0.3, 0.6)
            # Clear any existing text
            await id_field.fill("")
            for char in naver_id:
                await id_field.type(char, delay=random.randint(50, 150))
            await random_delay(0.3, 0.5)

            # ---- Type password ----
            pw_field = await try_selectors(
                page,
                ["#pw", "input[name='pw']", "#pw_line input"],
                timeout=5000,
            )
            if not pw_field:
                logger.error("Could not find password input field")
                await capture_debug(page, f"login_no_pw_field_attempt{attempt}")
                continue

            await pw_field.click()
            await random_delay(0.3, 0.6)
            await pw_field.fill("")
            for char in naver_password:
                await pw_field.type(char, delay=random.randint(30, 120))
            await random_delay(0.5, 1.0)

            # ---- Click login button ----
            login_btn = await try_selectors(
                page,
                [
                    "#log\\.login",
                    "button.btn_login",
                    "button[type='submit']",
                    "input[type='submit']",
                    ".btn_global[type='submit']",
                ],
                timeout=5000,
            )
            if login_btn:
                await login_btn.click()
            else:
                logger.warning("Login button not found, pressing Enter instead")
                await pw_field.press("Enter")

            # ---- Wait for navigation / redirect ----
            await random_delay(2.0, 4.0)

            # ---- Detect identity verification ----
            verification = await try_selectors(
                page,
                [
                    "#content .identity_verification",
                    "div.new_verify",
                    "span:has-text('본인확인')",
                    "div:has-text('기기 인증')",
                ],
                timeout=3000,
            )
            if verification:
                logger.error(
                    "Identity verification required – cannot proceed automatically"
                )
                await capture_debug(page, f"login_verification_attempt{attempt}")
                await page.close()
                return False

            # ---- Detect captcha ----
            captcha = await try_selectors(
                page,
                [
                    "#captcha",
                    "img[src*='captcha']",
                    "#captchaimg",
                    "div.captcha_wrap",
                ],
                timeout=2000,
            )
            if captcha:
                logger.error("CAPTCHA detected – cannot proceed automatically")
                await capture_debug(page, f"login_captcha_attempt{attempt}")
                await page.close()
                return False

            # ---- Detect explicit login failure ----
            error_msg = await try_selectors(
                page,
                [
                    "#err_common",
                    "div.error_message",
                    "#error_message",
                    "span.error",
                ],
                timeout=2000,
            )
            if error_msg:
                text = await error_msg.inner_text()
                logger.warning(f"Login error message: {text}")
                await capture_debug(page, f"login_error_attempt{attempt}")
                continue

            # ---- Check if we ended up logged in ----
            current_url = page.url
            if "nidlogin.login" not in current_url:
                logger.info(f"Redirected to {current_url} – likely logged in")
                # Verify by visiting naver.com
                if await _check_logged_in(page):
                    # Step 3: Save cookies
                    await _save_encrypted_cookies(context, effective_account_id)
                    await page.close()
                    return True

            logger.warning(f"Login attempt {attempt} did not succeed")
            await capture_debug(page, f"login_failed_attempt{attempt}")

        except Exception as exc:
            logger.error(f"Login attempt {attempt} raised exception: {exc}")
            await capture_debug(page, f"login_exception_attempt{attempt}")

    logger.error(f"All {max_retries} login attempts failed for '{effective_account_id}'")
    await page.close()
    return False
