from __future__ import annotations

import asyncio
import random
import statistics
from typing import Iterable

from config import SCRAPE_DELAY_MAX, SCRAPE_DELAY_MIN

USER_AGENTS: tuple[str, ...] = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
)


def random_ua() -> str:
    return random.choice(USER_AGENTS)


async def human_delay(
    min_sec: float = SCRAPE_DELAY_MIN,
    max_sec: float = SCRAPE_DELAY_MAX,
) -> None:
    await asyncio.sleep(random.uniform(min_sec, max_sec))


def median_int(values: Iterable[int | float]) -> int | None:
    """Median of price samples as int, or None if the iterable is empty."""
    nums = [v for v in values if v is not None]
    if not nums:
        return None
    return int(round(statistics.median(nums)))


class ScraperBlocked(Exception):
    """Raised when a site returns 429, captcha, or similar block signal."""


class ScraperEmpty(Exception):
    """Raised when search returned zero matches (DATA_NOT_FOUND)."""
