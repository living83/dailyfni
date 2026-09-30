from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import quote

from normalizer import ModelNormalizer, get_default, log_unmatched_to_file
from scrapers.base import BaseScraper
from scrapers.utils import (
    ScraperBlocked,
    ScraperEmpty,
    human_delay,
    median_int,
)

logger = logging.getLogger(__name__)

ENCAR_MAIN = "https://www.encar.com/index.do"
ENCAR_API = "https://api.encar.com/search/car/list/general"

# Sane price floor/ceiling in KRW — discard parser garbage.
MIN_PRICE_KRW = 500_000
MAX_PRICE_KRW = 500_000_000

# How many newest listings to consider for the median.
SAMPLE_LIMIT = 20


def _build_query(model_group: str, year: int, manufacturer: str | None = None) -> str:
    """Construct encar API filter expression.

    Encar wraps the listing query as (And.{inner}_.AdType.A.) for regular
    ads (AdType.B is premium). Manufacturer narrows when ModelGroup is
    shared across brands (rare; e.g., "Genesis"/현대 split).
    """
    year_from = year * 100 + 1
    year_to = year * 100 + 12
    parts = [f"Hidden.N", f"ModelGroup.{model_group}"]
    if manufacturer:
        parts.append(f"Manufacturer.{manufacturer}")
    parts.append(f"Year.range({year_from}..{year_to})")
    inner = "(And." + "._.".join(parts) + ".)"
    return f"(And.{inner}_.AdType.A.)"


class EncarScraper(BaseScraper):
    site_name = "encar"

    def __init__(self, headless: bool = True, normalizer: ModelNormalizer | None = None) -> None:
        super().__init__(headless=headless)
        self._normalizer = normalizer or get_default()

    async def _warm_session(self) -> None:
        """Visit main page so the context picks up cookies before hitting API."""
        page = await self.context.new_page()
        try:
            await page.goto(ENCAR_MAIN, wait_until="domcontentloaded", timeout=30_000)
            await human_delay(1.0, 2.5)
        finally:
            await page.close()

    async def fetch_price(self, model: str, year: int) -> dict[str, Any]:
        canonical, codes, score = self._normalizer.resolve(model, self.site_name)
        if canonical is None or codes is None:
            log_unmatched_to_file(model, self.site_name, best_guess=None, score=score)
            raise ScraperEmpty(
                f"encar: model={model!r} not in normalizer (best_score={score:.0f})"
            )
        model_group = codes.get("ModelGroup")
        manufacturer = codes.get("Manufacturer")
        if not model_group:
            raise ScraperEmpty(
                f"encar: normalizer entry for {canonical!r} missing ModelGroup"
            )

        await self._warm_session()
        q = _build_query(model_group, year, manufacturer=manufacturer)
        # Encar accepts parens/dots/underscores raw in the query string and
        # expects the sr= pipe separators as %7C. Encode only the value
        # bytes that fall outside safe-set (covers non-ASCII model names).
        q_encoded = quote(q, safe="()._-")
        sr_encoded = f"%7CModifiedDate%7C0%7C{SAMPLE_LIMIT}"
        url = f"{ENCAR_API}?count=true&q={q_encoded}&sr={sr_encoded}"

        await human_delay()
        response = await self.context.request.get(
            url,
            headers={
                "Referer": "https://www.encar.com/",
                "Accept": "application/json, text/plain, */*",
                "Origin": "https://www.encar.com",
            },
            timeout=30_000,
        )

        status = response.status
        body = await response.text()

        if status == 429 or "captcha" in body.lower() or "차단" in body:
            raise ScraperBlocked(f"encar blocked: status={status}")
        if status >= 400:
            raise ScraperBlocked(f"encar API error {status}: {body[:200]}")

        try:
            data = json.loads(body)
        except json.JSONDecodeError as e:
            raise ScraperBlocked(f"encar API returned non-JSON: {body[:200]}") from e

        results = data.get("SearchResults") or []
        if not results:
            raise ScraperEmpty(f"encar: 0 results for model={model!r} year={year}")

        prices_krw: list[int] = []
        for item in results:
            raw = item.get("Price")
            if raw is None:
                continue
            try:
                krw = int(float(raw)) * 10_000  # encar Price is in 만원
            except (TypeError, ValueError):
                continue
            if MIN_PRICE_KRW <= krw <= MAX_PRICE_KRW:
                prices_krw.append(krw)

        if not prices_krw:
            raise ScraperEmpty(f"encar: no usable prices for model={model!r} year={year}")

        return {
            "site": self.site_name,
            "median": median_int(prices_krw),
            "count": len(prices_krw),
            "samples": prices_krw,
            "raw_total": data.get("Count"),
        }
