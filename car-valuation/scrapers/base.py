from __future__ import annotations

import abc
import logging
import random
from typing import Any

from playwright.async_api import Browser, BrowserContext, Playwright, async_playwright

from config import (
    PROXY_ENABLED,
    PROXY_HOST,
    PROXY_PASS,
    PROXY_PORT_END,
    PROXY_PORT_START,
    PROXY_USER,
)
from scrapers.utils import random_ua

logger = logging.getLogger(__name__)


def _build_proxy_config() -> dict | None:
    """Return Playwright proxy dict, or None when proxy is disabled.

    Picks a random port from [PROXY_PORT_START, PROXY_PORT_END] each call so
    repeated scraper sessions rotate through Decodo's KR ISP endpoints.
    """
    if not PROXY_ENABLED or not PROXY_HOST:
        return None
    host = PROXY_HOST
    for prefix in ("http://", "https://"):
        if host.startswith(prefix):
            host = host[len(prefix):]
            break
    host = host.rstrip("/")
    port = random.randint(PROXY_PORT_START, PROXY_PORT_END)
    config: dict[str, str] = {"server": f"http://{host}:{port}"}
    if PROXY_USER:
        config["username"] = PROXY_USER
    if PROXY_PASS:
        config["password"] = PROXY_PASS
    return config


class BaseScraper(abc.ABC):
    """Common Playwright lifecycle. Subclasses implement fetch_price."""

    site_name: str = ""

    def __init__(self, headless: bool = True) -> None:
        self.headless = headless
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._proxy = _build_proxy_config()
        if self._proxy:
            logger.info(
                "%s: proxy enabled → %s",
                self.__class__.__name__, self._proxy["server"],
            )

    async def __aenter__(self) -> "BaseScraper":
        self._pw = await async_playwright().start()
        launch_kwargs: dict[str, Any] = {
            "headless": self.headless,
            "args": [
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ],
        }
        if self._proxy is not None:
            launch_kwargs["proxy"] = self._proxy
        self._browser = await self._pw.chromium.launch(**launch_kwargs)
        self._context = await self._browser.new_context(
            user_agent=random_ua(),
            viewport={"width": 1366, "height": 850},
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            extra_http_headers={"Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"},
        )
        # Light fingerprint masking — playwright-stealth provides more, but
        # this covers the headline `navigator.webdriver` tell.
        await self._context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._context:
            await self._context.close()
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()

    @property
    def context(self) -> BrowserContext:
        if self._context is None:
            raise RuntimeError("Scraper context not initialized; use 'async with'.")
        return self._context

    @abc.abstractmethod
    async def fetch_price(self, model: str, year: int) -> dict[str, Any]:
        """Return {'site', 'median', 'count', 'samples'} for given car."""
