"""Live test: fetch K7 via Decodo proxy. Year not previously cached for fresh hit."""
from __future__ import annotations

import asyncio
import logging
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scrapers.base import _build_proxy_config  # noqa: E402
from scrapers.encar_scraper import EncarScraper  # noqa: E402
from scrapers.utils import ScraperBlocked, ScraperEmpty  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("proxy_live")


async def main() -> int:
    proxy = _build_proxy_config()
    log.info("resolved proxy config: %s", proxy)
    if proxy is None:
        log.error("proxy not configured — set PROXY_ENABLED=true etc.")
        return 1

    model, year = "K7", 2011
    t0 = time.monotonic()
    try:
        async with EncarScraper(headless=True) as s:
            result = await s.fetch_price(model, year)
    except ScraperEmpty as e:
        log.warning("DATA_NOT_FOUND: %s", e)
        return 2
    except ScraperBlocked as e:
        log.error("BLOCKED: %s", e)
        return 3
    elapsed = time.monotonic() - t0

    log.info("PROXY OK — %s %d in %.1fs", model, year, elapsed)
    log.info("  median=%s KRW (≈ %.0f만원)", f"{result['median']:,}", result['median'] / 10_000)
    log.info("  count=%d (raw_total=%s)", result['count'], result.get('raw_total'))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
