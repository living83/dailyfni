"""Post-refactor live verification: alias input → normalizer → scraper → result.

Uses year=2013 so we don't hit the existing K7-2014 cache (forces a real call).
"""
from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from db.cache import init_db  # noqa: E402
from scrapers.encar_scraper import EncarScraper, _build_query  # noqa: E402
from scrapers.utils import ScraperBlocked, ScraperEmpty  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("post_refactor")


async def main() -> int:
    await init_db()

    # 1) URL shape sanity
    q = _build_query("K7", 2014, manufacturer="기아")
    log.info("query: %s", q)
    assert "Manufacturer.기아" in q
    assert "ModelGroup.K7" in q

    # 2) Live fetch with alias input ("기아 K7"), year=2013 (not cached)
    try:
        async with EncarScraper(headless=True) as scraper:
            result = await scraper.fetch_price("기아 K7", 2013)
        log.info("LIVE K7 2013 via alias '기아 K7':")
        log.info("  median=%s KRW (≈ %.0f만원)", f"{result['median']:,}", result["median"] / 10_000)
        log.info("  count=%d (raw_total=%s)", result["count"], result.get("raw_total"))
        log.info("  samples[:5]=%s", [f"{p:,}" for p in result["samples"][:5]])
    except ScraperEmpty as e:
        log.warning("DATA_NOT_FOUND: %s", e)
    except ScraperBlocked as e:
        log.error("blocked: %s", e)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
