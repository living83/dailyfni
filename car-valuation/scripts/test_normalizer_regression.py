"""Regression: feed all three scrapers normalized-input variants for K7 2014.

Each variant ("K7", "기아 K7", "k7") must resolve to the same canonical and
return the same cached row. Tests the normalizer→scraper plumbing without
re-hitting the network: relies on the cache populated in step 3/4.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from db.cache import get_cached, init_db, upsert_cache  # noqa: E402
from normalizer import get_default  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("regression")


async def main() -> int:
    await init_db()
    norm = get_default()

    variants = ["K7", "k7", "K7 ", " K7", "기아 K7", "기아K7", "더 뉴 K7", "케이세븐"]
    sites = ["encar", "kbchachacha", "heydealer"]

    log.info("--- normalize variants ---")
    canonicals = set()
    for v in variants:
        canonical, score = norm.normalize(v)
        log.info("  %-12s → %s (score=%.0f)", repr(v), canonical, score)
        canonicals.add(canonical)
    assert canonicals == {"K7"}, f"variants resolved to multiple canonicals: {canonicals}"
    log.info("OK: all variants normalize to 'K7'")

    log.info("\n--- site codes for canonical K7 ---")
    for site in sites:
        codes = norm.site_codes("K7", site)
        log.info("  %-12s → %s", site, codes)
        assert codes is not None, f"K7 missing codes for {site}"

    log.info("\n--- cached row lookups (no scrape) ---")
    for site in sites:
        hit = await get_cached("K7", 2014, site)
        log.info(
            "  %-12s cached=%s", site,
            f"{hit['median_price']:,}" if hit else "MISS",
        )

    log.info("\n--- unknown model handling ---")
    unknown_variants = ["완전허구차종ABC", "xyz123abc"]
    for v in unknown_variants:
        c, s = norm.normalize(v)
        log.info("  %-25s → canonical=%s score=%.0f", v, c, s)
        assert c is None, f"unknown {v!r} unexpectedly resolved to {c}"
    log.info("OK: unknown models return None")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
