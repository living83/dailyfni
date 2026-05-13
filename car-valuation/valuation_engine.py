"""Combine per-site scraper output into a single market + auction price.

`valuate(model, year)` is the single entry point used by the FastAPI layer
(step 7) and the Excel batch processor (step 8).

Weighting (per spec):
    - Each configured site has a base weight (WEIGHTS dict in config.py).
    - A site with fewer than MIN_SAMPLES_FOR_WEIGHT listings is excluded.
    - Remaining weights are re-normalized to sum to 1.
    - market_price = sum_i (w_i * median_i)
    - auction_price = market_price * AUCTION_DISCOUNT_RATIO
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Type

from config import AUCTION_DISCOUNT_RATIO, WEIGHTS
from db.cache import get_cached, init_db, upsert_cache
from normalizer import ModelNormalizer, get_default, log_unmatched_to_file
from scrapers.base import BaseScraper
from scrapers.encar_scraper import EncarScraper
from scrapers.heydealer_scraper import HeydealerScraper
from scrapers.kbchachacha_scraper import KbChachachaScraper
from scrapers.utils import ScraperBlocked, ScraperEmpty

logger = logging.getLogger(__name__)

# Spec: "매물 수 < 3건이면 해당 사이트 가중치 0, 나머지 재분배"
MIN_SAMPLES_FOR_WEIGHT = 3

SCRAPER_CLASSES: dict[str, Type[BaseScraper]] = {
    "encar": EncarScraper,
    "kbchachacha": KbChachachaScraper,
    "heydealer": HeydealerScraper,
}


# ---------------------------------------------------------------------------
# Pure functions (no I/O) — these are the units the tests pin down.
# ---------------------------------------------------------------------------

def weighted_market_price(
    per_site: dict[str, dict[str, Any] | None],
    *,
    weights: dict[str, float] | None = None,
    min_samples: int = MIN_SAMPLES_FOR_WEIGHT,
) -> int | None:
    """Return integer KRW market price or None when no site qualifies.

    `per_site` maps site_name → {"median": int, "count": int} or None when
    the site returned no result. Sites with count < min_samples are dropped;
    the remaining base weights are re-normalized to sum to 1.
    """
    w = weights if weights is not None else WEIGHTS
    qualifying = {
        site: data
        for site, data in per_site.items()
        if data is not None
        and isinstance(data.get("median"), (int, float))
        and data.get("count", 0) >= min_samples
        and site in w
    }
    if not qualifying:
        return None
    weight_sum = sum(w[s] for s in qualifying)
    if weight_sum <= 0:
        return None
    total = sum(w[s] * qualifying[s]["median"] for s in qualifying)
    return int(round(total / weight_sum))


def auction_price(market_price: int | None, *, ratio: float = AUCTION_DISCOUNT_RATIO) -> int | None:
    if market_price is None:
        return None
    return int(round(market_price * ratio))


def confidence_grade(
    per_site: dict[str, dict[str, Any] | None],
    *,
    min_samples: int = MIN_SAMPLES_FOR_WEIGHT,
) -> str:
    """3-사 매칭=상, 2-사=중, 1-사=하, 0건=실패 (수동검토 마킹)."""
    matched = sum(
        1
        for data in per_site.values()
        if data is not None and data.get("count", 0) >= min_samples
    )
    return {3: "상", 2: "중", 1: "하"}.get(matched, "실패")


# ---------------------------------------------------------------------------
# Async orchestration (touches scrapers + DB).
# ---------------------------------------------------------------------------

async def _fetch_one(
    site: str,
    scraper_cls: Type[BaseScraper],
    model: str,
    year: int,
    headless: bool,
) -> tuple[str, dict[str, Any] | None]:
    """Run a single scraper; return (site, result_or_None). Never raises."""
    try:
        async with scraper_cls(headless=headless) as scraper:
            result = await scraper.fetch_price(model, year)
        return site, result
    except ScraperEmpty as e:
        logger.info("%s: empty (%s)", site, e)
        return site, None
    except ScraperBlocked as e:
        logger.warning("%s: blocked (%s)", site, e)
        return site, None
    except Exception as e:  # noqa: BLE001
        logger.exception("%s: unexpected error: %s", site, e)
        return site, None


async def valuate(
    model: str,
    year: int,
    *,
    use_cache: bool = True,
    headless: bool = True,
    sites: list[str] | None = None,
    normalizer: ModelNormalizer | None = None,
) -> dict[str, Any]:
    """Full valuation: cache-first per site, parallel scrape misses, weighted.

    Resolves the raw `model` to a canonical name up front; cache rows and
    scraper calls use the canonical key so aliases ("K7", "기아 K7", "더 뉴 K7")
    share one cache entry rather than each cold-scraping independently.
    """
    await init_db()
    norm = normalizer or get_default()
    site_list = sites or list(SCRAPER_CLASSES.keys())
    started = time.monotonic()

    # ---- resolve canonical key ------------------------------------------
    canonical, match_score = norm.normalize(model)
    if canonical is None:
        # Unknown model — short-circuit. Mirror the same response shape so
        # callers (batch processor / API consumers) don't need a special case.
        for site in site_list:
            log_unmatched_to_file(model, site, best_guess=None, score=match_score)
        return {
            "model": model,
            "canonical": None,
            "year": year,
            "market_price": None,
            "auction_price": None,
            "confidence": "실패",
            "sources": {s: None for s in site_list},
            "cached": False,
            "cache_hits": {s: False for s in site_list},
            "elapsed_sec": round(time.monotonic() - started, 2),
            "match_score": match_score,
        }

    per_site: dict[str, dict[str, Any] | None] = {s: None for s in site_list}
    cache_hits: dict[str, bool] = {s: False for s in site_list}

    # ---- cache pass (keyed on canonical) ---------------------------------
    if use_cache:
        for site in site_list:
            cached = await get_cached(canonical, year, site)
            if cached is not None:
                per_site[site] = {
                    "median": cached["median_price"],
                    "count": cached["sample_count"],
                    "samples": cached.get("samples", []),
                }
                cache_hits[site] = True

    # ---- scrape what's missing in parallel ------------------------------
    to_scrape = [s for s in site_list if not cache_hits[s]]
    if to_scrape:
        tasks = [
            _fetch_one(s, SCRAPER_CLASSES[s], canonical, year, headless)
            for s in to_scrape
        ]
        results = await asyncio.gather(*tasks)
        for site, result in results:
            per_site[site] = result
            if result is not None:
                await upsert_cache(
                    canonical, year, site,
                    median_price=result["median"],
                    sample_count=result["count"],
                    samples=result.get("samples", []),
                )

    # ---- aggregate -------------------------------------------------------
    market = weighted_market_price(per_site)
    auction = auction_price(market)
    grade = confidence_grade(per_site)

    return {
        "model": model,
        "canonical": canonical,
        "year": year,
        "market_price": market,
        "auction_price": auction,
        "confidence": grade,
        "sources": {
            site: (
                {"median": d["median"], "count": d["count"]} if d is not None else None
            )
            for site, d in per_site.items()
        },
        "cached": all(cache_hits[s] for s in site_list),
        "cache_hits": cache_hits,
        "elapsed_sec": round(time.monotonic() - started, 2),
        "match_score": match_score,
    }
