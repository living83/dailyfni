"""Live smoke test: K7 2014 against heydealer."""
from __future__ import annotations

import asyncio
import logging
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from db.cache import get_cached, init_db, upsert_cache  # noqa: E402
from scrapers.heydealer_scraper import HeydealerScraper  # noqa: E402
from scrapers.utils import ScraperBlocked, ScraperEmpty  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("test_hd")


async def main() -> int:
    await init_db()
    model, year = "K7", 2018  # 2014 not present on heydealer; 2018 should work

    t0 = time.monotonic()
    try:
        async with HeydealerScraper(headless=True) as scraper:
            result = await scraper.fetch_price(model, year)
    except ScraperEmpty as e:
        log.warning("DATA_NOT_FOUND (expected if heydealer skews newer): %s", e)
        return 2
    except ScraperBlocked as e:
        log.error("blocked: %s", e)
        return 3
    elapsed = time.monotonic() - t0

    log.info("LIVE result in %.1fs:", elapsed)
    log.info("  site=%s", result["site"])
    log.info("  median=%s KRW (≈ %.0f만원)", f"{result['median']:,}", result["median"] / 10_000)
    log.info("  count=%d (raw_total=%s)", result["count"], result.get("raw_total"))
    log.info("  samples=%s", [f"{p:,}" for p in result["samples"][:10]])

    await upsert_cache(
        model, year, result["site"],
        median_price=result["median"],
        sample_count=result["count"],
        samples=result["samples"],
    )
    hit = await get_cached(model, year, "heydealer")
    assert hit is not None
    log.info("CACHE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
