"""Live smoke test: fetch K7 2014 from encar, verify caching round-trip.

Usage (from car-valuation/ with venv active):
    python scripts/test_encar.py
"""
from __future__ import annotations

import asyncio
import logging
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from db.cache import get_cached, init_db, upsert_cache  # noqa: E402
from scrapers.encar_scraper import EncarScraper  # noqa: E402
from scrapers.utils import ScraperBlocked, ScraperEmpty  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("test_encar")


async def main() -> int:
    await init_db()
    model, year = "K7", 2014

    # ---- 1st run: should miss cache, hit live encar ----
    cached = await get_cached(model, year, "encar")
    if cached is not None:
        log.info("found stale cache row, ignoring for live test")

    t0 = time.monotonic()
    try:
        async with EncarScraper(headless=True) as scraper:
            result = await scraper.fetch_price(model, year)
    except ScraperEmpty as e:
        log.error("DATA_NOT_FOUND: %s", e)
        return 2
    except ScraperBlocked as e:
        log.error("blocked by encar: %s", e)
        return 3
    elapsed = time.monotonic() - t0

    log.info("LIVE result in %.1fs:", elapsed)
    log.info("  site=%s", result["site"])
    log.info("  median=%s KRW (≈ %.0f만원)", f"{result['median']:,}", result["median"] / 10_000)
    log.info("  count=%d (raw_total=%s)", result["count"], result.get("raw_total"))
    log.info("  samples=%s", [f"{p:,}" for p in result["samples"][:10]])

    # ---- cache write ----
    await upsert_cache(
        model, year, result["site"],
        median_price=result["median"],
        sample_count=result["count"],
        samples=result["samples"],
    )
    log.info("cached.")

    # ---- 2nd run: must hit cache (no scrape) ----
    t1 = time.monotonic()
    hit = await get_cached(model, year, "encar")
    elapsed2 = time.monotonic() - t1
    assert hit is not None, "cache miss after upsert"
    assert hit["median_price"] == result["median"]
    log.info("CACHE HIT in %.3fs (median=%s)", elapsed2, f"{hit['median_price']:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
