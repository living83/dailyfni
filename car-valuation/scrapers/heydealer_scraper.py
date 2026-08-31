from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from normalizer import ModelNormalizer, get_default, log_unmatched_to_file
from scrapers.base import BaseScraper
from scrapers.utils import (
    ScraperBlocked,
    ScraperEmpty,
    human_delay,
    median_int,
)

logger = logging.getLogger(__name__)

HEYDEALER_MAIN = "https://www.heydealer.com/"
HEYDEALER_API = "https://market-api.heydealer.com"

MIN_PRICE_KRW = 500_000
MAX_PRICE_KRW = 500_000_000
TARGET_SAMPLES = 20
MAX_PAGES = 5

# IMPORTANT: heydealer's /market is the DEALER → CONSUMER retail listings, not
# the dealer-buyback quote the user spec assumed. The price here is therefore
# a retail figure, not a buyback / auction estimate. valuation_engine should
# weight this accordingly (or down-weight in step 6).


class HeydealerScraper(BaseScraper):
    site_name = "heydealer"

    def __init__(self, headless: bool = True, normalizer: ModelNormalizer | None = None) -> None:
        super().__init__(headless=headless)
        self._normalizer = normalizer or get_default()

    async def _warm_session(self) -> None:
        # heydealer's SPA pings GA/카카오/kbdmp continuously, so networkidle
        # rarely fires (especially through a proxy). domcontentloaded + a
        # brief sleep is enough — the initialize_app XHR fires soon after
        # the DOM is ready and seeds the cookies the market API expects.
        page = await self.context.new_page()
        try:
            await page.goto(HEYDEALER_MAIN, wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2.5)
        finally:
            await page.close()

    async def _request_json(self, url: str) -> Any:
        resp = await self.context.request.get(
            url,
            headers={
                "Referer": HEYDEALER_MAIN,
                "Origin": "https://www.heydealer.com",
                "Accept": "application/json",
            },
            timeout=30_000,
        )
        status = resp.status
        body = await resp.text()
        if status == 429:
            raise ScraperBlocked("heydealer: 429")
        if status >= 400:
            raise ScraperBlocked(f"heydealer API {status}: {body[:200]}")
        try:
            return json.loads(body)
        except json.JSONDecodeError as e:
            raise ScraperBlocked(f"heydealer non-JSON: {body[:200]}") from e

    async def fetch_price(self, model: str, year: int) -> dict[str, Any]:
        canonical, codes, score = self._normalizer.resolve(model, self.site_name)
        if canonical is None or codes is None:
            log_unmatched_to_file(model, self.site_name, best_guess=None, score=score)
            raise ScraperEmpty(
                f"heydealer: model={model!r} not in normalizer (best_score={score:.0f})"
            )
        brand_hash = codes.get("brand_hash_id")
        model_group_hash = codes.get("model_group_hash_id")
        if not (brand_hash and model_group_hash):
            raise ScraperEmpty(
                f"heydealer: normalizer entry for {canonical!r} missing hash ids"
            )

        await self._warm_session()

        prices_krw: list[int] = []
        total_scanned = 0
        for page_num in range(1, MAX_PAGES + 1):
            if len(prices_krw) >= TARGET_SAMPLES:
                break
            await human_delay()
            url = (
                f"{HEYDEALER_API}/v2/customers/web/market/cars/"
                f"?brands={brand_hash}&model_groups={model_group_hash}"
                f"&page={page_num}&order=recommendation"
            )
            data = await self._request_json(url)
            if not isinstance(data, list):
                raise ScraperBlocked(f"heydealer: unexpected payload type {type(data).__name__}")
            if not data:
                break  # end of pagination

            for car in data:
                total_scanned += 1
                detail = car.get("detail_info") or {}
                car_year = detail.get("year")
                price_man = car.get("price")
                if car_year is None or price_man is None:
                    continue
                if int(car_year) != year:
                    continue
                try:
                    krw = int(price_man) * 10_000
                except (TypeError, ValueError):
                    continue
                if MIN_PRICE_KRW <= krw <= MAX_PRICE_KRW:
                    prices_krw.append(krw)

        if not prices_krw:
            raise ScraperEmpty(
                f"heydealer: 0 listings for model={model!r} year={year} "
                f"after scanning {total_scanned} cars"
            )

        samples = prices_krw[:TARGET_SAMPLES]
        return {
            "site": self.site_name,
            "median": median_int(samples),
            "count": len(samples),
            "samples": samples,
            "raw_total": total_scanned,
        }
